// CMPLX mode helpers. Complex numbers are {re, im}. Angles in radians.
const ME = () => new Error('Math ERROR');
const ok = (z) => { if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) throw ME(); return { re: z.re + 0, im: z.im + 0 }; };
export const c = (re, im = 0) => ({ re, im });
export const add = (a, b) => ok({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a, b) => ok({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a, b) => ok({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export function div(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw ME();
  return ok({ re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d });
}
export const neg = (a) => ({ re: -a.re + 0, im: -a.im + 0 });
export const abs = (a) => Math.hypot(a.re, a.im);
export const arg = (a) => Math.atan2(a.im, a.re);
export const conj = (a) => ({ re: a.re, im: -a.im + 0 });
export const fromPolar = (r, theta) => ok({ re: r * Math.cos(theta), im: r * Math.sin(theta) });
export const toPolar = (a) => ({ r: abs(a), theta: arg(a) });
export const inv = (a) => div({ re: 1, im: 0 }, a);
export const sqr = (a) => mul(a, a);
export const cube = (a) => mul(sqr(a), a);
export function powInt(a, n) {
  if (!Number.isInteger(n)) throw ME();
  if (n < 0) return inv(powInt(a, -n));
  let r = { re: 1, im: 0 }, b = a, k = n;
  while (k > 0) { if (k & 1) r = mul(r, b); b = mul(b, b); k >>= 1; }
  return r;
}
export function sqrt(a) {
  const m = abs(a);
  const re = Math.sqrt((m + a.re) / 2);
  const im = Math.sqrt((m - a.re) / 2) * (a.im < 0 ? -1 : 1);
  return ok({ re, im });
}
export const exp = (a) => fromPolar(Math.exp(a.re), a.im);
export function ln(a) { if (a.re === 0 && a.im === 0) throw ME(); return ok({ re: Math.log(abs(a)), im: arg(a) }); }
export function pow(a, b) {
  if (a.re === 0 && a.im === 0) { if (b.re > 0) return { re: 0, im: 0 }; throw ME(); }
  return exp(mul(b, ln(a)));
}
export const real = (a) => a.re;
export const imag = (a) => a.im;
