// Named regions of the screen, derived from the same layout the views draw
// with. Callouts and the camera target these names, so moving a column in
// theme.ts moves every arrow and zoom that points at it.
//
//   screen
//   phrase.title / .name / .len / .headings / .gutter / .steps / .grid / .fx1 / .fx2
//   phrase.col.NOT (IN, FX1, P1, FX2, P2)   a column over all 16 steps
//   phrase.row.03                           one step, gutter to P2
//   phrase.cell.03.NOT                      one field
//   chain.title / .gutter / .slots / .col.PHRASE / .col.TRANSPOSE / .row.3 / .cell.3.PHRASE
//   song.title / .headings / .grid / .ch.1 .. .ch.8 / .table / .scopes / .scope.1 .. .scope.M
//   status.bar / .name / .bpm / .transport / .hint / .battery
//
// A timeline target can also be a list of names (the box around all of them),
// cells { col, row, w, h }, or device pixels { x, y, w, h }.

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

const cache = new WeakMap<Theme, Record<string, Rect>>();

export function anchors(t: Theme): Record<string, Rect> {
  const hit = cache.get(t);
  if (hit) return hit;
  const a: Record<string, Rect> = {};
  const cells = (col: number, row: number, w: number, h: number): Rect => ({
    x: t.grid.originX + col * t.grid.cellW,
    y: t.grid.originY + row * t.grid.cellH,
    w: w * t.grid.cellW,
    h: h * t.grid.cellH,
  });
  a.screen = { x: 0, y: 0, w: t.screen.width, h: t.screen.height };

  const P = t.views.phrase;
  const pEnd = P.columns.P2.col + P.columns.P2.w;
  a['phrase.title'] = cells(P.title.col, P.title.row, P.nameCol + 8 - P.title.col, 1);
  a['phrase.name'] = cells(P.nameCol, P.title.row, 8, 1);
  a['phrase.len'] = cells(P.len.col, P.len.row, 6, 1);
  a['phrase.headings'] = cells(P.columns.NOT.col, P.headings.row, pEnd - P.columns.NOT.col, 1);
  a['phrase.gutter'] = cells(P.gutter.col, P.firstRow, 2, 16);
  a['phrase.steps'] = cells(P.gutter.col, P.firstRow, pEnd - P.gutter.col, 16);
  a['phrase.grid'] = cells(P.gutter.col, P.headings.row, pEnd - P.gutter.col, P.firstRow + 16 - P.headings.row);
  a['phrase.fx1'] = cells(P.columns.FX1.col, P.firstRow, P.columns.P1.col + P.columns.P1.w - P.columns.FX1.col, 16);
  a['phrase.fx2'] = cells(P.columns.FX2.col, P.firstRow, P.columns.P2.col + P.columns.P2.w - P.columns.FX2.col, 16);
  for (const name of PHRASE_COLS) {
    const c = P.columns[name];
    a[`phrase.col.${name}`] = cells(c.col, P.firstRow, c.w, 16);
  }
  for (let i = 0; i < 16; i++) {
    a[`phrase.row.${hex2(i)}`] = cells(P.gutter.col, P.firstRow + i, pEnd - P.gutter.col, 1);
    for (const name of PHRASE_COLS) {
      const c = P.columns[name];
      a[`phrase.cell.${hex2(i)}.${name}`] = cells(c.col, P.firstRow + i, c.w, 1);
    }
  }

  const C = t.views.chain;
  const cEnd = C.columns.TRANSPOSE.col + C.columns.TRANSPOSE.w;
  a['chain.title'] = cells(C.title.col, C.title.row, C.nameCol + 8 - C.title.col, 1);
  a['chain.gutter'] = cells(C.gutter.col, C.firstRow, 1, 16);
  a['chain.slots'] = cells(C.gutter.col, C.firstRow, cEnd - C.gutter.col, 16);
  for (const name of CHAIN_COLS) {
    const c = C.columns[name];
    a[`chain.col.${name}`] = cells(c.col, C.firstRow, c.w, 16);
  }
  for (let i = 0; i < 16; i++) {
    a[`chain.row.${hex1(i)}`] = cells(C.gutter.col, C.firstRow + i, cEnd - C.gutter.col, 1);
    for (const name of CHAIN_COLS) {
      const c = C.columns[name];
      a[`chain.cell.${hex1(i)}.${name}`] = cells(c.col, C.firstRow + i, c.w, 1);
    }
  }

  const S = t.views.song;
  const chCol = (ch: number) => S.firstChannelCol + ch * S.channelPitch;
  a['song.title'] = cells(S.title.col, S.title.row, 8, 1);
  a['song.headings'] = cells(chCol(0), S.headings.row, chCol(7) + 2 - chCol(0), 1);
  a['song.grid'] = cells(S.gutter.col, S.firstRow, chCol(7) + 2 - S.gutter.col, S.visibleRows);
  for (let ch = 0; ch < 8; ch++) a[`song.ch.${ch + 1}`] = cells(chCol(ch), S.firstRow, 2, S.visibleRows);
  const tb = S.table;
  const tTop = t.grid.originY + tb.headerRow * t.grid.cellH;
  a['song.table'] = { x: tb.x[0], y: tTop, w: tb.x[2] + 4 * t.grid.cellW - tb.x[0], h: 9 * t.grid.cellH };
  const sc = S.scopes;
  a['song.scopes'] = { x: sc.x, y: sc.y, w: sc.cols * sc.w + (sc.cols - 1) * sc.gap, h: sc.rows * sc.h + (sc.rows - 1) * sc.gap };
  sc.labels.forEach((label, i) => {
    a[`song.scope.${label}`] = { x: sc.x + (i % sc.cols) * (sc.w + sc.gap), y: sc.y + Math.floor(i / sc.cols) * (sc.h + sc.gap), w: sc.w, h: sc.h };
  });

  const B = t.statusBar;
  const W = t.grid.cellW;
  a['status.bar'] = { x: 0, y: B.bandY, w: t.screen.width, h: B.bandH };
  a['status.name'] = { x: B.screenName.x, y: B.bandY, w: 6 * W, h: B.bandH };
  a['status.bpm'] = { x: B.bpm.x, y: B.bandY, w: (B.bpm.label.length + 3) * W, h: B.bandH };
  const iconX = B.bpm.x + (B.bpm.label.length + 3) * W + B.transport.gap;
  a['status.transport'] = { x: iconX, y: B.bandY, w: 26, h: B.bandH };
  a['status.hint'] = { x: B.hint.x, y: B.bandY, w: B.hint.maxChars * W, h: B.bandH };
  a['status.battery'] = { x: B.battery.x, y: B.bandY, w: t.sprites.battery[0].length, h: B.bandH };

  cache.set(t, a);
  return a;
}

function union(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A timeline target -> device px on the 640 x 480 screen. */
export function resolveTarget(target: TargetSpec, t: Theme): Rect {
  if (Array.isArray(target)) {
    if (!target.length) throw new Error('An anchor list needs at least one name');
    return union(target.map((x) => resolveTarget(x, t)));
  }
  if (typeof target === 'string') {
    const a = anchors(t)[target];
    if (!a) {
      const known = Object.keys(anchors(t)).filter((k) => !/\.(row|cell)\./.test(k));
      throw new Error(`Unknown screen anchor "${target}". Known: ${known.join(', ')} (+ phrase.row.XX, phrase.cell.XX.COL, chain.row.X, chain.cell.X.COL)`);
    }
    return a;
  }
  if ('x' in target) return target;
  return {
    x: t.grid.originX + target.col * t.grid.cellW,
    y: t.grid.originY + target.row * t.grid.cellH,
    w: (target.w ?? 1) * t.grid.cellW,
    h: (target.h ?? 1) * t.grid.cellH,
  };
}
