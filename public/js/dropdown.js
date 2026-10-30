import { $ } from './util.js';

// Dropdown custom: button + listbox. Bukan <select> native.
export function createDropdown(mount, { label, onChange }) {
  const uid = 'dd' + Math.random().toString(36).slice(2, 7);
  mount.innerHTML = `
    <div class="dd">
      <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="${uid}" aria-label="${label}">
        <span class="dd-value">—</span>
        <span class="dd-chev"><svg><use href="#i-chev"/></svg></span>
      </button>
      <ul class="dd-list" id="${uid}" role="listbox" tabindex="-1" aria-label="${label}"></ul>
    </div>`;
  const root = $('.dd', mount), trigger = $('.dd-trigger', mount), list = $('.dd-list', mount), valueEl = $('.dd-value', mount);
  let options = [], value = null, focusIdx = -1;

  const opts = () => [...list.children];
  const isOpen = () => root.classList.contains('open');

  function render() {
    list.innerHTML = options.map((o, i) =>
      `<li class="dd-opt" role="option" id="${uid}-${i}" data-v="${o.value}" aria-selected="${o.value === value}" tabindex="-1"><span>${o.label}</span><svg><use href="#i-check"/></svg></li>`).join('');
    const cur = options.find((o) => o.value === value);
    valueEl.textContent = cur ? cur.label : '—';
  }
  function focusAt(i) {
    const els = opts();
    if (!els.length) return;
    focusIdx = (i + els.length) % els.length;
    els.forEach((e, k) => e.classList.toggle('focus', k === focusIdx));
    els[focusIdx].focus({ preventScroll: false });
  }
  function open() {
    if (isOpen()) return;
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    const sel = options.findIndex((o) => o.value === value);
    focusAt(sel >= 0 ? sel : 0);
  }
  function close(returnFocus = false) {
    if (!isOpen()) return;
    root.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    opts().forEach((e) => e.classList.remove('focus'));
    if (returnFocus) trigger.focus();
  }
  function choose(v) {
    const changed = v !== value;
    value = v; render(); close(true);
    if (changed) onChange(v);
  }

  trigger.addEventListener('click', () => (isOpen() ? close(true) : open()));
  trigger.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('.dd-opt'); if (li) choose(li.dataset.v); });
  list.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(focusIdx + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(focusIdx - 1); break;
      case 'Home': e.preventDefault(); focusAt(0); break;
      case 'End': e.preventDefault(); focusAt(options.length - 1); break;
      case 'Enter': case ' ': e.preventDefault(); if (focusIdx >= 0) choose(options[focusIdx].value); break;
      case 'Escape': e.preventDefault(); close(true); break;
      case 'Tab': close(false); break;
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) close(false); });

  return {
    setOptions(o) { options = o; render(); },
    setValue(v) { value = v; render(); },
    get value() { return value; },
  };
}
