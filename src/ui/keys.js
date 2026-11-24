// fx-991MS keypad layout.
// Source: official HTML manual (fx-100MS/570MS/991MS 2nd edition, S-V.P.A.M.),
//   https://support.casio.com/global/en/calc/manual/fx-100MS_570MS_991MS_en/
//   "Key Markings" (yellow = SHIFT, red = ALPHA, purple = CMPLX, blue = SD/REG, green = BASE),
// cross-checked against photographs of a real fx-991MS (Wikimedia Commons "Casio fx-991MS.jpg").
// Key assignments verified from the HTML manual examples, e.g. "[SHIFT][RCL](STO)[(−)](A)",
// "[SHIFT]+(Pol(", "[SHIFT]−(Rec(", "[SHIFT][Ans](DRG▸)", "[SHIFT]=(%)", "[x⁻¹](LOGIC)",
// "[SHIFT]{Const}(CONV)", "[SHIFT]4(MAT)", "[SHIFT]5(VCT)", "[SHIFT]1(S-SUM)", "[SHIFT]2(S-VAR)",
// "[SHIFT]3(DISTR)", "[ENG](i)", "[SHIFT][(](arg)", "[SHIFT][)](Abs)", "[SHIFT][,](Conjg)".
//
// Each key: k = id, cap = keycap text, s = SHIFT legend (gold, above-left), a = ALPHA legend
// (red, above-right), m = mode legend {text, cls: 'cx'|'sd'|'bs', pos: 'top'|'bot'},
// cls = visual style.

export const KEY_ROWS_TOP = [
  // row 1 & 2 surround the replay pad (cols 3-4)
  [
    { k: 'SHIFT', cap: 'SHIFT', cls: 'pill', lbl: 'shift' },
    { k: 'ALPHA', cap: 'ALPHA', cls: 'pill', lbl: 'alpha' },
    { k: 'MODE', cap: 'MODE', s: 'CLR', cls: 'pill' },
    { k: 'ON', cap: 'ON', cls: 'pill' },
  ],
  [
    { k: 'CALC', cap: 'CALC', s: 'SOLVE', a: '=' },
    { k: 'INT', cap: '∫dx', s: 'd/dx', a: ':' },
    { k: 'XINV', cap: 'x⁻¹', s: 'x!', m: { text: 'LOGIC', cls: 'bs' } },
    { k: 'CONST', cap: 'CONST', s: 'CONV', cls: 'small' },
  ],
];

export const KEY_ROWS_MID = [
  [
    { k: 'FRAC', cap: 'a b/c', s: 'd/c' },
    { k: 'SQRT', cap: '√▫', s: '³√' },
    { k: 'X2', cap: 'x²', s: 'x³', m: { text: 'DEC', cls: 'bs' } },
    { k: 'POW', cap: '^', s: 'x√', m: { text: 'HEX', cls: 'bs' } },
    { k: 'LOG', cap: 'log', s: '10ˣ', m: { text: 'BIN', cls: 'bs' } },
    { k: 'LN', cap: 'ln', s: 'eˣ', a: 'e', m: { text: 'OCT', cls: 'bs' } },
  ],
  [
    { k: 'NEG', cap: '(−)', a: 'A', m: { text: '∠', cls: 'cx' } },
    { k: 'DMS', cap: '°’”', s: '←', a: 'B' },
    { k: 'HYP', cap: 'hyp', a: 'C' },
    { k: 'SIN', cap: 'sin', s: 'sin⁻¹', a: 'D' },
    { k: 'COS', cap: 'cos', s: 'cos⁻¹', a: 'E' },
    { k: 'TAN', cap: 'tan', s: 'tan⁻¹', a: 'F' },
  ],
  [
    { k: 'RCL', cap: 'RCL', s: 'STO' },
    { k: 'ENG', cap: 'ENG', s: '←', m: { text: 'i', cls: 'cx' } },
    { k: 'LP', cap: '(', m: { text: 'arg', cls: 'cx', pos: 'bot' } },
    { k: 'RP', cap: ')', a: 'X', m: { text: 'Abs', cls: 'cx', pos: 'bot' } },
    { k: 'COMMA', cap: ',', s: ';', a: 'Y', m: { text: 'Conjg', cls: 'cx', pos: 'bot' } },
    { k: 'MPLUS', cap: 'M+', s: 'M−', a: 'M', m: { text: 'DT  CL', cls: 'sd', pos: 'bot' } },
  ],
];

export const KEY_ROWS_NUM = [
  [
    { k: '7', cap: '7', s: 'M', cls: 'num' },
    { k: '8', cap: '8', s: 'G', cls: 'num' },
    { k: '9', cap: '9', s: 'T', cls: 'num' },
    { k: 'DEL', cap: 'DEL', s: 'INS', cls: 'red' },
    { k: 'AC', cap: 'AC', s: 'OFF', cls: 'red' },
  ],
  [
    { k: '4', cap: '4', s: 'μ', m: { text: 'MAT', cls: 'sh' }, cls: 'num' },
    { k: '5', cap: '5', s: 'm', m: { text: 'VCT', cls: 'sh' }, cls: 'num' },
    { k: '6', cap: '6', s: 'k', cls: 'num' },
    { k: 'MUL', cap: '×', s: 'nPr', cls: 'num' },
    { k: 'DIV', cap: '÷', s: 'nCr', cls: 'num' },
  ],
  [
    { k: '1', cap: '1', s: 'f', m: { text: 'S-SUM', cls: 'sd' }, cls: 'num' },
    { k: '2', cap: '2', s: 'p', m: { text: 'S-VAR', cls: 'sd' }, cls: 'num' },
    { k: '3', cap: '3', s: 'n', m: { text: 'DISTR', cls: 'sd' }, cls: 'num' },
    { k: 'ADD', cap: '+', s: 'Pol(', m: { text: '▶r∠θ', cls: 'cx' }, cls: 'num' },
    { k: 'SUB', cap: '−', s: 'Rec(', m: { text: '▶a+bi', cls: 'cx' }, cls: 'num' },
  ],
  [
    { k: '0', cap: '0', s: 'Rnd', cls: 'num' },
    { k: 'DOT', cap: '•', s: 'Ran#', cls: 'num' },
    { k: 'EXP', cap: 'EXP', s: 'π', cls: 'num' },
    { k: 'ANS', cap: 'Ans', s: 'DRG▶', cls: 'num' },
    { k: 'EQ', cap: '=', s: '%', m: { text: 'Re⇔Im', cls: 'cx' }, cls: 'num' },
  ],
];

// Variable letters printed in red (ALPHA) — also used for STO / RCL targets.
// Manual (HTML) "Variables (A, B, C, D, E, F, M, X, Y)": [(−)](A), [°'"](B), [hyp](C),
// [sin](D), [cos](E), [tan](F), [)](X), [,](Y), [M+](M).
export const VAR_KEYS = { NEG: 'A', DMS: 'B', HYP: 'C', SIN: 'D', COS: 'E', TAN: 'F', RP: 'X', COMMA: 'Y', MPLUS: 'M' };
// BASE mode hex digits: same keys, no ALPHA needed (Manual: "Base-n Calculations").
export const HEX_KEYS = { NEG: 'A', DMS: 'B', HYP: 'C', SIN: 'D', COS: 'E', TAN: 'F' };
// Engineering symbols, SHIFT + digit while EngON (Manual: "Using Engineering Symbols").
export const ENG_SYM_KEYS = { 7: 'Meg', 8: 'G', 9: 'T', 4: 'μ', 5: 'm', 6: 'k', 1: 'f', 2: 'p', 3: 'n' };

// Desktop keyboard shortcuts -> key id(s)
export const KEYBOARD = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'DOT', '+': 'ADD', '-': 'SUB', '*': 'MUL', 'x': 'MUL', '/': 'DIV', '^': 'POW', '(': 'LP', ')': 'RP',
  ',': 'COMMA', 'Enter': 'EQ', '=': 'EQ', 'Backspace': 'DEL', 'Delete': 'DEL', 'Escape': 'AC',
  'ArrowLeft': 'LEFT', 'ArrowRight': 'RIGHT', 'ArrowUp': 'UP', 'ArrowDown': 'DOWN',
  'Shift': null, 's': 'SHIFT', 'a': 'ALPHA', 'm': 'MODE', 'e': 'EXP', 'p': ['SHIFT', 'EXP'],
  '!': ['SHIFT', 'XINV'], '%': ['SHIFT', 'EQ'], 'r': 'SQRT', 'l': 'LOG', 'n': 'LN', 'h': 'HYP',
  'S': 'SIN', 'C': 'COS', 'T': 'TAN', 'f': 'FRAC',
};
