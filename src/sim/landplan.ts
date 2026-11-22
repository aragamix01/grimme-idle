// Who builds where. Nothing in the town has a place set aside for it: whoever puts something up
// picks the ground. The chief (later the crown) sites the public buildings around the square; a
// family builds near its kin and its work, the well-off near the castle; farmers clear fields
// beside the others, close to water where they can; herders fence pastures by the barn; and those
// with no room anywhere knock up shacks on the town's edge. Ground under the woods has to be cleared
// first, which takes longer and brings in timber, and leaves the deer fewer places to hide.
import { int, pick, type Rng } from './rng';
import { log } from './core';
import { BRUSH, MAP_H, MAP_W, ROCK, TREE, WATER, terrainOf, tileHash, type Spot } from './terrain';
import { wildsOf } from './wilds';
import { IN_WALLS, MILL, ON_WALL, SHACK_BASE, doorOf, dungeonDoor, footprint, lotXY, plaza, ringMask, tileOf, townLayout } from './town';
import type { Npc, Parcel, WorldState } from './types';

const FREE = 0;
const WORKED = 1; // a field or a pasture
const BUILT = 2; // a building, a home, a shack, the square, a dungeon, water or rock
const ROAD = 3;

export const siteOf = (world: WorldState) => terrainOf(world.seed).site;
export const entryOf = (world: WorldState) => terrainOf(world.seed).entry;

export const FIELD = { w: 4, h: 3 };
export const PASTURE = { w: 6, h: 4 };
const FARMERS_PER_FIELD = 3;
const HERDERS_PER_PASTURE = 3;
const LAND_DAY = 21; // day of the month new land is claimed

// What stands on each tile, as far as building goes.
function occupancy(world: WorldState): Uint8Array {
  const t = wildsOf(world);
  const occ = new Uint8Array(MAP_W * MAP_H);
  const lay = townLayout(world);
  const mark = (x0: number, y0: number, w: number, h: number, v: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) occ[y * MAP_W + x] = Math.max(occ[y * MAP_W + x], v);
  };
  for (let i = 0; i < occ.length; i++) {
    if (t.cover[i] === WATER || t.cover[i] === ROCK) occ[i] = BUILT;
    else if (lay.ground[i] === 'road' || lay.ground[i] === 'paved' || lay.ground[i] === 'trail') occ[i] = ROAD;
  }
  const sq = plaza(t.site);
  mark(sq.x0, sq.y0, sq.x1 - sq.x0 + 1, sq.y1 - sq.y0 + 1, BUILT);
  for (const [k, p] of Object.entries(world.plots ?? {})) if (p) mark(p.x, p.y, footprint(k).w, footprint(k).h, BUILT);
  for (const h of world.homes ?? []) {
    const { x, y } = lotXY(h.lot);
    mark(x, y, 2, 2, BUILT);
  }
  for (const s of world.shacks ?? []) mark(s % MAP_W, Math.floor(s / MAP_W), 1, 1, BUILT);
  for (const d of world.dungeons) mark(d.x - 1, d.y, 4, 3, BUILT);
  for (const lot of world.parks ?? []) mark(lot % MAP_W, Math.floor(lot / MAP_W), 3, 3, BUILT);
  for (const m of world.mills ?? []) mark(m.plot % MAP_W, Math.floor(m.plot / MAP_W), MILL.w, MILL.h, BUILT);
  for (const p of world.parcels ?? []) mark(p.x, p.y, p.w, p.h, WORKED);
  if (world.ring) {
    const m = ringMask(world.ring);
    for (let i = 0; i < occ.length; i++) if (m[i] === ON_WALL) occ[i] = BUILT;
  }
  const e = t.entry;
  mark(e.x, e.y, 1, 1, BUILT);
  return occ;
}

// Whether a tile is open ground nobody has claimed or built on (for the god's hand on the land).
export function landFree(world: WorldState): (i: number) => boolean {
  const occ = occupancy(world);
  return (i) => occ[i] === FREE;
}

// Whether the town has a line round it yet: a palisade first, stone walls later.
export const enclosed = (world: WorldState) => !!world.ring && (!world.founded || world.founded.walls !== undefined || world.founded.palisade !== undefined);

// How the town is laid out, by who rules it: a camp or a village grows as it will; a king sets his
// town round the castle and a theocracy round the church, in rings; a republic, an oligarchy or a
// junta in straight rows of blocks.
export type PlanStyle = 'organic' | 'radial' | 'grid';
export const PLAN_TH: Record<PlanStyle, string> = { organic: 'ตามธรรมชาติ ใครสร้างตรงไหนก็ได้', radial: 'วงล้อมรอบศูนย์กลาง', grid: 'ตารางหมากรุก ถนนตัดตรง' };
export function planStyle(world: WorldState): PlanStyle {
  if (world.founded && (world.rank ?? 0) < 2) return 'organic';
  const r = world.regime ?? 'monarchy'; // regimeOf, read here without pulling in the politics
  return r === 'monarchy' || r === 'theocracy' ? 'radial' : 'grid';
}
// The heart a radial town is laid round.
function radialHeart(world: WorldState): Spot {
  return (world.regime === 'theocracy' ? plotDoor(world, 'church') : undefined) ?? plotDoor(world, 'castle') ?? siteOf(world);
}
const GRID = 4; // a grid town's block

interface Want {
  w: number;
  h: number;
  target: Spot;
  land?: boolean; // a field or pasture: no clear margin needed, and it may sit beside others
  maxR?: number;
  minFromSite?: number;
  wet?: number; // how far from water it would rather be
  doorX?: number; // offset of the door along the bottom edge (buildings)
  inside?: boolean; // within the walls, if the town has them
  style?: PlanStyle; // the rulers' plan: a grid lines things up, rings keep them at one distance
  ringR?: number; // for a radial plan: how far out from the heart
}

// Whether a patch lies wholly within the town line.
function allInside(ring: NonNullable<WorldState['ring']>, x0: number, y0: number, w: number, h: number): boolean {
  const m = ringMask(ring);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (m[y * MAP_W + x] !== IN_WALLS) return false;
  return true;
}

// The best open patch for something w x h tiles, near the target: as little to clear as may be,
// a road at the door, away from the square for fields.
function findSpot(world: WorldState, occ: Uint8Array, want: Want): Spot | undefined {
  const t = wildsOf(world);
  const R = want.maxR ?? 26;
  const ring = world.ring;
  let best: Spot | undefined;
  let bestScore = Infinity;
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const x = want.target.x + dx - (want.w >> 1);
      const y = want.target.y + dy - (want.h >> 1);
      if (x < 2 || y < 2 || x + want.w > MAP_W - 2 || y + want.h > MAP_H - 2) continue;
      const near = Math.hypot(dx, dy * 1.2);
      if (near > R) continue;
      const fromSite = Math.hypot(x + want.w / 2 - t.site.x, (y + want.h / 2 - t.site.y) * 1.2);
      if (want.minFromSite && fromSite < want.minFromSite) continue;
      if (want.inside && ring && !allInside(ring, x, y, want.w, want.h)) continue;
      let ok = true;
      let clear = 0;
      for (let yy = y; yy < y + want.h && ok; yy++)
        for (let xx = x; xx < x + want.w; xx++) {
          const i = yy * MAP_W + xx;
          if (occ[i] !== FREE) {
            ok = false;
            break;
          }
          clear += t.cover[i] === TREE ? 1.2 : t.cover[i] === BRUSH ? 0.3 : 0;
        }
      if (!ok) continue;
      let road = false;
      if (!want.land) {
        // A clear tile all round, so there is a way to the door and the neighbours do not touch.
        for (let yy = y - 1; yy <= y + want.h && ok; yy++)
          for (let xx = x - 1; xx <= x + want.w; xx++) {
            if (yy >= y && yy < y + want.h && xx >= x && xx < x + want.w) continue;
            const v = occ[yy * MAP_W + xx];
            if (v === BUILT) {
              ok = false;
              break;
            }
            if (v === ROAD) road = true;
          }
        const door = occ[(y + want.h) * MAP_W + x + (want.doorX ?? 1)];
        if (door === WORKED) ok = false;
      }
      if (!ok) continue;
      const wet = want.wet === undefined ? 0 : Math.abs(t.wet[(y + (want.h >> 1)) * MAP_W + x + (want.w >> 1)] - want.wet) * 0.35;
      const score = near + clear * 1.5 + wet + (want.land || road ? 0 : 1.5) + tileHash(world.seed, x, y, 77) * 0.8 + planned(world, want, x, y);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  return best;
}

// What the rulers' plan makes of a spot: a grid town wants it squared to the blocks, a radial town
// on one of the rings about its heart. An organic town does not mind.
function planned(world: WorldState, want: Want, x: number, y: number): number {
  if (!want.style || want.style === 'organic' || want.land) return 0;
  const s = siteOf(world);
  if (want.style === 'grid') {
    const off = (v: number) => ((v % GRID) + GRID) % GRID;
    return (off(x - s.x) ? 2.5 : 0) + (off(y + want.h - s.y) ? 2.5 : 0); // fronts in a row along the street
  }
  const heart = radialHeart(world);
  const d = Math.hypot(x + want.w / 2 - heart.x, (y + want.h / 2 - heart.y) * 1.2) % GRID;
  return Math.min(d, GRID - d) * 1.2;
}

// Trees on a patch: what has to be felled to use it.
export function treesOn(world: WorldState, x0: number, y0: number, w: number, h: number): number {
  const cover = wildsOf(world).cover;
  let n = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (cover[y * MAP_W + x] === TREE) n++;
  return n;
}
const bump = (world: WorldState) => (world.buildRev = (world.buildRev ?? 0) + 1);

// ---------- public buildings ----------

// Around the square, each kind of building on its own side of it, the castle at its head.
const CIVIC_AIM: Record<string, [dx: number, dy: number]> = {
  castle: [0, -6],
  church: [6, -4],
  inn: [-6, -3],
  guild: [-7, 3],
  shop: [4, 3],
  forge: [-4, 6],
  barracks: [8, 4],
  manor: [-8, -6],
  brothel: [9, 0],
  plaza: [0, 4],
  bathhouse: [-9, 5],
  theatre: [8, -8],
};

// Where the crown or the chief puts a new building; false when there is nowhere to put it.
export function placeBuilding(world: WorldState, key: string): boolean {
  if (world.plots?.[key]) return true;
  const t = wildsOf(world);
  const fp = footprint(key);
  let target: Spot;
  if (key === 'barn') {
    const p = (world.parcels ?? []).find((q) => q.kind === 'pasture');
    target = p ? { x: p.x + p.w + 2, y: p.y + 1 } : { x: t.site.x + 10, y: t.site.y + 6 };
  } else if (CIVIC_AIM[key]) {
    const [dx, dy] = CIVIC_AIM[key];
    // Mirrored for some seeds, so the castle is not always at the same corner of the square.
    const flip = tileHash(world.seed, 3, 3, 41) < 0.5 ? -1 : 1;
    target = { x: t.site.x + dx * flip, y: t.site.y + dy };
  } else {
    // The crown's works: a ring a little further out.
    const a = tileHash(world.seed, key.length, key.charCodeAt(0), 42) * Math.PI * 2;
    target = { x: Math.round(t.site.x + Math.cos(a) * 9), y: Math.round(t.site.y + Math.sin(a) * 7) };
  }
  const door = doorOf(key, 0, 0);
  // Inside the walls if there is room (the crown's works were always built outside them), else
  // wherever there is ground.
  const want = { w: fp.w, h: fp.h, target, doorX: door.x, maxR: key === 'castle' ? 8 : 24, style: key === 'castle' ? undefined : planStyle(world) };
  const occ = occupancy(world);
  const spot = (CIVIC_AIM[key] ? findSpot(world, occ, { ...want, inside: true }) : undefined) ?? findSpot(world, occ, { ...want, maxR: 30 });
  if (!spot) return false;
  (world.plots ??= {})[key] = spot;
  bump(world);
  return true;
}

// Where the crown lays out a new park, as the lot of its top-left tile (-1: nowhere): a king's first
// is a royal garden by the castle; after that, among the homes farthest from any green, inside the
// walls if there is room.
export function parkSpot(world: WorldState): number {
  const t = wildsOf(world);
  const parks = (world.parks ?? []).map((l) => ({ x: (l % MAP_W) + 1, y: Math.floor(l / MAP_W) + 1 }));
  let target: Spot = t.site;
  if (!parks.length && world.regime === 'monarchy') target = plotDoor(world, 'castle') ?? t.site;
  else {
    let far = -1;
    for (const h of world.homes ?? []) {
      const { x, y } = lotXY(h.lot);
      const d = Math.min(Math.hypot(x - t.site.x, y - t.site.y) * 0.6 + 6, ...parks.map((p) => Math.hypot(p.x - x, p.y - y)));
      if (d > far) {
        far = d;
        target = { x: x + 1, y: y + 1 };
      }
    }
  }
  const want = { w: 3, h: 3, target, maxR: 12, style: planStyle(world) };
  const occ = occupancy(world);
  const spot = findSpot(world, occ, { ...want, inside: true }) ?? findSpot(world, occ, want);
  return spot ? tileOf(spot.x, spot.y) : -1;
}

// The door of a building that has been sited.
export function plotDoor(world: WorldState, key: string): Spot | undefined {
  const p = world.plots?.[key];
  return p ? doorOf(key, p.x, p.y) : undefined;
}

// ---------- homes ----------

// Where a new home goes, as its lot number: near the family's kin and work, or for the well-off,
// near the castle. -1 when the town has no ground left within reach.
export function homeSpot(world: WorldState, family: Npc[], rich: boolean): number {
  const t = wildsOf(world);
  const aims: Spot[] = [];
  if (rich) aims.push(plotDoor(world, 'castle') ?? t.site);
  // The well-off like a park at the door: the nearest one pulls their new home toward it.
  const park = rich && (world.parks ?? []).map((l) => ({ x: (l % MAP_W) + 1, y: Math.floor(l / MAP_W) + 1 })).sort((a, b) => Math.hypot(a.x - t.site.x, a.y - t.site.y) - Math.hypot(b.x - t.site.x, b.y - t.site.y))[0];
  if (park) aims.push(park, park);
  for (const n of family) {
    const housed = (k: Npc | undefined) => !!k?.alive && k.home !== undefined && k.home < SHACK_BASE;
    const kin = (n.parentIds ?? []).map((id) => world.npcs.find((k) => k.id === id)).find(housed) ?? world.npcs.find((k) => housed(k) && k.parentIds?.includes(n.id));
    if (kin) {
      const at = lotXY(kin.home!);
      aims.push({ x: at.x + 1, y: at.y + 1 }, { x: at.x + 1, y: at.y + 1 }); // kin count double
    }
    const work = workplace(world, n);
    if (work) aims.push(work);
  }
  const target = aims.length ? { x: Math.round(aims.reduce((s, a) => s + a.x, 0) / aims.length), y: Math.round(aims.reduce((s, a) => s + a.y, 0) / aims.length) } : t.site;
  // Pulled a little toward the square: nobody builds out in the wilds while there is room nearer.
  const pull = { x: Math.round(target.x * 0.75 + t.site.x * 0.25), y: Math.round(target.y * 0.75 + t.site.y * 0.25) };
  const spot = findSpot(world, occupancy(world), { w: 2, h: 2, target: pull, maxR: 30, style: planStyle(world) });
  return spot ? tileOf(spot.x, spot.y) : -1;
}

// Where someone's work is, for choosing a home near it.
function workplace(world: WorldState, n: Npc): Spot | undefined {
  if (n.job === 'farmer') {
    const f = (world.parcels ?? []).find((p) => p.kind === 'field' && p.ownerId === n.id) ?? (world.parcels ?? []).find((p) => p.kind === 'field');
    return f && { x: f.x + 2, y: f.y + 1 };
  }
  if (n.job === 'herder') return plotDoor(world, 'barn');
  const at: Partial<Record<Npc['job'], string>> = { merchant: 'shop', blacksmith: 'forge', innkeeper: 'inn', priest: 'church', soldier: 'barracks', courtesan: 'brothel', swordsman: 'guild', mage: 'guild', judge: 'castle', scholar: 'castle' };
  const k = at[n.job];
  return k ? plotDoor(world, k) : undefined;
}

// Whether a home stands outside the town walls (there are none before the town builds them).
export function outsideWalls(world: WorldState, x: number, y: number): boolean {
  const r = world.ring;
  return !!r && (world.founded?.walls !== undefined || world.founded?.palisade !== undefined) && world.works?.boulevard === undefined && ringMask(r)[y * MAP_W + x] !== IN_WALLS;
}
export const lotOutside = (world: WorldState, lot: number) => {
  const { x, y } = lotXY(lot);
  return outsideWalls(world, x, y);
};

// A tile for a shack: open ground on the edge of the town, by a road if there is one.
export function shackSpot(world: WorldState, taken: Set<number>): number {
  const t = wildsOf(world);
  const occ = occupancy(world);
  let edge = 6;
  for (const h of world.homes ?? []) {
    const { x, y } = lotXY(h.lot);
    edge = Math.max(edge, Math.hypot(x - t.site.x, (y - t.site.y) * 1.2) + 2);
  }
  if (world.ring) edge = Math.max(edge, Math.hypot(world.ring.x1 - t.site.x, 0) + 2);
  let best = -1;
  let bestScore = Infinity;
  for (let y = t.site.y - 30; y <= t.site.y + 30; y++)
    for (let x = t.site.x - 36; x <= t.site.x + 36; x++) {
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 2) continue;
      const i = y * MAP_W + x;
      if (occ[i] !== FREE || t.cover[i] === TREE || taken.has(i) || occ[i + MAP_W] === BUILT) continue;
      const d = Math.hypot(x - t.site.x, (y - t.site.y) * 1.2);
      if (d < edge) continue;
      const byRoad = occ[i - 1] === ROAD || occ[i + 1] === ROAD || occ[i - MAP_W] === ROAD || occ[i + MAP_W] === ROAD;
      // Huddled together: next to another shack counts for a lot.
      const huddle = [i - 1, i + 1, i - MAP_W, i + MAP_W].some((j) => taken.has(j)) ? -3 : 0;
      const score = d - edge + (byRoad ? 0 : 2) + huddle + tileHash(world.seed, x, y, 91);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
  return best;
}

// ---------- fields and pastures ----------

function claim(world: WorldState, kind: Parcel['kind'], ownerId: number | undefined, ready: boolean): Parcel | undefined {
  const t = wildsOf(world);
  const size = kind === 'field' ? FIELD : PASTURE;
  const same = (world.parcels ?? []).filter((p) => p.kind === kind);
  let target: Spot;
  if (same.length) {
    // Beside the others: their middle, nudged outward.
    const cx = same.reduce((s, p) => s + p.x + p.w / 2, 0) / same.length;
    const cy = same.reduce((s, p) => s + p.y + p.h / 2, 0) / same.length;
    // Beside the others, but drawn back toward the square: nobody wants the long walk out.
    target = { x: Math.round((cx + t.site.x) / 2), y: Math.round((cy + t.site.y) / 2) };
  } else if (kind === 'pasture') {
    const barn = plotDoor(world, 'barn');
    const fields = (world.parcels ?? []).filter((p) => p.kind === 'field');
    target = barn ?? (fields.length ? { x: fields[0].x - 8, y: fields[0].y } : { x: t.site.x - 10, y: t.site.y + 8 });
  } else {
    // The first fields go toward the water, a little way off the square.
    let wx = t.site.x;
    let wy = t.site.y + 8;
    let best = 999;
    for (let a = 0; a < 16; a++) {
      const x = Math.round(t.site.x + Math.cos((a / 16) * Math.PI * 2) * 7);
      const y = Math.round(t.site.y + Math.sin((a / 16) * Math.PI * 2) * 5);
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue;
      const w = t.wet[y * MAP_W + x] + treesOn(world, x - 2, y - 1, 4, 3) * 0.6;
      if (w < best) {
        best = w;
        wx = x;
        wy = y;
      }
    }
    target = { x: wx, y: wy };
  }
  const spot = findSpot(world, occupancy(world), { ...size, target, land: true, minFromSite: 6, wet: kind === 'field' ? 2 : undefined, maxR: 30 });
  if (!spot) return undefined;
  const trees = treesOn(world, spot.x, spot.y, size.w, size.h);
  const p: Parcel = { kind, ...spot, ...size, ownerId, ready: ready ? world.day : world.day + 8 + trees * 3 };
  (world.parcels ??= []).push(p);
  bump(world);
  if (!ready && trees) {
    // The felled trees go to market; the deer lose a little more of their cover.
    if (world.market) world.market.stock.timber += trees;
    world.game = Math.max(0, (world.game ?? 0) - trees * 0.15);
  }
  return p;
}
export const claimField = (world: WorldState, ownerId?: number, ready = false) => claim(world, 'field', ownerId, ready);
export const claimPasture = (world: WorldState, ready = false) => claim(world, 'pasture', undefined, ready);

const working = (world: WorldState, job: Npc['job']) => world.npcs.filter((n) => n.alive && n.job === job && n.age >= 16 && n.inside === undefined);
export const fieldsWanted = (world: WorldState) => Math.ceil(working(world, 'farmer').length / FARMERS_PER_FIELD);
export const pasturesWanted = (world: WorldState) => Math.ceil(working(world, 'herder').length / HERDERS_PER_PASTURE);

// Monthly: farmers short of land clear a new field, herders a new pasture.
export function landDay(world: WorldState): void {
  if (world.day % 30 !== LAND_DAY) return;
  const fields = (world.parcels ?? []).filter((p) => p.kind === 'field');
  if (fields.length < fieldsWanted(world)) {
    const owned = new Set(fields.map((f) => f.ownerId));
    const who = working(world, 'farmer').find((n) => !owned.has(n.id));
    const p = claimField(world, who?.id);
    if (p) log(world, 'world', `${who ? who.name : 'ชาวนา'}จับจองที่ดินเปิดนาใหม่${treesOn(world, p.x, p.y, p.w, p.h) ? ' ต้องโค่นต้นไม้ถางป่าก่อน' : ''}`, who?.id);
  }
  // Only the common grazing counts: a pasture a noble has enclosed is no use to the herders.
  const pastures = (world.parcels ?? []).filter((p) => p.kind === 'pasture' && p.ownerId === undefined);
  if (pastures.length < pasturesWanted(world)) {
    const p = claimPasture(world);
    if (p) log(world, 'world', 'คนเลี้ยงสัตว์ล้อมรั้วทุ่งหญ้าใหม่ให้ฝูงสัตว์');
  }
  fenceDay(world);
}

// A field right beside a pasture gets trampled by the flocks until its farmers fence it off.
const FENCE_TIMBER = 4; // timber for one field's fence
const TRAMPLED = 0.12; // what a trampled field loses
const besidePasture = (world: WorldState, f: Parcel) =>
  (world.parcels ?? []).some((p) => p.kind === 'pasture' && p.x <= f.x + f.w && f.x <= p.x + p.w && p.y <= f.y + f.h && f.y <= p.y + p.h);
export const trampled = (world: WorldState, f: Parcel) => f.kind === 'field' && !f.fenced && besidePasture(world, f);
// Monthly: one trampled field is fenced, with timber off the market's shelves.
function fenceDay(world: WorldState): void {
  const f = (world.parcels ?? []).find((p) => trampled(world, p));
  const m = world.market;
  if (!f || !m || m.stock.timber < FENCE_TIMBER) return;
  m.stock.timber -= FENCE_TIMBER;
  m.till += Math.round(FENCE_TIMBER * m.price.timber);
  f.fenced = true;
  bump(world);
  const who = world.npcs.find((n) => n.id === f.ownerId && n.alive);
  log(world, 'world', `${who ? who.name : 'ชาวนา'}ล้อมรั้วนาไม่ให้ฝูงสัตว์จากทุ่งข้าง ๆ เข้ามาเหยียบข้าว`, who?.id);
}

// How well the fields feed the farmers: enough of them, cleared and near water. A farmer with no
// field works whatever scraps of ground are left, for less.
let yieldCache: { world: WorldState; day: number; v: number } | null = null;
export function fieldYield(world: WorldState): number {
  if (yieldCache?.world === world && yieldCache.day === world.day) return yieldCache.v;
  const t = wildsOf(world);
  const ready = (world.parcels ?? []).filter((p) => p.kind === 'field' && p.ready <= world.day);
  const farmers = Math.max(1, working(world, 'farmer').length);
  const share = Math.min(1, (ready.length * FARMERS_PER_FIELD) / farmers);
  let soil = 1;
  if (ready.length) {
    soil = 0;
    for (const p of ready) {
      const w = t.wet[(p.y + 1) * MAP_W + p.x + 2];
      soil += (w <= 3 ? 1.15 : w <= 7 ? 1.07 : 1) * (trampled(world, p) ? 1 - TRAMPLED : 1);
    }
    soil /= ready.length;
  }
  const v = (0.85 + 0.15 * share) * soil;
  yieldCache = { world, day: world.day, v };
  return v;
}

// A tile to work in: the farmer's own field, else any.
export function fieldSpot(world: WorldState, n: Npc, rng: Rng): Spot | undefined {
  const fields = (world.parcels ?? []).filter((p) => p.kind === 'field' && p.ready <= world.day);
  const f = fields.find((p) => p.ownerId === n.id) ?? (fields.length ? pick(rng, fields) : undefined);
  return f && { x: int(rng, f.x, f.x + f.w - 1), y: int(rng, f.y, f.y + f.h - 1) };
}
export function pastureSpot(world: WorldState, rng: Rng): Spot | undefined {
  const all = (world.parcels ?? []).filter((p) => p.kind === 'pasture');
  const common = all.filter((p) => p.ownerId === undefined);
  const ps = common.length ? common : all;
  const p = ps.length ? pick(rng, ps) : undefined;
  return p && { x: int(rng, p.x + 1, p.x + p.w - 2), y: int(rng, p.y + 1, p.y + p.h - 2) };
}
// Somewhere in the woods around the town, for a hunter's stalk.
export function woodsSpot(world: WorldState, rng: Rng): Spot {
  const t = wildsOf(world);
  for (let tries = 0; tries < 40; tries++) {
    const x = t.site.x + int(rng, -22, 22);
    const y = t.site.y + int(rng, -16, 16);
    if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
    if (Math.hypot(x - t.site.x, y - t.site.y) < 9) continue;
    if (t.cover[y * MAP_W + x] === TREE) return { x, y };
  }
  return { x: t.site.x + int(rng, -14, 14), y: t.site.y + int(rng, -10, 10) };
}

// ---------- walls ----------

// The line the walls follow: round the homes and buildings standing, with a little room to spare.
export function drawRing(world: WorldState): void {
  world.ring = ringFor(world);
  bump(world);
}
// How long a line that is: what a palisade or a wall costs goes by it, so a town spread wide pays more.
export const ringLength = (r: NonNullable<WorldState['ring']>) => ringMask(r).reduce((n, v) => n + (v === ON_WALL ? 1 : 0), 0);
export const RING_REF = 60; // the length a wall's listed price is for
export function ringFor(world: WorldState): NonNullable<WorldState['ring']> {
  const t = wildsOf(world);
  // Everything the line goes round, each with two tiles to spare (the door row counts).
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [{ x0: t.site.x - 8, y0: t.site.y - 7, x1: t.site.x + 8, y1: t.site.y + 7 }];
  const take = (x: number, y: number, w: number, h: number) => boxes.push({ x0: x - 2, y0: y - 2, x1: x + w + 1, y1: y + h + 2 });
  // Homes and buildings far out by the fields and pastures stay outside: the walls go round the
  // town, not the farms.
  const core = (x: number, y: number) => Math.hypot(x - t.site.x, (y - t.site.y) * 1.2) <= 16;
  for (const [k, p] of Object.entries(world.plots ?? {})) if (p && core(p.x, p.y)) take(p.x, p.y, footprint(k).w, footprint(k).h);
  for (const h of world.homes ?? []) {
    const { x, y } = lotXY(h.lot);
    if (core(x, y)) take(x, y, 2, 2);
  }
  // Row by row, the line takes in the span of whatever lies on that row; a row with nothing on it
  // takes the span of the row before. The result hugs the town instead of boxing in the fields.
  const y0 = Math.max(1, Math.min(...boxes.map((b) => b.y0)));
  const y1 = Math.min(MAP_H - 2, Math.max(...boxes.map((b) => b.y1)));
  const rows: number[] = [];
  let last: [number, number] = [t.site.x - 8, t.site.x + 8];
  for (let y = y0; y <= y1; y++) {
    const on = boxes.filter((b) => y >= b.y0 && y <= b.y1);
    if (on.length) last = [Math.max(1, Math.min(...on.map((b) => b.x0))), Math.min(MAP_W - 2, Math.max(...on.map((b) => b.x1)))];
    rows.push(...last);
  }
  // Smooth the steps: no row juts out past both its neighbours.
  for (let pass = 0; pass < 2; pass++)
    for (let k = 1; k < rows.length / 2 - 1; k++) {
      rows[k * 2] = Math.min(rows[k * 2], Math.max(rows[k * 2 - 2], rows[k * 2 + 2]));
      rows[k * 2 + 1] = Math.max(rows[k * 2 + 1], Math.min(rows[k * 2 - 1], rows[k * 2 + 3]));
    }
  const xs = rows.filter((_, i) => i % 2 === 0);
  const xe = rows.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0, x1: Math.max(...xe), y1, rows };
}

// ---------- the high street ----------

// A straight street from the square out to the road in, two tiles wide, and the homes standing in
// its way (happening roadthrough).
export function highStreet(world: WorldState): { tiles: number[]; homes: NonNullable<WorldState['homes']> } {
  const t = terrainOf(world.seed);
  const tiles: number[] = [];
  const n = Math.max(Math.abs(t.entry.x - t.site.x), Math.abs(t.entry.y - t.site.y));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(t.site.x + ((t.entry.x - t.site.x) * k) / n);
    const y = Math.round(t.site.y + ((t.entry.y - t.site.y) * k) / n);
    for (const i of [y * MAP_W + x, (Math.abs(t.entry.x - t.site.x) >= Math.abs(t.entry.y - t.site.y) ? y + 1 : y) * MAP_W + (Math.abs(t.entry.x - t.site.x) >= Math.abs(t.entry.y - t.site.y) ? x : x + 1)])
      if (!tiles.includes(i)) tiles.push(i);
  }
  const on = new Set(tiles);
  const homes = (world.homes ?? []).filter((h) => {
    const { x, y } = lotXY(h.lot);
    return [0, 1].some((dy) => [0, 1].some((dx) => on.has((y + dy) * MAP_W + x + dx)));
  });
  return { tiles, homes };
}

// ---------- mills ----------

// Ground for a new mill (3x2): out past the homes, by the railway if there is one, else by the
// pastures; as its top-left tile, or -1 with nowhere left.
export function millSite(world: WorldState): number {
  const t = wildsOf(world);
  const st = plotDoor(world, 'station');
  const pasture = (world.parcels ?? []).find((p) => p.kind === 'pasture');
  const target = st ?? (pasture ? { x: pasture.x + pasture.w + 2, y: pasture.y } : { x: t.site.x + 12, y: t.site.y + 8 });
  const spot = findSpot(world, occupancy(world), { w: MILL.w, h: MILL.h, target, doorX: 1, maxR: 30, minFromSite: 10 });
  return spot ? tileOf(spot.x, spot.y) : -1;
}

// ---------- dungeons ----------

// A spot deep in the woods for a dungeon, well clear of the town and of the others.
export function dungeonSpot(world: WorldState, rng: Rng): Spot | undefined {
  const t = wildsOf(world);
  const occ = occupancy(world);
  const spots: Spot[] = [];
  for (let y = 3; y < MAP_H - 5; y++)
    for (let x = 3; x < MAP_W - 5; x++) {
      const d = Math.hypot(x - t.site.x, (y - t.site.y) * 1.2);
      if (d < 15 || d > 30) continue;
      if (world.dungeons.some((o) => Math.abs(o.x - x) < 7 && Math.abs(o.y - y) < 6)) continue;
      if (Math.hypot(x - t.entry.x, y - t.entry.y) < 6) continue;
      let ok = true;
      let woods = 0;
      for (let yy = y - 1; yy <= y + 3 && ok; yy++)
        for (let xx = x - 1; xx <= x + 2; xx++) {
          const i = yy * MAP_W + xx;
          if (occ[i] !== FREE) {
            ok = false;
            break;
          }
          if (t.cover[i] === TREE) woods++;
        }
      if (ok && woods >= 4) spots.push({ x, y });
    }
  if (spots.length) return pick(rng, spots);
  // No woods left wild enough: anywhere out of town.
  for (let tries = 0; tries < 200; tries++) {
    const x = int(rng, 3, MAP_W - 6);
    const y = int(rng, 3, MAP_H - 6);
    const door = dungeonDoor({ x, y });
    if (Math.hypot(x - t.site.x, y - t.site.y) >= 15 && occ[y * MAP_W + x] === FREE && occ[door.y * MAP_W + door.x] !== BUILT) return { x, y };
  }
  return undefined;
}
