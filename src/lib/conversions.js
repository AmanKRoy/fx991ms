// fx-991MS metric conversions, manual order (users-guide-2-additional "Conversion Pair Table", E-23).
// Factors from NIST SP 811 (1995). Pairs 37/38 are affine (F->C, C->F).
const pairs = [
  ['in', 'cm', 2.54], ['ft', 'm', 0.3048], ['yd', 'm', 0.9144], ['mile', 'km', 1.609344],
  ['n mile', 'm', 1852], ['acre', 'm2', 4046.8564224], ['gal (US)', 'L', 3.785411784],
  ['gal (UK)', 'L', 4.54609], ['pc', 'km', 3.08567782e13], ['km/h', 'm/s', 1 / 3.6],
  ['oz', 'g', 28.349523125], ['lb', 'kg', 0.45359237], ['atm', 'Pa', 101325],
  ['mmHg', 'Pa', 133.322], ['hp', 'kW', 0.7456999], ['kgf/cm2', 'Pa', 98066.5],
  ['kgf·m', 'J', 9.80665], ['lbf/in2', 'kPa', 6.894757],
];
const list = [];
for (const [a, b, k] of pairs) {
  list.push({ from: a, to: b, convert: (x) => x * k });
  list.push({ from: b, to: a, convert: (x) => x / k });
}
// order so far: pairs[0] fwd, rev, pairs[1] fwd, rev ... = manual nos 1..36
list.push({ from: '°F', to: '°C', convert: (x) => (x - 32) / 1.8 });
list.push({ from: '°C', to: '°F', convert: (x) => x * 1.8 + 32 });
list.push({ from: 'J', to: 'cal', convert: (x) => x / 4.1868 });
list.push({ from: 'cal', to: 'J', convert: (x) => x * 4.1868 });
export const CONVERSIONS = list.map((o, i) => ({ no: i + 1, ...o }));
