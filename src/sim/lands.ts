// The lands between the keeps. The world map is cut into regions, like a map of the world:
// our town's own country, each neighbour's heartland, and the open country between, which
// whoever reaches it first may settle. A region is worked for what it is good for (fields
// on the plains, flocks in the hills, mines in the mountains and the dunes, timber in the
// woods, boats on the shore), each use raised a level at a time by the treasury that owns it,
// and each kind of land gives its owner its own edge. Land changes hands three ways: bought
// from a neighbour short of gold, ceded by a friend at the table, or taken in war.
import { chance, createRng, int, next, pick, type Rng } from './rng';
import { clamp, decreeActive, log, occupied } from './core';
import { ensureMarket, levelOf as priceLevel, priceRatio } from './market';
import { HOME } from './realms';
import { MAP_H, MAP_W } from './town';
import { canSend, changeHands, keepOf, labour, sendFamily } from './villages';
import { landQuestOpen, postLandQuest } from './quests';
import type { Good, LandKind, LandUse, Realm, Region, WorldState } from './types';

export const LAND_TH: Record<LandKind, string> = { plain: 'ทุ่งราบ', hills: 'เนินเขา', woods: 'ป่าไม้', shore: 'ชายฝั่ง', dunes: 'ทะเลทราย', peaks: 'เทือกเขา' };
export const USE_TH: Record<LandUse, string> = { farm: 'นาข้าว', pasture: 'ทุ่งปศุสัตว์', mine: 'เหมืองแร่', lumber: 'ลานตัดไม้', fishery: 'ท่าประมง' };
// What each land can be worked for; the first is what it is best at (half as much again).
export const USES: Record<LandKind, LandUse[]> = {
  plain: ['farm', 'pasture'],
  hills: ['pasture', 'mine', 'farm'],
  woods: ['lumber', 'pasture'],
  shore: ['fishery', 'farm'],
  dunes: ['mine'],
  peaks: ['mine', 'pasture'],
};
// The edge each kind of land gives whoever holds it, beyond its best use.
export const EDGE_TH: Record<LandKind, string> = {
  plain: 'ดินดี นาข้าวได้ผลมากขึ้นครึ่งหนึ่ง',
  hills: 'หญ้าอุดม ปศุสัตว์ได้ผลมากขึ้นครึ่งหนึ่ง',
  woods: 'ไม้ดี ลานตัดไม้ได้ผลมากขึ้นครึ่งหนึ่ง และสัตว์ป่าเพิ่ม',
  shore: 'ท่าเรือ ประมงได้ผลมากขึ้นครึ่งหนึ่ง และคาราวานค้าขายได้กำไรเพิ่ม',
  dunes: 'อัญมณีใต้ผืนทราย เหมืองได้ทองมากขึ้นครึ่งหนึ่ง',
  peaks: 'ป้อมบนช่องเขา กองทัพแข็งแกร่งขึ้น และเหมืองได้ผลมากขึ้นครึ่งหนึ่ง',
};
export const MAX_LEVEL = 3;
const LAND_DAY = 17; // day of the month the land yields and the treasuries invest
const STRETCH = 1.3; // map rows are read a little taller, as the map's keeps are laid out

// What one level of a use brings its owner in a month.
const YIELD: Record<LandUse, { grain?: number; meat?: number; wool?: number; gold?: number; timber?: number; ore?: number }> = {
  farm: { grain: 14 },
  pasture: { meat: 3, wool: 1 },
  mine: { ore: 4, gold: 6 }, // iron for the forge, and a little silver
  lumber: { timber: 6 },
  fishery: { meat: 4, gold: 4 },
};
const DEV_COST = 150; // gold for the first level of a use; each level after costs as much again
const SETTLE_COST = 250; // to send settlers into open country, and more for every region already held
const RESERVE = 600; // our treasury never invests or settles below this

const NAMES = ['ทอง', 'ลมเย็น', 'เมฆขาว', 'จันทร์เพ็ญ', 'หงส์หยก', 'สายรุ้ง', 'หิมะ', 'มรกต', 'อินทนิล', 'ดาวเหนือ', 'คราม', 'ไผ่ทอง', 'ช้างเผือก', 'กระทิง', 'ลำธาร', 'นกยูง', 'ศิลาแดง', 'ตะวันรอน'];
const PREFIX: Record<LandKind, string> = { plain: 'ทุ่ง', hills: 'เนิน', woods: 'ป่า', shore: 'อ่าว', dunes: 'ผืนทราย', peaks: 'ยอดเขา' };
const FROM_TERRAIN: Record<Realm['terrain'], LandKind[]> = { mountain: ['peaks', 'hills'], coast: ['shore', 'shore', 'plain'], desert: ['dunes', 'dunes', 'plain'], forest: ['woods', 'woods', 'hills'] };

export const isOurs = (r: Region) => r.owner === 'us';
export const ourLands = (world: WorldState) => (world.regions ?? []).filter(isOurs);
export const levelOf = (r: Region, u: LandUse) => r.dev?.[u] ?? 0;
export const devCost = (r: Region, u: LandUse) => DEV_COST * (levelOf(r, u) + 1);
export const best = (r: Region) => USES[r.kind][0];
// What a region is worth to buy: the land, and what has been built on it.
export const priceOf = (r: Region) => 300 + Object.values(r.dev ?? {}).reduce((s, l) => s + l * 120, 0);

// What a region brings its owner each month, with its best use's bonus.
export function yieldOf(r: Region): { grain: number; meat: number; wool: number; gold: number; timber: number; ore: number } {
  const out = { grain: 0, meat: 0, wool: 0, gold: 0, timber: 0, ore: 0 };
  for (const u of USES[r.kind]) {
    const l = levelOf(r, u);
    if (!l) continue;
    const k = l * (u === best(r) || (r.kind === 'peaks' && u === 'mine') ? 1.5 : 1);
    const y = YIELD[u];
    out.grain += Math.round((y.grain ?? 0) * k);
    out.meat += Math.round((y.meat ?? 0) * k);
    out.wool += Math.round((y.wool ?? 0) * k);
    out.gold += Math.round((y.gold ?? 0) * k);
    out.timber += Math.round((y.timber ?? 0) * k);
    out.ore += Math.round((y.ore ?? 0) * k);
  }
  return out;
}

// ---------- the map's partition ----------

// A small fixed jitter per tile and region, so borders wander like real ones.
const wobble = (x: number, y: number, id: number) => {
  let h = (x * 374761393 + y * 668265263 + id * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

let cache: { key: string; grid: number[]; touch: Map<number, Set<number>> } | null = null;

// Which region every tile of the world map belongs to, and which regions share a border.
export function partition(world: WorldState): { grid: number[]; touch: Map<number, Set<number>> } {
  const regions = world.regions ?? [];
  const key = `${world.seed}:${regions.map((r) => r.id).join(',')}`;
  if (cache?.key === key) return cache;
  const grid: number[] = new Array(MAP_W * MAP_H).fill(-1);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      let bestId = -1;
      let bestD = Infinity;
      for (const r of regions) {
        const d = Math.hypot(x - r.x, (y - r.y) * STRETCH) + wobble(x, y, r.id) * 1.6;
        if (d < bestD) {
          bestD = d;
          bestId = r.id;
        }
      }
      grid[y * MAP_W + x] = bestId;
    }
  const touch = new Map<number, Set<number>>(regions.map((r) => [r.id, new Set<number>()]));
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const a = grid[y * MAP_W + x];
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (x + dx >= MAP_W || y + dy >= MAP_H) continue;
        const b = grid[(y + dy) * MAP_W + x + dx];
        if (a !== b) {
          touch.get(a)?.add(b);
          touch.get(b)?.add(a);
        }
      }
    }
  cache = { key, grid, touch };
  return cache;
}

export const regionAt = (world: WorldState, x: number, y: number) => {
  const id = partition(world).grid[y * MAP_W + x];
  return world.regions?.find((r) => r.id === id);
};
const neighbours = (world: WorldState, r: Region) => [...(partition(world).touch.get(r.id) ?? [])].map((id) => world.regions!.find((x) => x.id === id)!).filter(Boolean);
// Regions on an owner's border: not theirs, but touching something that is.
export function frontier(world: WorldState, owner: Region['owner']): Region[] {
  const out = new Set<Region>();
  for (const r of world.regions ?? []) if (r.owner === owner) for (const n of neighbours(world, r)) if (n.owner !== owner) out.add(n);
  return [...out];
}
// Lairs on a region's borders.
export const neighbourLairs = (world: WorldState, r: Region) => neighbours(world, r).filter((n) => (n.danger ?? 0) > 0).length;
export const touches = (world: WorldState, r: Region, owner: Region['owner']) => neighbours(world, r).some((n) => n.owner === owner);

// ---------- laying the lands out ----------

export function createRegions(world: WorldState): void {
  const rng = createRng(world.seed ^ 0x1a4d);
  const realms = world.realms ?? [];
  const names = [...NAMES];
  const name = (kind: LandKind) => PREFIX[kind] + names.splice(int(rng, 0, names.length - 1), 1)[0];
  const regions: Region[] = [{ id: world.nextId++, name: 'แผ่นดินของเรา', kind: 'plain', x: HOME.x, y: HOME.y, owner: 'us', seat: true }];
  for (const r of realms) {
    const kind = FROM_TERRAIN[r.terrain][0];
    regions.push({ id: world.nextId++, name: `แดนหลวง${r.name}`, kind, x: r.x, y: r.y, owner: r.id, seat: true });
  }
  // The open country: a loose grid of centres, nudged, kept clear of the seats.
  for (const gy of [4, 12, 20])
    for (const gx of [4, 11, 17, 24, 30, 36]) {
      const x = clamp(gx + int(rng, -2, 2), 2, MAP_W - 3);
      const y = clamp(gy + int(rng, -2, 2), 2, MAP_H - 3);
      if (regions.some((o) => Math.hypot(x - o.x, (y - o.y) * STRETCH) < 5)) continue;
      const near = realms.map((r) => ({ r, d: Math.hypot(x - r.x, (y - r.y) * STRETCH) })).sort((a, b) => a.d - b.d)[0];
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      const kind: LandKind = near && near.d < 10 ? pick(rng, FROM_TERRAIN[near.r.terrain]) : edge <= 3 && next(rng) < 0.5 ? 'shore' : pick(rng, ['plain', 'plain', 'hills', 'woods'] as const);
      regions.push({ id: world.nextId++, name: name(kind), kind, x, y });
    }
  world.regions = regions;
  seedLairs(world, rng);
  // Each seat starts with the nearest open region beside it, worked a little.
  for (const seat of regions.filter((r) => r.seat)) {
    const n = neighbours(world, seat)
      .filter((o) => o.owner === undefined)
      .sort((a, b) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(b.x - seat.x, b.y - seat.y))[0];
    if (!n) continue;
    n.owner = seat.owner;
    n.danger = undefined;
    n.dev = { [best(n)]: 1 };
  }
}

export function ensureRegions(world: WorldState): void {
  if (!world.regions?.length && world.realms?.length) createRegions(world);
  if (world.regions?.length && !world.lairsSeeded) seedLairs(world, createRng(world.seed ^ 0x1a12));
}

// Monsters den in some of the open country, the wilder kinds of land most of all.
function seedLairs(world: WorldState, rng: Rng): void {
  world.lairsSeeded = true;
  const odds: Record<LandKind, number> = { plain: 0.3, shore: 0.25, hills: 0.45, woods: 0.55, dunes: 0.4, peaks: 0.6 };
  for (const r of world.regions ?? []) if (r.owner === undefined && !r.village && chance(rng, odds[r.kind])) r.danger = int(rng, 30, 80);
}
export const LAIR_TH = (r: Region) => ({ plain: 'ฝูงหมาป่า', shore: 'รังโจรสลัด', hills: 'รังก็อบลิน', woods: 'ถ้ำหมาป่ายักษ์', dunes: 'รังแมงป่องยักษ์', peaks: 'รังโทรลล์' })[r.kind];

// ---------- the yearly round ----------

const realmOf = (world: WorldState, id: Region['owner']) => (typeof id === 'number' ? world.realms?.find((r) => r.id === id) : undefined);

// Monthly: every region yields to its owner; then the treasuries settle, build and bargain.
export function landsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== LAND_DAY || !world.regions) return;
  const m = ensureMarket(world);
  const held = !occupied(world); // under the demon lord the governor takes the harvest
  for (const r of world.regions) {
    if (r.seat || r.owner === undefined) continue;
    const y = yieldOf(r);
    if (isOurs(r)) {
      if (!held) continue;
      // What its hands bring in, less what the headman keeps for the village.
      const k = labour(world, r);
      const send = k * (1 - keepOf(world, r));
      m.stock.grain += Math.round(y.grain * send);
      m.stock.meat += Math.round(y.meat * send);
      m.stock.wool += Math.round(y.wool * send);
      m.stock.timber += Math.round(y.timber * send);
      m.stock.ore += Math.round(y.ore * send);
      world.treasury += Math.round(y.gold * send * priceLevel(world));
      if (r.village) r.village.purse += Math.round((y.gold + (y.grain + y.meat * 3) / 4) * (k - send));
    } else if (r.village?.free) {
      continue; // a free village keeps what it grows
    } else {
      const realm = realmOf(world, r.owner);
      if (realm && !realm.fallen) realm.gold += y.gold + Math.round((y.grain + y.meat * 3 + y.timber * 2 + y.ore * 3) / 4); // a neighbour's harvest sells at home
    }
  }
  if (held) ourCrown(world, rng);
  for (const realm of world.realms ?? []) if (!realm.fallen && !realm.war) theirCrown(world, realm, rng);
}

// How much the market is crying out for what a use makes: a dear good draws the crown's investment.
const OUTPUT: Record<LandUse, Good> = { farm: 'grain', pasture: 'meat', mine: 'ore', lumber: 'timber', fishery: 'meat' };
const dearness = (world: WorldState, u: LandUse) => Math.round(Math.max(0, priceRatio(world, OUTPUT[u]) - 1) * 80);

// Our treasury: work the land it holds, then reach for more.
function ourCrown(world: WorldState, rng: Rng): void {
  const lands = ourLands(world).filter((r) => !r.seat);
  const open = frontier(world, 'us').filter((r) => !r.seat);
  // A lair on our border: the crown puts a price on it, so the settlers can follow.
  const den = open.filter(lairOf).sort((a, b) => a.danger! - b.danger!)[0];
  if (den && !landQuestOpen(world, den.id)) {
    const reward = 40 + Math.round(den.danger! * 0.8);
    if (world.treasury - reward >= RESERVE / 2) {
      world.treasury -= reward;
      postLandQuest(world, den.id, true, `กวาดล้าง${LAIR_TH(den)}ใน${den.name}`, reward, 25 + den.danger!, true);
    }
  }
  // Open country first, while there is any: the neighbours are settling it too. Settlers go
  // with the first family the town can spare.
  const wild = open.filter(isWild);
  const settle = SETTLE_COST + 120 * lands.length;
  const keen = decreeActive(world, 'colonize') ? 1 : decreeActive(world, 'expand') ? 0.8 : 0.35; // the crown's decrees drive it on
  if (wild.length && world.treasury - settle >= RESERVE && canSend(world) && chance(rng, keen)) {
    const r = pick(rng, wild);
    world.treasury -= settle;
    take(world, r, 'us', 'settle');
    if (!r.dev || !Object.keys(r.dev).length) r.dev = { [best(r)]: 1 }; // the settlers break the first ground themselves
    log(world, 'politics', `ทางการส่งชาวบ้านไปบุกเบิก${r.name} (${LAND_TH[r.kind]}) จ่าย ${settle} ทอง ดินแดนของเรากว้างขึ้น`);
    sendFamily(world, r, rng);
    return;
  }
  // Build up the cheapest use first; the best use of each land wins a tie.
  const jobs = lands.flatMap((r) => USES[r.kind].filter((u) => levelOf(r, u) < MAX_LEVEL).map((u) => ({ r, u, cost: devCost(r, u) - (u === best(r) ? 1 : 0) - dearness(world, u) })));
  jobs.sort((a, b) => a.cost - b.cost);
  const job = jobs[0];
  if (job && world.treasury - job.cost >= RESERVE + 400) {
    world.treasury -= devCost(job.r, job.u);
    (job.r.dev ??= {})[job.u] = levelOf(job.r, job.u) + 1;
    log(world, 'world', `ทางการลงทุนสร้าง${USE_TH[job.u]}ที่${job.r.name} (ระดับ ${levelOf(job.r, job.u)})`);
    return;
  }
  // A neighbour's land: bought from one short of gold, or ceded by a close friend.
  for (const r of open) {
    const realm = realmOf(world, r.owner);
    if (!realm || realm.fallen || realm.war) continue;
    const friend = realm.pact || realm.relation >= 50;
    const price = Math.round(priceOf(r) * (friend ? 0.5 : realm.ruler.traits.includes('greedy') ? 1.3 : 1));
    if (realm.relation < 0 || world.treasury - price < RESERVE) continue;
    const needy = realm.gold < 350;
    if (needy && chance(rng, 0.3)) {
      world.treasury -= price;
      realm.gold += price;
      take(world, r, 'us', 'buy', rng);
      log(world, 'trade', `${realm.name}ซึ่งท้องพระคลังร่อยหรอ ยอมขาย${r.name}ให้เรา ${price} ทอง`);
      return;
    }
    if (friend && landsOf(world, realm) > 2 && chance(rng, 0.015)) {
      world.treasury -= price;
      realm.gold += price;
      realm.relation = clamp(realm.relation - 8, -100, 100);
      take(world, r, 'us', 'cede', rng);
      log(world, 'politics', `ทูตของเราเจรจากับ${realm.ruler.name}แห่ง${realm.name}สำเร็จ ได้${r.name}มาด้วยค่าตอบแทนมิตรภาพ ${price} ทอง`);
      return;
    }
  }
}

// A neighbour's treasury: settle open country near home, work its lands, and buy ours when we are broke.
function theirCrown(world: WorldState, realm: Realm, rng: Rng): void {
  const mine = (world.regions ?? []).filter((r) => r.owner === realm.id && !r.seat);
  // A neighbour's soldiers cut back the lairs on its border, at some cost in men.
  for (const den of frontier(world, realm.id).filter(lairOf)) {
    if (!chance(rng, 0.25)) continue;
    den.danger = Math.max(0, den.danger! - Math.round(realm.army * 0.4));
    realm.army = Math.max(5, realm.army - 1);
    if (!den.danger) log(world, 'world', `กองทัพ${realm.name}กวาดล้าง${LAIR_TH(den)}ใน${den.name}`);
    break;
  }
  const wild = frontier(world, realm.id).filter(isWild);
  const settle = SETTLE_COST + 120 * mine.length;
  if (wild.length && realm.gold >= settle + 200 && chance(rng, 0.12)) {
    const r = pick(rng, wild);
    realm.gold -= settle;
    take(world, r, realm.id, 'settle');
    log(world, 'world', `${realm.name}ส่งผู้คนไปตั้งถิ่นฐานที่${r.name}`);
    return;
  }
  const r = mine.find((x) => levelOf(x, best(x)) < MAX_LEVEL);
  if (r && realm.gold >= devCost(r, best(r)) + 300 && chance(rng, 0.25)) {
    realm.gold -= devCost(r, best(r));
    (r.dev ??= {})[best(r)] = levelOf(r, best(r)) + 1;
    return;
  }
  // We sell a border land when the treasury is empty and the buyer is not hostile.
  if (world.treasury < 60 && realm.relation >= 0 && realm.gold > 600 && chance(rng, 0.2)) {
    const ours = ourLands(world).filter((x) => !x.seat && touches(world, x, realm.id)).sort((a, b) => priceOf(a) - priceOf(b))[0];
    if (!ours) return;
    const price = priceOf(ours);
    realm.gold -= price;
    world.treasury += price;
    take(world, ours, realm.id, 'buy');
    log(world, 'trade', `ท้องพระคลังของเราว่างเปล่า จำต้องขาย${ours.name}ให้${realm.name} ได้ ${price} ทอง`);
  }
}

// Open country nobody has settled: a free village is not for the taking, nor a monster's den.
const isWild = (r: Region) => r.owner === undefined && !r.village?.free && !r.danger;
const lairOf = (r: Region) => r.owner === undefined && !r.village?.free && (r.danger ?? 0) > 0;

function take(world: WorldState, r: Region, owner: Region['owner'], how: 'settle' | 'buy' | 'cede' | 'war', rng?: Rng): void {
  r.owner = owner;
  r.since = world.day;
  changeHands(world, r, how, rng);
}

// The spoils of war: the winner takes one border land from the loser (the best-worked one);
// its works are half ruined in the fighting.
// A village behind its palisade is taken last.
export function conquer(world: WorldState, from: Realm | 'us', to: Realm | 'us', rng?: Rng): Region | undefined {
  const fromId = from === 'us' ? 'us' : from.id;
  const toId = to === 'us' ? 'us' : to.id;
  const r = (world.regions ?? [])
    .filter((x) => x.owner === fromId && !x.seat && touches(world, x, toId))
    .sort((a, b) => walled(a) - walled(b) || priceOf(b) - priceOf(a))[0];
  if (!r) return undefined;
  take(world, r, toId, 'war', rng ?? createRng(world.seed + world.day)); // the locals of a land taken in war
  for (const u of Object.keys(r.dev ?? {}) as LandUse[]) r.dev![u] = Math.floor(levelOf(r, u) / 2);
  return r;
}

const walled = (r: Region) => (r.village?.works?.includes('palisade') ? 1 : 0);

// Each land's edge for whoever holds it.
export const peaksHeld = (world: WorldState) => ourLands(world).filter((r) => r.kind === 'peaks').length;
export const shoresHeld = (world: WorldState) => ourLands(world).filter((r) => r.kind === 'shore').length;
export const woodsHeld = (world: WorldState) => ourLands(world).filter((r) => r.kind === 'woods').length;
export const landsOf = (world: WorldState, realm: Realm) => (world.regions ?? []).filter((r) => r.owner === realm.id).length;
