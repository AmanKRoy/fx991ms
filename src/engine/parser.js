// Token array -> AST for the fx-991MS input line.
//
// Priority (Manual: users-guide p.34 "Order of Operations"), highest first:
//  1  Pol( Rec( d/dx( ∫dx( P( Q( R(                       -> parsed as calls in primary()
//  2  Type A (postfix): x² x³ x⁻¹ x! °'" ENG-symbols ▶t x̂ ŷ DRG▶ CONV  -> parsePost()
//  3  ^ and x√  (left to right)                              -> parsePow()
//  4  a b/c                                                  -> parseFrac()
//  5  implied multiplication in front of π, e, memory/variable names (2π, 5A, πA)
//                                                            -> parseImpl5()
//  6  Type B (prefix): √ ³√ log ln e^ 10^ sin ... (-) d h b o Neg Not Det Trn arg Abs Conjg
//                                                            -> parseUnary()
//  7  implied multiplication in front of Type B functions and '(' (2√3, Alog2, 3(4))
//                                                            -> parseImpl7()
//  8  nPr nCr ∠                                              -> parsePerm()
//  9  · (vector dot)                                         -> parseDot()
//  10 × ÷   11 + −   12 and   13 or xor xnor
// Same-precedence Type B functions apply right to left (e^ln√120 = e^(ln(√120))).
// "You can skip all ) operations before =" (users-guide p.12): unclosed '(' is closed at the
// end of a statement, at ':' and at '='/STO.
import { tokenInfo } from '../tokens.js';
import { CalcError, SYNTAX } from './errors.js';

const DIGITS = new Set('0123456789'.split(''));
const HEXLET = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
const PLAIN_VARS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M']);
// call-style functions: token includes '('; arguments separated by ','
const CALLS = new Set(['Pol(', 'Rec(', '∫(', 'd/dx(', 'Rnd(', 'Abs(', 'arg(', 'Conjg(', 'Not(', 'Neg(', 'P(', 'Q(', 'R(']);
const PREFIX = new Set(['neg', 'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan',
  'asinh', 'acosh', 'atanh', 'log', 'ln', '10^', 'e^', '√', 'cbrt', 'Det', 'Trn']);
const BASE_PREFIX = { d: 10, h: 16, b: 2, o: 8 };
const BASE_NUM = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };
const ENG_SYM = { 'eng:k': 1e3, 'eng:Meg': 1e6, 'eng:G': 1e9, 'eng:T': 1e12, 'eng:m': 1e-3,
  'eng:μ': 1e-6, 'eng:n': 1e-9, 'eng:p': 1e-12, 'eng:f': 1e-15 };
export const ENG_SYMBOLS = ENG_SYM;
const POSTFIX = new Set(['x²', 'x³', 'x⁻¹', '!', 'dms', '°', 'r', 'g',
  'x̂', 'ŷ', 'x̂1', 'x̂2', '>t', ...Object.keys(ENG_SYM)]);

export function isStatVar(id) { const t = tokenInfo(id); return !!(t && t.stat); }

export function parseProgram(tokens, opts = {}) {
  const p = new Parser(tokens, opts);
  return p.program();
}

class Parser {
  constructor(tokens, opts) {
    this.t = tokens;
    this.i = 0;
    this.mode = opts.mode || 'COMP';
    this.base = BASE_NUM[opts.base] || 10;
    this.fracDisp = opts.fracDisp || 'ab/c';
  }
  peek(o = 0) { return this.t[this.i + o]; }
  next() { return this.t[this.i++]; }
  err(pos = this.i) { return new CalcError(SYNTAX, pos); }
  atEnd() { return this.i >= this.t.length; }
  // terminators of a statement / argument list
  isStop(tok) {
    return tok === undefined || tok === ':' || tok === '=' || tok === 'STO' || tok === '%'
      || tok === '>r∠θ' || tok === '>a+bi';
  }

  program() {
    const stmts = [];
    if (this.t.length === 0) throw this.err(0);
    for (;;) {
      stmts.push(this.statement());
      if (this.atEnd()) break;
      if (this.peek() === ':') { this.next(); if (this.atEnd()) throw this.err(); continue; }
      throw this.err();
    }
    return stmts;
  }

  statement() {
    const start = this.i;
    const expr = this.parseExpr();
    const s = { expr, start };
    const tok = this.peek();
    if (tok === '%') {
      // Manual: users-guide p.14 "Percentage Calculations": % ends the expression,
      // optionally followed by + (mark-up) or - (discount).
      this.next();
      s.pct = true;
      if (this.peek() === '+' || this.peek() === '-') s.pctOp = this.next();
    } else if (tok === '>r∠θ' || tok === '>a+bi') {
      // CMPLX ▶r∠θ / ▶a+bi convert the whole result (User's Guide 2 p.9: 1+i▶r∠θ)
      this.next();
      s.cplxView = tok;
    } else if (tok === '=') {
      this.next();
      if (this.isStop(this.peek())) throw this.err();
      s.rhs = this.parseExpr();
    } else if (tok === 'STO') {
      this.next();
      const v = this.next();
      if (!PLAIN_VARS.has(v)) throw this.err(this.i - 1);
      s.sto = v;
    }
    s.end = this.i;
    return s;
  }

  parseExpr() { return this.parseOr(); }

  binLevel(ops, sub) {
    let a = sub();
    while (ops.includes(this.peek())) {
      const pos = this.i;
      const op = this.next();
      if (this.isStop(this.peek()) || this.peek() === ')' || this.peek() === ',') throw this.err();
      const b = sub();
      a = { t: 'bin', op, a, b, pos };
    }
    return a;
  }
  parseOr() { return this.binLevel(['or', 'xor', 'xnor'], () => this.parseAnd()); }
  parseAnd() { return this.binLevel(['and'], () => this.parseAdd()); }
  parseAdd() {
    // leading + / - : treat as sign (lenient)
    if (this.peek() === '+' || this.peek() === '-') {
      const pos = this.i;
      const op = this.next();
      const a = this.parseMul();
      const first = op === '-' ? { t: 'pre', f: 'neg', a, pos } : a;
      return this.addTail(first);
    }
    return this.addTail(this.parseMul());
  }
  addTail(a) {
    while (this.peek() === '+' || this.peek() === '-') {
      // '%' followed by +/- is handled at statement level
      const pos = this.i;
      const op = this.next();
      if (this.isStop(this.peek()) || this.peek() === ')' || this.peek() === ',') throw this.err();
      const b = this.parseMul();
      a = { t: 'bin', op, a, b, pos };
    }
    return a;
  }
  parseMul() { return this.binLevel(['×', '÷'], () => this.parseDot()); }
  parseDot() { return this.binLevel(['·'], () => this.parsePerm()); }
  parsePerm() { return this.binLevel(['nPr', 'nCr', '∠'], () => this.parseImpl7()); }

  startsOperand(tok) {
    if (tok === undefined) return false;
    if (CALLS.has(tok) || PREFIX.has(tok) || tok === '(') return true;
    if (this.mode === 'BASE' && BASE_PREFIX[tok]) return true;
    const info = tokenInfo(tok);
    if (!info) return false;
    return info.kind === 'num' || info.kind === 'const' || info.kind === 'var';
  }
  isImpl5Start(tok) {
    if (tok === undefined) return false;
    if (this.mode === 'BASE') return false;
    const info = tokenInfo(tok);
    if (!info) return false;
    return info.kind === 'const' || info.kind === 'var';
  }

  parseImpl7() {
    let a = this.parseUnary();
    // '+'/'-' are binary here, so only genuine operand starts continue the product
    while (this.startsOperand(this.peek())) {
      const pos = this.i;
      const b = this.parseUnary();
      a = { t: 'bin', op: '×', a, b, pos, implied: true };
    }
    return a;
  }

  parseUnary() {
    const tok = this.peek();
    const pos = this.i;
    if (PREFIX.has(tok)) {
      this.next();
      if (this.isStop(this.peek()) || this.peek() === ')' || this.peek() === ',') throw this.err();
      const a = PREFIX.has(this.peek()) ? this.parseUnary() : this.parseImpl5();
      return { t: 'pre', f: tok, a, pos };
    }
    if (tok === '-' || tok === '+') {
      // binary minus key used as a sign where an operand is expected (lenient)
      this.next();
      const a = this.parseUnary();
      return tok === '-' ? { t: 'pre', f: 'neg', a, pos } : a;
    }
    return this.parseImpl5();
  }

  parseImpl5() {
    let a = this.parseFrac();
    while (this.isImpl5Start(this.peek())) {
      const pos = this.i;
      const b = this.parseFrac();
      a = { t: 'bin', op: '×', a, b, pos, implied: true };
    }
    return a;
  }

  parseFrac() {
    const a = this.parsePow();
    if (this.peek() !== 'frac') return a;
    const pos = this.i;
    const parts = [a];
    while (this.peek() === 'frac') {
      this.next();
      if (parts.length >= 3) throw this.err(this.i - 1);
      parts.push(this.parsePow());
    }
    // Manual: users-guide p.13: inputting a mixed fraction while d/c is selected is an error.
    if (parts.length === 3 && this.fracDisp === 'd/c') throw this.err(pos);
    return { t: 'frac', parts, pos };
  }

  parsePow() {
    let a = this.parsePost();
    while (this.peek() === '^' || this.peek() === 'xroot') {
      const pos = this.i;
      const op = this.next();
      if (this.isStop(this.peek()) || this.peek() === ')' || this.peek() === ',') throw this.err();
      const b = this.parsePost();
      a = { t: 'bin', op, a, b, pos };
    }
    return a;
  }

  parsePost() {
    let a = this.primary();
    for (;;) {
      const tok = this.peek();
      if (tok !== undefined && (POSTFIX.has(tok) || /^conv:\d\d$/.test(tok))) {
        const pos = this.i;
        this.next();
        if (tok === 'dms') {
          // Sexagesimal entry: 12°34°56° (users-guide p.15 "Degrees, Minutes, Seconds").
          const parts = [a];
          while (parts.length < 3 && this.isNumStart(this.peek())) {
            const save = this.i;
            const n = this.numberLiteral();
            if (this.peek() === 'dms') { this.next(); parts.push(n); } else { this.i = save; break; }
          }
          a = { t: 'dms', parts, pos };
        } else {
          a = { t: 'post', f: tok, a, pos };
        }
        continue;
      }
      return a;
    }
  }

  isNumStart(tok) {
    if (tok === undefined) return false;
    if (DIGITS.has(tok) || tok === '.' || tok === 'EXP') return true;
    if (this.mode === 'BASE' && this.base === 16 && HEXLET.has(tok)) return true;
    return false;
  }

  // closes an optional ')' : auto-close at end / ':' / '=' / STO / '%'
  closeParen() {
    if (this.peek() === ')') { this.next(); return; }
    if (this.isStop(this.peek())) return;
    throw this.err();
  }

  primary() {
    const tok = this.peek();
    const pos = this.i;
    if (tok === undefined || tok === ':' || tok === ')' || tok === ',') throw this.err();
    if (this.mode === 'BASE') {
      if (BASE_PREFIX[tok] !== undefined) {
        this.next();
        const base = BASE_PREFIX[tok];
        const n = this.baseLiteral(base);
        if (!n) throw this.err();
        return n;
      }
      if (this.isNumStart(tok)) return this.baseLiteral(this.base);
    }
    if (this.isNumStart(tok)) return this.numberLiteral();
    if (tok === '(') {
      this.next();
      if (this.peek() === ')') throw this.err();
      const e = this.parseExpr();
      this.closeParen();
      return { t: 'group', a: e, pos };
    }
    if (CALLS.has(tok)) {
      this.next();
      const args = [];
      if (this.peek() === ')') throw this.err();
      for (;;) {
        args.push(this.parseExpr());
        if (this.peek() === ',') { this.next(); continue; }
        break;
      }
      this.closeParen();
      return { t: 'call', f: tok, args, pos };
    }
    if (PREFIX.has(tok) || tok === '-' || tok === '+') return this.parseUnary();
    const info = tokenInfo(tok);
    if (!info) throw this.err();
    if (info.kind === 'const') { this.next(); return { t: 'const', id: tok, pos }; }
    if (info.kind === 'var') { this.next(); return { t: 'var', id: tok, pos }; }
    throw this.err();
  }

  numberLiteral() {
    const pos = this.i;
    let s = '';
    let dot = false;
    while (DIGITS.has(this.peek()) || this.peek() === '.') {
      const c = this.next();
      if (c === '.') { if (dot) throw this.err(this.i - 1); dot = true; }
      s += c;
    }
    if (s === '.') s = '0';
    if (this.peek() === 'EXP') {
      this.next();
      if (s === '') s = '1';
      let e = '';
      if (this.peek() === 'neg' || this.peek() === '-') { this.next(); e = '-'; }
      let d = '';
      while (DIGITS.has(this.peek())) d += this.next();
      if (d === '') throw this.err();
      if (d.length > 2 && d.replace(/^0+/, '').length > 2) throw this.err();
      s += 'e' + e + d;
    }
    if (s === '') throw this.err(pos);
    return { t: 'num', v: Number(s), dec: dot || /e/.test(s), pos };
  }

  baseLiteral(base) {
    const pos = this.i;
    let s = '';
    for (;;) {
      const c = this.peek();
      if (DIGITS.has(c) || (base === 16 && HEXLET.has(c))) { s += this.next(); continue; }
      if (c === '.' && base === 10) { this.next(); s += '.'; continue; }
      break;
    }
    if (s === '') return null;
    return { t: 'blit', s, base, pos };
  }
}
