// What the fields grow and how the land holds up. Each family's field grows grain unless its
// farmers turn it to a cash crop while bread is cheap: flax for the weavers, vines for wine, herbs
// for the mages' potions. The soil tires under the same crop year after year, recovers under a
// change of crop or a year left fallow, and the farmers rest a worn-out field when the town can
// spare it. Pests fall on one field or another in summer. The herders lean their flock to sheep
// when wool pays and to cattle when meat does. And the country the town stands on gives its own:
// fish off a shore, stone and ore from hills, herbs from deep woods, an easy harvest on a plain.
import { chance, int, pick, type Rng } from './rng';
import { log } from './core';
import { ensureMarket, priceRatio, sell } from './market';
import { homeKind } from './terrain';
import { fieldsWanted } from './landplan';
import type { Crop, Good, Npc, Parcel, WorldState } from './types';

export const CROPS: Record<Crop, { th: string; good: Good | undefined; per: number }> = {
  grain: { th: 'ข้าว', good: 'grain', per: 1 },
  flax: { th: 'ป่าน', good: 'cloth', per: 0.25 },
  vines: { th: 'องุ่น', good: 'wine', per: 0.25 },
  herbs: { th: 'สมุนไพร', good: 'herb', per: 0.4 },
  fallow: { th: 'พักดิน', good: undefined, per: 0 },
};
const SOW_DAY = 5; // day of the year the farmers choose what to sow
const SOIL_DAY = 300; // after the harvest, the soil is reckoned
const CASH_SHARE = 1 / 3; // of the fields at most that may grow something other than grain
const TIRE = 0.08; // the soil lost to a second year of the same crop
const MEND = 0.05; // regained by a change of crop
const REST = 0.25; // regained by a fallow year
const PEST_DAY = 12; // day of the month a pest may fall on a field, in summer
const PEST_ODDS = 0.12;
const PEST_DAYS = 90;
const FLOCK_DAY = 24; // day of the month the herders weigh sheep against cattle

const fieldsOf = (world: WorldState) => (world.parcels ?? []).filter((p) => p.kind === 'field');
export const cropOf = (p: Parcel): Crop => p.crop ?? 'grain';
export const soilOf = (p: Parcel) => p.soil ?? 1;
export const ownField = (world: WorldState, n: Npc) => fieldsOf(world).find((p) => p.ownerId === n.id);
const pested = (world: WorldState, p: Parcel) => (p.pest ?? 0) > world.day;

// What the cash crops fetch against bread: the dearer grain, the less anyone dares turn from it.
function bestCrop(world: WorldState): Crop {
  const grain = priceRatio(world, 'grain');
  if (grain >= 0.9) return 'grain';
  const pays = (c: Crop) => priceRatio(world, CROPS[c].good!) * (c === 'herbs' && homeKind(world.seed) === 'woods' ? 1.2 : 1);
  const best = (['flax', 'vines', 'herbs'] as Crop[]).sort((a, b) => pays(b) - pays(a))[0];
  return pays(best) > 1.1 ? best : 'grain';
}

// Daily, mostly idle: the sowing in spring, the reckoning of the soil after the harvest, a pest
// now and then, and the herders' choice of beasts.
export function farmsDay(world: WorldState, rng: Rng): void {
  const fields = fieldsOf(world);
  const doy = world.day % 365;
  if (doy === SOW_DAY && fields.length) sow(world, fields);
  if (doy === SOIL_DAY) for (const p of fields) reckonSoil(p);
  const summer = doy >= 91 && doy < 182;
  if (summer && world.day % 30 === PEST_DAY && fields.length && chance(rng, PEST_ODDS * Math.min(3, fields.length / 3))) {
    const p = pick(rng, fields.filter((f) => cropOf(f) !== 'fallow' && !pested(world, f)).concat([]));
    if (p) {
      p.pest = world.day + PEST_DAYS;
      const owner = world.npcs.find((n) => n.id === p.ownerId && n.alive);
      log(world, 'world', `${cropOf(p) === 'vines' ? 'ราน้ำค้างขึ้นไร่องุ่น' : cropOf(p) === 'grain' ? 'เพลี้ยลงนาข้าว' : 'หนอนกินไร่' + CROPS[cropOf(p)].th}${owner ? `ของ${owner.name}` : ''} ผลผลิตแปลงนั้นหายไปครึ่งหนึ่งในฤดูนี้`, owner?.id, 'minor');
    }
  }
  if (world.day % 30 === FLOCK_DAY) leanFlock(world);
  specialities(world, rng);
}

// Spring: worn-out fields rest if the town can spare them; the rest are sown with grain or, while
// bread is cheap, a cash crop on up to a third of them.
function sow(world: WorldState, fields: Parcel[]): void {
  let spare = fields.length - fieldsWanted(world);
  for (const p of [...fields].sort((a, b) => soilOf(a) - soilOf(b))) {
    if (soilOf(p) < 0.7 && spare > 0) {
      p.crop = 'fallow';
      spare--;
    } else if (cropOf(p) === 'fallow') p.crop = 'grain';
  }
  const cash = bestCrop(world);
  const sown = fields.filter((p) => cropOf(p) !== 'fallow');
  const cashNow = sown.filter((p) => cropOf(p) !== 'grain');
  if (cash === 'grain') for (const p of cashNow) p.crop = 'grain'; // bread is dear: everyone back to grain
  else {
    // The owned fields whose soil is tiredest of grain turn first.
    const room = Math.floor(sown.length * CASH_SHARE) - cashNow.length;
    for (const p of sown.filter((f) => cropOf(f) === 'grain' && f.ownerId !== undefined).sort((a, b) => soilOf(a) - soilOf(b)).slice(0, Math.max(0, room))) {
      p.crop = cash;
      const owner = world.npcs.find((n) => n.id === p.ownerId && n.alive);
      if (owner) log(world, 'world', `${owner.name}หันมาปลูก${CROPS[cash].th}แทนข้าว เพราะขายได้ราคาดีกว่า`, owner.id, 'minor');
    }
  }
  world.buildRev = (world.buildRev ?? 0) + 1;
}

function reckonSoil(p: Parcel): void {
  const crop = cropOf(p);
  const was = p.last ?? crop;
  const soil = soilOf(p) + (crop === 'fallow' ? REST : crop === was ? -TIRE : MEND);
  p.soil = Math.round(Math.max(0.5, Math.min(1.2, soil)) * 100) / 100;
  p.last = crop;
}

// What a farmer's day in the field brings in, by the crop on their own field (market.ts harvest).
// Returns the good and how much of it, from the day's grain-equivalent yield.
export function cropYield(world: WorldState, n: Npc, y: number): { good: Good; n: number } {
  const p = ownField(world, n);
  if (!p || cropOf(p) === 'fallow') return { good: 'grain', n: y }; // working a neighbour's field, or the commons
  const c = CROPS[cropOf(p)];
  const more = soilOf(p) * (pested(world, p) ? 0.5 : 1);
  return { good: c.good!, n: y * c.per * more };
}

// Sheep or cattle: the herders lean the flock toward whichever pays, a little each month.
export const sheepOf = (world: WorldState) => world.sheep ?? 0.4;
function leanFlock(world: WorldState): void {
  const wool = priceRatio(world, 'wool');
  const meat = priceRatio(world, 'meat');
  const s = sheepOf(world) + (wool > meat * 1.15 ? 0.05 : meat > wool * 1.15 ? -0.05 : 0);
  world.sheep = Math.round(Math.max(0.15, Math.min(0.75, s)) * 100) / 100;
}

// What the country gives on its own.
function specialities(world: WorldState, rng: Rng): void {
  const kind = homeKind(world.seed);
  if (kind === 'shore') {
    // Hunters and herders with a free day cast nets off the shore.
    for (const n of world.npcs)
      if (n.alive && n.age >= 16 && n.inside === undefined && (n.job === 'hunter' || n.job === 'herder') && chance(rng, 0.04)) sell(world, n, 'meat', int(rng, 1, 2), rng);
  } else if (kind === 'hills' && world.day % 30 === 3) {
    // Outcrops quarried for stone and a little iron.
    const m = ensureMarket(world);
    m.stock.ore += 2;
  }
}
// A plain's deep soil and easy ploughing.
export const plainBonus = (world: WorldState) => (homeKind(world.seed) === 'plain' ? 1.05 : 1);
