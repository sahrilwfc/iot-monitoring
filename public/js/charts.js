import { reduced, clamp, fmtT, fmtH } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const ease = (t) => 1 - Math.pow(1 - t, 3);

// Kurva halus monotone (tanpa overshoot melewati nilai data).
function smooth(p) {
  const n = p.length;
  if (!n) return '';
  if (n === 1) return `M${p[0].x},${p[0].y}`;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1].x - p[i].x; m[i] = (p[i + 1].y - p[i].y) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    d += `C${p[i].x + dx[i] / 3},${p[i].y + (t[i] * dx[i]) / 3} ${p[i + 1].x - dx[i] / 3},${p[i + 1].y - (t[i + 1] * dx[i]) / 3} ${p[i + 1].x},${p[i + 1].y}`;
  }
  return d;
}

export class Chart {
  constructor(host, o) {
    this.host = host; this.o = o; this.pts = []; this.vals = []; this.th = [null, null];
    this.dp = 1; this.active = -1; this.tw = {}; this.raf = 0; this.deviceId = '';
    this.svg = el('svg'); this.svg.setAttribute('role', 'img'); this.svg.setAttribute('aria-label', o.aria);
    host.append(this.svg);
    this.tip = document.createElement('div'); this.tip.className = 'tip'; host.append(this.tip);
    this.ro = new ResizeObserver(() => this.build()); this.ro.observe(host);
    const move = (e) => this.hover(e);
    this.svg.addEventListener('pointermove', move);
    this.svg.addEventListener('pointerdown', move);
    this.svg.addEventListener('pointerleave', () => this.unhover());
    this.svg.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') this.unhover(); });
  }

  X(i) { const n = this.pts.length; return this.padL + (n > 1 ? i * (this.W - this.padL - this.padR) / (n - 1) : (this.W - this.padL - this.padR) / 2); }
  Y(v) { const { min, max } = this.o; return this.padT + (1 - (clamp(v, min, max) - min) / (max - min)) * (this.H - this.padT - this.padB); }

  build() {
    const r = this.host.getBoundingClientRect();
    if (r.width < 50) return;
    this.W = r.width; this.H = r.height; this.padL = 40; this.padR = 14; this.padT = 14; this.padB = 24;
    const o = this.o, s = this.svg;
    s.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    s.replaceChildren();
    const gid = 'g' + o.key;
    const defs = el('defs', {}, s);
    const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': o.color, 'stop-opacity': '.34' }, lg);
    el('stop', { offset: '100%', 'stop-color': o.color, 'stop-opacity': '0' }, lg);

    for (const tv of o.ticks) {
      const y = this.Y(tv);
      el('line', { class: 'tick', x1: this.padL, x2: this.W - this.padR, y1: y, y2: y }, s);
      const t = el('text', { class: 'axl', x: this.padL - 8, y: y + 4, 'text-anchor': 'end' }, s); t.textContent = tv;
    }
    // Label sumbu X: pilih indeks dengan jarak minimum antar label (px), label terakhir selalu tampil bila muat.
    const n = this.pts.length, minGap = this.W < 460 ? 54 : 62;
    const shown = [];
    for (let i = 0; i < n; i++) {
      if (!shown.length || this.X(i) - this.X(shown[shown.length - 1]) >= minGap) shown.push(i);
    }
    if (n > 1 && shown[shown.length - 1] !== n - 1) {
      // label terakhir selalu tampil; buang label sebelumnya yang terlalu dekat dengannya
      while (shown.length > 1 && this.X(n - 1) - this.X(shown[shown.length - 1]) < minGap) shown.pop();
      shown.push(n - 1);
    }
    for (const i of shown) {
      const t = el('text', { class: 'axl', x: this.X(i), y: this.H - 6, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, s);
      t.textContent = this.pts[i].label;
    }

    this.area = el('path', { fill: `url(#${gid})`, stroke: 'none' }, s);
    this.thL = [0, 1].map(() => el('line', { class: 'th-l', x1: this.padL, x2: this.W - this.padR }, s));
    this.thT = [0, 1].map(() => el('text', { class: 'th-t', x: this.W - this.padR - 4, 'text-anchor': 'end' }, s));
    this.line = el('path', { class: 'ln', stroke: o.color }, s);
    this.vline = el('line', { class: 'vline', y1: this.padT, y2: this.H - this.padB, opacity: 0 }, s);
    this.dots = this.pts.map(() => el('circle', { class: 'dot', fill: '#0B0B0D', stroke: o.color, r: 0 }, s));
    this.pulse = el('circle', { class: 'pulse', fill: o.color, r: 4, opacity: 0 }, s);
    this.ring = el('circle', { fill: 'none', stroke: o.color, 'stroke-width': 1.5, r: 0, opacity: 0 }, s);
    this.emptyT = el('text', { class: 'empty', x: this.W / 2, y: this.H / 2 }, s);
    this.paint();
  }

  setDevice(id) { this.deviceId = id; }

  setData(points, { animate = true } = {}) {
    this.pts = points; this.vals = points.map((p) => p[this.o.key]);
    this.unhover(); this.build();
    if (animate && !reduced && this.vals.some((v) => v != null)) this.start('draw', { dur: 950 });
    else { this.dp = 1; this.paint(); }
  }

  // this.th = [maks, min]: indeks 0 digambar sebagai AMBANG MAKS, indeks 1 sebagai AMBANG MIN.
  setThresholds(min, max, { animate = true } = {}) {
    if (this.th[0] == null || !animate || reduced) { this.th = [max, min]; this.paint(); return; }
    this.start('th', { dur: 650, from: [...this.th], to: [max, min] });
  }

  updateLast(point) {
    const i = this.pts.length - 1;
    if (i < 0) return;
    const to = point[this.o.key];
    const from = this.vals[i] ?? to;
    this.pts[i] = { ...this.pts[i], ...point };
    if (reduced || from === to) { this.vals[i] = to; this.paint(); return; }
    this.start('last', { dur: 600, from, to, i });
  }

  start(name, cfg) {
    if (name === 'draw') this.dp = 0;
    this.tw[name] = { ...cfg, t0: performance.now() };
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.step(t));
  }

  step(now) {
    this.raf = 0;
    const tw = this.tw;
    if (tw.draw) { const k = clamp((now - tw.draw.t0) / tw.draw.dur, 0, 1); this.dp = ease(k); if (k >= 1) { delete tw.draw; this.dp = 1; } }
    if (tw.last) {
      const k = ease(clamp((now - tw.last.t0) / tw.last.dur, 0, 1));
      this.vals[tw.last.i] = tw.last.from + (tw.last.to - tw.last.from) * k;
      if (k >= 1) { this.vals[tw.last.i] = tw.last.to; delete tw.last; }
    }
    if (tw.th) {
      const k = ease(clamp((now - tw.th.t0) / tw.th.dur, 0, 1));
      this.th = [tw.th.from[0] + (tw.th.to[0] - tw.th.from[0]) * k, tw.th.from[1] + (tw.th.to[1] - tw.th.from[1]) * k];
      if (k >= 1) { this.th = [...tw.th.to]; delete tw.th; }
    }
    this.paint();
    if (Object.keys(tw).length) this.raf = requestAnimationFrame((t) => this.step(t));
  }

  paint() {
    if (!this.line) return;
    const n = this.pts.length, o = this.o;
    const idx = []; for (let i = 0; i < n; i++) if (this.vals[i] != null) idx.push(i);
    const pp = idx.map((i) => ({ x: this.X(i), y: this.Y(this.vals[i]) }));
    const d = smooth(pp);
    this.emptyT.textContent = idx.length ? '' : 'Belum ada data';
    this.line.setAttribute('d', d);
    const bottom = this.H - this.padB;
    this.area.setAttribute('d', pp.length > 1 ? `${d}L${pp[pp.length - 1].x},${bottom}L${pp[0].x},${bottom}Z` : '');
    this.area.setAttribute('opacity', this.dp < 0.25 ? 0 : (this.dp - 0.25) / 0.75);
    if (this.dp < 1 && pp.length > 1) {
      const L = this.line.getTotalLength();
      this.line.style.strokeDasharray = L; this.line.style.strokeDashoffset = L * (1 - this.dp);
    } else { this.line.style.strokeDasharray = 'none'; this.line.style.strokeDashoffset = 0; }

    const lastIdx = idx[idx.length - 1];
    this.dots.forEach((c, i) => {
      const v = this.vals[i];
      if (v == null) { c.setAttribute('r', 0); return; }
      const start = n > 1 ? i / (n - 1) : 0;
      const k = clamp((this.dp - start * 0.85) / 0.15, 0, 1);
      const isLast = i === lastIdx, hov = i === this.active;
      const r = (isLast ? 5 : 3.4) * (0.35 + 0.65 * k) * (hov ? 1.3 : 1);
      c.setAttribute('cx', this.X(i)); c.setAttribute('cy', this.Y(v)); c.setAttribute('r', k > 0 ? r : 0);
    });
    if (lastIdx != null && this.dp >= 1) {
      this.pulse.setAttribute('cx', this.X(lastIdx)); this.pulse.setAttribute('cy', this.Y(this.vals[lastIdx])); this.pulse.setAttribute('opacity', reduced ? 0 : 1);
    } else this.pulse.setAttribute('opacity', 0);

    this.th.forEach((v, j) => {
      const on = v != null;
      const y = on ? this.Y(v) : 0;
      this.thL[j].setAttribute('y1', y); this.thL[j].setAttribute('y2', y); this.thL[j].setAttribute('opacity', on ? 1 : 0);
      this.thT[j].setAttribute('y', y + (j === 0 ? -5 : 13)); this.thT[j].setAttribute('opacity', on ? 1 : 0);
      this.thT[j].textContent = on ? `AMBANG ${j === 0 ? 'MAKS' : 'MIN'} ${o.fmt(v)}` : '';
    });
    if (this.active >= 0) this.placeHover();
  }

  nearest(clientX) {
    const r = this.svg.getBoundingClientRect(), x = ((clientX - r.left) / r.width) * this.W;
    let best = -1, bd = 1e9;
    this.pts.forEach((_, i) => { if (this.vals[i] == null) return; const d = Math.abs(this.X(i) - x); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  hover(e) {
    const i = this.nearest(e.clientX);
    if (i < 0) return this.unhover();
    this.active = i; this.placeHover(); this.paint();
  }
  placeHover() {
    const i = this.active, p = this.pts[i], x = this.X(i), y = this.Y(this.vals[i]);
    this.vline.setAttribute('x1', x); this.vline.setAttribute('x2', x); this.vline.setAttribute('opacity', 1);
    this.ring.setAttribute('cx', x); this.ring.setAttribute('cy', y); this.ring.setAttribute('r', 3.4 * 1.9 * 1.3); this.ring.setAttribute('opacity', 0.55);
    this.tip.innerHTML = `<b>${p.label}</b><span>${this.deviceId}</span><span>Suhu ${fmtT(p.temperature)} °C</span><span>Kelembapan ${fmtH(p.humidity)}% RH</span>`;
    const tw = this.tip.offsetWidth || 160;
    const tx = clamp(x - tw / 2, 0, this.W - tw), ty = clamp(y - this.tip.offsetHeight - 14, 0, this.H);
    this.tip.style.transform = `translate(${tx}px, ${ty}px)`; this.tip.classList.add('on');
  }
  unhover() {
    if (this.active < 0) return;
    this.active = -1;
    this.vline?.setAttribute('opacity', 0); this.ring?.setAttribute('opacity', 0); this.tip.classList.remove('on');
    this.paint();
  }
}

// Panel Live: 22 bacaan terakhir, dua garis (suhu + kelembapan) dengan sumbu tetap, bergeser per push.
export class Live {
  constructor(host, N = 22) {
    this.host = host; this.N = N; this.cur = { t: Array(N).fill(null), h: Array(N).fill(null) }; this.tw = null; this.raf = 0;
    this.svg = el('svg', { viewBox: '0 0 400 84', preserveAspectRatio: 'none' }); host.append(this.svg);
    this.lh = el('path', { class: 'lh' }, this.svg); this.lt = el('path', { class: 'lt' }, this.svg);
    // Penanda titik terbaru berupa elemen HTML supaya tetap bulat walau SVG diregangkan.
    this.ringT = document.createElement('i'); this.ringT.className = 'mk t';
    this.ringH = document.createElement('i'); this.ringH.className = 'mk h';
    host.append(this.ringT, this.ringH);
    this.draw();
  }
  norm(series, min, max) { return series.map((v) => (v == null ? null : 1 - clamp((v - min) / (max - min), 0, 1))); }
  set(readings, { animate = false } = {}) {
    const pad = (a) => [...Array(Math.max(0, this.N - a.length)).fill(null), ...a.slice(-this.N)];
    const to = { t: this.norm(pad(readings.map((r) => r.temperature)), 18, 34), h: this.norm(pad(readings.map((r) => r.humidity)), 30, 95) };
    if (animate && !reduced) {
      const sh = (a) => a.map((_, i) => (i < a.length - 1 ? a[i + 1] : a[i]));
      const fix = (f, t) => f.map((v, i) => v ?? t[i]);
      this.tw = { t0: performance.now(), from: { t: fix(sh(this.cur.t), to.t), h: fix(sh(this.cur.h), to.h) }, to };
      if (!this.raf) this.raf = requestAnimationFrame((n) => this.step(n));
    } else { this.cur = to; this.tw = null; if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } this.draw(); }
  }
  step(now) {
    this.raf = 0;
    if (!this.tw) return; // animasi sudah dibatalkan oleh set() tanpa animasi
    const k = ease(clamp((now - this.tw.t0) / 550, 0, 1));
    const mix = (a, b) => a.map((v, i) => (b[i] == null ? null : (v ?? b[i]) + (b[i] - (v ?? b[i])) * k));
    this.cur = { t: mix(this.tw.from.t, this.tw.to.t), h: mix(this.tw.from.h, this.tw.to.h) };
    this.draw();
    if (k < 1) this.raf = requestAnimationFrame((n) => this.step(n)); else { this.cur = this.tw.to; this.tw = null; this.draw(); }
  }
  draw() {
    const W = 400, H = 84, pad = 6, N = this.N;
    const path = (s) => {
      const pts = s.map((v, i) => (v == null ? null : { x: pad + (i * (W - 2 * pad)) / (N - 1), y: pad + v * (H - 2 * pad) })).filter(Boolean);
      return { d: smooth(pts), last: pts[pts.length - 1] };
    };
    const a = path(this.cur.t), b = path(this.cur.h);
    this.lt.setAttribute('d', a.d); this.lh.setAttribute('d', b.d);
    for (const [ring, p] of [[this.ringT, a.last], [this.ringH, b.last]]) {
      ring.style.opacity = p ? 1 : 0;
      if (p) { ring.style.left = `${(p.x / W) * 100}%`; ring.style.top = `${(p.y / H) * 100}%`; }
    }
  }
}
