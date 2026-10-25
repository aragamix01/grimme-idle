import * as Phaser from 'phaser';
import { TILE, WorldScene } from './game/scenes/WorldScene';
import { renderFeed } from './ui/feed';
import type { FromWorker, ToWorker } from './worker/protocol';

const TICK_MS = 600;

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

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  scene.setWorld(e.data.world);
  renderFeed(e.data.world);
};

send({ type: 'start', seed: Date.now() >>> 0, tickMs: TICK_MS });
