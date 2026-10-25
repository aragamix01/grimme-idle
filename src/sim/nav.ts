// Walking around the town: NPCs route around walls, buildings, trees and water,
// and prefer roads. Each destination gets one distance field, computed on first
// use and reused by everyone heading there.
import { pick, type Rng } from './rng';
import { MAP_H, MAP_W, WALL, townLayout } from './town';
import type { WorldState } from './types';
import type { Spot } from './places';

const UNREACHED = 0xffff;
const fields = new WeakMap<Uint8Array, Map<number, Uint16Array>>();

const costs = (world: WorldState) => townLayout(world.dungeons).cost;

export function walkable(world: WorldState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && costs(world)[y * MAP_W + x] > 0;
}

const insideWalls = (x: number, y: number) => x > WALL.x0 && x < WALL.x1 && y > WALL.y0 && y < WALL.y1;
const onWall = (x: number, y: number) => x >= WALL.x0 && x <= WALL.x1 && y >= WALL.y0 && y <= WALL.y1 && !insideWalls(x, y);

// The closest tile someone can actually stand on, searching outwards in rings,
// and never on the far side of the town wall (a spot by the castle stays in town).
export function snap(world: WorldState, s: Spot): Spot {
  const x0 = Math.min(MAP_W - 1, Math.max(0, s.x));
  const y0 = Math.min(MAP_H - 1, Math.max(0, s.y));
  const inTown = insideWalls(x0, y0) || onWall(x0, y0);
  for (let r = 0; r < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (const dx of r - Math.abs(dy) ? [-(r - Math.abs(dy)), r - Math.abs(dy)] : [0]) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (walkable(world, x, y) && (insideWalls(x, y) === inTown || onWall(x, y))) return { x, y };
      }
  return { x: x0, y: y0 };
}

// Cheapest cost from every tile to `target` (Dial's algorithm: costs are tiny integers).
function fieldTo(cost: Uint8Array, target: number): Uint16Array {
  let byTarget = fields.get(cost);
  if (!byTarget) fields.set(cost, (byTarget = new Map()));
  const hit = byTarget.get(target);
  if (hit) return hit;
  const dist = new Uint16Array(cost.length).fill(UNREACHED);
  const buckets: number[][] = [[target]];
  dist[target] = 0;
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (const i of bucket) {
      if (dist[i] !== d) continue;
      const x = i % MAP_W;
      // Moving from a neighbour onto tile i costs what tile i costs.
      const step = d + cost[i];
      for (const j of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W]) {
        if (j < 0 || j >= cost.length || !cost[j] || step >= dist[j]) continue;
        dist[j] = step;
        (buckets[step] ??= []).push(j);
      }
    }
  }
  byTarget.set(target, dist);
  return dist;
}

// One tile toward `to` along the cheapest route. A blocked destination is moved to
// the nearest open tile (callers pass their plan, so it stays moved). Returns false
// when there is no route at all.
export function walk(world: WorldState, npc: { x: number; y: number }, to: Spot, rng: Rng): boolean {
  if (!walkable(world, to.x, to.y)) Object.assign(to, snap(world, to));
  const cost = costs(world);
  const dist = fieldTo(cost, to.y * MAP_W + to.x);
  let best = UNREACHED;
  let options: Spot[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = npc.x + dx;
    const y = npc.y + dy;
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
    const i = y * MAP_W + x;
    if (!cost[i] || dist[i] === UNREACHED) continue;
    const via = dist[i] + cost[i];
    if (via < best) {
      best = via;
      options = [{ x, y }];
    } else if (via === best) options.push({ x, y });
  }
  if (!options.length) return false;
  // Ties are common on open grass; picking among them keeps walks from looking robotic.
  const next = options.length > 1 ? pick(rng, options) : options[0];
  npc.x = next.x;
  npc.y = next.y;
  return true;
}
