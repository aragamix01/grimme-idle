// Trade houses: the merchants' associations as businesses in their own right. Each keeps a
// warehouse: it buys what is piling up cheap on the market's shelves, sells it back when the
// shelves run thin, and ships its surplus to the neighbours who pay best for it. A greedy house
// in a dearth sits on its grain to drive the price up, which the law calls hoarding. And a house
// with deep coffers lends to a crown that can't make its payroll: the debt runs at interest, the
// crown pays it down from its surplus, a greedy ruler may repudiate it, and a crown sunk in debt
// to its merchants is one they may buy outright (see regimes.ts).
import { chance, type Rng } from './rng';
import { clamp, log, loyaltyNudge, occupied } from './core';
import { GOODS, GOOD_TH, SELLS, basePrice, ensureMarket, levelOf, priceRatio } from './market';
import { commit } from './justice';
import { payrollReserve, king } from './society';
import { TRADE } from './diplomacy';
import type { Good, Guild, WorldState } from './types';

const DAY = 8; // day of the month the houses do their business
const BUY_BELOW = 0.7; // real price under which a house buys up the glut
const SELL_ABOVE = 1.3; // and over which it sells its stock back
const SPEND = 0.3; // of its coffers a house will put into goods in a month
const SHIP_AT = 20; // units of a good a house ships abroad once it holds this many
const SHIP_LOST = 0.06; // chance a shipment is lost to bandits or the sea
const HOARD_AT = 1.5; // grain this dear tempts a greedy house to sit on its store
const LOAN_FLOOR = 300; // coffers a house needs before it lends
const INTEREST = 0.02; // monthly, on what the crown owes
const REPAY = 0.25; // of its spare gold the crown puts toward the debt each month

export const houses = (world: WorldState) => world.guilds.filter((g) => g.kind === 'merchants');
const leaderOf = (world: WorldState, g: Guild) => world.npcs.find((n) => n.id === g.leaderId && n.alive);

export function tradeHousesDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== DAY || occupied(world)) return;
  for (const g of houses(world)) business(world, g, rng);
  debtDay(world, rng);
}

function business(world: WorldState, g: Guild, rng: Rng): void {
  const m = ensureMarket(world);
  const stock = (g.stock ??= {});
  const leader = leaderOf(world, g);
  const greedy = !!leader && leader.traits.includes('greedy') && leader.morality < 10;
  const grain = priceRatio(world, 'grain');
  // Hoarding: a greedy house in a dearth buys up what grain it can and sells none.
  if (greedy && grain >= HOARD_AT) {
    if (g.hoarding === undefined) {
      g.hoarding = world.day;
      commit(world, leader!, 'hoarding', rng, Math.round((stock.grain ?? 0) * m.price.grain));
      log(world, 'trade', `ลือกันว่า${g.name}กักตุนข้าวไว้ในโกดัง รอให้ราคาพุ่งกว่านี้`, leader!.id);
    }
    const n = Math.min(Math.floor(m.stock.grain * 0.15), Math.floor((g.treasury * SPEND) / m.price.grain));
    if (n > 0) move(world, g, 'grain', n, true);
  } else if (g.hoarding !== undefined && grain < 1.1) g.hoarding = undefined;

  for (const good of GOODS) {
    if (good === 'grain' && g.hoarding !== undefined) continue;
    const r = priceRatio(world, good);
    const held = stock[good] ?? 0;
    // Sell back into a dear market: as much as the shelves want, up to all it holds.
    if (held > 0 && r >= SELL_ABOVE) move(world, g, good, Math.min(held, Math.ceil(held * 0.5)), false);
    // Buy up a glut, within what it will risk this month.
    else if (r <= BUY_BELOW && m.stock[good] > 2) {
      const n = Math.min(Math.floor(m.stock[good] * 0.2), Math.floor((g.treasury * SPEND) / Math.max(1, m.price[good])));
      if (n > 0) move(world, g, good, n, true);
    }
  }
  // Ship the biggest surplus to the neighbour that wants it most.
  const good = (Object.keys(stock) as Good[]).filter((x) => (stock[x] ?? 0) >= SHIP_AT).sort((a, b) => (stock[b] ?? 0) - (stock[a] ?? 0))[0];
  const realm = good && (world.realms ?? []).filter((r) => !r.fallen && !r.war && r.relation >= 0).sort((a, b) => wants(b.terrain, good) - wants(a.terrain, good))[0];
  if (good && realm) {
    const n = stock[good]!;
    stock[good] = 0;
    if (chance(rng, SHIP_LOST)) return log(world, 'trade', `เกวียนสินค้าของ${g.name}ที่บรรทุก${GOOD_TH[good]}ไป${realm.name}ถูกปล้นกลางทาง`);
    const gold = Math.round(n * basePrice(good) * (0.8 + wants(realm.terrain, good) * 0.4) * levelOf(world));
    g.treasury += gold;
    realm.relation = clamp(realm.relation + 1, -100, 100);
    if (gold >= 600) log(world, 'trade', `${g.name}ส่ง${GOOD_TH[good]} ${n} หน่วยไปขายที่${realm.name} ได้ ${gold} ทอง`);
  }
}

// How much a kind of country wants a good: its staple want most, then what it doesn't make itself.
const wants = (t: keyof typeof TRADE, good: Good) => (TRADE[t].wants === good ? 1 : SELLS[t] === good || TRADE[t].sells === good ? 0 : 0.5);

// Goods across the counter between a house and the market, at the shelf price; the till pays a
// seller only what it holds.
function move(world: WorldState, g: Guild, good: Good, n: number, buying: boolean): void {
  const m = ensureMarket(world);
  const stock = (g.stock ??= {});
  const price = m.price[good];
  if (buying) {
    const cost = n * price;
    if (g.treasury < cost || m.stock[good] < n) return;
    g.treasury -= cost;
    m.till += cost;
    m.stock[good] -= n;
    stock[good] = (stock[good] ?? 0) + n;
  } else {
    const paid = Math.min(Math.floor(m.till), Math.floor(n * price * 0.9));
    if (paid < 1) return;
    m.till -= paid;
    g.treasury += paid;
    m.stock[good] += n;
    stock[good] = (stock[good] ?? 0) - n;
  }
}

// A hoarder brought to justice: the house's grain is thrown open to the market.
export function seizeHoard(world: WorldState, leaderId: number): number {
  const g = houses(world).find((x) => x.leaderId === leaderId);
  const n = Math.floor(g?.stock?.grain ?? 0);
  if (!g || !n) return 0;
  g.stock!.grain = 0;
  g.hoarding = undefined;
  ensureMarket(world).stock.grain += n;
  return n;
}

// ---------- the crown's debts ----------

function debtDay(world: WorldState, rng: Rng): void {
  const d = world.debt;
  const ruler = king(world);
  if (d) {
    const lender = world.guilds.find((g) => g.id === d.guildId);
    if (!lender) {
      world.debt = undefined; // the house is gone: nobody left to collect
      return;
    }
    d.owed = Math.round(d.owed * (1 + INTEREST));
    // A greedy ruler deep in debt may simply refuse to pay.
    if (ruler && ruler.traits.includes('greedy') && d.owed > 600 && chance(rng, 0.1)) {
      world.debt = undefined;
      lender.renown = Math.max(0, lender.renown - 10);
      for (const n of world.npcs) if (n.alive && (n.job === 'merchant' || n.guildId === lender.id)) loyaltyNudge(n, -15);
      log(world, 'politics', `กษัตริย์${ruler.name}ประกาศไม่ใช้หนี้ ${d.owed} ทองที่ติดค้าง${lender.name} พ่อค้าทั้งเมืองโกรธแค้น`, ruler.id);
      return;
    }
    const spare = world.treasury - payrollReserve(world) - 200;
    const pay = Math.min(d.owed, Math.max(0, Math.floor(spare * REPAY)));
    if (pay > 0) {
      world.treasury -= pay;
      lender.treasury += pay;
      d.owed -= pay;
    }
    if (d.owed <= 0) {
      world.debt = undefined;
      log(world, 'trade', `ท้องพระคลังใช้หนี้${lender.name}ครบแล้ว`);
    }
    return;
  }
  // A crown that can't make its payroll borrows from the richest house.
  if (!ruler || world.treasury >= payrollReserve(world)) return;
  const lender = houses(world).filter((g) => g.treasury >= LOAN_FLOOR).sort((a, b) => b.treasury - a.treasury)[0];
  if (!lender) return;
  const sum = Math.floor(lender.treasury * 0.5);
  lender.treasury -= sum;
  world.treasury += sum;
  world.debt = { guildId: lender.id, owed: sum, since: world.day };
  log(world, 'trade', `ท้องพระคลังขัดสน กษัตริย์${ruler.name}กู้เงิน ${sum} ทองจาก${lender.name} ดอกเบี้ยเดือนละ ${INTEREST * 100}%`, ruler.id);
}

// A crown this deep in a house's debt: the merchants hold its purse strings.
export const deepInDebt = (world: WorldState) => !!world.debt && world.debt.owed > Math.max(800, world.treasury * 2);
