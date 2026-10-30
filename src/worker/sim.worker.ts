import { applyCommands, canEndEra, createWorld, foundWorld, newEra, tick, type Command, type EventKind, type WorldState } from '../sim';
import type { FromWorker, OfflineReport, ToWorker } from './protocol';
import { clearSave, loadSave, writeSave } from './storage';

const AUTOSAVE_EVERY = 10; // days
const OFFLINE_CAP = 5 * 365; // days simulated while the tab was closed
const PROGRESS_EVERY = 30; // days between progress reports during a catch-up
const HIGHLIGHTS = 8;
const HIGHLIGHT_KINDS = new Set<EventKind>(['battle', 'death', 'disaster', 'bless', 'curse', 'quest', 'rank', 'trade', 'politics', 'cult']);

let world: WorldState | null = null;
let pending: Command[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let tickMs = 600;

function post(msg: FromWorker): void {
  self.postMessage(msg);
}

// The page can't take a whole world many times a frame: at a fast-forward pace, days go by
// between snapshots. On pausing, the page gets the world as it stands.
const POST_GAP = 50; // ms
let posted = 0;

function run(ms: number): void {
  clearInterval(timer);
  const was = tickMs;
  tickMs = ms;
  if (ms <= 0) {
    if (was > 0 && world) post({ type: 'state', world });
    return;
  }
  timer = setInterval(() => {
    if (!world) return;
    if (world.choice) return; // the player's life waits on their answer, and so does the town
    tick(world, pending);
    pending = [];
    if (world.day % AUTOSAVE_EVERY === 0) void writeSave(world);
    const now = Date.now();
    if (ms >= POST_GAP || now - posted >= POST_GAP) {
      posted = now;
      post({ type: 'state', world });
    }
  }, ms);
}

// Fast-forward the days that passed since the last save and summarise them.
function catchUp(w: WorldState, savedAt: number, ms: number): OfflineReport | null {
  const days = Math.min(Math.floor((Date.now() - savedAt) / ms), OFFLINE_CAP);
  if (days < 1) return null;
  const fromDay = w.day;
  const counts: OfflineReport['counts'] = {};
  const highlights: OfflineReport['highlights'] = [];
  // The chronicle only keeps its latest few hundred entries, so tally each day's as it happens.
  let seen = w.chronicleSeq;
  for (let i = 0; i < days; i++) {
    tick(w);
    for (const e of w.chronicle) {
      if (e.seq <= seen) continue;
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      if (HIGHLIGHT_KINDS.has(e.kind)) highlights.push(e);
    }
    if (highlights.length > HIGHLIGHTS) highlights.splice(0, highlights.length - HIGHLIGHTS);
    seen = w.chronicleSeq;
    if (i % PROGRESS_EVERY === 0) post({ type: 'catchup', done: i, total: days });
  }
  const legends = w.legends.filter((l) => l.day > fromDay);
  return { days, counts, highlights: highlights.reverse(), legends };
}

let whole = false;
const fresh = () => (whole ? createWorld(Date.now() >>> 0) : foundWorld(Date.now() >>> 0));

async function start(ms: number): Promise<void> {
  const save = await loadSave();
  if (save) {
    world = save.world;
    const report = catchUp(world, save.savedAt, ms);
    if (report) post({ type: 'offline', report });
  } else {
    world = fresh();
  }
  void writeSave(world);
  post({ type: 'state', world });
  run(ms);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    whole = !!msg.whole;
    void start(msg.tickMs);
  } else if (msg.type === 'command') {
    if (tickMs > 0 && !world?.choice) {
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
  } else if (msg.type === 'newEra') {
    if (!world || !canEndEra(world)) return;
    world = newEra(world, Date.now() >>> 0);
    // The page reloads to build the new town from scratch.
    void writeSave(world).then(() => post({ type: 'era' }));
  } else if (msg.type === 'reset') {
    void clearSave().then(() => {
      world = fresh();
      post({ type: 'state', world });
    });
  }
};
