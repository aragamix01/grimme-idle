import { createWorld, tick, type Command, type WorldState } from '../sim';
import type { FromWorker, ToWorker } from './protocol';

let world: WorldState | null = null;
let pending: Command[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

function post(msg: FromWorker): void {
  self.postMessage(msg);
}

function run(tickMs: number): void {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!world) return;
    tick(world, pending);
    pending = [];
    post({ type: 'state', world });
  }, tickMs);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    world = createWorld(msg.seed);
    post({ type: 'state', world });
    run(msg.tickMs);
  } else if (msg.type === 'command') {
    pending.push(msg.command);
  } else if (msg.type === 'speed') {
    run(msg.tickMs);
  }
};
