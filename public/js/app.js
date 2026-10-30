import { $, $$, getJson, fmtT, fmtH, fmtN, wibClock, wibDots, wibWhen, statusOf, dewPoint, toast, clamp } from './util.js';
import { createDropdown } from './dropdown.js';
import { Chart, Live } from './charts.js';
import { initParallax, initReveal } from './parallax.js';

const DEFAULTS = { temp_min: 20, temp_max: 30, hum_min: 40, hum_max: 75 };
const RANGE_TXT = { '24h': '24 jam', '7d': '7 hari' };
const state = { devices: [], id: null, range: '24h', th: null, savedAt: null, points: [], live: null, recent: [], seq: 0 };

const chartT = new Chart($('#chart-temp'), { key: 'temperature', color: '#D3D5FD', min: 18, max: 34, ticks: [18, 22, 26, 30, 34], aria: 'Grafik suhu', fmt: (v) => `${fmtT(v)}°C` });
const chartH = new Chart($('#chart-hum'), { key: 'humidity', color: '#B9C0CF', min: 30, max: 95, ticks: [30, 50, 70, 95], aria: 'Grafik kelembapan', fmt: (v) => `${fmtH(v)}%` });
const live = new Live($('#live'));

// ---------- jam dinding (bukan polling data) ----------
const tickClock = () => { $('#clock span').textContent = `${wibClock(Date.now())} WIB`; };
tickClock(); setInterval(tickClock, 1000);

// ---------- dropdown ----------
const dd = createDropdown($('#dd-mount'), { label: 'Pilih device_id', onChange: (id) => selectDevice(id) });
const labelOf = (d) => `${d.device_id} — ${d.board} · ${d.source}`;
const dev = () => state.devices.find((d) => d.device_id === state.id);

// ---------- foto ----------
function showPhoto(d, first) {
  const box = $('#photo');
  const old = $$('img', box);
  const img = new Image();
  img.alt = `Board ${d.board}`; img.src = d.photo || '';
  img.onload = () => {
    box.append(img);
    requestAnimationFrame(() => img.classList.add('on'));
    old.forEach((o) => { o.classList.remove('on'); setTimeout(() => o.remove(), 500); });
  };
  img.onerror = () => { old.forEach((o) => o.remove()); };
  const info = $('#photo-info');
  info.classList.remove('swap'); void info.offsetWidth; if (!first) info.classList.add('swap');
  $('#pi-board').textContent = d.board; $('#pi-src').textContent = d.source; $('#pi-id').textContent = d.device_id;
  $('#dev-meta').textContent = `${d.board} • ${d.source === 'Simulator' ? 'Simulator (simulasi)' : d.source === 'Fisik' ? 'Perangkat fisik' : d.source}`;
}

// ---------- ringkasan ----------
function stats24() {
  const v = state.points.filter((p) => p.temperature != null);
  return v.length ? { min: Math.min(...v.map((p) => p.temperature)), max: Math.max(...v.map((p) => p.temperature)) } : null;
}
function renderNow() {
  const r = state.live, th = state.th, d = dev();
  const t = r?.temperature, h = r?.humidity;
  const st = statusOf(t, h, th);
  const tStatus = t == null || !th ? { text: '—', lv: '' } : t > th.temp_max ? { text: 'Di atas ambang suhu', lv: 'danger' } : t < th.temp_min ? { text: 'Di bawah ambang suhu', lv: 'warn' } : { text: 'Normal', lv: '' };

  $('#sum-device').textContent = state.id ?? '—';
  const avg = state.points.filter((p) => p.temperature != null);
  $('#sum-avg').textContent = avg.length ? `${fmtT(avg.reduce((a, p) => a + p.temperature, 0) / avg.length)} °C` : '—';
  const se = $('#sum-status'); se.textContent = st.text; se.dataset.lv = st.lv;
  $('#chip-update').textContent = r ? `Update ${wibClock(Date.parse(r.timestamp))} • ${state.id}` : `Update --:--:--`;

  $('#c-temp').textContent = fmtT(t);
  const cs = $('#c-temp-st'); cs.textContent = tStatus.text; cs.dataset.lv = tStatus.lv;
  $('#c-feels').textContent = t == null ? '—' : `${fmtT(t + 1.7)} °C`;
  const s = stats24();
  $('#c-min').textContent = s ? `${fmtT(s.min)} °C` : '—'; $('#c-max').textContent = s ? `${fmtT(s.max)} °C` : '—';
  $('#c-th').textContent = th ? `≤ ${fmtN(th.temp_max)} °C` : '—';

  $('#c-hum').textContent = fmtH(h);
  $('#g-fg').style.strokeDashoffset = h == null ? 263.9 : 263.9 * (1 - clamp(h, 0, 100) / 100);
  $('#hum-mark').style.left = `${h == null ? 0 : clamp(h, 0, 100)}%`;
  $('#c-hum-ideal').textContent = th ? `Ideal ${fmtN(th.hum_min)}–${fmtN(th.hum_max)}%` : '—';

  const dew = dewPoint(t, h);
  $('#d-dew').textContent = dew == null ? '—' : `${fmtT(dew)} °C`;
  $('#d-press').textContent = d?.pressure ? `${d.pressure} hPa` : '—';
  $('#d-vent').textContent = d?.ventilation != null ? `${d.ventilation}%` : '—';
  $('#d-last').textContent = r ? wibDots(Date.parse(r.timestamp)) : '—';

  $('#r-count').textContent = `${state.devices.length} device`;
  $('#r-dev').textContent = state.id ?? '—';
  $('#r-bat').textContent = d?.battery != null ? `${d.battery}%` : '—';
  $('#r-rssi').textContent = d?.rssi != null ? `Wi-Fi ${d.rssi} dBm` : '—';
  const lo = 18, hi = 36;
  $('#temp-mark').style.left = `${t == null ? 0 : clamp(((t - lo) / (hi - lo)) * 100, 0, 100)}%`;
  if (th) {
    const a = clamp(((th.temp_min - lo) / (hi - lo)) * 100, 0, 100), b = clamp(((th.temp_max - lo) / (hi - lo)) * 100, 0, 100);
    $('#band').style.left = `${a}%`; $('#band').style.width = `${Math.max(0, b - a)}%`;
  }
  renderAlert(t, h, th);
  renderHistoryTable();
}

function renderAlert(t, h, th) {
  const a = $('#alert');
  if (t == null || !th) { a.hidden = true; return; }
  let lv = '', msg = '';
  if (t > th.temp_max) { lv = 'danger'; msg = `Suhu ${fmtT(t)} °C melewati maksimum ${fmtN(th.temp_max)} °C.`; }
  else if (t < th.temp_min) { lv = 'warn'; msg = `Suhu ${fmtT(t)} °C di bawah minimum ${fmtN(th.temp_min)} °C.`; }
  else if (h > th.hum_max) { lv = 'warn'; msg = `Kelembapan ${fmtH(h)}% melewati maksimum ${th.hum_max}%.`; }
  else if (h < th.hum_min) { lv = 'warn'; msg = `Kelembapan ${fmtH(h)}% di bawah minimum ${th.hum_min}%.`; }
  if (!lv) { a.hidden = true; return; }
  a.hidden = false; a.dataset.lv = lv;
  a.innerHTML = `<b>${lv === 'danger' ? 'Bahaya' : 'Peringatan'}</b><span></span>`;
  a.lastElementChild.textContent = msg;
}

function renderHistoryTable() {
  const body = $('#hist-body'), th = state.th;
  const rows = state.points.filter((p) => p.temperature != null).slice(-8).reverse();
  const head = state.live ? [{ label: wibDots(Date.parse(state.live.timestamp)), temperature: state.live.temperature, humidity: state.live.humidity }] : [];
  const all = [...head, ...rows].slice(0, 8);
  if (!all.length) { body.innerHTML = '<tr><td class="none" colspan="5">Belum ada data</td></tr>'; return; }
  body.innerHTML = all.map((p) => {
    const st = statusOf(p.temperature, p.humidity, th);
    return `<tr><td>${p.label}</td><td>${state.id}</td><td>${fmtT(p.temperature)}</td><td>${fmtH(p.humidity)}</td><td class="st" data-lv="${st.lv}">${st.text}</td></tr>`;
  }).join('');
}

function renderChartMeta() {
  $('#chart-title').textContent = `Ruang Monitoring — ${state.id}`;
  const v = state.points.filter((p) => p.temperature != null);
  if (v.length) {
    const lo = v.reduce((a, p) => (p.temperature < a.temperature ? p : a)), hi = v.reduce((a, p) => (p.temperature > a.temperature ? p : a));
    $('#st-min').textContent = `${fmtT(lo.temperature)} °C`; $('#st-min-t').textContent = lo.label;
    $('#st-max').textContent = `${fmtT(hi.temperature)} °C`; $('#st-max-t').textContent = hi.label;
    $('#st-avg').textContent = `${fmtT(v.reduce((a, p) => a + p.temperature, 0) / v.length)} °C / ${fmtH(v.reduce((a, p) => a + p.humidity, 0) / v.length)}%`;
    $('#st-avg-t').textContent = RANGE_TXT[state.range];
  } else { for (const id of ['st-min', 'st-avg', 'st-max']) $('#' + id).textContent = '—'; for (const id of ['st-min-t', 'st-avg-t', 'st-max-t']) $('#' + id).textContent = '—'; }
  const rec = state.recent;
  $('#live-range').textContent = rec.length
    ? `${fmtT(Math.min(...rec.map((r) => r.temperature)))}–${fmtT(Math.max(...rec.map((r) => r.temperature)))} °C • ${fmtH(Math.min(...rec.map((r) => r.humidity)))}–${fmtH(Math.max(...rec.map((r) => r.humidity)))}%`
    : '—';
  const n = Math.max(0, state.points.filter((p) => p.temperature != null).length) + (state.live ? 1 : 0);
  $('#export-info').textContent = `${n} baris riwayat ${state.id} (${RANGE_TXT[state.range]}) • .csv`;
}

// ---------- ambang ----------
function fillForm(th) {
  $('#th-tmax').value = th.temp_max; $('#th-tmin').value = th.temp_min; $('#th-hmax').value = th.hum_max; $('#th-hmin').value = th.hum_min;
  $('#th-dev').textContent = state.id;
}
function renderActive() {
  const th = state.th;
  $('#th-active').innerHTML = th
    ? `<span>${state.id}: suhu ${fmtN(th.temp_min.toFixed ? th.temp_min.toFixed(1) : th.temp_min)} – ${fmtN(th.temp_max.toFixed ? th.temp_max.toFixed(1) : th.temp_max)} °C • kelembapan ${th.hum_min} – ${th.hum_max}% RH</span><span>Disimpan: ${wibWhen(Date.parse(th.updated_at))}</span>`
    : '';
}
function applyThresholds(th, animate) {
  state.th = th;
  fillForm(th); renderActive();
  chartT.setThresholds(th.temp_min, th.temp_max, { animate });
  chartH.setThresholds(th.hum_min, th.hum_max, { animate });
  renderNow();
}
function setStatus(msg, err = false) { const s = $('#th-status'); s.textContent = msg; s.classList.toggle('err', err); }

async function saveThresholds(values) {
  const body = { device_id: state.id, ...values };
  const res = await fetch('/api/thresholds', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { setStatus(`✕ Gagal: ${j.error || 'tidak bisa menyimpan'}.`, true); return false; }
  applyThresholds({ ...values, device_id: state.id, updated_at: j.updated_at }, true);
  setStatus(`✓ Tersimpan • ${state.id} • ${wibWhen(Date.parse(j.updated_at))}`);
  return true;
}
$('#th-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = { temp_max: $('#th-tmax'), temp_min: $('#th-tmin'), hum_max: $('#th-hmax'), hum_min: $('#th-hmin') };
  const v = {};
  let ok = true;
  for (const k in f) { const raw = f[k].value.trim(); v[k] = raw === '' ? NaN : Number(raw); const bad = !Number.isFinite(v[k]); f[k].setAttribute('aria-invalid', String(bad)); if (bad) ok = false; }
  if (!ok) return setStatus('✕ Gagal: semua nilai wajib angka.', true);
  if (v.temp_min >= v.temp_max || v.hum_min >= v.hum_max) { f.temp_min.setAttribute('aria-invalid', String(v.temp_min >= v.temp_max)); f.hum_min.setAttribute('aria-invalid', String(v.hum_min >= v.hum_max)); return setStatus('✕ Gagal: min harus < maks.', true); }
  saveThresholds(v);
});
$('#th-reset').addEventListener('click', () => { for (const el of $$('#th-form input')) el.removeAttribute('aria-invalid'); saveThresholds({ ...DEFAULTS }); });

// ---------- data ----------
async function loadDeviceData(animate) {
  const seq = ++state.seq, id = state.id;
  const [hist, th, recent, latest] = await Promise.all([
    getJson(`/api/history?device_id=${encodeURIComponent(id)}&range=${state.range}`),
    getJson(`/api/thresholds?device_id=${encodeURIComponent(id)}`),
    getJson(`/api/recent?device_id=${encodeURIComponent(id)}&limit=22`),
    getJson(`/api/latest?device_id=${encodeURIComponent(id)}`).catch(() => null),
  ]);
  if (seq !== state.seq) return; // pilihan berganti saat menunggu
  state.points = hist.points; state.recent = recent; state.live = latest;
  chartT.setDevice(id); chartH.setDevice(id);
  chartT.setData(hist.points, { animate }); chartH.setData(hist.points, { animate });
  chartT.setThresholds(th.temp_min, th.temp_max, { animate: false }); chartH.setThresholds(th.hum_min, th.hum_max, { animate: false });
  live.set(recent);
  state.th = th; fillForm(th); renderActive(); setStatus('');
  renderNow(); renderChartMeta();
}

async function selectDevice(id) {
  state.id = id; dd.setValue(id);
  const d = dev(); showPhoto(d, false);
  subscribe();
  try { await loadDeviceData(true); } catch (e) { console.error(e); toast('Gagal memuat data device'); }
}

// ---------- ekspor ----------
for (const b of $$('[data-export]')) b.addEventListener('click', () => {
  if (!state.id) return;
  const a = document.createElement('a');
  a.href = `/api/export?device_id=${encodeURIComponent(state.id)}&range=${state.range}`;
  document.body.append(a); a.click(); a.remove();
});
for (const b of $$('[data-range]')) b.addEventListener('click', async () => {
  if (state.range === b.dataset.range) return;
  state.range = b.dataset.range;
  for (const x of $$('[data-range]')) x.setAttribute('aria-pressed', String(x === b));
  try { await loadDeviceData(true); } catch (e) { console.error(e); }
});

// ---------- socket.io (satu-satunya sumber data live) ----------
const pill = $('#ws-pill');
function setPill(s) {
  pill.dataset.state = s;
  pill.lastElementChild.textContent = { connected: 'Connected • Live via socket.io', connecting: 'Menghubungkan… socket.io', reconnecting: 'Reconnecting… socket.io', down: 'Terputus • socket.io' }[s];
}
setPill('connecting');
const sock = io('/sensor', { transports: ['websocket'], reconnectionDelay: 800, reconnectionDelayMax: 4000 });
const subscribe = () => { if (sock.connected && state.id) sock.emit('subscribe', { device_id: state.id }); };
sock.on('connect', () => { setPill('connected'); subscribe(); if (state.id) loadDeviceData(false).catch(() => {}); });
sock.on('disconnect', () => setPill('reconnecting'));
sock.io.on('reconnect_attempt', () => setPill('reconnecting'));
sock.io.on('reconnect_failed', () => setPill('down'));
sock.on('connect_error', () => setPill(sock.active ? 'reconnecting' : 'down'));

sock.on('sensor:update', (r) => {
  if (r.device_id !== state.id) return;
  state.live = r;
  state.recent = [...state.recent.slice(-21), r];
  live.set(state.recent, { animate: true });
  if (state.range === '24h' && state.points.length) {
    const last = state.points[state.points.length - 1];
    chartT.updateLast({ temperature: r.temperature });
    chartH.updateLast({ humidity: r.humidity });
    last.temperature = r.temperature; last.humidity = r.humidity;
  }
  renderNow(); renderChartMeta();
});

// ---------- boot: devices -> history + thresholds -> chart -> socket ----------
(async function boot() {
  initParallax(); initReveal();
  try {
    state.devices = await getJson('/api/devices');
    if (!state.devices.length) { toast('Belum ada device'); return; }
    dd.setOptions(state.devices.map((d) => ({ value: d.device_id, label: labelOf(d) })));
    state.id = state.devices.find((d) => d.source === 'Fisik')?.device_id ?? state.devices[0].device_id;
    dd.setValue(state.id); showPhoto(dev(), true);
    await loadDeviceData(true);
    subscribe();
  } catch (e) { console.error(e); toast('Gagal memuat data awal'); }
})();

// Device baru yang mengirim bacaan muncul di dropdown tanpa reload (cek saat tab kembali aktif atau lewat event).
async function refreshDevices() {
  try {
    const list = await getJson('/api/devices');
    if (list.length === state.devices.length) return;
    state.devices = list;
    dd.setOptions(list.map((d) => ({ value: d.device_id, label: labelOf(d) })));
    renderNow();
  } catch { /* abaikan */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDevices(); });
sock.on('sensor:update', (r) => { if (!state.devices.some((d) => d.device_id === r.device_id)) refreshDevices(); });
