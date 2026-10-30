// Semua waktu disimpan dan ditampilkan dalam WIB (UTC+7), format ISO 8601 dengan offset.
const OFF = 7 * 3600e3;
const toWib = (ms) => new Date(ms + OFF).toISOString().slice(0, 19) + '+07:00';
module.exports = { OFF, toWib };
