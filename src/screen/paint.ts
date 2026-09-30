// Draws a CellGrid onto a 640 x 480 canvas. The canvas is shown at an
// integer scale with `image-rendering: pixelated`, so every device pixel
// stays a crisp square however far the camera zooms.
//
// Two text paths: the device's bitmap font (src/font/elk5x7.ts), drawn pixel
// by pixel, or a TrueType placeholder (VT323) snapped to hard pixels.

import { ELK_5X7, UNKNOWN_GLYPH } from '../font/elk5x7';
import { Theme } from '../theme';
import { CellGrid, Prim } from './grid';

function drawGlyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, t: Theme) {
  const b = t.font.bitmap;
  const glyph = ELK_5X7[ch] ?? UNKNOWN_GLYPH;
  const s = b.scale;
  const gx = x + b.offsetX;
  const gy = y + b.offsetY + (glyph.dy ?? 0);
  glyph.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(gx + i * s, gy + j * s, s, s);
  });
}

function drawPrim(ctx: CanvasRenderingContext2D, p: Prim, t: Theme) {
  ctx.fillStyle = p.color;
  switch (p.kind) {
    case 'rect':
      ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h));
      break;
    case 'frame': {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      const w = Math.round(p.w);
      const h = Math.round(p.h);
      const k = p.t ?? 1;
      ctx.fillRect(x, y, w, k);
      ctx.fillRect(x, y + h - k, w, k);
      ctx.fillRect(x, y, k, h);
      ctx.fillRect(x + w - k, y, k, h);
      break;
    }
    case 'sprite':
      p.rows.forEach((line, j) => {
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '.' || c === ' ') continue;
          ctx.fillStyle = c === '#' ? p.color : p.palette?.[c] ?? p.color;
          ctx.fillRect(p.x + i, p.y + j, 1, 1);
        }
      });
      break;
    case 'line':
      for (let k = 0; k + 1 < p.points.length; k++) {
        // Bresenham, so lines stay one hard pixel wide.
        let [x0, y0] = p.points[k].map(Math.round) as [number, number];
        const [x1, y1] = p.points[k + 1].map(Math.round) as [number, number];
        const dx = Math.abs(x1 - x0);
        const dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
          ctx.fillRect(x0, y0, 1, 1);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x0 += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y0 += sy;
          }
        }
      }
      break;
    case 'text':
      if (t.font.kind === 'bitmap') {
        for (let i = 0; i < p.text.length; i++) drawGlyph(ctx, p.text[i], p.x + i * t.grid.cellW, p.y, t);
      } else {
        ctx.font = `${t.font.sizePx}px "${t.font.family}"`;
        for (let i = 0; i < p.text.length; i++) {
          ctx.setTransform(t.font.scaleX, 0, 0, 1, p.x + i * t.grid.cellW + t.font.offsetX, p.y + t.font.baseline);
          ctx.fillText(p.text[i], 0, 0);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      break;
  }
}

export function paintScreen(ctx: CanvasRenderingContext2D, g: CellGrid, t: Theme, scratch: HTMLCanvasElement): void {
  const { width, height } = t.screen;
  const { cellW, cellH, originX, originY } = t.grid;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = t.colors.bg;
  ctx.fillRect(0, 0, width, height);

  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r * g.cols + c];
      if (!cell.bg) continue;
      ctx.fillStyle = cell.bg;
      ctx.fillRect(originX + c * cellW, originY + r * cellH, cellW, cellH);
    }
  }
  g.under.forEach((p) => drawPrim(ctx, p, t));

  if (t.font.kind === 'bitmap') {
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cell = g.cells[r * g.cols + c];
        if (cell.ch === ' ' || !cell.fg) continue;
        ctx.fillStyle = cell.fg;
        drawGlyph(ctx, cell.ch, originX + c * cellW, originY + r * cellH, t);
      }
    }
  } else {
    // TrueType: draw on a scratch layer, snap its edges to pixels, composite.
    scratch.width = width;
    scratch.height = height;
    const tx = scratch.getContext('2d', { willReadFrequently: true })!;
    tx.clearRect(0, 0, width, height);
    tx.font = `${t.font.sizePx}px "${t.font.family}"`;
    tx.textBaseline = 'alphabetic';
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cell = g.cells[r * g.cols + c];
        if (cell.ch === ' ' || !cell.fg) continue;
        tx.fillStyle = cell.fg;
        tx.setTransform(t.font.scaleX, 0, 0, 1, originX + c * cellW + t.font.offsetX, originY + r * cellH + t.font.baseline);
        tx.fillText(cell.ch, 0, 0);
      }
    }
    tx.setTransform(1, 0, 0, 1, 0, 0);
    if (t.font.binarize) {
      const img = tx.getImageData(0, 0, width, height);
      const d = img.data;
      const cut = t.font.binarizeThreshold;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= cut ? 255 : 0;
      tx.putImageData(img, 0, 0);
    }
    ctx.drawImage(scratch, 0, 0);
  }

  g.over.forEach((p) => drawPrim(ctx, p, t));
}
