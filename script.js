// 設定: スプレッドシートIDを書き換えれば別のシートに切り替え可能
const SHEET_ID = '1EpyvumkJRtWZr4u-AaTHXVINYvQnur4QWJuaQwE3VBw';
const REFRESH_MS = 60 * 1000;

const PLACE_CLASS = { '東京': 'tokyo', '宮古島': 'miyako' };

let entries = []; // { start: Date, end: Date, place: string, memo: string }
let calCursor = new Date(); // 表示中の月(1日固定)
calCursor.setDate(1);

function parseGvizDateCell(cell) {
  if (!cell) return null;
  if (typeof cell.f === 'string' && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cell.f)) {
    const [y, m, d] = cell.f.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  const v = cell.v;
  if (typeof v === 'string') {
    const m1 = v.match(/^Date\((\d+),(\d+),(\d+)/);
    if (m1) return new Date(Number(m1[1]), Number(m1[2]), Number(m1[3]));
    const m2 = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  }
  return null;
}

function cellText(cell) {
  if (!cell) return '';
  return (cell.f !== undefined && cell.f !== null) ? String(cell.f) : (cell.v !== undefined && cell.v !== null ? String(cell.v) : '');
}

function fmtDate(d) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayInRange(day, start, end) {
  const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const s0 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e0 = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return d0 >= s0 && d0 <= e0;
}

async function fetchSchedule() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&_=${Date.now()}`;
  const res = await fetch(url);
  const text = await res.text();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const data = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  const rows = data.table.rows || [];

  const parsed = [];
  for (const row of rows) {
    const c = row.c || [];
    const start = parseGvizDateCell(c[0]);
    const end = parseGvizDateCell(c[1]);
    const place = cellText(c[2]).trim();
    const memo = cellText(c[3]).trim();
    if (start && end && PLACE_CLASS[place]) {
      parsed.push({ start, end, place, memo });
    }
  }
  parsed.sort((a, b) => a.start - b.start);
  return parsed;
}

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const title = document.getElementById('calTitle');
  title.textContent = `${calCursor.getFullYear()}年${calCursor.getMonth() + 1}月`;

  grid.innerHTML = '';
  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  dows.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const lastDay = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 0);
  const startOffset = firstDay.getDay();
  const today = new Date();

  for (let i = 0; i < startOffset; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const day = new Date(calCursor.getFullYear(), calCursor.getMonth(), d);
    const match = entries.find(e => dayInRange(day, e.start, e.end));
    const el = document.createElement('div');
    el.className = 'cal-day' + (match ? ' ' + PLACE_CLASS[match.place] : '') + (sameDay(day, today) ? ' today' : '');

    const num = document.createElement('span');
    num.className = 'cal-day-num';
    num.textContent = d;
    el.appendChild(num);

    if (match) {
      el.title = match.place + (match.memo ? '：' + match.memo : '');
      const isRangeStart = sameDay(day, match.start);
      const isWeekStart = day.getDay() === 0;
      if ((isRangeStart || isWeekStart) && match.memo) {
        const label = document.createElement('span');
        label.className = 'cal-day-label';
        label.textContent = (isRangeStart ? '' : '→ ') + match.memo;
        el.appendChild(label);
      }
    }
    grid.appendChild(el);
  }
}

function renderTable() {
  const body = document.getElementById('scheduleBody');
  body.innerHTML = '';
  const today = new Date();

  if (entries.length === 0) {
    body.innerHTML = '<tr><td colspan="4">予定はまだ登録されていません</td></tr>';
    return;
  }

  for (const e of entries) {
    const tr = document.createElement('tr');
    const isCurrent = dayInRange(today, e.start, e.end);
    const isPast = e.end < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (isCurrent) tr.className = 'current-row';
    else if (isPast) tr.className = 'past-row';

    tr.innerHTML = `
      <td>${fmtDate(e.start)}</td>
      <td>${fmtDate(e.end)}</td>
      <td><span class="place-badge ${PLACE_CLASS[e.place]}">${e.place}</span></td>
      <td>${e.memo ? e.memo.replace(/</g, '&lt;') : ''}</td>
    `;
    body.appendChild(tr);
  }
}

async function refresh() {
  try {
    entries = await fetchSchedule();
    renderCalendar();
    renderTable();
    document.getElementById('updated').textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP')}`;
  } catch (err) {
    if (entries.length === 0) {
      document.getElementById('updated').textContent = 'データの取得に失敗しました。スプレッドシートの共有設定をご確認ください。';
    }
    console.error(err);
  }
}

document.getElementById('prevMonth').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() - 1);
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() + 1);
  renderCalendar();
});

refresh();
setInterval(refresh, REFRESH_MS);
