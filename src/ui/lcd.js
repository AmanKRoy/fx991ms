// LCD renderer for the fx-991MS two-line display.
// Manual (HTML) "Reading the Display": (1) calculation formula (dot-matrix upper line),
// (2) calculation result (lower line, 10-digit mantissa + 2-digit exponent), (3) indicators.
// Manual (User's Guide p.7 "Two-line Display"): upper line formula, lower line result.

export const TOP_COLS = 13;              // visible characters of the dot-matrix line

// Indicator slots, in left-to-right order of the real LCD indicator row.
const IND = ['S', 'A', 'M', 'STO', 'RCL', 'SD', 'REG', 'CMPLX', 'MAT', 'VCT', 'FIX', 'SCI', 'Eng',
  'D', 'R', 'G', '◀', '▲', '▼', '▶', 'Disp', 'R⇔I', 'r∠θ'];

// ---- 7-segment glyphs (lower line) --------------------------------------------------------
const SEG = {
  a: [2, 1, 8, 1], b: [9, 2, 9, 8], c: [9, 10, 9, 16], d: [2, 17, 8, 17],
  e: [1, 10, 1, 16], f: [1, 2, 1, 8], g: [2, 9, 8, 9],
};
const GLYPH = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'fabc',
  8: 'abcdefg', 9: 'abcdfg', '-': 'g', A: 'abcefg', a: 'abcefg', b: 'cdefg', B: 'cdefg', C: 'adef',
  c: 'deg', d: 'bcdeg', D: 'bcdeg', E: 'adefg', e: 'adefg', F: 'aefg', f: 'aefg', H: 'bcefg', h: 'cefg',
  o: 'cdeg', O: 'abcdef', r: 'eg', ' ': '', _: 'd', n: 'ceg', P: 'abefg', L: 'def', t: 'defg', u: 'cde',
};
const ADV = 12;

function segGlyph(ch, x, y, s) {
  const segs = GLYPH[ch];
  let out = '';
  for (const n of 'abcdefg') {
    const [x1, y1, x2, y2] = SEG[n];
    const on = segs.includes(n);
    out += `<line class="${on ? 'on' : 'off'}" x1="${x + x1 * s}" y1="${y + y1 * s}" x2="${x + x2 * s}" y2="${y + y2 * s}" stroke-width="${2.2 * s}"/>`;
  }
  return out;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Build an SVG string for a lower-line text (right aligned by the container).
function segLine(text, scale = 1) {
  const s = scale;
  let x = 0, body = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '.' || ch === ',') {
      // decimal point / separator sits between digits without taking a full cell
      const px = x - 1.2 * s;
      body += `<circle class="on" cx="${px}" cy="${17.2 * s}" r="${1.15 * s}"/>`;
      if (ch === ',') body += `<line class="on" x1="${px}" y1="${17.6 * s}" x2="${px - 1.2 * s}" y2="${19.6 * s}" stroke-width="${0.9 * s}"/>`;
      x += 1.4 * s;
    } else if (GLYPH[ch] !== undefined) {
      body += segGlyph(ch, x, 0, s);
      x += ADV * s;
    } else {
      // non-segment symbols (fraction mark ┘, °, ∠, i, engineering symbols ...)
      const w = ch === '┘' ? 9 : 10;
      body += `<text class="on" x="${x + 0.5 * s}" y="${17 * s}" font-size="${15 * s}">${esc(ch)}</text>`;
      x += w * s;
    }
  }
  const W = Math.max(1, x + 1);
  return { svg: `<svg viewBox="-1 -1 ${W + 1} ${21 * s}" width="${W + 1}" height="${21 * s}" class="seg" style="--w:${W + 1};--h:${21 * s}">${body}</svg>`, width: W };
}

export class LCD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="ind">${IND.map((n) => `<span data-i="${esc(n)}">${n === 'D' || n === 'R' || n === 'G' ? `<b>${n}</b>` : esc(n)}</span>`).join('')}</div>
      <div class="top"><div class="topline"></div><div class="topline2"></div></div>
      <div class="bot"><div class="main"></div><div class="expo"><span class="x10">×10</span><span class="ev"></span></div></div>`;
    this.indEls = {};
    root.querySelectorAll('.ind span').forEach((el) => { this.indEls[el.dataset.i] = el; });
    this.top = root.querySelector('.topline');
    this.top2 = root.querySelector('.topline2');
    this.main = root.querySelector('.main');
    this.expo = root.querySelector('.expo');
    this.ev = root.querySelector('.ev');
    this.off = 0;
  }

  // view = { ind:Set, top:{chars:string[], cursor:number|null, insert:bool} | {text:string},
  //          top2:string|null, bottom:{main, exp, neg, base}|null }
  render(view) {
    for (const n of IND) this.indEls[n].classList.toggle('lit', view.ind.has(n));
    const t = view.top || { text: '' };
    if (t.chars) this.renderInput(t, view);
    else {
      this.off = 0;
      this.top.innerHTML = esc(t.text || '');
      this.indEls['◀'].classList.toggle('lit', !!t.leftArrow || view.ind.has('◀'));
      this.indEls['▶'].classList.toggle('lit', !!t.rightArrow || view.ind.has('▶'));
    }
    this.top2.textContent = view.top2 || '';
    this.top2.style.display = view.top2 ? '' : 'none';
    this.root.classList.toggle('menu', !!view.top2);
    const b = view.bottom;
    if (!b || view.top2) { this.main.innerHTML = ''; this.expo.style.visibility = 'hidden'; return; }
    let main = b.main ?? '';
    if (b.neg && !main.startsWith('-')) main = '-' + main;
    this.main.innerHTML = segLine(main).svg;
    if (b.base) {
      // BASE-N: number system letter shown in the exponent area (Manual Guide 2 E-11: "0. b")
      this.expo.style.visibility = 'visible';
      this.expo.querySelector('.x10').style.display = 'none';
      this.ev.innerHTML = segLine(b.base, 0.62).svg;
    } else if (b.exp != null && b.exp !== '') {
      this.expo.style.visibility = 'visible';
      this.expo.querySelector('.x10').style.display = '';
      this.ev.innerHTML = segLine(String(b.exp), 0.62).svg;
    } else {
      this.expo.style.visibility = 'hidden';
    }
  }

  renderInput(t) {
    const chars = t.chars;           // array of single display characters
    const cur = t.cursor;            // char index of cursor, or null (no cursor)
    const W = TOP_COLS;
    const len = chars.length;
    if (cur == null) this.off = 0;            // results show the start of the expression
    else {
      if (cur < this.off) this.off = cur;
      if (cur > this.off + W - 1) this.off = cur - W + 1;
      if (len < W) this.off = 0;
    }
    let html = '';
    for (let i = this.off; i < Math.min(len, this.off + W); i++) {
      const c = chars[i];
      const isCur = cur === i;
      html += `<span class="ch${isCur ? (t.insert ? ' ins' : ' cur') : ''}">${esc(c === ' ' ? ' ' : c)}</span>`;
    }
    if (cur != null && cur >= len && cur - this.off < W) html += `<span class="ch ${t.insert ? 'ins' : 'cur'}"> </span>`;
    this.top.innerHTML = html;
    this.indEls['◀'].classList.toggle('lit', this.off > 0);
    this.indEls['▶'].classList.toggle('lit', len - this.off > W);
  }
}
