// Key controller / state machine for the fx-991MS emulator UI.
// Behaviour references (cite): Manual = docs/manual/users-guide.txt (User's Guide),
// Manual2 = docs/manual/users-guide-2-additional.txt (User's Guide 2), HTML = official HTML manual
// https://support.casio.com/global/en/calc/manual/fx-100MS_570MS_991MS_en/
import * as E from '../engine/index.js';
import { TOKENS, tokenInfo } from '../tokens.js';
import { CONSTANTS } from '../lib/constants.js';
import { CONVERSIONS } from '../lib/conversions.js';
import * as EQN from '../lib/eqn.js';
import { VAR_KEYS, HEX_KEYS, ENG_SYM_KEYS } from './keys.js';

const DIGITS = '0123456789';
const KNOWN_ERR = ['Syntax ERROR', 'Math ERROR', 'Stack ERROR', 'Arg ERROR', 'Dim ERROR', "Can't Solve", 'Data Full'];
// Tokens the UI inserts that tokens.js does not (yet) define: displayed via this fallback table.
const UI_DISP = { semi: ';', 'P(': 'P(', 'Q(': 'Q(', 'R(': 'R(', '>t': '▶t' };
const BASE_LETTER = { DEC: 'd', HEX: 'H', BIN: 'b', OCT: 'o' };
const isObj = (v) => v !== null && typeof v === 'object';
const isMat = (v) => isObj(v) && Array.isArray(v.data) && 'rows' in v;
const isVct = (v) => isObj(v) && Array.isArray(v.data) && 'dim' in v;
const isCplx = (v) => isObj(v) && 're' in v && 'im' in v;

export function dispOf(id) {
  const t = TOKENS[id];
  if (t) return t.disp;
  let m = /^const:(\d\d)$/.exec(id);
  if (m) { const c = CONSTANTS[+m[1] - 1]; return c ? c.symbol : id; }
  m = /^conv:(\d\d)$/.exec(id);
  if (m) { const c = CONVERSIONS[+m[1] - 1]; return c ? `${c.from}▶${c.to}` : id; }
  if (UI_DISP[id]) return UI_DISP[id];
  const info = tokenInfo(id);
  return info ? info.disp : id;
}

function errMsg(e) {
  const m = e && e.message;
  if (KNOWN_ERR.includes(m)) return m;
  if (m && /can.?t solve/i.test(m)) return "Can't Solve";
  console.error(e);
  return 'Math ERROR';
}

// ---------------------------------------------------------------------------------------------
export class Controller {
  constructor(saved) {
    this.state = E.createState();
    this.ui = { eqn: { lin2: [], lin3: [], deg2: [], deg3: [] }, tb: true };
    if (saved) this.restore(saved);
    if (!this.state.setup.cplx) this.state.setup.cplx = 'a+bi';
    this.shift = false; this.alpha = false; this.hyp = false;
    this.pending = null;          // 'STO' | 'RCL'
    this.screen = null;           // modal screen object (menus, prompts, editors)
    this.history = [];            // replay memory (Manual p.9 "Replay Function")
    this.calcMem = null;          // CALC memory (Manual2 E-5 "CALC Memory")
    this.clearInput();
    this.value = 0; this.view = {}; this.showZero = true;
    if (this.state.mode === 'EQN') this.openEqnSetup();
  }

  // ---- persistence ---------------------------------------------------------------------------
  snapshot() { return { state: this.state, ui: this.ui }; }
  restore(saved) {
    try {
      const merge = (dst, src) => {
        for (const k of Object.keys(src)) {
          if (isObj(src[k]) && !Array.isArray(src[k]) && isObj(dst[k]) && !Array.isArray(dst[k]) && !('re' in src[k]) && !('data' in src[k])) merge(dst[k], src[k]);
          else dst[k] = src[k];
        }
      };
      if (saved.state) merge(this.state, saved.state);
      if (saved.ui) merge(this.ui, saved.ui);
    } catch (e) { console.warn('restore failed', e); }
  }

  clearInput() {
    this.tokens = []; this.cursor = 0; this.insert = false;
    this.phase = 'edit';          // 'edit' | 'result' | 'error' | 'stat'
    this.results = null; this.resIdx = 0; this.histPos = null;
    this.topText = null;          // override text for upper line in result phase (e.g. "A=")
    this.chainTok = 'Ans';
    this.calcActive = false; this.solveActive = null;
  }

  // ---- top-level key entry -------------------------------------------------------------------
  press(k) {
    if (k === 'SHIFT') { this.shift = !this.shift; this.alpha = false; return; }
    if (k === 'ALPHA') { this.alpha = !this.alpha; this.shift = false; return; }
    const sh = this.shift, al = this.alpha;
    this.shift = false; this.alpha = false;
    if (k === 'ON') { this.powerOn(); return; }
    if (k === 'AC' && sh) { this.powerOn(); return; }      // OFF: emulate as clear (no power off)
    if (k === 'HYP' && !al && this.state.mode !== 'BASE' && !this.screen) { this.hyp = true; return; }
    const hyp = this.hyp; this.hyp = false;
    if (this.screen) {
      if (k === 'MODE' && !this.screen.ownsMode) { sh ? this.openClr() : this.openMode(); return; }
      this.screen.key(k, sh, al, hyp);
      return;
    }
    this.main(k, sh, al, hyp);
  }

  powerOn() {
    // Manual p.9: replay memory cleared when ON is pressed. Variables/memories retained (HTML "Clearing ... All Memories").
    this.screen = null; this.pending = null; this.history = []; this.hyp = false;
    this.clearInput(); this.showZero = true; this.view = {};
    if (this.state.mode === 'EQN') this.openEqnSetup();
  }

  // ---- token resolution ----------------------------------------------------------------------
  resolveTokens(k, sh, al, hyp) {
    const mode = this.state.mode, setup = this.state.setup;
    const cx = mode === 'CMPLX';
    if (al) {
      if (VAR_KEYS[k]) return [VAR_KEYS[k]];
      if (k === 'CALC') return ['='];       // ALPHA CALC (=)  HTML "Using CALC"
      if (k === 'INT') return [':'];        // ALPHA ∫dx (:)   HTML "Multi-Statements"
      if (k === 'LN') return ['e'];         // ALPHA ln (e)    HTML "Natural Logarithm Base e"
      return null;
    }
    if (mode === 'BASE' && !sh && HEX_KEYS[k]) return [HEX_KEYS[k]];
    if (DIGITS.includes(k)) {
      if (!sh) return [k];
      if (k === '0') return ['Rnd('];                                    // HTML "Rounding function"
      if (setup.eng && ENG_SYM_KEYS[k] && mode !== 'BASE') return ['eng:' + ENG_SYM_KEYS[k]];
      return null;
    }
    switch (k) {
      case 'DOT': return [sh ? 'Ran#' : '.'];
      case 'EXP': return [sh ? 'π' : 'EXP'];
      case 'ANS': return sh ? null : ['Ans'];
      case 'ADD': return [sh ? (cx ? '>r∠θ' : 'Pol(') : '+'];
      case 'SUB': return [sh ? (cx ? '>a+bi' : 'Rec(') : '-'];
      case 'MUL': return [sh ? 'nPr' : '×'];
      case 'DIV': return [sh ? 'nCr' : '÷'];
      case 'FRAC': return sh ? null : ['frac'];
      case 'SQRT': return [sh ? 'cbrt' : '√'];
      case 'X2': return [sh ? 'x³' : 'x²'];
      case 'POW': return [sh ? 'xroot' : '^'];
      case 'LOG': return [sh ? '10^' : 'log'];
      case 'LN': return [sh ? 'e^' : 'ln'];
      case 'NEG': return sh ? (cx ? ['∠'] : null) : ['neg'];
      case 'DMS': return sh ? null : ['dms'];
      case 'SIN': case 'COS': case 'TAN': {
        const f = k.toLowerCase();
        return [hyp ? (sh ? 'a' + f + 'h' : f + 'h') : (sh ? 'a' + f : f)];
      }
      case 'XINV': return [sh ? '!' : 'x⁻¹'];
      case 'INT': return [sh ? 'd/dx(' : '∫('];
      case 'LP': return sh ? (cx ? ['arg('] : null) : ['('];
      case 'RP': return sh ? (cx || mode === 'MAT' || mode === 'VCT' ? ['Abs('] : null) : [')'];
      case 'COMMA':
        if (!sh) return [','];
        if (cx) return ['Conjg('];
        if (mode === 'SD' || mode === 'REG') return ['semi'];
        return null;
      case 'ENG': return cx && !sh ? ['i'] : null;
      default: return null;
    }
  }

  // ---- main (expression) handling ------------------------------------------------------------
  main(k, sh, al, hyp) {
    const st = this.state, mode = st.mode;
    if (this.phase === 'error') return this.errorKey(k);

    if (this.pending) {
      const p = this.pending; this.pending = null;
      const v = VAR_KEYS[k];
      if (!v) return;
      if (p === 'STO') return this.doSto(v);
      return this.doRcl(v);
    }

    // mode independent commands
    if (k === 'MODE') return sh ? this.openClr() : this.openMode();
    if (k === 'AC') { this.clearInput(); this.showZero = true; this.view = {}; return; }
    if (k === 'RCL' && !al) { this.pending = sh ? 'STO' : 'RCL'; return; }
    if (k === 'CONST' && !al) return this.openConst(sh ? 'CONV' : 'CONST');
    if (k === 'ANS' && sh) return this.openDrg();
    if (k === 'CALC' && !al) {
      if (sh) return this.openSolve();
      return this.openCalc();
    }
    if (k === 'DEL' && !al) return sh ? this.toggleIns() : this.del();
    if (k === 'LEFT' || k === 'RIGHT') return this.leftRight(k);
    if (k === 'UP' || k === 'DOWN') return this.upDown(k, sh);
    if (k === 'EQ' && !al) {
      if (sh) {
        if (mode === 'CMPLX' || isCplx(this.value)) return this.toggleReIm();
        return this.percent();
      }
      return this.equals();
    }

    // BASE-N number-system keys and LOGIC menu (HTML "Base-n Calculations")
    if (mode === 'BASE' && !sh && !al) {
      const nb = { X2: 'DEC', POW: 'HEX', LOG: 'BIN', LN: 'OCT' }[k];
      if (nb) { st.base = nb; return; }
      if (k === 'XINV') return this.openLogic();
    }

    // SD / REG: M+ is DT, SHIFT M+ is CL; SHIFT 1/2/3 = S-SUM, S-VAR, DISTR (HTML "Statistical Calculations")
    if ((mode === 'SD' || mode === 'REG') && !al) {
      if (k === 'MPLUS') return sh ? this.statCL() : this.statDT();
      if (sh && k === '1') return this.openStatMenu('SUM');
      if (sh && k === '2') return this.openStatMenu('VAR');
      if (sh && k === '3' && mode === 'SD') return this.openDistr();
    }
    if (mode === 'MAT' && sh && k === '4') return this.openMatMenu('MAT');
    if (mode === 'VCT' && sh && k === '5') return this.openMatMenu('VCT');

    if (k === 'MPLUS' && !al) return this.memPlus(sh ? -1 : 1);

    // keys acting on a displayed result
    if (this.phase === 'result' && !al) {
      if (k === 'FRAC') return this.resFrac(sh);
      if (k === 'ENG' && !(mode === 'CMPLX' && !sh)) return this.resEng(sh ? -1 : 1);
      if (k === 'DMS') { this.view = { ...this.view, dms: sh ? true : !this.view.dms }; return; }
    } else if (!al && k === 'ENG' && mode !== 'CMPLX') {
      return; // ENG with no result: nothing
    }

    const toks = this.resolveTokens(k, sh, al, hyp);
    if (toks) this.insertTokens(toks);
  }

  insertTokens(ids) {
    if (this.phase !== 'edit') {
      const first = tokenInfo(ids[0]) || {};
      // Manual p.17 "Consecutive Calculations": operator key while a result is displayed -> Ans.
      const chain = (first.kind === 'op' && !['=', ':', ','].includes(ids[0])) ||
        (first.kind === 'post' && !/^conv:/.test(ids[0]));
      const resTok = this.chainTok;
      const wasResult = this.phase === 'result';
      this.clearInput();
      this.tokens = chain && wasResult ? [resTok, ...ids] : [...ids];
      this.cursor = this.tokens.length;
      return;
    }
    if (this.tokens.length + ids.length > 99) return;
    if (this.insert || this.cursor >= this.tokens.length) this.tokens.splice(this.cursor, 0, ...ids);
    else this.tokens.splice(this.cursor, 1, ...ids);   // overwrite cursor (Manual p.9)
    this.cursor += ids.length;
  }

  del() {
    if (this.phase !== 'edit') return;
    const t = this.tokens;
    if (this.insert) { if (this.cursor > 0) { t.splice(this.cursor - 1, 1); this.cursor--; } return; }
    if (this.cursor < t.length) t.splice(this.cursor, 1);
    else if (t.length) { t.pop(); this.cursor = t.length; }
  }

  toggleIns() { if (this.phase === 'edit') this.insert = !this.insert; }

  editDisplayed(cursorAtEnd) {
    const toks = (this.histPos != null && this.history[this.histPos]) ? this.history[this.histPos].tokens : this.lastTokens || [];
    this.clearInput();
    this.tokens = toks.slice();
    this.cursor = cursorAtEnd ? this.tokens.length : 0;
  }

  leftRight(k) {
    if (this.phase === 'result' || this.phase === 'stat') {
      // HTML "Replay": ◀ or ▶ after a result edits the previous expression
      if (this.phase === 'stat') { this.clearInput(); return; }
      return this.editDisplayed(k === 'LEFT');
    }
    if (k === 'LEFT') this.cursor = this.cursor > 0 ? this.cursor - 1 : this.tokens.length;
    else this.cursor = this.cursor < this.tokens.length ? this.cursor + 1 : 0;
  }

  upDown(k, sh) {
    const mode = this.state.mode;
    if (mode === 'SD' || mode === 'REG') {
      if (this.phase !== 'edit' || this.tokens.length === 0) return this.openDataEditor(k === 'UP');
      return;
    }
    if (!this.history.length) return;
    if (sh && k === 'UP') {
      // SHIFT ▲ (COPY): HTML "Replay Copy" — join displayed..latest as multi-statement
      if (this.phase !== 'result' || this.histPos == null) return;
      const parts = this.history.slice(this.histPos).map((h) => h.tokens);
      const toks = [];
      parts.forEach((p, i) => { if (i) toks.push(':'); toks.push(...p); });
      this.clearInput(); this.tokens = toks; this.cursor = toks.length;
      return;
    }
    if (this.phase === 'edit' && this.tokens.length) return;
    let pos = this.histPos;
    if (pos == null) pos = this.phase === 'result' ? this.history.length - 1 : this.history.length;
    pos += k === 'UP' ? -1 : 1;
    if (pos < 0) pos = 0;
    if (pos > this.history.length - 1) pos = this.history.length - 1;
    const h = this.history[pos];
    this.clearInput();
    this.phase = 'result'; this.histPos = pos;
    this.value = h.value; this.view = {}; this.lastTokens = h.tokens; this.showZero = false;
  }

  errorKey(k) {
    // Manual p.32 "Error Messages": AC clears; ◀/▶ shows the calculation at the error position.
    if (k === 'AC') { this.clearInput(); this.showZero = true; return; }
    if (k === 'LEFT' || k === 'RIGHT') {
      const toks = this.errTokens || [];
      const pos = this.errPos;
      this.clearInput();
      this.tokens = toks.slice();
      this.cursor = pos != null ? Math.max(0, Math.min(pos, toks.length)) : toks.length;
    }
  }

  showError(e, tokens, onAC) {
    this.phase = 'error';
    this.errText = errMsg(e);
    this.errTokens = tokens || this.tokens.slice();
    this.errPos = e && Number.isInteger(e.pos) ? e.pos : null;
    if (onAC) this.screen = new ErrorScreen(this, this.errText, onAC);
  }

  // ---- evaluation ----------------------------------------------------------------------------
  evaluateSilently(tokens) {
    // evaluate a prompt/data value without touching Ans
    const ans = this.state.ans;
    try {
      const r = E.evaluate(tokens, this.state);
      return r.results[r.results.length - 1];
    } finally { this.state.ans = ans; }
  }

  exec(tokens, { record = true } = {}) {
    if (!tokens.length) return false;
    let r;
    try { r = E.evaluate(tokens, this.state); } catch (e) { this.showError(e, tokens); return false; }
    const results = (r && r.results) || [];
    this.clearInput();
    this.lastTokens = tokens.slice();
    this.results = results; this.resIdx = 0; this.views = (r && r.views) || [];
    this.value = results[0]; this.view = { ...(this.views[0] || {}) }; this.phase = 'result'; this.showZero = false;
    if (results.length > 1) this.resTokens = splitStatements(tokens);
    if (record && ['COMP', 'CMPLX', 'BASE'].includes(this.state.mode)) {
      this.history.push({ tokens: tokens.slice(), value: results[results.length - 1] });
      if (this.history.length > 30) this.history.shift();
    }
    if (isMat(this.value) || isVct(this.value)) this.openResultViewer(this.value);
    return true;
  }

  equals() {
    if (this.calcActive && this.phase === 'result') return this.openCalc(true);
    if (this.phase === 'result') {
      // multi-statement: = shows next result ("Disp", Manual p.10)
      if (this.results && this.resIdx < this.results.length - 1) {
        this.resIdx++; this.value = this.results[this.resIdx]; this.view = { ...((this.views || [])[this.resIdx] || {}) };
        if (isMat(this.value) || isVct(this.value)) this.openResultViewer(this.value);
        return;
      }
      // re-execute the last expression (e.g. Ran# example, HTML "Random Number")
      if (this.lastTokens) this.exec(this.lastTokens.slice());
      return;
    }
    if (this.phase === 'stat') return;
    if (!this.tokens.length) return;
    this.insert = false;
    this.exec(this.tokens.slice());
  }

  percent() {
    // SHIFT = (%) : HTML "Percent Calculations": A×B SHIFT=(%)
    if (this.phase !== 'edit' || !this.tokens.length) return;
    this.exec([...this.tokens, '%']);
  }

  toggleReIm() {
    // SHIFT = (Re⇔Im): Manual2 E-8
    if (this.phase !== 'result') return;
    this.view = { ...this.view, complexPart: this.view.complexPart === 'im' ? 're' : 'im' };
  }

  resFrac(sh) {
    // a b/c on result: decimal <-> fraction; SHIFT a b/c (d/c): mixed <-> improper (HTML "Fraction Calculations")
    if (!sh) {
      try { this.value = E.toggleFraction(this.value, this.state); this.view = { ...this.view, frac: null }; }
      catch (e) { this.showError(e, this.lastTokens); }
      return;
    }
    this.view = { ...this.view, frac: this.view.frac === 'improper' ? 'mixed' : 'improper' };
  }

  resEng(dir) {
    // ENG / SHIFT ENG(←): HTML "Using Engineering Notation".
    // Engine convention: first ENG = 0, each further ENG +1; first ←ENG = -1, then -1 per press.
    this.view = { ...this.view, eng: nextEng(this.view.eng, dir) };
  }

  currentValueForStore() {
    // value of the current input, or the displayed result
    if (this.phase === 'edit' && this.tokens.length) {
      const toks = this.tokens.slice();
      if (!this.exec(toks)) return undefined;
      return this.value;
    }
    if (this.phase === 'result') return this.value;
    if (this.phase === 'edit') return undefined;
    return undefined;
  }

  memPlus(sign) {
    // M+ / SHIFT M+ (M−): HTML "Independent Memory"; Ans updated too (HTML "Answer Memory").
    const toks = this.phase === 'edit' ? this.tokens.slice() : null;
    const v = this.currentValueForStore();
    if (v === undefined || this.phase === 'error') return;
    try { E.addToM(this.state, v, sign); this.state.ans = v; } catch (e) { return this.showError(e, toks); }
    this.topText = null;
  }

  doSto(name) {
    // SHIFT RCL (STO) var: HTML "Variables"
    const v = this.currentValueForStore();
    if (v === undefined || this.phase === 'error') return;
    try { E.storeVar(this.state, name, v); this.state.ans = v; } catch (e) { return this.showError(e); }
    this.topText = (this.lastTokens ? this.lastTokens.map(dispOf).join('') : 'Ans') + '→' + name;
  }

  doRcl(name) {
    // RCL var: shows "A=" and its value
    let v;
    try { v = E.recallVar(this.state, name); } catch (e) { return this.showError(e); }
    this.clearInput();
    this.phase = 'result'; this.value = v; this.view = {}; this.showZero = false;
    this.topText = name + '='; this.lastTokens = [name]; this.chainTok = name;
  }

  // ---- screens -----------------------------------------------------------------------------
  close() { this.screen = null; if (this.state.mode === 'EQN') this.openEqnSetup(); }

  menu(pages, opts = {}) { this.screen = new MenuScreen(this, pages, opts); }

  openMode() {
    // HTML "Calculation Mode" + "Configuring the Calculator Setup": MODE cycles these screens.
    const st = this.state;
    const pages = [
      { l1: 'COMP  CMPLX', l2: ' 1     2', act: { 1: () => this.setMode('COMP'), 2: () => this.setMode('CMPLX') } },
      { l1: 'SD  REG  BASE', l2: ' 1   2    3', act: { 1: () => this.setMode('SD'), 2: () => this.setMode('REG'), 3: () => this.setMode('BASE') } },
      { l1: 'EQN  MAT  VCT', l2: ' 1    2    3', act: { 1: () => this.setMode('EQN'), 2: () => this.setMode('MAT'), 3: () => this.setMode('VCT') } },
    ];
    // Angle / display settings cannot be changed in BASE (HTML "Calculation Mode" note)
    if (st.mode !== 'BASE') {
      pages.push(
        { l1: 'Deg  Rad  Gra', l2: ' 1    2    3', act: { 1: () => this.setSetup({ angle: 'Deg' }), 2: () => this.setSetup({ angle: 'Rad' }), 3: () => this.setSetup({ angle: 'Gra' }) } },
        { l1: 'Fix  Sci  Norm', l2: ' 1    2    3', act: { 1: () => this.openDigitPrompt('Fix', '0~9?', 0, 9, (d) => this.setSetup({ disp: 'Fix', fix: d })),
          2: () => this.openDigitPrompt('Sci', '0~9?', 0, 9, (d) => this.setSetup({ disp: 'Sci', sci: d === 0 ? 10 : d })),
          3: () => this.openDigitPrompt('Norm', '1~2?', 1, 2, (d) => this.setSetup({ disp: 'Norm', norm: d })) } },
        { l1: 'Disp', l2: ' 1', act: { 1: () => this.openDisp() } },
      );
    }
    this.menu(pages, { cycle: true, ownsMode: true });
  }

  openDisp() {
    // Disp sub-screens, ▶ / ◀ to move: EngON/OFF, (CMPLX/EQN: a+bi / r∠θ), ab/c / d/c, Dot / Comma
    const mode = this.state.mode;
    const pages = [{ l1: 'EngON  EngOFF', l2: '  1      2', act: { 1: () => this.setSetup({ eng: true }), 2: () => this.setSetup({ eng: false }) } }];
    if (mode === 'CMPLX' || mode === 'EQN') pages.push({ l1: 'a+bi   r∠θ', l2: '  1     2', act: { 1: () => this.setSetup({ cplx: 'a+bi' }), 2: () => this.setSetup({ cplx: 'r∠θ' }) } });
    pages.push({ l1: 'ab/c   d/c', l2: '  1     2', act: { 1: () => this.setSetup({ fracDisp: 'ab/c' }), 2: () => this.setSetup({ fracDisp: 'd/c' }) } });
    pages.push({ l1: 'Dot   Comma', l2: ' 1      2', act: { 1: () => this.setSetup({ dot: 'Dot' }), 2: () => this.setSetup({ dot: 'Comma' }) } });
    this.menu(pages, { arrows: true });
  }

  setSetup(obj) { Object.assign(this.state.setup, obj); this.close(); this.refreshAfterSetup(); }
  refreshAfterSetup() { if (this.phase === 'result') this.view = { ...this.view }; }

  openDigitPrompt(name, hint, lo, hi, done) {
    this.screen = {
      ownsMode: false,
      key: (k) => {
        if (k === 'AC') return this.close();
        if (DIGITS.includes(k) && +k >= lo && +k <= hi) done(+k);
      },
      view: () => ({ top: { text: `${name} ${hint}` } }),
    };
  }

  setMode(m) {
    // Changing mode clears replay memory and CALC memory (Manual p.9, Manual2 E-5)
    const st = this.state;
    st.mode = m;
    this.screen = null; this.history = []; this.calcMem = null; this.pending = null;
    this.clearInput(); this.showZero = true; this.view = {}; this.value = 0;
    if (m === 'BASE') { st.base = 'DEC'; }
    if (m === 'REG') return this.openRegType();
    if (m === 'EQN') return this.openEqnSetup();
  }

  openRegType() {
    // Manual p.28 "Regression Calculations": Lin Log Exp ▶ Pwr Inv Quad
    const set = (t) => () => { this.state.regType = t; this.screen = null; };
    this.menu([
      { l1: 'Lin  Log  Exp', l2: ' 1    2    3', act: { 1: set('Lin'), 2: set('Log'), 3: set('Exp') } },
      { l1: 'Pwr  Inv  Quad', l2: ' 1    2    3', act: { 1: set('Pwr'), 2: set('Inv'), 3: set('Quad') } },
    ], { arrows: true, noAC: true });
  }

  openClr() {
    // SHIFT MODE (CLR): HTML "Initializing", "Clearing the Contents of All Memories";
    // Manual p.26 "SHIFT CLR 1 (Scl) =" in SD/REG.
    const sdreg = ['SD', 'REG'].includes(this.state.mode);
    const first = sdreg ? 'Scl' : 'Mcl';
    const confirm = (what, fn) => () => {
      this.screen = {
        key: (k) => {
          if (k === 'AC') return this.close();
          if (k === 'EQ') {
            fn();
            // confirmation message; the next key closes it and is processed normally
            this.screen = {
              key: (k2, sh, al, hyp) => {
                this.close();
                if (k2 === 'AC') return;
                if (this.screen) this.screen.key(k2, sh, al, hyp); else this.main(k2, sh, al, hyp);
              },
              view: () => ({ top: { text: doneText[what] }, top2: ' ' }),
            };
          }
        },
        view: () => ({ top: { text: what === 'All' ? 'Reset All?' : what === 'Mode' ? 'Reset Setup?' : `Clear ${what}?` }, top2: '[=]:Yes [AC]:No' }),
      };
    };
    const doneText = { Mcl: 'Mcl Done', Scl: 'Stat Clear', Mode: 'Reset Setup', All: 'Reset All' };
    this.menu([{ l1: `${first}  Mode  All`, l2: ' 1     2     3', act: {
      1: confirm(first, () => (sdreg ? this.clearStat() : this.clearMem())),
      2: confirm('Mode', () => this.resetMode()),
      3: confirm('All', () => this.resetAll()),
    } }]);
  }

  clearMem() { for (const v of Object.keys(this.state.vars)) this.state.vars[v] = 0; this.state.ans = 0; this.value = 0; }
  clearStat() { this.state.stat.sd = []; this.state.stat.reg = []; this.lastData = null; }
  resetMode() {
    const fresh = E.createState();
    this.state.mode = fresh.mode; this.state.setup = { ...fresh.setup, cplx: 'a+bi' }; this.state.base = fresh.base;
    this.history = []; this.clearInput(); this.showZero = true; this.value = 0;
  }
  resetAll() {
    this.state = E.createState(); this.state.setup.cplx = 'a+bi';
    this.ui.eqn = { lin2: [], lin3: [], deg2: [], deg3: [] };
    this.history = []; this.calcMem = null; this.clearInput(); this.showZero = true; this.value = 0;
  }

  openConst(kind) {
    // CONST / SHIFT CONST (CONV) then a two-digit number (HTML "Scientific Constants", "Metric Conversion")
    if (this.state.mode === 'BASE') return;
    let digits = '';
    const list = kind === 'CONST' ? CONSTANTS : CONVERSIONS;
    this.screen = {
      key: (k) => {
        if (k === 'AC') { this.screen = null; return; }
        if (k === 'DEL') { digits = digits.slice(0, -1); return; }
        if (!DIGITS.includes(k)) return;
        digits += k;
        if (digits.length === 2) {
          const n = +digits;
          this.screen = null;
          if (n >= 1 && n <= list.length) this.insertTokens([(kind === 'CONST' ? 'const:' : 'conv:') + digits]);
        }
      },
      view: () => {
        const c = digits.length ? '' : '';
        return { top: { text: `${kind} ${digits}${c}_` }, top2: kind === 'CONST' ? '01~40?' : '01~40?' };
      },
    };
  }

  openDrg() {
    // SHIFT Ans (DRG▸): HTML "Angle Unit Conversion" — D R G / 1 2 3
    this.menu([{ l1: 'D    R    G', l2: '1    2    3', act: {
      1: () => { this.screen = null; this.insertTokens(['°']); },
      2: () => { this.screen = null; this.insertTokens(['r']); },
      3: () => { this.screen = null; this.insertTokens(['g']); },
    } }]);
  }

  openLogic() {
    // [x⁻¹](LOGIC) cycles: and or xnor / xor Not Neg / d h b o (HTML "Logical and Negation Operations")
    const ins = (t) => () => { this.screen = null; this.insertTokens([t]); };
    this.menu([
      { l1: 'and  or  xnor', l2: ' 1   2    3', act: { 1: ins('and'), 2: ins('or'), 3: ins('xnor') } },
      { l1: 'xor  Not  Neg', l2: ' 1    2    3', act: { 1: ins('xor'), 2: ins('Not('), 3: ins('Neg(') } },
      { l1: 'd  h  b  o', l2: '1  2  3  4', act: { 1: ins('d'), 2: ins('h'), 3: ins('b'), 4: ins('o') } },
    ], { cycle: true, cycleKey: 'XINV' });
  }

  openStatMenu(which) {
    // S-SUM / S-VAR (HTML "Standard Deviation", "Regression Calculations" tables)
    const reg = this.state.mode === 'REG';
    const quad = reg && this.state.regType === 'Quad';
    const ins = (t) => () => { this.screen = null; this.insertTokens([t]); };
    const page = (labels, ids) => ({
      l1: labels.join('  '), l2: labels.map((l, i) => String(i + 1).padEnd(l.length + 2)).join(''),
      act: Object.fromEntries(ids.map((id, i) => [i + 1, ins(id)])),
    });
    let pages;
    if (which === 'SUM') {
      pages = [page(['Σx²', 'Σx', 'n'], ['Σx²', 'Σx', 'n'])];
      if (reg) pages.push(page(['Σy²', 'Σy', 'Σxy'], ['Σy²', 'Σy', 'Σxy']));
      if (quad) pages.push(page(['Σx³', 'Σx²y', 'Σx⁴'], ['Σx³', 'Σx²y', 'Σx⁴']));
    } else {
      pages = [page(['x̄', 'xσn', 'xσn-1'], ['x̄', 'xσn', 'xσn-1'])];
      if (reg) {
        pages.push(page(['ȳ', 'yσn', 'yσn-1'], ['ȳ', 'yσn', 'yσn-1']));
        pages.push(quad ? page(['A', 'B', 'C'], ['regA', 'regB', 'regC']) : page(['A', 'B', 'r'], ['regA', 'regB', 'regr']));
        pages.push(quad ? page(['x̂1', 'x̂2', 'ŷ'], ['x̂1', 'x̂2', 'ŷ']) : page(['x̂', 'ŷ'], ['x̂', 'ŷ']));
      }
    }
    this.menu(pages, { arrows: true });
  }

  openDistr() {
    // SHIFT 3 (DISTR): P( Q( R( ▶t (Manual2 E-12 "Normal Distribution")
    const ins = (t) => () => { this.screen = null; this.insertTokens([t]); };
    this.menu([{ l1: 'P(  Q(  R(  ▶t', l2: '1   2   3   4', act: { 1: ins('P('), 2: ins('Q('), 3: ins('R('), 4: ins('>t') } }]);
  }

  // ---- SD / REG data entry ---------------------------------------------------------------------
  statRows() { return this.state.mode === 'SD' ? this.state.stat.sd : this.state.stat.reg; }

  parseDataTokens(tokens) {
    // <x>[,<y>][;<freq>]  (HTML "Standard Deviation": "110 SHIFT ,(;) 10 DT")
    const parts = [[]]; const seps = [];
    let depth = 0;
    for (const t of tokens) {
      if (t === '(' || (tokenInfo(t) || {}).disp?.endsWith('(')) depth++;
      if (t === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && (t === ',' || t === 'semi')) { seps.push(t); parts.push([]); continue; }
      parts[parts.length - 1].push(t);
    }
    const val = (p) => this.evaluateSilently(p);
    const reg = this.state.mode === 'REG';
    let x, y = 0, freq = 1;
    x = val(parts[0]);
    let i = 1;
    if (reg) {
      if (seps[0] === ',') { y = val(parts[1]); i = 2; } else throw Object.assign(new Error('Syntax ERROR'));
    }
    if (i < parts.length) { if (seps[i - 1] !== 'semi') throw new Error('Syntax ERROR'); freq = val(parts[i]); }
    if (typeof x !== 'number' || typeof y !== 'number' || typeof freq !== 'number') throw new Error('Math ERROR');
    return reg ? { x, y, freq } : { x, freq };
  }

  statDT() {
    let row;
    if (this.phase === 'edit' && this.tokens.length) {
      try { row = this.parseDataTokens(this.tokens); } catch (e) { return this.showError(e, this.tokens.slice()); }
    } else if (this.lastData) row = { ...this.lastData };      // DT DT inputs the same data twice
    else return;
    this.statRows().push(row);
    this.lastData = row;
    this.showStatN();
  }

  statCL() {
    // SHIFT M+ (CL): delete the data just input (Manual p.27)
    const rows = this.statRows();
    if (!rows.length) return;
    rows.pop(); this.lastData = null;
    this.showStatN();
  }

  showStatN() {
    // Display "n=" and the number of data (Manual p.26)
    const n = this.statRows().reduce((s, r) => s + (r.freq ?? 1), 0);
    this.clearInput();
    this.phase = 'stat'; this.topText = 'n='; this.value = n; this.view = {}; this.showZero = false;
  }

  openDataEditor(fromTop) {
    const rows = this.statRows();
    if (!rows.length) return;
    this.screen = new DataEditor(this, fromTop);
  }

  // ---- CALC / SOLVE --------------------------------------------------------------------------
  promptVars(tokens, forSolve) {
    // CALC: engine leaves out the target of "Y=..." (stored automatically); SOLVE: every variable
    let vars = [];
    try { vars = E.variablesIn(tokens, forSolve ? { solve: true } : {}) || []; } catch { vars = []; }
    return vars;
  }

  openCalc(again = false) {
    // CALC: HTML "Using CALC" — COMP and CMPLX only
    const mode = this.state.mode;
    if (mode !== 'COMP' && mode !== 'CMPLX') return;
    let tokens;
    if (again || (this.phase !== 'edit' && this.calcMem)) tokens = this.calcMem;
    else tokens = this.phase === 'edit' ? this.tokens.slice() : (this.lastTokens || []).slice();
    if (!tokens || !tokens.length) return;
    this.calcMem = tokens.slice();
    const vars = this.promptVars(tokens, false);
    const finish = () => {
      this.screen = null;
      if (this.exec(tokens.slice())) { this.calcActive = true; this.lastTokens = tokens.slice(); }
    };
    if (!vars.length) return finish();
    this.screen = new PromptScreen(this, vars, { onDone: finish, editTokens: tokens });
  }

  openSolve() {
    // SHIFT CALC (SOLVE): HTML "Using SOLVE" — COMP only
    if (this.state.mode !== 'COMP') return;
    let tokens = this.phase === 'edit' && this.tokens.length ? this.tokens.slice() : (this.solveTokens || this.lastTokens || []).slice();
    if (!tokens.length) return;
    this.solveTokens = tokens.slice();
    const vars = this.promptVars(tokens, true);
    if (!vars.length) return;
    this.screen = new PromptScreen(this, vars, {
      solve: true,
      editTokens: tokens,
      onSolve: (v) => {
        let x;
        try { x = E.solve(tokens, v, E.recallVar(this.state, v), this.state); } catch (e) {
          this.screen = null; this.clearInput(); return this.showError(e, tokens);
        }
        try { E.storeVar(this.state, v, x); } catch { /* engine may store already */ }
        this.screen = null; this.clearInput();
        this.phase = 'result'; this.value = x; this.view = {}; this.showZero = false;
        this.topText = v + '='; this.lastTokens = tokens.slice(); this.chainTok = v; this.solveActive = v;
      },
    });
  }

  // ---- EQN -----------------------------------------------------------------------------------
  openEqnSetup() {
    // EQN: "Unknowns? 2 3" ▶ "Degree? 2 3" (Manual p.22/24)
    this.menu([
      { l1: 'Unknowns?', l2: '  2   3', act: { 2: () => this.openEqnCoef('lin2'), 3: () => this.openEqnCoef('lin3') } },
      { l1: 'Degree?', l2: '  2   3', act: { 2: () => this.openEqnCoef('deg2'), 3: () => this.openEqnCoef('deg3') } },
    ], { arrows: true, noAC: true });
  }

  openEqnCoef(type) {
    const names = {
      lin2: ['a1', 'b1', 'c1', 'a2', 'b2', 'c2'],
      lin3: ['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2', 'a3', 'b3', 'c3', 'd3'],
      deg2: ['a', 'b', 'c'], deg3: ['a', 'b', 'c', 'd'],
    }[type];
    const vals = this.ui.eqn[type] || (this.ui.eqn[type] = []);
    while (vals.length < names.length) vals.push(0);
    this.screen = new CoefScreen(this, names.map((n) => n + '?'), vals, () => this.solveEqn(type));
  }

  solveEqn(type) {
    const v = this.ui.eqn[type];
    let roots, labels;
    try {
      if (type === 'lin2') { roots = EQN.solveLinear([v.slice(0, 3), v.slice(3, 6)]); labels = ['x=', 'y=']; }
      else if (type === 'lin3') { roots = EQN.solveLinear([v.slice(0, 4), v.slice(4, 8), v.slice(8, 12)]); labels = ['x=', 'y=', 'z=']; }
      else if (type === 'deg2') { roots = EQN.solveQuadratic(v[0], v[1], v[2]); labels = ['x1=', 'x2=']; }
      else { roots = EQN.solveCubic(v[0], v[1], v[2], v[3]); labels = ['x1=', 'x2=', 'x3=']; }
    } catch (e) {
      this.showError(e, [], () => this.openEqnCoef(type));
      return;
    }
    this.screen = new ListViewer(this, roots.map((r, i) => ({ label: labels[i], value: r })), {
      onAC: () => this.openEqnCoef(type), vertical: true,
    });
  }

  // ---- MAT / VCT -----------------------------------------------------------------------------
  openMatMenu(kind) {
    // SHIFT 4 (MAT): Dim Edit Mat ▶ Det Trn ; SHIFT 5 (VCT): Dim Edit Vct ▶ Dot (HTML "Matrix/Vector Calculations")
    const P = kind === 'MAT' ? 'Mat' : 'Vct';
    const ins = (t) => () => { this.screen = null; this.insertTokens([t]); };
    const choose = (then, withAns) => () => this.menu([{
      l1: withAns ? `${P}A B C Ans` : `${P}A  B  C`, l2: withAns ? '   1 2 3  4' : '   1  2  3',
      act: Object.fromEntries(['A', 'B', 'C', ...(withAns ? ['Ans'] : [])].map((n, i) => [i + 1, () => then(n)])),
    }]);
    const pages = [
      { l1: `Dim Edit ${P}`, l2: ' 1   2    3', act: {
        1: choose((n) => this.openDim(kind, n)),
        2: choose((n) => this.openElemEditor(kind, n)),
        3: choose((n) => ins(P + n)(), true),
      } },
      kind === 'MAT'
        ? { l1: 'Det  Trn', l2: ' 1    2', act: { 1: ins('Det'), 2: ins('Trn') } }
        : { l1: 'Dot', l2: ' 1', act: { 1: ins('·') } },
    ];
    this.menu(pages, { arrows: true });
  }

  openDim(kind, name) {
    const store = kind === 'MAT' ? this.state.mat : this.state.vct;
    const P = kind === 'MAT' ? 'Mat' : 'Vct';
    const asks = kind === 'MAT' ? ['m', 'n'] : ['m'];
    const got = [];
    let typed = '';
    this.screen = {
      key: (k) => {
        if (k === 'AC') return this.close();
        if (k === 'DEL') { typed = typed.slice(0, -1); return; }
        if (DIGITS.includes(k)) { typed = k; return; }
        if (k === 'EQ' && typed) {
          const d = +typed; typed = '';
          const ok = kind === 'MAT' ? d >= 1 && d <= 3 : d >= 2 && d <= 3;
          if (!ok) return;
          got.push(d);
          if (got.length === asks.length) {
            if (kind === 'MAT') store[name] = { rows: got[0], cols: got[1], data: Array.from({ length: got[0] }, () => Array(got[1]).fill(0)) };
            else store[name] = { dim: got[0], data: Array(got[0]).fill(0) };
            this.openElemEditor(kind, name);
          }
        }
      },
      view: () => ({
        top: { text: kind === 'MAT' ? `${P}${name}(m×n) ${asks[got.length]}?` : `${P}${name}(m) m?` },
        top2: null, bottom: { main: typed ? typed + '.' : (kind === 'MAT' ? '0.' : '0.') },
      }),
    };
  }

  openElemEditor(kind, name) {
    const store = kind === 'MAT' ? this.state.mat : this.state.vct;
    const m = store[name];
    if (!m) return this.showError(new Error('Dim ERROR'), [], () => this.close());
    this.screen = new ElemEditor(this, kind, name, m);
  }

  openResultViewer(v) {
    this.screen = new ElemEditor(this, isMat(v) ? 'MAT' : 'VCT', 'Ans', v, true);
  }

  // ---- render model ------------------------------------------------------------------------
  fmt(value, view = this.view) {
    let f;
    try { f = E.format(value, this.state, view) || { main: '' }; } catch (e) { console.error(e); return { main: String(value) }; }
    // map engine indicators onto LCD symbols: R⇔I, r∠θ, ∠ before θ, i after imaginary part, ENG symbol
    const ind = f.indicators || {};
    let main = f.main || '';
    if (ind.angle) main = '∠' + main;
    if (ind.i) main += 'i';
    if (ind.engSym) main += ind.engSym;
    return { main, exp: f.exp, neg: f.neg, indicators: { 'R⇔I': !!ind.RI, 'r∠θ': !!ind.polar } };
  }

  indicators(extra) {
    const st = this.state, s = new Set();
    if (this.shift) s.add('S');
    if (this.alpha) s.add('A');
    const M = st.vars && st.vars.M;
    if (M && (typeof M !== 'object' || M.re || M.im)) s.add('M');
    if (this.pending) s.add(this.pending);
    if (['SD', 'REG', 'CMPLX', 'MAT', 'VCT'].includes(st.mode)) s.add(st.mode);
    if (st.setup.disp === 'Fix') s.add('FIX');
    if (st.setup.disp === 'Sci') s.add('SCI');
    if (st.setup.eng && st.mode !== 'BASE') s.add('Eng');
    if (st.mode !== 'BASE') s.add(st.setup.angle[0]);
    if (st.setup.cplx === 'r∠θ' && (st.mode === 'CMPLX' || st.mode === 'EQN')) s.add('r∠θ');
    if (extra) for (const x of extra) s.add(x);
    return s;
  }

  render() {
    if (this.screen) {
      const v = this.screen.view();
      const extra = new Set(v.ind || []);
      if (v.bottom && v.bottom.indicators) for (const [n, on] of Object.entries(v.bottom.indicators)) if (on) extra.add(n);
      const out = { ind: this.indicators(extra), top: v.top, top2: v.top2, bottom: v.bottom || null };
      if (this.state.mode === 'BASE' && out.bottom) out.bottom.base = BASE_LETTER[this.state.base];
      return { lcd: out, tb: v.tb || null };
    }
    const extra = [];
    let top, bottom = null, tb = null;
    if (this.phase === 'error') {
      top = { text: this.errText };
    } else if (this.phase === 'edit') {
      const { chars, cur } = this.charsOf(this.tokens, this.cursor);
      top = { chars, cursor: cur, insert: this.insert };
      bottom = this.showZero ? this.fmt(0, {}) : this.fmt(this.value);
      if (!this.tokens.length && this.history.length && ['COMP', 'CMPLX', 'BASE'].includes(this.state.mode)) extra.push('▲');
      tb = { tokens: this.tokens, cursor: this.cursor };
    } else {
      const shown = this.results && this.results.length > 1 && this.resTokens ? this.resTokens[this.resIdx] : this.lastTokens || [];
      if (this.topText) top = { text: this.topText };
      else { const { chars } = this.charsOf(shown, null); top = { chars, cursor: null }; }
      bottom = this.fmt(this.value);
      if (this.results && this.resIdx < this.results.length - 1) extra.push('Disp');
      if (this.histPos != null) {
        if (this.histPos > 0) extra.push('▲');
        if (this.histPos < this.history.length - 1) extra.push('▼');
      } else if (this.phase === 'result' && this.history.length > 1) extra.push('▲');
      if (isCplx(this.value) && this.value.im) extra.push('R⇔I');
      tb = { tokens: shown, cursor: null };
    }
    if (bottom && bottom.indicators) for (const [n, on] of Object.entries(bottom.indicators)) if (on) extra.push(n);
    if (bottom && this.state.mode === 'BASE') bottom = { ...bottom, base: BASE_LETTER[this.state.base] };
    return { lcd: { ind: this.indicators(extra), top, bottom }, tb };
  }

  charsOf(tokens, cursor) {
    const chars = []; let cur = null;
    tokens.forEach((t, i) => { if (i === cursor) cur = chars.length; chars.push(...dispOf(t)); });
    if (cursor != null && cursor >= tokens.length) cur = chars.length;
    return { chars, cur };
  }
}

function nextEng(cur, dir) {
  if (!Number.isInteger(cur)) return dir > 0 ? 0 : -1;
  return cur + dir;
}

function splitStatements(tokens) {
  const out = [[]];
  for (const t of tokens) { if (t === ':') out.push([]); else out[out.length - 1].push(t); }
  return out;
}

// ---- generic screens ------------------------------------------------------------------------
class MenuScreen {
  // pages: [{l1, l2, act:{digit: fn}}]; opts: cycle (MODE/cycleKey moves to next page), arrows (◀▶ pages)
  constructor(c, pages, opts) {
    this.c = c; this.pages = pages; this.i = 0; this.opts = opts;
    this.ownsMode = !!opts.ownsMode;
  }
  key(k) {
    const o = this.opts, n = this.pages.length;
    if (k === (o.cycleKey || 'MODE') && o.cycle) { this.i = (this.i + 1) % n; return; }
    if (k === 'MODE' && !o.cycle) { this.c.openMode(); return; }
    if (k === 'RIGHT' && n > 1) { this.i = (this.i + 1) % n; return; }
    if (k === 'LEFT' && n > 1) { this.i = (this.i - 1 + n) % n; return; }
    if (k === 'AC') { if (!o.noAC) this.c.close(); return; }
    const f = this.pages[this.i].act[k];
    if (f) f();
  }
  view() {
    const p = this.pages[this.i], n = this.pages.length;
    const ind = [];
    if (n > 1 && this.opts.arrows) { if (this.i > 0) ind.push('◀'); if (this.i < n - 1) ind.push('▶'); }
    return { top: { text: p.l1 }, top2: p.l2 || ' ', ind };
  }
}

class ErrorScreen {
  constructor(c, text, onAC) { this.c = c; this.text = text; this.onAC = onAC; }
  key(k) { if (k === 'AC' || k === 'LEFT' || k === 'RIGHT') { this.c.phase = 'edit'; this.c.screen = null; this.onAC(); } }
  view() { return { top: { text: this.text } }; }
}

// Value entry shared by prompt screens: typed tokens with append/DEL editing.
class ValueEntry {
  constructor(c) { this.c = c; this.toks = []; }
  key(k, sh, al, hyp) {
    if (k === 'DEL') { this.toks.pop(); return true; }
    const t = this.c.resolveTokens(k, sh, al, hyp);
    if (t && !t.includes('semi')) { this.toks.push(...t); return true; }
    return false;
  }
  get empty() { return !this.toks.length; }
  value() { return this.c.evaluateSilently(this.toks); }
  top() { const { chars } = this.c.charsOf(this.toks, this.toks.length); return { chars, cursor: chars.length, insert: false }; }
}

class PromptScreen {
  // CALC / SOLVE variable prompts: "X?" with current value (HTML "Using CALC" / "Using SOLVE")
  constructor(c, vars, opts) { this.c = c; this.vars = vars; this.i = 0; this.opts = opts; this.ve = new ValueEntry(c); }
  commit() {
    if (this.ve.empty) return true;
    try { E.storeVar(this.c.state, this.vars[this.i], this.ve.value()); }
    catch (e) { this.c.screen = null; this.c.clearInput(); this.c.showError(e, this.opts.editTokens); return false; }
    this.ve = new ValueEntry(this.c);
    return true;
  }
  key(k, sh, al, hyp) {
    const c = this.c;
    if (k === 'AC') { c.screen = null; c.clearInput(); c.calcActive = false; return; }
    if (this.opts.solve && k === 'CALC' && sh) { if (this.commit()) this.opts.onSolve(this.vars[this.i]); return; }
    if (k === 'EQ' && !sh && !al) {
      if (!this.commit()) return;
      if (this.i < this.vars.length - 1) { this.i++; return; }
      if (this.opts.solve) { this.i = this.vars.length - 1; return; }
      this.opts.onDone();
      return;
    }
    if (k === 'DOWN') { if (this.commit() && this.i < this.vars.length - 1) this.i++; return; }
    if (k === 'UP') { if (this.commit() && this.i > 0) this.i--; return; }
    if (k === 'LEFT' || k === 'RIGHT') {
      // back to editing the stored expression
      const t = this.opts.editTokens; c.screen = null; c.clearInput(); c.tokens = t.slice(); c.cursor = k === 'LEFT' ? t.length : 0; return;
    }
    this.ve.key(k, sh, al, hyp);
  }
  view() {
    const v = this.vars[this.i];
    let cur; try { cur = E.recallVar(this.c.state, v); } catch { cur = 0; }
    const ind = [];
    if (this.i > 0) ind.push('▲');
    if (this.i < this.vars.length - 1) ind.push('▼');
    return { top: this.ve.empty ? { text: v + '?' } : this.ve.top(), bottom: this.c.fmt(cur, {}), ind, tb: { tokens: this.opts.editTokens, cursor: null } };
  }
}

class CoefScreen {
  // EQN coefficient entry: "a1?" + current value; ▲▼ move; = commits & advances (Manual p.22-25)
  constructor(c, labels, vals, onDone) { this.c = c; this.labels = labels; this.vals = vals; this.i = 0; this.onDone = onDone; this.ve = new ValueEntry(c); }
  commit() {
    if (this.ve.empty) return true;
    let v;
    try { v = this.ve.value(); } catch (e) { this.ve = new ValueEntry(this.c); return false; }
    if (typeof v !== 'number') { this.ve = new ValueEntry(this.c); return false; }   // complex coefficients not allowed
    this.vals[this.i] = v; this.ve = new ValueEntry(this.c);
    return true;
  }
  key(k, sh, al, hyp) {
    if (k === 'AC') { this.ve = new ValueEntry(this.c); return; }
    if (k === 'EQ' && !sh) {
      if (!this.commit()) return;
      if (this.i < this.labels.length - 1) { this.i++; return; }
      this.onDone(); return;
    }
    if (k === 'DOWN') { if (this.commit() && this.i < this.labels.length - 1) this.i++; return; }
    if (k === 'UP') { if (this.commit() && this.i > 0) this.i--; return; }
    this.ve.key(k, sh, al, hyp);
  }
  view() {
    const ind = [];
    if (this.i > 0) ind.push('▲');
    if (this.i < this.labels.length - 1) ind.push('▼');
    return { top: this.ve.empty ? { text: this.labels[this.i] } : this.ve.top(), bottom: this.c.fmt(this.vals[this.i], {}), ind };
  }
}

class ListViewer {
  // EQN solutions x1= x2= ... ; ▲▼ page; SHIFT = (Re⇔Im) for complex (Manual p.23)
  constructor(c, items, opts) { this.c = c; this.items = items; this.i = 0; this.opts = opts; this.view_ = {}; }
  key(k, sh) {
    if (k === 'DOWN' && this.i < this.items.length - 1) { this.i++; this.view_ = {}; return; }
    if (k === 'UP' && this.i > 0) { this.i--; this.view_ = {}; return; }
    if (k === 'EQ' && sh) { this.view_ = { complexPart: this.view_.complexPart === 'im' ? 're' : 'im' }; return; }
    if (k === 'AC') { this.opts.onAC(); return; }
    if (k === 'ENG') { this.view_ = { ...this.view_, eng: nextEng(this.view_.eng, sh ? -1 : 1) }; }
  }
  view() {
    const it = this.items[this.i];
    const ind = [];
    if (this.i > 0) ind.push('▲');
    if (this.i < this.items.length - 1) ind.push('▼');
    if (isCplx(it.value) && it.value.im) ind.push('R⇔I');
    const view = this.view_;
    const label = view.complexPart === 'im' ? it.label : it.label;
    return { top: { text: label }, bottom: this.c.fmt(it.value, view), ind };
  }
}

class ElemEditor {
  // Matrix / vector element editor (Dim/Edit) and MatAns/VctAns viewer.
  // Labels "MatA11", "VctA1" (Manual2 E-15/E-19); ◀▶▲▼ move, = stores and advances, AC exits.
  constructor(c, kind, name, m, readonly = false) {
    this.c = c; this.kind = kind; this.name = name; this.m = m; this.ro = readonly; this.r = 0; this.col = 0;
    this.ve = new ValueEntry(c);
  }
  get rows() { return this.kind === 'MAT' ? this.m.rows : 1; }
  get cols() { return this.kind === 'MAT' ? this.m.cols : this.m.dim; }
  get cell() { return this.kind === 'MAT' ? this.m.data[this.r][this.col] : this.m.data[this.col]; }
  set cell(v) { if (this.kind === 'MAT') this.m.data[this.r][this.col] = v; else this.m.data[this.col] = v; }
  next() {
    if (this.col < this.cols - 1) this.col++;
    else if (this.r < this.rows - 1) { this.r++; this.col = 0; }
  }
  key(k, sh, al, hyp) {
    const c = this.c;
    if (k === 'AC') {
      c.screen = null;
      if (this.ro) { c.clearInput(); c.showZero = true; } // leave result
      return;
    }
    if (k === 'LEFT') { if (this.col > 0) this.col--; else if (this.r > 0) { this.r--; this.col = this.cols - 1; } return; }
    if (k === 'RIGHT') { this.next(); return; }
    if (k === 'UP') { if (this.r > 0) this.r--; else if (this.kind === 'VCT' && this.col > 0) this.col--; return; }
    if (k === 'DOWN') { if (this.r < this.rows - 1) this.r++; else if (this.kind === 'VCT') this.next(); return; }
    if (this.ro) {
      // operators on a matrix result continue the calculation with MatAns/VctAns
      const t = c.resolveTokens(k, sh, al, hyp);
      if (t && (tokenInfo(t[0]) || {}).kind === 'op') {
        c.screen = null; c.clearInput();
        c.tokens = [(this.kind === 'MAT' ? 'Mat' : 'Vct') + 'Ans', ...t]; c.cursor = c.tokens.length;
      } else if (k === 'EQ') { /* stay */ }
      return;
    }
    if (k === 'EQ' && !sh) {
      if (!this.ve.empty) {
        let v;
        try { v = this.ve.value(); } catch (e) { this.ve = new ValueEntry(c); return; }
        if (typeof v === 'number') this.cell = v;
        this.ve = new ValueEntry(c);
      }
      this.next();
      return;
    }
    this.ve.key(k, sh, al, hyp);
  }
  view() {
    const P = this.kind === 'MAT' ? 'Mat' : 'Vct';
    const label = this.kind === 'MAT' ? `${P}${this.name}${this.r + 1}${this.col + 1}` : `${P}${this.name}${this.col + 1}`;
    const ind = [];
    if (this.kind === 'MAT') {
      if (this.r > 0) ind.push('▲');
      if (this.r < this.rows - 1) ind.push('▼');
    }
    if (this.col > 0) ind.push('◀');
    if (this.col < this.cols - 1) ind.push('▶');
    return { top: this.ve.empty ? { text: label } : this.ve.top(), bottom: this.c.fmt(this.cell, {}), ind };
  }
}

class DataEditor {
  // SD/REG data browsing & editing with ▲▼ (HTML "Standard Deviation" — Data Input Precautions):
  // shows x1 / y1 / Freq1 ..., new value + = replaces, DT adds as new, SHIFT CL deletes item.
  constructor(c, up) {
    // ▼ from the calculation screen starts at the first item, ▲ at the last
    this.c = c; this.ve = new ValueEntry(c);
    this.build();
    this.i = up ? this.items.length - 1 : 0;
  }
  build() {
    const rows = this.c.statRows(), reg = this.c.state.mode === 'REG';
    this.items = [];
    rows.forEach((r, idx) => {
      this.items.push({ label: `x${idx + 1}=`, row: r, f: 'x' });
      if (reg) this.items.push({ label: `y${idx + 1}=`, row: r, f: 'y' });
      if ((r.freq ?? 1) !== 1) this.items.push({ label: `Freq${idx + 1}=`, row: r, f: 'freq' });
    });
  }
  key(k, sh, al, hyp) {
    const c = this.c;
    if (k === 'AC') { c.screen = null; c.clearInput(); return; }
    if (k === 'DOWN') { if (this.i < this.items.length - 1) this.i++; this.ve = new ValueEntry(c); return; }
    if (k === 'UP') { if (this.i > 0) this.i--; this.ve = new ValueEntry(c); return; }
    if (k === 'MPLUS' && sh) {
      const rows = c.statRows(); const r = this.items[this.i].row;
      rows.splice(rows.indexOf(r), 1);
      this.build();
      if (!this.items.length) { c.screen = null; c.showStatN(); return; }
      this.i = Math.min(this.i, this.items.length - 1);
      return;
    }
    if (k === 'MPLUS' && !sh && !al) {
      // DT while editing: register the typed value as new data, keep the old one
      if (this.ve.empty) return;
      c.screen = null; c.clearInput(); c.tokens = this.ve.toks.slice(); c.cursor = c.tokens.length; c.statDT();
      return;
    }
    if (k === 'EQ' && !sh) {
      if (this.ve.empty) return;
      let v; try { v = this.ve.value(); } catch { this.ve = new ValueEntry(c); return; }
      if (typeof v === 'number') this.items[this.i].row[this.items[this.i].f] = v;
      this.ve = new ValueEntry(c);
      this.build();
      if (this.i < this.items.length - 1) this.i++;
      return;
    }
    this.ve.key(k, sh, al, hyp);
  }
  view() {
    const it = this.items[this.i];
    const ind = [];
    if (this.i > 0) ind.push('▲');
    if (this.i < this.items.length - 1) ind.push('▼');
    return { top: this.ve.empty ? { text: it.label } : this.ve.top(), bottom: this.c.fmt(it.row[it.f] ?? 1, {}), ind };
  }
}
