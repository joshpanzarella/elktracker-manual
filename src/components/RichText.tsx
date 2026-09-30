// Caption text with two bits of markup:
//   **words**   in the accent colour
//   [A]         an inline keycap (any button name, or A+RIGHT style combos)

import React from 'react';
import { theme } from '../theme';

export const KEY_LABELS: Record<string, string> = {
  UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', SELECT: 'SELECT', START: 'START',
};

export const Keycap: React.FC<{ label: string; size: number; active?: boolean }> = ({ label, size, active }) => {
  const h = theme.stage.hud;
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: size * 1.1,
        padding: `${size * 0.08}px ${size * 0.32}px`,
        margin: `0 ${size * 0.08}px`,
        borderRadius: size * 0.22,
        border: `2px solid ${active ? h.activeBg : h.keyBorder}`,
        background: active ? h.activeBg : h.keyBg,
        color: active ? h.activeText : h.keyColor,
        fontFamily: `"${theme.stage.monoFont.family}", monospace`,
        fontWeight: 600,
        fontSize: size * 0.8,
        lineHeight: 1.2,
        textAlign: 'center',
        verticalAlign: 'middle',
      }}
    >
      {label}
    </span>
  );
};

export function comboKeys(combo: string): string[] {
  return combo.split('+').map((k) => KEY_LABELS[k.trim().toUpperCase()] ?? k.trim().toUpperCase());
}

export const RichText: React.FC<{ text: string; size: number; accent: string }> = ({ text, size, accent }) => {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**')) return <span key={i} style={{ color: accent }}>{p.slice(2, -2)}</span>;
        if (p.startsWith('[')) {
          const keys = comboKeys(p.slice(1, -1));
          return (
            <span key={i} style={{ whiteSpace: 'nowrap' }}>
              {keys.map((k, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <span style={{ opacity: 0.6, fontSize: size * 0.7 }}>+</span>}
                  <Keycap label={k} size={size * 0.8} />
                </React.Fragment>
              ))}
            </span>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
};
