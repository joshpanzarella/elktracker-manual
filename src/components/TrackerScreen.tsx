// The device screen: a 640 x 480 canvas repainted from the cell grid on
// every frame, shown at the theme's integer scale times the camera zoom with
// image-rendering: pixelated. The paint is a side effect of a pure input;
// nothing carries over from one frame to the next.

import React, { useLayoutEffect, useRef } from 'react';
import { CellGrid } from '../screen/grid';
import { paintScreen } from '../screen/paint';
import { Theme } from '../theme';
import { Camera } from './camera';
import { useFontsReady } from './fonts';

export const TrackerScreen: React.FC<{ grid: CellGrid; camera: Camera; theme: Theme }> = ({ grid, camera, theme: t }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const ready = useFontsReady();

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el || !ready) return;
    if (!scratch.current) scratch.current = document.createElement('canvas');
    paintScreen(el.getContext('2d')!, grid, t, scratch.current);
  }, [grid, t, ready]);

  const vw = t.screen.width * t.screen.scale;
  const vh = t.screen.height * t.screen.scale;
  const s = t.screen.scale * camera.zoom;
  const b = t.stage.bezel;
  return (
    <div
      style={{
        position: 'absolute',
        left: t.stage.screenX - b.width,
        top: t.stage.screenY - b.width,
        width: vw + 2 * b.width,
        height: vh + 2 * b.width,
        background: b.color,
        borderRadius: b.radius,
        boxShadow: b.shadow,
      }}
    >
      <div style={{ position: 'absolute', left: b.width, top: b.width, width: vw, height: vh, overflow: 'hidden', background: t.colors.bg }}>
        <canvas
          ref={canvas}
          width={t.screen.width}
          height={t.screen.height}
          style={{
            position: 'absolute',
            left: vw / 2 - camera.cx * s,
            top: vh / 2 - camera.cy * s,
            width: t.screen.width * s,
            height: t.screen.height * s,
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  );
};
