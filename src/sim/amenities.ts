// The town's public places and what they do for the people in it. The grand square, its fountain,
// the bathhouse and the theatre are crown's works (works.ts); the parks are laid out here, one for
// every so many people, on ground the crown picks (landplan.ts parkSpot) and nothing may then be
// built on. None of them adds a new measure of happiness: they lift loyalty (politics.ts drift),
// spare the town some of its sickness (worldevents.ts plagueStrike) and give the idle somewhere to
// gather (places.ts hangouts). What a place gives is shared out among the people, so a town that
// grows without building more gets less from each.
import { chance, type Rng } from './rng';
import { amendPlan } from './zones';
import { log } from './core';
import { ensureMarket, levelOf } from './market';
import { TOWN_RANK, rankOf } from './growth';
import { townPop } from './housing';
import { lotXY, MAP_W, SHACK_BASE } from './town';
import { parkSpot } from './landplan';
import { king, payrollReserve } from './society';
import type { Npc, WorldState } from './types';

export const PARK = { w: 3, h: 3 };
const PARK_SERVES = 80; // people one park is enough for
const PARK_COST = 250; // gold, from the treasury
const PARKS_DAY = 16; // day of the month the crown considers a new park
const SPARE = 300; // gold the crown keeps back beyond the soldiers' pay before it lays one out
const NEAR_PARK = 6; // tiles from a park a home counts as beside it
const BATH_TIMBER = 2; // firewood the bathhouse burns a month...
const BATH_COAL = 1; // ...or coal
const HALL_SERVES = 150; // people the bathhouse or the theatre is enough for
const TICKET = 2; // a seat at the theatre, at founding prices
const PLAYGOERS = 0.06; // chance someone with coin to spare goes to the theatre in an evening out

const has = (world: WorldState, k: 'plaza' | 'fountain' | 'bathhouse' | 'theatre') => world.works?.[k] !== undefined;
const share = (serves: number, pop: number) => Math.min(1, serves / Math.max(1, pop));
export const parksOf = (world: WorldState) => world.parks ?? [];
// The middle of a park, by its lot.
export const parkMiddle = (lot: number) => ({ x: lotXY(lot).x + 1, y: lotXY(lot).y + 1 });
// How much of the town the parks are enough for, 0..1.
export const greenery = (world: WorldState) => share(parksOf(world).length * PARK_SERVES, townPop(world));

// Whether someone's home stands beside a park.
export function byPark(world: WorldState, n: Npc): boolean {
  if (n.home === undefined || !parksOf(world).length) return false;
  const h = lotXY(n.home >= SHACK_BASE ? n.home - SHACK_BASE : n.home); // a shack is numbered by its tile
  return parksOf(world).some((p) => {
    const m = parkMiddle(p);
    return Math.abs(m.x - h.x) + Math.abs(m.y - h.y) <= NEAR_PARK;
  });
}

// What the town's public places add to someone's feeling for how things are, every ten days
// (politics.ts drift: a steady 0.1 here holds loyalty about one point higher).
export function amenityJoy(world: WorldState, n: Npc): number {
  const pop = townPop(world);
  let by = 0.4 * greenery(world) + (byPark(world, n) ? 0.2 : 0);
  if (has(world, 'plaza')) by += 0.15;
  if (has(world, 'fountain')) by += 0.1;
  if (has(world, 'theatre')) by += 0.3 * share(HALL_SERVES, pop);
  if (has(world, 'bathhouse') && !world.bathsCold) by += 0.15 * share(HALL_SERVES, pop);
  return by;
}

// How much of a plague's toll the town's cleanliness spares: the bathhouse while it is heated, and
// the parks' open air. 1 = nothing spared.
export function cleaner(world: WorldState): number {
  const baths = has(world, 'bathhouse') && !world.bathsCold ? 1 - 0.3 * share(HALL_SERVES, townPop(world)) : 1;
  return baths * (1 - 0.15 * greenery(world));
}

// An evening out: the theatre takes some of the inn's custom (society.ts leisure).
export const innShare = (world: WorldState) => (has(world, 'theatre') ? 0.8 : 1);
export function playgoer(world: WorldState, n: Npc, rng: Rng): void {
  if (!has(world, 'theatre')) return;
  const p = levelOf(world);
  if (n.gold < 30 * p || !chance(rng, PLAYGOERS)) return;
  const seat = Math.max(1, Math.round(TICKET * p));
  n.gold -= seat;
  ensureMarket(world).till += seat; // the players are paid, and spend it in the town
}

// Monthly: the bathhouse's fires, and a new park where the town has outgrown its green.
export function amenitiesDay(world: WorldState): void {
  if (world.day % 30 !== PARKS_DAY) return;
  if (has(world, 'bathhouse')) heatBaths(world);
  if (rankOf(world) < TOWN_RANK || !king(world)) return;
  const pop = townPop(world);
  if (pop < (parksOf(world).length + 1) * PARK_SERVES * 0.75) return; // enough green for now
  const cost = PARK_COST;
  if (world.treasury - payrollReserve(world) - SPARE < cost) return;
  const lot = parkSpot(world);
  if (lot < 0) return;
  world.treasury -= cost;
  ensureMarket(world).till += cost; // the gardeners and the masons are paid
  (world.parks ??= []).push(lot);
  amendPlan(world, lotXY(lot).x + 1, lotXY(lot).y + 1, 0, 'green', 'any');
  world.buildRev = (world.buildRev ?? 0) + 1;
  const royal = world.parks.length === 1 && world.regime === 'monarchy' ? 'สวนหลวง' : 'สวนสาธารณะ';
  log(world, 'world', `ราชสำนักจัด${royal}แห่งที่ ${world.parks.length} ให้ชาวเมืองได้พักผ่อน`);
}

// The bathhouse burns firewood (or coal) off the market each month, or stands cold.
function heatBaths(world: WorldState): void {
  const m = ensureMarket(world);
  const was = !!world.bathsCold;
  const fuel = m.stock.timber >= BATH_TIMBER ? 'timber' : m.stock.coal >= BATH_COAL ? 'coal' : undefined;
  if (!fuel) {
    world.bathsCold = true;
    if (!was) log(world, 'world', 'โรงอาบน้ำไม่มีฟืนต้มน้ำ ต้องปิดไปจนกว่าจะมีไม้เข้าตลาด');
    return;
  }
  const n = fuel === 'timber' ? BATH_TIMBER : BATH_COAL;
  const price = Math.round(m.price[fuel] * n);
  m.stock[fuel] -= n;
  if (world.treasury >= price) {
    world.treasury -= price;
    m.till += price;
  }
  world.bathsCold = false;
  if (was) log(world, 'world', 'โรงอาบน้ำกลับมาเปิดแล้ว');
}

// Tiles of the parks, for the map.
export function parkTiles(world: WorldState): Map<number, { dx: number; dy: number }> {
  const out = new Map<number, { dx: number; dy: number }>();
  for (const lot of parksOf(world)) {
    const { x, y } = lotXY(lot);
    for (let dy = 0; dy < PARK.h; dy++) for (let dx = 0; dx < PARK.w; dx++) out.set((y + dy) * MAP_W + x + dx, { dx, dy });
  }
  return out;
}
