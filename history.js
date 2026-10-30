const { OFF, toWib } = require('./wib');
const H = 3600e3, D = 24 * H;
const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// 24h = 24 bucket per jam, 7d = 7 bucket harian (rata-rata), semuanya WIB.
function buckets(range, now = Date.now()) {
  if (range === '24h') {
    const cur = Math.floor((now + OFF) / H) * H - OFF;
    return Array.from({ length: 24 }, (_, i) => {
      const start = cur - (23 - i) * H;
      return { start, end: start + H, label: String(new Date(start + OFF).getUTCHours()).padStart(2, '0') + '.00' };
    });
  }
  const cur = Math.floor((now + OFF) / D) * D - OFF;
  return Array.from({ length: 7 }, (_, i) => {
    const start = cur - (6 - i) * D;
    return { start, end: start + D, label: DAY[new Date(start + OFF).getUTCDay()] };
  });
}

function buildHistory(rows, range, now = Date.now()) {
  const bs = buckets(range, now);
  const acc = bs.map(() => ({ t: 0, h: 0, n: 0 }));
  for (const r of rows) {
    const ms = Date.parse(r.created_at);
    const i = bs.findIndex((b) => ms >= b.start && ms < b.end);
    if (i >= 0) { acc[i].t += r.temperature; acc[i].h += r.humidity; acc[i].n++; }
  }
  return bs.map((b, i) => ({
    label: b.label,
    timestamp: toWib(b.start).slice(0, 19),
    temperature: acc[i].n ? Math.round((acc[i].t / acc[i].n) * 10) / 10 : null,
    humidity: acc[i].n ? Math.round(acc[i].h / acc[i].n) : null,
    n: acc[i].n,
  }));
}

const firstStart = (range, now = Date.now()) => buckets(range, now)[0].start;
module.exports = { buildHistory, firstStart };
