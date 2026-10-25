import type { EventKind, WorldState } from '../sim';

// Short reactions that pop over an NPC's head when something happens to them.
const LINES: Partial<Record<EventKind, string[]>> = {
  battle: ['ชนะแล้ว!', 'เลเวลอัป!', 'ได้ของแล้ว!'],
  theft: ['หึหึ…', 'ได้ทองมาแล้ว'],
  bless: ['อบอุ่นจัง…', 'ขอบคุณเทพเจ้า!'],
  curse: ['อ๊บ!?', 'ทำไมเป็นกบ!'],
  dream: ['ฝันประหลาด…', 'หรือจะเปลี่ยนอาชีพดี'],
};
const LIFETIME_MS = 2600;
const MAX_BUBBLES = 4;

interface Bubble {
  el: HTMLElement;
  npcId: number;
  until: number;
}

const layer = document.getElementById('bubbles')!;
let bubbles: Bubble[] = [];
let lastSeq = -1;
let locate: (id: number) => { x: number; y: number } | null = () => null;

export function initBubbles(locator: typeof locate): void {
  locate = locator;
  requestAnimationFrame(frame);
}

export function pushBubbles(world: WorldState): void {
  // Skip the backlog on first load (and after offline catch-up): only react to live events.
  if (lastSeq < 0) {
    lastSeq = world.chronicleSeq;
    return;
  }
  for (const e of world.chronicle) {
    if (e.seq <= lastSeq || e.npcId === undefined) continue;
    const lines = LINES[e.kind];
    if (!lines) continue;
    const node = document.createElement('span');
    node.className = 'bubble';
    node.textContent = lines[e.seq % lines.length];
    layer.append(node);
    bubbles.push({ el: node, npcId: e.npcId, until: performance.now() + LIFETIME_MS });
  }
  lastSeq = world.chronicleSeq;
  while (bubbles.length > MAX_BUBBLES) bubbles.shift()!.el.remove();
}

function frame(now: number): void {
  bubbles = bubbles.filter((b) => {
    const pos = locate(b.npcId);
    if (!pos || now > b.until) {
      b.el.remove();
      return false;
    }
    b.el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px) translate(-50%, calc(-100% - 10px))`;
    b.el.style.visibility = 'visible';
    return true;
  });
  requestAnimationFrame(frame);
}
