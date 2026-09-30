// Font loading. The screen canvas can only draw VT323 once the browser has
// it, so rendering waits (delayRender) until every theme font is loaded.

import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import { theme } from '../theme';

const FONTS = [
  { family: theme.font.family, file: theme.font.file },
  { family: theme.stage.uiFont.family, file: theme.stage.uiFont.file, weight: '100 800' },
  { family: theme.stage.monoFont.family, file: theme.stage.monoFont.file, weight: '100 800' },
];

let loading: Promise<void> | null = null;

function loadAll(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      FONTS.map(async (f) => {
        const face = new FontFace(f.family, `url(${staticFile(f.file)})`, f.weight ? { weight: f.weight } : {});
        await face.load();
        document.fonts.add(face);
      }),
    ).then(() => undefined);
  }
  return loading;
}

/** True once the fonts are in. Holds the render until then. This is a
 *  one-off resource load, not state that changes with the frame. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Loading fonts'));
  useEffect(() => {
    loadAll()
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [handle]);
  return ready;
}
