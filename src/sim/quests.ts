// The quest board. Quests come from real needs (a raided field, a merchant's trip, a theft,
// a swelling dungeon) and are paid for by whoever posted them; adventurers form parties to take them.
import { chance, int, next, type Rng } from './rng';
import { atSpot, clamp, kill, log, makePlan, stepToward } from './core';
import { FIELDS, PLACES, dungeonDoor, type Spot } from './places';
import { FRIEND, addTie, getTie } from './ties';
import { AWAY, type Guild, type Npc, type Quest, type QuestKind, type WorldState } from './types';

export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
const RANK_RENOWN = [0, 2, 5, 10, 18, 30, 50]; // renown needed for each rank
const RECRUIT_CHANCE = 0.3; // per day per recruiting quest
const RECRUIT_DAYS = 15; // then the party leaves with whoever showed up
const TRAVEL_DAYS = 40; // stragglers are left behind after this
const FINISHED_KEPT = 8;
const LEGENDS_KEPT = 20;
const THREAT_POWER = 45; // the crown pays to thin out a dungeon past this
const TREASURY_INCOME = 0.4; // gold a day from the town's taxes
const PEST_CHANCE = 0.003; // per working farmer per day
const ESCORT_CHANCE = 0.002; // per merchant with savings per day
const GUILD_CUT = 0.1; // share of a claimed quest's reward kept by the guild
export const DIVINE_QUEST_COST = 10;

export const isAdventurer = (npc: Npc) => npc.job === 'swordsman' || npc.job === 'mage';
export const rankName = (rank = 0) => RANKS[clamp(rank, 0, RANKS.length - 1)];
export const isActive = (q: Quest) => q.stage === 'recruiting' || q.stage === 'travelling' || q.stage === 'inside';

// Older saves predate the guild, ties and treasury.
export function ensureGuild(world: WorldState): void {
  world.quests ??= [];
  world.legends ??= [];
  world.guilds ??= [];
  world.ties ??= {};
  world.treasury ??= 50;
  for (const n of world.npcs) if (isAdventurer(n)) {
    n.rank ??= 0;
    n.renown ??= 0;
  }
}

export function updateQuests(world: WorldState, rng: Rng): void {
  world.treasury += TREASURY_INCOME;
  crownWatch(world);
  merchantTrips(world, rng);
  for (const q of world.quests) if (isActive(q)) advance(world, q, rng);
  const finished = world.quests.filter((q) => !isActive(q));
  if (finished.length > FINISHED_KEPT) {
    const drop = new Set(finished.slice(0, finished.length - FINISHED_KEPT));
    world.quests = world.quests.filter((q) => !drop.has(q));
  }
}

// ---------- who posts what ----------

function newQuest(world: WorldState, kind: QuestKind, title: string, rank: number, difficulty: number, reward: number, minParty: number): Quest {
  return { id: world.nextId++, kind, title, rank, difficulty, reward, minParty, stage: 'recruiting', stageDay: world.day, postedDay: world.day, partyIds: [] };
}

const openQuest = (world: WorldState, test: (q: Quest) => boolean) => world.quests.some((q) => isActive(q) && test(q));

// The town pays to cut back a dungeon that's getting dangerous.
function crownWatch(world: WorldState): void {
  for (const d of world.dungeons) {
    if (d.power < THREAT_POWER || openQuest(world, (q) => q.dungeonId === d.id && q.kind === 'hunt')) continue;
    const rank = clamp(Math.floor(d.power / 20), 0, 4);
    const reward = 15 * (rank + 1);
    if (world.treasury < reward) continue;
    world.treasury -= reward;
    const q = newQuest(world, 'hunt', `ปราบมอนสเตอร์ใน${d.name}`, rank, 15 + rank * 10 + d.power * 0.4, reward, 2);
    q.dungeonId = d.id;
    q.crown = true;
    world.quests.push(q);
    log(world, 'quest', `ราชสำนักประกาศจ้างปราบมอนสเตอร์ใน${d.name} (${reward} ทอง)`);
  }
}

// A farmer working the fields may find wolves at the crops and pay to have them driven off.
export function maybePestQuest(world: WorldState, farmer: Npc, rng: Rng): void {
  if (!chance(rng, PEST_CHANCE) || farmer.gold < 12) return;
  if (openQuest(world, (q) => q.kind === 'pest')) return;
  const reward = Math.min(farmer.gold - 2, int(rng, 10, 20));
  farmer.gold -= reward;
  const q = newQuest(world, 'pest', `ไล่ฝูงหมาป่าที่ทุ่งของ${farmer.name}`, int(rng, 0, 1), 18, reward, 1);
  q.patronId = farmer.id;
  q.spot = { x: clamp(farmer.x, FIELDS.x0, FIELDS.x1), y: clamp(farmer.y, FIELDS.y0, FIELDS.y1) };
  world.quests.push(q);
  log(world, 'quest', `${farmer.name} เจอหมาป่าบุกทุ่ง ประกาศจ้างนักผจญภัย (${reward} ทอง)`, farmer.id);
}

// Merchants with savings travel to sell elsewhere and want guards for the road.
function merchantTrips(world: WorldState, rng: Rng): void {
  for (const m of world.npcs) {
    if (!m.alive || m.job !== 'merchant' || m.questId !== undefined || m.inside !== undefined || m.gold < 30) continue;
    if (!chance(rng, ESCORT_CHANCE)) continue;
    const rank = m.gold > 80 ? 2 : m.gold > 50 ? 1 : 0;
    const reward = 10 + rank * 8;
    m.gold -= reward;
    const q = newQuest(world, 'escort', `คุ้มกัน${m.name}ไปเมืองข้างเคียง`, rank, 15 + rank * 12, reward, 1);
    q.clientId = m.id;
    q.patronId = m.id;
    m.questId = q.id;
    world.quests.push(q);
  }
}

// A theft victim with a grudge (or the money) puts a price on the thief's head.
export function maybeBounty(world: WorldState, victim: Npc, thief: Npc, amount: number, rng: Rng): void {
  const wantsIt = victim.traits.includes('vengeful') || chance(rng, 0.15);
  if (!wantsIt || victim.gold < 8 || openQuest(world, (q) => q.targetId === thief.id)) return;
  const reward = Math.min(victim.gold, 8 + Math.ceil(amount / 2));
  victim.gold -= reward;
  const rank = clamp(Math.floor(thief.level / 2), 0, 3);
  const q = newQuest(world, 'bounty', `ตามจับโจร${thief.name}`, rank, 12 + thief.level * 6, reward, 1);
  q.patronId = victim.id;
  q.targetId = thief.id;
  world.quests.push(q);
  log(world, 'quest', `${victim.name} ตั้งค่าหัว${thief.name} ${reward} ทอง`, victim.id);
}

// A guild funds a deep expedition for its own members, for glory and loot.
export function postExpedition(world: WorldState, guild: Guild): void {
  const d = world.dungeons.reduce((a, b) => (b.power > a.power ? b : a));
  const rank = clamp(Math.floor(d.power / 20) + 1, 1, 6);
  const reward = 20 * (rank + 1);
  if (guild.treasury < reward / 2) return;
  guild.treasury -= reward / 2; // the other half is loot found down there
  const q = newQuest(world, 'explore', `${guild.name}ออกสำรวจชั้นลึกของ${d.name}`, rank, 30 + rank * 14 + d.power * 0.4, reward, 2);
  q.dungeonId = d.id;
  q.patronGuildId = guild.id;
  q.guildId = guild.id;
  world.quests.push(q);
  log(world, 'guild', `${guild.name}ประกาศออกสำรวจ${d.name}`);
}

// Posted by the player: a hard hunt at the most dangerous dungeon, paid by heaven.
export function postDivineQuest(world: WorldState): void {
  const d = world.dungeons.reduce((a, b) => (b.power > a.power ? b : a));
  const rank = clamp(Math.floor(d.power / 20) + 1, 1, 6);
  const q = newQuest(world, 'hunt', `ปราบมอนสเตอร์ใน${d.name}`, rank, 15 + rank * 10 + d.power * 0.4, 30 * (rank + 1), 2);
  q.dungeonId = d.id;
  q.divine = true;
  world.quests.push(q);
  log(world, 'quest', `เทพเจ้าประทานเควสศักดิ์สิทธิ์แรงก์ ${rankName(rank)}: ${q.title}`);
}

// ---------- the life of a quest ----------

const byId = (world: WorldState, id?: number) => (id === undefined ? undefined : world.npcs.find((n) => n.id === id));
const members = (world: WorldState, q: Quest) => q.partyIds.map((id) => byId(world, id)).filter((n): n is Npc => !!n?.alive);
const client = (world: WorldState, q: Quest) => {
  const c = byId(world, q.clientId);
  return c?.alive ? c : undefined;
};
const everyone = (world: WorldState, q: Quest) => {
  const c = client(world, q);
  return c ? [...members(world, q), c] : members(world, q);
};
// Pests and bounties are dealt with in the open; dungeon and road work happens off-screen.
const onSite = (q: Quest) => q.kind === 'pest' || q.kind === 'bounty';

function destination(world: WorldState, q: Quest): Spot {
  if (q.kind === 'escort') return PLACES.gate;
  if (q.kind === 'pest') return q.spot!;
  if (q.kind === 'bounty') {
    const t = byId(world, q.targetId);
    return t ? { x: t.x, y: t.y } : PLACES.guild;
  }
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
    if (q.kind === 'bounty' && !byId(world, q.targetId)?.alive) return expire(world, q);
    if (chance(rng, RECRUIT_CHANCE)) recruit(world, q, rng);
    const ready = q.partyIds.length >= q.minParty || (waited >= RECRUIT_DAYS && q.partyIds.length > 0);
    if (ready) {
      setStage(world, q, 'travelling');
      const leader = members(world, q)[0];
      const guild = world.guilds.find((g) => g.id === q.guildId);
      const who = guild ? `${guild.name} นำโดย${leader.name}` : `ปาร์ตี้ของ${leader.name}`;
      if (guild || q.partyIds.length > 1) log(world, 'quest', `${who} (${q.partyIds.length} คน) ออกเดินทาง: ${q.title}`, leader.id);
    } else if (waited >= RECRUIT_DAYS * 2) {
      expire(world, q);
    }
    return;
  }

  if (q.stage === 'travelling') {
    if (!q.partyIds.length) return fail(world, q, []);
    const dest = destination(world, q);
    const party = everyone(world, q);
    const arrived = onSite(q) ? party.some((n) => atSpot(n, dest, 1)) : party.every((n) => atSpot(n, dest, 1));
    if (arrived || waited >= TRAVEL_DAYS) {
      setStage(world, q, 'inside');
      q.daysLeft = { explore: int(rng, 6, 10), escort: int(rng, 10, 15), hunt: int(rng, 3, 6), pest: 2, bounty: 1 }[q.kind];
      if (!onSite(q))
        for (const n of party) {
          n.inside = q.kind === 'escort' ? AWAY : q.dungeonId;
          n.x = dest.x;
          n.y = dest.y;
        }
    }
    return;
  }

  // inside / on site
  if (q.daysLeft !== undefined && --q.daysLeft <= 0) resolve(world, q, rng);
}

// Friends and guild-mates pull each other in; a guild can claim a quest once one of its own signs up.
function recruit(world: WorldState, q: Quest, rng: Rng): void {
  const party = members(world, q);
  const target = byId(world, q.targetId);
  const candidates = world.npcs.filter(
    (n) =>
      n.alive &&
      isAdventurer(n) &&
      n.questId === undefined &&
      n.inside === undefined &&
      n.plan?.kind !== 'adventure' &&
      n.id !== q.patronId &&
      (n.rank ?? 0) >= q.rank - 1 &&
      (!target || getTie(world, n.id, target.id) < FRIEND) && // nobody hunts their own friend
      (q.guildId === undefined || n.guildId === q.guildId || party.some((p) => getTie(world, n.id, p.id) >= FRIEND)),
  );
  if (!candidates.length) return;
  const weight = (n: Npc) => {
    let w = 1;
    for (const p of party) {
      w += Math.max(0, getTie(world, n.id, p.id)) / 10;
      if (p.guildId !== undefined && p.guildId === n.guildId) w += 3;
    }
    return w;
  };
  const total = candidates.reduce((s, n) => s + weight(n), 0);
  let roll = next(rng) * total;
  const n = candidates.find((c) => (roll -= weight(c)) <= 0) ?? candidates[candidates.length - 1];
  n.questId = q.id;
  n.plan = undefined;
  q.partyIds.push(n.id);
  if (party.length === 0 && n.guildId !== undefined && q.guildId === undefined && chance(rng, 0.6)) q.guildId = n.guildId;
}

function refund(world: WorldState, q: Quest): void {
  const patron = byId(world, q.patronId);
  if (patron?.alive) patron.gold += q.reward;
  else if (q.crown) world.treasury += q.reward;
  const g = world.guilds.find((x) => x.id === q.patronGuildId);
  if (g) g.treasury += q.reward / 2;
}

function expire(world: WorldState, q: Quest): void {
  for (const n of everyone(world, q)) n.questId = undefined;
  refund(world, q);
  setStage(world, q, 'expired');
}

function resolve(world: WorldState, q: Quest, rng: Rng): void {
  const party = members(world, q);
  const strength = party.reduce((s, n) => s + 10 + n.level * 4 + (n.blessed ? 10 : 0), 0);
  const target = byId(world, q.targetId);
  const difficulty = target ? 12 + target.level * 6 + (target.guildId !== undefined ? 10 : 0) : q.difficulty;
  const success = party.length > 0 && (q.kind !== 'bounty' || !!target?.alive) && chance(rng, strength / (strength + difficulty));
  if (success) succeed(world, q, party, rng);
  else fail(world, q, party, rng);
  // Survivors walk back into town.
  const dest = destination(world, q);
  for (const n of everyone(world, q)) {
    n.inside = undefined;
    n.questId = undefined;
    if (!onSite(q)) {
      n.x = dest.x;
      n.y = dest.y;
    }
    n.plan = makePlan('return', n.job === 'merchant' ? PLACES.shop : PLACES.guild, 0);
  }
}

function bondParty(world: WorldState, party: Npc[], delta: number): void {
  for (let i = 0; i < party.length; i++) for (let j = i + 1; j < party.length; j++) addTie(world, party[i], party[j], delta);
}

function succeed(world: WorldState, q: Quest, party: Npc[], rng: Rng): void {
  setStage(world, q, 'done');
  const guild = world.guilds.find((g) => g.id === q.guildId);
  const cut = guild ? Math.floor(q.reward * GUILD_CUT) : 0;
  const share = Math.ceil((q.reward - cut) / party.length);
  const renown = (q.rank + 1) * (q.divine ? 2 : 1);
  for (const n of party) {
    n.gold += share;
    n.renown = (n.renown ?? 0) + renown;
    if (chance(rng, 2 / (n.level + 1))) n.level++;
    rankUp(world, n);
  }
  if (guild) {
    guild.treasury += cut;
    guild.renown += renown;
  }
  bondParty(world, party, 12);
  const patron = byId(world, q.patronId);
  if (patron?.alive) for (const n of party) addTie(world, patron, n, 10);
  const c = client(world, q);
  if (c) c.gold += q.reward * 2; // the trip itself paid off
  if (q.dungeonId !== undefined) {
    const d = world.dungeons.find((x) => x.id === q.dungeonId)!;
    d.power = Math.max(10, d.power - (8 + q.rank * 4)); // keeping stampedes at bay
  }
  const leader = party[0];
  const who = guild ? guild.name : `ปาร์ตี้ของ${leader.name}`;
  const target = byId(world, q.targetId);
  if (target && patron) {
    // The thief is caught: the victim gets paid back out of the thief's purse.
    const back = Math.min(target.gold, q.reward);
    target.gold -= back;
    patron.gold += back;
    target.morality = clamp(target.morality + 5, -100, 100);
    for (const n of party) addTie(world, target, n, -30);
    log(world, 'quest', `${who} จับโจร${target.name}ได้ คืนทอง ${back} เหรียญให้${patron.name}`, leader.id);
  } else {
    log(world, 'quest', `${who} ทำเควสแรงก์ ${rankName(q.rank)} สำเร็จ: ${q.title} (+${q.reward} ทอง)`, leader.id);
  }
  if (q.rank >= 3 || q.divine) legend(world, `${who} พิชิตเควสแรงก์ ${rankName(q.rank)}: ${q.title}`, leader.id);
}

function fail(world: WorldState, q: Quest, party: Npc[], rng?: Rng): void {
  setStage(world, q, 'failed');
  if (!party.length || !rng) return refund(world, q);
  const target = byId(world, q.targetId);
  if (target) {
    log(world, 'quest', `โจร${target.name} หลบหนีปาร์ตี้ของ${party[0].name}ไปได้`, target.id);
    for (const n of party) addTie(world, target, n, -15);
    return; // a slippery thief, not a deadly one
  }
  log(world, 'quest', `ปาร์ตี้ของ${party[0].name} ล้มเหลวในเควส: ${q.title}`, party[0].id);
  bondParty(world, party, 6); // surviving a disaster together still counts for something
  const risk = (q.kind === 'pest' ? 0.08 : 0.25) / Math.sqrt(party.length);
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

export function legend(world: WorldState, text: string, npcId?: number): void {
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
  if (q.stage === 'inside' && onSite(q)) return true; // fighting where they stand
  const slot = Math.max(0, q.partyIds.indexOf(npc.id));
  const base = q.stage === 'recruiting' ? PLACES.guild : destination(world, q);
  // Fan the party out so they don't stand on one tile.
  const spot = { x: clamp(base.x - 1 + (slot % 3), 0, world.width - 1), y: clamp(base.y + (slot >= 3 ? 1 : 0), 0, world.height - 1) };
  if (!atSpot(npc, spot)) stepToward(world, npc, spot, rng);
  return true;
}

