// The screen as a text-mode frame buffer: a grid of cells, each with a
// character, a text colour and a background, plus a few pixel primitives
// (icons, boxes) on top. Views fill it; the painter draws it.

export interface Cell {
  ch: string;
  fg: string | null;
  bg: string | null;
}

export type Prim =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string }
  /** Outline `t` px thick (default 1). */
  | { kind: 'frame'; x: number; y: number; w: number; h: number; color: string; t?: number }
  /** '#' pixels draw in `color`; other letters use `palette`. */
  | { kind: 'sprite'; rows: readonly string[]; x: number; y: number; color: string; palette?: Record<string, string> }
  | { kind: 'line'; points: Array<[number, number]>; color: string }
  /** Text at a pixel position, off the cell grid. (x, y) = the cell's top-left. */
  | { kind: 'text'; x: number; y: number; text: string; color: string };

export class CellGrid {
  readonly cells: Cell[];
  /** Drawn after the cell backgrounds, before the text. */
  readonly under: Prim[] = [];
  /** Drawn after the text. */
  readonly over: Prim[] = [];

  constructor(readonly cols: number, readonly rows: number) {
    this.cells = Array.from({ length: cols * rows }, () => ({ ch: ' ', fg: null, bg: null }));
  }

  cell(col: number, row: number): Cell | null {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return this.cells[row * this.cols + col];
  }

  text(col: number, row: number, text: string, fg: string, bg?: string | null): void {
    for (let i = 0; i < text.length; i++) {
      const c = this.cell(col + i, row);
      if (!c) continue;
      c.ch = text[i];
      c.fg = fg;
      if (bg !== undefined) c.bg = bg;
    }
  }

  /** Right-aligned text ending at `lastCol`. */
  textRight(lastCol: number, row: number, text: string, fg: string): void {
    this.text(lastCol - text.length + 1, row, text, fg);
  }

  fill(col: number, row: number, w: number, h: number, bg: string): void {
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        const cell = this.cell(c, r);
        if (cell) cell.bg = bg;
      }
    }
  }

  /** Set the text colour of a span without changing its characters. */
  recolor(col: number, row: number, w: number, fg: string, bg?: string): void {
    for (let c = col; c < col + w; c++) {
      const cell = this.cell(c, row);
      if (!cell) continue;
      cell.fg = fg;
      if (bg !== undefined) cell.bg = bg;
    }
  }

  /** Plain-text dump, one line per row (for tests and debugging). */
  toText(): string {
    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      lines.push(this.cells.slice(r * this.cols, (r + 1) * this.cols).map((c) => c.ch).join('').trimEnd());
    }
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------- colour

function parseColor(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) throw new Error(`colours in theme.ts are #rrggbb, got "${c}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend `a` over `b` by `t` (0 = b, 1 = a). */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const k = Math.max(0, Math.min(1, t));
  const ch = (i: number) => Math.round(y[i] + (x[i] - y[i]) * k).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}
