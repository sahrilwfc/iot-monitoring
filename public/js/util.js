export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
const pad = (n) => String(n).padStart(2, '0');
const OFF = 7 * 3600e3;

export const fmtT = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ','));
export const fmtH = (v) => (v == null ? '—' : String(Math.round(v)));
export const fmtN = (v) => (v == null ? '—' : String(v).replace('.', ','));

function parts(ms) {
  const d = new Date(ms + OFF);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
export const wibClock = (ms) => { const p = parts(ms); return `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`; };
export const wibDots = (ms) => { const p = parts(ms); return `${pad(p.h)}.${pad(p.mi)}.${pad(p.s)}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function wibWhen(ms) {
  const p = parts(ms), t = parts(Date.now());
  const same = p.y === t.y && p.mo === t.mo && p.d === t.d;
  return `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} WIB, ${same ? 'hari ini' : `${p.d} ${MON[p.mo]}`}`;
}

// Level: '' normal, 'warn' amber, 'danger' merah (suhu melewati maks). Urutan cek: suhu dulu, lalu kelembapan.
export function statusOf(t, h, th) {
  if (t == null || h == null || !th) return { text: '—', lv: '' };
  if (t > th.temp_max) return { text: 'Di atas ambang suhu', lv: 'danger' };
  if (t < th.temp_min) return { text: 'Di bawah ambang suhu', lv: 'warn' };
  if (h > th.hum_max) return { text: 'Kelembapan tinggi', lv: 'warn' };
  if (h < th.hum_min) return { text: 'Kelembapan rendah', lv: 'warn' };
  return { text: 'Normal', lv: '' };
}

export function dewPoint(t, h) {
  if (t == null || h == null || h <= 0) return null;
  const a = 17.62, b = 243.12, g = Math.log(h / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
export async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}
