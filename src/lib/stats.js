// SD and REG statistics for fx-991MS emulator. Pure functions.
// Manual: docs/manual/users-guide.txt "Standard Deviation" / "Regression Calculations".
// Note: for Log/Exp/Pwr/Inv the sums, means and SDs are those of the TRANSFORMED data
// (x'=ln x / 1/x, y'=ln y), exactly as the real calculator reports them.
// Derived values (mean, SDs, A, B, C, r) are non-enumerable getters that throw
// Error('Math ERROR') when the calculator would (n=0, n=1 sample SD, zero variance...).

const ME = () => new Error('Math ERROR');

function lazy(obj, name, fn) {
  Object.defineProperty(obj, name, {
    enumerable: false,
    configurable: true,
    get() { const v = fn(); if (typeof v === 'number' && !Number.isFinite(v)) throw ME(); return v; },
  });
}

const freqOf = (r) => (r.freq === undefined || r.freq === null ? 1 : r.freq);

export function sdStats(rows) {
  let n = 0, sx = 0, sx2 = 0;
  for (const r of rows) { const f = freqOf(r); n += f; sx += f * r.x; sx2 += f * r.x * r.x; }
  const out = { n, sumX: sx, sumX2: sx2 };
  const varN = () => {
    if (n <= 0) throw ME();
    let s = 0; const m = sx / n;
    for (const r of rows) s += freqOf(r) * (r.x - m) * (r.x - m);
    return s;
  };
  lazy(out, 'mean', () => { if (n <= 0) throw ME(); return sx / n; });
  lazy(out, 'popSD', () => Math.sqrt(Math.max(0, varN()) / n));
  lazy(out, 'sampleSD', () => { if (n <= 1) throw ME(); return Math.sqrt(Math.max(0, varN()) / (n - 1)); });
  return out;
}

const TYPES = ['lin', 'log', 'exp', 'pwr', 'inv', 'quad'];
function norm(type) {
  const t = String(type).toLowerCase();
  if (!TYPES.includes(t)) throw new Error('Arg ERROR');
  return t;
}
const tx = (t, x) => {
  if (t === 'log' || t === 'pwr') { if (x <= 0) throw ME(); return Math.log(x); }
  if (t === 'inv') { if (x === 0) throw ME(); return 1 / x; }
  return x;
};
const ty = (t, y) => {
  if (t === 'exp' || t === 'pwr') { if (y <= 0) throw ME(); return Math.log(y); }
  return y;
};

export function regStats(type, rows) {
  const t = norm(type);
  let n = 0, sx = 0, sx2 = 0, sy = 0, sy2 = 0, sxy = 0, sx3 = 0, sx2y = 0, sx4 = 0;
  for (const r of rows) {
    const f = freqOf(r), x = tx(t, r.x), y = ty(t, r.y);
    n += f; sx += f * x; sx2 += f * x * x; sy += f * y; sy2 += f * y * y; sxy += f * x * y;
    sx3 += f * x ** 3; sx2y += f * x * x * y; sx4 += f * x ** 4;
  }
  const out = { n, sumX: sx, sumX2: sx2, sumY: sy, sumY2: sy2, sumXY: sxy, sumX3: sx3, sumX2Y: sx2y, sumX4: sx4 };
  const need = (k) => { if (n < k) throw ME(); };
  const Sxx = () => { need(1); return sx2 - sx * sx / n; };
  const Syy = () => { need(1); return sy2 - sy * sy / n; };
  const Sxy = () => { need(1); return sxy - sx * sy / n; };
  lazy(out, 'meanX', () => { need(1); return sx / n; });
  lazy(out, 'meanY', () => { need(1); return sy / n; });
  lazy(out, 'popSDx', () => { need(1); return Math.sqrt(Math.max(0, Sxx()) / n); });
  lazy(out, 'popSDy', () => { need(1); return Math.sqrt(Math.max(0, Syy()) / n); });
  lazy(out, 'sampleSDx', () => { need(2); return Math.sqrt(Math.max(0, Sxx()) / (n - 1)); });
  lazy(out, 'sampleSDy', () => { need(2); return Math.sqrt(Math.max(0, Syy()) / (n - 1)); });

  if (t === 'quad') {
    const quad = () => {
      need(3);
      const sxx = Sxx(), sxy_ = Sxy();
      const sx3c = sx3 - sx * sx2 / n, sx2yc = sx2y - sx2 * sy / n, sx4c = sx4 - sx2 * sx2 / n;
      const den = sxx * sx4c - sx3c * sx3c;
      if (den === 0 || Math.abs(den) < 1e-13 * Math.abs(sxx * sx4c)) throw ME();
      const C = (sx2yc * sxx - sxy_ * sx3c) / den;
      const B = (sxy_ * sx4c - sx2yc * sx3c) / den;
      const A = sy / n - B * sx / n - C * sx2 / n;
      return { A, B, C };
    };
    lazy(out, 'A', () => quad().A);
    lazy(out, 'B', () => quad().B);
    lazy(out, 'C', () => quad().C);
  } else {
    const lin = () => {
      need(2);
      const sxx = Sxx();
      if (sxx === 0) throw ME();
      const B = Sxy() / sxx;
      const a = (sy - B * sx) / n;
      return { a, B };
    };
    const expA = t === 'exp' || t === 'pwr';
    lazy(out, 'A', () => { const { a } = lin(); return expA ? Math.exp(a) : a; });
    lazy(out, 'B', () => lin().B);
    lazy(out, 'r', () => {
      need(2);
      const d = Sxx() * Syy();
      if (d <= 0) throw ME();
      return Sxy() / Math.sqrt(d);
    });
  }
  return out;
}

const fin = (v) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw ME(); return v; };

export function estimateY(type, c, x) {
  const t = norm(type);
  const { A, B, C } = c;
  switch (t) {
    case 'lin': return fin(A + B * x);
    case 'log': if (x <= 0) throw ME(); return fin(A + B * Math.log(x));
    case 'exp': return fin(A * Math.exp(B * x));
    case 'pwr': if (x <= 0) throw ME(); return fin(A * Math.pow(x, B));
    case 'inv': if (x === 0) throw ME(); return fin(A + B / x);
    default: return fin(A + B * x + C * x * x);
  }
}

export function estimateX(type, c, y) {
  const t = norm(type);
  const { A, B, C } = c;
  switch (t) {
    case 'lin': return fin((y - A) / B);
    case 'log': return fin(Math.exp((y - A) / B));
    case 'exp': if (y / A <= 0) throw ME(); return fin(Math.log(y / A) / B);
    case 'pwr': if (y / A <= 0) throw ME(); return fin(Math.pow(y / A, 1 / B));
    case 'inv': return fin(B / (y - A));
    default: {
      // Manual: m1 = (-B + sqrt(B^2-4C(A-y)))/2C, m2 = (-B - sqrt(...))/2C
      const D = B * B - 4 * C * (A - y);
      if (C === 0 || D < 0) throw ME();
      const s = Math.sqrt(D);
      return { x1: fin((-B + s) / (2 * C)), x2: fin((-B - s) / (2 * C)) };
    }
  }
}
