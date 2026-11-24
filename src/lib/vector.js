// VCT mode: vectors {dim, data:number[]}, dims 1..3 (calculator allows 1-3). Errors 'Dim ERROR'/'Math ERROR'.
const DE = () => new Error('Dim ERROR');
const ME = () => new Error('Math ERROR');
const num = (v) => { if (!Number.isFinite(v)) throw ME(); return v + 0; };

export function make(data) {
  if (data.length < 1 || data.length > 3) throw DE();
  return { dim: data.length, data: data.slice() };
}
const chk = (v) => { if (!v || v.dim < 1 || v.dim > 3 || v.data.length !== v.dim) throw DE(); };

export function add(a, b) { chk(a); chk(b); if (a.dim !== b.dim) throw DE(); return make(a.data.map((v, i) => num(v + b.data[i]))); }
export function sub(a, b) { chk(a); chk(b); if (a.dim !== b.dim) throw DE(); return make(a.data.map((v, i) => num(v - b.data[i]))); }
export function scale(a, k) { chk(a); return make(a.data.map((v) => num(v * k))); }
export function dot(a, b) {
  chk(a); chk(b);
  if (a.dim !== b.dim) throw DE();
  return num(a.data.reduce((s, v, i) => s + v * b.data[i], 0));
}
// Outer (cross) product; 2D vectors are treated as (x, y, 0) and give a 3D result (0, 0, z).
export function cross(a, b) {
  chk(a); chk(b);
  if (a.dim !== b.dim || a.dim < 2) throw DE();
  const [a1, a2, a3 = 0] = a.data, [b1, b2, b3 = 0] = b.data;
  return make([a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1].map(num));
}
export function abs(a) { chk(a); return num(Math.sqrt(a.data.reduce((s, v) => s + v * v, 0))); }
