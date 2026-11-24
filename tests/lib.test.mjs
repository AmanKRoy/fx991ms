import test from 'node:test';
import assert from 'node:assert/strict';
import * as cx from '../src/lib/complex.js';
import { sdStats, regStats, estimateX, estimateY } from '../src/lib/stats.js';
import { solveLinear, solveQuadratic, solveCubic } from '../src/lib/eqn.js';
import * as M from '../src/lib/matrix.js';
import * as V from '../src/lib/vector.js';
import * as B from '../src/lib/basen.js';
import { CONSTANTS } from '../src/lib/constants.js';
import { CONVERSIONS } from '../src/lib/conversions.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const nearArr = (a, b, tol) => { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], tol)); };
const ME = { message: 'Math ERROR' };

test('SD: manual example data 55,54,51,55,53,53,54,52 (users-guide p.27)', () => {
  const s = sdStats([55, 54, 51, 55, 53, 53, 54, 52].map((x) => ({ x })));
  assert.equal(s.n, 8); assert.equal(s.sumX, 427); assert.equal(s.sumX2, 22805);
  near(s.mean, 53.375); near(s.popSD, 1.316956719); near(s.sampleSD, 1.407885953);
});
test('SD: frequencies and errors', () => {
  const s = sdStats([{ x: 20, freq: 5 }, { x: 30, freq: 5 }]);
  assert.equal(s.n, 10); near(s.mean, 25); near(s.popSD, 5);
  assert.throws(() => sdStats([]).mean, ME);
  assert.throws(() => sdStats([{ x: 1 }]).sampleSD, ME);
  near(sdStats([{ x: 1 }]).popSD, 0);
});
test('REG Lin: pressure/temperature example (users-guide p.30)', () => {
  const rows = [[10, 1003], [15, 1005], [20, 1010], [25, 1011], [30, 1014]].map(([x, y]) => ({ x, y }));
  const s = regStats('Lin', rows);
  near(s.A, 997.4); near(s.B, 0.56); near(s.r, 0.982607368);
  near(estimateY('Lin', s, 18), 1007.48); near(estimateX('Lin', s, 1000), 4.642857143);
  near(s.r * s.r, 0.965517241);
  // sample covariance = (sumXY - sumX*sumY/n)/(n-1) = 35
  near((s.sumXY - s.sumX * s.sumY / s.n) / (s.n - 1), 35);
});
test('REG Quad: example (users-guide p.31)', () => {
  const rows = [[29, 1.6], [50, 23.5], [74, 38.0], [103, 46.4], [118, 48.0]].map(([x, y]) => ({ x, y }));
  const s = regStats('Quad', rows);
  near(s.A, -35.59856934); near(s.B, 1.495939413); near(s.C, -6.71629667e-3);
  near(estimateY('Quad', s, 16), -13.38291067);
  const e = estimateX('Quad', s, 20);
  near(e.x1, 47.14556728); near(e.x2, 175.5872105);
  assert.equal(s.r, undefined);
});
test('REG Log/Exp/Pwr/Inv: exact-fit data and frequency', () => {
  const xs = [1, 2, 3, 4, 5];
  const mk = (f) => xs.map((x) => ({ x, y: f(x) }));
  let s = regStats('Log', mk((x) => 2 + 3 * Math.log(x)));
  near(s.A, 2); near(s.B, 3); near(s.r, 1); near(estimateX('Log', s, 2 + 3 * Math.log(4)), 4);
  s = regStats('Exp', mk((x) => 2 * Math.exp(0.5 * x)));
  near(s.A, 2); near(s.B, 0.5); near(s.r, 1); near(estimateX('Exp', s, 2 * Math.exp(1.5)), 3);
  s = regStats('Pwr', mk((x) => 2 * x ** 1.5));
  near(s.A, 2); near(s.B, 1.5); near(estimateY('Pwr', s, 4), 16); near(estimateX('Pwr', s, 16), 4);
  s = regStats('Inv', mk((x) => 2 + 3 / x));
  near(s.A, 2); near(s.B, 3); near(estimateX('Inv', s, 3.5), 2);
  const a = regStats('Lin', [{ x: 1, y: 2, freq: 3 }, { x: 2, y: 4 }]);
  const b = regStats('Lin', [{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 4 }]);
  assert.equal(a.n, 4); near(a.B, b.B); near(a.sampleSDx, b.sampleSDx);
});
test('REG errors', () => {
  assert.throws(() => regStats('Log', [{ x: 0, y: 1 }]), ME);
  assert.throws(() => regStats('Exp', [{ x: 1, y: -1 }]), ME);
  assert.throws(() => regStats('Lin', [{ x: 1, y: 1 }]).B, ME);
  assert.throws(() => regStats('Lin', [{ x: 1, y: 1 }, { x: 1, y: 2 }]).A, ME);
  assert.throws(() => regStats('Lin', []).meanX, ME);
});

test('EQN cubic: x^3-2x^2-x+2 -> 2,-1,1 (users-guide p.23)', () => {
  nearArr(solveCubic(1, -2, -1, 2), [2, -1, 1]);
});
test('EQN quadratic: 8x^2-4x+5 -> 0.25 +/- 0.75i (users-guide p.24)', () => {
  const [x1, x2] = solveQuadratic(8, -4, 5);
  near(x1.re, 0.25); near(x1.im, 0.75); near(x2.re, 0.25); near(x2.im, -0.75);
  nearArr(solveQuadratic(1, -3, 2), [2, 1]);
  nearArr(solveQuadratic(1, 2, 1), [-1, -1]);
  assert.throws(() => solveQuadratic(0, 1, 1), ME);
});
test('EQN cubic: complex roots, repeated roots, polish', () => {
  const r = solveCubic(1, 0, 0, -1);
  near(r[0], 1); near(r[1].re, -0.5); near(r[1].im, Math.sqrt(3) / 2); near(r[2].im, -Math.sqrt(3) / 2);
  nearArr(solveCubic(1, 0, 0, 0), [0, 0, 0]);
  const d = solveCubic(1, 0, -3, 2).sort((a, b) => a - b); // (x-1)^2 (x+2)
  nearArr(d, [-2, 1, 1], 1e-7);
  nearArr(solveCubic(2, -12, 22, -12).sort(), [1, 2, 3].sort(), 1e-9);
  assert.throws(() => solveCubic(0, 1, 1, 1), ME);
});
test('EQN simultaneous: 3 unknowns (users-guide p.25) and 2 unknowns', () => {
  nearArr(solveLinear([[2, 3, -1, 15], [3, -2, 2, 4], [5, 3, -4, 9]]), [2, 5, 4]);
  nearArr(solveLinear([[1, 1, 3], [1, -1, 1]]), [2, 1]);
  assert.throws(() => solveLinear([[1, 2, 3], [2, 4, 6]]), ME);
  assert.throws(() => solveLinear([[1, 1, 1, 1], [2, 2, 2, 2], [1, 0, 0, 1]]), ME);
});

test('MAT: multiply, scalar, det, transpose, inverse, abs (users-guide E-16..18)', () => {
  const A = M.make([[1, 2], [4, 0], [-2, 5]]), Bm = M.make([[-1, 0, 3], [2, -4, 1]]);
  assert.deepEqual(M.mul(A, Bm).data, [[3, -8, 5], [-4, 0, 12], [12, -20, -1]]);
  assert.deepEqual(M.scale(M.make([[2, -1], [-5, 3]]), 3).data, [[6, -3], [-15, 9]]);
  assert.equal(M.det(M.make([[2, -1, 6], [5, 0, 1], [3, 2, 4]])), 73);
  assert.deepEqual(M.transpose(M.make([[5, 7, 4], [8, 9, 3]])).data, [[5, 8], [7, 9], [4, 3]]);
  const inv = M.inverse(M.make([[-3, 6, -11], [3, -4, 6], [4, -8, 13]]));
  const exp = [[-0.4, 1, -0.8], [-1.5, 0.5, -1.5], [-0.8, 0, -0.6]];
  inv.data.forEach((r, i) => nearArr(r, exp[i]));
  assert.deepEqual(M.abs(inv).data.map((r) => r.map((v) => +v.toFixed(9))), [[0.4, 1, 0.8], [1.5, 0.5, 1.5], [0.8, 0, 0.6]]);
  assert.deepEqual(M.power(M.make([[1, 1], [0, 1]]), 3).data, [[1, 3], [0, 1]]);
});
test('MAT errors', () => {
  const A = M.make([[1, 2], [3, 4]]), C = M.make([[1, 2, 3]]);
  assert.throws(() => M.add(A, C), { message: 'Dim ERROR' });
  assert.throws(() => M.mul(A, C), { message: 'Dim ERROR' });
  assert.throws(() => M.det(C), { message: 'Dim ERROR' });
  assert.throws(() => M.inverse(M.make([[1, 2], [2, 4]])), ME);
  assert.throws(() => M.make([[1, 2, 3, 4]]), { message: 'Dim ERROR' });
});

test('VCT: add, scale, dot, cross, abs, angle (users-guide E-19..22)', () => {
  assert.deepEqual(V.add(V.make([1, -2, 3]), V.make([4, 5, -6])).data, [5, 3, -3]);
  assert.deepEqual(V.sub(V.make([1, -2, 3]), V.make([4, 5, -6])).data, [-3, -7, 9]);
  const sc = V.scale(V.make([-7.8, 9]), 5); nearArr(sc.data, [-39, 45]);
  const a = V.make([-1, 0, 1]), b = V.make([1, 2, 0]);
  near(V.dot(a, b), -1);
  near(Math.acos(V.dot(a, b) / (V.abs(a) * V.abs(b))) * 180 / Math.PI, 108.4349488);
  const c = V.cross(a, b); nearArr(c.data, [-2, 1, -2]);
  nearArr(V.scale(c, 1 / V.abs(c)).data, [-0.666666666, 0.333333333, -0.666666666], 1e-8);
  assert.throws(() => V.add(V.make([1, 2]), V.make([1, 2, 3])), { message: 'Dim ERROR' });
});

test('BASE-N: manual ranges and examples (users-guide-2 E-11/12)', () => {
  assert.equal(B.format(B.add(B.parse('10111', 2), B.parse('11010', 2)), 2), '110001'); // ex 1
  assert.equal(B.format(B.div(B.parse('7654', 8), 12), 8), '516'); // ex 2
  assert.equal(B.format(B.or(B.parse('120', 16), B.parse('1101', 2)), 16), '12D'); // ex 3
  assert.equal(B.or(0x120, 13), 301);
  assert.equal(B.format(22, 2), '10110'); assert.equal(B.format(22, 8), '26'); assert.equal(B.format(22, 16), '16'); // ex 4
  assert.throws(() => B.format(513, 2), ME); // ex 5
  assert.equal(B.parse('1000000000', 2), -512); assert.equal(B.parse('1111111111', 2), -1);
  assert.equal(B.parse('0111111111', 2), 511);
  assert.equal(B.parse('4000000000', 8), -536870912); assert.equal(B.parse('3777777777', 8), 536870911);
  assert.equal(B.parse('80000000', 16), -2147483648); assert.equal(B.parse('7FFFFFFF', 16), 2147483647);
  assert.equal(B.format(-1, 2), '1111111111'); assert.equal(B.format(-1, 16), 'FFFFFFFF');
  assert.equal(B.format(-1, 8), '7777777777');
  assert.throws(() => B.parse('2', 2), { message: 'Syntax ERROR' });
  assert.throws(() => B.parse('1FFFFFFFF', 16), ME);
  assert.equal(B.parse('12.9', 10), 12);
});
test('BASE-N: logic and arithmetic', () => {
  assert.equal(B.and(12, 10), 8); assert.equal(B.xor(12, 10), 6); assert.equal(B.xnor(12, 10), ~6);
  assert.equal(B.not(0), -1); assert.equal(B.neg(5), -5); assert.equal(B.neg(-5), 5);
  assert.equal(B.div(-7, 2), -3);
  assert.throws(() => B.div(1, 0), ME);
  assert.throws(() => B.add(2147483647, 1), ME);
  assert.throws(() => B.neg(-2147483648), ME);
});

test('CMPLX', () => {
  const a = cx.c(1, 2), b = cx.c(3, -1);
  assert.deepEqual(cx.add(a, b), { re: 4, im: 1 });
  assert.deepEqual(cx.mul(a, b), { re: 5, im: 5 });
  const q = cx.div(a, b); near(q.re, 0.1); near(q.im, 0.7);
  near(cx.abs(cx.c(3, 4)), 5); near(cx.arg(cx.c(0, 1)), Math.PI / 2);
  assert.deepEqual(cx.conj(a), { re: 1, im: -2 });
  const p = cx.fromPolar(2, Math.PI / 2); near(p.re, 0, 1e-12); near(p.im, 2);
  assert.deepEqual(cx.powInt(cx.c(0, 1), 4), { re: 1, im: 0 });
  assert.deepEqual(cx.sqr(a), { re: -3, im: 4 }); assert.deepEqual(cx.cube(a), { re: -11, im: -2 });
  const s = cx.sqrt(cx.c(-4, 0)); near(s.re, 0, 1e-12); near(s.im, 2);
  const i = cx.inv(cx.c(0, 1)); near(i.im, -1);
  assert.throws(() => cx.div(a, cx.c(0, 0)), ME);
});

test('CONST: 40 entries in manual order', () => {
  assert.equal(CONSTANTS.length, 40);
  CONSTANTS.forEach((c, i) => assert.equal(c.no, i + 1));
  assert.equal(CONSTANTS[0].name, 'proton mass'); assert.equal(CONSTANTS[27].symbol, 'C0');
  assert.equal(CONSTANTS[39].name, 'standard atmosphere'); assert.equal(CONSTANTS[37].value, 273.15);
  // manual E-24: 65 kg * c^2 = 5.841908662e18 J
  near(65 * CONSTANTS[27].value ** 2, 5.841908662e18, 1e-9);
});
test('CONV: 40 entries in manual order, affine temperature', () => {
  assert.equal(CONVERSIONS.length, 40);
  CONVERSIONS.forEach((c, i) => assert.equal(c.no, i + 1));
  near(CONVERSIONS[0].convert(1), 2.54); near(CONVERSIONS[1].convert(2.54), 1);
  assert.equal(CONVERSIONS[37].from, '°C'); near(CONVERSIONS[37].convert(-31), -23.8); // manual E-22
  near(CONVERSIONS[36].convert(212), 100);
  assert.equal(CONVERSIONS[24].from, 'atm'); near(CONVERSIONS[24].convert(1), 101325);
  CONVERSIONS.forEach((c) => assert.ok(Number.isFinite(c.convert(10))));
});
