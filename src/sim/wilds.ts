// The wild country as it stands now, not as the seed first laid it out (terrain.ts): woods burnt
// in a summer fire lie as ash for some years and then grow back; the god can raise new woods,
// open a spring, or strike the woods with lightning. Everything that reads the country (the
// layout, who builds where, how good a field's soil is) reads it through wildsOf().
import { chance, int, pick, type Rng } from './rng';
import { kill, log, modOf } from './core';
import { BRUSH, MAP_H, MAP_W, MEADOW, ROCK, TREE, WATER, distanceToWater, terrainOf, type Terrain } from './terrain';
import { lotXY, townLayout } from './town';
import { landFree } from './landplan';
import type { WorldState } from './types';

const N = MAP_W * MAP_H;
export const REGROW_DAYS = 3 * 360; // burnt woods stand again after this long
const WILDFIRE_DAY = 17; // day of the month a fire may start in the woods
const WILDFIRE_ODDS = 0.05; // monthly in summer; more in a drought
const WILDFIRE_MAX = 70; // tiles one fire may burn
const SPREAD = 0.5; // chance the flames take each wooded tile next to a burning one
const GROVE_TILES = 24; // tiles of new woods the god raises
const STRIKE_TILES = 14; // woods lightning burns away

type View = Pick<WorldState, 'seed' | 'wild'>;
let cache: { seed: number; refs: unknown[]; key: string; t: Terrain } | null = null;

const keyOf = (w: NonNullable<WorldState['wild']>) =>
  [(w.burnt ?? []).map((b) => b.i).join(','), (w.planted ?? []).join(','), (w.springs ?? []).join(',')].join('|');

// The country as it stands: the seed's, with the changes since.
export function wildsOf(view: View): Terrain {
  const t = terrainOf(view.seed);
  const w = view.wild;
  if (!w || (!w.burnt?.length && !w.planted?.length && !w.springs?.length)) return t;
  // Hot path: the same lists as last time (every change makes a new list or a longer one).
  const refs = [w.burnt, w.burnt?.length, w.planted, w.planted?.length, w.springs, w.springs?.length];
  if (cache?.seed === view.seed && cache.refs.every((r, k) => r === refs[k])) return cache.t;
  const key = keyOf(w);
  if (cache?.seed === view.seed && cache.key === key) {
    cache.refs = refs;
    return cache.t;
  }
  const cover = t.cover.slice();
  for (const i of w.planted ?? []) if (cover[i] === MEADOW || cover[i] === BRUSH) cover[i] = TREE;
  for (const b of w.burnt ?? []) if (cover[b.i] === TREE || cover[b.i] === BRUSH) cover[b.i] = MEADOW;
  for (const i of w.springs ?? []) cover[i] = WATER;
  const wet = w.springs?.length ? distanceToWater(cover) : t.wet;
  cache = { seed: view.seed, refs, key, t: { ...t, cover, wet } };
  return cache.t;
}

// Tiles lying as ash: burnt, not yet grown back.
export function ashOf(view: View): Set<number> {
  return new Set((view.wild?.burnt ?? []).map((b) => b.i));
}

const bump = (world: WorldState) => (world.buildRev = (world.buildRev ?? 0) + 1);
const near = (i: number) => {
  const x = i % MAP_W;
  return [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W].filter((j) => j >= 0 && j < N);
};
const fromSite = (world: WorldState, i: number) => {
  const s = terrainOf(world.seed).site;
  return Math.hypot((i % MAP_W) - s.x, (Math.floor(i / MAP_W) - s.y) * 1.2);
};

// The trees and scrub standing on the map now (not felled for a field or a road).
const standingOf = new WeakMap<object, Uint8Array>();
function standing(world: WorldState): Uint8Array {
  const lay = townLayout(world);
  let s = standingOf.get(lay);
  if (!s) {
    s = new Uint8Array(N);
    for (const p of lay.props) if (p.key === 'tree' || p.key === 'bush') s[p.y * MAP_W + p.x] = p.key === 'tree' ? 2 : 1;
    standingOf.set(lay, s);
  }
  return s;
}

// (This module sits under the layout and the land plan, so it keeps clear of the rest of the sim:
// the season and the weather are read here directly, and a home the flames reach is set alight by
// the caller, through slums.ts fire.)
const summer = (day: number) => Math.floor((day % 365) / 91.25) === 1; // market.ts seasonOf
const weather = (world: WorldState) => (world.weather && world.weather.until > world.day ? world.weather.kind : undefined);

// Burn the woods outward from `start`; returns the tiles burnt.
export function burn(world: WorldState, rng: Rng, start: number, max = WILDFIRE_MAX, spread = SPREAD): number[] {
  const wood = standing(world);
  const burnt: number[] = [];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length && burnt.length < max) {
    const i = queue.shift()!;
    if (!wood[i]) continue;
    burnt.push(i);
    for (const j of near(i)) if (!seen.has(j) && wood[j] && chance(rng, spread)) (seen.add(j), queue.push(j));
  }
  if (!burnt.length) return burnt;
  const wild = (world.wild ??= {});
  const was = new Set((wild.burnt ?? []).map((b) => b.i));
  wild.burnt = [...(wild.burnt ?? []), ...burnt.filter((i) => !was.has(i)).map((i) => ({ i, day: world.day }))];
  world.game = Math.max(0, (world.game ?? 0) - burnt.length * 0.12);
  bump(world);
  return burnt;
}
// A home within a tile or two of burnt woods: the flames reach it (the caller sets it alight).
export function homeInFlames(world: WorldState, burnt: number[]): { x: number; y: number } | undefined {
  const hit = (world.homes ?? []).find((h) => {
    const { x, y } = lotXY(h.lot);
    return burnt.some((i) => Math.abs((i % MAP_W) - x - 0.5) <= 2.5 && Math.abs(Math.floor(i / MAP_W) - y - 0.5) <= 2.5);
  });
  return hit && lotXY(hit.lot);
}

// Monthly: the ash grows back to woods, and in a dry summer a fire may start out in the woods.
// Returns what it burnt, if anything.
export function woodsDay(world: WorldState, rng: Rng): number[] {
  if (world.day % 30 !== WILDFIRE_DAY) return [];
  const wild = world.wild;
  if (wild?.burnt?.some((b) => world.day - b.day >= REGROW_DAYS)) {
    wild.burnt = wild.burnt.filter((b) => world.day - b.day < REGROW_DAYS);
    bump(world);
  }
  if (!summer(world.day)) return [];
  const dry = weather(world) === 'drought' ? 3 : weather(world) === 'rain' ? 0 : 1;
  if (!chance(rng, WILDFIRE_ODDS * dry * Math.max(0.1, 1 + modOf(world, 'fire')))) return [];
  const wood = standing(world);
  const woods: number[] = [];
  for (let i = 0; i < N; i++) if (wood[i] === 2 && fromSite(world, i) >= 12 && fromSite(world, i) <= 34) woods.push(i);
  if (!woods.length) return [];
  const burnt = burn(world, rng, pick(rng, woods));
  // Anyone out in the woods when it goes up may not get out.
  let dead = 0;
  const lit = new Set(burnt);
  for (const n of world.npcs)
    if (n.alive && n.inside === undefined && lit.has(n.y * MAP_W + n.x) && chance(rng, 0.3)) {
      kill(world, n, 'ติดอยู่ในไฟป่า');
      dead++;
    }
  log(world, 'disaster', `ไฟป่า! หน้าร้อนแล้งจัด ไฟลุกลามกลางป่า ต้นไม้วอดไป ${burnt.length} ต้น สัตว์ป่าหนีตาย${dead ? ` มีผู้เสียชีวิต ${dead} คน` : ''}`);
  return burnt;
}

// ---------- the god's hand on the land (divine.ts) ----------

// Open ground at the edge of the woods, for the god to raise new trees on (ash first).
function groveTiles(world: WorldState): number[] {
  const cover = wildsOf(world).cover;
  const free = landFree(world);
  const ash = (world.wild?.burnt ?? []).map((b) => b.i).filter((i) => free(i));
  const edge: number[] = [];
  for (let i = 0; i < N; i++) {
    if (cover[i] !== MEADOW || !free(i)) continue;
    const d = fromSite(world, i);
    if (d < 10 || d > 30) continue;
    if (near(i).some((j) => cover[j] === TREE)) edge.push(i);
  }
  edge.sort((a, b) => fromSite(world, b) - fromSite(world, a)); // furthest from town first
  return [...ash, ...edge].slice(0, GROVE_TILES);
}
export const canGrove = (world: WorldState) => groveTiles(world).length > 0;
export function raiseGrove(world: WorldState): number {
  const tiles = groveTiles(world);
  if (!tiles.length) return 0;
  const wild = (world.wild ??= {});
  const set = new Set(tiles);
  wild.burnt = (wild.burnt ?? []).filter((b) => !set.has(b.i));
  const cover = terrainOf(world.seed).cover;
  wild.planted = [...(wild.planted ?? []), ...tiles.filter((i) => cover[i] !== TREE)];
  world.game = (world.game ?? 0) + 6;
  bump(world);
  return tiles.length;
}

// The field furthest from water, and a free tile beside it for a spring.
function springTile(world: WorldState): number | undefined {
  const t = wildsOf(world);
  const free = landFree(world);
  const fields = (world.parcels ?? []).filter((p) => p.kind === 'field').sort((a, b) => t.wet[(b.y + 1) * MAP_W + b.x + 2] - t.wet[(a.y + 1) * MAP_W + a.x + 2]);
  for (const f of fields) {
    if (t.wet[(f.y + 1) * MAP_W + f.x + 2] <= 2) return undefined; // every field is by water already
    for (let y = f.y - 1; y <= f.y + f.h; y++)
      for (let x = f.x - 1; x <= f.x + f.w; x++) {
        if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
        const i = y * MAP_W + x;
        if (free(i) && t.cover[i] !== WATER && t.cover[i] !== ROCK) return i;
      }
  }
  return undefined;
}
export const canSpring = (world: WorldState) => springTile(world) !== undefined;
export function openSpring(world: WorldState): boolean {
  const i = springTile(world);
  if (i === undefined) return false;
  ((world.wild ??= {}).springs ??= []).push(i);
  bump(world);
  return true;
}

// Lightning into the woods nearest the town: they burn away, and the timber is the town's; the
// flames may run on.
function strikeTile(world: WorldState): number | undefined {
  const wood = standing(world);
  let best: number | undefined;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    if (wood[i] !== 2) continue;
    const d = fromSite(world, i);
    if (d >= 8 && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
export const canStrike = (world: WorldState) => strikeTile(world) !== undefined;
export function strike(world: WorldState, rng: Rng): { burnt: number[]; spread: boolean } {
  const at = strikeTile(world);
  if (at === undefined) return { burnt: [], spread: false };
  const spread = chance(rng, 0.3);
  const burnt = burn(world, rng, at, spread ? WILDFIRE_MAX : STRIKE_TILES, spread ? SPREAD : 0.9);
  if (world.market) world.market.stock.timber += Math.round(burnt.length * (spread ? 0.3 : 0.8));
  return { burnt, spread };
}

// For tests: start a wildfire now.
export const wildfireAt = (world: WorldState, rng: Rng, start: number) => burn(world, rng, start);
export const randomWoods = (world: WorldState, rng: Rng) => {
  const wood = standing(world);
  for (let k = 0; k < 400; k++) {
    const i = int(rng, 0, N - 1);
    if (wood[i] === 2 && fromSite(world, i) >= 12) return i;
  }
  return undefined;
};

// How much of the woods around the town still stand, against the seed's (1 = untouched): the deer
// the woods can hold goes by it, so every field cleared and every fire leaves fewer.
const HUNT_R = 32;
const seedWoods = new Map<number, number>();
const woodsLeft = new WeakMap<object, number>();
export function woodsShare(world: WorldState): number {
  const lay = townLayout(world);
  const hit = woodsLeft.get(lay);
  if (hit !== undefined) return hit;
  const t = terrainOf(world.seed);
  const inRange = (x: number, y: number) => Math.hypot(x - t.site.x, (y - t.site.y) * 1.2) <= HUNT_R;
  let base = seedWoods.get(world.seed);
  if (base === undefined) {
    base = 0;
    for (let i = 0; i < N; i++) if (t.cover[i] === TREE && inRange(i % MAP_W, Math.floor(i / MAP_W))) base++;
    seedWoods.set(world.seed, base);
  }
  const now = lay.props.filter((p) => p.key === 'tree' && inRange(p.x, p.y)).length;
  const v = base ? Math.min(1.3, now / base) : 1;
  woodsLeft.set(lay, v);
  return v;
}
