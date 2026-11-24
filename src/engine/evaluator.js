// AST evaluator for all calculation modes.
import * as cx from '../lib/complex.js';
import * as mat from '../lib/matrix.js';
import * as vct from '../lib/vector.js';
import * as basen from '../lib/basen.js';
import * as stats from '../lib/stats.js';
import { CONSTANTS } from '../lib/constants.js';
import { CONVERSIONS } from '../lib/conversions.js';
import { CalcError, MATH, SYNTAX, ARG, DIM, wrap } from './errors.js';
import { isFrac, isCx, isMat, isVct, roundDecimals, roundSig, fromRad } from './format.js';
import { ENG_SYMBOLS } from './parser.js';

const BASE_NUM = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };

// ---------- numeric hygiene ----------
// Manual p.37: input/result range ±9.999999999e99; smaller than 1e-99 underflows to 0.
export function fin(x) {
  if (typeof x !== 'number' || Number.isNaN(x) || !Number.isFinite(x)) throw new CalcError(MATH);
  const ax = Math.abs(x);
  if (ax >= 1e100) throw new CalcError(MATH);
  if (ax < 1e-99) return 0;
  return Number(x.toPrecision(15)) + 0; // ~15 internal digits
}
const finCx = (z) => {
  const re = fin(z.re), im = fin(z.im);
  const out = { re, im };
  if (z.polar !== undefined) out.polar = z.polar;
  return out;
};

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
export function mkFrac(n, d) {
  if (d === 0) throw new CalcError(MATH);
  if (d < 0) { n = -n; d = -d; }
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return fin(n / d);
  const g = gcd(n, d) || 1;
  return { num: n / g, den: d / g };
}
export const toNum = (v) => (isFrac(v) ? v.num / v.den : v);
const fracable = (v) => isFrac(v) || (typeof v === 'number' && Number.isSafeInteger(v));
const asFrac = (v) => (isFrac(v) ? v : { num: v, den: 1 });

// ---------- angle helpers ----------
function toRad(x, unit) {
  if (unit === 'Rad') return x;
  if (unit === 'Gra') return x * Math.PI / 200;
  return x * Math.PI / 180;
}
export function convertAngle(x, from, to) {
  if (from === to) return x;
  return fromRad(toRad(x, from), to);
}
const QUARTER = { Deg: 90, Rad: Math.PI / 2, Gra: 100 };
const TRIG_LIMIT = { Deg: 4.5e10, Rad: 785398163.3, Gra: 5e10 }; // manual p.36 "Input Ranges"
// exact quarter-turn detection keeps sin 180° = 0, cos 90° = 0, tan 45° = 1 like the real unit
function quarter(x, unit) {
  const q = x / QUARTER[unit];
  const r = Math.round(q);
  if (Math.abs(q - r) <= 1e-13 * Math.max(1, Math.abs(q))) return ((r % 4) + 4) % 4;
  return -1;
}
export function trig(f, x, unit) {
  if (Math.abs(x) >= TRIG_LIMIT[unit]) throw new CalcError(MATH);
  const q = quarter(x, unit);
  if (q >= 0) {
    if (f === 'sin') return [0, 1, 0, -1][q];
    if (f === 'cos') return [1, 0, -1, 0][q];
    if (q % 2 === 1) throw new CalcError(MATH); // tan at (2n-1)·90°
    return 0;
  }
  const r = toRad(x, unit);
  return fin(Math[f](r));
}

// ---------- normal distribution (SD mode, User's Guide 2 p.12-13) ----------
function erfc(x) {
  if (Math.abs(x) < 3) {
    // erf series
    let sum = x, term = x;
    for (let n = 1; n < 200; n++) {
      term *= -x * x / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    return 1 - 2 / Math.sqrt(Math.PI) * sum;
  }
  if (x < 0) return 2 - erfc(-x);
  // continued fraction (Lentz)
  const tiny = 1e-300;
  let f = x, C = x, D = 0;
  for (let n = 1; n < 300; n++) {
    const a = n / 2;
    D = x + a * D; if (D === 0) D = tiny; D = 1 / D;
    C = x + a / C; if (C === 0) C = tiny;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}
const Phi = (t) => 0.5 * erfc(-t / Math.SQRT2);

// ---------- evaluator ----------
export class Evaluator {
  constructor(state, opts = {}) {
    this.state = state;
    this.mode = state.mode || 'COMP';
    this.unit = (state.setup && state.setup.angle) || 'Deg';
    this.bind = opts.bind || {};
  }

  realOf(v) {
    if (isCx(v)) {
      if (v.im !== 0) throw new CalcError(MATH);
      return v.re;
    }
    if (isMat(v) || isVct(v)) throw new CalcError(SYNTAX);
    return toNum(v);
  }
  intOf(v) {
    const x = this.realOf(v);
    if (!Number.isInteger(x)) throw new CalcError(MATH);
    return x;
  }

  eval(node) {
    if (this.mode === 'BASE') return this.evalBase(node);
    const v = this.ev(node);
    return v;
  }

  ev(n) {
    switch (n.t) {
      case 'num': return fin(n.v);
      case 'blit': throw new CalcError(SYNTAX, n.pos);
      case 'group': return this.ev(n.a);
      case 'const': return this.constant(n);
      case 'var': return this.variable(n);
      case 'bin': return this.binary(n);
      case 'pre': return this.prefix(n);
      case 'post': return this.postfix(n);
      case 'frac': return this.fraction(n);
      case 'dms': return this.dms(n);
      case 'call': return this.call(n);
      default: throw new CalcError(SYNTAX, n.pos);
    }
  }

  constant(n) {
    const id = n.id;
    if (id === 'π') return Math.PI;
    if (id === 'e') return Math.E;
    if (id === 'Ran#') return Math.floor(Math.random() * 1000) / 1000; // 0.000-0.999 (manual p.20)
    if (id === 'i') {
      if (this.mode !== 'CMPLX') throw new CalcError(SYNTAX, n.pos);
      return { re: 0, im: 1 };
    }
    const m = /^const:(\d\d)$/.exec(id);
    if (m) {
      const c = CONSTANTS.find((k) => k.no === Number(m[1]));
      if (!c) throw new CalcError(SYNTAX, n.pos);
      return c.value;
    }
    throw new CalcError(SYNTAX, n.pos);
  }

  variable(n) {
    const id = n.id;
    const st = this.state;
    if (id in this.bind) return this.bind[id];
    if (id === 'Ans') return st.ans ?? 0;
    if (/^[A-FXYM]$/.test(id)) return st.vars[id] ?? 0;
    if (id.startsWith('Mat')) {
      if (this.mode !== 'MAT') throw new CalcError(SYNTAX, n.pos);
      const m = st.mat[id.slice(3)];
      if (!m) throw new CalcError(DIM, n.pos);
      return m;
    }
    if (id.startsWith('Vct')) {
      if (this.mode !== 'VCT') throw new CalcError(SYNTAX, n.pos);
      const v = st.vct[id.slice(3)];
      if (!v) throw new CalcError(DIM, n.pos);
      return v;
    }
    return this.statVar(id, n.pos);
  }

  stats() {
    const st = this.state;
    if (this.mode === 'SD') return { sd: true, s: wrap(() => stats.sdStats(st.stat.sd || [])) };
    if (this.mode === 'REG') return { sd: false, s: wrap(() => stats.regStats(st.regType || 'Lin', st.stat.reg || [])) };
    throw new CalcError(SYNTAX);
  }

  // Manual: users-guide p.26-29 (S-SUM / S-VAR recall keys).
  statVar(id, pos) {
    let r;
    try { r = this.stats(); } catch (e) { throw new CalcError(SYNTAX, pos); }
    const { sd, s } = r;
    const SDMAP = { 'Σx²': 'sumX2', 'Σx': 'sumX', n: 'n', 'x̄': 'mean', 'xσn': 'popSD', 'xσn-1': 'sampleSD' };
    const REGMAP = { 'Σx²': 'sumX2', 'Σx': 'sumX', n: 'n', 'Σy²': 'sumY2', 'Σy': 'sumY', 'Σxy': 'sumXY',
      'Σx³': 'sumX3', 'Σx²y': 'sumX2Y', 'Σx⁴': 'sumX4', 'x̄': 'meanX', 'xσn': 'popSDx',
      'xσn-1': 'sampleSDx', 'ȳ': 'meanY', 'yσn': 'popSDy', 'yσn-1': 'sampleSDy',
      regA: 'A', regB: 'B', regC: 'C', regr: 'r' };
    const key = (sd ? SDMAP : REGMAP)[id];
    if (!key) throw new CalcError(SYNTAX, pos);
    if (key === 'C' && String(this.state.regType).toLowerCase() !== 'quad') throw new CalcError(SYNTAX, pos);
    if (key === 'r' && String(this.state.regType).toLowerCase() === 'quad') throw new CalcError(SYNTAX, pos);
    return fin(wrap(() => s[key]));
  }

  // ---- arithmetic dispatch ----
  add(a, b, op) {
    if (isMat(a) || isMat(b)) {
      if (!isMat(a) || !isMat(b)) throw new CalcError(SYNTAX);
      return wrap(() => (op === '+' ? mat.add(a, b) : mat.sub(a, b)));
    }
    if (isVct(a) || isVct(b)) {
      if (!isVct(a) || !isVct(b)) throw new CalcError(SYNTAX);
      return wrap(() => (op === '+' ? vct.add(a, b) : vct.sub(a, b)));
    }
    if (isCx(a) || isCx(b)) return this.cxNorm(wrap(() => (op === '+' ? cx.add(this.cx(a), this.cx(b)) : cx.sub(this.cx(a), this.cx(b)))));
    if ((isFrac(a) || isFrac(b)) && fracable(a) && fracable(b)) {
      const A = asFrac(a), B = asFrac(b);
      return mkFrac(op === '+' ? A.num * B.den + B.num * A.den : A.num * B.den - B.num * A.den, A.den * B.den);
    }
    const x = toNum(a), y = toNum(b);
    const r = op === '+' ? x + y : x - y;
    // cancellation to zero at the 15-digit internal precision (e.g. 1-0.9-0.1 = 0)
    if (Math.abs(r) < 1e-14 * Math.max(Math.abs(x), Math.abs(y))) return 0;
    return fin(r);
  }
  mul(a, b) {
    if (isMat(a) || isMat(b)) {
      if (isMat(a) && isMat(b)) return wrap(() => mat.mul(a, b));
      if (isVct(a) || isVct(b)) throw new CalcError(SYNTAX);
      return isMat(a) ? wrap(() => mat.scale(a, this.realOf(b))) : wrap(() => mat.scale(b, this.realOf(a)));
    }
    if (isVct(a) || isVct(b)) {
      // User's Guide 2 p.21: VctA × VctB = outer (cross) product
      if (isVct(a) && isVct(b)) return wrap(() => vct.cross(a, b));
      return isVct(a) ? wrap(() => vct.scale(a, this.realOf(b))) : wrap(() => vct.scale(b, this.realOf(a)));
    }
    if (isCx(a) || isCx(b)) return this.cxNorm(wrap(() => cx.mul(this.cx(a), this.cx(b))));
    if ((isFrac(a) || isFrac(b)) && fracable(a) && fracable(b)) {
      const A = asFrac(a), B = asFrac(b);
      return mkFrac(A.num * B.num, A.den * B.den);
    }
    return fin(toNum(a) * toNum(b));
  }
  div(a, b) {
    if (isMat(b) || isVct(b)) throw new CalcError(SYNTAX);
    if (isMat(a)) { const k = this.realOf(b); if (k === 0) throw new CalcError(MATH); return wrap(() => mat.scale(a, 1 / k)); }
    if (isVct(a)) { const k = this.realOf(b); if (k === 0) throw new CalcError(MATH); return wrap(() => vct.scale(a, 1 / k)); }
    if (isCx(a) || isCx(b)) return this.cxNorm(wrap(() => cx.div(this.cx(a), this.cx(b))));
    if ((isFrac(a) || isFrac(b)) && fracable(a) && fracable(b)) {
      const A = asFrac(a), B = asFrac(b);
      if (B.num === 0) throw new CalcError(MATH);
      return mkFrac(A.num * B.den, A.den * B.num);
    }
    const y = toNum(b);
    if (y === 0) throw new CalcError(MATH);
    return fin(toNum(a) / y);
  }
  neg(a) {
    if (isMat(a)) return wrap(() => mat.scale(a, -1));
    if (isVct(a)) return wrap(() => vct.scale(a, -1));
    if (isCx(a)) return { ...cx.neg(a), ...(a.polar !== undefined ? { polar: a.polar } : {}) };
    if (isFrac(a)) return { num: -a.num, den: a.den };
    return -a + 0;
  }
  cx(v) {
    if (isCx(v)) return v;
    if (isMat(v) || isVct(v)) throw new CalcError(SYNTAX);
    return { re: toNum(v), im: 0 };
  }
  cxNorm(z) {
    const r = finCx(z);
    if (r.im === 0 && r.polar === undefined) return r.re;
    return r;
  }

  power(a, b) {
    if (isMat(a)) return wrap(() => mat.power(a, this.intOf(b)));
    if (isCx(a) || isCx(b)) {
      const bb = this.cx(b);
      if (bb.im !== 0 || !Number.isInteger(bb.re)) throw new CalcError(MATH);
      return this.cxNorm(wrap(() => cx.powInt(this.cx(a), bb.re)));
    }
    const y = toNum(b);
    if (isFrac(a) && Number.isInteger(y) && Math.abs(y) <= 64) {
      if (y >= 0) return mkFrac(a.num ** y, a.den ** y);
      if (a.num === 0) throw new CalcError(MATH);
      return mkFrac(a.den ** -y, a.num ** -y);
    }
    return fin(realPow(toNum(a), y));
  }

  binary(n) {
    const op = n.op;
    try {
      switch (op) {
        case '+': case '-': return this.add(this.ev(n.a), this.ev(n.b), op);
        case '×': return this.mul(this.ev(n.a), this.ev(n.b));
        case '÷': return this.div(this.ev(n.a), this.ev(n.b));
        case '^': return this.power(this.ev(n.a), this.ev(n.b));
        case 'xroot': {
          // x√y = y^(1/x)  (manual p.20 Example 3: 7 x√ 123 = 1.988647795)
          const x = this.realOf(this.ev(n.a)), y = this.realOf(this.ev(n.b));
          return fin(realRoot(x, y));
        }
        case 'nPr': case 'nCr': return this.perm(op, this.ev(n.a), this.ev(n.b));
        case '∠': {
          if (this.mode !== 'CMPLX') throw new CalcError(SYNTAX, n.pos);
          const r = this.realOf(this.ev(n.a)), th = this.realOf(this.ev(n.b));
          return this.cxNorm(wrap(() => cx.fromPolar(r, toRad(th, this.unit))));
        }
        case '·': {
          const a = this.ev(n.a), b = this.ev(n.b);
          if (!isVct(a) || !isVct(b)) throw new CalcError(SYNTAX, n.pos);
          return fin(wrap(() => vct.dot(a, b)));
        }
        case 'and': case 'or': case 'xor': case 'xnor': throw new CalcError(SYNTAX, n.pos);
        default: throw new CalcError(SYNTAX, n.pos);
      }
    } catch (e) {
      if (e instanceof CalcError && e.pos === undefined) e.pos = n.pos;
      throw e;
    }
  }

  // Manual p.37: 0 <= r <= n < 1e10, integers; result < 1e100.
  perm(op, a, b) {
    const n = this.realOf(a), r = this.realOf(b);
    if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < r || n >= 1e10) throw new CalcError(MATH);
    let res = 1;
    if (op === 'nPr') {
      for (let k = 0; k < r; k++) { res *= (n - k); if (res >= 1e100) throw new CalcError(MATH); }
      return fin(res);
    }
    const k = Math.min(r, n - r);
    for (let j = 1; j <= k; j++) { res = res * (n - k + j) / j; if (res >= 1e100) throw new CalcError(MATH); }
    return fin(res < 9e15 ? Math.round(res) : res);
  }

  prefix(n) {
    const f = n.f;
    try {
      if (f === 'neg') return this.neg(this.ev(n.a));
      const a = this.ev(n.a);
      if (f === 'Det') { if (!isMat(a)) throw new CalcError(SYNTAX); return fin(wrap(() => mat.det(a))); }
      if (f === 'Trn') { if (!isMat(a)) throw new CalcError(SYNTAX); return wrap(() => mat.transpose(a)); }
      return this.func(f, this.realOf(a));
    } catch (e) {
      if (e instanceof CalcError && e.pos === undefined) e.pos = n.pos;
      throw e;
    }
  }

  // Real scientific functions. Input ranges: users-guide p.36-37.
  func(f, x) {
    const u = this.unit;
    switch (f) {
      case 'sin': case 'cos': case 'tan': return fin(trig(f, x, u));
      case 'asin': case 'acos':
        if (Math.abs(x) > 1) throw new CalcError(MATH);
        return fin(fromRad(Math[f](x), u));
      case 'atan': return fin(fromRad(Math.atan(x), u));
      case 'sinh': case 'cosh':
        if (Math.abs(x) > 230.2585092) throw new CalcError(MATH);
        return fin(Math[f](x));
      case 'tanh': return fin(Math.tanh(x));
      case 'asinh': return fin(Math.asinh(x));
      case 'acosh': if (x < 1) throw new CalcError(MATH); return fin(Math.acosh(x));
      case 'atanh': if (Math.abs(x) >= 1) throw new CalcError(MATH); return fin(Math.atanh(x));
      case 'log': if (x <= 0) throw new CalcError(MATH); return fin(Math.log10(x));
      case 'ln': if (x <= 0) throw new CalcError(MATH); return fin(Math.log(x));
      case '10^': if (x >= 100) throw new CalcError(MATH); return fin(Number.isInteger(x) ? Number('1e' + x) : 10 ** x);
      case 'e^': if (x > 230.2585092) throw new CalcError(MATH); return fin(Math.exp(x));
      case '√': if (x < 0) throw new CalcError(MATH); return fin(Math.sqrt(x));
      case 'cbrt': return fin(Math.cbrt(x));
      default: throw new CalcError(SYNTAX);
    }
  }

  postfix(n) {
    const f = n.f;
    try {
      const a = this.ev(n.a);
      switch (f) {
        case 'x²':
          if (isMat(a)) return wrap(() => mat.power(a, 2));
          return this.mul(a, a);
        case 'x³':
          if (isMat(a)) return wrap(() => mat.power(a, 3));
          return this.mul(this.mul(a, a), a);
        case 'x⁻¹':
          if (isMat(a)) return wrap(() => mat.inverse(a));
          return this.div(isCx(a) ? { re: 1, im: 0 } : (isFrac(a) ? { num: 1, den: 1 } : 1), a);
        case '!': {
          const x = this.realOf(a);
          if (!Number.isInteger(x) || x < 0 || x > 69) throw new CalcError(MATH);
          let r = 1; for (let k = 2; k <= x; k++) r *= k;
          return fin(r);
        }
        case '°': return fin(convertAngle(this.realOf(a), 'Deg', this.unit));
        case 'r': return fin(convertAngle(this.realOf(a), 'Rad', this.unit));
        case 'g': return fin(convertAngle(this.realOf(a), 'Gra', this.unit));
        case 'x̂': case 'x̂1': case 'x̂2': case 'ŷ': return this.estimate(f, this.realOf(a));
        case '>t': {
          // SD mode: normalized variate (x - x̄)/xσn (User's Guide 2 p.13)
          if (this.mode !== 'SD') throw new CalcError(SYNTAX);
          const s = wrap(() => stats.sdStats(this.state.stat.sd || []));
          const sd = wrap(() => s.popSD);
          if (sd === 0) throw new CalcError(MATH);
          return fin((this.realOf(a) - wrap(() => s.mean)) / sd);
        }
        default: {
          if (ENG_SYMBOLS[f] !== undefined) {
            if (!this.state.setup.eng) throw new CalcError(SYNTAX);
            return this.mul(a, ENG_SYMBOLS[f]);
          }
          const m = /^conv:(\d\d)$/.exec(f);
          if (m) {
            const c = CONVERSIONS.find((k) => k.no === Number(m[1]));
            if (!c) throw new CalcError(SYNTAX);
            return fin(c.convert(this.realOf(a)));
          }
          throw new CalcError(SYNTAX);
        }
      }
    } catch (e) {
      if (e instanceof CalcError && e.pos === undefined) e.pos = n.pos;
      throw e;
    }
  }

  // users-guide p.29-31: x̂ / ŷ (Quad: x̂1, x̂2)
  estimate(f, v) {
    if (this.mode !== 'REG') throw new CalcError(SYNTAX);
    const type = this.state.regType || 'Lin';
    const s = wrap(() => stats.regStats(type, this.state.stat.reg || []));
    const quad = String(type).toLowerCase() === 'quad';
    const coeffs = wrap(() => ({ A: s.A, B: s.B, C: quad ? s.C : 0 }));
    if (f === 'ŷ') return fin(wrap(() => stats.estimateY(type, coeffs, v)));
    const r = wrap(() => stats.estimateX(type, coeffs, v));
    if (quad) {
      if (f === 'x̂') throw new CalcError(SYNTAX);
      return fin(f === 'x̂2' ? r.x2 : r.x1);
    }
    if (f !== 'x̂') throw new CalcError(SYNTAX);
    return fin(r);
  }

  // a┘b┘c (users-guide p.12-13)
  fraction(n) {
    const vals = n.parts.map((p) => this.ev(p));
    const allInt = vals.every((v) => fracable(v) && (!isFrac(v) || v.den === 1));
    if (!allInt) {
      const xs = vals.map((v) => this.realOf(v));
      if (xs.length === 2) { if (xs[1] === 0) throw new CalcError(MATH, n.pos); return fin(xs[0] / xs[1]); }
      if (xs[2] === 0) throw new CalcError(MATH, n.pos);
      return fin(xs[0] + xs[1] / xs[2]);
    }
    const xs = vals.map((v) => toNum(v));
    if (xs.length === 2) {
      if (xs[1] === 0) throw new CalcError(MATH, n.pos);
      return mkFrac(xs[0], xs[1]);
    }
    if (xs[2] === 0) throw new CalcError(MATH, n.pos);
    const sign = xs[0] < 0 ? -1 : 1;
    return mkFrac(xs[0] * xs[2] + sign * xs[1], xs[2]);
  }

  // 12°34°56° -> 12 + 34/60 + 56/3600 (users-guide p.15)
  dms(n) {
    const xs = n.parts.map((p) => this.realOf(this.ev(p)));
    const sign = xs[0] < 0 ? -1 : 1;
    let v = xs[0];
    if (xs[1] !== undefined) v += sign * xs[1] / 60;
    if (xs[2] !== undefined) v += sign * xs[2] / 3600;
    return fin(v);
  }

  call(n) {
    const f = n.f;
    const args = n.args;
    const need = (k, max = k) => { if (args.length < k || args.length > max) throw new CalcError(SYNTAX, n.pos); };
    try {
      switch (f) {
        case 'Pol(': case 'Rec(': {
          // users-guide p.21: results are assigned to E and F; first value is shown.
          need(2);
          const a = this.realOf(this.ev(args[0])), b = this.realOf(this.ev(args[1]));
          let e, ff;
          if (f === 'Pol(') {
            e = fin(Math.hypot(a, b));
            ff = (a === 0 && b === 0) ? 0 : fin(fromRad(Math.atan2(b, a), this.unit));
          } else {
            if (a < 0) throw new CalcError(MATH);
            e = fin(a * trig('cos', b, this.unit));
            ff = fin(a * trig('sin', b, this.unit));
          }
          this.state.vars.E = e; this.state.vars.F = ff;
          return e;
        }
        case 'Rnd(': need(1); return this.rnd(this.realOf(this.ev(args[0])));
        case 'Abs(': {
          need(1);
          const a = this.ev(args[0]);
          if (isMat(a)) return wrap(() => mat.abs(a));
          if (isVct(a)) return fin(wrap(() => vct.abs(a)));
          if (isCx(a)) return fin(cx.abs(a));
          if (isFrac(a)) return { num: Math.abs(a.num), den: a.den };
          return Math.abs(a);
        }
        case 'arg(': {
          need(1);
          if (this.mode !== 'CMPLX') throw new CalcError(SYNTAX, n.pos);
          const z = this.cx(this.ev(args[0]));
          return fin(fromRad(cx.arg(z), this.unit));
        }
        case 'Conjg(': {
          need(1);
          if (this.mode !== 'CMPLX') throw new CalcError(SYNTAX, n.pos);
          return this.cxNorm(cx.conj(this.cx(this.ev(args[0]))));
        }
        case '∫(': return this.integrate(n);
        case 'd/dx(': return this.derivative(n);
        case 'P(': case 'Q(': case 'R(': {
          need(1);
          if (this.mode !== 'SD') throw new CalcError(SYNTAX, n.pos);
          const t = this.realOf(this.ev(args[0]));
          const p = Phi(t);
          if (f === 'P(') return fin(p);
          if (f === 'Q(') return fin(Math.abs(p - 0.5));
          return fin(1 - p);
        }
        case 'Not(': case 'Neg(': throw new CalcError(SYNTAX, n.pos);
        default: throw new CalcError(SYNTAX, n.pos);
      }
    } catch (e) {
      if (e instanceof CalcError && e.pos === undefined) e.pos = n.pos;
      throw e;
    }
  }

  // Rnd: round to the current display setting (users-guide p.15-16)
  rnd(x) {
    const s = this.state.setup;
    if (s.disp === 'Fix') return fin(roundDecimals(x, s.fix ?? 0));
    if (s.disp === 'Sci') return fin(roundSig(x, s.sci || 10));
    return fin(roundSig(x, 10));
  }

  withX(fnNode, x) {
    const saved = this.bind;
    this.bind = { ...saved, X: x };
    try { return this.realOf(this.ev(fnNode)); } finally { this.bind = saved; }
  }

  // ∫(f(X), a, b[, n]): Simpson's rule with N = 2^n (User's Guide 2 p.14). Without n an
  // adaptive Simpson is used ("the calculator automatically" picks the partitions).
  integrate(n) {
    const args = n.args;
    if (args.length < 3 || args.length > 4) throw new CalcError(SYNTAX, n.pos);
    const a = this.realOf(this.ev(args[1])), b = this.realOf(this.ev(args[2]));
    const f = (x) => this.withX(args[0], x);
    if (args.length === 4) {
      const k = this.realOf(this.ev(args[3]));
      if (!Number.isInteger(k) || k < 1 || k > 9) throw new CalcError(ARG, n.pos);
      const N = 2 ** k, h = (b - a) / N;
      let s = f(a) + f(b);
      for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
      return fin(s * h / 3);
    }
    if (a === b) return 0;
    const fa = f(a), fb = f(b), m = (a + b) / 2, fm = f(m);
    const whole = (b - a) / 6 * (fa + 4 * fm + fb);
    let evals = 0;
    const rec = (l, r, fl, fr, fmid, S, eps, depth) => {
      const lm = (l + (l + r) / 2) / 2, rm = ((l + r) / 2 + r) / 2, mid = (l + r) / 2;
      const flm = f(lm), frm = f(rm);
      evals += 2;
      const Sl = (mid - l) / 6 * (fl + 4 * flm + fmid), Sr = (r - mid) / 6 * (fmid + 4 * frm + fr);
      const d = Sl + Sr - S;
      if (depth <= 0 || evals > 200000 || Math.abs(d) <= 15 * eps) return Sl + Sr + d / 15;
      return rec(l, mid, fl, fmid, flm, Sl, eps / 2, depth - 1) + rec(mid, r, fmid, fr, frm, Sr, eps / 2, depth - 1);
    };
    const tol = 1e-11 * Math.max(1, Math.abs(whole));
    return fin(rec(a, b, fa, fb, fm, whole, tol, 40));
  }

  // d/dx(f(X), a[, Δx]) central difference (User's Guide 2 p.13)
  derivative(n) {
    const args = n.args;
    if (args.length < 2 || args.length > 3) throw new CalcError(SYNTAX, n.pos);
    const a = this.realOf(this.ev(args[1]));
    const f = (x) => this.withX(args[0], x);
    if (args.length === 3) {
      const h = this.realOf(this.ev(args[2]));
      if (h === 0) throw new CalcError(MATH, n.pos);
      return fin((f(a + h) - f(a - h)) / (2 * h));
    }
    // Richardson extrapolation of central differences
    let h = 1e-3 * Math.max(1, Math.abs(a));
    const D = (hh) => (f(a + hh) - f(a - hh)) / (2 * hh);
    const d1 = D(h), d2 = D(h / 2), d3 = D(h / 4);
    const r1 = (4 * d2 - d1) / 3, r2 = (4 * d3 - d2) / 3;
    const r = (16 * r2 - r1) / 15;
    // snap tiny noise to a clean 10-digit value
    return fin(Number(r.toPrecision(12)));
  }

  // ---------- BASE-N (User's Guide 2 p.10-12) ----------
  evalBase(n) {
    const base = BASE_NUM[this.state.base] || 10;
    const ev = (x) => this.evalBase(x);
    const w = (fn) => wrap(fn);
    try {
      switch (n.t) {
        case 'blit': return w(() => basen.parse(n.s, n.base));
        case 'num': return Math.trunc(n.v);
        case 'group': return ev(n.a);
        case 'var': {
          if (n.id === 'Ans') return Math.trunc(toNum(isCx(this.state.ans) ? 0 : this.state.ans ?? 0));
          if (/^[A-FXYM]$/.test(n.id)) return Math.trunc(toNum(this.state.vars[n.id] ?? 0));
          throw new CalcError(SYNTAX, n.pos);
        }
        case 'pre':
          if (n.f === 'neg') return w(() => basen.neg(ev(n.a)));
          throw new CalcError(SYNTAX, n.pos);
        case 'call':
          if (n.f === 'Not(' && n.args.length === 1) return w(() => basen.not(ev(n.args[0])));
          if (n.f === 'Neg(' && n.args.length === 1) return w(() => basen.neg(ev(n.args[0])));
          throw new CalcError(SYNTAX, n.pos);
        case 'bin': {
          const a = ev(n.a), b = ev(n.b);
          const ops = { '+': basen.add, '-': basen.sub, '×': basen.mul, '÷': basen.div,
            and: basen.and, or: basen.or, xor: basen.xor, xnor: basen.xnor };
          const f = ops[n.op];
          if (!f) throw new CalcError(SYNTAX, n.pos);
          return w(() => f(a, b));
        }
        default: throw new CalcError(SYNTAX, n.pos);
      }
    } catch (e) {
      if (e instanceof CalcError && e.pos === undefined) e.pos = n.pos;
      throw e;
    }
  }
}

// ^ : manual p.37 "^(x^y)": x<0 needs y integer or 1/(2n+1); x=0 needs y>0.
export function realPow(x, y) {
  if (x === 0) { if (y <= 0) throw new CalcError(MATH); return 0; }
  if (x > 0) return x ** y;
  if (Number.isInteger(y)) return x ** y;
  const inv = 1 / y, k = Math.round(inv);
  if (Math.abs(inv - k) < 1e-10 && k % 2 !== 0) return -((-x) ** (1 / k));
  throw new CalcError(MATH);
}
// x√y : y>0 any x≠0; y<0 needs x odd integer (or 1/n per manual)
export function realRoot(x, y) {
  if (x === 0) throw new CalcError(MATH);
  if (y > 0) return y ** (1 / x);
  if (y === 0) { if (x < 0) throw new CalcError(MATH); return 0; }
  if (Number.isInteger(x) && Math.abs(x) % 2 === 1) return -((-y) ** (1 / x));
  const inv = 1 / x;
  if (Number.isInteger(Math.round(inv)) && Math.abs(inv - Math.round(inv)) < 1e-10) return realPow(y, Math.round(inv));
  throw new CalcError(MATH);
}
