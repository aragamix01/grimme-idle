// The steam age's mills. Once the scholars find steam, the town's trade houses (and the crown)
// put up mills on the pasture plots south of the walls: a weaving mill turns wool into cloth by
// the bolt, a steelworks makes steel of ore and coal, an engine works builds arcane engines of
// steel and mana crystal (the town's mages bind the crystals), a cannery puts meat, or grain in a
// glut, into tins that keep through a famine. Each mill hires hands out of the trades that can
// spare them, burns coal (or, short of it, crystal in a mage-wrought furnace), buys its inputs at
// the market and sells what it makes there, pays its hands and keeps the rest for its owner.
// Engines go out to the farms, where a field worked with one yields more until it wears out.
// Coal and crystal come from our mines out on the lands, and from the dungeons' depths.
import { chance, type Rng } from './rng';
import { clamp, headline, known, log, occupied } from './core';
import { ensureMarket, levelOf, target } from './market';
import { payrollReserve } from './society';
import { houses } from './tradehouses';
import { labour, keepOf } from './villages';
import { isOurs, levelOf as devLevel } from './lands';
import { jailed } from './justice';
import { MILL_PLOTS, millDoor } from './town';
import type { Good, Mill, MillKind, Npc, WorldState } from './types';

const MILL_DAY = 18; // day of the month the mills settle up
const HANDS = 5; // the most hands one mill employs
const HIRE = 2; // hands a mill takes on in a month
const WAGE = 10; // gold a hand is paid a month (a fixed coin wage: prices outrun it)
const BUILD_DAYS = 60;
const PER_KIND = 2; // mills of one kind the town supports
const COMPANY_KEEPS = 150; // gold a house keeps aside beyond what a mill costs
const CRYSTAL_FUEL = 3; // coal a crystal stands in for in a mage-wrought furnace
const WEAR = 0.05; // of the engines at work on the farms that break down each month
const FARMS_PER_ENGINE = 3;
const MAGE_BONUS = 0.5; // engines a binding mage adds to an engine works' month
const DIG_PER_LEVEL = { coal: 3, crystal: 1 }; // a mine's monthly yield per level of its development

export interface MillDef {
  name: string;
  cost: number; // gold at the founding price level
  input: Partial<Record<Good, number>>; // per hand-month
  output: Good;
  makes: number; // per hand-month
  fuel: number; // coal per hand-month on top of its inputs
  text: string;
}
export const MILLS: Record<MillKind, MillDef> = {
  textile: { name: 'โรงทอผ้า', cost: 500, input: { wool: 4 }, output: 'cloth', makes: 5, fuel: 1, text: 'ทอผ้าจากขนแกะด้วยกี่จักรไอน้ำ' },
  steel: { name: 'โรงถลุงเหล็ก', cost: 700, input: { ore: 3, coal: 3 }, output: 'steel', makes: 3, fuel: 0, text: 'หลอมแร่เหล็กกับถ่านหินเป็นเหล็กกล้า' },
  engines: { name: 'โรงจักรกลเวท', cost: 900, input: { steel: 3, crystal: 1 }, output: 'engine', makes: 1, fuel: 1, text: 'ประกอบเครื่องจักรเวทจากเหล็กกล้าและผลึกมานา จอมเวทในเมืองช่วยผนึกพลัง' },
  cannery: { name: 'โรงงานอาหารกระป๋อง', cost: 500, input: { meat: 4 }, output: 'tins', makes: 6, fuel: 1, text: 'บรรจุเนื้อ (หรือข้าวที่ล้นยุ้ง) ลงกระป๋อง เก็บได้นานจนถึงยามอดอยาก' },
};
export const MILL_ORDER = Object.keys(MILLS) as MillKind[];

export const millsOf = (world: WorldState) => world.mills ?? [];
export const handsOf = (world: WorldState, mill: Mill) => world.npcs.filter((n) => n.alive && n.millId === mill.id && n.job === 'worker');
export const ownerName = (world: WorldState, mill: Mill) => (mill.owner === 'crown' ? 'ราชสำนัก' : (world.guilds.find((g) => g.id === mill.owner)?.name ?? 'เจ้าของเดิม'));
export const millSpot = (world: WorldState, n: Npc) => {
  const mill = millsOf(world).find((m) => m.id === n.millId);
  return mill ? millDoor(mill.plot) : undefined;
};
const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);

// Once a day: on the mills' day, everything they do in a month.
export function industryDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== MILL_DAY || !known(world, 'steam') || occupied(world)) return;
  dig(world);
  for (const mill of millsOf(world)) settleOwner(world, mill);
  orphanedHands(world);
  found(world);
  for (const mill of millsOf(world)) {
    if (world.day < mill.ready) continue;
    hire(world, mill, rng);
    work(world, mill);
  }
  mechanise(world);
}

// Coal and crystal from our mines out on the lands, and crystal the adventurers bring up from the dungeons.
function dig(world: WorldState): void {
  const m = ensureMarket(world);
  for (const r of world.regions ?? []) {
    if (!isOurs(r) || r.seat) continue;
    const l = devLevel(r, 'mine');
    if (!l) continue;
    const send = labour(world, r) * (1 - keepOf(world, r));
    if (r.kind === 'hills' || r.kind === 'peaks') m.stock.coal += Math.round(l * DIG_PER_LEVEL.coal * send);
    if (r.kind === 'peaks' || r.kind === 'dunes') m.stock.crystal += Math.round(l * DIG_PER_LEVEL.crystal * send);
  }
  const delvers = adults(world).filter((n) => n.job === 'swordsman' || n.job === 'mage').length;
  m.stock.crystal += Math.floor(delvers / 6);
}

// A house that has gone (merged, bankrupt, banned) leaves its mills to the crown.
function settleOwner(world: WorldState, mill: Mill): void {
  if (mill.owner !== 'crown' && !world.guilds.some((g) => g.id === mill.owner)) mill.owner = 'crown';
}

const fundsOf = (world: WorldState, owner: Mill['owner']) =>
  owner === 'crown' ? Math.max(0, world.treasury - payrollReserve(world)) : Math.max(0, world.guilds.find((g) => g.id === owner)?.treasury ?? 0);
function pay(world: WorldState, owner: Mill['owner'], gold: number): void {
  if (owner === 'crown') world.treasury -= gold;
  else {
    const g = world.guilds.find((x) => x.id === owner);
    if (g) g.treasury -= gold;
  }
}

// What a mill of a kind would make in a month on today's prices, per hand: the case for building one.
function margin(world: WorldState, kind: MillKind): number {
  const m = ensureMarket(world);
  const d = MILLS[kind];
  const cost = Object.entries(d.input).reduce((s, [g, n]) => s + m.price[g as Good] * n, 0) + m.price.coal * d.fuel;
  const short = Object.entries(d.input).some(([g, n]) => m.stock[g as Good] < n * 2);
  return short ? -Infinity : m.price[d.output] * d.makes * 0.8 - cost - WAGE;
}

// A house with money to spare, or the crown, puts up the mill the market is crying out for.
export function found(world: WorldState, owner?: Mill['owner'], forced?: MillKind): Mill | undefined {
  const plot = MILL_PLOTS.findIndex((_, i) => !millsOf(world).some((m) => m.plot === i));
  if (plot < 0) return undefined;
  const lvl = levelOf(world);
  const open = MILL_ORDER.filter((k) => millsOf(world).filter((m) => m.kind === k).length < PER_KIND);
  const kind = forced ?? open.sort((a, b) => margin(world, b) - margin(world, a)).find((k) => margin(world, k) > 0);
  if (!kind) return undefined;
  const price = Math.round(MILLS[kind].cost * lvl);
  let builder: Mill['owner'] | undefined = owner;
  if (builder === undefined) {
    const rich = houses(world).filter((g) => g.treasury >= price + COMPANY_KEEPS * lvl).sort((a, b) => b.treasury - a.treasury)[0];
    if (rich) builder = rich.id;
    else if (fundsOf(world, 'crown') >= price * (kind === 'cannery' || !millsOf(world).length ? 2 : 4)) builder = 'crown'; // the crown starts the town off and puts up a cannery against famine; a rich crown with no merchant prince builds the rest
  }
  if (builder === undefined || (!forced && fundsOf(world, builder) < price)) return undefined;
  pay(world, builder, forced ? Math.min(price, fundsOf(world, builder)) : price);
  const mill: Mill = { id: world.nextId++, kind, name: MILLS[kind].name, plot, owner: builder, since: world.day, ready: world.day + BUILD_DAYS };
  (world.mills ??= []).push(mill);
  const text = `${ownerName(world, mill)}ลงทุนสร้าง${mill.name}ที่ทุ่งใต้กำแพงเมือง (${price} ทอง) ${MILLS[kind].text}`;
  if (millsOf(world).length === 1) headline(world, 'trade', `ปล่องควันแรกของเมือง! ${text}`);
  else log(world, 'trade', text);
  return mill;
}

// Hands come from the trades that can spare them: never a farm the town still needs.
const SPARE: Partial<Record<Npc['job'], number>> = { farmer: 0, herder: 2, hunter: 1, thief: 0, merchant: 3, builder: 2, blacksmith: 1 };
const FARM_SHARE = 0.3; // farmers kept as a share of the grown-ups before any leaves for the mills
function hire(world: WorldState, mill: Mill, rng: Rng): void {
  const have = handsOf(world, mill).length;
  if (have >= HANDS) return;
  const grown = adults(world);
  const count = (job: Npc['job']) => grown.filter((n) => n.job === job).length;
  const spare = (job: Npc['job']) => (job === 'farmer' ? count('farmer') > grown.length * FARM_SHARE + 1 : count(job) > (SPARE[job] ?? Infinity));
  const pool = grown
    .filter((n) => n.age <= 55 && SPARE[n.job] !== undefined && n.questId === undefined && n.guildId === undefined && !jailed(world, n) && n.partyId === undefined && n.millId === undefined)
    .sort((a, b) => a.gold - b.gold);
  let taken = 0;
  for (const n of pool) {
    if (taken >= Math.min(HIRE, HANDS - have)) break;
    if (!spare(n.job) || !chance(rng, 0.6)) continue;
    n.job = 'worker';
    n.millId = mill.id;
    n.plan = undefined;
    n.trip = undefined;
    taken++;
  }
}

// A month at the mill: as many hands as there are inputs, fuel and money for.
function work(world: WorldState, mill: Mill): void {
  const m = ensureMarket(world);
  const d = MILLS[mill.kind];
  const hands = handsOf(world, mill);
  // Wages first: a mill that can't pay loses its hands back to the fields.
  const wages = hands.length * WAGE;
  if (fundsOf(world, mill.owner) < wages) {
    for (const n of hands) quit(n);
    mill.made = 0;
    log(world, 'trade', `${mill.name}ของ${ownerName(world, mill)}จ่ายค่าแรงไม่ไหว คนงานกลับไปทำนา`);
    return;
  }
  pay(world, mill.owner, wages);
  for (const n of hands) n.gold += WAGE;
  // A cannery in a grain glut tins grain instead of meat.
  const glutGrain = mill.kind === 'cannery' && m.stock.grain > target(world, 'grain') * 2;
  const input: Partial<Record<Good, number>> = glutGrain ? { grain: 8 } : d.input;
  const makes = glutGrain ? 4 : d.makes;
  let runs = 0;
  for (let i = 0; i < hands.length; i++) {
    if (m.stock[d.output] >= target(world, d.output) * 3) break; // the shelves are full
    const cost = Object.entries(input).reduce((s, [g, n]) => s + m.price[g as Good] * n, 0);
    if (Object.entries(input).some(([g, n]) => m.stock[g as Good] < n) || fundsOf(world, mill.owner) < cost) break;
    // Coal for the boilers, or a crystal in a mage-wrought furnace when the coal runs out.
    if (d.fuel) {
      if (m.stock.coal >= d.fuel) m.stock.coal -= d.fuel;
      else if (m.stock.crystal * CRYSTAL_FUEL >= d.fuel) m.stock.crystal -= Math.ceil(d.fuel / CRYSTAL_FUEL);
      else break;
    }
    for (const [g, n] of Object.entries(input) as [Good, number][]) m.stock[g] -= n;
    pay(world, mill.owner, cost);
    m.till += cost;
    runs++;
  }
  let made = runs * makes;
  if (mill.kind === 'engines' && runs) made += Math.floor(Math.min(3, adults(world).filter((n) => n.job === 'mage').length) * MAGE_BONUS);
  if (!made) {
    mill.made = 0;
    return;
  }
  // The market takes what it can pay for; the rest still goes on the shelves.
  m.stock[d.output] += made;
  const value = Math.min(Math.floor(m.till), Math.round(made * m.price[d.output] * 0.8));
  m.till -= value;
  pay(world, mill.owner, -value);
  mill.made = made;
}

function quit(n: Npc): void {
  n.job = 'farmer';
  n.millId = undefined;
  n.plan = undefined;
}

// A worker whose mill is gone goes back to the fields.
export function orphanedHands(world: WorldState): void {
  const ids = new Set(millsOf(world).map((m) => m.id));
  for (const n of world.npcs) if (n.alive && n.millId !== undefined && !ids.has(n.millId)) quit(n);
}

// Engines go out to the farms: the better-off farmers buy one each while the farms want them.
function mechanise(world: WorldState): void {
  const m = ensureMarket(world);
  const farmers = adults(world).filter((n) => n.job === 'farmer');
  const want = Math.ceil(farmers.length / FARMS_PER_ENGINE);
  let have = (world.machinery ?? 0) * (1 - WEAR);
  for (const f of farmers.sort((a, b) => b.gold - a.gold)) {
    if (have >= want || m.stock.engine < 1 || f.gold < m.price.engine) break;
    f.gold -= m.price.engine;
    m.till += m.price.engine;
    m.stock.engine -= 1;
    have += 1;
  }
  world.machinery = have;
  world.mech = want ? clamp(have / want, 0, 1) : 0;
}

export const millKindTh = (k: MillKind) => MILLS[k].name;
