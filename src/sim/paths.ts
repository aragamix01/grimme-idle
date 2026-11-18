// Footpaths nobody laid: every step someone takes wears the ground a little (counted in memory,
// never saved), and once a month the grass that was walked most is trodden bare into a footpath,
// while a path nobody uses any more grows back over. Paths walk a little quicker than grass, and
// the roads, which are trodden from every door (town.ts), follow them where they can.
import { MAP_H, MAP_W, townLayout } from './town';
import type { WorldState } from './types';

const N = MAP_W * MAP_H;
const PATH_DAY = 26; // day of the month the paths are looked at
export const WEAR_PATH = 10; // steps in a month that tread grass into a path
const WEAR_KEEP = 3; // fewer than this and a path grows back
const MAX_PATHS = 700; // tiles of footpath at most, the busiest kept

const wear = new WeakMap<WorldState, Uint16Array>();

// One step onto a tile (nav.ts walk).
export function trod(world: WorldState, x: number, y: number): void {
  let w = wear.get(world);
  if (!w) wear.set(world, (w = new Uint16Array(N)));
  const i = y * MAP_W + x;
  if (w[i] < 0xffff) w[i]++;
}
export const wearAt = (world: WorldState, x: number, y: number) => wear.get(world)?.[y * MAP_W + x] ?? 0;

// Monthly: tread new paths, let the unused ones go.
export function pathsDay(world: WorldState): void {
  if (world.day % 30 !== PATH_DAY) return;
  const w = wear.get(world);
  if (!w) return;
  const lay = townLayout(world);
  const old = new Set(world.trails ?? []);
  const keep: number[] = [];
  for (let i = 0; i < N; i++) {
    const g = lay.ground[i];
    if (g === 'trail' ? w[i] >= WEAR_KEEP : g === 'grass' && lay.cost[i] > 0 && w[i] >= WEAR_PATH) keep.push(i);
  }
  keep.sort((a, b) => w[b] - w[a]);
  const next = keep.slice(0, MAX_PATHS).sort((a, b) => a - b);
  w.fill(0);
  if (next.length === old.size && next.every((i) => old.has(i))) return;
  world.trails = next;
  world.buildRev = (world.buildRev ?? 0) + 1;
}
