// Callouts: a bracket drawn around a screen region, a leader line out to the
// margin column, and a label there. Regions are resolved through the same
// camera as the screen, so a callout stays on its target while zooming.

import React from 'react';
import { interpolate } from 'remotion';
import { CalloutEvent } from '../engine/timeline';
import { Rect, resolveTarget } from '../screen/anchors';
import { Theme } from '../theme';
import { Camera, rectToStage } from './camera';
import { RichText } from './RichText';

interface Placed {
  e: CalloutEvent;
  box: Rect; // bracket, stage px
  progress: number; // 0..1 bracket drawn
  opacity: number;
  labelY: number;
  labelH: number;
}

export const Callouts: React.FC<{
  callouts: CalloutEvent[];
  frame: number;
  fps: number;
  camera: Camera;
  theme: Theme;
}> = ({ callouts, frame, fps, camera, theme: t }) => {
  const K = t.stage.callout;
  const P = t.stage.panel;
  const active: Placed[] = [];
  for (const e of callouts) {
    const stop = e.until ?? e.frame + 2 * fps;
    if (frame < e.frame || frame >= stop) continue;
    const r = rectToStage(resolveTarget(e.target, t), camera, t);
    // Keep the bracket on the screen when the camera has zoomed past the target.
    const vx0 = t.stage.screenX - K.padPx / 2;
    const vy0 = t.stage.screenY - K.padPx / 2;
    const vx1 = t.stage.screenX + t.screen.width * t.screen.scale + K.padPx / 2;
    const vy1 = t.stage.screenY + t.screen.height * t.screen.scale + K.padPx / 2;
    const x0 = Math.max(vx0, r.x - K.padPx);
    const y0 = Math.max(vy0, r.y - K.padPx);
    const x1 = Math.min(vx1, r.x + r.w + K.padPx);
    const y1 = Math.min(vy1, r.y + r.h + K.padPx);
    if (x1 <= x0 || y1 <= y0) continue; // the target is off screen
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const progress = interpolate(frame, [e.frame, e.frame + K.drawFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const opacity = interpolate(frame, [stop - K.fadeFrames, stop], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const labelH = K.labelSize * 1.5 + (e.text ? K.textSize * 1.35 * Math.ceil(e.text.length / 34) + 8 : 0);
    active.push({ e, box, progress, opacity, labelY: box.y + box.h / 2 - K.labelSize * 0.75, labelH });
  }
  // Stack labels top to bottom so they never overlap.
  active.sort((a, b) => a.labelY - b.labelY);
  let floor = P.y + K.zoneTop;
  for (const a of active) {
    a.labelY = Math.max(floor, Math.min(a.labelY, P.y + t.stage.hud.y - 24 - a.labelH));
    floor = a.labelY + a.labelH + 16;
  }

  return (
    <>
      <svg style={{ position: 'absolute', left: 0, top: 0 }} width={t.stage.width} height={t.stage.height}>
        {active.map((a) => {
          const { box } = a;
          const perim = 2 * (box.w + box.h);
          const lx = P.x - 14;
          const ly = a.labelY + K.labelSize * 0.75;
          const sx = box.x + box.w;
          const sy = box.y + box.h / 2;
          const midX = Math.max(sx + 16, lx - 40);
          const lead = `M ${sx} ${sy} L ${midX} ${sy} L ${midX + 20} ${ly} L ${lx} ${ly}`;
          const leadLen = Math.abs(midX - sx) + Math.hypot(20, ly - sy) + Math.abs(lx - midX - 20);
          const leadProgress = interpolate(a.progress, [0.5, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <g key={a.e.seq} opacity={a.opacity} fill="none" stroke={K.color} strokeWidth={K.lineWidth} strokeLinejoin="round">
              <rect
                x={box.x} y={box.y} width={box.w} height={box.h} rx={6}
                strokeDasharray={perim} strokeDashoffset={perim * (1 - Math.min(1, a.progress * 2))}
              />
              <path d={lead} strokeDasharray={leadLen} strokeDashoffset={leadLen * (1 - leadProgress)} />
            </g>
          );
        })}
      </svg>
      {active.map((a) => {
        const shown = interpolate(a.progress, [0.7, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div
            key={a.e.seq}
            style={{
              position: 'absolute',
              left: P.x,
              top: a.labelY,
              width: P.w,
              opacity: a.opacity * shown,
              transform: `translateX(${(1 - shown) * 12}px)`,
              fontFamily: `"${t.stage.uiFont.family}", sans-serif`,
            }}
          >
            {a.e.label && (
              <span
                style={{
                  display: 'inline-block',
                  background: K.color,
                  color: K.labelColor,
                  fontFamily: `"${t.stage.monoFont.family}", monospace`,
                  fontWeight: 700,
                  fontSize: K.labelSize,
                  padding: '2px 12px',
                  borderRadius: 6,
                }}
              >
                {a.e.label}
              </span>
            )}
            {a.e.text && (
              <div style={{ color: K.textColor, fontSize: K.textSize, lineHeight: 1.35, marginTop: 8, fontWeight: 500 }}>
                <RichText text={a.e.text} size={K.textSize} accent={K.color} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
