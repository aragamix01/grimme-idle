// The walled town and its surroundings, shared by the sim (who can walk where)
// and WorldScene (what gets drawn where), so the two can never drift apart.
import { createRng, next } from './rng';

export const MAP_W = 40;
export const MAP_H = 25;

export type Ground = 'grass' | 'road' | 'water' | 'crops';

// A sprite on the map. Buildings sit by their top-left tile; everything else
// stands on its tile, its art rising above it.
export interface Placed {
  key: string;
  x: number;
  y: number;
  anchor: 'top' | 'bottom';
}

export interface Layout {
  ground: Ground[]; // MAP_W * MAP_H, row by row
  cost: Uint8Array; // walking cost per tile; 0 = blocked
  props: Placed[];
}

// Pixel size of each building's art, so footprints block exactly what is drawn.
const BUILDING_PX: Record<string, [w: number, h: number]> = {
  castle: [64, 56],
  guild: [48, 40],
  inn: [40, 36],
  church: [32, 48],
  shop: [32, 32],
  house: [32, 32],
  'house-red': [32, 32],
  'house-blue': [32, 32],
  forge: [32, 32],
  barracks: [48, 32],
  brothel: [32, 40],
  manor: [48, 40],
  barn: [32, 32],
};

// Ring of stone around the town; gates are gaps in it.
export const WALL = { x0: 0, y0: 1, x1: 26, y1: 17 };
export const GATES = [
  { x: 0, y: 9 }, // west: where newcomers arrive
  { x: 26, y: 9 }, // east: the road into the forest and the dungeons
  { x: 13, y: 17 }, // south: out to the fields
];

export const BUILDINGS: [key: string, tx: number, ty: number][] = [
  // north row, facing the high street (y 6)
  ['castle', 1, 2],
  ['guild', 6, 3],
  ['inn', 10, 3],
  ['church', 14, 2],
  ['house', 17, 4],
  ['house-red', 20, 4],
  ['house-blue', 23, 4],
  // middle row, facing the main road (y 9)
  ['shop', 2, 7],
  ['house-red', 5, 7],
  ['house', 8, 7],
  ['house-blue', 11, 7],
  ['house', 14, 7],
  ['house-blue', 17, 7],
  ['house-red', 20, 7],
  ['house', 23, 7],
  // south row, facing the back lane (y 12)
  ['house-blue', 2, 10],
  ['house', 5, 10],
  ['house-red', 8, 10],
  ['house', 16, 10],
  ['house-red', 19, 10],
  ['house-blue', 22, 10],
  // behind the back lane: trades, the garrison and the gentry
  ['forge', 7, 13],
  ['brothel', 9, 13],
  ['barracks', 14, 13],
  ['manor', 19, 13],
  // out past the south gate, by the pasture
  ['barn', 22, 18],
];

// Where someone stands to use a building: the tile in front of its door.
export const doorOf = (key: string, tx: number, ty: number) => {
  const [w, h] = BUILDING_PX[key];
  return { x: tx + Math.floor(w / 32), y: ty + Math.ceil(h / 16) };
};

export const POND = { x0: 2, y0: 13, x1: 5, y1: 15 };
export const FIELDS = { x0: 2, y0: 19, x1: 12, y1: 23 }; // rice, west of the south road
export const PASTURE = { x0: 14, y0: 19, x1: 24, y1: 23 }; // grazing, east of it
export const FOREST = { x0: 28, y0: 0, x1: 39, y1: 24 }; // hunting grounds past the east gate

// Where an NPC stands to enter a dungeon drawn at (d.x, d.y).
export const dungeonDoor = (d: { x: number; y: number }) => ({ x: d.x + 1, y: d.y + 2 });

const COST: Record<Ground, number> = { road: 1, grass: 2, crops: 3, water: 0 };

let cache: { ref: unknown; key: string; layout: Layout } | null = null;

export function townLayout(dungeons: readonly { x: number; y: number }[]): Layout {
  if (cache?.ref === dungeons) return cache.layout; // hot path: asked many times a tick
  const key = dungeons.map((d) => `${d.x},${d.y}`).join(';');
  if (cache?.key === key) {
    cache.ref = dungeons;
    return cache.layout;
  }

  const ground: Ground[] = new Array(MAP_W * MAP_H).fill('grass');
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const props: Placed[] = [];
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const setGround = (x: number, y: number, g: Ground) => inMap(x, y) && (ground[y * MAP_W + x] = g);
  const block = (x: number, y: number) => inMap(x, y) && (blocked[y * MAP_W + x] = 1);
  const isBlocked = (x: number, y: number) => !inMap(x, y) || blocked[y * MAP_W + x] === 1;
  const hline = (x0: number, x1: number, y: number, g: Ground) => {
    for (let x = x0; x <= x1; x++) setGround(x, y, g);
  };
  const vline = (x: number, y0: number, y1: number, g: Ground) => {
    for (let y = y0; y <= y1; y++) setGround(x, y, g);
  };

  // Fields first so the south road runs over them.
  for (let y = FIELDS.y0; y <= FIELDS.y1; y++) hline(FIELDS.x0, FIELDS.x1, y, 'crops');
  for (let y = POND.y0; y <= POND.y1; y++) hline(POND.x0, POND.x1, y, 'water');
  hline(WALL.x0 + 1, WALL.x1 - 1, 6, 'road'); // high street
  hline(0, WALL.x1, 9, 'road'); // main road, gate to gate
  hline(WALL.x0 + 1, WALL.x1 - 1, 12, 'road'); // back lane
  vline(13, 6, MAP_H - 1, 'road'); // north-south, out the south gate
  for (let y = 10; y <= 11; y++) hline(11, 15, y, 'road'); // the square

  // Walls, with towers on the corners and either side of each gate.
  const isGate = (x: number, y: number) => GATES.some((g) => g.x === x && g.y === y);
  const towers = new Set<string>();
  for (const [x, y] of [[WALL.x0, WALL.y0], [WALL.x1, WALL.y0], [WALL.x0, WALL.y1], [WALL.x1, WALL.y1]]) towers.add(`${x},${y}`);
  for (const g of GATES) {
    const side = g.x === WALL.x0 || g.x === WALL.x1; // gate in a side wall: towers above and below
    towers.add(side ? `${g.x},${g.y - 1}` : `${g.x - 1},${g.y}`);
    towers.add(side ? `${g.x},${g.y + 1}` : `${g.x + 1},${g.y}`);
  }
  for (let y = WALL.y0; y <= WALL.y1; y++)
    for (let x = WALL.x0; x <= WALL.x1; x++) {
      const edgeX = x === WALL.x0 || x === WALL.x1;
      const edgeY = y === WALL.y0 || y === WALL.y1;
      if (!edgeX && !edgeY) continue;
      if (isGate(x, y)) {
        setGround(x, y, 'road');
        continue;
      }
      block(x, y);
      if (towers.has(`${x},${y}`)) props.push({ key: 'gate-tower', x, y, anchor: 'bottom' });
      else props.push({ key: edgeY ? 'town-wall' : 'wall-top', x, y, anchor: edgeY ? 'bottom' : 'top' });
    }

  for (const [key, tx, ty] of BUILDINGS) {
    const [w, h] = BUILDING_PX[key];
    for (let y = ty; y < ty + Math.ceil(h / 16); y++) for (let x = tx; x < tx + Math.ceil(w / 16); x++) block(x, y);
    props.push({ key, x: tx, y: ty, anchor: 'top' });
  }

  // Dungeons: their mound blocks, and a trail leads from the east gate to each door.
  const clearing = new Set<string>();
  for (const d of dungeons) {
    for (let y = d.y; y <= d.y + 1; y++) for (let x = d.x; x <= d.x + 1; x++) block(x, y);
    const door = dungeonDoor(d);
    hline(WALL.x1, door.x, 9, 'road');
    vline(door.x, Math.min(9, door.y), Math.max(9, door.y), 'road');
    for (let y = d.y - 1; y <= door.y + 1; y++) for (let x = d.x - 2; x <= d.x + 3; x++) clearing.add(`${x},${y}`);
  }

  // Scenery. Trees block; bushes and rocks are small enough to step past, except the pond rock.
  const scenery = createRng(1847);
  const rand = () => next(scenery);
  const tree = (x: number, y: number) => {
    if (isBlocked(x, y) || ground[y * MAP_W + x] !== 'grass' || clearing.has(`${x},${y}`)) return;
    block(x, y);
    props.push({ key: 'tree', x, y, anchor: 'bottom' });
  };
  const deco = (key: string, x: number, y: number) => {
    if (!isBlocked(x, y) && ground[y * MAP_W + x] === 'grass' && !clearing.has(`${x},${y}`)) props.push({ key, x, y, anchor: 'bottom' });
  };
  // A few fruit trees left between the manor and the wall.
  for (const [x, y] of [[23, 14], [24, 16], [22, 16], [17, 16]]) tree(x, y);
  deco('bush', 12, 14);
  deco('rock', 6, 16);
  // The eastern forest, thick but never on the road.
  for (let x = WALL.x1 + 1; x < MAP_W; x++)
    for (let y = 0; y < MAP_H; y++) {
      if (y >= 8 && y <= 10) continue;
      const r = rand();
      if (r < 0.34) tree(x, y);
      else if (r < 0.42) deco('bush', x, y);
    }
  // Woods along the west and south edges, outside the fields.
  for (let y = WALL.y1 + 1; y < MAP_H; y++) for (const x of [0, 1, 25, 26]) if (rand() < 0.6) tree(x, y);
  for (let x = 0; x < MAP_W; x += 2) if (rand() < 0.5) deco('bush', x, 0);
  // A fence keeps the crows out of the fields and the beasts in the pasture.
  for (let x = FIELDS.x0; x <= PASTURE.x1; x++) if (x !== 13) props.push({ key: 'fence', x, y: FIELDS.y1 + 1, anchor: 'bottom' });
  for (let x = PASTURE.x0; x < 22; x++) props.push({ key: 'fence', x, y: PASTURE.y0 - 1, anchor: 'bottom' });
  deco('haystack', 15, 20);
  deco('haystack', 20, 23);
  deco('trough', 18, 21);

  const cost = new Uint8Array(MAP_W * MAP_H);
  for (let i = 0; i < cost.length; i++) cost[i] = blocked[i] ? 0 : COST[ground[i]];
  // Glades the trees close off completely count as blocked, so nobody is sent into one.
  const reached = new Uint8Array(cost.length);
  const queue = [GATES[0].y * MAP_W + GATES[0].x];
  reached[queue[0]] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % MAP_W;
    for (const j of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W]) {
      if (j < 0 || j >= cost.length || !cost[j] || reached[j]) continue;
      reached[j] = 1;
      queue.push(j);
    }
  }
  for (let i = 0; i < cost.length; i++) if (!reached[i]) cost[i] = 0;
  const layout = { ground, cost, props };
  cache = { ref: dungeons, key, layout };
  return layout;
}
