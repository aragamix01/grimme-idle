import { applyCommands, createWorld, tick, type Command, type EventKind, type WorldState } from '../sim';
import type { FromWorker, OfflineReport, ToWorker } from './protocol';
import { clearSave, loadSave, writeSave } from './storage';

const AUTOSAVE_EVERY = 10; // days
const OFFLINE_CAP = 1000; // days simulated while the tab was closed
const HIGHLIGHT_KINDS = new Set<EventKind>(['battle', 'death', 'disaster', 'bless', 'curse', 'quest', 'rank']);

let world: WorldState | null = null;
let pending: Command[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let tickMs = 600;

function post(msg: FromWorker): void {
  self.postMessage(msg);
}

function run(ms: number): void {
  clearInterval(timer);
  tickMs = ms;
  if (ms <= 0) return;
  timer = setInterval(() => {
    if (!world) return;
    tick(world, pending);
    pending = [];
    if (world.day % AUTOSAVE_EVERY === 0) void writeSave(world);
    post({ type: 'state', world });
  }, ms);
}

// Fast-forward the days that passed since the last save and summarise them.
function catchUp(w: WorldState, savedAt: number, ms: number): OfflineReport | null {
  const days = Math.min(Math.floor((Date.now() - savedAt) / ms), OFFLINE_CAP);
  if (days < 1) return null;
  const fromSeq = w.chronicleSeq;
  for (let i = 0; i < days; i++) tick(w);
  const entries = w.chronicle.filter((e) => e.seq > fromSeq);
  const counts: OfflineReport['counts'] = {};
  for (const e of entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  const highlights = entries.filter((e) => HIGHLIGHT_KINDS.has(e.kind)).slice(-5).reverse();
  return { days, counts, highlights };
}

async function start(ms: number): Promise<void> {
  const save = await loadSave();
  if (save) {
    world = save.world;
    const report = catchUp(world, save.savedAt, ms);
    if (report) post({ type: 'offline', report });
  } else {
    world = createWorld(Date.now() >>> 0);
  }
  void writeSave(world);
  post({ type: 'state', world });
  run(ms);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    void start(msg.tickMs);
  } else if (msg.type === 'command') {
    if (tickMs > 0) {
      pending.push(msg.command);
    } else if (world) {
      // Paused: powers still land right away.
      applyCommands(world, [msg.command]);
      post({ type: 'state', world });
    }
  } else if (msg.type === 'speed') {
    run(msg.tickMs);
  } else if (msg.type === 'save') {
    if (world) void writeSave(world);
  } else if (msg.type === 'reset') {
    void clearSave().then(() => {
      world = createWorld(Date.now() >>> 0);
      post({ type: 'state', world });
    });
  }
};
