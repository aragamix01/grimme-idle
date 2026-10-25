// The adventurers' guild: posts quests, gathers parties, sends them out and ranks them F..S.
import { chance, int, pick, type Rng } from './rng';
import { atSpot, clamp, kill, log, makePlan, stepToward } from './core';
import { PLACES, dungeonDoor, type Spot } from './places';
import { AWAY, type Dungeon, type Npc, type Quest, type QuestKind, type WorldState } from './types';

export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
const RANK_RENOWN = [0, 2, 5, 10, 18, 30, 50]; // renown needed for each rank
const OPEN_QUEST_LIMIT = 3;
const POST_CHANCE = 0.03; // per day while below OPEN_QUEST_LIMIT
const RECRUIT_CHANCE = 0.3; // per day per recruiting quest
const RECRUIT_DAYS = 15; // then the party leaves with whoever showed up
const TRAVEL_DAYS = 40; // stragglers are left behind after this
const FINISHED_KEPT = 8; // finished quests shown on the board
const LEGENDS_KEPT = 20;
export const DIVINE_QUEST_COST = 10;

export const isAdventurer = (npc: Npc) => npc.job === 'swordsman' || npc.job === 'mage';
export const rankName = (rank = 0) => RANKS[clamp(rank, 0, RANKS.length - 1)];
const isActive = (q: Quest) => q.stage === 'recruiting' || q.stage === 'travelling' || q.stage === 'inside';

// Older saves predate the guild.
export function ensureGuild(world: WorldState): void {
  world.quests ??= [];
  world.legends ??= [];
  for (const n of world.npcs) if (isAdventurer(n)) {
    n.rank ??= 0;
    n.renown ??= 0;
  }
}

export function updateGuild(world: WorldState, rng: Rng): void {
  const open = world.quests.filter((q) => q.stage === 'recruiting').length;
  if (open < OPEN_QUEST_LIMIT && chance(rng, POST_CHANCE)) postQuest(world, rng);
  for (const q of world.quests) if (isActive(q)) advance(world, q, rng);
  const finished = world.quests.filter((q) => !isActive(q));
  if (finished.length > FINISHED_KEPT) {
    const drop = new Set(finished.slice(0, finished.length - FINISHED_KEPT));
    world.quests = world.quests.filter((q) => !drop.has(q));
  }
}

// ---------- posting ----------

function strongestDungeon(world: WorldState): Dungeon {
  return world.dungeons.reduce((a, b) => (b.power > a.power ? b : a));
}

function newQuest(world: WorldState, kind: QuestKind, title: string, rank: number, difficulty: number, reward: number, minParty: number): Quest {
  return {
    id: world.nextId++,
    kind,
    title,
    rank,
    difficulty,
    reward,
    minParty,
    stage: 'recruiting',
    stageDay: world.day,
    postedDay: world.day,
    partyIds: [],
  };
}

function postQuest(world: WorldState, rng: Rng): void {
  const d = strongestDungeon(world);
  const threat = Math.floor(d.power / 20);
  const r = int(rng, 0, 3); // 2 in 4 hunts, 1 explore, 1 escort when a merchant is free
  const merchants = world.npcs.filter((n) => n.alive && n.job === 'merchant' && n.questId === undefined && n.inside === undefined);
  const client = merchants.length ? pick(rng, merchants) : undefined;
  let q: Quest;
  if (r === 3 && client) {
    const rank = int(rng, 0, 2);
    q = newQuest(world, 'escort', `คุ้มกัน${client.name}ไปเมืองข้างเคียง`, rank, 15 + rank * 12, 12 * (rank + 1), 1);
    q.clientId = client.id;
    client.questId = q.id;
  } else if (r === 2) {
    const rank = clamp(threat + 1, 1, 6);
    q = newQuest(world, 'explore', `สำรวจชั้นลึกของ${d.name}`, rank, 30 + rank * 14 + d.power * 0.4, 25 * (rank + 1), 3);
    q.dungeonId = d.id;
  } else {
    const rank = clamp(threat, 0, 4);
    q = newQuest(world, 'hunt', `ปราบมอนสเตอร์ใน${d.name}`, rank, 15 + rank * 10 + d.power * 0.4, 15 * (rank + 1), 2);
    q.dungeonId = d.id;
  }
  world.quests.push(q);
}

// Posted by the player: a hard hunt at the most dangerous dungeon that pays double.
export function postDivineQuest(world: WorldState): void {
  const d = strongestDungeon(world);
  const rank = clamp(Math.floor(d.power / 20) + 1, 1, 6);
  const q = newQuest(world, 'hunt', `ปราบมอนสเตอร์ใน${d.name}`, rank, 15 + rank * 10 + d.power * 0.4, 30 * (rank + 1), 2);
  q.dungeonId = d.id;
  q.divine = true;
  world.quests.push(q);
  log(world, 'quest', `เทพเจ้าประทานเควสศักดิ์สิทธิ์แรงก์ ${rankName(rank)}: ${q.title}`);
}

// ---------- the life of a quest ----------

const members = (world: WorldState, q: Quest) =>
  q.partyIds.map((id) => world.npcs.find((n) => n.id === id)).filter((n): n is Npc => !!n?.alive);
const client = (world: WorldState, q: Quest) => world.npcs.find((n) => n.id === q.clientId && n.alive);
const everyone = (world: WorldState, q: Quest) => {
  const c = client(world, q);
  return c ? [...members(world, q), c] : members(world, q);
};

function destination(world: WorldState, q: Quest): Spot {
  if (q.kind === 'escort') return PLACES.gate;
  return dungeonDoor(world.dungeons.find((d) => d.id === q.dungeonId)!);
}

function setStage(world: WorldState, q: Quest, stage: Quest['stage']): void {
  q.stage = stage;
  q.stageDay = world.day;
}

function advance(world: WorldState, q: Quest, rng: Rng): void {
  q.partyIds = members(world, q).map((n) => n.id);
  const waited = world.day - q.stageDay;

  if (q.stage === 'recruiting') {
    if (q.kind === 'escort' && !client(world, q)) return expire(world, q);
    if (chance(rng, RECRUIT_CHANCE)) recruit(world, q, rng);
    const ready = q.partyIds.length >= q.minParty || (waited >= RECRUIT_DAYS && q.partyIds.length > 0);
    if (ready) {
      setStage(world, q, 'travelling');
      const leader = members(world, q)[0];
      const size = q.partyIds.length;
      log(world, 'quest', `ปาร์ตี้ของ${leader.name} (${size} คน) ออกเดินทาง: ${q.title}`, leader.id);
    } else if (waited >= RECRUIT_DAYS * 2) {
      expire(world, q);
    }
    return;
  }

  if (q.stage === 'travelling') {
    if (!q.partyIds.length) return fail(world, q, []);
    const dest = destination(world, q);
    const party = everyone(world, q);
    if (party.every((n) => atSpot(n, dest, 1)) || waited >= TRAVEL_DAYS) {
      setStage(world, q, 'inside');
      q.daysLeft = q.kind === 'explore' ? int(rng, 6, 10) : q.kind === 'escort' ? int(rng, 10, 15) : int(rng, 3, 6);
      for (const n of party) {
        n.inside = q.kind === 'escort' ? AWAY : q.dungeonId;
        n.x = dest.x;
        n.y = dest.y;
      }
    }
    return;
  }

  // inside
  if (q.daysLeft !== undefined && --q.daysLeft <= 0) resolve(world, q, rng);
}

function recruit(world: WorldState, q: Quest, rng: Rng): void {
  const candidates = world.npcs.filter(
    (n) =>
      n.alive &&
      isAdventurer(n) &&
      n.questId === undefined &&
      n.inside === undefined &&
      n.plan?.kind !== 'adventure' &&
      (n.rank ?? 0) >= q.rank - 1,
  );
  if (!candidates.length) return;
  const n = pick(rng, candidates);
  n.questId = q.id;
  n.plan = undefined;
  q.partyIds.push(n.id);
}

function expire(world: WorldState, q: Quest): void {
  for (const n of everyone(world, q)) n.questId = undefined;
  setStage(world, q, 'expired');
}

function resolve(world: WorldState, q: Quest, rng: Rng): void {
  const party = members(world, q);
  const strength = party.reduce((s, n) => s + 10 + n.level * 4 + (n.blessed ? 10 : 0), 0);
  const success = party.length > 0 && chance(rng, strength / (strength + q.difficulty));
  if (success) succeed(world, q, party, rng);
  else fail(world, q, party, rng);
  // Survivors walk back into town.
  const dest = destination(world, q);
  for (const n of everyone(world, q)) {
    n.inside = undefined;
    n.questId = undefined;
    n.x = dest.x;
    n.y = dest.y;
    n.plan = makePlan('return', n.job === 'merchant' ? PLACES.shop : PLACES.guild, 0);
  }
}

function succeed(world: WorldState, q: Quest, party: Npc[], rng: Rng): void {
  setStage(world, q, 'done');
  const share = Math.ceil(q.reward / party.length);
  const renown = (q.rank + 1) * (q.divine ? 2 : 1);
  for (const n of party) {
    n.gold += share;
    n.renown = (n.renown ?? 0) + renown;
    if (chance(rng, 2 / (n.level + 1))) n.level++;
    rankUp(world, n);
  }
  const c = client(world, q);
  if (c) c.gold += q.reward;
  if (q.dungeonId !== undefined) {
    const d = world.dungeons.find((x) => x.id === q.dungeonId)!;
    d.power = Math.max(10, d.power - (8 + q.rank * 4)); // the guild keeps stampedes at bay
  }
  const leader = party[0];
  log(world, 'quest', `ปาร์ตี้ของ${leader.name} ทำเควสแรงก์ ${rankName(q.rank)} สำเร็จ: ${q.title} (+${q.reward} ทอง)`, leader.id);
  if (q.rank >= 3 || q.divine) legend(world, `ปาร์ตี้ของ${leader.name} พิชิตเควสแรงก์ ${rankName(q.rank)}: ${q.title}`, leader.id);
}

function fail(world: WorldState, q: Quest, party: Npc[], rng?: Rng): void {
  setStage(world, q, 'failed');
  if (!party.length || !rng) return;
  log(world, 'quest', `ปาร์ตี้ของ${party[0].name} ล้มเหลวในเควส: ${q.title}`, party[0].id);
  // Bigger parties cover each other.
  const risk = 0.25 / Math.sqrt(party.length);
  for (const n of party) if (chance(rng, risk)) kill(world, n, `ล้มลงระหว่างเควส${q.title}`);
  const c = client(world, q);
  if (c && chance(rng, risk)) kill(world, c, 'ถูกโจรป่าซุ่มโจมตีระหว่างเดินทาง');
}

function rankUp(world: WorldState, n: Npc): void {
  let rank = n.rank ?? 0;
  while (rank < RANKS.length - 1 && (n.renown ?? 0) >= RANK_RENOWN[rank + 1]) rank++;
  if (rank === (n.rank ?? 0)) return;
  n.rank = rank;
  log(world, 'rank', `${n.name} เลื่อนเป็นนักผจญภัยแรงก์ ${rankName(rank)}`, n.id);
  if (rank >= 4) legend(world, `${n.name} ขึ้นสู่แรงก์ ${rankName(rank)}`, n.id);
}

function legend(world: WorldState, text: string, npcId?: number): void {
  world.legends.push({ day: world.day, text, npcId });
  if (world.legends.length > LEGENDS_KEPT) world.legends.shift();
}

// ---------- what a signed-up NPC does each day ----------

// Returns true when the quest is driving this NPC today.
export function questDay(world: WorldState, npc: Npc, rng: Rng): boolean {
  const q = world.quests.find((x) => x.id === npc.questId);
  if (!q || !isActive(q)) {
    npc.questId = undefined;
    return false;
  }
  if (npc.inside !== undefined) return true; // the quest timer brings them back out
  const slot = Math.max(0, q.partyIds.indexOf(npc.id));
  const base = q.stage === 'recruiting' ? PLACES.guild : destination(world, q);
  // Fan the party out so they don't stand on one tile.
  const spot = { x: clamp(base.x - 1 + (slot % 3), 0, world.width - 1), y: base.y + (slot >= 3 ? 1 : 0) };
  if (!atSpot(npc, spot)) stepToward(world, npc, spot, rng);
  return true;
}
