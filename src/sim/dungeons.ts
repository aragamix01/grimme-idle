// The eastern forest's dungeons: each has a kind (how hard it is and what pours out of it)
// and a boss that rules it. Adventurers find new ones while delving; the crown pays for boss
// hunts, worn down over several tries. A slain boss leaves a relic and a long calm, then
// something new crawls up to take its place.
import { chance, int, pick, type Rng } from './rng';
import { log } from './core';
import { legend } from './quests';
import { DUNGEON_NAMES } from './names';
import { might } from './market';
import type { Boss, Dungeon, DungeonKind, Npc, WorldState } from './types';

export const DUNGEON_KINDS: Record<DungeonKind, { th: string; tier: number; names: readonly string[]; boss: { name: string; relic: string; hp: number } }> = {
  cave: { th: 'ถ้ำ', tier: 1, names: DUNGEON_NAMES, boss: { name: 'ราชาสไลม์', relic: 'มงกุฎเมือก', hp: 120 } },
  den: { th: 'รังหมาป่า', tier: 1.3, names: ['รังหมาป่าเงาจันทร์', 'ถ้ำหมาป่าหอน', 'โพรงเขี้ยวเหล็ก'], boss: { name: 'หมาป่าจันทร์เลือด', relic: 'เขี้ยวจันทร์เลือด', hp: 160 } },
  fort: { th: 'ป้อมก็อบลิน', tier: 1.7, names: ['ป้อมก็อบลินหินแดง', 'ค่ายก็อบลินหนองน้ำ', 'ป้อมไม้หนามดำ'], boss: { name: 'จอมโจรก็อบลิน', relic: 'ขวานจอมโจร', hp: 220 } },
  crypt: { th: 'สุสาน', tier: 2.2, names: ['สุสานราชาไร้นาม', 'สุสานใต้โบสถ์ร้าง', 'สุสานแห่งเสียงกระซิบ'], boss: { name: 'ลิชผู้หลับใหล', relic: 'คทาแห่งความตาย', hp: 300 } },
};
export const MAX_DUNGEONS = 3;
export const RELIC_POWER = 15;
const CALM_DAYS = 240; // a slain boss's dungeon stays quiet this long
const RETURN_DAYS = 540; // ...and a new boss rises this long after
const FIND_CHANCE = 0.03; // per successful delve, once the town has settled in
const FIND_AFTER = 120;

export const kindOf = (d: Dungeon): DungeonKind => d.kind ?? 'cave';
export const tierOf = (d: Dungeon) => DUNGEON_KINDS[kindOf(d)].tier;
export const calm = (world: WorldState, d: Dungeon) => (d.calmUntil ?? 0) > world.day;
export const bossAlive = (d: Dungeon) => !!d.boss && d.boss.slainDay === undefined;

export function newBoss(kind: DungeonKind, generation = 1): Boss {
  const b = DUNGEON_KINDS[kind].boss;
  return { name: generation > 1 ? `${b.name}รุ่นที่ ${generation}` : b.name, hp: b.hp, maxHp: b.hp, relic: b.relic, generation };
}

// Old saves: the one dungeon is a cave with its slime king.
export function ensureDungeons(world: WorldState): void {
  for (const d of world.dungeons) {
    d.kind ??= 'cave';
    d.boss ??= newBoss(d.kind);
  }
}

// Each day: a slain boss's successor rises once the calm is long over.
export function dungeonsDay(world: WorldState): void {
  for (const d of world.dungeons) {
    const b = d.boss;
    if (!b || b.slainDay === undefined || world.day - b.slainDay < RETURN_DAYS) continue;
    d.boss = newBoss(kindOf(d), (b.generation ?? 1) + 1);
    d.power = Math.max(d.power, 40);
    log(world, 'world', `${d.boss.name}ตื่นขึ้นมาครอบครอง${d.name}แทนที่ตัวเก่า`);
  }
}

// A free spot in the eastern forest at least a few rows from every dungeon and the road.
function freeSpot(world: WorldState, rng: Rng): { x: number; y: number } | undefined {
  const spots: { x: number; y: number }[] = [];
  for (let y = 2; y <= 20; y++)
    for (let x = 29; x <= 37; x++) {
      if (y + 2 >= 7 && y <= 10) continue; // the east road runs along row 9
      if (world.dungeons.every((d) => Math.abs(d.y - y) >= 5 || Math.abs(d.x - x) >= 6)) spots.push({ x, y });
    }
  return spots.length ? pick(rng, spots) : undefined;
}

// An adventurer back from a delve may have stumbled on somewhere new.
export function maybeDiscover(world: WorldState, finder: Npc, rng: Rng, odds = FIND_CHANCE): void {
  if (world.dungeons.length >= MAX_DUNGEONS || world.day < FIND_AFTER || !chance(rng, odds)) return;
  const used = new Set(world.dungeons.map(kindOf));
  const kinds = (Object.keys(DUNGEON_KINDS) as DungeonKind[]).filter((k) => !used.has(k));
  const spot = freeSpot(world, rng);
  if (!kinds.length || !spot) return;
  // Harder kinds turn up later, when the town can take them.
  const kind = kinds.sort((a, b) => DUNGEON_KINDS[a].tier - DUNGEON_KINDS[b].tier)[world.dungeons.length > 1 ? int(rng, 0, kinds.length - 1) : 0];
  const taken = new Set(world.dungeons.map((d) => d.name));
  const name = pick(rng, DUNGEON_KINDS[kind].names.filter((n) => !taken.has(n)));
  const d: Dungeon = { id: world.nextId++, name, ...spot, power: int(rng, 15, 30), kind, boss: newBoss(kind), found: world.day };
  world.dungeons.push(d);
  log(world, 'world', `${finder.name}ค้นพบ${name} (${DUNGEON_KINDS[kind].th}) ในป่าตะวันออก ว่ากันว่า${d.boss!.name}ครองที่นั่น`, finder.id);
  legend(world, `${finder.name} ค้นพบ${name}`, finder.id);
}

// The party brought the boss down: a relic, a legend, and a long calm.
export function slayBoss(world: WorldState, d: Dungeon, party: Npc[]): void {
  const b = d.boss!;
  b.hp = 0;
  b.slainDay = world.day;
  d.calmUntil = world.day + CALM_DAYS;
  d.power = 10;
  // The relic goes to the strongest who carries none yet (or the strongest, if all do).
  const byMight = [...party].sort((a, c) => might(world, c) - might(world, a));
  const strongest = byMight.find((n) => !n.relic) ?? byMight[0];
  if (!strongest.relic) strongest.relic = b.relic;
  log(world, 'battle', `${party.map((n) => n.name).join(', ')} ปราบ${b.name}แห่ง${d.name}ได้! ${strongest.name}ได้รับ${b.relic}`, strongest.id);
  legend(world, `${strongest.name} ปราบ${b.name}แห่ง${d.name}`, strongest.id);
}

// A failed hunt still leaves wounds; the boss heals back only slowly between tries.
export function woundBoss(world: WorldState, d: Dungeon, strength: number): void {
  const b = d.boss!;
  b.hp = Math.max(Math.round(b.maxHp * 0.3), Math.round(b.hp - strength * 0.4));
  log(world, 'battle', `${b.name}บาดเจ็บ เหลือพลังชีวิต ${b.hp}/${b.maxHp}`);
}

export function healBosses(world: WorldState): void {
  if (world.day % 10 !== 0) return;
  for (const d of world.dungeons) if (bossAlive(d)) d.boss!.hp = Math.min(d.boss!.maxHp, d.boss!.hp + 5);
}
