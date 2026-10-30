// Jembatan serial: baca JSON {"temp":..,"hum":..} per baris dari board fisik (mis. Wemos D1 Mini via USB-UART)
// lalu teruskan sebagai bacaan device. Dipakai bila belum ada Wi-Fi untuk POST langsung.
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

function startSerial({ path, baud, deviceId, intervalSec, ingest, log = console }) {
  // Firmware mencetak tiap ~2 dtk (batas DHT22); bridge meneruskan satu bacaan per intervalSec.
  let lastSent = 0;
  let status = 'connecting';

  function connect() {
    const port = new SerialPort({ path, baudRate: baud, autoOpen: false });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    let retrying = false;
    const retry = (why) => {
      if (retrying) return;
      retrying = true; status = 'offline';
      log.error(`[serial] ${path}: ${why}, coba lagi 3 dtk`);
      setTimeout(connect, 3000);
    };
    parser.on('data', (line) => {
      let j;
      try { j = JSON.parse(line.trim()); } catch { return; } // sampah boot ESP8266
      const t = Number(j.temp ?? j.temperature), h = Number(j.hum ?? j.humidity);
      if (!Number.isFinite(t) || !Number.isFinite(h)) return; // mis. {"error":"dht_read_failed"}
      status = 'online';
      if (Date.now() - lastSent < intervalSec * 900) return; // toleransi 10% untuk jitter
      lastSent = Date.now();
      ingest({ device_id: deviceId, temperature: t, humidity: h });
    });
    port.on('error', (e) => retry(e.message));
    port.on('close', () => retry('ditutup'));
    port.open((e) => (e ? retry(e.message) : log.log(`[serial] terbuka ${path} @${baud} -> ${deviceId}`)));
  }
  connect();
  return { get status() { return status; } };
}
module.exports = { startSerial };
