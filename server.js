const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { initDb } = require('./db');
const { toWib } = require('./wib');
const { statusOf } = require('./status');
const { buildHistory, firstStart } = require('./history');
const { buildCsv } = require('./csv');
const { startSerial } = require('./serial');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const sensorNs = io.of('/sensor');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/vendor/jakarta', express.static(path.dirname(require.resolve('@fontsource-variable/plus-jakarta-sans/package.json')) + '/files'));

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const RANGES = { '24h': '24jam', '7d': '7hari' };

// Terima payload kontrak baru (temperature/humidity) maupun lama (suhu/kelembapan).
function parseReading(body = {}) {
  const device_id = body.device_id;
  const temperature = body.temperature ?? body.suhu;
  const humidity = body.humidity ?? body.kelembapan;
  if (typeof device_id !== 'string' || device_id.trim() === '') return { error: 'device_id wajib berupa teks tidak kosong' };
  if (!isNum(temperature)) return { error: 'temperature harus berupa angka' };
  if (!isNum(humidity)) return { error: 'humidity harus berupa angka' };
  if (temperature < -40 || temperature > 80) return { error: 'temperature harus di antara -40 sampai 80 °C' };
  if (humidity < 0 || humidity > 100) return { error: 'humidity harus di antara 0 sampai 100 %' };
  let ms = Date.now();
  if (body.timestamp !== undefined) {
    ms = Date.parse(body.timestamp);
    if (Number.isNaN(ms)) return { error: 'timestamp bukan ISO 8601 yang valid' };
  }
  return {
    reading: {
      device_id: device_id.trim(),
      room: typeof body.room === 'string' && body.room.trim() ? body.room.trim() : 'Ruangan',
      temperature: Math.round(temperature * 10) / 10,
      humidity: Math.round(humidity),
      timestamp: toWib(ms),
    },
  };
}

async function main() {
  const db = await initDb();

  // Simpan (opsional) lalu push ke dashboard yang subscribe device itu.
  function ingest(reading, { store = true } = {}) {
    const r = reading.timestamp ? reading : { room: 'Ruangan', ...reading, timestamp: toWib(Date.now()) };
    r.room = r.room || 'Ruangan';
    r.temperature = Math.round(r.temperature * 10) / 10;
    r.humidity = Math.round(r.humidity);
    if (store) { db.ensureDevice(r.device_id); db.insertReading(r); }
    sensorNs.to(r.device_id).emit('sensor:update', r);
    return r;
  }

  sensorNs.on('connection', (socket) => {
    socket.on('subscribe', (msg) => {
      for (const room of socket.rooms) if (room !== socket.id) socket.leave(room);
      if (msg && typeof msg.device_id === 'string') socket.join(msg.device_id);
    });
  });

  app.post('/api/readings', (req, res) => {
    const { reading, error } = parseReading(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    ingest(reading);
    res.status(201).json({ ok: true });
  });

  app.get('/api/devices', (req, res) => {
    res.json(db.listDevices().map((d) => ({
      device_id: d.device_id, board: d.board, source: d.source, photo: d.photo,
      battery: d.battery, rssi: d.rssi, pressure: d.pressure, ventilation: d.ventilation,
    })));
  });

  app.get('/api/latest', (req, res) => {
    const r = db.getLatest(req.query.device_id);
    if (!r) return res.status(404).json({ ok: false, error: 'Belum ada data' });
    res.json(r);
  });

  app.get('/api/recent', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 22, 1), 200);
    res.json(db.getRecent(String(req.query.device_id || ''), limit));
  });

  app.get('/api/history', (req, res) => {
    const device_id = String(req.query.device_id || '');
    const range = req.query.range === '7d' ? '7d' : '24h';
    if (!db.getDevice(device_id)) return res.status(404).json({ ok: false, error: 'device tidak dikenal' });
    const rows = db.getSince(device_id, toWib(firstStart(range)));
    res.json({ device_id, range, points: buildHistory(rows, range) });
  });

  app.get('/api/thresholds', (req, res) => {
    const t = db.getThresholds(String(req.query.device_id || ''));
    if (!t) return res.status(404).json({ ok: false, error: 'device tidak dikenal' });
    res.json(t);
  });

  app.put('/api/thresholds', (req, res) => {
    const b = req.body || {};
    if (!db.getDevice(b.device_id)) return res.status(404).json({ ok: false, error: 'device tidak dikenal' });
    const t = { temp_min: b.temp_min, temp_max: b.temp_max, hum_min: b.hum_min, hum_max: b.hum_max };
    if (!Object.values(t).every(isNum)) return res.status(422).json({ ok: false, error: 'semua nilai wajib angka' });
    if (t.temp_min >= t.temp_max || t.hum_min >= t.hum_max) return res.status(422).json({ ok: false, error: 'min harus < maks' });
    t.hum_min = Math.round(t.hum_min); t.hum_max = Math.round(t.hum_max);
    res.json({ ok: true, updated_at: db.setThresholds(b.device_id, t) });
  });

  app.get('/api/export', (req, res) => {
    const device_id = String(req.query.device_id || '');
    const range = req.query.range === '7d' ? '7d' : '24h';
    const th = db.getThresholds(device_id);
    if (!th) return res.status(404).json({ ok: false, error: 'device tidak dikenal' });
    const points = buildHistory(db.getSince(device_id, toWib(firstStart(range))), range);
    const csv = buildCsv(points, db.getLatest(device_id), th, device_id);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="riwayat-${device_id}-${RANGES[range]}.csv"`,
    });
    res.send(csv);
  });

  // --- Endpoint lama (kompatibilitas simulator dan klien awal) ---
  app.get('/api/readings/latest', (req, res) => {
    const r = db.getLatest();
    if (!r) return res.status(404).json({ error: 'Belum ada data' });
    res.json({ device_id: r.device_id, suhu: r.temperature, kelembapan: r.humidity, created_at: r.timestamp });
  });
  app.get('/api/readings', (req, res) => {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 20;
    res.json(db.getListLegacy(Math.min(limit, 500)));
  });
  app.get('/api/stats', (req, res) => res.json(db.getStatsLegacy()));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Body bukan JSON yang valid' });
    console.error(err);
    res.status(500).json({ ok: false, error: 'Kesalahan server' });
  });

  if (process.env.SERIAL_PATH) {
    startSerial({
      path: process.env.SERIAL_PATH,
      baud: Number(process.env.SERIAL_BAUD || 115200),
      deviceId: process.env.SERIAL_DEVICE_ID || 'WEMOS-01',
      intervalSec: Number(process.env.SERIAL_INTERVAL_S || 5),
      ingest,
    });
  }

  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { db.flush(); process.exit(0); });
  server.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
}

main().catch((err) => { console.error('Gagal memulai server:', err); process.exit(1); });
