import * as Phaser from 'phaser';
import type { WorldState } from './sim';
import { TILE, WorldScene } from './game/scenes/WorldScene';
import { initBubbles, pushBubbles } from './ui/bubbles';
import { renderFeed } from './ui/feed';
import { initNpcCard, renderNpcCard } from './ui/npcCard';
import { showOfflineReport } from './ui/offline';
import type { FromWorker, ToWorker } from './worker/protocol';

const TICK_MS = 600; // one in-game day at 1x

const scene = new WorldScene();
scene.tickMs = TICK_MS;
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 40 * TILE,
  height: 25 * TILE,
  pixelArt: true,
  backgroundColor: '#8fd64e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene,
});

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);

let world: WorldState | null = null;
let selected: number | null = null;
let filterToNpc = false;

function render(): void {
  if (!world) return;
  renderNpcCard(world, selected);
  renderFeed(world, filterToNpc ? selected : null);
}

function select(id: number | null): void {
  selected = id;
  scene.select(id);
  const npcTab = document.querySelector<HTMLButtonElement>('[data-filter="npc"]')!;
  npcTab.disabled = id === null;
  if (id === null) setFilter(false);
  render();
}

function setFilter(toNpc: boolean): void {
  filterToNpc = toNpc;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#log-filter button')) {
    b.setAttribute('aria-pressed', String((b.dataset.filter === 'npc') === toNpc));
  }
  render();
}

scene.onSelect = select;
initNpcCard({ onCommand: (command) => send({ type: 'command', command }), onClose: () => select(null) });
document.getElementById('npc-card')!.addEventListener('rerender', () => world && renderNpcCard(world, selected, true));
initBubbles((id) => scene.npcScreenPos(id));

for (const b of document.querySelectorAll<HTMLButtonElement>('#log-filter button')) {
  b.onclick = () => setFilter(b.dataset.filter === 'npc');
}

const SPEEDS: Record<string, number> = { 0: 0, 1: TICK_MS, 3: TICK_MS / 3 };
for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) {
  b.onclick = () => {
    const ms = SPEEDS[b.dataset.speed!];
    scene.tickMs = ms || TICK_MS;
    send({ type: 'speed', tickMs: ms });
    for (const o of document.querySelectorAll('#speed button')) o.setAttribute('aria-pressed', String(o === b));
  };
}

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === 'offline') {
    showOfflineReport(msg.report);
    return;
  }
  world = msg.world;
  scene.setWorld(world);
  pushBubbles(world);
  render();
};

// Save when the tab is hidden or closed so offline progress starts from the latest moment.
document.addEventListener('visibilitychange', () => document.hidden && send({ type: 'save' }));
addEventListener('pagehide', () => send({ type: 'save' }));

send({ type: 'start', tickMs: TICK_MS });

if (import.meta.env.DEV) Object.assign(window, { __grimm: { scene, send, select, worker } });
