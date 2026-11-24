// App bootstrap: builds the keypad, wires pointer/keyboard input, renders LCD + textbook view,
// persists calculator state in localStorage, registers the service worker.
import { KEY_ROWS_TOP, KEY_ROWS_MID, KEY_ROWS_NUM, KEYBOARD } from './keys.js';
import { LCD } from './lcd.js';
import { Controller, dispOf } from './controller.js';
import { renderTextbook } from './textbook.js';

const STORE_KEY = 'fx991ms:v1';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function keyHTML(d) {
  const m = d.m;
  if ((d.cls || '').includes('pill')) {
    // SHIFT / ALPHA / MODE / ON: blank pill keys with the name printed above (as on the real unit)
    return `<button type="button" class="key pill" data-k="${d.k}" aria-label="${esc(d.cap)}">`
      + `<span class="lg"><span class="lp p-${d.k}">${esc(d.cap)}</span>${d.s ? `<span class="ls">${esc(d.s)}</span>` : ''}</span>`
      + '<span class="cap"></span></button>';
  }
  const top = `<span class="lg">${d.s ? `<span class="ls">${esc(d.s)}</span>` : '<span></span>'}`
    + `${m && m.pos !== 'bot' ? `<span class="lm ${m.cls}">${esc(m.text)}</span>` : ''}`
    + `${d.a ? `<span class="la">${esc(d.a)}</span>` : '<span></span>'}</span>`;
  const bot = m && m.pos === 'bot' ? `<span class="lb ${m.cls}">${esc(m.text)}</span>` : '';
  return `<button type="button" class="key ${d.cls || ''}" data-k="${d.k}" aria-label="${esc(d.cap)}">${top}`
    + `<span class="cap">${esc(d.cap)}</span>${bot}</button>`;
}

function buildKeypad() {
  const [r1, r2] = KEY_ROWS_TOP;
  const pad = `<div class="pad" aria-label="cursor keys">
      <span class="copy">COPY</span><span class="replay">REPLAY</span>
      <button type="button" class="pk up" data-k="UP" aria-label="up">▲</button>
      <button type="button" class="pk down" data-k="DOWN" aria-label="down">▼</button>
      <button type="button" class="pk left" data-k="LEFT" aria-label="left">◀</button>
      <button type="button" class="pk right" data-k="RIGHT" aria-label="right">▶</button>
    </div>`;
  $('#keys-top').innerHTML = keyHTML(r1[0]) + keyHTML(r1[1]) + pad + keyHTML(r1[2]) + keyHTML(r1[3])
    + r2.map(keyHTML).join('');
  $('#keys-mid').innerHTML = KEY_ROWS_MID.flat().map(keyHTML).join('');
  $('#keys-num').innerHTML = KEY_ROWS_NUM.flat().map(keyHTML).join('');
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}

let saveTimer = 0;
function save(ctl) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ctl.snapshot())); } catch { /* quota / private mode */ }
  }, 250);
}

function init() {
  buildKeypad();
  const lcd = new LCD($('#lcd'));
  let ctl;
  try { ctl = new Controller(load()); } catch (e) {
    console.error('state restore failed, starting fresh', e);
    localStorage.removeItem(STORE_KEY);
    ctl = new Controller(null);
  }
  const tbEl = $('#tb-body'), tbWrap = $('#textbook');
  window.__calc = ctl; // debugging aid

  const render = () => {
    const v = ctl.render();
    lcd.render(v.lcd);
    document.body.dataset.mode = ctl.state.mode;
    document.body.classList.toggle('shift', ctl.shift);
    document.body.classList.toggle('alpha', ctl.alpha);
    tbWrap.classList.toggle('off', !ctl.ui.tb);
    if (ctl.ui.tb) tbEl.innerHTML = v.tb && v.tb.tokens && v.tb.tokens.length ? renderTextbook(v.tb.tokens, v.tb.cursor, dispOf) : '<span class="tb-empty">Textbook view</span>';
  };

  const press = (k) => {
    try { ctl.press(k); } catch (e) { console.error(e); }
    render();
    save(ctl);
  };

  // pointer input on keys: fire on pointerdown for responsiveness
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('[data-k]');
    if (!b) return;
    ev.preventDefault();
    b.classList.add('down');
    if (navigator.vibrate) { try { navigator.vibrate(5); } catch { /* ignore */ } }
    press(b.dataset.k);
  });
  const up = () => document.querySelectorAll('.down').forEach((b) => b.classList.remove('down'));
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  document.addEventListener('contextmenu', (ev) => { if (ev.target.closest('.calc')) ev.preventDefault(); });

  // physical keyboard (desktop)
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const m = KEYBOARD[ev.key];
    if (m === undefined || m === null) return;
    ev.preventDefault();
    for (const k of [].concat(m)) press(k);
    const el = document.querySelector(`[data-k="${[].concat(m).pop()}"]`);
    if (el) { el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 90); }
  });

  $('#tb-toggle').addEventListener('click', () => { ctl.ui.tb = !ctl.ui.tb; render(); save(ctl); });
  render();
}

init();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e)); });
}
