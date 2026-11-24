// "Textbook view": reading aid rendering the linear fx-991MS input as natural maths.
// NOT part of the real calculator (the MS display is linear). Pure HTML/CSS, no library.
import { tokenInfo } from '../tokens.js';

const CARET = '\u0000caret';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FUNC_NAME = {
  sin: 'sin', cos: 'cos', tan: 'tan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  asin: 'sin<sup>−1</sup>', acos: 'cos<sup>−1</sup>', atan: 'tan<sup>−1</sup>',
  asinh: 'sinh<sup>−1</sup>', acosh: 'cosh<sup>−1</sup>', atanh: 'tanh<sup>−1</sup>',
  log: 'log', ln: 'ln', Det: 'det', Trn: 'Trn',
};
const POST_SUP = { 'x²': '2', 'x³': '3', 'x⁻¹': '−1' };
const OP_TXT = { '+': '+', '-': '−', '×': '×', '÷': '÷', nPr: 'P', nCr: 'C', '∠': '∠', '=': '=', '·': '·',
  and: ' and ', or: ' or ', xor: ' xor ', xnor: ' xnor ' };

export function renderTextbook(tokens, cursor, dispOf) {
  const toks = tokens.slice();
  if (cursor != null && cursor >= 0) toks.splice(Math.min(cursor, toks.length), 0, CARET);
  const p = { t: toks, i: 0, dispOf };
  const html = seq(p, () => false);
  return html || '<span class="tb-empty">&nbsp;</span>';
}

const peek = (p) => p.t[p.i];
const kind = (id) => (tokenInfo(id) || {}).kind;
const isNumTok = (id) => id !== undefined && /^[0-9.]$/.test(id);

// a sequence until stop(token) is true (stop token is not consumed)
function seq(p, stop) {
  const out = [];
  while (p.i < p.t.length && !stop(peek(p))) {
    const id = peek(p);
    if (id === ')' ) { p.i++; out.push('<span class="tb-p">)</span>'); continue; }
    if (id === 'xroot') {
      // x√y : previous item becomes the root index (Manual: "7 [SHIFT][^](x√) 123")
      p.i++;
      const idx = out.pop() || '';
      out.push(radical(bare(p), idx));
      continue;
    }
    if (POST_SUP[id]) { p.i++; out.push(`<sup>${POST_SUP[id]}</sup>`); continue; }
    if (id === '^') { p.i++; out.push(`<sup>${bare(p)}</sup>`); continue; }
    if (OP_TXT[id] !== undefined) { p.i++; out.push(`<span class="tb-op">${esc(OP_TXT[id])}</span>`); continue; }
    out.push(atom(p));
  }
  return out.join('');
}

// One operand (number with fraction marks, variable, function application, group ...)
function atom(p, inSup = false) {
  let pre = '';
  while (peek(p) === CARET) { p.i++; pre += '<span class="tb-caret"></span>'; }
  const id = peek(p);
  if (id === undefined) return pre;
  if (isNumTok(id) || id === 'EXP' || id === 'frac') return pre + number(p);
  p.i++;
  if (id === CARET) return pre + '<span class="tb-caret"></span>';
  if (id === '(') return pre + `<span class="tb-p">(</span>${group(p)}<span class="tb-p">)</span>`;
  if (id === 'neg') return pre + '−' + atom(p, inSup);
  if (id === '√') return pre + radical(bare(p), '');
  if (id === 'cbrt') return pre + radical(bare(p), '3');
  if (id === '10^' || id === 'e^') {
    const base = id === '10^' ? '10' : '<i>e</i>';
    return pre + `${base}<sup>${bare(p)}</sup>`;
  }
  if (id === '∫(') return pre + integral(p);
  if (id === 'd/dx(') return pre + derivative(p);
  if (FUNC_NAME[id]) return pre + `<span class="tb-fn">${FUNC_NAME[id]}</span>${atom(p, inSup)}`;
  const info = tokenInfo(id);
  if (info && info.kind === 'pre' && /\($/.test(info.disp)) {
    // Pol( Rec( Abs( arg( Conjg( Rnd( Not( Neg( ... : show call with its arguments
    return pre + `<span class="tb-fn">${esc(info.disp.slice(0, -1))}</span><span class="tb-p">(</span>${group(p)}<span class="tb-p">)</span>`;
  }
  const d = p.dispOf(id);
  if (info && (info.kind === 'var' || info.kind === 'const') && /^[A-Za-zπ]$/.test(d)) return pre + `<i>${esc(d)}</i>`;
  return pre + `<span>${esc(d)}</span>`;
}

// operand whose parentheses are implied by the layout (radicand, exponent)
function bare(p) {
  if (peek(p) === '(') { p.i++; return group(p); }
  return atom(p, true);
}

// inside of parentheses up to the matching ')' (consumed) or end
function group(p) {
  const s = seq(p, (t) => t === ')');
  if (peek(p) === ')') p.i++;
  return s;
}

// split arguments of a call at top-level commas, consuming the closing ')'
function args(p) {
  const list = [];
  for (;;) {
    list.push(seq(p, (t) => t === ',' || t === ')'));
    const t = peek(p);
    if (t === ',') { p.i++; continue; }
    if (t === ')') p.i++;
    break;
  }
  return list;
}

function number(p) {
  // digits / '.' / EXP / fraction marks ┘ (Manual p.12 "Fraction Calculations": a┘b┘c)
  const parts = [''];
  let caretAt = [];
  while (p.i < p.t.length) {
    const id = peek(p);
    if (id === CARET) { caretAt.push(parts.length - 1); parts[parts.length - 1] += '\u0001'; p.i++; continue; }
    if (isNumTok(id)) { parts[parts.length - 1] += id; p.i++; continue; }
    if (id === 'EXP') { parts[parts.length - 1] += '×10^'; p.i++; if (peek(p) === 'neg') { parts[parts.length - 1] += '−'; p.i++; } continue; }
    if (id === 'frac') { parts.push(''); p.i++; continue; }
    break;
  }
  const fmt = (s) => {
    let h = esc(s).replace(/\u0001/g, '<span class="tb-caret"></span>');
    const k = h.indexOf('×10^');
    if (k >= 0) h = `${h.slice(0, k)}×10<sup>${h.slice(k + 4)}</sup>`;
    return h;
  };
  if (parts.length === 1) return fmt(parts[0]);
  // Powers and Type A functions bind tighter than a b/c (users-guide p.34 "Order of Operations":
  // 2 Type A functions, 3 powers/roots, 4 a b/c), so 2┘3^2 means 2/(3^2): attach to the denominator.
  let sup = '';
  for (;;) {
    const nx = peek(p);
    if (POST_SUP[nx]) { p.i++; sup += `<sup>${POST_SUP[nx]}</sup>`; continue; }
    if (nx === '^') { p.i++; sup += `<sup>${bare(p)}</sup>`; continue; }
    break;
  }
  if (parts.length === 2) return frac(fmt(parts[0]), fmt(parts[1]) + sup);
  return `<span class="tb-mixed">${fmt(parts[0])}</span>${frac(fmt(parts[1]), fmt(parts.slice(2).join('┘')) + sup)}`;
}

const frac = (n, d) => `<span class="tb-frac"><span class="tb-num">${n || '&nbsp;'}</span><span class="tb-den">${d || '&nbsp;'}</span></span>`;
const radical = (body, index) =>
  `<span class="tb-rad">${index ? `<sup class="tb-idx">${index}</sup>` : ''}<span class="tb-sym">√</span><span class="tb-rb">${body || '&nbsp;'}</span></span>`;

function integral(p) {
  // ∫(f(X), a, b[, n])  (Manual Guide 2 E-14 "Integration Calculations")
  const [f = '', a = '', b = '', n] = args(p);
  return `<span class="tb-int"><span class="tb-intsym">∫</span><span class="tb-lim"><span class="tb-hi">${b || '&nbsp;'}</span><span class="tb-lo">${a || '&nbsp;'}</span></span></span>`
    + `${f}<i>dx</i>${n ? `<span class="tb-note">(n=${n})</span>` : ''}`;
}

function derivative(p) {
  // d/dx(f(X), a[, Δx])  (Manual Guide 2 E-13 "Differential Calculations")
  const [f = '', a = '', dx] = args(p);
  return `${frac('<i>d</i>', '<i>dx</i>')}<span class="tb-p">(</span>${f}<span class="tb-p">)</span>`
    + `<span class="tb-at"><span class="tb-bar"></span><sub><i>x</i>=${a || '&nbsp;'}</sub></span>${dx ? `<span class="tb-note">(Δx=${dx})</span>` : ''}`;
}
