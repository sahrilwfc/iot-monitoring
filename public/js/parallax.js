import { $, $$, reduced, lerp, clamp } from './util.js';

const mobile = () => matchMedia('(max-width: 640px), (pointer: coarse)').matches;

export function initParallax() {
  const layers = $$('.layer').map((e) => ({ e, d: Number(e.dataset.depth) }));
  const btn = $('#parallax-toggle');
  const labels = [$('#chip-parallax'), $('#foot-par')];
  let on = !reduced, mx = 0, my = 0, tx = 0, ty = 0, sy = 0, tsy = 0, tiltRaf = 0;
  let gx = 0, gy = 0; // deviceorientation (mobile)

  function setLabel() {
    for (const l of labels) l.textContent = on ? 'Parallax aktif' : 'Parallax mati';
    btn.setAttribute('aria-pressed', String(on));
  }
  function clear() { for (const l of layers) l.e.style.transform = ''; }

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });
  addEventListener('scroll', () => { tsy = scrollY; }, { passive: true });
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    gx = clamp(e.gamma / 30, -1, 1) * 0.5; gy = clamp((e.beta - 40) / 30, -1, 1) * 0.5;
  });

  function frame() {
    if (on) {
      const amp = mobile() ? 0.35 : 1;
      mx = lerp(mx, tx + gx, 0.055); my = lerp(my, ty + gy, 0.055); sy = lerp(sy, tsy, 0.08);
      for (const { e, d } of layers) {
        e.style.transform = `translate3d(${(-mx * d * 1.4 * amp).toFixed(2)}px, ${(-my * d * 1.4 * amp - sy * d * 0.012 * amp).toFixed(2)}px, 0)`;
      }
    }
    requestAnimationFrame(frame);
  }
  if (!reduced) requestAnimationFrame(frame);

  btn.addEventListener('click', () => {
    if (reduced) return;
    on = !on; if (!on) clear(); setLabel();
  });
  if (reduced) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
  setLabel();

  // Tilt 3D untuk kartu ringkasan.
  if (!reduced) {
    for (const card of $$('[data-tilt]')) {
      let rx = 0, ry = 0, trx = 0, try_ = 0, running = false;
      const max = () => (mobile() ? 2.5 : 5.5);
      const loop = () => {
        rx = lerp(rx, trx, 0.12); ry = lerp(ry, try_, 0.12);
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        if (Math.abs(rx - trx) > 0.01 || Math.abs(ry - try_) > 0.01) requestAnimationFrame(loop);
        else { running = false; if (!trx && !try_) card.style.transform = ''; }
      };
      const kick = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
      card.addEventListener('pointermove', (e) => {
        if (!on) return;
        const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        trx = -py * max() * 2; try_ = px * max() * 2; kick();
      });
      card.addEventListener('pointerleave', () => { trx = 0; try_ = 0; kick(); });
    }
  }
}

// Kartu chart/panel masuk dengan fade + naik ringan.
export function initReveal() {
  const items = $$('.panel, .alert, .hero-main, .sec').filter((e) => !e.closest('.dd-list'));
  if (reduced || !('IntersectionObserver' in window)) return;
  items.forEach((e) => e.classList.add('reveal'));
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.08 });
  items.forEach((e) => io.observe(e));
}
