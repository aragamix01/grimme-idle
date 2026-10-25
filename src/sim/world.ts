import { chance, createRng, int, next, pick, type Rng } from './rng';
import { DUNGEON_NAMES, FIRST_NAMES, JOB_TH } from './names';
import type { Command, EventKind, Job, Npc, Trait, WorldState } from './types';

const JOBS: readonly Job[] = ['swordsman', 'mage', 'merchant', 'farmer', 'thief'];
const TRAITS: readonly Trait[] = ['greedy', 'brave', 'coward', 'loyal', 'vengeful', 'kind'];
const CHRONICLE_LIMIT = 500;
const STAMPEDE_POWER = 100;
export const COMMAND_COST = { bless: 5, curse: 5, dream: 3 } as const;
const THEFT_CHANCE = 0.003; // per thief per day; higher drowned the chronicle in thefts
const TOWN_SIZE = 30;
const ARRIVAL_CHANCE = 0.02; // per day while the town is below TOWN_SIZE

export function createWorld(seed: number, npcCount = TOWN_SIZE): WorldState {
  const rng = createRng(seed);
  const world: WorldState = {
    version: 1,
    seed,
    rng: 0,
    day: 0,
    faith: 10,
    width: 40,
    height: 25,
    npcs: [],
    dungeons: [],
    chronicle: [],
    chronicleSeq: 0,
    nextId: 1,
  };
  for (let i = 0; i < npcCount; i++) world.npcs.push(spawnNpc(world, rng));
  world.dungeons.push({
    id: world.nextId++,
    name: pick(rng, DUNGEON_NAMES),
    x: int(rng, 30, 37),
    y: int(rng, 3, 20),
    power: 10,
  });
  world.rng = rng.state;
  log(world, 'world', 'ยุคที่ 1 เริ่มต้น โลกตื่นจากนิทรา');
  return world;
}

export function tick(world: WorldState, commands: Command[] = []): WorldState {
  const rng: Rng = { state: world.rng };
  applyCommands(world, commands);

  world.day++;
  for (const npc of world.npcs) {
    if (!npc.alive) continue;
    if (world.day % 365 === 0) npc.age++;
    wander(world, npc, rng);
    act(world, npc, rng);
  }
  for (const d of world.dungeons) {
    d.power += 0.2;
    if (d.power >= STAMPEDE_POWER) {
      log(world, 'disaster', `มอนสเตอร์ล้นออกจาก ${d.name}!`);
      d.power = 30;
      for (const npc of world.npcs) if (npc.alive && chance(rng, 0.1)) kill(world, npc, 'ถูกมอนสเตอร์ล้มลง');
    }
  }
  // Travellers drift into town while it's below its starting size.
  const living = world.npcs.filter((n) => n.alive).length;
  if (living < TOWN_SIZE && chance(rng, ARRIVAL_CHANCE)) {
    const npc = spawnNpc(world, rng);
    npc.x = 0;
    npc.y = 10;
    world.npcs.push(npc);
    log(world, 'world', `นักเดินทาง ${npc.name} (${JOB_TH[npc.job]}) มาถึงเมือง`, npc.id);
  }
  world.faith += world.npcs.filter((n) => n.alive && n.blessed).length * 0.1 + 0.1;
  world.rng = rng.state;
  return world;
}

// Prefer a name nobody living has; once the pool runs out, number the repeat.
function uniqueName(world: WorldState, rng: Rng): string {
  const taken = new Set(world.npcs.filter((n) => n.alive).map((n) => n.name));
  const free = FIRST_NAMES.filter((n) => !taken.has(n));
  if (free.length) return pick(rng, free);
  const base = pick(rng, FIRST_NAMES);
  let i = 2;
  while (taken.has(`${base} ที่ ${i}`)) i++;
  return `${base} ที่ ${i}`;
}

function spawnNpc(world: WorldState, rng: Rng): Npc {
  const t1 = pick(rng, TRAITS);
  const t2 = pick(rng, TRAITS);
  return {
    id: world.nextId++,
    name: uniqueName(world, rng),
    age: int(rng, 16, 50),
    job: pick(rng, JOBS),
    level: 1,
    gold: int(rng, 5, 30),
    morality: int(rng, -20, 40),
    traits: t1 === t2 ? [t1] : [t1, t2],
    x: int(rng, 2, 25),
    y: int(rng, 2, 22),
    alive: true,
    blessed: false,
  };
}

function wander(world: WorldState, npc: Npc, rng: Rng): void {
  npc.x = clamp(npc.x + int(rng, -1, 1), 0, world.width - 1);
  npc.y = clamp(npc.y + int(rng, -1, 1), 0, world.height - 1);
}

// Utility scoring placeholder: one roll per day decides the NPC's action.
function act(world: WorldState, npc: Npc, rng: Rng): void {
  const r = next(rng);
  const fighter = npc.job === 'swordsman' || npc.job === 'mage';
  if (fighter && r < 0.02) {
    const d = pick(rng, world.dungeons);
    // Strength grows slower than levels and the dungeon always fights back, so nobody snowballs.
    const strength = 10 + npc.level * 4 + (npc.blessed ? 10 : 0);
    if (chance(rng, strength / (strength + d.power * 0.5 + 10))) {
      npc.gold += int(rng, 5, 25);
      d.power = Math.max(10, d.power - 5);
      // Each level is harder to earn than the last; only level-ups make the chronicle.
      if (chance(rng, 2 / (npc.level + 1))) {
        npc.level++;
        log(world, 'battle', `${npc.name} พิชิต ${d.name} ขึ้นเลเวล ${npc.level}`, npc.id);
      }
    } else if (chance(rng, 0.15)) {
      kill(world, npc, `หายไปใน ${d.name}`);
    }
  } else if (npc.job === 'thief' && r < THEFT_CHANCE) {
    const victim = pick(rng, world.npcs);
    if (victim.alive && victim !== npc && victim.gold >= 5) {
      const stolen = Math.ceil(victim.gold / 2);
      victim.gold -= stolen;
      npc.gold += stolen;
      npc.morality = clamp(npc.morality - 5, -100, 100);
      log(world, 'theft', `${npc.name} ขโมยทอง ${stolen} เหรียญจาก ${victim.name}`, npc.id);
    }
  } else if (r < 0.3) {
    npc.gold += npc.job === 'merchant' ? 2 : 1;
  }
}

export function applyCommands(world: WorldState, commands: Command[]): void {
  for (const cmd of commands) applyCommand(world, cmd);
}

function applyCommand(world: WorldState, cmd: Command): void {
  const npc = world.npcs.find((n) => n.id === cmd.npcId && n.alive);
  const cost = COMMAND_COST[cmd.type];
  if (!npc || world.faith < cost) return;
  world.faith -= cost;
  if (cmd.type === 'bless') {
    npc.blessed = true;
    npc.morality = clamp(npc.morality + 10, -100, 100);
    log(world, 'bless', `แสงศักดิ์สิทธิ์โอบล้อม ${npc.name}`, npc.id);
  } else if (cmd.type === 'curse') {
    npc.blessed = false;
    npc.level = Math.max(1, npc.level - 1);
    log(world, 'curse', `${npc.name} ต้องคำสาปแห่งกบ`, npc.id);
  } else {
    npc.job = cmd.job;
    log(world, 'dream', `${npc.name} ฝันถึงชีวิตใหม่ในฐานะ${JOB_TH[cmd.job]}`, npc.id);
  }
}

function kill(world: WorldState, npc: Npc, reason: string): void {
  npc.alive = false;
  log(world, 'death', `${npc.name} ${reason}`, npc.id);
}

function log(world: WorldState, kind: EventKind, text: string, npcId?: number): void {
  world.chronicle.push({ seq: ++world.chronicleSeq, day: world.day, kind, text, npcId });
  if (world.chronicle.length > CHRONICLE_LIMIT) world.chronicle.shift();
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
