const { statusOf } = require('./status');
const num = (v) => v.toFixed(1).replace('.', ',');

// Format: pemisah ';', CRLF, BOM UTF-8, suhu berkoma desimal.
function buildCsv(points, live, th, deviceId) {
  const rows = [['timestamp', 'device_id', 'room', 'temperature_c', 'humidity_rh', 'status']];
  for (const p of points) {
    if (p.temperature == null) continue;
    rows.push([p.timestamp, deviceId, 'Ruangan', num(p.temperature), String(p.humidity), statusOf(p.temperature, p.humidity, th)]);
  }
  if (live) {
    rows.push([live.timestamp.slice(0, 19), deviceId, live.room, num(live.temperature), String(live.humidity), statusOf(live.temperature, live.humidity, th)]);
  }
  return '\uFEFF' + rows.map((r) => r.join(';')).join('\r\n') + '\r\n';
}
module.exports = { buildCsv };
