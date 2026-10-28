import type * as Phaser from 'phaser';

// Taps and drags on the map, from the browser's own pointer events rather than Phaser's input.
// Phaser reads touches through its own path (touch events, page offsets, a check that the finger
// is still over the canvas on every move), which went wrong in Safari on iPhone: drags did
// nothing and taps on the world map missed. Pointer events behave the same in every browser,
// and the canvas's place is measured afresh on every touch.

export interface MapTarget {
  scene: Phaser.Scene;
  tap: (worldX: number, worldY: number, k: number, touch: boolean) => void;
  grab?: () => void;
  dragBy?: (dx: number, dy: number) => void; // in game pixels since the finger landed
}

const SLOP = 8; // screen pixels a finger may wander and still count as a tap

export function bindMapInput(canvas: HTMLCanvasElement, game: Phaser.Game, target: () => MapTarget | null): void {
  let down: { id: number; x: number; y: number; moved: boolean; t: MapTarget } | null = null;
  // Screen position to game pixels on the canvas, and game pixels per screen pixel.
  const toGame = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    const s = game.scale.gameSize.width / r.width;
    return { x: (cx - r.left) * s, y: (cy - r.top) * s, s };
  };
  canvas.addEventListener('pointerdown', (e) => {
    // One finger at a time; a new touch always starts afresh, so one whose end went missing
    // can never leave the map deaf.
    if (!e.isPrimary || e.button > 0) return;
    const t = target();
    if (!t) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, t };
    try {
      canvas.setPointerCapture(e.pointerId); // the drag keeps coming here even off the canvas
    } catch {
      // the pointer is already gone: its up event will still reach the canvas
    }
    t.grab?.();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) < SLOP) return;
    down.moved = true;
    const { s } = toGame(e.clientX, e.clientY);
    down.t.dragBy?.(dx * s, dy * s);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const { moved, t } = down;
    down = null;
    if (moved) return;
    const g = toGame(e.clientX, e.clientY);
    const cam = t.scene.cameras.main;
    const at = cam.getWorldPoint(g.x, g.y);
    t.tap(at.x, at.y, cam.zoom / g.s, e.pointerType !== 'mouse');
  });
  const drop = (e: PointerEvent) => {
    if (down && e.pointerId === down.id) down = null;
  };
  canvas.addEventListener('pointercancel', drop);
  canvas.addEventListener('lostpointercapture', drop);
  // No long-press menu or text selection on the map.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
