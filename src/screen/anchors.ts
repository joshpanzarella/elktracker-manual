// Named regions of the screen, derived from the same layout the views draw
// with. Callouts and the camera target these names, so moving a column in
// theme.ts moves every arrow and zoom that points at it.
//
//   screen                     the whole screen
//   phrase.title / .len / .name / .gutter / .steps / .fx1 / .fx2
//   phrase.col.NOT (IN, FX1, P1, FX2, P2)      a column over all 16 steps
//   phrase.row.03              one step, gutter to P2
//   phrase.cell.03.NOT         one cell
//   chain.title / .gutter / .slots / .col.PHRASE / .col.TRANSPOSE / .row.3
//   song.title / .grid / .ch.1 .. .ch.8 / .table / .scopes
//   status.bar / .bpm / .transport / .hint

import { CHAIN_COLS, PHRASE_COLS } from '../engine/editor';
import { hex1, hex2 } from '../engine/hex';
import { TargetSpec } from '../engine/timeline';
import { Theme } from '../theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CellRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

const cache = new WeakMap<Theme, Record<string, CellRect>>();

export function anchors(t: Theme): Record<string, CellRect> {
  const hit = cache.get(t);
  if (hit) return hit;
  const a: Record<string, CellRect> = {};
  a.screen = { col: 0, row: 0, w: t.grid.cols, h: t.grid.rows };

  const P = t.views.phrase;
  const pEnd = P.columns.P2.col + P.columns.P2.w;
  a['phrase.title'] = { col: P.title.col, row: P.title.row, w: P.nameCol + 8 - P.title.col, h: 1 };
  a['phrase.name'] = { col: P.nameCol, row: P.title.row, w: 8, h: 1 };
  a['phrase.len'] = { col: P.len.col, row: P.len.row, w: 6, h: 1 };
  a['phrase.gutter'] = { col: P.gutter.col, row: P.firstRow, w: 2, h: 16 };
  a['phrase.steps'] = { col: P.gutter.col, row: P.firstRow, w: pEnd - P.gutter.col, h: 16 };
  a['phrase.grid'] = { col: P.gutter.col, row: P.headings.row, w: pEnd - P.gutter.col, h: P.firstRow + 16 - P.headings.row };
  a['phrase.fx1'] = { col: P.columns.FX1.col, row: P.firstRow, w: P.columns.P1.col + P.columns.P1.w - P.columns.FX1.col, h: 16 };
  a['phrase.fx2'] = { col: P.columns.FX2.col, row: P.firstRow, w: P.columns.P2.col + P.columns.P2.w - P.columns.FX2.col, h: 16 };
  for (const name of PHRASE_COLS) {
    const c = P.columns[name];
    a[`phrase.col.${name}`] = { col: c.col, row: P.firstRow, w: c.w, h: 16 };
    const withHeading = P.headings.show ? { row: P.headings.row, h: P.firstRow + 16 - P.headings.row } : {};
    a[`phrase.colh.${name}`] = { col: c.col, row: P.firstRow, w: c.w, h: 16, ...withHeading };
  }
  for (let i = 0; i < 16; i++) {
    a[`phrase.row.${hex2(i)}`] = { col: P.gutter.col, row: P.firstRow + i, w: pEnd - P.gutter.col, h: 1 };
    for (const name of PHRASE_COLS) {
      const c = P.columns[name];
      a[`phrase.cell.${hex2(i)}.${name}`] = { col: c.col, row: P.firstRow + i, w: c.w, h: 1 };
    }
  }

  const C = t.views.chain;
  const cEnd = C.columns.TRANSPOSE.col + C.columns.TRANSPOSE.w;
  a['chain.title'] = { col: C.title.col, row: C.title.row, w: C.nameCol + 8 - C.title.col, h: 1 };
  a['chain.gutter'] = { col: C.gutter.col, row: C.firstRow, w: 1, h: 16 };
  a['chain.slots'] = { col: C.gutter.col, row: C.firstRow, w: cEnd - C.gutter.col, h: 16 };
  for (const name of CHAIN_COLS) {
    const c = C.columns[name];
    a[`chain.col.${name}`] = { col: c.col, row: C.firstRow, w: c.w, h: 16 };
  }
  for (let i = 0; i < 16; i++) a[`chain.row.${hex1(i)}`] = { col: C.gutter.col, row: C.firstRow + i, w: cEnd - C.gutter.col, h: 1 };

  const S = t.views.song;
  const chCol = (ch: number) => S.firstChannelCol + ch * S.channelPitch;
  a['song.title'] = { col: S.title.col, row: S.title.row, w: 10, h: 1 };
  a['song.grid'] = { col: S.gutter.col, row: S.firstRow, w: chCol(7) + 2 - S.gutter.col, h: S.visibleRows };
  for (let ch = 0; ch < 8; ch++) a[`song.ch.${ch + 1}`] = { col: chCol(ch), row: S.firstRow, w: 2, h: S.visibleRows };
  a['song.table'] = { col: S.table.col, row: S.table.row, w: 9, h: 9 };
  a['song.scopes'] = { col: S.scopes.col, row: S.scopes.row, w: S.scopes.cols * S.scopes.cellCols, h: S.scopes.rows * S.scopes.cellRows };

  const B = t.statusBar;
  a['status.bar'] = { col: 0, row: B.row, w: t.grid.cols, h: 1 };
  a['status.bpm'] = { col: B.bpm, row: B.row, w: 3, h: 1 };
  a['status.transport'] = { col: B.transport, row: B.row, w: 2, h: 1 };
  a['status.hint'] = { col: B.hint, row: B.row, w: B.hintWidth, h: 1 };

  cache.set(t, a);
  return a;
}

/** A timeline target -> device px on the 640 x 480 screen. */
export function resolveTarget(target: TargetSpec, t: Theme): Rect {
  const toPx = (c: CellRect): Rect => ({
    x: t.grid.originX + c.col * t.grid.cellW,
    y: t.grid.originY + c.row * t.grid.cellH,
    w: c.w * t.grid.cellW,
    h: c.h * t.grid.cellH,
  });
  if (typeof target === 'string') {
    const a = anchors(t)[target];
    if (!a) throw new Error(`Unknown screen anchor "${target}". Known: ${Object.keys(anchors(t)).filter((k) => !/\.(row|cell)\./.test(k)).join(', ')} (+ .row.XX / .cell.XX.COL)`);
    return toPx(a);
  }
  if ('x' in target) return target;
  return toPx({ col: target.col, row: target.row, w: target.w ?? 1, h: target.h ?? 1 });
}
