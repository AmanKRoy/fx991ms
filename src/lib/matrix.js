// MAT mode: matrices {rows, cols, data:number[][]}, dims 1..3. Errors: 'Dim ERROR' / 'Math ERROR'.
const DE = () => new Error('Dim ERROR');
const ME = () => new Error('Math ERROR');

export function make(data) {
  const rows = data.length, cols = rows ? data[0].length : 0;
  if (rows < 1 || rows > 3 || cols < 1 || cols > 3 || data.some((r) => r.length !== cols)) throw DE();
  return { rows, cols, data: data.map((r) => r.slice()) };
}
const mk = (data) => ({ rows: data.length, cols: data[0].length, data });
const chk = (m) => { if (!m || m.rows < 1 || m.rows > 3 || m.cols < 1 || m.cols > 3) throw DE(); };
const num = (v) => { if (!Number.isFinite(v)) throw ME(); return v + 0; };

export function add(a, b) {
  chk(a); chk(b);
  if (a.rows !== b.rows || a.cols !== b.cols) throw DE();
  return mk(a.data.map((r, i) => r.map((v, j) => num(v + b.data[i][j]))));
}
export function sub(a, b) {
  chk(a); chk(b);
  if (a.rows !== b.rows || a.cols !== b.cols) throw DE();
  return mk(a.data.map((r, i) => r.map((v, j) => num(v - b.data[i][j]))));
}
export function mul(a, b) {
  chk(a); chk(b);
  if (a.cols !== b.rows) throw DE();
  const d = [];
  for (let i = 0; i < a.rows; i++) {
    d.push([]);
    for (let j = 0; j < b.cols; j++) {
      let s = 0;
      for (let k = 0; k < a.cols; k++) s += a.data[i][k] * b.data[k][j];
      d[i].push(num(s));
    }
  }
  return mk(d);
}
export function scale(m, k) { chk(m); return mk(m.data.map((r) => r.map((v) => num(v * k)))); }
export function transpose(m) {
  chk(m);
  const d = [];
  for (let j = 0; j < m.cols; j++) d.push(m.data.map((r) => r[j]));
  return mk(d);
}
export function det(m) {
  chk(m);
  if (m.rows !== m.cols) throw DE();
  const a = m.data;
  if (m.rows === 1) return a[0][0];
  if (m.rows === 2) return num(a[0][0] * a[1][1] - a[0][1] * a[1][0]);
  return num(a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
    - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
    + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]));
}
export function inverse(m) {
  chk(m);
  if (m.rows !== m.cols) throw DE();
  const n = m.rows, D = det(m);
  if (D === 0) throw ME();
  const a = m.data;
  if (n === 1) return mk([[1 / a[0][0]]]);
  if (n === 2) return mk([[a[1][1] / D, -a[0][1] / D], [-a[1][0] / D, a[0][0] / D]].map((r) => r.map((v) => v + 0)));
  const cof = (i, j) => {
    const r = [0, 1, 2].filter((x) => x !== i), c = [0, 1, 2].filter((x) => x !== j);
    return ((i + j) % 2 ? -1 : 1) * (a[r[0]][c[0]] * a[r[1]][c[1]] - a[r[0]][c[1]] * a[r[1]][c[0]]);
  };
  const d = [];
  for (let i = 0; i < 3; i++) { d.push([]); for (let j = 0; j < 3; j++) d[i].push(num(cof(j, i) / D)); }
  return mk(d);
}
// n integer: n>=1 repeated product, n=-1 inverse, n=0 identity, n<-1 inverse^|n|.
export function power(m, n) {
  chk(m);
  if (m.rows !== m.cols) throw DE();
  if (!Number.isInteger(n)) throw ME();
  if (n < 0) return power(inverse(m), -n);
  let r = mk(m.data.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))));
  for (let i = 0; i < n; i++) r = mul(r, m);
  return r;
}
// Element-wise absolute value (manual "Abs MatAns").
export function abs(m) { chk(m); return mk(m.data.map((r) => r.map((v) => Math.abs(v)))); }
