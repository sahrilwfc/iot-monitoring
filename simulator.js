// Simulator ESP32 (pengganti Wokwi): mengirim bacaan acak ke backend lewat HTTP POST.
// Atur lewat env: SIM_URL, SIM_DEVICE_ID, SIM_INTERVAL_MS.
const URL = process.env.SIM_URL || 'http://localhost:3000/api/readings';
const DEVICE_ID = process.env.SIM_DEVICE_ID || 'ESP32-01';
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS || 5000);

setInterval(async () => {
  const data = {
    device_id: DEVICE_ID,
    room: 'Ruangan',
    temperature: +(25 + Math.random() * 12).toFixed(1), // 25-37 °C
    humidity: Math.round(60 + Math.random() * 25)       // 60-85 %
  };

  try {
    // Mengirim data sensor ke backend menggunakan HTTP POST
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    // Membaca respons dari backend
    const result = await response.json();

    // Menampilkan status respons di console
    console.log('Data sensor terkirim:', data);
    console.log('Status HTTP:', response.status);
    console.log('Respons backend:', result);

  } catch (error) {
    console.error('Gagal mengirim data sensor:', error.message);
  }

}, INTERVAL_MS);
