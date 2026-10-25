// The neighbouring kingdoms on the world map. They are simulated lightly (a ruler with
// traits, gold, an army, people and a feeling toward us) rather than soul by soul, so the
// world can grow without the town slowing down.
import { chance, int, pick, type Rng } from './rng';
import { clamp, log } from './core';
import { FIRST_NAMES } from './names';
import type { Realm, Terrain, Trait, WorldState } from './types';

const TRAITS: readonly Trait[] = ['greedy', 'brave', 'coward', 'loyal', 'vengeful', 'kind'];
// Where the realms sit on the 40x25 world map; our town is in the middle.
export const HOME = { x: 20, y: 12 };
const SLOTS = [
  { x: 7, y: 5 },
  { x: 32, y: 4 },
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
    return {
      id: world.nextId++,
      name: k.name,
      terrain: k.terrain,
      color: k.color,
      ...spot,
      ruler,
      gold: int(rng, 300, 900),
      army: int(rng, 20, 60),
      people: int(rng, 200, 600),
      relation: clamp(10 + temperOf(ruler.traits) + int(rng, -10, 10), -100, 100),
    };
  });
}

// Old saves meet their neighbours the first time they load.
export function ensureRealms(world: WorldState, rng: Rng): void {
  if (!world.realms) createRealms(world, rng);
}

// Monthly: realms grow rich or poor, raise or lose soldiers, and drift in feeling toward
// what their ruler's nature makes of us. Rulers age, die and are succeeded.
export function realmsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== 3) return;
  for (const r of world.realms ?? []) {
    r.gold = Math.max(0, r.gold + Math.round(r.people * 0.4) - r.army * 4 + int(rng, -40, 40));
    r.army = clamp(r.army + (r.gold > r.army * 15 ? 1 : -1), 5, 200);
    r.people = clamp(r.people + int(rng, -5, 8), 50, 2000);
    const lean = 10 + temperOf(r.ruler.traits);
    r.relation = clamp(Math.round(r.relation + (lean - r.relation) * 0.05 + int(rng, -2, 2)), -100, 100);
    if (world.day % 365 < 30) {
      r.ruler.age++;
      if (r.ruler.age > 55 && chance(rng, (r.ruler.age - 55) * 0.04)) {
        const old = r.ruler.name;
        r.ruler = newRuler(rng);
        r.ruler.age = int(rng, 20, 35);
        log(world, 'politics', `${old}แห่ง${r.name}สิ้นพระชนม์ ${r.ruler.name}ขึ้นครองราชย์แทน`);
      }
    }
  }
}
