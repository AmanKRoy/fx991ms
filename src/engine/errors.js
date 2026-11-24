// Error type for the engine. Messages are the exact LCD texts.
// Manual: users-guide p.32-34 "Error Messages" (Math ERROR, Stack ERROR, Syntax ERROR, Arg ERROR);
// User's Guide 2 MAT/VCT sections ("An error occurs ..." -> Dim ERROR on the real unit).
export class CalcError extends Error {
  constructor(message, pos) {
    super(message);
    this.name = 'CalcError';
    if (pos !== undefined) this.pos = pos;
  }
}

export const MATH = 'Math ERROR';
export const SYNTAX = 'Syntax ERROR';
export const ARG = 'Arg ERROR';
export const DIM = 'Dim ERROR';
export const STACK = 'Stack ERROR';
export const CANT_SOLVE = "Can't Solve";

const KNOWN = new Set([MATH, SYNTAX, ARG, DIM, STACK, CANT_SOLVE]);

// Wrap a lib call: libs throw plain Error('Math ERROR'|'Dim ERROR'...); convert to CalcError.
export function wrap(fn) {
  try { return fn(); } catch (e) {
    if (e instanceof CalcError) throw e;
    if (e && KNOWN.has(e.message)) throw new CalcError(e.message);
    throw new CalcError(MATH);
  }
}
