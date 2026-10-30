// Status dihitung dari ambang aktif device, bukan dikirim device. Urutan: suhu dulu, lalu kelembapan.
function statusOf(temperature, humidity, th) {
  if (temperature > th.temp_max) return 'Di atas ambang suhu';
  if (temperature < th.temp_min) return 'Di bawah ambang suhu';
  if (humidity > th.hum_max) return 'Kelembapan tinggi';
  if (humidity < th.hum_min) return 'Kelembapan rendah';
  return 'Normal';
}
module.exports = { statusOf };
