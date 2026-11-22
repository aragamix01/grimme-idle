// The town on its patch of wild country, shared by the sim (who can walk where) and WorldScene
// (what gets drawn where), so the two can never drift apart. The country comes from the seed
// (terrain.ts); everything on it is the townsfolk's doing: the square, the buildings where the
// town chose to put them, the homes where families chose to build, the fields and pastures they
// cleared, the walls once there are some, and the roads, trodden from every door to the square.
import { BRUSH, MAP_H, MAP_W, ROCK, TREE, WATER, entryOutward, terrainOf, type Spot } from './terrain';
import { ashOf, wildsOf } from './wilds';
import type { Parcel, WorldState } from './types';

export { MAP_H, MAP_W } from './terrain';
export type { Spot } from './terrain';

// How many people the town is founded for. The homes it actually has decide how many it can
// hold from then on (see housing.ts).
export const TOWN_SIZE = 120;

// trail: a footpath trodden bare (paths.ts); paved: a road the crown has paved (works.ts); ash: woods
// burnt in a fire (wilds.ts), growing back.
export type Ground = 'grass' | 'road' | 'water' | 'crops' | 'trail' | 'paved' | 'ash';

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
  gates: Spot[]; // gaps in the town walls, where the roads run through
}

// Pixel size of each building's art, so footprints block exactly what is drawn. Anything not
// listed (the crown's works, a home) is 32x32.
const BUILDING_PX: Record<string, [w: number, h: number]> = {
  castle: [64, 56],
  guild: [48, 40],
  inn: [40, 36],
  church: [32, 48],
  barracks: [48, 32],
  brothel: [32, 40],
  manor: [48, 40],
};
// The buildings a town founds (growth.ts), drawn from the layout; the crown's works on their
// plots are drawn by WorldScene, which knows how far along each is.
export const CIVIC_ART = new Set(['castle', 'guild', 'inn', 'church', 'shop', 'forge', 'barracks', 'brothel', 'manor', 'barn']);

// Tiles a building's art covers.
export const footprint = (key: string) => {
  const [w, h] = BUILDING_PX[key] ?? [32, 32];
  return { w: Math.ceil(w / 16), h: Math.ceil(h / 16) };
};

// Where someone stands to use a building: the tile in front of its door.
export const doorOf = (key: string, tx: number, ty: number) => {
  const [w] = BUILDING_PX[key] ?? [32, 32];
  return { x: tx + Math.floor(w / 32), y: ty + footprint(key).h };
};

// The square at the heart of the town: open ground kept clear for markets and gatherings.
export const plaza = (site: Spot) => ({ x0: site.x - 2, y0: site.y - 1, x1: site.x + 2, y1: site.y + 1 });

// The steam age's mills stand on 3x2 plots a company or the crown picked (landplan.ts millSite),
// numbered by their top-left tile like homes; the yard gate is in the middle of the near side.
export const MILL = { w: 3, h: 2 };
export const millDoor = (plot: number) => ({ x: (plot % MAP_W) + 1, y: Math.floor(plot / MAP_W) + MILL.h });

// The railway: from the station's door straight out to the edge of the map, on the far side
// from the square. undefined until there is a station.
export function railway(view: Pick<WorldState, 'seed' | 'plots' | 'works'>): { y: number; from: number; to: number } | undefined {
  const st = view.works?.station !== undefined ? view.plots?.station : undefined;
  if (!st) return undefined;
  const door = doorOf('station', st.x, st.y);
  const east = st.x >= terrainOf(view.seed).site.x;
  return { y: door.y, from: door.x, to: east ? MAP_W - 1 : 0 };
}

// Homes stand on 2x2 patches, numbered by their top-left tile.
export const tileOf = (x: number, y: number) => y * MAP_W + x;
export const lotXY = (lot: number) => ({ x: lot % MAP_W, y: Math.floor(lot / MAP_W) });

// A home number past this is a shack: SHACK_BASE + its tile.
export const SHACK_BASE = 100_000;

// Where an NPC stands to enter a dungeon drawn at (d.x, d.y).
export const dungeonDoor = (d: { x: number; y: number }) => ({ x: d.x + 1, y: d.y + 2 });

const COST: Record<Ground, number> = { paved: 1, road: 2, trail: 3, grass: 4, ash: 4, crops: 6, water: 0 };
const BRUSH_COST = 6;

// What the layout is drawn from. buildRev counts every change to it, so a layout is only laid out
// again then.
export type TownView = Pick<WorldState, 'seed' | 'dungeons' | 'homes' | 'founded' | 'buildRev' | 'plots' | 'parcels' | 'ring' | 'trails' | 'wild' | 'works' | 'mills' | 'techs'>;

let cache: { ref: unknown; n: number; rev: number; seed: number; era: string; key: string; layout: Layout } | null = null;

export function townLayout(view: TownView): Layout {
  const { dungeons } = view;
  const rev = view.buildRev ?? 0;
  // The steam age changes the town without always touching buildRev: mills, the railway, the lamps, the boulevard.
  const era = `${view.mills?.length ?? 0}|${view.works?.station}|${view.works?.boulevard}|${view.works?.powerplant}|${view.techs?.steam}|${view.techs?.electricity}`;
  if (cache?.ref === dungeons && cache.n === dungeons.length && cache.rev === rev && cache.seed === view.seed && cache.era === era) return cache.layout; // hot path: asked many times a tick
  const homes = [...(view.homes ?? [])].sort((a, b) => a.lot - b.lot);
  const has = (k: string) => !view.founded || view.founded[k as keyof typeof view.founded] !== undefined;
  const plots = Object.entries(view.plots ?? {}).filter((e): e is [string, Spot] => !!e[1]);
  const key = [
    view.seed,
    dungeons.map((d) => `${d.x},${d.y}`).join(';'),
    homes.map((h) => `${h.lot}:${h.tier ?? 1}`).join(','),
    plots.map(([k, p]) => `${k}${has(k) ? '+' : ''}@${p.x},${p.y}`).join(','),
    (view.parcels ?? []).map((p) => `${p.kind[0]}${p.x},${p.y},${p.w},${p.h}${p.ready}${p.fenced ? 'f' : ''}`).join(','),
    view.ring && (has('walls') || has('palisade')) ? `${has('walls') ? 'w' : 'p'}${view.ring.x0},${view.ring.y0},${view.ring.x1},${view.ring.y1}` : '',
    (view.trails ?? []).join(','),
    view.wild ? JSON.stringify(view.wild) : '',
    view.works?.paving !== undefined ? 'paved' : '',
    (view.mills ?? []).map((m) => m.plot).join(','),
    ['station', 'boulevard', 'powerplant'].map((k) => (view.works?.[k as keyof typeof view.works] !== undefined ? k[0] : '')).join(''),
    ['steam', 'electricity'].map((k) => (view.techs?.[k as keyof typeof view.techs] !== undefined ? k[0] : '')).join(''),
  ].join('|');
  if (cache?.key === key) {
    Object.assign(cache, { ref: dungeons, n: dungeons.length, rev, seed: view.seed, era });
    return cache.layout;
  }
  const layout = layOut(view, homes, plots, has);
  cache = { ref: dungeons, n: dungeons.length, rev, seed: view.seed, era, key, layout };
  return layout;
}

function layOut(view: TownView, homes: NonNullable<TownView['homes']>, plots: [string, Spot][], has: (k: string) => boolean): Layout {
  const t = wildsOf(view);
  const ash = ashOf(view);
  const N = MAP_W * MAP_H;
  const ground: Ground[] = new Array(N).fill('grass');
  const blocked = new Uint8Array(N);
  const cleared = new Uint8Array(N); // the wild cover is gone: built on, worked or trodden
  const props: Placed[] = [];
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const rect = (x0: number, y0: number, w: number, h: number, f: (i: number, x: number, y: number) => void) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inMap(x, y)) f(y * MAP_W + x, x, y);
  };
  const build = (x0: number, y0: number, w: number, h: number) =>
    rect(x0, y0, w, h, (i) => {
      blocked[i] = 1;
      cleared[i] = 1;
    });
  for (let i = 0; i < N; i++) if (t.cover[i] === WATER) ground[i] = 'water';

  // The square, then what stands around it.
  const sq = plaza(t.site);
  rect(sq.x0, sq.y0, sq.x1 - sq.x0 + 1, sq.y1 - sq.y0 + 1, (i) => {
    ground[i] = 'road';
    cleared[i] = 1;
  });
  const doors: Spot[] = [];
  for (const [k, p] of plots) {
    const art = k === 'castle' && !has(k) ? 'hall' : k;
    const fp = footprint(k);
    build(p.x, p.y, fp.w, fp.h);
    doors.push(doorOf(k, p.x, p.y));
    // Before the castle the chief keeps a timber hall in its place; a building still going up is
    // scaffolding, drawn by WorldScene, as are the crown's works.
    if (CIVIC_ART.has(k) && (has(k) || k === 'castle')) props.push({ key: art, x: p.x, y: p.y, anchor: 'top' });
  }
  for (const { lot, tier = 1 } of homes) {
    const { x, y } = lotXY(lot);
    build(x, y, 2, 2);
    doors.push({ x: x + 1, y: y + 2 });
    props.push({ key: tier === 0 ? 'hut' : tier === 2 ? homeArt(lot).replace('house', 'townhouse') : homeArt(lot), x, y, anchor: 'top' });
  }
  // Fields and pastures: crops once the ground is cleared and sown, a fence round the flocks.
  const railed: Parcel[] = [];
  for (const p of view.parcels ?? []) {
    rect(p.x, p.y, p.w, p.h, (i) => {
      cleared[i] = 1;
      if (p.kind === 'field' && ground[i] !== 'water') ground[i] = 'crops';
    });
    if (p.kind === 'pasture' || p.fenced) railed.push(p); // fenced once the roads are down, so no rail lies across one
    doors.push({ x: p.x + (p.w >> 1), y: p.y + p.h }); // a lane out to it
  }
  // The mills: their sheds block, and a lane runs to each yard gate.
  for (const m of view.mills ?? []) {
    const { x, y } = lotXY(m.plot);
    build(x, y, MILL.w, MILL.h);
    doors.push(millDoor(m.plot));
  }
  // Dungeons: their mound blocks, and the ground about them is trampled bare.
  for (const d of view.dungeons) {
    build(d.x, d.y, 2, 2);
    const door = dungeonDoor(d);
    rect(d.x - 2, d.y - 1, 6, door.y - d.y + 3, (i) => (cleared[i] = 1));
    doors.push(door);
  }

  // Roads: first the road in from the wider world to the square, the town's main street; then from
  // every door the cheapest way to the nearest road, nearest doors first, so the lanes join into
  // streets; then on from the road in to the edge of the map.
  // Footpaths people have trodden (paths.ts): the roads take to them where they can.
  for (const i of view.trails ?? []) {
    if (blocked[i] || ground[i] !== 'grass' || t.cover[i] === ROCK) continue;
    ground[i] = 'trail';
    cleared[i] = 1;
  }
  tread(t.entry, ground, blocked, cleared, t.cover);
  const order = doors.sort((a, b) => Math.hypot(a.x - t.site.x, a.y - t.site.y) - Math.hypot(b.x - t.site.x, b.y - t.site.y));
  for (const d of order) tread(d, ground, blocked, cleared, t.cover);
  const out = entryOutward(t);
  for (let x = t.entry.x, y = t.entry.y; inMap(x, y); x += out.x, y += out.y) {
    const i = y * MAP_W + x;
    if (blocked[i]) break;
    ground[i] = 'road';
    cleared[i] = 1;
  }

  // The railway, laid from the station out to the edge of the map: a road beside the rails.
  const rail = railway(view);
  if (rail)
    for (let x = rail.from, step = Math.sign(rail.to - rail.from) || 1; x !== rail.to + step; x += step) {
      const i = rail.y * MAP_W + x;
      if (blocked[i] || ground[i] === 'water') continue;
      ground[i] = 'road';
      cleared[i] = 1;
      props.push({ key: 'rail', x, y: rail.y, anchor: 'top' });
    }

  // The walls, with towers on the corners and either side of each gate; a gate wherever a road
  // crosses the line. Once the crown has the boulevard built, the line is a ring road instead.
  const gates: Spot[] = [];
  // A palisade of logs first; stone walls with towers once the town has built them.
  const stone = has('walls');
  const boulevard = view.works?.boulevard !== undefined;
  const ring = !boulevard && (stone || has('palisade')) ? view.ring : undefined;
  if (boulevard && view.ring) {
    const r = view.ring;
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) {
        if (x !== r.x0 && x !== r.x1 && y !== r.y0 && y !== r.y1) continue;
        const i = y * MAP_W + x;
        if (!inMap(x, y) || blocked[i] || ground[i] === 'water') continue;
        ground[i] = 'road';
        cleared[i] = 1;
      }
  }
  if (ring) {
    const onRing = (x: number, y: number) => (x === ring.x0 || x === ring.x1) && y >= ring.y0 && y <= ring.y1 || (y === ring.y0 || y === ring.y1) && x >= ring.x0 && x <= ring.x1;
    const isGate = (x: number, y: number) => inMap(x, y) && onRing(x, y) && ground[y * MAP_W + x] === 'road';
    const towers = new Set<string>([`${ring.x0},${ring.y0}`, `${ring.x1},${ring.y0}`, `${ring.x0},${ring.y1}`, `${ring.x1},${ring.y1}`]);
    for (let y = ring.y0; y <= ring.y1; y++)
      for (let x = ring.x0; x <= ring.x1; x++) {
        if (!onRing(x, y) || !inMap(x, y)) continue;
        if (isGate(x, y)) {
          gates.push({ x, y });
          if (!stone) continue;
          // A tower either side of the gate, unless one already stands within two tiles along the
          // wall: gates close together share their towers rather than lining the wall with them.
          const side = x === ring.x0 || x === ring.x1;
          const along = (k: number) => (side ? `${x},${y + k}` : `${x + k},${y}`);
          for (const dir of [-1, 1]) if (![1, 2, 3].some((k) => towers.has(along(dir * k)) || (k > 1 && towers.has(along(-dir * k))))) towers.add(along(dir));
        }
      }
    for (let y = ring.y0; y <= ring.y1; y++)
      for (let x: number = ring.x0; x <= ring.x1; x++) {
        if (!onRing(x, y) || !inMap(x, y) || isGate(x, y)) continue;
        const i = y * MAP_W + x;
        if (ground[i] === 'water' || blocked[i]) continue; // the river is its own moat; a house in the line is part of it
        blocked[i] = 1;
        cleared[i] = 1;
        const edgeY = y === ring.y0 || y === ring.y1;
        if (!stone) props.push({ key: 'palisade', x, y, anchor: 'bottom' });
        else if (towers.has(`${x},${y}`)) props.push({ key: 'gate-tower', x, y, anchor: 'bottom' });
        else props.push({ key: edgeY ? 'town-wall' : 'wall-top', x, y, anchor: edgeY ? 'bottom' : 'top' });
      }
  }

  // The crown's paving: every road inside the walls (or near the square, with none) laid in stone.
  if (view.works?.paving !== undefined) {
    const inside = (x: number, y: number) => (ring ? x > ring.x0 && x < ring.x1 && y > ring.y0 && y < ring.y1 : Math.hypot(x - t.site.x, (y - t.site.y) * 1.2) <= 14);
    for (let i = 0; i < N; i++) if (ground[i] === 'road' && inside(i % MAP_W, Math.floor(i / MAP_W))) ground[i] = 'paved';
  }

  // Gas lamps (electric once the power station runs) along the streets near the square, once the town knows steam.
  if (view.techs?.steam !== undefined) {
    const electric = view.techs?.electricity !== undefined && view.works?.powerplant !== undefined;
    for (let i = 0; i < N; i++) {
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      if ((ground[i] === 'road' || ground[i] === 'paved') && (x * 3 + y * 5) % 7 === 0 && Math.hypot(x - t.site.x, (y - t.site.y) * 1.2) <= 16) props.push({ key: electric ? 'elamp' : 'lamp', x, y, anchor: 'bottom' });
    }
  }

  // Fences: along the top and bottom of each pasture and fenced field, but never across a road, and
  // not between two plots of the same kind (two fields side by side share one hedge, not two fences).
  const sameKind = (x: number, y: number, p: Parcel) => (view.parcels ?? []).some((q) => q !== p && q.kind === p.kind && x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
  const railAt = new Set<number>();
  const fenceAt = (x: number, y: number, beyond: number, p: Parcel) => {
    const i = y * MAP_W + x;
    if (!inMap(x, y) || railAt.has(i) || blocked[i] || ground[i] !== 'grass' && ground[i] !== 'crops') return;
    if (sameKind(x, beyond, p)) return;
    railAt.add(i);
    props.push({ key: 'fence', x, y, anchor: 'bottom' });
  };
  for (const p of railed) {
    const gap = p.x + (p.w >> 1);
    for (let x = p.x; x < p.x + p.w; x++) {
      fenceAt(x, p.y, p.y - 1, p);
      if (x !== gap) fenceAt(x, p.y + p.h - 1, p.y + p.h, p);
    }
    if (p.kind !== 'pasture') continue;
    const free = (x: number, y: number) => ground[y * MAP_W + x] === 'grass' && !blocked[y * MAP_W + x] && !railAt.has(y * MAP_W + x);
    if (free(p.x + 1, p.y + (p.h >> 1))) props.push({ key: 'trough', x: p.x + 1, y: p.y + (p.h >> 1), anchor: 'bottom' });
    if (free(p.x + p.w - 2, p.y + 1)) props.push({ key: 'haystack', x: p.x + p.w - 2, y: p.y + 1, anchor: 'bottom' });
  }

  // The wild country wherever nobody has cleared it: trees block, scrub slows, rocks stand; where
  // the woods burnt, ash.
  const brush = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (cleared[i] || blocked[i] || ground[i] !== 'grass') continue;
    if (ash.has(i)) ground[i] = 'ash';
    const c = t.cover[i];
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    if (c === TREE || c === ROCK) {
      blocked[i] = 1;
      props.push({ key: c === TREE ? 'tree' : 'rock', x, y, anchor: 'bottom' });
    } else if (c === BRUSH) {
      brush[i] = 1;
      props.push({ key: 'bush', x, y, anchor: 'bottom' });
    }
  }

  const cost = new Uint8Array(N);
  for (let i = 0; i < N; i++) cost[i] = blocked[i] ? 0 : brush[i] ? BRUSH_COST : COST[ground[i]];
  // Glades the trees close off completely count as blocked, so nobody is sent into one.
  const reached = new Uint8Array(N);
  const start = t.entry.y * MAP_W + t.entry.x;
  const queue = [start];
  reached[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % MAP_W;
    for (const j of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W]) {
      if (j < 0 || j >= N || !cost[j] || reached[j]) continue;
      reached[j] = 1;
      queue.push(j);
    }
  }
  for (let i = 0; i < N; i++) if (!reached[i]) cost[i] = 0;
  return { ground, cost, props, gates };
}

// Homes come in three colours, the same for a lot every time it is drawn.
const HOME_ART = ['house', 'house-red', 'house-blue'] as const;
const homeArt = (lot: number) => HOME_ART[(lot * 7 + (lot >> 3)) % 3];

// The cheapest way from `from` to any road, marked as road. Each tile's price is what it takes
// to make a way across it: open grass is cheap, scrub dearer, trees must be felled, the river
// forded, and only as a last resort a way cut through rock.
const TREAD: Record<number, number> = { [TREE]: 9, [BRUSH]: 4 };
function tread(from: Spot, ground: Ground[], blocked: Uint8Array, cleared: Uint8Array, cover: Uint8Array): void {
  const N = ground.length;
  const start = from.y * MAP_W + from.x;
  if (start < 0 || start >= N || ground[start] === 'road') return;
  const price = (i: number) => {
    if (blocked[i]) return 0;
    if (cover[i] === ROCK && !cleared[i]) return 40; // a way cut round the outcrop
    if (ground[i] === 'road') return 1;
    if (ground[i] === 'trail') return 2;
    if (ground[i] === 'water') return 30;
    if (ground[i] === 'crops') return 6;
    return cleared[i] ? 3 : (TREAD[cover[i]] ?? 3);
  };
  const dist = new Uint32Array(N).fill(0xffffffff);
  const prev = new Int32Array(N).fill(-1);
  const buckets: number[][] = [[start]];
  dist[start] = 0;
  let found = -1;
  for (let d = 0; d < buckets.length && found < 0; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (const i of bucket) {
      if (dist[i] !== d) continue;
      if (i !== start && ground[i] === 'road') {
        found = i;
        break;
      }
      const x = i % MAP_W;
      for (const j of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W]) {
        if (j < 0 || j >= N) continue;
        const p = price(j);
        if (!p || d + p >= dist[j]) continue;
        dist[j] = d + p;
        prev[j] = i;
        (buckets[d + p] ??= []).push(j);
      }
    }
  }
  for (let i = found; i >= 0; i = prev[i]) {
    if (ground[i] !== 'road') ground[i] = 'road';
    cleared[i] = 1;
  }
}
