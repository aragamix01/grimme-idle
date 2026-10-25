// The town market at the shop. Farmers sell grain, adventurers sell what they drag
// out of the dungeons, merchants turn that loot into gear, and everyone eats.
// Prices follow stock: scarce goods get dear, gluts go cheap, and the chronicle
// notices when it gets extreme.
import { chance, int, type Rng } from './rng';
import { log } from './core';
import { JOB_TH } from './names';
import type { Good, Market, Npc, WorldState } from './types';

export const GOODS: readonly Good[] = ['grain', 'loot', 'gear'];
export const GOOD_TH: Record<Good, string> = { grain: 'ข้าว', loot: 'ของจากดันเจี้ยน', gear: 'อาวุธและชุดเกราะ' };
const BASE: Record<Good, number> = { grain: 2, loot: 8, gear: 25 };
const TARGET: Record<Good, number> = { grain: 300, loot: 4, gear: 5 }; // grain: enough to carry the town through winter // stock that sells at the base price

const MEAL_EVERY = 10; // days between each resident's sack of grain
const LEAVE_HUNGER = 8; // missed meals before someone may give up on the town
const TAX = 0.1; // of every purchase, to the crown
const TITHE_EVERY = 30; // days between church collections
const TITHE_FLOOR = 60; // gold anyone may keep untouched
const TITHE = 0.1; // of savings above the floor; the kind give twice as much
const SPOIL = 0.001; // share of the grain store lost to rats each day
const CARAVAN_EVERY = 7; // days between caravans to and from other towns
const IMPORT_GAP = 60; // days a shortage must wait between grain imports
const HISTORY_EVERY = 5; // days between price samples
const HISTORY_KEPT = 36;
export const MAX_GEAR = 3;
export const GEAR_POWER = 6; // strength per gear level

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_TH: Record<Season, string> = { spring: 'ฤดูใบไม้ผลิ', summer: 'ฤดูร้อน', autumn: 'ฤดูเก็บเกี่ยว', winter: 'ฤดูหนาว' };
const YIELD: Record<Season, number> = { spring: 0.9, summer: 1.2, autumn: 2, winter: 0.3 }; // grain per farmer per working day
export const seasonOf = (day: number): Season => SEASONS[Math.floor((day % 365) / 91.25)];

export function ensureMarket(world: WorldState): Market {
  return (world.market ??= {
    stock: { grain: 250, loot: 4, gear: 4 },
    price: { ...BASE },
    till: 60,
    history: { grain: [], loot: [], gear: [] },
    alert: { grain: 0, loot: 0, gear: 0 },
  });
}

export const priceRatio = (world: WorldState, g: Good) => ensureMarket(world).price[g] / BASE[g];

function reprice(m: Market): void {
  for (const g of GOODS) {
    const t = TARGET[g];
    const factor = Math.min(5, Math.max(0.3, (t / Math.max(m.stock[g], t * 0.05)) ** 0.7));
    m.price[g] = Math.max(1, Math.round(BASE[g] * factor));
  }
}

// Stock, as a multiple of TARGET, past which caravans ship the surplus out, and past which
// the shop stops buying at all. Grain is hoarded for winter, so it sits far longer.
const EXPORT_AT: Record<Good, number> = { grain: 3, loot: 1.5, gear: 1.5 };
const GLUT: Record<Good, number> = { grain: 4, loot: 2.5, gear: 2.5 };

// What the market pays a seller: a quarter below the shelf price (a fraction of a coin
// is paid as a chance of a whole one), and only what the till holds.
function payOut(m: Market, g: Good, n: number, rng: Rng): number {
  if (m.stock[g] >= TARGET[g] * GLUT[g]) return 0; // the shelves are full; it rots unsold
  const each = m.price[g] * 0.75;
  let owed = 0;
  for (let i = 0; i < n; i++) owed += Math.floor(each) + (chance(rng, each % 1) ? 1 : 0);
  const paid = Math.min(Math.floor(m.till), owed);
  m.till -= paid;
  m.stock[g] += n;
  return paid;
}

export function sell(world: WorldState, npc: Npc, g: Good, n: number, rng: Rng): void {
  if (n <= 0) return;
  const m = ensureMarket(world);
  const trade = world.guilds.some((x) => x.id === npc.guildId && x.kind === 'merchants');
  const paid = payOut(m, g, n, rng);
  npc.gold += trade ? Math.ceil(paid * 1.1) : paid; // the association haggles for its members
}

// Buy one unit off the shelf. False when it's sold out or the buyer can't pay.
export function buy(world: WorldState, payer: Npc, g: Good): boolean {
  const m = ensureMarket(world);
  const price = m.price[g];
  if (m.stock[g] < 1 || payer.gold < price) return false;
  payer.gold -= price;
  m.stock[g] -= 1;
  world.treasury += price * TAX;
  m.till += price * (1 - TAX);
  return true;
}

// A merchant minding the stall: forge loot into gear and draw a wage from the till.
export function tendShop(world: WorldState, npc: Npc, rng: Rng): void {
  const m = ensureMarket(world);
  if (m.stock.loot >= TARGET.loot && chance(rng, 0.25)) {
    m.stock.loot -= 2;
    m.stock.gear += 1;
  }
  const trade = world.guilds.some((x) => x.id === npc.guildId && x.kind === 'merchants');
  const wage = Math.floor(m.till * (trade ? 0.025 : 0.02));
  if (wage >= 1 && chance(rng, 0.5)) {
    m.till -= wage;
    npc.gold += wage;
  }
}

export function harvest(world: WorldState, npc: Npc, rng: Rng): void {
  const y = YIELD[seasonOf(world.day)];
  const n = Math.floor(y) + (chance(rng, y % 1) ? 1 : 0);
  sell(world, npc, 'grain', n, rng);
}

// An adventurer with spare gold picks up better gear.
export function wantsGear(world: WorldState, npc: Npc): boolean {
  const m = ensureMarket(world);
  return (npc.gear ?? 0) < MAX_GEAR && m.stock.gear >= 1 && npc.gold >= m.price.gear + 5;
}

export function buyGear(world: WorldState, npc: Npc): void {
  if ((npc.gear ?? 0) < MAX_GEAR && buy(world, npc, 'gear')) npc.gear = (npc.gear ?? 0) + 1;
}

export const gearPower = (npc: Npc) => (npc.gear ?? 0) * GEAR_POWER;

// Dents and broken blades: a lost fight may cost a gear level.
export function wearGear(npc: Npc, rng: Rng): void {
  if (npc.gear && chance(rng, 0.3)) npc.gear--;
}

export function marketDay(world: WorldState, rng: Rng): void {
  const m = ensureMarket(world);
  if (world.day % 365 === Math.round(SEASONS.indexOf('autumn') * 91.25)) log(world, 'world', 'ฤดูเก็บเกี่ยวมาถึง ทุ่งนาเหลืองอร่าม');
  if (world.day % 365 === Math.round(SEASONS.indexOf('winter') * 91.25)) log(world, 'world', 'ฤดูหนาวมาเยือน ทุ่งนาแทบไม่ให้ผล');
  m.stock.grain = Math.max(0, m.stock.grain - m.stock.grain * SPOIL);

  // Meals. Children eat from a parent's purse.
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  for (const n of world.npcs) {
    if (!n.alive || n.inside !== undefined || (world.day + n.id) % MEAL_EVERY !== 0) continue;
    const payer = n.age < 16 ? (n.parentIds ?? []).map((id) => byId.get(id)).find((p) => p?.alive && p.gold >= m.price.grain) ?? n : n;
    if (buy(world, payer, 'grain') || dole(world, m)) {
      n.hunger = 0;
      continue;
    }
    n.hunger = (n.hunger ?? 0) + 1;
    if (n.hunger >= LEAVE_HUNGER && n.age >= 16 && n.questId === undefined && chance(rng, 0.25)) leave(world, n);
  }
  if (world.day % TITHE_EVERY === 0) tithe(world);
  if (world.day % CARAVAN_EVERY === 0) {
    caravans(world, m);
    armGuilds(world, m);
  }

  reprice(m);
  if (world.day % HISTORY_EVERY === 0)
    for (const g of GOODS) {
      m.history[g].push(m.price[g]);
      if (m.history[g].length > HISTORY_KEPT) m.history[g].shift();
    }
  for (const g of GOODS) watchPrice(world, m, g);
}

// The well-off give to the church, which keeps the crown's purse (and so the dole and the
// crown's bounties) going instead of letting gold pile up in a few chests.
function tithe(world: WorldState): void {
  for (const n of world.npcs) {
    if (!n.alive || n.gold <= TITHE_FLOOR) continue;
    const gift = Math.floor((n.gold - TITHE_FLOOR) * TITHE * (n.traits.includes('kind') ? 2 : 1));
    n.gold -= gift;
    world.treasury += gift;
  }
}

// Caravans carry surplus off to other towns for cheap, which is the only way new gold
// reaches the till, and haul grain in at a steep price when the stores run low.
function caravans(world: WorldState, m: Market): void {
  for (const g of GOODS) {
    const excess = m.stock[g] - TARGET[g] * EXPORT_AT[g];
    if (excess <= 0) continue;
    const n = Math.ceil(excess * 0.3);
    m.stock[g] -= n;
    m.till += n * BASE[g] * 0.6;
  }
  const n = TARGET.grain * 0.25;
  const cost = n * BASE.grain * 1.5;
  if (m.stock.grain < TARGET.grain * 0.15 && m.till >= cost && world.day - (m.lastImport ?? -IMPORT_GAP) >= IMPORT_GAP) {
    m.till -= cost;
    m.stock.grain += n;
    m.lastImport = world.day;
    log(world, 'trade', `กองคาราวานขนข้าว ${n} กระสอบเข้าเมืองช่วยยามขาดแคลน`);
  }
}

// Adventurers' guilds spend their treasury kitting out the worst-equipped member.
function armGuilds(world: WorldState, m: Market): void {
  for (const g of world.guilds) {
    if (g.kind !== 'adventurers' || m.stock.gear < 1 || g.treasury < m.price.gear + 20) continue;
    const recruit = world.npcs
      .filter((n) => n.alive && n.guildId === g.id && (n.gear ?? 0) < MAX_GEAR)
      .sort((a, b) => (a.gear ?? 0) - (b.gear ?? 0))[0];
    if (!recruit) continue;
    g.treasury -= m.price.gear;
    m.stock.gear -= 1;
    world.treasury += m.price.gear * TAX;
    m.till += m.price.gear * (1 - TAX);
    recruit.gear = (recruit.gear ?? 0) + 1;
  }
}

// The church feeds those who can't pay, out of the crown's purse, while there's grain to buy.
function dole(world: WorldState, m: Market): boolean {
  const price = m.price.grain;
  if (m.stock.grain < 1 || world.treasury < price) return false;
  world.treasury -= price;
  m.stock.grain -= 1;
  m.till += price;
  return true;
}

// The chronicle only hears about prices when they swing hard, once per swing.
function watchPrice(world: WorldState, m: Market, g: Good): void {
  if (g === 'loot') return; // swings every few weeks; only the smiths care
  const r = m.price[g] / BASE[g];
  const was = m.alert[g];
  if (was !== 1 && r >= 2) {
    m.alert[g] = 1;
    const why = g === 'grain' && m.stock.grain < 1 ? 'ข้าวหมดตลาด! ' : '';
    log(world, 'trade', `${why}ราคา${GOOD_TH[g]}พุ่งเป็น ${m.price[g]} ทอง`);
  } else if (was !== -1 && r <= 0.5) {
    m.alert[g] = -1;
    log(world, 'trade', `${GOOD_TH[g]}ล้นตลาด ราคาตกเหลือ ${m.price[g]} ทอง`);
  } else if (was !== 0 && r > 0.75 && r < 1.4) m.alert[g] = 0;
}

function leave(world: WorldState, n: Npc): void {
  n.alive = false;
  n.left = true;
  n.plan = undefined;
  log(world, 'world', `${n.name} ทิ้งเมืองไปเพราะความหิวโหย`, n.id);
}

// When grain is dear the poor take up the plough; when it's dirt cheap farmers try trade.
export function considerTrade(world: WorldState, npc: Npc, rng: Rng): boolean {
  const r = priceRatio(world, 'grain');
  const m = ensureMarket(world);
  if ((npc.job === 'merchant' || npc.job === 'thief') && r >= 2 && npc.gold < m.price.grain * 3 && chance(rng, 0.05)) {
    log(world, 'trade', `${npc.name} เลิกเป็น${JOB_TH[npc.job]} หันมาทำนาเพราะข้าวแพง`, npc.id);
    npc.job = 'farmer';
    return true;
  }
  if (npc.job === 'farmer' && r <= 0.5 && npc.gold < 20 && chance(rng, 0.02)) {
    log(world, 'trade', `${npc.name} เลิกทำนาไปค้าขาย เพราะข้าวราคาตก`, npc.id);
    npc.job = 'merchant';
    return true;
  }
  return false;
}

// Newcomers follow the money: a famine draws farmers in.
export function arrivalJob(world: WorldState, rng: Rng): Npc['job'] | null {
  return priceRatio(world, 'grain') >= 1.8 && chance(rng, 0.5) ? 'farmer' : null;
}

export const lootFound = (rng: Rng) => int(rng, 1, 2);
