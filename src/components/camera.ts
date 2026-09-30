// Zoom and pan, as a pure function of the frame. Each `camera` event eases
// from wherever the camera is at that frame to its target.

import { Easing, interpolate } from 'remotion';
import { CameraEvent } from '../engine/timeline';
import { Rect, resolveTarget } from '../screen/anchors';
import { Theme } from '../theme';

export interface Camera {
  /** Centre of the view, in device px. */
  cx: number;
  cy: number;
  /** 1 = whole screen at the base scale. */
  zoom: number;
}

export const FULL = (t: Theme): Camera => ({ cx: t.screen.width / 2, cy: t.screen.height / 2, zoom: 1 });

function clampCamera(c: Camera, t: Theme): Camera {
  const zoom = Math.max(1, c.zoom);
  const hw = t.screen.width / 2 / zoom;
  const hh = t.screen.height / 2 / zoom;
  return {
    zoom,
    cx: Math.min(t.screen.width - hw, Math.max(hw, c.cx)),
    cy: Math.min(t.screen.height - hh, Math.max(hh, c.cy)),
  };
}

function targetCamera(e: CameraEvent, t: Theme): Camera {
  if (e.target === 'screen') return FULL(t);
  const r: Rect = resolveTarget(e.target, t);
  const pad = t.stage.camera.padPx / t.screen.scale; // device px at zoom 1
  const fit = Math.min(t.screen.width / (r.w + 2 * pad), t.screen.height / (r.h + 2 * pad));
  const zoom = Math.min(t.stage.camera.maxZoom, e.zoom ?? fit);
  return clampCamera({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, zoom }, t);
}

function ease(from: Camera, to: Camera, start: number, frames: number, frame: number): Camera {
  if (frames <= 0 || frame >= start + frames) return to;
  const k = interpolate(frame, [start, start + frames], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {
    cx: from.cx + (to.cx - from.cx) * k,
    cy: from.cy + (to.cy - from.cy) * k,
    // Zoom moves in log space so zooming in and out feel the same speed.
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * k),
  };
}

export function cameraAt(events: CameraEvent[], frame: number, t: Theme): Camera {
  let cam = FULL(t);
  let seg: { from: Camera; to: Camera; start: number; frames: number } | null = null;
  for (const e of events) {
    if (e.frame > frame) break;
    const from: Camera = seg ? ease(seg.from, seg.to, seg.start, seg.frames, e.frame) : cam;
    seg = { from, to: targetCamera(e, t), start: e.frame, frames: e.ease };
  }
  if (seg) cam = ease(seg.from, seg.to, seg.start, seg.frames, frame);
  return clampCamera(cam, t);
}

/** Device px -> stage px, through the camera. */
export function toStage(x: number, y: number, cam: Camera, t: Theme): { x: number; y: number } {
  const s = t.screen.scale * cam.zoom;
  const vw = t.screen.width * t.screen.scale;
  const vh = t.screen.height * t.screen.scale;
  return {
    x: t.stage.screenX + vw / 2 + (x - cam.cx) * s,
    y: t.stage.screenY + vh / 2 + (y - cam.cy) * s,
  };
}

export function rectToStage(r: Rect, cam: Camera, t: Theme): Rect {
  const a = toStage(r.x, r.y, cam, t);
  const b = toStage(r.x + r.w, r.y + r.h, cam, t);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}
