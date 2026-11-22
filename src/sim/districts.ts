// The town's quarters (ย่าน). The old town round the square spreads to so many homes (CORE_HOMES)
// and then only builds up; once it is full and people are still sleeping rough, the crown lays out a
// new quarter on open ground a fair walk out: a little square with a well, a lane to the streets, and
// room round it for a few homes (QUARTER_HOMES, landplan.ts). A town has one quarter, a city three.
// A quarter beyond the walls is a suburb: its people feel left outside and like the crown less, until
// the crown pays to take the walls round it (the dearer the further the line has to go). Which quarter
// a home is in is worked out from where it stands (landplan.ts quarterOf), not stored on it.
import { log } from './core';
import { ensureMarket, levelOf } from './market';
import { TOWN_RANK, rankOf } from './growth';
import { freeRooms, homeless } from './housing';
import { SHACK_BASE } from './town';
import { CORE_HOMES, QUARTER_HOMES, RING_REF, districtSpot, drawRing, heartOf, outsideWalls, quarterOf, ringFor, ringLength } from './landplan';
import { king, payrollReserve } from './society';
import type { District, Npc, WorldState } from './types';

export { CORE_HOMES, QUARTER_HOMES };
const MAX_QUARTERS = [0, 0, 1, 3]; // by the town's rank: a town lays out one, a city three
const QUARTERS_DAY = 23; // day of the month the crown looks at where the town can grow
const QUARTER_COST = 300; // gold, at the founding's prices: the well, the paving, the lane
const SPARE = 300; // gold the crown keeps back beyond the payroll first
const WALL_COST = 500; // the walls' listed price, for RING_REF tiles of them
const WALL_DAYS = 100;
const WALL_AT = 4; // homes in a suburb before the crown will wall it in
const SUBURB = 0.15; // what living outside the walls costs a suburb's people's loyalty, every ten days

export const quartersOf = (world: WorldState) => world.districts ?? [];
export const maxQuarters = (world: WorldState) => MAX_QUARTERS[rankOf(world)] ?? MAX_QUARTERS[MAX_QUARTERS.length - 1];
export function homesIn(world: WorldState, i: number): number {
  let n = 0;
  for (const h of world.homes ?? []) if (quarterOf(world, h.lot) === i) n++;
  return n;
}
// A quarter outside the town line, with no wall going round it.
export const isSuburb = (world: WorldState, d: District) => !d.walled && outsideWalls(world, heartOf(d).x, heartOf(d).y);

// What living in a suburb does to someone's feeling for the crown (politics.ts drift).
export function suburbFeel(world: WorldState, n: Npc): number {
  if (!world.districts?.length || n.home === undefined || n.home >= SHACK_BASE) return 0;
  const i = quarterOf(world, n.home);
  return i >= 0 && isSuburb(world, world.districts[i]) ? -SUBURB : 0;
}

// People short of a roof, or about to be.
const crowded = (world: WorldState) => homeless(world) + (world.slum ?? 0) > 0 || freeRooms(world) < 4;
// The old town has spread as far as it will, and the quarters laid out so far are about full.
const full = (world: WorldState) => homesIn(world, -1) >= CORE_HOMES - 2 && quartersOf(world).every((_, i) => homesIn(world, i) >= QUARTER_HOMES - 1);

// Monthly: a wall finished round a suburb; a new quarter where the town has run out of room; a wall
// begun round a suburb that has grown.
export function districtsDay(world: WorldState): void {
  if (world.day % 30 !== QUARTERS_DAY) return;
  const ds = quartersOf(world);
  for (const d of ds)
    if (d.walling !== undefined && d.walling <= world.day) {
      delete d.walling;
      d.walled = true;
      drawRing(world);
      log(world, 'world', `กำแพงเมืองขยายไปล้อม${d.name}เสร็จแล้ว ชาวย่านนั้นอุ่นใจขึ้น`);
    }
  if (rankOf(world) < TOWN_RANK || !king(world)) return;
  const spare = world.treasury - payrollReserve(world) - SPARE;
  const m = ensureMarket(world);
  if (ds.length < maxQuarters(world) && crowded(world) && full(world)) {
    const cost = Math.round(QUARTER_COST * levelOf(world));
    const spot = spare >= cost ? districtSpot(world) : undefined;
    if (spot) {
      world.treasury -= cost;
      m.till += cost; // the diggers and the masons are paid
      (world.districts ??= []).push({ x: spot.x, y: spot.y, name: spot.name, since: world.day });
      world.buildRev = (world.buildRev ?? 0) + 1;
      const out = outsideWalls(world, spot.x + 1, spot.y + 1);
      log(world, 'world', `ราชสำนักเปิดย่านใหม่ "${spot.name}"${out ? 'นอกกำแพงเมือง' : ''} ขุดบ่อน้ำ ปูลาน ตัดทางเชื่อมกับลานกลาง ให้ครอบครัวที่ไม่มีที่อยู่ได้สร้างบ้าน`, undefined, 'major');
      return;
    }
  }
  // The walls go round one grown suburb at a time, once the town has stone walls to take round it.
  if (!world.ring || world.works?.boulevard !== undefined || (world.founded && world.founded.walls === undefined) || ds.some((d) => d.walling !== undefined)) return;
  const i = ds.findIndex((d, k) => isSuburb(world, d) && homesIn(world, k) >= WALL_AT);
  if (i < 0) return;
  const d = ds[i];
  d.walled = true; // the line as it would run
  const extra = Math.max(10, ringLength(ringFor(world)) - ringLength(world.ring));
  delete d.walled;
  const cost = Math.round((WALL_COST * levelOf(world) * extra) / RING_REF);
  if (spare < cost) return;
  world.treasury -= cost;
  m.till += cost;
  d.walling = world.day + WALL_DAYS;
  log(world, 'world', `ราชสำนักสั่งขยายกำแพงเมืองไปล้อม${d.name} ใช้เงิน ${cost} ทอง`);
}
