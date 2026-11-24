// EQN mode: simultaneous linear equations, quadratic, cubic. Pure functions.
// Roots are numbers or {re, im}. Quadratic: x1=(-b+sqrt(D))/2a first (manual: 8x^2-4x+5 -> 0.25+0.75i first).
// Cubic: 3 real roots ordered largest, smallest, middle (matches manual x^3-2x^2-x+2 -> 2,-1,1);
// 1 real + complex pair -> [real, re+im i, re-im i] (im > 0 for first of the pair when possible).

const ME = () => new Error('Math ERROR');
const EPS_IM = 1e-12;

export function solveLinear(rows) {
  const n = rows.length;
  if ((n !== 2 && n !== 3) || rows.some((r) => r.length !== n + 1)) throw new Error('Arg ERROR');
  const m = rows.map((r) => r.slice());
  let scale = 0;
  for (const r of m) for (const v of r.slice(0, n)) scale = Math.max(scale, Math.abs(v));
  if (scale === 0) throw ME();
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    if (Math.abs(m[p][i]) <= 1e-13 * scale) throw ME();
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = i + 1; k < n; k++) {
      const f = m[k][i] / m[i][i];
      for (let j = i; j <= n; j++) m[k][j] -= f * m[i][j];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n];
    for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x.map((v) => v + 0);
}

export function solveQuadratic(a, b, c) {
  if (a === 0) throw ME();
  const D = b * b - 4 * a * c;
  if (D >= 0) {
    const s = Math.sqrt(D);
    const q = -(b + (b < 0 ? -s : s)) / 2;
    if (q === 0) return [0, 0];
    const rq = q / a, rc = c / q; // rq pairs with sign(b)*s
    // x1 uses +sqrt(D)
    return b >= 0 ? [rc + 0, rq + 0] : [rq + 0, rc + 0];
  }
  const re = -b / (2 * a) + 0, im = Math.sqrt(-D) / (2 * a);
  return [{ re, im }, { re, im: -im }];
}

export function solveCubic(a, b, c, d) {
  if (a === 0) throw ME();
  const B = b / a, C = c / a, D = d / a;
  const f = (x) => ((x + B) * x + C) * x + D;
  const fp = (x) => (3 * x + 2 * B) * x + C;
  const polish = (x) => {
    for (let i = 0; i < 4; i++) {
      const df = fp(x);
      if (df === 0) break;
      const nx = x - f(x) / df;
      if (!Number.isFinite(nx) || Math.abs(f(nx)) > Math.abs(f(x))) break;
      x = nx;
    }
    return x;
  };
  const shift = B / 3;
  const p = C - B * B / 3;
  const q = 2 * B * B * B / 27 - B * C / 3 + D;
  const h = (q / 2) ** 2, g = (p / 3) ** 3;
  const disc = h + g;
  const tol = 1e-12 * Math.max(Math.abs(h), Math.abs(g));
  let reals;
  if (p === 0 && q === 0) {
    return [-shift + 0, -shift + 0, -shift + 0];
  } else if (Math.abs(disc) <= tol) {
    const simple = 3 * q / p, dbl = -3 * q / (2 * p);
    reals = [simple - shift, dbl - shift, dbl - shift];
    reals.sort((u, v) => v - u);
    // keep largest-first but simple root order irrelevant
    return reals.map((v) => v + 0);
  } else if (disc < 0) {
    const m = 2 * Math.sqrt(-p / 3);
    let arg = (3 * q / (p * m));
    arg = Math.max(-1, Math.min(1, arg));
    const th = Math.acos(arg) / 3;
    reals = [0, 1, 2].map((k) => polish(m * Math.cos(th + 2 * Math.PI * k / 3) - shift));
    return reals.map((v) => v + 0);
  }
  // one real root (Cardano)
  const sq = Math.sqrt(disc);
  const u = Math.cbrt(-q / 2 + sq), v = Math.cbrt(-q / 2 - sq);
  const r = polish(u + v - shift);
  // deflate: x^2 + (B + r) x + (C + r (B + r))
  const qb = B + r, qc = C + r * qb;
  const Dq = qb * qb - 4 * qc;
  if (Dq >= 0) { // numerically real after all
    const s = Math.sqrt(Dq);
    return [r, (-qb + s) / 2, (-qb - s) / 2].map((x) => x + 0);
  }
  const re = -qb / 2 + 0, im = Math.sqrt(-Dq) / 2;
  if (im < EPS_IM * Math.max(1, Math.abs(re))) return [r, re, re];
  return [r + 0, { re, im }, { re, im: -im }];
}
