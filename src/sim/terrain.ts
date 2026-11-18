// The wild country the town is cut out of: meadows, woods thick and thin, a river, ponds and
// stony outcrops, laid out from the world's seed so every era's town grows somewhere new. Nothing
// here is saved: the same seed always gives the same country, and what the townsfolk have made of
// it (homes, fields, roads) is drawn over it by townLayout() in town.ts.

// The town map's size in tiles. The world map has its own (realms.ts).
export const MAP_W = 96;
export const MAP_H = 64;

// What covers each tile before anyone clears it.
export const MEADOW = 0; // open grass
export const BRUSH = 1; // scrub between the trees: walkable, slow
export const TREE = 2; // a tree: in the way until it is felled
export const WATER = 3;
export const ROCK = 4; // an outcrop nobody builds on
export type Cover = typeof MEADOW | typeof BRUSH | typeof TREE | typeof WATER | typeof ROCK;

export interface Spot {
  x: number;
  y: number;
}

export interface Terrain {
  cover: Uint8Array; // MAP_W * MAP_H, row by row
  wet: Uint8Array; // tiles to the nearest water, capped at 255
  site: Spot; // the heart of the settlement: its square
  entry: Spot; // where the road from the wider world reaches the town
}

const CLEARING = 5; // radius of the glade the pioneers find (or make) around their square
const ENTRY_DIST = 13; // tiles from the square out to where the road comes in

// A fixed pseudo-random number in [0, 1) for a tile.
export function tileHash(seed: number, x: number, y: number, salt = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed ^ salt, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth noise in [0, 1): random values on a lattice `scale` tiles apart, blended between.
function noise(seed: number, x: number, y: number, scale: number, salt: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const sx = gx - x0;
  const sy = gy - y0;
  const fx = sx * sx * (3 - 2 * sx);
  const fy = sy * sy * (3 - 2 * sy);
  const v = (i: number, j: number) => tileHash(seed, x0 + i, y0 + j, salt);
  const top = v(0, 0) + (v(1, 0) - v(0, 0)) * fx;
  const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

const at = (x: number, y: number) => y * MAP_W + x;
const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

let cache: { seed: number; t: Terrain }[] = [];

export function terrainOf(seed: number): Terrain {
  const hit = cache.find((c) => c.seed === seed);
  if (hit) return hit.t;
  const t = makeTerrain(seed);
  cache = [{ seed, t }, ...cache.slice(0, 3)];
  return t;
}

function makeTerrain(seed: number): Terrain {
  const cover = new Uint8Array(MAP_W * MAP_H);
  // Woods: two layers of noise, broad stands and smaller copses, thickening toward the map's edges.
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      const d = 0.62 * noise(seed, x, y, 15, 11) + 0.38 * noise(seed, x, y, 6, 12) + (edge < 8 ? (8 - edge) * 0.02 : 0);
      const r = tileHash(seed, x, y, 13);
      let c: Cover = MEADOW;
      if (d > 0.6) c = r < 0.72 ? TREE : r < 0.9 ? BRUSH : MEADOW;
      else if (d > 0.47) c = r < 0.38 ? TREE : r < 0.58 ? BRUSH : MEADOW;
      else c = r < 0.025 ? TREE : r < 0.06 ? BRUSH : MEADOW;
      if (noise(seed, x, y, 8, 14) > 0.78 && tileHash(seed, x, y, 15) < 0.45) c = ROCK;
      cover[at(x, y)] = c;
    }
  // A river winding across the map, top to bottom or side to side.
  const across = tileHash(seed, 1, 1, 21) < 0.5;
  const len = across ? MAP_W : MAP_H;
  const span = across ? MAP_H : MAP_W;
  let p = Math.floor(span * (0.25 + 0.5 * tileHash(seed, 2, 2, 22)));
  for (let i = 0; i < len; i++) {
    p += Math.round((noise(seed, i, 0, 7, 23) - 0.5) * 2.4);
    p = Math.max(3, Math.min(span - 4, p));
    const wide = noise(seed, i, 5, 9, 24) > 0.55 ? 2 : 1;
    for (let k = 0; k < wide; k++) {
      const [x, y] = across ? [i, p + k] : [p + k, i];
      cover[at(x, y)] = WATER;
    }
  }
  // A few ponds.
  for (let k = 0; k < 3; k++) {
    const cx = 6 + Math.floor(tileHash(seed, k, 3, 25) * (MAP_W - 12));
    const cy = 6 + Math.floor(tileHash(seed, k, 4, 26) * (MAP_H - 12));
    const r = 1 + Math.floor(tileHash(seed, k, 5, 27) * 2);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) if (inMap(x, y) && Math.hypot((x - cx) / 1.4, y - cy) <= r + 0.2) cover[at(x, y)] = WATER;
  }
  const wet = distanceToWater(cover);
  const site = pickSite(seed, cover, wet);
  // The glade around the square: whatever grew there the pioneers clear on their first days.
  for (let y = site.y - CLEARING; y <= site.y + CLEARING; y++)
    for (let x = site.x - CLEARING - 2; x <= site.x + CLEARING + 2; x++)
      if (inMap(x, y) && cover[at(x, y)] !== WATER && Math.hypot((x - site.x) / 1.4, y - site.y) <= CLEARING) cover[at(x, y)] = MEADOW;
  return { cover, wet, site, entry: pickEntry(cover, site) };
}

export function distanceToWater(cover: Uint8Array): Uint8Array {
  const wet = new Uint8Array(cover.length).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < cover.length; i++)
    if (cover[i] === WATER) {
      wet[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % MAP_W;
    for (const j of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W]) {
      if (j < 0 || j >= cover.length || wet[j] <= wet[i] + 1) continue;
      wet[j] = Math.min(255, wet[i] + 1);
      queue.push(j);
    }
  }
  return wet;
}

// Where the pioneers settle: open ground with water a short walk off and woods within reach,
// not too near the edge of the map so the town has room to grow every way.
function pickSite(seed: number, cover: Uint8Array, wet: Uint8Array): Spot {
  let best = { x: MAP_W >> 1, y: MAP_H >> 1 };
  let bestScore = -Infinity;
  for (let y = 16; y < MAP_H - 16; y += 2)
    for (let x = 22; x < MAP_W - 22; x += 2) {
      if (cover[at(x, y)] === WATER) continue;
      let open = 0;
      let woods = 0;
      let rocks = 0;
      for (let dy = -12; dy <= 12; dy += 2)
        for (let dx = -16; dx <= 16; dx += 2) {
          const c = cover[at(x + dx, y + dy)];
          const near = Math.abs(dx) <= 9 && Math.abs(dy) <= 6;
          if (near && c === MEADOW) open++;
          if (near && (c === ROCK || c === WATER)) rocks++;
          if (!near && c === TREE) woods++;
        }
      const w = wet[at(x, y)];
      const score = open * 1.0 - rocks * 1.5 + Math.min(woods, 40) * 0.25 - Math.abs(w - 7) * 0.8 - Math.hypot(x - MAP_W / 2, y - MAP_H / 2) * 0.15 + tileHash(seed, x, y, 31);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  return best;
}

// The road in comes from whichever side of the map is nearest, a fixed walk from the square.
function pickEntry(cover: Uint8Array, site: Spot): Spot {
  const sides = [
    { dx: -1, dy: 0, d: site.x },
    { dx: 1, dy: 0, d: MAP_W - 1 - site.x },
    { dx: 0, dy: -1, d: site.y * 1.5 },
    { dx: 0, dy: 1, d: (MAP_H - 1 - site.y) * 1.5 },
  ].sort((a, b) => a.d - b.d);
  for (const s of sides) {
    const x = site.x + s.dx * ENTRY_DIST;
    const y = site.y + s.dy * Math.round(ENTRY_DIST * 0.7);
    if (inMap(x, y) && cover[at(x, y)] !== WATER) return { x, y };
  }
  return { x: Math.max(0, site.x - ENTRY_DIST), y: site.y };
}

// Which way the road runs on from the entry to the edge of the map (one step at a time).
export function entryOutward(t: Terrain): Spot {
  const { entry, site } = t;
  const dx = entry.x - site.x;
  const dy = entry.y - site.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}
