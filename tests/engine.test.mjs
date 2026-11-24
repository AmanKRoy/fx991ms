// Engine tests. Worked examples from docs/manual/users-guide.txt ("UG p.N") and
// docs/manual/users-guide-2-additional.txt ("UG2 p.N"). Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, evaluate, format, toggleFraction, variablesIn, solve, storeVar, recallVar, addToM, CalcError,
} from '../src/engine/index.js';

// "2 × ( 3" -> ['2','×','(','3']; multi-digit numbers are written digit by digit ("1 2" = 12)
const T = (s) => s.trim().split(/\s+/);
// numbers: each char of a token run like "1.23" is split into digit tokens
const toks = (s) => T(s).flatMap((w) => (/^[0-9.]+$/.test(w) ? w.split('') : [w]));

function st(setup = {}, extra = {}) {
  const s = createState();
  Object.assign(s.setup, setup);
  Object.assign(s, extra);
  return s;
}
function calc(expr, s = st()) { const r = evaluate(toks(expr), s); return r.results[r.results.length - 1]; }
// display string: sign + main + (exp ? 'e'+exp : '') + (engSym)
function shown(v, s, view = {}) {
  const f = format(v, s, view);
  return (f.neg ? '-' : '') + f.main + (f.exp !== null ? 'e' + f.exp : '') + (f.indicators.engSym || '');
}
const disp = (expr, s = st(), view = {}) => shown(calc(expr, s), s, view);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const throwsMsg = (fn, msg) => assert.throws(fn, (e) => e instanceof CalcError && e.message === msg);

// ---------------- COMP basics ----------------
test('UG p.10 multi-statement 2+3 : Ans×4', () => {
  const s = st();
  const r = evaluate(toks('2 + 3 : Ans × 4'), s);
  assert.deepEqual(r.results, [5, 20]);
  assert.equal(s.ans, 20);
});

test('UG p.11 arithmetic examples', () => {
  assert.equal(disp('3 × ( 5 EXP neg 9 )'), '1.5e-08');
  assert.equal(disp('5 × ( 9 + 7'), '80.'); // closing ) may be skipped before =
  assert.equal(disp('1 + 2 × 3'), '7.');
});

test('UG p.34-35 order of operations', () => {
  assert.equal(calc('( neg 2 ) ^ 4'), 16);
  assert.equal(calc('neg 2 ^ 4'), -16);
  assert.equal(calc('neg 2 x²'), -4);
  near(calc('1 ÷ 2 π'), 1 / (2 * Math.PI));           // implied × before π binds tighter than ÷
  assert.equal(calc('2 sin 3 0'), 1);                    // 2·sin30
  assert.equal(calc('2 ( 3 + 4 )'), 14);
  assert.equal(calc('2 ^ 3 ^ 2'), 64);                   // left to right
  near(calc('sin 3 0 + 1'), 1.5);                        // sin auto-closes
  assert.equal(calc('3 nPr 2 × 2'), 12);
  near(calc('e^ ln √ 1 2 0'), Math.sqrt(120));
  const s = st(); s.vars.A = 3; s.vars.B = 4;
  assert.equal(calc('A B', s), 12);
  assert.equal(calc('2 A', s), 6);
});

// ---------------- fractions ----------------
test('UG p.12 fraction calculations', () => {
  assert.equal(disp('2 frac 3 + 1 frac 5'), '13┘15');
  assert.equal(disp('3 frac 1 frac 4 + 1 frac 2 frac 3'), '4┘11┘12');
  assert.equal(disp('2 frac 4'), '1┘2');
  assert.equal(disp('1 frac 2 + 1.6'), '2.1');          // mixed with decimal -> decimal
  assert.equal(disp('1 frac 2 + 1 frac 2'), '1.');
});

test('UG p.12-13 decimal <-> fraction and mixed <-> improper', () => {
  const s = st();
  const v = calc('2.75', s);
  assert.equal(shown(v, s), '2.75');
  const f = toggleFraction(v, s);
  assert.equal(shown(f, s), '2┘3┘4');
  assert.equal(shown(f, s, { frac: 'improper' }), '11┘4');
  const h = calc('1 frac 2', s);
  assert.equal(shown(h, s), '1┘2');
  const d = toggleFraction(h, s);
  assert.equal(shown(d, s), '0.5');
  assert.equal(shown(toggleFraction(d, s), s), '1┘2');
  const m = calc('1 frac 2 frac 3', s);
  assert.equal(shown(m, s), '1┘2┘3');
  assert.equal(shown(m, s, { frac: 'improper' }), '5┘3');
  assert.equal(shown(m, st({ fracDisp: 'd/c' })), '5┘3');
  assert.equal(shown(toggleFraction(Math.PI, s), s), '3.141592654'); // not representable
});

test('UG p.12 fraction exceeding 10 digits shows decimal; UG p.13 mixed input in d/c is an error', () => {
  assert.equal(disp('1 frac 1 2 3 4 5 + 1 frac 6 7 8 9 1'), '9.573394811e-05');
  assert.equal(disp('1 2 3 4 5 frac 6 7 8 9 1'), '0.181835589');
  throwsMsg(() => calc('1 frac 2 frac 3', st({ fracDisp: 'd/c' })), 'Syntax ERROR');
  assert.equal(disp('5 frac 3', st({ fracDisp: 'd/c' })), '5┘3');
});

// ---------------- percentages (UG p.14) ----------------
test('UG p.14 percentage examples', () => {
  assert.equal(calc('1 5 0 0 × 1 2 %'), 180);
  assert.equal(calc('6 6 0 ÷ 8 8 0 %'), 75);
  assert.equal(calc('2 5 0 0 × 1 5 % +'), 2875);
  assert.equal(calc('3 5 0 0 × 2 5 % -'), 2625);
  const s = st();
  calc('1 6 8 + 9 8 + 7 3 4 STO A', s);
  assert.equal(calc('A × 2 0 % -', s), 800);
  assert.equal(calc('3 0 0 + 5 0 0 %'), 160);
  assert.equal(calc('4 6 - 4 0 %'), 15);
  assert.equal(calc('4 8 - 4 0 %'), 20);
});

// ---------------- DMS (UG p.15, p.18) ----------------
test('UG p.15 sexagesimal', () => {
  const s = st();
  assert.equal(shown(calc('2.258', s), s, { dms: true }), '2°15°28.8');
  const r = evaluate(toks('1 2 dms 3 4 dms 5 6 dms × 3.45'), s);
  assert.deepEqual(r.views[0], { dms: true });
  assert.equal(shown(r.results[0], s, r.views[0]), '43°24°31.2');
  near(calc('sin 6 3 dms 5 2 dms 4 1 dms'), 0.897859012);
});

// ---------------- Fix / Sci / Rnd / Norm (UG p.10, p.15-16) ----------------
test('UG p.15 Fix 3 and Rnd', () => {
  const s = st({ disp: 'Fix', fix: 3 });
  assert.equal(disp('2 0 0 ÷ 7 × 1 4', s), '400.000');
  assert.equal(disp('2 0 0 ÷ 7', s), '28.571');
  assert.equal(disp('Ans × 1 4', s), '400.000');      // internal precision kept
  calc('2 0 0 ÷ 7', s);
  calc('Rnd( Ans', s);
  assert.equal(disp('Ans × 1 4', s), '399.994');
});

test('UG p.16 Sci 2: 1÷3 = 3.3e-01; Sci 0 = 10 digits', () => {
  assert.equal(disp('1 ÷ 3', st({ disp: 'Sci', sci: 2 })), '3.3e-01');
  assert.equal(disp('1 ÷ 3', st({ disp: 'Sci', sci: 0 })), '3.333333333e-01');
  assert.equal(disp('1 2 3', st({ disp: 'Sci', sci: 4 })), '1.230e02');
});

test('UG p.10 Norm 1 / Norm 2 thresholds, separators, comma', () => {
  assert.equal(disp('1 ÷ 2 0 0'), '5.e-03');
  assert.equal(disp('1 ÷ 2 0 0', st({ norm: 2 })), '0.005');
  assert.equal(disp('1 ÷ 2 0 0 0 0 0 0 0 0 0', st({ norm: 2 })), '5.e-10');
  assert.equal(disp('1 ÷ 5 0'), '0.02');
  assert.equal(disp('9 9 9 9 9 9 9 9 9 9'), '9,999,999,999.');
  assert.equal(disp('9 9 9 9 9 9 9 9 9 9 + 1'), '1.e10');
  assert.equal(disp('1 2 3 4.5', st({ dot: 'Comma' })), '1.234,5');
  assert.equal(disp('2 ÷ 3'), '0.666666666'); // UG2 p.22 shows -0.666666666 for -2/3
  assert.equal(disp('3 π'), '9.424777961');
  assert.equal(disp('1 - 0.9 - 0.1'), '0.');
  assert.equal(disp('0.1 + 0.2'), '0.3');
});

test('UG p.22 ENG display and UG2 p.7 engineering symbols', () => {
  const s = st();
  assert.equal(shown(calc('5 6 0 8 8', s), s, { eng: 0 }), '56.088e03');
  assert.equal(shown(calc('0.0 8 1 2 5', s), s, { eng: 0 }), '81.25e-03');
  assert.equal(shown(56088, s, { eng: -1 }), '0.056088e06');
  assert.equal(shown(56088, s, { eng: 1 }), '56,088.e00');
  const e = st({ eng: true });
  assert.equal(disp('9 ÷ 1 0', e), '900.m');
  assert.equal(calc('9 eng:m × 2', e), 0.018);
  throwsMsg(() => calc('9 eng:m'), 'Syntax ERROR');
});

// ---------------- memory (UG p.16-17) ----------------
test('UG p.17 independent memory and variables', () => {
  const s = st();
  addToM(s, calc('2 3 + 9', s), +1);
  addToM(s, calc('5 3 - 6', s), +1);
  addToM(s, calc('4 5 × 2', s), -1);
  assert.equal(recallVar(s, 'M'), -11);
  storeVar(s, 'A', 193.2);
  assert.equal(calc('A ÷ 2 3', s), 8.4);
  assert.equal(calc('A ÷ 2 8', s), 6.9);
  assert.deepEqual(evaluate(toks('5 STO B : B × 2'), s).results, [5, 10]);
});

// ---------------- scientific functions (UG p.18-21) ----------------
test('UG p.18-19 trig / hyperbolic / logs', () => {
  assert.equal(disp('cos ( π ÷ 3', st({ angle: 'Rad' })), '0.5');
  assert.equal(disp('acos ( √ 2 ÷ 2', st({ angle: 'Rad' })), '0.785398163');
  assert.equal(disp('atan 0.741'), '36.53844577');
  assert.equal(disp('sinh 3.6'), '18.28545536');
  assert.equal(disp('asinh 3 0'), '4.094622224');
  assert.equal(disp('log 1.23'), '0.089905111');
  assert.equal(disp('ln 9 0'), '4.49980967');
  assert.equal(disp('ln e'), '1.');
  assert.equal(disp('e^ 1 0'), '22,026.46579');
  assert.equal(disp('10^ 1.5'), '31.6227766');
  assert.equal(disp('2 ^ 4'), '16.');
  assert.equal(calc('sin 1 8 0'), 0);
  assert.equal(calc('cos 9 0'), 0);
  assert.equal(calc('tan 4 5'), 1);
  assert.equal(calc('sin π', st({ angle: 'Rad' })), 0);
  assert.equal(calc('sin 1 0 0', st({ angle: 'Gra' })), 1);
  throwsMsg(() => calc('tan 9 0'), 'Math ERROR');
});

test('UG p.20 roots, powers, factorial, nPr/nCr, π', () => {
  assert.equal(disp('√ 2 + √ 3 × √ 5'), '5.287196909');
  assert.equal(disp('cbrt 5 + cbrt neg 2 7'), '-1.290024053');
  assert.equal(disp('7 xroot 1 2 3'), '1.988647795');
  assert.equal(disp('1 2 3 + 3 0 x²'), '1,023.');
  assert.equal(disp('1 2 x³'), '1,728.');
  assert.equal(disp('( 3 x⁻¹ - 4 x⁻¹ ) x⁻¹'), '12.');
  assert.equal(disp('8 !'), '40,320.');
  assert.equal(disp('3 π'), '9.424777961');
  assert.equal(disp('7 nPr 4'), '840.');
  assert.equal(disp('1 0 nCr 4'), '210.');
  const r = calc('Ran#');
  assert.ok(r >= 0 && r < 1 && Math.round(r * 1000) === r * 1000);
});

test('UG p.21 angle unit conversion and Pol/Rec (results in E, F)', () => {
  assert.equal(disp('4.25 r'), '243.5070629');
  const s = st();
  assert.equal(disp('Rec( 2 , 6 0 )', s), '1.');
  assert.equal(shown(recallVar(s, 'F'), s), '1.732050808');
  const r = st({ angle: 'Rad' });
  assert.equal(disp('Pol( 1 , √ 3 )', r), '2.');
  assert.equal(shown(recallVar(r, 'F'), r), '1.047197551');
  assert.equal(recallVar(r, 'E'), 2);
});

test('UG p.32-37 errors', () => {
  throwsMsg(() => calc('1 ÷ 0'), 'Math ERROR');
  throwsMsg(() => calc('1 +'), 'Syntax ERROR');
  throwsMsg(() => calc('7 0 !'), 'Math ERROR');
  throwsMsg(() => calc('asin 2'), 'Math ERROR');
  throwsMsg(() => calc('√ neg 1'), 'Math ERROR');
  throwsMsg(() => calc('10^ 9 9 × 1 0'), 'Math ERROR');
  throwsMsg(() => calc('( 1 + 2 ) )'), 'Syntax ERROR');
  throwsMsg(() => calc('× 2'), 'Syntax ERROR');
  throwsMsg(() => calc('0 ^ 0'), 'Math ERROR');
  assert.equal(calc('( neg 8 ) ^ ( 1 ÷ 3 )'), -2);
  try { calc('1 + 2 ÷ 0'); } catch (e) { assert.equal(typeof e.pos, 'number'); }
  // Ans not updated on error (UG p.17)
  const s = st(); calc('5', s);
  assert.throws(() => calc('1 ÷ 0', s));
  assert.equal(s.ans, 5);
});

// ---------------- statistics (UG p.26-31, UG2 p.12-13) ----------------
const sdData = [55, 54, 51, 55, 53, 53, 54, 52].map((x) => ({ x, freq: 1 }));
test('UG p.26 SD mode statistics', () => {
  const s = st({}, { mode: 'SD' });
  s.stat.sd = sdData;
  assert.equal(disp('xσn-1', s), '1.407885953');
  assert.equal(disp('xσn', s), '1.316956719');
  assert.equal(disp('x̄', s), '53.375');
  assert.equal(disp('n', s), '8.');
  assert.equal(disp('Σx', s), '427.');
  assert.equal(disp('Σx²', s), '22,805.');
  throwsMsg(() => calc('x̄'), 'Syntax ERROR'); // COMP mode
});

test('UG2 p.13 normal distribution', () => {
  const s = st({}, { mode: 'SD' });
  s.stat.sd = sdData;
  assert.equal(disp('5 3 >t', s), '-0.284747398'); // sign lost in the text extraction
  near(calc('P( neg 0.28 )', s), 0.38974, 1e-5);
  near(calc('R( 0 )', s), 0.5);
  near(calc('Q( 1 )', s), 0.341344746);
});

test('UG p.30 linear regression', () => {
  const s = st({}, { mode: 'REG', regType: 'Lin' });
  s.stat.reg = [[10, 1003], [15, 1005], [20, 1010], [25, 1011], [30, 1014]].map(([x, y]) => ({ x, y, freq: 1 }));
  assert.equal(disp('regA', s), '997.4');
  assert.equal(disp('regB', s), '0.56');
  assert.equal(disp('regr', s), '0.982607368');
  assert.equal(disp('1 8 ŷ', s), '1,007.48');
  assert.equal(disp('1 0 0 0 x̂', s), '4.642857143');
  assert.equal(disp('regr x²', s), '0.965517241');
  // sample covariance (Σxy - n·x̄·ȳ)/(n-1) = 35
  assert.equal(disp('( Σxy - n x̄ ȳ ) ÷ ( n - 1 )', s), '35.');
});

test('UG p.31 quadratic regression', () => {
  const s = st({}, { mode: 'REG', regType: 'Quad' });
  s.stat.reg = [[29, 1.6], [50, 23.5], [74, 38.0], [103, 46.4], [118, 48.0]].map(([x, y]) => ({ x, y, freq: 1 }));
  assert.equal(disp('regA', s), '-35.59856934');
  assert.equal(disp('regB', s), '1.495939413');
  assert.equal(disp('regC', s), '-6.71629667e-03');
  assert.equal(disp('1 6 ŷ', s), '-13.38291067');
  assert.equal(disp('2 0 x̂1', s), '47.14556728');
  assert.equal(disp('2 0 x̂2', s), '175.5872105');
});

// ---------------- CALC / SOLVE (UG2 p.5-6) ----------------
test('UG2 p.5 CALC: Y = X² + 3X - 12', () => {
  const s = st();
  const line = toks('Y = X x² + 3 X - 1 2');
  assert.deepEqual(variablesIn(line), ['X']);
  storeVar(s, 'X', 7);
  assert.equal(evaluate(line, s).results[0], 58);
  assert.equal(recallVar(s, 'Y'), 58);
  storeVar(s, 'X', 8);
  assert.equal(evaluate(line, s).results[0], 76);
});

test('UG2 p.5-6 SOLVE: B = AC - ½DC², B=14 C=2 D=9.8 -> A = 16.8', () => {
  const s = st();
  const line = toks('B = A C - ( 1 ÷ 2 ) D C x²');
  assert.deepEqual(variablesIn(line, { solve: true }), ['B', 'A', 'C', 'D']);
  storeVar(s, 'B', 14); storeVar(s, 'C', 2); storeVar(s, 'D', 9.8);
  const a = solve(line, 'A', 0, s);
  assert.equal(shown(a, s), '16.8');
  assert.equal(recallVar(s, 'A'), a);
  // expression without '=' is solved for expr = 0
  near(solve(toks('X x² - 2'), 'X', 1, s), Math.SQRT2);
  near(solve(toks('cos X - X'), 'X', 1, st({ angle: 'Rad' })), 0.739085133);
  throwsMsg(() => solve(toks('X x² + 1'), 'X', 1, st()), "Can't Solve");
});

// ---------------- calculus (UG2 p.13-14) ----------------
test('UG2 p.13 d/dx(3X²-5X+2, 2, 2E-4) = 7', () => {
  assert.equal(disp('d/dx( 3 X x² - 5 X + 2 , 2 , 2 EXP neg 4 )'), '7.');
  assert.equal(disp('d/dx( 3 X x² - 5 X + 2 , 2'), '7.');
  assert.equal(disp('d/dx( sin X , 0 )', st({ angle: 'Rad' })), '1.');
});

test('UG2 p.14 ∫(2X²+3X+8, 1, 5, 6) = 150.6666667', () => {
  assert.equal(disp('∫( 2 X x² + 3 X + 8 , 1 , 5 , 6 )'), '150.6666667');
  assert.equal(disp('∫( 2 X x² + 3 X + 8 , 1 , 5'), '150.6666667');
  assert.equal(disp('∫( sin X , 0 , π )', st({ angle: 'Rad' })), '2.');
  throwsMsg(() => calc('∫( X , 0 , 1 , 1 0 )'), 'Arg ERROR');
  const s = st(); s.vars.X = 42; calc('∫( X , 0 , 1 )', s);
  assert.equal(s.vars.X, 42);
});

// ---------------- CMPLX (UG2 p.8-10) ----------------
test('UG2 p.8-10 complex numbers', () => {
  const s = st({}, { mode: 'CMPLX' });
  const z = calc('( 2 + 3 i ) + ( 4 + 5 i )', s);
  assert.deepEqual(z, { re: 6, im: 8 });
  assert.equal(shown(z, s), '6.');
  assert.equal(shown(z, s, { complexPart: 'im' }), '8.');
  assert.equal(format(z, s).indicators.RI, true);
  assert.equal(calc('Abs( 3 + 4 i )', s), 5);
  assert.equal(disp('arg( 3 + 4 i )', s), '53.13010235');
  const p = calc('√ 2 ∠ 4 5', s);
  near(p.re, 1); near(p.im, 1);
  const q = calc('1 + i >r∠θ', s);
  assert.equal(shown(q, s), '1.414213562');
  assert.equal(shown(q, s, { complexPart: 'im' }), '45.');
  const c = calc('Conjg( 1.23 + 2.34 i )', s);
  assert.deepEqual(c, { re: 1.23, im: -2.34 });
  assert.deepEqual(calc('( 1 + i ) x²', s), { re: 0, im: 2 });
  assert.deepEqual(calc('( 1 + i ) ÷ ( 1 - i )', s), { re: 0, im: 1 });
  throwsMsg(() => calc('2 i'), 'Syntax ERROR'); // i only in CMPLX
});

// ---------------- BASE-N (UG2 p.10-12) ----------------
test('UG2 p.11-12 base-n examples', () => {
  const bin = st({}, { mode: 'BASE', base: 'BIN' });
  assert.equal(disp('1 0 1 1 1 + 1 1 0 1 0', bin), '110001.');
  const oct = st({}, { mode: 'BASE', base: 'OCT' });
  assert.equal(disp('o 7 6 5 4 ÷ d 1 2', oct), '516.');
  const hex = st({}, { mode: 'BASE', base: 'HEX' });
  const v = calc('1 2 0 or b 1 1 0 1', hex);
  assert.equal(shown(v, hex), '12D.');
  assert.equal(shown(v, { ...hex, base: 'DEC' }), '301.');
  const v22 = calc('d 2 2', bin);
  assert.equal(shown(v22, bin), '10110.');
  assert.equal(shown(v22, { ...bin, base: 'OCT' }), '26.');
  assert.equal(shown(v22, { ...bin, base: 'HEX' }), '16.');
  throwsMsg(() => calc('d 5 1 3', bin), 'Math ERROR');
  assert.equal(calc('F F + A', hex), 265);
  assert.equal(shown(calc('Not( 0 )', hex), hex), 'FFFFFFFF.');
  assert.equal(shown(calc('Neg( 1 )', bin), bin), '1111111111.');
  assert.equal(calc('7 ÷ 2', st({}, { mode: 'BASE', base: 'DEC' })), 3);
  throwsMsg(() => calc('2 1', bin), 'Syntax ERROR');
  throwsMsg(() => calc('sin 3', bin), 'Syntax ERROR');
});

// ---------------- MAT (UG2 p.15-18) ----------------
test('UG2 p.16-18 matrices', () => {
  const s = st({}, { mode: 'MAT' });
  s.mat.A = { rows: 3, cols: 2, data: [[1, 2], [4, 0], [-2, 5]] };
  s.mat.B = { rows: 2, cols: 3, data: [[-1, 0, 3], [2, -4, 1]] };
  assert.deepEqual(calc('MatA × MatB', s).data, [[3, -8, 5], [-4, 0, 12], [12, -20, -1]]);
  assert.deepEqual(s.mat.Ans.data, [[3, -8, 5], [-4, 0, 12], [12, -20, -1]]);
  s.mat.C = { rows: 2, cols: 2, data: [[2, -1], [-5, 3]] };
  assert.deepEqual(calc('3 MatC', s).data, [[6, -3], [-15, 9]]);
  s.mat.A = { rows: 3, cols: 3, data: [[2, -1, 6], [5, 0, 1], [3, 2, 4]] };
  assert.equal(calc('Det MatA', s), 73);
  s.mat.B = { rows: 2, cols: 3, data: [[5, 7, 4], [8, 9, 3]] };
  assert.deepEqual(calc('Trn MatB', s).data, [[5, 8], [7, 9], [4, 3]]);
  s.mat.C = { rows: 3, cols: 3, data: [[-3, 6, -11], [3, -4, 6], [4, -8, 13]] };
  const inv = calc('MatC x⁻¹', s).data.flat();
  [-0.4, 1, -0.8, -1.5, 0.5, -1.5, -0.8, 0, -0.6].forEach((v, i) => near(inv[i], v));
  const ab = calc('Abs( MatAns )', s).data.flat();
  [0.4, 1, 0.8, 1.5, 0.5, 1.5, 0.8, 0, 0.6].forEach((v, i) => near(ab[i], v));
  throwsMsg(() => calc('MatA + MatB', s), 'Dim ERROR');
});

// ---------------- VCT (UG2 p.19-22) ----------------
test('UG2 p.19-22 vectors', () => {
  const s = st({}, { mode: 'VCT' });
  s.vct.A = { dim: 3, data: [1, -2, 3] };
  s.vct.B = { dim: 3, data: [4, 5, -6] };
  s.vct.C = { dim: 2, data: [-7.8, 9] };
  assert.deepEqual(calc('VctA + VctB', s).data, [5, 3, -3]);
  assert.deepEqual(calc('5 VctC', s).data, [-39, 45]);
  assert.equal(calc('VctA · VctB', s), -24);
  assert.deepEqual(calc('VctA × VctB', s).data, [-3, 18, 13]);
  assert.equal(disp('Abs( VctC )', s), '11.90965994');
  s.vct.A = { dim: 3, data: [-1, 0, 1] };
  s.vct.B = { dim: 3, data: [1, 2, 0] };
  calc('VctA · VctB', s);
  calc('Ans ÷ ( Abs( VctA ) Abs( VctB ) )', s);
  assert.equal(disp('acos Ans', s), '108.4349488');
  calc('VctA × VctB', s);
  calc('Abs( VctAns )', s);
  const u = calc('VctAns ÷ Ans', s).data;
  [-2 / 3, 1 / 3, -2 / 3].forEach((v, i) => near(u[i], v));
  throwsMsg(() => calc('VctA + VctC', s), 'Dim ERROR');
});

// ---------------- CONST / CONV (UG2 p.22-25) ----------------
test('UG2 p.23-24 constants and p.22 conversions', () => {
  assert.equal(disp('6 5 const:28 x²'), '5.841908662e18');
  assert.equal(disp('( neg 3 1 ) conv:38'), '-23.8');
});

test('format handles BASE, matrix, negative and zero values', () => {
  const s = st();
  assert.deepEqual(format(-2.5, s), { main: '2.5', exp: null, neg: true, indicators: {} });
  assert.equal(shown(0, s), '0.');
  assert.equal(shown(-1.5e-20, s), '-1.5e-20');
  assert.equal(shown(1.2345678912e50, s), '1.234567891e50');
  assert.equal(shown(0, st({ disp: 'Fix', fix: 2 })), '0.00');
  assert.equal(shown(123456789.123, st({ disp: 'Fix', fix: 4 })), '123,456,789.1');
});
