// What the townsfolk believe, and how it runs through their days. Each soul holds a creed (the
// god the player is, the old spirits of the land and the ancestors, or nothing) and a piety that
// rises with priests, blessings and hard times and falls with letters, machines and curses.
// The god's faith is the prayers of those who believe: no believers, no power.
// Every seventh day is a holy day, when the devout walk to the church and give what they can;
// weddings, namings and funerals pass through the church for those who keep the god's faith.
import { chance, int, type Rng } from './rng';
import { clamp, cursed, log, makePlan, occupied } from './core';
import { industrial } from './ages';
import { literate } from './learning';
import { levelOf } from './market';
import { PLACES } from './places';
import { built } from './works';
import type { Creed, Npc, Plan, Religion, WorldState } from './types';

export const HOLY_EVERY = 7; // days from one holy day to the next
const SET_OUT = 2; // days before the holy day the devout near the church walk over (a day's walk is a tile)
const NEAR = 8; // tiles from the church: close enough to walk over for the holy day
const PRAYER = 0.002; // faith a day for each believer, at full piety
const WORSHIP = 0.005; // faith for each soul who keeps the holy day
const DRIFT_DAY = 3; // day of the month piety settles
const SETTLE = 0.15; // how far piety moves toward where a life pulls it, each month
const LOSE_FAITH = 25; // below this, a believer may stop believing
const WEDDING_FEE = 6; // coins at the founding's prices, to the priest who weds them
const NAMING_FEE = 2;
const FUNERAL_FEE = 4;
const OFFERING = 1; // what the devout give on a holy day, at the founding's prices

export const CREED_TH: Record<Creed, string> = { god: 'นับถือเทพเจ้า', spirits: 'นับถือผีบรรพบุรุษ', none: 'ไม่นับถือสิ่งใด' };

const grown = (n: Npc) => n.alive && n.age >= 16;
const townAdults = (world: WorldState) => world.npcs.filter(grown);
const priestsOf = (world: WorldState) => world.npcs.filter((n) => grown(n) && n.job === 'priest');
export const pietyOf = (n: Npc) => n.piety ?? 50;
// Who prays to the player.
export const believer = (n: Npc) => n.creed === 'god';

export function religionOf(world: WorldState): Religion {
  const year = Math.floor(world.day / 365);
  const r = (world.religion ??= { seen: world.chronicleSeq, year, weddings: 0, funerals: 0, namings: 0, offerings: 0 });
  if (r.year !== year) Object.assign(r, { year, weddings: 0, funerals: 0, namings: 0, offerings: 0 });
  return r;
}

export const isHolyDay = (world: WorldState) => world.day % HOLY_EVERY === 0;
export const daysToHoly = (world: WorldState) => (HOLY_EVERY - (world.day % HOLY_EVERY)) % HOLY_EVERY;

// A soul's first belief: a child takes the more devout parent's; townsfolk mostly keep the god's
// faith, while the villages out on the lands hold to the spirits of their fathers.
export function firstCreed(world: WorldState, n: Npc, rng: Rng): void {
  const parents = [...world.npcs, ...(world.villagers ?? [])].filter((p) => n.parentIds?.includes(p.id) && p.creed);
  if (parents.length) {
    const lead = parents.reduce((a, b) => (pietyOf(b) > pietyOf(a) ? b : a));
    n.creed = lead.creed;
    n.piety = Math.round(clamp(parents.reduce((s, p) => s + pietyOf(p), 0) / parents.length + int(rng, -10, 10), 0, 100));
    return;
  }
  const r = int(rng, 0, 99) / 100;
  if (n.job === 'priest') n.creed = 'god';
  else if (n.regionId !== undefined) n.creed = r < 0.6 ? 'spirits' : r < 0.95 ? 'god' : 'none';
  else n.creed = r < 0.75 ? 'god' : r < 0.9 ? 'spirits' : 'none';
  n.piety = n.job === 'priest' ? int(rng, 75, 95) : clamp(int(rng, 20, 70) + (n.traits.includes('kind') ? 10 : 0), 0, 100);
}

// Where a life pulls a soul's piety: the priests around them, the church they pray in, the god's
// own touch, an empty belly; and away from it, letters, the age of machines, a curse, greed.
export function pietyPull(world: WorldState, n: Npc, priests: number, adults: number): number {
  const village = n.regionId !== undefined;
  const reach = village ? 0.3 : 1; // the town's priests are far from the villages
  let t = 40;
  t += Math.min(1, (priests * 30) / Math.max(1, adults)) * 12 * reach;
  if (!village && built(world, 'cathedral')) t += 6;
  if (village && world.regions?.find((r) => r.id === n.regionId)?.village?.works?.includes('shrine')) t += 8;
  if (world.charter?.stateFaith) t += 8;
  if (world.regime === 'theocracy') t += 6;
  if (n.job === 'priest') t += 35;
  if (n.blessed) t += 20;
  if (n.traits.includes('kind')) t += 6;
  if (n.traits.includes('greedy')) t -= 6;
  if ((n.hunger ?? 0) >= 2) t += 6; // the hungry pray
  if (occupied(world)) t += 8; // and so do the conquered
  if (literate(n)) t -= 8;
  if (industrial(world)) t -= 10;
  if (cursed(world, n)) t -= 25;
  if (n.cultist) t -= 30;
  t += (world.balance ?? 0) / 10;
  return clamp(t, 5, 95);
}

export function religionDay(world: WorldState, rng: Rng): void {
  const rel = religionOf(world);
  for (const n of world.npcs) if (n.alive && n.creed === undefined) firstCreed(world, n, rng);
  for (const n of world.villagers ?? []) if (n.alive && n.creed === undefined) firstCreed(world, n, rng);
  burials(world, rel);
  if (rel.prayer === undefined || world.day % 10 === 0) rel.prayer = prayers(world);
  if (world.day % 30 === DRIFT_DAY) settle(world, rng);
  if (daysToHoly(world) === SET_OUT) gather(world, rng);
  if (isHolyDay(world)) holyDay(world, rel, rng);
  if (daysToHoly(world) === HOLY_EVERY - 1) for (const n of world.npcs) if (n.plan?.kind === 'pray') n.plan = undefined; // the day after: home, or back to work
}

// Once a month each soul's piety settles toward where their life pulls it, and some change creed:
// a believer worn down to nothing stops believing, an unbeliever moved by the priests comes to the
// god, and now and then a villager's family takes up the faith of the town.
function settle(world: WorldState, rng: Rng): void {
  const adults = townAdults(world);
  const priests = priestsOf(world).length;
  const souls = [...adults, ...(world.villagers ?? []).filter(grown)];
  let lost = 0;
  let found = 0;
  for (const n of souls) {
    const pull = pietyPull(world, n, priests, adults.length);
    n.piety = clamp(pietyOf(n) + (pull - pietyOf(n)) * SETTLE + int(rng, -3, 3), 0, 100);
    const reach = n.regionId !== undefined ? 0.3 : 1;
    if (n.creed !== 'none' && n.piety < LOSE_FAITH && n.job !== 'priest' && chance(rng, (LOSE_FAITH - n.piety) / 100)) {
      if (n.creed === 'god') lost++;
      n.creed = 'none';
    } else if (n.creed === 'none' && priests && n.piety > 50 && chance(rng, ((n.piety - 50) / 300) * reach)) {
      n.creed = 'god'; // a seeker the priests reached
      found++;
    } else if (n.creed === 'spirits' && priests && chance(rng, 0.015 * reach * (1 - n.piety / 100))) {
      n.creed = 'god'; // a family loosely held by the old ways takes up the town's faith
      found++;
    } else if (n.creed === 'none' && n.regionId !== undefined && n.piety > 50 && chance(rng, 0.03)) {
      n.creed = 'spirits'; // back to the old ways of the village
    }
    // The devout keep to the good; the faithless drift as they will.
    if (n.creed !== 'none' && n.piety >= 70 && n.morality < 30 && chance(rng, 0.3)) n.morality = clamp(n.morality + 1, -100, 100);
  }
  if (found >= 3) log(world, 'bless', `ชาวเมือง ${found} คนหันมานับถือเทพเจ้าในเดือนนี้`);
  if (lost >= 3) log(world, 'world', `ชาวเมือง ${lost} คนเลิกเชื่อในเทพเจ้า ไม่เข้าโบสถ์อีกต่อไป`);
}

// Faith the god draws each day from the prayers of those who believe in them.
export function prayers(world: WorldState): number {
  let sum = 0;
  for (const n of world.npcs) if (grown(n) && believer(n)) sum += pietyOf(n) / 100;
  for (const n of world.villagers ?? []) if (grown(n) && believer(n)) sum += pietyOf(n) / 100;
  return sum * PRAYER * (world.charter?.stateFaith ? 1.5 : 1);
}

const mayWorship = (world: WorldState, n: Npc) =>
  believer(n) && grown(n) && n.job !== 'priest' && n.job !== 'king' && n.questId === undefined && n.inside === undefined && (n.jailedUntil ?? 0) <= world.day;
const toChurch = (world: WorldState, rng: Rng) =>
  makePlan('pray', { x: clamp(PLACES.church.x + int(rng, -3, 3), 0, world.width - 1), y: clamp(PLACES.church.y + int(rng, 0, 3), 0, world.height - 1) }, SET_OUT + 2);

// Before the holy day, the devout near the church with nothing pressing walk over to it; the rest
// keep the day where they are.
function gather(world: WorldState, rng: Rng): void {
  for (const n of world.npcs) {
    if (!mayWorship(world, n) || (n.plan && n.plan.kind !== 'idle') || Math.abs(n.x - PLACES.church.x) + Math.abs(n.y - PLACES.church.y) > NEAR) continue;
    if (chance(rng, (pietyOf(n) / 100) * 0.8)) n.plan = toChurch(world, rng);
  }
}

// The holy day: each believer keeps it as their devotion moves them, at the church or at their
// work, and the god hears them; the devout give what they can spare for the church's larder.
// (Piety is not raised here: it settles monthly, toward what a whole life pulls it to.)
function holyDay(world: WorldState, rel: Religion, rng: Rng): void {
  const gift = Math.max(1, Math.round(OFFERING * levelOf(world)));
  let kept = 0;
  for (const n of world.npcs) {
    if (!believer(n) || !grown(n) || !chance(rng, n.plan?.kind === 'pray' ? 1 : pietyOf(n) / 100)) continue;
    kept++;
    if (pietyOf(n) >= 40 && n.gold >= gift * 10) {
      n.gold -= gift;
      world.alms = (world.alms ?? 0) + gift;
      rel.offerings += gift;
    }
  }
  world.faith += kept * WORSHIP * (built(world, 'cathedral') ? 1.5 : 1);
  rel.worshippers = kept;
}


// At the church until the holy day is over, among the priests: the soul's piety grows.
export function worship(world: WorldState, n: Npc, p: Plan): void {
  n.piety = clamp(pietyOf(n) + 0.5, 0, 100);
  if (--p.days <= 0 || daysToHoly(world) > SET_OUT) n.plan = undefined;
}

// A fee for the priest who leads a rite, paid by whoever of the family can.
function fee(world: WorldState, payers: Npc[], coins: number): Npc | undefined {
  const priests = priestsOf(world);
  const priest = priests[world.day % Math.max(1, priests.length)]; // they take the rites in turn
  if (!priest) return undefined;
  const due = Math.max(1, Math.round(coins * levelOf(world)));
  let left = due;
  for (const p of payers) {
    const part = Math.min(p.gold, Math.ceil(left / payers.length));
    p.gold -= part;
    priest.gold += part;
    left -= part;
  }
  return priest;
}

// A wedding: at the church before a priest if either keeps the god's faith, else by the old rites.
// The less devout of the two takes up the other's creed. Returns how the chronicle tells it.
export function wedding(world: WorldState, a: Npc, b: Npc): string {
  const [strong, weak] = pietyOf(a) >= pietyOf(b) ? [a, b] : [b, a];
  if (strong.creed && weak.creed !== strong.creed) weak.creed = strong.creed;
  if (!believer(a) && !believer(b)) {
    if (a.creed === 'spirits' || b.creed === 'spirits') return `${a.name} และ${b.name} แต่งงานกันตามประเพณีไหว้ผีบรรพบุรุษ`;
    return `${a.name} และ${b.name} แต่งงานกันโดยไม่ผ่านพิธีทางศาสนา`;
  }
  const priest = fee(world, [a, b], WEDDING_FEE);
  for (const n of [a, b]) n.piety = clamp(pietyOf(n) + 5, 0, 100);
  religionOf(world).weddings++;
  return priest ? `${a.name} และ${b.name} แต่งงานกันที่โบสถ์ โดยมี${priest.name}เป็นผู้ประกอบพิธี` : `${a.name} และ${b.name} แต่งงานกัน`;
}

// A newborn takes the parents' faith; believers bring the child to the church to be named.
export function naming(world: WorldState, child: Npc, a: Npc, b: Npc, rng: Rng): string {
  firstCreed(world, child, rng);
  if (!believer(child)) return '';
  const priest = fee(world, [a, b], NAMING_FEE);
  if (!priest) return '';
  religionOf(world).namings++;
  return ` ${priest.name}ตั้งชื่อให้ที่โบสถ์`;
}

// The dead of the god's faith are buried by a priest, paid by the family, and grief turns the
// family toward the god. A ruler's or a hero's funeral is told in the chronicle.
function burials(world: WorldState, rel: Religion): void {
  const fresh = [];
  for (let i = world.chronicle.length - 1; i >= 0 && world.chronicle[i].seq > rel.seen; i--) if (world.chronicle[i].kind === 'death' && world.chronicle[i].npcId !== undefined) fresh.push(world.chronicle[i]);
  rel.seen = world.chronicleSeq;
  for (const e of fresh) {
    const dead = world.npcs.find((n) => n.id === e.npcId) ?? world.villagers?.find((n) => n.id === e.npcId);
    if (!dead || dead.alive || dead.left || !dead.creed) continue;
    const family = [...world.npcs, ...(world.villagers ?? [])].filter((o) => o.alive && (o.id === dead.spouseId || o.parentIds?.includes(dead.id) || dead.parentIds?.includes(o.id)));
    for (const f of family) f.piety = clamp(pietyOf(f) + (believer(dead) ? 4 : 2), 0, 100);
    if (!believer(dead)) continue;
    const priest = fee(world, family.length ? family : [dead], FUNERAL_FEE);
    if (!priest) continue;
    rel.funerals++;
    if (dead.job === 'king' || dead.hero) log(world, 'world', `ชาวเมืองแห่ศพของ${dead.name}ไปที่โบสถ์ ${priest.name}สวดส่งวิญญาณสู่เทพเจ้า`, dead.id);
  }
}

// The town's beliefs at a glance: how many hold each creed, and how devout the believers are.
export function creedCounts(world: WorldState): { god: number; spirits: number; none: number; piety: number; villages: { god: number; spirits: number; none: number } } {
  const out = { god: 0, spirits: 0, none: 0, piety: 0, villages: { god: 0, spirits: 0, none: 0 } };
  let sum = 0;
  for (const n of world.npcs) {
    if (!grown(n) || !n.creed) continue;
    out[n.creed]++;
    sum += pietyOf(n);
  }
  for (const n of world.villagers ?? []) if (grown(n) && n.creed && world.regions?.find((r) => r.id === n.regionId)?.owner === 'us') out.villages[n.creed]++;
  const counted = out.god + out.spirits + out.none;
  out.piety = counted ? Math.round(sum / counted) : 0;
  return out;
}
