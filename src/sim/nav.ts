// Walking around the town: NPCs route around walls, buildings, trees and water,
// and prefer roads. Each destination gets one distance field, computed on first
// use and reused by everyone heading there.
import { pick, type Rng } from './rng';
import { MAP_H, MAP_W, townLayout } from './town';
import type { WorldState } from './types';
import type { Spot } from './places';
import { trod } from './paths';

const UNREACHED = 0xffff;
const MAX_FIELDS = 400;
const RING = 8; // more than the dearest step (town.ts COST: paved 1 up to crops and scrub 6)
let ring: Int32Array[] | null = null;
const fields = new WeakMap<Uint8Array, Map<number, Uint16Array>>();

const costs = (world: WorldState) => townLayout(world).cost;

export function walkable(world: WorldState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && costs(world)[y * MAP_W + x] > 0;
}

// Inside or on the town walls, once there are any (WorldState.ring).
type Ring = NonNullable<WorldState['ring']> | undefined;
const insideWalls = (r: Ring, x: number, y: number) => !!r && x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
const onWall = (r: Ring, x: number, y: number) => !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && !insideWalls(r, x, y);

// The closest tile someone can actually stand on, searching outwards in rings,
// and never on the far side of the town wall (a spot by the castle stays in town).
export function snap(world: WorldState, s: Spot): Spot {
  const x0 = Math.min(MAP_W - 1, Math.max(0, s.x));
  const y0 = Math.min(MAP_H - 1, Math.max(0, s.y));
  const ring = world.founded && world.founded.walls === undefined && world.founded.palisade === undefined ? undefined : world.ring;
  const inTown = insideWalls(ring, x0, y0) || onWall(ring, x0, y0);
  for (let r = 0; r < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (const dx of r - Math.abs(dy) ? [-(r - Math.abs(dy)), r - Math.abs(dy)] : [0]) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (walkable(world, x, y) && (insideWalls(ring, x, y) === inTown || onWall(ring, x, y))) return { x, y };
      }
  return { x: x0, y: y0 };
}

// Cheapest cost from every tile to `target` (Dial's algorithm: costs are tiny integers).
function fieldTo(cost: Uint8Array, target: number): Uint16Array {
  let byTarget = fields.get(cost);
  if (!byTarget) fields.set(cost, (byTarget = new Map()));
  const hit = byTarget.get(target);
  if (hit) return hit;
  const N = cost.length;
  const dist = new Uint16Array(N).fill(UNREACHED);
  // Every step costs 1 to MAX_STEP, so only the next few buckets are ever open: a ring of them,
  // reused from one field to the next.
  if (!ring || ring[0].length < N * 2) ring = Array.from({ length: RING }, () => new Int32Array(N * 2));
  const rings: Int32Array[] = ring;
  const fill = new Int32Array(RING);
  dist[target] = 0;
  rings[0][fill[0]++] = target;
  let open = 1;
  for (let d = 0; open > 0; d++) {
    const r = d % RING;
    const q = rings[r];
    for (let k = 0; k < fill[r]; k++) {
      const i = q[k];
      open--;
      if (dist[i] !== d) continue;
      const x = i % MAP_W;
      // Moving from a neighbour onto tile i costs what tile i costs.
      const step = d + cost[i];
      const s = step % RING;
      if (x > 0 && cost[i - 1] && step < dist[i - 1]) (dist[i - 1] = step), (rings[s][fill[s]++] = i - 1), open++;
      if (x < MAP_W - 1 && cost[i + 1] && step < dist[i + 1]) (dist[i + 1] = step), (rings[s][fill[s]++] = i + 1), open++;
      if (i >= MAP_W && cost[i - MAP_W] && step < dist[i - MAP_W]) (dist[i - MAP_W] = step), (rings[s][fill[s]++] = i - MAP_W), open++;
      if (i + MAP_W < N && cost[i + MAP_W] && step < dist[i + MAP_W]) (dist[i + MAP_W] = step), (rings[s][fill[s]++] = i + MAP_W), open++;
    }
    fill[r] = 0;
  }
  // A bigger map makes each field bigger: keep the most recent few hundred.
  if (byTarget.size >= MAX_FIELDS) byTarget.delete(byTarget.keys().next().value!);
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
  trod(world, next.x, next.y);
  return true;
}
