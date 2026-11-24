// Token catalogue for the fx-991MS input line.
// Seeded by the lead; agent A (engine) owns edits. `disp` = exact text on the dot-matrix line.
// kind: num | const | var | op (binary infix) | pre (prefix function) | post (postfix) |
//       open | close | sep | special
// Display strings should match the fx-991MS (User's Guide, "Basic Calculations" and
// User's Guide 2 examples). Agent A: correct any `disp` value that the manual contradicts.

const T = {};
const def = (id, disp, kind, extra = {}) => { T[id] = { id, disp, kind, ...extra }; };

// numbers
for (const d of '0123456789') def(d, d, 'num');
def('.', '.', 'num');
def('EXP', 'E', 'num');               // x10^ entry (EXP key)
def('frac', '┘', 'num');              // a b/c separator (fraction input), shown as ┘ (Manual: "Fraction Calculations")

// constants / variables
def('π', 'π', 'const');
def('e', 'e', 'const');
def('Ans', 'Ans', 'var');
for (const v of 'ABCDEFXYM') def(v, v, 'var');
def('Ran#', 'Ran#', 'const');
def('i', 'i', 'const');               // CMPLX imaginary unit

// binary operators
def('+', '+', 'op'); def('-', '-', 'op'); def('×', '×', 'op'); def('÷', '÷', 'op');
def('^', '^', 'op');                  // x^y
def('xroot', 'x√', 'op');             // x√y  (SHIFT ^)
def('nPr', 'P', 'op'); def('nCr', 'C', 'op');
def('∠', '∠', 'op');                  // CMPLX polar entry
def('=', '=', 'op');                  // equation for SOLVE (ALPHA CALC)
def('and', ' and ', 'op'); def('or', ' or ', 'op'); def('xor', ' xor ', 'op'); def('xnor', ' xnor ', 'op');
def('·', '·', 'op');                  // vector dot product (VCT mode, SHIFT VCT Dot)

// prefix
def('neg', '-', 'pre');               // (-) key
for (const f of ['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh']) def(f, f, 'pre');
def('asin', 'sin⁻¹', 'pre'); def('acos', 'cos⁻¹', 'pre'); def('atan', 'tan⁻¹', 'pre');
def('asinh', 'sinh⁻¹', 'pre'); def('acosh', 'cosh⁻¹', 'pre'); def('atanh', 'tanh⁻¹', 'pre');
def('log', 'log', 'pre'); def('ln', 'ln', 'pre');
def('10^', '10^', 'pre'); def('e^', 'e^', 'pre');
def('√', '√', 'pre'); def('cbrt', '³√', 'pre');
def('Pol(', 'Pol(', 'pre'); def('Rec(', 'Rec(', 'pre');
def('Rnd(', 'Rnd(', 'pre');
def('Abs(', 'Abs(', 'pre'); def('arg(', 'arg(', 'pre'); def('Conjg(', 'Conjg(', 'pre');
def('∫(', '∫dx(', 'pre');             // ∫dx key: ∫dx(f(X), a, b[, n]) (User's Guide 2 p.14)
def('d/dx(', 'd/dx(', 'pre');         // d/dx(f(X), a[, Δx])
def('Not(', 'Not(', 'pre'); def('Neg(', 'Neg(', 'pre');
def('Det', 'Det', 'pre'); def('Trn', 'Trn', 'pre');
// SD-mode normal distribution (User's Guide 2 p.12-13, SHIFT DISTR): P( Q( R( and postfix ▶t
def('P(', 'P(', 'pre'); def('Q(', 'Q(', 'pre'); def('R(', 'R(', 'pre');
def('>t', '▶t', 'post');
// store result into a variable inside a line: expr STO A (SHIFT RCL); evaluate() assigns it
def('STO', '→', 'op');

// postfix
def('x²', '²', 'post'); def('x³', '³', 'post'); def('x⁻¹', '⁻¹', 'post');
def('!', '!', 'post'); def('%', '%', 'post');
def('dms', '°', 'post');              // °'" key (sexagesimal entry)
def('°', '°', 'post'); def('r', 'r', 'post'); def('g', 'g', 'post');   // DRG▸ markers
def('>r∠θ', '▶r∠θ', 'post'); def('>a+bi', '▶a+bi', 'post');            // CMPLX conversions
// BASE-N literal prefixes: Type B (prefix) per users-guide p.34 "Order of Operations" item 6; d12, h1F
def('d', 'd', 'pre'); def('h', 'h', 'pre'); def('b', 'b', 'pre'); def('o', 'o', 'pre');
// ENG symbols (Disp EngON): k M G T m μ n p f
for (const s of ['k', 'Meg', 'G', 'T', 'm', 'μ', 'n', 'p', 'f']) def('eng:' + s, s === 'Meg' ? 'M' : s, 'post');

// structure
def('(', '(', 'open'); def(')', ')', 'close'); def(',', ',', 'sep'); def(':', ':', 'sep');

// mode-specific operands
for (const m of ['A', 'B', 'C', 'Ans']) { def('Mat' + m, 'Mat' + m, 'var'); def('Vct' + m, 'Vct' + m, 'var'); }
// statistics (SD/REG): S-SUM / S-VAR menus
for (const [id, disp] of [
  ['Σx²', 'Σx²'], ['Σx', 'Σx'], ['n', 'n'], ['x̄', 'x̄'], ['xσn', 'xσn'], ['xσn-1', 'xσn-1'],
  ['Σy²', 'Σy²'], ['Σy', 'Σy'], ['Σxy', 'Σxy'], ['Σx³', 'Σx³'], ['Σx²y', 'Σx²y'], ['Σx⁴', 'Σx⁴'],
  ['ȳ', 'ȳ'], ['yσn', 'yσn'], ['yσn-1', 'yσn-1'], ['regA', 'A'], ['regB', 'B'], ['regC', 'C'], ['r', 'r'],
]) if (!T[id]) def(id, disp, 'var', { stat: true });
def('regr', 'r', 'var', { stat: true });
def('x̂', 'x̂', 'post'); def('ŷ', 'ŷ', 'post'); def('x̂1', 'x̂1', 'post'); def('x̂2', 'x̂2', 'post');
// scientific constants CONST 01-40 and conversions CONV 01-40 are created on demand:
//   'const:NN' (kind const), 'conv:NN' (kind post). Use tokenInfo() to resolve them.

export const TOKENS = T;
export function tokenInfo(id) {
  if (T[id]) return T[id];
  if (/^const:\d\d$/.test(id)) return { id, disp: id, kind: 'const' };   // UI replaces disp with symbol
  if (/^conv:\d\d$/.test(id)) return { id, disp: id, kind: 'post' };
  return undefined;
}
