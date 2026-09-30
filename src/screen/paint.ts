// Draws a CellGrid onto a 640 x 480 canvas. The canvas is shown at an
// integer scale with `image-rendering: pixelated`, so every device pixel
// stays a crisp square however far the camera zooms.

import { Theme } from '../theme';
import { CellGrid, Prim } from './grid';

function drawPrim(ctx: CanvasRenderingContext2D, p: Prim) {
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
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      ctx.fillRect(x, y, 1, h);
      ctx.fillRect(x + w - 1, y, 1, h);
      break;
    }
    case 'sprite':
      p.rows.forEach((line, j) => {
        for (let i = 0; i < line.length; i++) if (line[i] === '#') ctx.fillRect(p.x + i, p.y + j, 1, 1);
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
  g.under.forEach((p) => drawPrim(ctx, p));

  // Text goes to a scratch layer first so its edges can be snapped to pixels.
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

  g.over.forEach((p) => drawPrim(ctx, p));
}
