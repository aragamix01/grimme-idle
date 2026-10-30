// Homes, and how many the town can hold. Every home stands on one of the house lots (town.ts)
// and has rooms for so many people by its tier. Each household (a couple, their children, or
// someone on their own) is given a home with room for it; those left over are homeless. When
// homes run short, whoever can pay (a well-off townsperson, else the crown) hires the builders
// to raise a new one on a free lot, or to build an old one up a storey once the lots are all
// taken. The town's size follows its homes: newcomers come while there are rooms, and the
// homeless drift away.
import { chance, type Rng } from './rng';
import { log } from './core';
import { isAvatar } from './avatar';
import { ensureMarket, levelOf } from './market';
import { ageOf } from './ages';
import { payrollReserve } from './society';
import { rankOf } from './growth';
import { FIRST_LOTS, LOTS, TOWN_SIZE } from './town';
import { AWAY, type Home, type Npc, type WorldState } from './types';

export const ROOMS = [4, 8, 11] as const; // by tier: a hut, a house, a townhouse a storey up
export const TIER_TH = ['กระท่อม', 'บ้าน', 'บ้านสองชั้น'] as const;
const HOUSE_GOLD = [25, 70, 105] as const; // a home of each tier, at the founding's prices; building one up costs the next tier's
const HOUSE_TIMBER = [3, 8, 10] as const; // from the market's stock
const BUILD_DAYS = 60; // with nobody but the family to build it; builders make it quicker
const MAX_SITES = 1; // homes going up at once
const SPARE_ROOMS = 2; // the town starts building just before it is quite full
const CROWN_SPARE = 300; // gold the crown keeps back beyond the payroll before it builds homes itself
const SETTLE_EVERY = 10; // days between sorting out who lives where
const LEAVE_ODDS = 0.08; // monthly, for each homeless household
const GENTRY = new Set<Npc['job']>(['king', 'noble']); // they live in the castle and the manor

// ---------- lots and homes ----------

export const lotDoor = (i: number) => ({ x: LOTS[i].x + 1, y: LOTS[i].y + 2 });
export const standing = (world: WorldState, h: Home) => (h.until ?? 0) <= world.day && !world.ruins?.some((r) => r.x === LOTS[h.lot].x && r.y === LOTS[h.lot].y);
export const homeAt = (world: WorldState, lot: number) => world.homes?.find((h) => h.lot === lot);
export const sites = (world: WorldState) => (world.homes ?? []).filter((h) => (h.until ?? 0) > world.day);
// The tallest a home may be built: a storey up once the town has the craft for it.
// A camp builds huts; a village and up, proper houses.
export const maxTier = (world: WorldState) => (ageOf(world) >= 2 ? 2 : rankOf(world) >= 1 ? 1 : 0);

// The homes the town is founded with: a town's along its streets, or a camp's few huts.
export function foundHomes(world: WorldState, lots: readonly number[] = [...Array(FIRST_LOTS).keys()], tier: Home['tier'] = 1): void {
  world.homes = [];
  for (const lot of lots) world.homes.push({ lot, tier, built: world.day });
  world.buildRev = (world.buildRev ?? 0) + 1;
}

// Rooms in the homes standing; the gentry are housed apart and not counted against them.
export function capacity(world: WorldState): number {
  let rooms = 0;
  for (const h of world.homes ?? []) if (standing(world, h)) rooms += ROOMS[h.tier];
  return rooms + gentry(world);
}

// Townsfolk living (out at the villages is another count), worked out once a day.
let popCache: { npcs: Npc[]; day: number; len: number; n: number } | null = null;
export function townPop(world: WorldState): number {
  if (popCache?.npcs === world.npcs && popCache.day === world.day && popCache.len === world.npcs.length) return popCache.n;
  let n = 0;
  for (const p of world.npcs) if (p.alive) n++;
  popCache = { npcs: world.npcs, day: world.day, len: world.npcs.length, n };
  return n;
}
const gentry = (world: WorldState) => world.npcs.filter((n) => n.alive && GENTRY.has(n.job)).length;
// What the town is built for: its rooms, or before it has homes at all, what it is founded for.
export const builtFor = (world: WorldState) => (world.homes ? capacity(world) : TOWN_SIZE);
export const freeRooms = (world: WorldState) => capacity(world) - townPop(world);
export const homeless = (world: WorldState) => world.homeless ?? 0;

// A lot nothing stands in the way of: no home yet, no dungeon's mound or trail across it.
function lotFree(world: WorldState, i: number): boolean {
  if (world.homes?.some((h) => h.lot === i)) return false;
  const l = LOTS[i];
  return world.dungeons.every((d) => {
    const clear = d.x + 1 < l.x || d.x > l.x + 1 || d.y + 2 < l.y || d.y > l.y + 2; // the mound and its doorstep
    const trail = d.x + 1 >= l.x && d.x + 1 <= l.x + 1 && l.y + 1 >= Math.min(9, d.y + 2) && l.y <= Math.max(9, d.y + 2); // the path from the road
    return clear && !trail;
  });
}

// ---------- who lives where ----------

// A household: a couple and their children, or someone grown on their own.
function households(world: WorldState): Npc[][] {
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  const groups = new Map<number, Npc[]>();
  const headOf = (n: Npc): number => {
    if (n.age < 16) {
      const p = (n.parentIds ?? []).map((id) => byId.get(id)).find((p) => p?.alive);
      if (p) return headOf(p);
    }
    const s = n.spouseId !== undefined ? byId.get(n.spouseId) : undefined;
    return s?.alive && s.id < n.id ? s.id : n.id;
  };
  for (const n of world.npcs) {
    if (!n.alive) continue;
    const h = headOf(n);
    let g = groups.get(h);
    if (!g) groups.set(h, (g = []));
    g.push(n);
  }
  return [...groups.values()];
}

// Keep each household in its home while it fits; move the rest into rooms that are free.
export function settle(world: WorldState): void {
  const used = new Map<number, number>();
  const rooms = (lot: number) => {
    const h = homeAt(world, lot);
    return h && standing(world, h) ? ROOMS[h.tier] : 0;
  };
  const waiting: Npc[][] = [];
  let out = 0;
  for (const g of households(world)) {
    const head = g.find((n) => n.home !== undefined) ?? g[0];
    if (g.some((n) => GENTRY.has(n.job))) {
      for (const n of g) n.home = undefined; // at the castle or the manor
      continue;
    }
    const lot = head.home;
    if (lot !== undefined && (used.get(lot) ?? 0) + g.length <= rooms(lot)) {
      used.set(lot, (used.get(lot) ?? 0) + g.length);
      for (const n of g) n.home = lot;
    } else waiting.push(g);
  }
  // The biggest families are found room first; whoever is left over sleeps where they can.
  waiting.sort((a, b) => b.length - a.length);
  for (const g of waiting) {
    let best = -1;
    let spare = 0;
    for (const h of world.homes ?? []) {
      const left = rooms(h.lot) - (used.get(h.lot) ?? 0);
      if (left >= g.length && left > spare) {
        best = h.lot;
        spare = left;
      }
    }
    if (best >= 0) used.set(best, (used.get(best) ?? 0) + g.length);
    else out += g.length;
    for (const n of g) n.home = best >= 0 ? best : undefined;
  }
  world.homeless = out;
}

// Where someone goes home to: their home's door; with none, a corner by the inn.
export function homeDoor(n: Npc): { x: number; y: number } | undefined {
  return n.home === undefined ? undefined : lotDoor(n.home);
}

// ---------- building ----------

const homeCost = (world: WorldState, tier: number) => Math.round(HOUSE_GOLD[tier] * levelOf(world));

// Who pays for a new home: the richest townsperson who can spare it, else the crown.
function payer(world: WorldState, cost: number): Npc | 'crown' | undefined {
  let rich: Npc | undefined;
  for (const n of world.npcs) if (n.alive && n.age >= 16 && n.inside !== AWAY && !GENTRY.has(n.job) && n.gold >= cost * 2 && (!rich || n.gold > rich.gold)) rich = n;
  if (rich) return rich;
  return world.treasury >= cost + payrollReserve(world) + CROWN_SPARE ? 'crown' : undefined;
}

// When homes run short and someone can pay, a new one goes up, or an old one a storey higher.
function build(world: WorldState): void {
  const underway = sites(world).length;
  const short = homeless(world) + SPARE_ROOMS - Math.max(0, freeRooms(world));
  if (underway >= MAX_SITES || short <= 0) return;
  const m = ensureMarket(world);
  // A hut is made a proper house first, once the town knows how; then new lots, inside the walls
  // before out; then, with every lot taken, homes go up a storey.
  const raise = (from: number) => (world.homes ?? []).find((h) => standing(world, h) && h.tier === from && h.tier < maxTier(world));
  const inside = LOTS.findIndex((l, i) => !l.outside && lotFree(world, i));
  const hut = raise(0);
  const lot = hut ? -1 : inside >= 0 ? inside : LOTS.findIndex((_, i) => lotFree(world, i));
  const old = hut ?? (lot < 0 ? raise(1) : undefined);
  if (lot < 0 && !old) return; // every lot built up as far as the town knows how
  const tier = old ? old.tier + 1 : maxTier(world) >= 1 ? 1 : 0;
  if (m.stock.timber < HOUSE_TIMBER[tier]) return; // no timber to be had
  const cost = homeCost(world, tier);
  const who = payer(world, cost);
  if (!who) return;
  if (who === 'crown') world.treasury -= cost;
  else who.gold -= cost;
  m.stock.timber -= HOUSE_TIMBER[tier];
  // The money goes to whoever builds: the builders if there are any, else the market's hands.
  const builders = world.npcs.filter((n) => n.alive && n.job === 'builder' && n.age >= 16);
  if (builders.length) for (const b of builders) b.gold += Math.floor(cost / builders.length);
  else m.till += cost;
  const days = Math.max(15, Math.round(BUILD_DAYS / (1 + builders.length * 0.5)));
  const by = who === 'crown' ? 'ทางการ' : who.name;
  if (old) {
    old.tier = (old.tier + 1) as Home['tier'];
    old.until = world.day + days;
    old.ownerId = who === 'crown' ? undefined : who.id;
    log(world, 'world', `${by}จ้างช่างต่อเติมบ้านหลังหนึ่งเป็น${TIER_TH[old.tier]} ใช้เงิน ${cost} ทอง`, who === 'crown' ? undefined : who.id);
  } else {
    (world.homes ??= []).push({ lot, tier: tier as Home['tier'], built: world.day + days, until: world.day + days, ownerId: who === 'crown' ? undefined : who.id });
    if (LOTS[lot].outside) world.game = Math.max(0, (world.game ?? 0) - 1); // the forest pushed back a little
    log(world, 'world', `${by}จ้างช่างสร้างบ้านหลังใหม่${LOTS[lot].outside ? 'นอกประตูเมืองตะวันออก' : 'ในเมือง'} ใช้เงิน ${cost} ทอง`, who === 'crown' ? undefined : who.id);
  }
  world.buildRev = (world.buildRev ?? 0) + 1;
}

// A builder's day on a home going up brings the day it stands a little nearer.
export function workOnHome(world: WorldState, rng: Rng): boolean {
  const site = sites(world)[0];
  if (!site) return false;
  if (site.until! > world.day + 1 && chance(rng, 0.5)) site.until!--;
  return true;
}
export const homeSite = (world: WorldState) => {
  const s = sites(world)[0];
  return s ? lotDoor(s.lot) : undefined;
};

// Households without a roof give up on the town now and then.
function drift(world: WorldState, rng: Rng): void {
  if (!homeless(world)) return;
  const gone: string[] = [];
  for (const g of households(world)) {
    if (g[0].home !== undefined || g.some((n) => GENTRY.has(n.job) || isAvatar(world, n) || n.questId !== undefined || n.inside !== undefined)) continue;
    if (!chance(rng, LEAVE_ODDS)) continue;
    for (const n of g) {
      n.alive = false;
      n.left = true;
      n.plan = undefined;
    }
    gone.push(g.length > 1 ? `ครอบครัวของ${g[0].name} (${g.length} คน)` : g[0].name);
  }
  if (gone.length) log(world, 'world', `ไม่มีบ้านให้อยู่ ${gone.join(', ')} จึงทิ้งเมืองไปหาที่อยู่ใหม่`);
}

// Once a day: homes finish; every few days, who lives where is sorted out and new homes are
// started; once a month, the homeless may leave.
export function housingDay(world: WorldState, rng: Rng): void {
  if (!world.homes) foundHomes(world);
  for (const h of world.homes!)
    if (h.until !== undefined && h.until <= world.day) {
      h.until = undefined;
      world.buildRev = (world.buildRev ?? 0) + 1;
      log(world, 'world', `${TIER_TH[h.tier]}${LOTS[h.lot].outside ? 'นอกกำแพงเมือง' : 'ในเมือง'}สร้างเสร็จ มีห้องให้คนอยู่ได้ ${ROOMS[h.tier]} คน`);
    }
  if (world.day % SETTLE_EVERY !== 4) return;
  settle(world);
  build(world);
  if (world.day % 30 === 4) drift(world, rng);
}
