// Shows the button combo being pressed, as keycaps in the margin, so the
// viewer always knows what was pressed on the device. Repeats of the same
// combo in quick succession show a count.

import React from 'react';
import { interpolate } from 'remotion';
import { PressEvent } from '../engine/timeline';
import { Theme } from '../theme';
import { Keycap, comboKeys } from './RichText';

export const ButtonHud: React.FC<{ presses: PressEvent[]; frame: number; theme: Theme }> = ({ presses, frame, theme: t }) => {
  const H = t.stage.hud;
  const P = t.stage.panel;
  let last = -1;
  for (let i = 0; i < presses.length && presses[i].frame <= frame; i++) last = i;
  if (last < 0) return null;
  const p = presses[last];
  const age = frame - p.frame;
  if (age >= H.holdFrames + H.fadeFrames) return null;

  // Count the run of identical combos, each within holdFrames of the next.
  let count = 1;
  for (let i = last - 1; i >= 0; i--) {
    if (presses[i].combo !== p.combo || presses[i + 1].frame - presses[i].frame > H.holdFrames) break;
    count++;
  }
  const first = presses[last - count + 1].frame;
  const opacity = interpolate(frame, [first, first + 3, p.frame + H.holdFrames, p.frame + H.holdFrames + H.fadeFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const keys = comboKeys(p.combo);
  const tapLit = age < 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: P.x,
        top: P.y + H.y,
        width: P.w,
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: `"${t.stage.monoFont.family}", monospace`,
        color: H.keyColor,
        fontSize: H.keySize,
      }}
    >
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.6 }}>+</span>}
          <Keycap label={k} size={H.keySize * 1.3} active={i < keys.length - 1 || tapLit} />
        </React.Fragment>
      ))}
      {count > 1 && <span style={{ opacity: 0.8, marginLeft: 6 }}>×{count}</span>}
    </div>
  );
};
