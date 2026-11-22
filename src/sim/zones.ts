// The town plan's zones and the lookups on it (the plan itself is drawn in zoning.ts). Kept apart,
// with nothing but the map's size behind it, so landplan.ts and the rest can ask what a tile is zoned
// for without pulling in the politics that draws the plan.
import { MAP_H, MAP_W, type Spot } from './terrain';
import type { WorldState } from './types';

const lotXY = (lot: number) => ({ x: lot % MAP_W, y: Math.floor(lot / MAP_W) });

export type Zone = 'home' | 'trade' | 'works' | 'green' | 'farm';
export const CELL = 4;
export const ZW = MAP_W / CELL;
export const ZH = MAP_H / CELL;
export const CHAR: Record<Zone, string> = { home: 'h', trade: 't', works: 'w', green: 'g', farm: 'f' };
export const OF: Record<string, Zone> = { h: 'home', t: 'trade', w: 'works', g: 'green', f: 'farm' };
export const ZONE_TH: Record<Zone, string> = { home: 'ที่อยู่อาศัย', trade: 'การค้า', works: 'โรงงาน', green: 'พื้นที่สีเขียว', farm: 'เกษตร' };
export const ZONES = Object.keys(CHAR) as Zone[];
// Their colours on the land map and in the plan's legend.
export const ZONE_COLOR: Record<Zone, number> = { home: 0xf5902e, trade: 0xffd23f, works: 0x9a6a52, green: 0x56d832, farm: 0xe8d9a0 };

// The zone a tile is set aside for, if the town has a plan.
export function zoneAt(world: WorldState, x: number, y: number): Zone | undefined {
  const c = world.zoning?.cells;
  if (!c || x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return undefined;
  return OF[c[Math.floor(y / CELL) * ZW + Math.floor(x / CELL)]];
}
// The middle of each block set aside for a zone.
export function zoneCells(world: WorldState, z: Zone): Spot[] {
  const c = world.zoning?.cells ?? '';
  const out: Spot[] = [];
  for (let i = 0; i < c.length; i++) if (c[i] === CHAR[z]) out.push({ x: (i % ZW) * CELL + CELL / 2, y: Math.floor(i / ZW) * CELL + CELL / 2 });
  return out;
}

// The plan amended for something laid out after it was drawn: a park's block becomes green ground, a
// new quarter's blocks (where they were farms or wild) ground for homes.
export function amendPlan(world: WorldState, x: number, y: number, r: number, zone: Zone, over: Zone[] | 'any'): void {
  const z = world.zoning;
  if (!z) return;
  const cells = [...z.cells];
  for (let cy = Math.max(0, Math.floor((y - r) / CELL)); cy <= Math.min(ZH - 1, Math.floor((y + r) / CELL)); cy++)
    for (let cx = Math.max(0, Math.floor((x - r) / CELL)); cx <= Math.min(ZW - 1, Math.floor((x + r) / CELL)); cx++) {
      const i = cy * ZW + cx;
      const now = OF[cells[i]];
      if (Math.hypot(cx * CELL + CELL / 2 - x, cy * CELL + CELL / 2 - y) > r + CELL) continue;
      if (over === 'any' || !now || over.includes(now)) cells[i] = CHAR[zone];
    }
  z.cells = cells.join('');
}

// What stands where the plan says otherwise: homes on ground kept for the works or the parks, and
// shacks squatting on planned ground (homes, trade, green).
export function offPlan(world: WorldState): { homes: number[]; shacks: number[] } {
  if (!world.zoning) return { homes: [], shacks: [] };
  const homes = (world.homes ?? []).filter((h) => {
    const z = zoneAt(world, lotXY(h.lot).x + 1, lotXY(h.lot).y + 1);
    return z === 'works' || z === 'green';
  }).map((h) => h.lot);
  const shacks = (world.shacks ?? []).filter((s) => {
    const z = zoneAt(world, s % MAP_W, Math.floor(s / MAP_W));
    return z === 'home' || z === 'trade' || z === 'green';
  });
  return { homes, shacks };
}

// The share of the working mills that stand in the works zone, away from the homes.
export function millsZoned(world: WorldState): number {
  const ms = world.mills ?? [];
  if (!ms.length || !world.zoning) return 0;
  return ms.filter((m) => zoneAt(world, lotXY(m.plot).x + 1, lotXY(m.plot).y + 1) === 'works').length / ms.length;
}
