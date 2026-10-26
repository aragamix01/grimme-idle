// The town market at the shop. Farmers sell grain, adventurers sell what they drag
// out of the dungeons, merchants turn that loot into gear, and everyone eats.
// Prices follow stock: scarce goods get dear, gluts go cheap, and the chronicle
// notices when it gets extreme.
import { chance, int, type Rng } from './rng';
import { cursed, log, perkLevel } from './core';
import { weatherYield } from './divine';
import { RELIC_POWER } from './dungeons';
import { TRADE, WOOL_BUYERS, tradePartner, tripDays } from './diplomacy';
import { caravanHome } from './worldevents';
import { built } from './works';
import { JOB_TH } from './names';
import { AWAY, type Good, type Market, type Npc, type WorldState } from './types';

export const GOODS: readonly Good[] = ['grain', 'meat', 'wool', 'loot', 'gear'];
export const GOOD_TH: Record<Good, string> = { grain: 'ข้าว', meat: 'เนื้อสัตว์', wool: 'ขนแกะ', loot: 'ของจากดันเจี้ยน', gear: 'อาวุธและชุดเกราะ' };
const BASE: Record<Good, number> = { grain: 2, meat: 3, wool: 5, loot: 8, gear: 25 };
const TARGET: Record<Good, number> = { grain: 300, meat: 60, wool: 15, loot: 4, gear: 5 }; // grain: enough to carry the town through winter // stock that sells at the base price

const MEAL_EVERY = 10; // days between each resident's sack of grain
const LEAVE_HUNGER = 8; // missed meals before someone may give up on the town
const TAX = 0.1; // of every purchase, to the crown
const TITHE_EVERY = 30; // days between church collections
const TITHE_FLOOR = 60; // gold anyone may keep untouched
const TITHE = 0.1; // of savings above the floor; the kind give twice as much
const SPOIL = 0.001; // share of the grain store lost to rats each day
const MEAT_SPOIL = 0.01; // salted meat keeps, but not like grain
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
  const m = (world.market ??= {
    stock: { grain: 250, meat: 40, wool: 0, loot: 4, gear: 4 },
    price: { ...BASE },
    till: 60,
    history: { grain: [], meat: [], wool: [], loot: [], gear: [] },
    alert: { grain: 0, meat: 0, wool: 0, loot: 0, gear: 0 },
  });
  // Saves from before a good existed: its shelf starts (nearly) empty at the base price.
  for (const g of GOODS) {
    if (m.stock[g] !== undefined) continue;
    m.stock[g] = g === 'meat' ? 20 : 0;
    m.price[g] = BASE[g];
    m.history[g] = [];
    m.alert[g] = 0;
  }
  return m;
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
const EXPORT_AT: Record<Good, number> = { grain: 3, meat: 2, wool: 1, loot: 1.5, gear: 1.5 };
const GLUT: Record<Good, number> = { grain: 4, meat: 3, wool: 4, loot: 2.5, gear: 2.5 };

// What the market pays a seller: a quarter below the shelf price (a fraction of a coin
// is paid as a chance of a whole one), and only what the till holds.
function payOut(m: Market, g: Good, n: number, rng: Rng, hall = false): number {
  if (m.stock[g] >= TARGET[g] * GLUT[g]) return 0; // the shelves are full; it rots unsold
  const each = m.price[g] * (hall ? 0.85 : 0.75); // the market hall's traders bid each other up
  let owed = 0;
  for (let i = 0; i < n; i++) owed += Math.floor(each) + (chance(rng, each % 1) ? 1 : 0);
  const paid = Math.min(Math.floor(m.till), owed);
  m.till -= paid;
  m.stock[g] += n;
  return paid;
}

export function sell(world: WorldState, npc: Npc, g: Good, n: number, rng: Rng): number {
  if (n <= 0) return 0;
  const m = ensureMarket(world);
  const trade = world.guilds.some((x) => x.id === npc.guildId && x.kind === 'merchants');
  const paid = payOut(m, g, n, rng, built(world, 'market'));
  const got = trade ? Math.ceil(paid * 1.1) : paid; // the association haggles for its members
  npc.gold += got;
  return got;
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

// A merchant minding the stall draws a wage from the till.
// Without a blacksmith in town, merchants do some crude smithing themselves.
export function tendShop(world: WorldState, npc: Npc, rng: Rng, smithInTown: boolean): void {
  const m = ensureMarket(world);
  if (!smithInTown && m.stock.loot >= TARGET.loot && chance(rng, 0.25)) {
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

// Returns the gold the farmer made, so a landlord can take their cut.
export function harvest(world: WorldState, npc: Npc, rng: Rng): number {
  const y = YIELD[seasonOf(world.day)] * (1 + 0.1 * perkLevel(world, 'harvest')) * weatherYield(world);
  const n = Math.floor(y) + (chance(rng, y % 1) ? 1 : 0);
  return sell(world, npc, 'grain', n, rng);
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
// Fighting strength: levels, gear, and the god's favour or wrath.
export const might = (world: WorldState, n: Npc) => 10 + n.level * 4 + (n.blessed ? 10 : 0) - (cursed(world, n) ? 10 : 0) + gearPower(n) + (n.relic ? RELIC_POWER : 0);

// Dents and broken blades: a lost fight may cost a gear level.
export function wearGear(npc: Npc, rng: Rng): void {
  if (npc.gear && chance(rng, 0.3)) npc.gear--;
}

export function marketDay(world: WorldState, rng: Rng): void {
  const m = ensureMarket(world);
  if (world.day % 365 === Math.round(SEASONS.indexOf('autumn') * 91.25)) log(world, 'world', 'ฤดูเก็บเกี่ยวมาถึง ทุ่งนาเหลืองอร่าม');
  if (world.day % 365 === Math.round(SEASONS.indexOf('winter') * 91.25)) log(world, 'world', 'ฤดูหนาวมาเยือน ทุ่งนาแทบไม่ให้ผล');
  // The royal granary keeps the rats and the damp out.
  const granary = built(world, 'granary');
  m.stock.grain = Math.max(0, m.stock.grain - m.stock.grain * SPOIL * (granary ? 0.4 : 1));
  m.stock.meat = Math.max(0, m.stock.meat - m.stock.meat * MEAT_SPOIL * (granary ? 0.6 : 1));

  // Meals: a sack of grain or a cut of meat, whichever is cheaper today. Children eat from a parent's purse.
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  for (const n of world.npcs) {
    if (!n.alive || n.inside !== undefined || (world.day + n.id) % MEAL_EVERY !== 0) continue;
    const food = mealOf(m);
    const payer = n.age < 16 ? (n.parentIds ?? []).map((id) => byId.get(id)).find((p) => p?.alive && p.gold >= m.price[food]) ?? n : n;
    if (buy(world, payer, food) || buy(world, payer, food === 'grain' ? 'meat' : 'grain') || dole(world, m)) {
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
  const priests = world.npcs.filter((n) => n.alive && n.job === 'priest');
  let collected = 0;
  for (const n of world.npcs) {
    if (!n.alive || n.gold <= TITHE_FLOOR) continue;
    const gift = Math.floor((n.gold - TITHE_FLOOR) * TITHE * (n.traits.includes('kind') ? 2 : 1));
    n.gold -= gift;
    collected += gift;
  }
  // The priests keep a share for their living; the rest goes to the crown's purse.
  const share = priests.length ? Math.floor((collected * 0.3) / priests.length) : 0;
  for (const p of priests) p.gold += share;
  world.treasury += collected - share * priests.length;
}

// A merchant takes a caravan out the west gate to the neighbouring towns: carrying surplus to
// sell cheap (the only way new gold reaches the till) and, when the stores run low, buying
// grain at a steep price. No merchant free, no caravan.
const TRIP_DAYS = 12;
const BANDITS = 0.05; // chance a caravan is robbed on the road
export const WEST_GATE = { x: 0, y: 9 };

function caravans(world: WorldState, m: Market): void {
  // Which goods are piling up, and whether the stores need grain, decide where it heads.
  if (m.caravan) {
    const lead = world.npcs.find((n) => n.id === m.caravan!.merchantId);
    if (lead?.alive && (lead.trip !== undefined || lead.plan?.kind === 'caravan')) return; // one on the road at a time
    m.caravan = undefined; // its merchant never made it: the goods are lost
  }
  const merchant = world.npcs.find((n) => n.alive && n.job === 'merchant' && n.age >= 16 && n.questId === undefined && n.inside === undefined && n.plan?.kind !== 'caravan');
  if (!merchant) return;
  const spare = GOODS.filter((g) => m.stock[g] > TARGET[g] * EXPORT_AT[g]);
  const short = m.stock.grain < TARGET.grain * 0.15 && world.day - (m.lastImport ?? -IMPORT_GAP) >= IMPORT_GAP;
  if (!spare.length && !short) return;
  const realm = tradePartner(world, spare, short);
  if (!realm) return; // every neighbour is hostile: the roads are closed
  const trade = TRADE[realm.terrain];
  let gold = 0;
  for (const g of spare) {
    const n = Math.ceil((m.stock[g] - TARGET[g] * EXPORT_AT[g]) * 0.3);
    m.stock[g] -= n;
    const wanted = trade.wants === g || (g === 'wool' && WOOL_BUYERS.includes(realm.terrain));
    gold += n * BASE[g] * (wanted ? 0.9 : 0.6); // they pay well for what they lack
  }
  const n = TARGET.grain * 0.25;
  const cost = n * BASE.grain * (trade.sells === 'grain' ? 1.1 : 1.5);
  const buying = short && m.till >= cost;
  if (buying) {
    m.till -= cost;
    m.lastImport = world.day;
  }
  // Mountain smiths sell arms cheaply when the shop is short of them.
  const gearCost = BASE.gear * 0.8 * 3;
  const gear = trade.sells === 'gear' && m.stock.gear < TARGET.gear && m.till >= gearCost + 50 ? 3 : 0;
  if (gear) m.till -= gearCost;
  if (built(world, 'market')) gold *= 1.2; // the hall's name opens doors abroad
  if (!gold && !buying && !gear) return;
  m.caravan = { merchantId: merchant.id, grain: buying ? n : 0, gold, gear, realmId: realm.id, days: tripDays(realm) };
  merchant.plan = { kind: 'caravan', x: WEST_GATE.x, y: WEST_GATE.y, days: 0 };
  log(world, 'trade', `พ่อค้า${merchant.name}นำกองคาราวานไป${buying ? 'ซื้อข้าว' : 'ค้าขาย'}ที่${realm.name}`, merchant.id);
}

// At the west gate the caravan leaves the map.
export function departCaravan(world: WorldState, npc: Npc): void {
  npc.inside = AWAY;
  npc.trip = ensureMarket(world).caravan?.days ?? TRIP_DAYS;
  npc.plan = undefined;
}

// Days on the road; on the way home bandits may strike, otherwise the goods come in.
export function caravanDay(world: WorldState, npc: Npc, rng: Rng): void {
  if ((npc.trip = (npc.trip ?? 0) - 1) > 0) return;
  const m = ensureMarket(world);
  const c = m.caravan;
  npc.inside = undefined;
  npc.trip = undefined;
  npc.x = WEST_GATE.x;
  npc.y = WEST_GATE.y;
  npc.plan = { kind: 'haul', x: 3, y: 9, days: 0 }; // the wagon rolls up the main road to the shop
  m.caravan = undefined;
  if (!c) return;
  const realm = world.realms?.find((r) => r.id === c.realmId);
  // Roads through unfriendly country are riskier; an ally's patrols keep them safe.
  const risk = BANDITS + (realm && realm.relation < -15 ? 0.08 : 0) - (realm?.pact ? 0.03 : 0);
  if (chance(rng, risk)) {
    log(world, 'trade', `กองคาราวานของพ่อค้า${npc.name}ถูกโจรป่าปล้นระหว่างทาง สินค้าหายเกลี้ยง`, npc.id);
    return;
  }
  if (realm) {
    realm.trades = (realm.trades ?? 0) + 1;
    realm.relation = Math.min(100, realm.relation + 2); // trade warms them to us
    realm.gold += Math.round(c.gold / 2);
  }
  m.stock.grain += c.grain;
  m.stock.gear += c.gear ?? 0;
  caravanHome(world, realm, rng);
  const cut = Math.floor(c.gold * 0.15); // the merchant's share for the road
  m.till += c.gold - cut;
  npc.gold += cut;
  if (c.grain || c.gear) log(world, 'trade', `พ่อค้า${npc.name}กลับจาก${realm?.name ?? 'เมืองข้างเคียง'}${c.grain ? ` พร้อมข้าว ${c.grain} กระสอบ` : ''}${c.gear ? ` และอาวุธ ${c.gear} ชิ้น` : ''}`, npc.id);
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

// Whichever food is cheaper for what it usually costs, so both shelves empty in step.
const mealOf = (m: Market): Good => (m.stock.meat >= 1 && (m.price.meat / BASE.meat < m.price.grain / BASE.grain || m.stock.grain < 1) ? 'meat' : 'grain');

// The church feeds those who can't pay, out of the crown's purse, while there's food to buy.
function dole(world: WorldState, m: Market): boolean {
  const food = mealOf(m);
  const price = m.price[food];
  if (m.stock[food] < 1 || world.treasury < price) return false;
  world.treasury -= price;
  m.stock[food] -= 1;
  m.till += price;
  return true;
}

// The chronicle only hears about prices when they swing hard, once per swing.
function watchPrice(world: WorldState, m: Market, g: Good): void {
  if (g === 'loot' || g === 'meat' || g === 'wool') return; // swing every few weeks; grain is what the town watches
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

// When grain is dear the poor take up the plough; when it's dirt cheap farmers try trade;
// and someone with nothing left and few scruples turns thief.
export function considerTrade(world: WorldState, npc: Npc, rng: Rng): boolean {
  const r = priceRatio(world, 'grain');
  const m = ensureMarket(world);
  const count = (job: Npc['job']) => world.npcs.filter((n) => n.alive && n.job === job && n.age >= 16).length;
  const keepTwo = npc.job === 'thief' || count(npc.job) > 2; // a trade keeps its last couple of hands
  const commoner = ['farmer', 'herder', 'hunter', 'merchant', 'innkeeper', 'courtesan', 'blacksmith'].includes(npc.job);
  if (commoner && npc.gold < 5 && npc.morality < 0 && keepTwo && chance(rng, (npc.hunger ?? 0) >= 1 ? 0.08 : 0.03)) {
    log(world, 'trade', `${npc.name} หมดตัวจนต้องเลิกเป็น${JOB_TH[npc.job]} หันไปเป็นโจร`, npc.id);
    npc.job = 'thief';
    npc.guildId = undefined;
    return true;
  }
  if (['merchant', 'thief', 'innkeeper', 'courtesan'].includes(npc.job) && keepTwo && r >= 2 && npc.gold < m.price.grain * 3 && chance(rng, 0.05)) {
    log(world, 'trade', `${npc.name} เลิกเป็น${JOB_TH[npc.job]} หันมาทำนาเพราะข้าวแพง`, npc.id);
    npc.job = 'farmer';
    return true;
  }
  // Meat dear and grain cheap: a farmer may turn the plough-ox out to graze and keep a herd instead.
  const meat = priceRatio(world, 'meat');
  if (npc.job === 'farmer' && keepTwo && meat >= 1.6 && r <= 1 && chance(rng, 0.03)) {
    log(world, 'trade', `${npc.name} เลิกทำนาหันไปเลี้ยงสัตว์ เพราะเนื้อขายได้ราคา`, npc.id);
    npc.job = 'herder';
    return true;
  }
  if ((npc.job === 'herder' || npc.job === 'hunter') && keepTwo && r >= 1.8 && meat <= 1 && chance(rng, 0.04)) {
    log(world, 'trade', `${npc.name} เลิกเป็น${JOB_TH[npc.job]} หันมาทำนาเพราะข้าวแพง`, npc.id);
    npc.job = 'farmer';
    return true;
  }
  // The deer are hunted out: a hunter with an empty bag goes back to the fields.
  if (npc.job === 'hunter' && keepTwo && (world.game ?? 12) <= 2 && npc.gold < 15 && chance(rng, 0.03)) {
    log(world, 'trade', `${npc.name} เลิกล่าสัตว์เพราะกวางในป่าแทบไม่เหลือ หันมาทำนาแทน`, npc.id);
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

// Newcomers follow the money: a famine draws farmers in, dear meat draws herders and hunters.
export function arrivalJob(world: WorldState, rng: Rng): Npc['job'] | null {
  if (priceRatio(world, 'grain') >= 1.8 && chance(rng, 0.5)) return 'farmer';
  if (priceRatio(world, 'meat') >= 1.8 && chance(rng, 0.5)) return chance(rng, 0.5) ? 'herder' : 'hunter';
  return null;
}

export const lootFound = (rng: Rng) => int(rng, 1, 2);
