// Captions in the margin column. A caption holds from its frame to `until`
// (or to the next caption), fading in and out with interpolate().

import React from 'react';
import { interpolate } from 'remotion';
import { CaptionEvent } from '../engine/timeline';
import { Theme } from '../theme';
import { RichText } from './RichText';

export const Captions: React.FC<{ captions: CaptionEvent[]; frame: number; end: number; theme: Theme }> = ({
  captions, frame, end, theme: t,
}) => {
  const C = t.stage.caption;
  const P = t.stage.panel;
  return (
    <>
      {captions.map((e, i) => {
        const stop = e.until ?? captions[i + 1]?.frame ?? end;
        if (frame < e.frame || frame >= stop) return null;
        const fade = Math.max(1, Math.min(C.fadeFrames, (stop - e.frame) / 2));
        const opacity = interpolate(frame, [e.frame, e.frame + fade, stop - fade, stop], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const rise = interpolate(frame, [e.frame, e.frame + fade], [C.slidePx, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={e.seq}
            style={{
              position: 'absolute',
              left: P.x,
              top: P.y + C.y + rise,
              width: P.w,
              opacity,
              fontFamily: `"${t.stage.uiFont.family}", sans-serif`,
            }}
          >
            {e.title && (
              <div
                style={{
                  fontFamily: `"${t.stage.monoFont.family}", monospace`,
                  fontSize: C.titleSize,
                  fontWeight: 600,
                  letterSpacing: 3,
                  color: C.titleColor,
                  marginBottom: C.titleSize * 0.6,
                  textTransform: 'uppercase',
                }}
              >
                {e.title}
              </div>
            )}
            <div style={{ fontSize: C.textSize, lineHeight: C.lineHeight, color: C.textColor, fontWeight: 500 }}>
              <RichText text={e.text} size={C.textSize} accent={C.titleColor} />
            </div>
          </div>
        );
      })}
    </>
  );
};
