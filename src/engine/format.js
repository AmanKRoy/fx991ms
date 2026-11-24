// Result formatting for the 10-digit (+2 digit exponent) result line.
// Manual: users-guide p.10 "Exponential Display Formats" (Norm 1: exponential for |x| < 10^-2 or
// >= 10^10; Norm 2: |x| < 10^-9 or >= 10^10), p.15 "FIX, SCI, RND", p.7 "Two-line Display"
// (3-digit separator when the integer part has more than three digits), p.11 "Decimal Point and
// Separator Symbols" (Dot: '.' decimal + ',' separator; Comma: ',' decimal + '.' separator),
// p.22 "Engineering Notation Calculations", User's Guide 2 p.6-7 "Inputting Engineering Symbols",
// p.12-13 "Fraction Operations" (fraction shown only if integer+numerator+denominator+separators
// <= 10 digits).
import * as basen from '../lib/basen.js';

const BASE_NUM = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };
const ENG_BY_EXP = { 3: 'k', 6: 'M', 9: 'G', 12: 'T', '-3': 'm', '-6': 'μ', '-9': 'n', '-12': 'p', '-15': 'f' };

export const isFrac = (v) => v !== null && typeof v === 'object' && 'den' in v;
export const isCx = (v) => v !== null && typeof v === 'object' && 're' in v;
export const isMat = (v) => v !== null && typeof v === 'object' && 'rows' in v;
export const isVct = (v) => v !== null && typeof v === 'object' && 'dim' in v && !('rows' in v);

// Decimal decomposition of |x| rounded half-up to `sig` significant digits, working from the
// 15-digit representation (the calculator keeps ~15 internal digits; manual p.37 "Internal digits").
// Returns { digits: string(sig), exp } with value = 0.d1d2.. * 10^(exp+1), i.e. d1.d2.. x 10^exp.
export function decompose(x, sig) {
  const ax = Math.abs(x);
  if (ax === 0) return { digits: '0'.repeat(Math.max(sig, 1)), exp: 0, zero: true };
  const s = ax.toExponential(14); // d.dddddddddddddde±E
  const [m, e] = s.split('e');
  let digits = m.replace('.', '');
  let exp = parseInt(e, 10);
  if (sig >= 15) return { digits: digits + '0'.repeat(sig - 15), exp };
  if (sig <= 0) {
    // rounding position is at or left of the first digit
    if (sig === 0 && digits[0] >= '5') return { digits: '1', exp: exp + 1, carried: true };
    return { digits: '', exp, zero: true };
  }
  const head = digits.slice(0, sig).split('').map(Number);
  if (digits[sig] >= '5') {
    let i = sig - 1;
    while (i >= 0) { head[i]++; if (head[i] === 10) { head[i] = 0; i--; } else break; }
    if (i < 0) { head.unshift(1); head.pop(); exp++; }
  }
  return { digits: head.join(''), exp };
}

// Round x to n decimal places (half-up on decimal digits). Used by Fix and Rnd.
export function roundDecimals(x, n) {
  if (x === 0) return 0;
  const { exp } = decompose(x, 15);
  const sig = exp + 1 + n;
  const d = decompose(x, Math.min(sig, 15));
  if (d.zero) return 0;
  return Math.sign(x) * Number('0.' + d.digits + 'e' + (d.exp + 1));
}
export function roundSig(x, n) {
  if (x === 0) return 0;
  const d = decompose(x, n);
  return Math.sign(x) * Number('0.' + d.digits + 'e' + (d.exp + 1));
}

const expStr = (e) => (e < 0 ? '-' : '') + String(Math.abs(e)).padStart(2, '0');

function chars(setup) {
  return setup && setup.dot === 'Comma' ? { dp: ',', sep: '.' } : { dp: '.', sep: ',' };
}
function group(intStr, sep) {
  if (intStr.length <= 3) return intStr;
  let out = '';
  for (let i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 === 0) out += sep;
    out += intStr[i];
  }
  return out;
}
const stripZeros = (s) => s.replace(/0+$/, '');

function result(main, exp, neg, indicators = {}) {
  return { main, exp, neg, indicators };
}

// mantissa "d.ddd" from digits (keepZeros: Sci n shows all n digits)
function mantissa(digits, keepZeros, ch) {
  const frac = keepZeros ? digits.slice(1) : stripZeros(digits.slice(1));
  return digits[0] + ch.dp + frac;
}

function fixedFromDigits(digits, exp, decimals, ch) {
  // value = d1.d2.. x 10^exp, digits length covers exactly the shown digits
  let intPart, fracPart;
  if (exp >= 0) {
    intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
    fracPart = digits.slice(exp + 1);
  } else {
    intPart = '0';
    fracPart = '0'.repeat(-exp - 1) + digits;
  }
  fracPart = fracPart.slice(0, decimals).padEnd(decimals, '0');
  return { intPart, fracPart };
}

function formatNorm(x, setup, ch) {
  const neg = x < 0;
  if (x === 0) return result('0' + ch.dp, null, false);
  const d = decompose(x, 10);
  const lo = (setup.norm === 2) ? -9 : -2;
  if (d.exp >= 10 || d.exp < lo) return result(mantissa(d.digits, false, ch), expStr(d.exp), neg);
  // Fixed form: the value is rounded to 10 significant digits, then cut to the 10 display
  // positions (the leading "0." zeros take positions). This reproduces the manual's values,
  // e.g. UG2 p.22 -2/3 -> -0.666666666, UG p.30 r = 0.982607368 (true 0.98260736888).
  const decimals = d.exp >= 0 ? 9 - d.exp : 9;
  const { intPart, fracPart } = fixedFromDigits(d.digits, d.exp, decimals, ch);
  return result(group(intPart, ch.sep) + ch.dp + stripZeros(fracPart), null, neg);
}

function formatSci(x, n, ch) {
  const sig = n === 0 ? 10 : n;
  const d = decompose(x, sig);
  if (x === 0) return result(mantissa('0'.repeat(sig), true, ch), '00', false);
  return result(mantissa(d.digits, true, ch), expStr(d.exp), x < 0);
}

function formatFix(x, n, setup, ch) {
  const r = roundDecimals(x, n);
  if (r === 0) return result('0' + ch.dp + '0'.repeat(n), null, false);
  const d0 = decompose(r, 15);
  if (d0.exp >= 10) return formatNorm(x, { ...setup, norm: 1 }, ch);
  const intDigits = d0.exp >= 0 ? d0.exp + 1 : 1;
  const decimals = Math.min(n, 10 - intDigits);
  const r2 = roundDecimals(x, decimals);
  if (r2 === 0) return result('0' + ch.dp + '0'.repeat(decimals), null, false);
  const d = decompose(r2, 15);
  const { intPart, fracPart } = fixedFromDigits(d.digits, d.exp, decimals, ch);
  return result(group(intPart, ch.sep) + ch.dp + fracPart, null, r2 < 0);
}

// ENG view. shift: 0 = standard engineering form (exponent multiple of 3, 1 <= mantissa < 1000);
// +k = k further ENG presses (decimal point moves right: exponent -3k),
// -k = k SHIFT ←ENG presses (decimal point moves left: exponent +3k).
// CASIO ENG behaviour: 1234 ENG -> 1.234x10^03, ENG -> 1234.x10^00; SHIFT ←ENG -> 0.001234x10^06.
function formatEng(x, shift, setup, ch) {
  const neg = x < 0;
  if (x === 0) return result('0' + ch.dp, setup.eng ? null : '00', false);
  const E = decompose(x, 10).exp;
  let ex = Math.floor(E / 3) * 3 - 3 * shift;
  while (E - ex + 1 > 10) ex += 3;          // too many integer digits
  while (9 - (ex - E - 1) < 1) ex -= 3;     // too many leading zeros
  const intLen = E - ex + 1;
  let main;
  if (intLen > 0) {
    const d = decompose(x, 10);
    if (d.exp !== E) return formatEng(roundSig(x, 10), shift, setup, ch);
    const intPart = d.digits.slice(0, intLen);
    main = group(intPart, ch.sep) + ch.dp + stripZeros(d.digits.slice(intLen));
  } else {
    const zeros = -intLen;
    const d = decompose(x, 10);
    main = '0' + ch.dp + '0'.repeat(zeros) + stripZeros(d.digits.slice(0, 9 - zeros));
  }
  if (setup.eng) {
    if (ex === 0) return result(main, null, neg);
    const sym = ENG_BY_EXP[ex];
    if (sym) return result(main, null, neg, { engSym: sym });
  }
  return result(main, expStr(ex), neg);
}

// SHIFT ←°'" view: d°m°s.  Manual: users-guide p.15 Example 1: 2.258 -> 2°15°28.8
function formatDMS(x, setup, ch) {
  const ax = Math.abs(x);
  if (ax >= 1e6) return formatReal(x, setup, {}, ch);
  let d = Math.floor(ax);
  let mm = (ax - d) * 60;
  let m = Math.floor(mm + 1e-9);
  let s = Math.max(0, (mm - m) * 60);
  const room = Math.max(0, 10 - String(d).length - String(m).length - 2);
  s = roundDecimals(s, room);
  if (s >= 60) { s -= 60; m++; }
  if (m >= 60) { m -= 60; d++; }
  let sStr = s.toFixed(room);
  if (sStr.includes('.')) sStr = sStr.replace(/0+$/, '').replace(/\.$/, '');
  sStr = sStr.replace('.', ch.dp);
  return result(`${d}°${m}°${sStr}`, null, x < 0, { dms: true });
}

function formatReal(x, setup, view, ch) {
  if (view.dms) return formatDMS(x, setup, ch);
  if (Number.isInteger(view.eng)) return formatEng(x, view.eng, setup, ch);
  if (setup.disp === 'Fix') return formatFix(x, setup.fix ?? 0, setup, ch);
  if (setup.disp === 'Sci') return formatSci(x, setup.sci ?? 0, ch);
  if (setup.eng && x !== 0) {
    // Eng ON: "even standard calculation results are displayed using engineering symbols"
    // (User's Guide 2 p.7); symbol chosen so the numeric part is within 1..1000.
    const E = decompose(x, 10).exp;
    const ex = Math.floor(E / 3) * 3;
    if (ex !== 0 && ENG_BY_EXP[ex]) return formatEng(x, 0, setup, ch);
  }
  return formatNorm(x, setup, ch);
}

const nDigits = (n) => String(Math.abs(n)).length;

// fraction text and whether it fits the 10-digit limit
export function fracText(f, style) {
  const num = Math.abs(f.num), den = f.den;
  const w = Math.trunc(num / den), rem = num % den;
  let text, len;
  if (style === 'mixed' && w !== 0) {
    text = `${w}┘${rem}┘${den}`;
    len = nDigits(w) + nDigits(rem) + nDigits(den) + 2;
  } else {
    text = `${num}┘${den}`;
    len = nDigits(num) + nDigits(den) + 1;
  }
  return { text, fits: len <= 10 && Number.isSafeInteger(num) && Number.isSafeInteger(den) };
}

export function format(value, state, view = {}) {
  const setup = state.setup || {};
  const ch = chars(setup);
  if (isMat(value)) return { main: '', exp: null, neg: false, indicators: { mat: true } };
  if (isVct(value)) return { main: '', exp: null, neg: false, indicators: { vct: true } };
  if (state.mode === 'BASE' && typeof value === 'number') {
    const base = BASE_NUM[state.base] || 10;
    const main = basen.format(Math.trunc(value), base);
    const neg = base === 10 && main.startsWith('-');
    return { main: (neg ? main.slice(1) : main) + '.', exp: null, neg, indicators: { base: state.base } };
  }
  if (isCx(value)) {
    const part = view.complexPart || 're';
    const polar = value.polar !== undefined ? value.polar : setup.cplx === 'r∠θ';
    if (polar) {
      const r = Math.hypot(value.re, value.im);
      const th = fromRad(Math.atan2(value.im, value.re), setup.angle);
      const out = formatReal(part === 'im' ? th : r, setup, view, ch);
      out.indicators = { ...out.indicators, RI: true, polar: true, angle: part === 'im' };
      return out;
    }
    const v = part === 'im' ? value.im : value.re;
    const out = formatReal(v, setup, view, ch);
    out.indicators = { ...out.indicators, RI: value.im !== 0, i: part === 'im' };
    return out;
  }
  if (isFrac(value)) {
    if (value.den === 1) return formatReal(value.num, setup, view, ch);
    if (!view.dms && !Number.isInteger(view.eng)) {
      const style = view.frac || (setup.fracDisp === 'd/c' ? 'improper' : 'mixed');
      const { text, fits } = fracText(value, style);
      if (fits) return { main: text, exp: null, neg: value.num < 0, indicators: { frac: true } };
    }
    return formatReal(value.num / value.den, setup, view, ch);
  }
  return formatReal(value, setup, view, ch);
}

export function fromRad(x, unit) {
  if (unit === 'Rad') return x;
  if (unit === 'Gra') return x * 200 / Math.PI;
  return x * 180 / Math.PI;
}
