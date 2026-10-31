// The neighbouring kingdoms on the world map. They are simulated lightly (a ruler with
// traits, gold, an army, people and a feeling toward us) rather than soul by soul, so the
// world can grow without the town slowing down. Each has its own government and its own age
// of learning: a ruler's death can bring a republic, a junta or the merchants to power, and
// a friendly neighbour ahead of us in learning shares what its scholars know.
import { chance, int, pick, type Rng } from './rng';
import { clamp, log } from './core';
import { FIRST_NAMES } from './names';
import { AGES, ageOf } from './ages';
import { RULER_TH } from './lexicon';
import { landsOf } from './lands';
import type { Realm, Regime, Terrain, Trait, WorldState } from './types';

const TRAITS: readonly Trait[] = ['greedy', 'brave', 'coward', 'loyal', 'vengeful', 'kind'];
// Where the realms sit on the 40x25 world map; our town is in the middle.
export const HOME = { x: 20, y: 12 };
const SLOTS = [
  { x: 7, y: 5 },
  { x: 31, y: 7 }, // kept clear of the buttons in the map's top-right corner
  { x: 6, y: 19 },
  { x: 33, y: 19 },
];
const KINDS: { name: string; terrain: Terrain; color: string }[] = [
  { name: 'อาณาจักรกุหลาบหิน', terrain: 'mountain', color: 'r' },
  { name: 'ราชรัฐเกล็ดเงิน', terrain: 'coast', color: 'b' },
  { name: 'จักรวรรดิทรายทอง', terrain: 'desert', color: 'y' },
  { name: 'แคว้นป่าลึก', terrain: 'forest', color: 'g' },
  { name: 'นครรัฐคลื่นคราม', terrain: 'coast', color: 'a' },
  { name: 'อาณาจักรหนามดำ', terrain: 'mountain', color: 'v' },
];
export const TERRAIN_TH: Record<Terrain, string> = { mountain: 'ภูเขา', coast: 'ชายฝั่ง', desert: 'ทะเลทราย', forest: 'ป่าลึก' };

// How a ruler's traits lean them toward or against us.
export const temperOf = (traits: Trait[]) =>
  traits.reduce((s, t) => s + ({ greedy: -12, vengeful: -15, brave: -4, coward: 6, loyal: 6, kind: 15 } as const)[t], 0);

// How a government leans toward us, on top of its ruler's nature.
const REGIME_LEAN: Record<Regime, number> = { monarchy: 0, republic: 8, oligarchy: 4, theocracy: 0, junta: -10, commune: -6 };
export const realmRegime = (r: Realm): Regime => r.regime ?? 'monarchy';
export const realmAge = (r: Realm) => r.age ?? 1;
// What a realm's age is worth: better arms in war, deeper purses in trade (the second age is par).
export const realmArms = (r: Realm) => 1 + 0.15 * (realmAge(r) - 1);
// What a government is like to trade with: merchants pay best, generals worst.
const REGIME_TRADE: Record<Regime, number> = { monarchy: 1, republic: 1.05, oligarchy: 1.15, theocracy: 0.95, junta: 0.85, commune: 0.8 };
export const realmPurse = (r: Realm) => (1 + 0.1 * (realmAge(r) - 1)) * REGIME_TRADE[realmRegime(r)];
const leanOf = (r: Realm) => temperOf(r.ruler.traits) + REGIME_LEAN[realmRegime(r)];
const SHARE = 40; // knowledge a friendly neighbour ahead of us shares in a year
const AGE_UP = 0.035; // yearly chance a realm comes into its next age
const TAUGHT = 0.06; // and more when a friend of ours is ahead of it

export const relationWord = (r: number) => (r >= 50 ? 'พันธมิตร' : r >= 15 ? 'มิตร' : r > -15 ? 'เป็นกลาง' : r > -50 ? 'ไม่ไว้ใจ' : 'ศัตรู');

function newRuler(rng: Rng): Realm['ruler'] {
  const a = pick(rng, TRAITS);
  const b = pick(rng, TRAITS);
  return { name: pick(rng, FIRST_NAMES), age: int(rng, 25, 55), traits: a === b ? [a] : [a, b] };
}

export function createRealms(world: WorldState, rng: Rng): void {
  const kinds = [...KINDS];
  world.realms = SLOTS.map((spot) => {
    const k = kinds.splice(int(rng, 0, kinds.length - 1), 1)[0];
    const ruler = newRuler(rng);
    const regime: Regime = chance(rng, 0.7) ? 'monarchy' : pick(rng, ['theocracy', 'oligarchy', 'junta'] as const);
    return {
      id: world.nextId++,
      name: k.name,
      terrain: k.terrain,
      color: k.color,
      ...spot,
      ruler,
      regime,
      age: int(rng, 0, 1),
      gold: int(rng, 300, 900),
      army: int(rng, 20, 60),
      people: int(rng, 200, 600),
      relation: clamp(temperOf(ruler.traits) + REGIME_LEAN[regime] + int(rng, -15, 15), -100, 100),
    };
  });
}

// Old saves meet their neighbours the first time they load.
export function ensureRealms(world: WorldState, rng: Rng): void {
  if (!world.realms) createRealms(world, rng);
  // Saves from before the move: the north-east keep sat under the map buttons.
  for (const r of world.realms!) if (r.x >= 28 && r.y < 7) Object.assign(r, { x: 31, y: 7 });
  // Saves from before neighbours had governments and ages.
  for (const r of world.realms!) {
    r.regime ??= 'monarchy';
    r.age ??= Math.min(1, ageOf(world));
  }
}

// Monthly: realms grow rich or poor, raise or lose soldiers, and drift in feeling toward
// what their ruler's nature makes of us. Rulers age, die and are succeeded.
export function realmsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== 3) return;
  for (const r of world.realms ?? []) {
    if (r.fallen) continue; // under the demon lord nothing grows
    r.gold = Math.max(0, r.gold + Math.round(r.people * 0.4) - r.army * 4 + int(rng, -40, 40));
    r.army = clamp(r.army + (r.gold > r.army * 15 ? 1 : -1), 5, Math.max(5, Math.round(r.people / 8))); // a realm can only field so many of its people
    const room = 900 + 120 * Math.max(0, landsOf(world, r) - 1);
    r.people = clamp(Math.round(r.people * (1 + 0.015 * (1 - r.people / room))) + int(rng, -5, 5), 50, 2000); // grows toward what its lands can feed
    const lean = leanOf(r);
    r.relation = clamp(Math.round(r.relation + (lean - r.relation) * 0.05 + int(rng, -2, 2)), -100, 100);
    if (world.day % 365 < 30) {
      r.ruler.age++;
      if (r.ruler.age > 55 && chance(rng, (r.ruler.age - 55) * 0.04)) succeed(world, r, rng);
      else if (realmRegime(r) !== 'junta' && r.gold === 0 && r.army >= 15 && chance(rng, 0.15)) coup(world, r, rng);
      learn(world, r, rng);
    }
  }
}

// What follows a ruler's death: most often more of the same, but a lettered realm may turn
// republic, a broke one with a big army falls to its generals, a rich one to its merchants,
// and a junta or a republic may see the old crown restored.
function nextRegime(r: Realm, rng: Rng): Regime {
  const now = realmRegime(r);
  if (realmAge(r) >= 2 && now !== 'republic' && chance(rng, 0.3)) return 'republic';
  if (r.gold < 200 && r.army >= r.people / 10 && chance(rng, 0.4)) return 'junta';
  if (r.gold > 1500 && now !== 'oligarchy' && chance(rng, 0.25)) return 'oligarchy';
  if ((now === 'junta' || now === 'republic') && chance(rng, 0.3)) return 'monarchy';
  if (chance(rng, 0.04)) return 'theocracy';
  return now;
}

function succeed(world: WorldState, r: Realm, rng: Rng): void {
  const old = r.ruler.name;
  const was = realmRegime(r);
  r.ruler = newRuler(rng);
  r.ruler.age = int(rng, 20, 35);
  r.regime = nextRegime(r, rng);
  if (r.regime !== was) log(world, 'politics', `${RULER_TH[was]}${old}แห่ง${r.name}สิ้นชีพ ราษฎรเปลี่ยนการปกครอง ${r.ruler.name}ขึ้นเป็น${RULER_TH[r.regime]}`);
  else if (was === 'monarchy') log(world, 'politics', `${old}แห่ง${r.name}สิ้นพระชนม์ ${r.ruler.name}ขึ้นครองราชย์แทน`);
  else log(world, 'politics', `${RULER_TH[was]}${old}แห่ง${r.name}ถึงแก่กรรม ${r.ruler.name}ขึ้นเป็น${RULER_TH[was]}คนใหม่`);
}

// An unpaid army takes the realm.
function coup(world: WorldState, r: Realm, rng: Rng): void {
  const old = r.ruler.name;
  const was = realmRegime(r);
  r.ruler = newRuler(rng);
  r.regime = 'junta';
  r.relation = clamp(r.relation - 10, -100, 100);
  log(world, 'politics', `กองทัพของ${r.name}ที่ไม่ได้รับเบี้ยหวัดก่อรัฐประหาร โค่น${RULER_TH[was]}${old} ${r.ruler.name}ขึ้นเป็นจอมทัพ`);
}

// Yearly: a realm may come into a new age, faster with a friend ahead of it to learn from; and a
// friendly neighbour ahead of us shares its scholars' work with ours.
function learn(world: WorldState, r: Realm, rng: Rng): void {
  const ours = ageOf(world);
  const friend = r.relation >= 15 && !r.war;
  if (realmAge(r) < AGES.length - 1 && chance(rng, AGE_UP + (friend && ours > realmAge(r) ? TAUGHT : 0) + (r.tutored ? 0.2 : 0) + (r.gold > 800 ? 0.03 : 0))) {
    r.age = realmAge(r) + 1;
    r.tutored = undefined;
    log(world, 'world', `${r.name}ก้าวเข้าสู่${AGES[r.age].name}`);
  }
  if (friend && realmAge(r) > ours) {
    world.knowledge = (world.knowledge ?? 0) + SHARE;
    if (chance(rng, 0.3)) log(world, 'world', `นักปราชญ์จาก${r.name}ซึ่งอยู่ใน${AGES[realmAge(r)].name}มาแบ่งปันความรู้ให้เมืองของเรา`);
  }
}
