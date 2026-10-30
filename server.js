const express = require('express');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function withIso(row) {
  if (!row) return row;
  return { ...row, created_at_iso: row.created_at.replace(' ', 'T') + 'Z' };
}

async function main() {
  const db = await initDb();

  // POST /api/readings -> terima data sensor
  app.post('/api/readings', (req, res) => {
    const { device_id, suhu, kelembapan } = req.body || {};

    if (typeof device_id !== 'string' || device_id.trim() === '') {
      return res.status(400).json({ error: 'device_id wajib berupa teks tidak kosong' });
    }
    if (typeof suhu !== 'number' || !Number.isFinite(suhu)) {
      return res.status(400).json({ error: 'suhu harus berupa angka' });
    }
    if (typeof kelembapan !== 'number' || !Number.isFinite(kelembapan)) {
      return res.status(400).json({ error: 'kelembapan harus berupa angka' });
    }
    if (suhu < -40 || suhu > 80) {
      return res.status(400).json({ error: 'suhu harus di antara -40 sampai 80 °C' });
    }
    if (kelembapan < 0 || kelembapan > 100) {
      return res.status(400).json({ error: 'kelembapan harus di antara 0 sampai 100 %' });
    }

    const saved = db.insertReading(device_id.trim(), suhu, kelembapan);
    res.status(201).json(withIso(saved));
  });

  // GET /api/readings/latest -> data terbaru
  app.get('/api/readings/latest', (req, res) => {
    const row = db.getLatest();
    if (!row) return res.status(404).json({ error: 'Belum ada data' });
    res.status(200).json(withIso(row));
  });

  // GET /api/readings?limit=20 -> riwayat N data terakhir
  app.get('/api/readings', (req, res) => {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 20;
    if (limit > 500) limit = 500;
    res.status(200).json(db.getList(limit).map(withIso));
  });

  // GET /api/stats -> rata-rata, min, maks
  app.get('/api/stats', (req, res) => {
    res.status(200).json(db.getStats());
  });

  // Tangani JSON rusak
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Body bukan JSON yang valid' });
    }
    console.error(err);
    res.status(500).json({ error: 'Kesalahan server' });
  });

  app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Gagal memulai server:', err);
  process.exit(1);
});
