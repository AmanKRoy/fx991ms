// BASE-N mode. Values are plain JS integers (signed). Ranges per manual (E-11):
//  BIN 10 bits, OCT 10 digits (30 bits), DEC -2^31..2^31-1, HEX 8 digits (32 bits); negatives = two's complement.
// Converting a value outside the target base's range -> Error('Math ERROR') (manual Example 5).
const ME = () => new Error('Math ERROR');
const BITS = { 2: 10, 8: 30, 10: 32, 16: 32 };
const DIGITS = '0123456789ABCDEF';

export function range(base) {
  const b = BITS[base];
  if (!b) throw new Error('Arg ERROR');
  return { min: -(2 ** (b - 1)), max: 2 ** (b - 1) - 1 };
}
export function check(v, base = 10) {
  const { min, max } = range(base);
  if (!Number.isFinite(v) || v < min || v > max) throw ME();
  return v + 0;
}
// Parse digit string in base; decimal part is cut off; leading '-' allowed for DEC only.
export function parse(str, base) {
  let s = String(str).trim().toUpperCase();
  range(base);
  let neg = false;
  if (base === 10 && s[0] === '-') { neg = true; s = s.slice(1); }
  const dot = s.indexOf('.');
  if (dot >= 0) s = s.slice(0, dot);
  if (s === '') return 0;
  let v = 0;
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new Error('Syntax ERROR');
    v = v * base + d;
  }
  if (base === 10) return check(neg ? -v : v, 10);
  const bits = BITS[base];
  if (s.length > (base === 2 ? 10 : base === 8 ? 10 : 8)) throw ME();
  if (v >= 2 ** bits) throw ME();
  if (v >= 2 ** (bits - 1)) v -= 2 ** bits; // two's complement
  return v;
}
export function format(v, base) {
  check(v, base);
  v = Math.trunc(v);
  if (base === 10) return String(v);
  const bits = BITS[base];
  const u = v < 0 ? v + 2 ** bits : v;
  return u.toString(base).toUpperCase();
}
const i32 = (v) => check(v, 10) | 0;
export const and = (a, b) => i32(a) & i32(b);
export const or = (a, b) => i32(a) | i32(b);
export const xor = (a, b) => i32(a) ^ i32(b);
export const xnor = (a, b) => ~(i32(a) ^ i32(b));
export const not = (a) => ~i32(a);
export const neg = (a) => check(-i32(a), 10);
export const add = (a, b) => check(a + b, 10);
export const sub = (a, b) => check(a - b, 10);
export const mul = (a, b) => check(a * b, 10);
export function div(a, b) { if (b === 0) throw ME(); return check(Math.trunc(a / b), 10); }
