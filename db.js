const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { toWib } = require('./wib');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'iot.db');
const DEFAULTS = { temp_min: 20, temp_max: 30, hum_min: 40, hum_max: 75 };

// Foto dan meta awal. Kolom yang tidak dilaporkan device dibiarkan NULL dan tampil "—" di UI.
const SEED_DEVICES = [
  { device_id: 'ESP32-01', board: 'ESP32', source: 'Simulator', photo: '/assets/esp32.png', battery: null, rssi: -54, pressure: 1013, ventilation: null },
  { device_id: 'WEMOS-01', board: 'Wemos D1 Mini', source: 'Fisik', photo: '/assets/wemos-d1-mini.jpg', battery: null, rssi: null, pressure: null, ventilation: null },
];

async function initDb() {
  const SQL = await initSqlJs();
  const raw = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();

  // sql.js bekerja di memori: simpan ke file dengan debounce agar tidak menulis tiap bacaan.
  let dirty = false, timer = null;
  function flush() {
    if (!dirty) return;
    dirty = false;
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, Buffer.from(raw.export()));
  }
  function save() {
    dirty = true;
    if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 1500);
  }

  function query(sql, params = []) {
    const stmt = raw.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { stmt.free(); }
  }

  // Migrasi dari skema lama (suhu/kelembapan) bila iot.db lama masih ada.
  const cols = query("PRAGMA table_info(readings)").map((c) => c.name);
  const legacy = cols.includes('suhu');
  if (legacy) raw.run('ALTER TABLE readings RENAME TO readings_old');

  raw.run(`CREATE TABLE IF NOT EXISTS readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL,
    room        TEXT NOT NULL DEFAULT 'Ruangan',
    temperature REAL NOT NULL,
    humidity    INTEGER NOT NULL,
    created_at  TEXT NOT NULL
  )`);
  raw.run('CREATE INDEX IF NOT EXISTS idx_readings_dev_time ON readings (device_id, created_at)');
  raw.run(`CREATE TABLE IF NOT EXISTS device_thresholds (
    device_id  TEXT PRIMARY KEY,
    temp_min   REAL NOT NULL DEFAULT 20,
    temp_max   REAL NOT NULL DEFAULT 30,
    hum_min    INTEGER NOT NULL DEFAULT 40,
    hum_max    INTEGER NOT NULL DEFAULT 75,
    updated_at TEXT NOT NULL
  )`);
  raw.run(`CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY, board TEXT NOT NULL, source TEXT NOT NULL, photo TEXT,
    battery INTEGER, rssi INTEGER, pressure INTEGER, ventilation INTEGER
  )`);
  if (legacy) {
    raw.run(`INSERT INTO readings (device_id, room, temperature, humidity, created_at)
             SELECT device_id, 'Ruangan', suhu, CAST(ROUND(kelembapan) AS INTEGER),
                    REPLACE(created_at, ' ', 'T') || '+00:00' FROM readings_old`);
  }

  const now = () => toWib(Date.now());
  raw.run("UPDATE devices SET source = 'Simulator' WHERE device_id = 'ESP32-01' AND source = 'Wokwi'");
  for (const d of SEED_DEVICES) {
    if (!query('SELECT 1 FROM devices WHERE device_id = ?', [d.device_id]).length) {
      raw.run('INSERT INTO devices VALUES (?,?,?,?,?,?,?,?)',
        [d.device_id, d.board, d.source, d.photo, d.battery, d.rssi, d.pressure, d.ventilation]);
    }
    if (!query('SELECT 1 FROM device_thresholds WHERE device_id = ?', [d.device_id]).length) {
      raw.run('INSERT INTO device_thresholds VALUES (?,?,?,?,?,?)',
        [d.device_id, DEFAULTS.temp_min, DEFAULTS.temp_max, DEFAULTS.hum_min, DEFAULTS.hum_max, now()]);
    }
  }
  dirty = true; flush();

  const mapReading = (r) => r && ({ device_id: r.device_id, room: r.room, temperature: r.temperature, humidity: r.humidity, timestamp: r.created_at });

  return {
    flush,

    // Device baru muncul otomatis begitu mengirim bacaan pertama.
    ensureDevice(device_id) {
      if (!query('SELECT 1 FROM devices WHERE device_id = ?', [device_id]).length) {
        raw.run('INSERT INTO devices (device_id, board, source) VALUES (?,?,?)', [device_id, 'Perangkat', 'Fisik']);
      }
      if (!query('SELECT 1 FROM device_thresholds WHERE device_id = ?', [device_id]).length) {
        raw.run('INSERT INTO device_thresholds VALUES (?,?,?,?,?,?)',
          [device_id, DEFAULTS.temp_min, DEFAULTS.temp_max, DEFAULTS.hum_min, DEFAULTS.hum_max, now()]);
      }
      save();
    },
    listDevices: () => query('SELECT * FROM devices ORDER BY rowid'),
    getDevice: (id) => query('SELECT * FROM devices WHERE device_id = ?', [id])[0] || null,

    insertReading({ device_id, room, temperature, humidity, timestamp }) {
      raw.run('INSERT INTO readings (device_id, room, temperature, humidity, created_at) VALUES (?,?,?,?,?)',
        [device_id, room, temperature, humidity, timestamp]);
      save();
    },
    getLatest(device_id) {
      const r = device_id
        ? query('SELECT * FROM readings WHERE device_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [device_id])
        : query('SELECT * FROM readings ORDER BY created_at DESC, id DESC LIMIT 1');
      return mapReading(r[0]) || null;
    },
    getRecent(device_id, limit) {
      return query('SELECT * FROM (SELECT * FROM readings WHERE device_id = ? ORDER BY created_at DESC, id DESC LIMIT ?) ORDER BY created_at ASC, id ASC',
        [device_id, limit]).map(mapReading);
    },
    getSince: (device_id, iso) =>
      query('SELECT temperature, humidity, created_at FROM readings WHERE device_id = ? AND created_at >= ? ORDER BY created_at', [device_id, iso]),

    getThresholds: (id) => query('SELECT * FROM device_thresholds WHERE device_id = ?', [id])[0] || null,
    setThresholds(id, t) {
      const at = now();
      raw.run('UPDATE device_thresholds SET temp_min=?, temp_max=?, hum_min=?, hum_max=?, updated_at=? WHERE device_id=?',
        [t.temp_min, t.temp_max, t.hum_min, t.hum_max, at, id]);
      save();
      return at;
    },

    // Endpoint lama (field suhu/kelembapan) tetap hidup agar tidak mematahkan simulator dan kode rekan.
    getListLegacy: (limit) => query('SELECT id, device_id, temperature AS suhu, humidity AS kelembapan, created_at FROM readings ORDER BY id DESC LIMIT ?', [limit]),
    getStatsLegacy: () => query(`SELECT COUNT(*) AS total,
      ROUND(AVG(temperature),2) AS suhu_avg, MIN(temperature) AS suhu_min, MAX(temperature) AS suhu_max,
      ROUND(AVG(humidity),2) AS kelembapan_avg, MIN(humidity) AS kelembapan_min, MAX(humidity) AS kelembapan_max
      FROM readings`)[0],
  };
}

module.exports = { initDb, DEFAULTS };
