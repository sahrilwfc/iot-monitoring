const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_FILE = path.join(__dirname, 'iot.db');

async function initDb() {
  const SQL = await initSqlJs();

  // Muat file database jika sudah ada, kalau belum buat baru
  const raw = fs.existsSync(DB_FILE)
    ? new SQL.Database(fs.readFileSync(DB_FILE))
    : new SQL.Database();

  // sql.js bekerja di memori, jadi simpan manual ke file
  function save() {
    fs.writeFileSync(DB_FILE, Buffer.from(raw.export()));
  }

  // Jalankan SELECT dan kembalikan array objek
  function query(sql, params = []) {
    const stmt = raw.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  // Buat tabel readings jika belum ada
  raw.run(`
    CREATE TABLE IF NOT EXISTS readings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id   TEXT NOT NULL,
      suhu        REAL NOT NULL,
      kelembapan  REAL NOT NULL,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  save();

  return {
    insertReading(device_id, suhu, kelembapan) {
      raw.run(
        'INSERT INTO readings (device_id, suhu, kelembapan) VALUES (?, ?, ?)',
        [device_id, suhu, kelembapan]
      );
      const id = query('SELECT last_insert_rowid() AS id')[0].id;
      const saved = query('SELECT * FROM readings WHERE id = ?', [id])[0];
      save();
      return saved;
    },

    getLatest() {
      return query('SELECT * FROM readings ORDER BY id DESC LIMIT 1')[0] || null;
    },

    getList(limit) {
      return query('SELECT * FROM readings ORDER BY id DESC LIMIT ?', [limit]);
    },

    getStats() {
      return query(`
        SELECT
          COUNT(*)                  AS total,
          ROUND(AVG(suhu), 2)       AS suhu_avg,
          MIN(suhu)                 AS suhu_min,
          MAX(suhu)                 AS suhu_max,
          ROUND(AVG(kelembapan), 2) AS kelembapan_avg,
          MIN(kelembapan)           AS kelembapan_min,
          MAX(kelembapan)           AS kelembapan_max
        FROM readings
      `)[0];
    }
  };
}

module.exports = { initDb };