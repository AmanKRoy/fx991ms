# fx-991MS web emulator: build contract

Goal: a phone-friendly static web app that emulates the CASIO fx-991MS as closely as possible,
so a student can practise for a maths exam. No build step: plain ES modules, served by any
static server (`python3 -m http.server` from the project root). No external runtime dependencies,
no CDN fetches (must work offline as an installed PWA).

## Sources of truth (cite these in code comments where behaviour depends on them)
- `docs/manual/users-guide.txt` (+ `.pdf`): CASIO fx-95MS/100MS/115MS/570MS/991MS User's Guide.
  Key pictograms are lost in the text extraction; open the PDF pages or the HTML manual when needed.
- `docs/manual/users-guide-2-additional.txt` (+ `.pdf`): fx-570MS/fx-991MS User's Guide 2
  (Additional Functions): CMPLX, BASE-N, EQN, MAT, VCT, CALC, SOLVE, d/dx, integration,
  CONST, CONV, ENG symbols.
- Official HTML manual: https://support.casio.com/global/en/calc/manual/fx-100MS_570MS_991MS_en/
- Cite as `// Manual: <guide> p.<page> "<section>"` (or the HTML page path).

## Layout
```
index.html  style.css  manifest.webmanifest  sw.js  icons/       (agent C)
src/tokens.js                 token catalogue (seeded by lead; agent A owns edits)
src/engine/*.js               parser, evaluator, formatter, CALC/SOLVE/calculus  (agent A)
src/lib/*.js                  pure maths libraries                               (agent B)
src/ui/*.js                   keypad, LCD renderer, key controller, mode screens (agent C)
tests/*.test.mjs              node --test (A: engine.test.mjs, B: lib.test.mjs)
```
Only edit files you own. If you need a change in another agent's file, write it in your final
report instead.

## Input model
The input line is an array of token ids (strings) from `src/tokens.js`. Each key press inserts
one token (or a token sequence). The UI keeps a cursor index into that array. `TOKENS[id].disp`
is the text shown on the dot-matrix input line, exactly as the real fx-991MS prints it.

## Engine API (agent A) — `src/engine/index.js`
```js
export class CalcError extends Error   // message is the exact LCD text: 'Syntax ERROR',
                                        // 'Math ERROR', 'Stack ERROR', 'Arg ERROR', 'Dim ERROR', 'Can't Solve' ...
                                        // .pos = token index for the cursor after the error (optional)

export function createState()          // fresh calculator memory/setup state (see below)

export function evaluate(tokens, state)
  // Evaluates one input line in the current mode. Handles ':' multi-statements by returning
  // the results of each statement: returns { results: Value[] } (UI shows them one at a time).
  // Handles STO/assignment tokens, M+/M- are done by the UI via storeVar/addToM helpers below.
  // Updates state.ans on success. Throws CalcError.

export function variablesIn(tokens)     // ordered unique variable names used (for CALC prompts)
export function solve(tokens, varName, guess, state)   // SOLVE (Newton), returns number; throws CalcError
export function format(value, state, view = {})
  // -> { main: string, exp: string|null, neg: boolean, indicators: {...} }
  // main is the 10-digit (plus separators) bottom-line text, exp the 2-digit x10 exponent (or null).
  // view: { frac: 'mixed'|'improper'|null, eng: integer shift (ENG / SHIFT ←ENG presses),
  //         dms: boolean, complexPart: 're'|'im' (CMPLX: Re⇔Im toggle) }
  // Must respect state.setup (Fix n / Sci n / Norm 1|2, a b/c vs d/c, EngON symbols, Dot/Comma).
export function toggleFraction(value, state)  // a b/c key on a result (decimal <-> fraction)
export function storeVar(state, name, value), recallVar(state, name), addToM(state, value, sign)
```
State shape (engine owns it, UI reads/writes the setup fields):
```js
{
  mode: 'COMP'|'CMPLX'|'SD'|'REG'|'BASE'|'EQN'|'MAT'|'VCT',
  regType: 'Lin'|'Log'|'Exp'|'Pwr'|'Inv'|'Quad',
  setup: { angle: 'Deg'|'Rad'|'Gra', disp: 'Norm'|'Fix'|'Sci', fix: 0-9, sci: 1-10 (0 = 10),
           norm: 1|2, fracDisp: 'ab/c'|'d/c', eng: false, dot: 'Dot'|'Comma' },
  base: 'DEC'|'HEX'|'BIN'|'OCT',
  vars: { A,B,C,D,E,F,X,Y,M },  ans: Value,
  stat: { sd: [{x, freq}], reg: [{x, y, freq}] },
  mat: { A, B, C, Ans },  vct: { A, B, C, Ans },
}
```
Value: JS number for real results; `{re, im}` for complex; `{rows, cols, data:number[][]}` for
matrices; `{dim, data:number[]}` for vectors; exact rationals may be carried as
`{num, den}` internally (engine decides; UI never inspects values, only passes them to `format`).

## Lib API (agent B) — pure functions, no DOM, no state
- `src/lib/complex.js`: add, sub, mul, div, neg, abs, arg (radians), conj, fromPolar(r, theta),
  powInt, inv, sqr, cube, plus anything else CMPLX mode supports per the manual.
- `src/lib/stats.js`: `sdStats(rows:[{x,freq}]) -> {n, sumX, sumX2, mean, popSD, sampleSD}`;
  `regStats(type, rows:[{x,y,freq}]) -> {n, sumX, sumX2, sumY, sumY2, sumXY, sumX3, sumX2Y, sumX4,
  meanX, meanY, popSDx, sampleSDx, popSDy, sampleSDy, A, B, C, r}`;
  `estimateY(type, coeffs, x)`, `estimateX(type, coeffs, y)` (Quad -> {x1, x2}).
- `src/lib/eqn.js`: `solveLinear(coeffs[][])` (2 or 3 unknowns; throws Error('Math ERROR') when
  singular, matching manual), `solveQuadratic(a,b,c)`, `solveCubic(a,b,c,d)` -> arrays of
  real numbers or `{re, im}`.
- `src/lib/matrix.js`: add, sub, mul, scale, det, transpose, inverse, power(int), dims 1..3; Dim/Math
  errors as `Error('Dim ERROR'|'Math ERROR')`.
- `src/lib/vector.js`: add, sub, scale, dot, cross, abs; dims 2..3.
- `src/lib/basen.js`: parse(string, base), format(int, base) with fx-991MS ranges and
  two's-complement display (BIN 10 digits, OCT 10 digits, HEX 8 digits, DEC signed range per manual),
  and, or, xor, xnor, not, neg. Throws Error('Math ERROR') on out-of-range.
- `src/lib/constants.js`: `CONSTANTS` — the 40 CONST entries exactly as in the manual
  ({no, symbol, name, value}).
- `src/lib/conversions.js`: `CONVERSIONS` — the 40 CONV entries ({no, from, to, convert(x)}).

## UI (agent C)
Keypad matching the real fx-991MS layout and colours (SHIFT legends gold/yellow above-left,
ALPHA legends red above-right, mode-specific legends where printed), LCD faithful to the MS
(indicator row, dot-matrix input line, 10+2 digit result line), all mode/menu screens, phone-first
responsive layout, PWA (manifest + offline service worker + icons). Plus an optional "Textbook view"
strip (outside the LCD, toggle, default ON) that renders the current input as natural textbook
maths (stacked fractions, superscript powers, root bars), because the real MS display is linear.
