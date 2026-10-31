// The walled town and its surroundings, shared by the sim (who can walk where)
// and WorldScene (what gets drawn where), so the two can never drift apart.
import { createRng, next } from './rng';

// How many people the town is founded for. The homes it actually has decide how many it can
// hold from then on (see housing.ts).
export const TOWN_SIZE = 120;

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

// The town's own buildings. Homes are not among them: they stand on the house lots below, as
// world.homes says.
export const BUILDINGS: [key: string, tx: number, ty: number][] = [
  // north row, facing the high street (y 6)
  ['castle', 1, 2],
  ['guild', 6, 3],
  ['inn', 10, 3],
  ['church', 14, 2],
  // middle row, facing the main road (y 9)
  ['shop', 2, 7],
  // behind the back lane: trades, the garrison and the gentry
  ['forge', 7, 13],
  ['brothel', 9, 13],
  ['barracks', 14, 13],
  ['manor', 19, 13],
  // out past the south gate, by the pasture
  ['barn', 22, 18],
];

// House lots (2x2 tiles, top-left). The first twenty lie inside the walls along the three streets;
// the rest spread out past the east gate into the forest once the town outgrows its walls.
export interface Lot {
  key: 'house' | 'house-red' | 'house-blue';
  x: number;
  y: number;
  outside?: boolean;
}
export const LOTS: readonly Lot[] = [
  // north row, facing the high street (y 6)
  { key: 'house', x: 17, y: 4 },
  { key: 'house-red', x: 20, y: 4 },
  { key: 'house-blue', x: 23, y: 4 },
  // middle row, facing the main road (y 9)
  { key: 'house-red', x: 5, y: 7 },
  { key: 'house', x: 8, y: 7 },
  { key: 'house-blue', x: 11, y: 7 },
  { key: 'house', x: 14, y: 7 },
  { key: 'house-blue', x: 17, y: 7 },
  { key: 'house-red', x: 20, y: 7 },
  { key: 'house', x: 23, y: 7 },
  // south row, facing the back lane (y 12)
  { key: 'house-blue', x: 2, y: 10 },
  { key: 'house', x: 5, y: 10 },
  { key: 'house-red', x: 8, y: 10 },
  { key: 'house', x: 16, y: 10 },
  { key: 'house-red', x: 19, y: 10 },
  { key: 'house-blue', x: 22, y: 10 },
  // past the east gate: along the road out, a lane north of it, and one south of it
  { key: 'house', x: 28, y: 7, outside: true },
  { key: 'house-red', x: 31, y: 7, outside: true },
  { key: 'house-blue', x: 28, y: 4, outside: true },
  { key: 'house', x: 31, y: 4, outside: true },
  { key: 'house-red', x: 30, y: 10, outside: true },
  { key: 'house-blue', x: 34, y: 7, outside: true },
  { key: 'house', x: 33, y: 10, outside: true },
  { key: 'house-red', x: 34, y: 4, outside: true },
  { key: 'house-blue', x: 37, y: 7, outside: true },
  { key: 'house', x: 36, y: 10, outside: true },
  { key: 'house-red', x: 37, y: 4, outside: true },
];
export const FIRST_LOTS = 16; // the lots built on at the founding

// Where the homeless knock up shacks when there is no room for them: one tile each, along the
// strip between the south wall and the fields, then along the far edge past the fields.
export const SHACK_SPOTS: readonly { x: number; y: number }[] = [
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => ({ x, y: 18 })),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => ({ x, y: 24 })),
];
// Shacks come and go too often to lay the town out again for each, so they are drawn on their own
// (WorldScene) and nobody has to walk round them.
export const SHACK_BASE = 1000; // a home number past this is a shack: SHACK_BASE + its spot

// Where someone stands to use a building: the tile in front of its door.
export const doorOf = (key: string, tx: number, ty: number) => {
  const [w, h] = BUILDING_PX[key];
  return { x: tx + Math.floor(w / 32), y: ty + Math.ceil(h / 16) };
};

// Royal plots outside the walls, kept clear for the crown's new buildings (2x2 tiles each).
export const PLOTS = { granary: { x: 0, y: 18 }, yard: { x: 27, y: 11 }, school: { x: 11, y: 14 }, clocktower: { x: 24, y: 10 }, press: { x: 27, y: 14 }, monument: { x: 17, y: 14 }, factory: { x: 15, y: 18 }, station: { x: 19, y: 18 }, powerplant: { x: 22, y: 13 } } as const;

// The steam age's mill plots on the pasture south of the walls (3x2 tiles each, top-left), taken
// in order as companies and the crown build (see industry.ts). The railway runs along row
// RAIL_Y between the station and the mills.
export const MILL_PLOTS: readonly { x: number; y: number }[] = [
  { x: 14, y: 21 },
  { x: 18, y: 21 },
  { x: 22, y: 21 },
  { x: 14, y: 23 },
  { x: 18, y: 23 },
  { x: 22, y: 23 },
];
export const RAIL_Y = 20;
// The yard gate: the upper row opens onto the railway, the lower row onto the lane beside it.
export const millDoor = (i: number) => {
  const p = MILL_PLOTS[i];
  return p.y === MILL_PLOTS[0].y ? { x: p.x + 1, y: RAIL_Y } : { x: p.x + 3, y: p.y + 1 };
};
// Gas lamps along the main road and the high street once the town knows steam.
export const LAMPS: readonly { x: number; y: number }[] = [...[2, 6, 10, 16, 20, 24].map((x) => ({ x, y: 9 })), ...[4, 12, 18, 22].map((x) => ({ x, y: 6 }))];

export const POND = { x0: 2, y0: 13, x1: 5, y1: 15 };
export const FIELDS = { x0: 2, y0: 19, x1: 12, y1: 23 }; // rice, west of the south road
export const PASTURE = { x0: 14, y0: 20, x1: 24, y1: 23 }; // grazing, east of it (the factory and station plots are at its north edge)
export const FOREST = { x0: 28, y0: 0, x1: 39, y1: 24 }; // hunting grounds past the east gate

// Where an NPC stands to enter a dungeon drawn at (d.x, d.y).
export const dungeonDoor = (d: { x: number; y: number }) => ({ x: d.x + 1, y: d.y + 2 });

const COST: Record<Ground, number> = { road: 1, grass: 2, crops: 3, water: 0 };

// What the layout is drawn from: the dungeons, and the lots with a home on them (finished or
// going up). buildRev counts every change to the homes, so a layout is only laid out again then.
export interface TownView {
  dungeons: readonly { x: number; y: number }[];
  mills?: readonly { plot: number }[]; // the steam age's mills: their plots are built on
  works?: Partial<Record<string, number>>; // the station brings the railway; the boulevard takes the walls down
  techs?: Partial<Record<string, number>>; // steam lights the gas lamps
  homes?: readonly { lot: number; tier?: number }[];
  founded?: Partial<Record<string, number>>; // missing: a town founded whole, walls and all
  buildRev?: number;
}

// The streets that come with what stands along them; the main road and the south road are there
// from the first day.
const HIGH_STREET = new Set(['castle', 'guild', 'inn', 'church']);
const BACK_LANE = new Set(['forge', 'brothel', 'barracks', 'manor']);

let cache: { ref: unknown; rev: number; era: string; key: string; layout: Layout } | null = null;

export function townLayout(view: TownView): Layout {
  const { dungeons } = view;
  const rev = view.buildRev ?? 0;
  // The steam age changes the town without touching its homes: mills, the railway, the lamps, the boulevard.
  const era = `${view.mills?.length ?? 0}|${view.works?.station !== undefined}|${view.techs?.steam !== undefined}|${view.works?.boulevard !== undefined}|${view.works?.powerplant !== undefined}|${view.techs?.electricity !== undefined}`;
  if (cache?.ref === dungeons && cache.rev === rev && cache.era === era) return cache.layout; // hot path: asked many times a tick
  const homes = [...(view.homes ?? [])].sort((a, b) => a.lot - b.lot);
  const lots = homes.map((h) => h.lot);
  const has = (k: string) => !view.founded || view.founded[k] !== undefined;
  const standingKeys = BUILDINGS.map(([k]) => k).filter(has);
  const mills = (view.mills ?? []).map((m) => m.plot);
  const rail = view.works?.station !== undefined;
  const lamps = view.techs?.steam !== undefined;
  const electric = view.works?.powerplant !== undefined && view.techs?.electricity !== undefined;
  const boulevard = view.works?.boulevard !== undefined;
  const key = `${dungeons.map((d) => `${d.x},${d.y}`).join(';')}|${homes.map((h) => `${h.lot}:${h.tier ?? 1}`).join(',')}|${standingKeys.join(',')}|${has('walls')}|${mills.join(',')}|${rail}|${lamps}|${boulevard}|${electric}|${view.techs?.electricity !== undefined}`;
  if (cache?.key === key) {
    cache.ref = dungeons;
    cache.rev = rev;
    cache.era = era;
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
  const inner = lots.filter((i) => !LOTS[i].outside).map((i) => LOTS[i].y);
  if (inner.includes(4) || standingKeys.some((k) => HIGH_STREET.has(k))) {
    hline(WALL.x0 + 1, WALL.x1 - 1, 6, 'road'); // high street
    vline(13, 6, 9, 'road');
  }
  hline(0, WALL.x1, 9, 'road'); // main road, gate to gate
  if (inner.includes(10) || standingKeys.some((k) => BACK_LANE.has(k))) hline(WALL.x0 + 1, WALL.x1 - 1, 12, 'road'); // back lane
  vline(13, 9, MAP_H - 1, 'road'); // north-south, out the south gate
  if (has('church') || has('shop')) for (let y = 10; y <= 11; y++) hline(11, 15, y, 'road'); // the square

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
      if (!has('walls')) break; // a camp or a village has none yet
      const edgeX = x === WALL.x0 || x === WALL.x1;
      const edgeY = y === WALL.y0 || y === WALL.y1;
      if (!edgeX && !edgeY) continue;
      if (boulevard) {
        setGround(x, y, 'road'); // the walls pulled down for a boulevard round the town
        continue;
      }
      if (isGate(x, y)) {
        setGround(x, y, 'road');
        continue;
      }
      block(x, y);
      if (towers.has(`${x},${y}`)) props.push({ key: 'gate-tower', x, y, anchor: 'bottom' });
      else props.push({ key: edgeY ? 'town-wall' : 'wall-top', x, y, anchor: edgeY ? 'bottom' : 'top' });
    }

  for (const [key, tx, ty] of BUILDINGS) {
    // Before the castle the chief keeps a timber hall in its place; other buildings not yet founded leave their plot open.
    if (!has(key) && key !== 'castle') continue;
    const [w, h] = BUILDING_PX[key];
    for (let y = ty; y < ty + Math.ceil(h / 16); y++) for (let x = tx; x < tx + Math.ceil(w / 16); x++) block(x, y);
    props.push({ key: has(key) ? key : 'hall', x: tx, y: ty, anchor: 'top' });
  }
  // Homes on their lots. Out past the east gate a lane is trodden to each one from the road.
  for (const { lot: i, tier = 1 } of homes) {
    const lot = LOTS[i];
    for (let y = lot.y; y < lot.y + 2; y++) for (let x = lot.x; x < lot.x + 2; x++) block(x, y);
    props.push({ key: tier === 0 ? 'hut' : tier === 2 ? lot.key.replace('house', 'townhouse') : lot.key, x: lot.x, y: lot.y, anchor: 'top' });
    if (!lot.outside) continue;
    const door = { x: lot.x + 1, y: lot.y + 2 };
    if (door.y < 9) {
      hline(WALL.x1 + 1, door.x, 6, 'road');
      vline(WALL.x1 + 1, 6, 9, 'road');
    } else if (door.y > 9) {
      hline(WALL.x1 + 3, door.x, 12, 'road');
      vline(WALL.x1 + 3, 9, 12, 'road');
    }
  }

  // The mills stand on their plots; the railway runs from the forest's edge past the station.
  for (const i of mills) {
    const p = MILL_PLOTS[i];
    for (let y = p.y; y <= p.y + 1; y++) for (let x = p.x; x <= p.x + 2; x++) block(x, y);
    const gate = millDoor(i);
    setGround(gate.x, gate.y, 'road'); // a trodden yard at the gate, so no tree grows in the way
  }
  if (rail)
    for (let x = PASTURE.x0; x < MAP_W; x++) {
      if (isBlocked(x, RAIL_Y)) continue;
      setGround(x, RAIL_Y, 'road');
      props.push({ key: 'rail', x, y: RAIL_Y, anchor: 'top' });
    }
  if (lamps) for (const l of LAMPS) if (!isBlocked(l.x, l.y) && ground[l.y * MAP_W + l.x] === 'road') props.push({ key: electric ? 'elamp' : 'lamp', x: l.x, y: l.y, anchor: 'bottom' }); // on the street's edge, nobody's way; electric once the power station runs

  // The royal plots are fenced off whether or not anything stands on them yet.
  // (The power station's plot is only marked out once the town knows electricity: before that it is
  // the manor's orchard.)
  for (const [k, p] of Object.entries(PLOTS)) {
    if (k === 'powerplant' && view.techs?.electricity === undefined) continue;
    for (let y = p.y; y <= p.y + 1; y++) for (let x = p.x; x <= p.x + 1; x++) block(x, y);
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
  // The mills' appetite for timber thins the forest south of the road, more with every mill.
  const felled = Math.max(0.25, 1 - 0.15 * mills.length);
  for (let x = WALL.x1 + 1; x < MAP_W; x++)
    for (let y = 0; y < MAP_H; y++) {
      if (y >= 8 && y <= 10) continue;
      const r = rand();
      if (r < 0.34 * (y > 12 ? felled : 1)) tree(x, y);
      else if (r < 0.42) deco('bush', x, y);
    }
  // Woods along the west and south edges, outside the fields.
  for (let y = WALL.y1 + 1; y < MAP_H; y++) for (const x of [0, 1, 25, 26]) if (rand() < 0.6) tree(x, y);
  for (let x = 0; x < MAP_W; x += 2) if (rand() < 0.5) deco('bush', x, 0);
  // A fence keeps the crows out of the fields and the beasts in the pasture.
  for (let x = FIELDS.x0; x <= PASTURE.x1; x++) if (x !== 13 && !isBlocked(x, FIELDS.y1 + 1)) props.push({ key: 'fence', x, y: FIELDS.y1 + 1, anchor: 'bottom' });
  // Along the pasture's north edge the factory and station plots (fenced off themselves) stand in for the fence.
  const onPlot = (x: number) => [PLOTS.factory, PLOTS.station].some((p) => x >= p.x && x <= p.x + 1);
  for (let x = PASTURE.x0; x < 22; x++) if (!onPlot(x)) props.push({ key: 'fence', x, y: PASTURE.y0 - 1, anchor: 'bottom' });
  if (!mills.length) {
    deco('haystack', 15, 20);
    deco('haystack', 20, 23);
    deco('trough', 18, 21);
  }

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
  cache = { ref: dungeons, rev, era, key, layout };
  return layout;
}
