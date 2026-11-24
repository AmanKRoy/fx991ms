// fx-991MS calculation engine: public API (see CONTRACT.md "Engine API").
import * as basen from '../lib/basen.js';
import { CalcError, SYNTAX, MATH, CANT_SOLVE } from './errors.js';
import { parseProgram } from './parser.js';
import { Evaluator, fin, mkFrac, toNum } from './evaluator.js';
import { format as fmt, isFrac, isCx, isMat, isVct, fracText } from './format.js';

export { CalcError } from './errors.js';

const BASE_NUM = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };
const PLAIN_VARS = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];

// Initial setup per users-guide p.8 / User's Guide 2 p.3 ("Note!": COMP, Deg, Norm 1, a+bi, a b/c, Dot)
export function createState() {
  return {
    mode: 'COMP',
    regType: 'Lin',
    setup: { angle: 'Deg', disp: 'Norm', fix: 0, sci: 0, norm: 1, fracDisp: 'ab/c', eng: false,
      dot: 'Dot', cplx: 'a+bi' },
    base: 'DEC',
    vars: Object.fromEntries(PLAIN_VARS.map((v) => [v, 0])),
    ans: 0,
    stat: { sd: [], reg: [] },
    mat: { A: null, B: null, C: null, Ans: null },
    vct: { A: null, B: null, C: null, Ans: null },
  };
}

function parse(tokens, state) {
  return parseProgram(tokens, { mode: state.mode, base: state.base, fracDisp: state.setup.fracDisp });
}

// Percentage key (users-guide p.14): a×b% = a·b/100, a÷b% = a/b·100, a+b% = (a+b)/b·100,
// a−b% = (a−b)/b·100; a×b%+ = mark-up, a×b%− = discount.
function percent(ev, s) {
  const root = s.expr;
  if (root.t === 'bin' && ['×', '÷', '+', '-'].includes(root.op)) {
    const a = ev.ev(root.a), b = ev.ev(root.b);
    const hundred = 100;
    switch (root.op) {
      case '×': {
        const part = ev.div(ev.mul(a, b), hundred);
        if (s.pctOp === '+') return ev.add(a, part, '+');
        if (s.pctOp === '-') return ev.add(a, part, '-');
        return part;
      }
      case '÷': if (s.pctOp) throw new CalcError(SYNTAX, s.end); return ev.mul(ev.div(a, b), hundred);
      case '+': case '-': {
        if (s.pctOp) throw new CalcError(SYNTAX, s.end);
        return ev.mul(ev.div(ev.add(a, b, root.op), b), hundred);
      }
    }
  }
  if (s.pctOp) throw new CalcError(SYNTAX, s.end);
  return ev.div(ev.ev(root), 100);
}

// arithmetic on sexagesimal input keeps the result in sexagesimal display
function dmsy(n) {
  if (!n) return false;
  if (n.t === 'dms') return true;
  if (n.t === 'group') return dmsy(n.a);
  if (n.t === 'pre' && n.f === 'neg') return dmsy(n.a);
  if (n.t === 'bin' && ['+', '-', '×', '÷'].includes(n.op)) return dmsy(n.a) || dmsy(n.b);
  return false;
}

function storeResult(state, v) {
  if (isMat(v)) state.mat.Ans = v;
  else if (isVct(v)) state.vct.Ans = v;
  else state.ans = v;
}

function evalStatement(ev, s, state) {
  let v;
  if (s.pct) {
    if (state.mode === 'BASE') throw new CalcError(SYNTAX, s.start);
    v = percent(ev, s);
  } else if (s.rhs) {
    // assignment form "Y=X²+3" (CALC, User's Guide 2 p.5)
    if (s.expr.t !== 'var' || !PLAIN_VARS.includes(s.expr.id)) throw new CalcError(SYNTAX, s.start);
    v = ev.eval(s.rhs);
    state.vars[s.expr.id] = v;
  } else {
    v = ev.eval(s.expr);
    if (s.sto) state.vars[s.sto] = v;
  }
  if (s.cplxView) {
    if (state.mode !== 'CMPLX') throw new CalcError(SYNTAX, s.end - 1);
    const z = isCx(v) ? v : { re: toNum(v), im: 0 };
    v = { re: z.re, im: z.im, polar: s.cplxView === '>r∠θ' };
  }
  if (state.mode === 'BASE') {
    try { basen.check(v, BASE_NUM[state.base] || 10); } catch { throw new CalcError(MATH, s.end); }
  }
  return v;
}

// Evaluate an input line. ':' multi-statements return one result per statement
// (users-guide p.10 "Multi-statements"); Ans is updated after each statement.
export function evaluate(tokens, state) {
  const stmts = parse(tokens, state);
  const ev = new Evaluator(state);
  const results = [];
  const views = [];
  for (const s of stmts) {
    const v = evalStatement(ev, s, state);
    storeResult(state, v);
    results.push(v);
    // users-guide p.15 Example 2: 12°34°56° × 3.45 = 43°24°31.2 is shown in sexagesimal
    views.push(typeof v === 'number' && !s.pct && dmsy(s.rhs || s.expr) ? { dms: true } : {});
  }
  return { results, views };
}

// Variables used by an expression, in order of first use (CALC prompts, User's Guide 2 p.5).
// For CALC (default) the target of "V=expr" is not prompted unless it is also used on the right;
// pass { solve: true } to get every variable (SOLVE prompts all of them, User's Guide 2 p.5-6).
export function variablesIn(tokens, opts = {}) {
  const seen = [];
  const targets = new Set();
  let stmtStart = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === ':') { stmtStart = i + 1; continue; }
    if (!PLAIN_VARS.includes(t)) continue;
    if (i === stmtStart && tokens[i + 1] === '=' && !opts.solve) { targets.add(t); continue; }
    if (i > 0 && tokens[i - 1] === 'STO') continue;
    if (!seen.includes(t)) seen.push(t);
  }
  return seen;
}

// SOLVE (User's Guide 2 p.5-6): Newton's method on lhs-rhs (or expr = 0) for `varName`,
// starting at `guess`. Other variables come from state.vars. The solution is stored in the
// variable and returned. Throws CalcError("Can't Solve") when Newton does not converge.
export function solve(tokens, varName, guess, state) {
  const stmts = parse(tokens, state);
  if (stmts.length !== 1) throw new CalcError(SYNTAX);
  const s = stmts[0];
  if (s.pct || s.sto) throw new CalcError(SYNTAX);
  if (!PLAIN_VARS.includes(varName)) throw new CalcError(SYNTAX);
  const f = (x) => {
    const ev = new Evaluator(state, { bind: { [varName]: x } });
    const l = ev.realOf(ev.eval(s.expr));
    return s.rhs ? l - ev.realOf(ev.eval(s.rhs)) : l;
  };
  let x = toNum(guess ?? state.vars[varName] ?? 0);
  if (typeof x !== 'number' || !Number.isFinite(x)) x = 0;
  let fx;
  try { fx = f(x); } catch (e) { if (e instanceof CalcError && e.message === SYNTAX) throw e; throw new CalcError(CANT_SOLVE); }
  let ok = fx === 0;
  for (let it = 0; it < 200 && !ok; it++) {
    const h = Math.max(Math.abs(x) * 1e-7, 1e-9);
    let d;
    try { d = (f(x + h) - f(x - h)) / (2 * h); } catch { d = NaN; }
    if (!Number.isFinite(d) || d === 0) { x += (Math.abs(x) + 1) * 1e-3 * (it % 2 ? -1 : 1) * (it + 1); try { fx = f(x); } catch { /* keep going */ } continue; }
    let step = fx / d, nx, nfx, tries = 0;
    for (;;) {
      nx = x - step;
      try { nfx = f(nx); if (Number.isFinite(nfx)) break; } catch { /* damp */ }
      step /= 2;
      if (++tries > 30) throw new CalcError(CANT_SOLVE);
    }
    const conv = Math.abs(nx - x) <= 1e-13 * Math.max(1, Math.abs(nx));
    x = nx; fx = nfx;
    if (fx === 0 || conv) ok = true;
  }
  if (!ok || !Number.isFinite(x)) throw new CalcError(CANT_SOLVE);
  // residual sanity check
  let scale = 1;
  try { scale = Math.max(1, Math.abs(f(x + 1e-6 * Math.max(1, Math.abs(x))) - fx) * 1e6); } catch { /* ignore */ }
  if (Math.abs(fx) > 1e-6 * scale) throw new CalcError(CANT_SOLVE);
  x = fin(Number(x.toPrecision(13)));
  state.vars[varName] = x;
  return x;
}

export function format(value, state, view = {}) {
  return fmt(value, state, view);
}

// a b/c key on a result (users-guide p.12-13 "Decimal ↔ Fraction Conversion"): fraction ->
// decimal, or decimal -> fraction when the value is representable within the 10-digit limit.
// Returns the converted value (unchanged when no conversion is possible).
export function toggleFraction(value, state) {
  if (isFrac(value)) return value.den === 1 ? value.num : value.num / value.den;
  if (typeof value !== 'number' || Number.isInteger(value) || !Number.isFinite(value)) return value;
  const f = toFraction(value);
  if (!f) return value;
  const style = state && state.setup && state.setup.fracDisp === 'd/c' ? 'improper' : 'mixed';
  return fracText(f, style).fits ? f : value;
}

// continued-fraction search for a fraction equal to x at 10 significant digits
function toFraction(x) {
  const ax = Math.abs(x);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = ax;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > 1e10) return null;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(h1 / k1 - ax) <= 1e-12 * Math.max(1, ax)) return mkFrac(Math.sign(x) * h1, k1);
    const r = b - a;
    if (r < 1e-15) break;
    b = 1 / r;
  }
  return null;
}

// Memory helpers (users-guide p.17 "Independent Memory", "Variables").
export function storeVar(state, name, value) {
  if (!PLAIN_VARS.includes(name)) throw new CalcError(SYNTAX);
  state.vars[name] = state.mode === 'BASE' ? Math.trunc(toNum(value)) : value;
  return state.vars[name];
}
export function recallVar(state, name) {
  if (name === 'Ans') return state.ans;
  if (!PLAIN_VARS.includes(name)) throw new CalcError(SYNTAX);
  return state.vars[name] ?? 0;
}
// M+ (sign = +1) / M- (sign = -1). Per users-guide p.16 the added value also becomes Ans.
export function addToM(state, value, sign = 1) {
  const ev = new Evaluator(state);
  const cur = state.vars.M ?? 0;
  const m = state.mode === 'BASE'
    ? basen.check(Math.trunc(toNum(cur)) + sign * Math.trunc(toNum(value)), BASE_NUM[state.base] || 10)
    : ev.add(cur, value, sign < 0 ? '-' : '+');
  state.vars.M = m;
  state.ans = value;
  return m;
}
