import type * as Phaser from 'phaser';

// Taps, drags and pinches on the map, from the browser's own pointer events rather than Phaser's
// input. Phaser reads touches through its own path (touch events, page offsets, a check that the
// finger is still over the canvas on every move), which went wrong in Safari on iPhone: drags did
// nothing and taps on the world map missed. Pointer events behave the same in every browser,
// and the canvas's place is measured afresh on every touch.

export interface MapTarget {
  scene: Phaser.Scene;
  tap: (worldX: number, worldY: number, k: number, touch: boolean) => void;
  grab?: () => void;
  dragBy?: (dx: number, dy: number) => void; // in game pixels since the finger landed
  // Two fingers (or the wheel): x, y in game pixels on the canvas, spread = distance now / at start.
  pinchStart?: (x: number, y: number) => void;
  pinchTo?: (x: number, y: number, spread: number) => void;
  pinchEnd?: () => void;
}

const SLOP = 8; // screen pixels a finger may wander and still count as a tap

export function bindMapInput(canvas: HTMLCanvasElement, game: Phaser.Game, target: () => MapTarget | null): void {
  // Every finger on the canvas, where it is now.
  const fingers = new Map<number, { x: number; y: number }>();
  let down: { id: number; x: number; y: number; moved: boolean; t: MapTarget } | null = null;
  let pinch: { d: number; t: MapTarget } | null = null;
  // Screen position to game pixels on the canvas, and game pixels per screen pixel.
  const toGame = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    const s = game.scale.gameSize.width / r.width;
    return { x: (cx - r.left) * s, y: (cy - r.top) * s, s };
  };
  const two = () => [...fingers.values()].slice(0, 2);
  const spreadOf = () => {
    const [a, b] = two();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const midOf = () => {
    const [a, b] = two();
    return toGame((a.x + b.x) / 2, (a.y + b.y) / 2);
  };
  const capture = (id: number) => {
    try {
      canvas.setPointerCapture(id); // the drag keeps coming here even off the canvas
    } catch {
      // the pointer is already gone: its up event will still reach the canvas
    }
  };
  // One finger lands (or is left after a pinch): a drag starts from here.
  const startDrag = (id: number, x: number, y: number, moved: boolean, t: MapTarget) => {
    down = { id, x, y, moved, t };
    t.grab?.();
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    // The first finger always starts afresh, so one whose end went missing can never leave the
    // map deaf.
    if (e.isPrimary) fingers.clear();
    const t = target();
    if (!t) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    capture(e.pointerId);
    if (fingers.size === 2 && t.pinchTo) {
      // A second finger: no tap, no drag, a pinch.
      down = null;
      pinch = { d: Math.max(1, spreadOf()), t };
      const m = midOf();
      t.pinchStart?.(m.x, m.y);
      return;
    }
    if (fingers.size === 1) startDrag(e.pointerId, e.clientX, e.clientY, false, t);
  });
  canvas.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX;
    f.y = e.clientY;
    if (pinch) {
      if (fingers.size < 2) return;
      const m = midOf();
      pinch.t.pinchTo?.(m.x, m.y, spreadOf() / pinch.d);
      return;
    }
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) < SLOP) return;
    down.moved = true;
    const { s } = toGame(e.clientX, e.clientY);
    down.t.dragBy?.(dx * s, dy * s);
  });
  const lift = (e: PointerEvent, cancelled: boolean) => {
    if (!fingers.delete(e.pointerId)) return;
    if (pinch) {
      if (fingers.size >= 2) return;
      const { t } = pinch;
      pinch = null;
      t.pinchEnd?.();
      // The finger left behind drags on from where it is, and never counts as a tap.
      const [rest] = [...fingers.entries()];
      if (rest) startDrag(rest[0], rest[1].x, rest[1].y, true, t);
      return;
    }
    if (!down || e.pointerId !== down.id) return;
    const { moved, t } = down;
    down = null;
    if (moved || cancelled) return;
    const g = toGame(e.clientX, e.clientY);
    const cam = t.scene.cameras.main;
    const at = cam.getWorldPoint(g.x, g.y);
    t.tap(at.x, at.y, cam.zoom / g.s, e.pointerType !== 'mouse');
  };
  canvas.addEventListener('pointerup', (e) => lift(e, false));
  canvas.addEventListener('pointercancel', (e) => lift(e, true));
  canvas.addEventListener('lostpointercapture', (e) => lift(e, true));
  // A mouse wheel or a trackpad pinch zooms about the pointer.
  canvas.addEventListener(
    'wheel',
    (e) => {
      const t = target();
      if (!t?.pinchTo) return;
      e.preventDefault();
      const g = toGame(e.clientX, e.clientY);
      t.pinchStart?.(g.x, g.y);
      t.pinchTo(g.x, g.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
      t.pinchEnd?.();
    },
    { passive: false },
  );
  // Safari's own pinch would zoom the whole page instead of the map.
  canvas.addEventListener('gesturestart', (e) => e.preventDefault());
  // No long-press menu or text selection on the map.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
