// Trade policy, and what wealth does to a town. The crown may tax the trade at the gates, bar it
// from an enemy, or cap the price of bread; each has its price: tariffs and embargoes breed
// smugglers (the thieves' guild grows fat on them), and a capped price sends grain to the black
// market, emptying the very shelves it was meant to fill. Friendly neighbours who trade with us
// often sign a treaty that sweetens every deal. And the rich want what money can show: spices
// shipped in from afar for the nobles' tables, while a town where a few hold nearly everything
// grows restless (see crises.ts).
import { chance, type Rng } from './rng';
import { clamp, decreeActive, log, loyaltyNudge, occupied } from './core';
import { ensureMarket, levelOf, priceRatio } from './market';
import { visitable } from './diplomacy';
import type { Realm, WorldState } from './types';

const DAY = 19; // day of the month treaties are weighed and smugglers count their take
export const TARIFF = 0.15; // the crown's share of trade through the gates under the tariff decree
export const TARIFF_ON_IMPORTS = 1.25; // what imports cost under it
export const TREATY_BONUS = 0.15; // better prices both ways with a treaty partner
const TREATY_AT = 40; // relation at which a trading neighbour signs
const TREATY_TRADES = 5; // caravans first exchanged
const TREATY_LAPSE = 10; // relation below which it lapses
export const CEILING = 1.3; // the capped grain price, against what it usually costs
const BLACK_MARKET = 0.25; // of grain sold under a cap that goes to the black market instead
const LUXURY_AT = 300; // a purse (at founding prices) past which a townsperson keeps a fine table

// Whether we may trade with a realm: open roads, and no embargo standing against it.
export const tradesWith = (world: WorldState, r: Realm) => visitable(r) && !(world.embargo === r.id && decreeActive(world, 'embargo'));
// The tariff and treaty's effect on a sale abroad (what we get) and a purchase abroad (what we pay).
export const exportRate = (world: WorldState, r?: Realm) => (r?.treaty ? 1 + TREATY_BONUS : 1) * (decreeActive(world, 'tariff') ? 1 - TARIFF : 1);
export const importRate = (world: WorldState, r?: Realm, food = false) => (r?.treaty ? 1 - TREATY_BONUS : 1) * (decreeActive(world, 'tariff') && !food ? TARIFF_ON_IMPORTS : 1); // bread comes in duty-free
// The crown's take of a trade worth `gold` at the gates.
export function levyTrade(world: WorldState, gold: number): void {
  if (decreeActive(world, 'tariff')) world.treasury += Math.round(gold * TARIFF);
}

// Under a price cap, a seller of grain may sell to the black market instead. True if they did.
export const blackMarket = (world: WorldState, rng: Rng) => decreeActive(world, 'ceiling') && chance(rng, BLACK_MARKET);
export const capOf = (world: WorldState, base: number) => (decreeActive(world, 'ceiling') ? Math.round(base * CEILING * levelOf(world)) : Infinity);

export function commerceDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== DAY || occupied(world)) return;
  treaties(world);
  smuggling(world, rng);
  luxuries(world);
}

// Neighbours we trade with and like sign a treaty; it lapses if relations sour or it comes to war.
function treaties(world: WorldState): void {
  for (const r of world.realms ?? []) {
    if (r.treaty && (r.relation < TREATY_LAPSE || r.war || r.fallen)) {
      r.treaty = undefined;
      log(world, 'trade', `สนธิสัญญาการค้ากับ${r.name}สิ้นสุดลง`);
    } else if (!r.treaty && !r.war && !r.fallen && r.relation >= TREATY_AT && (r.trades ?? 0) >= TREATY_TRADES) {
      r.treaty = true;
      log(world, 'trade', `ลงนามสนธิสัญญาการค้ากับ${r.name} พ่อค้าทั้งสองฝ่ายได้ราคาดีขึ้น`);
    }
  }
}

// Tariffs and embargoes are the smugglers' harvest: the thieves' guild takes its cut, and now and
// then the watch catches a load and the crown keeps it.
function smuggling(world: WorldState, rng: Rng): void {
  const barred = decreeActive(world, 'tariff') || decreeActive(world, 'embargo');
  const ring = world.guilds.find((g) => g.kind === 'thieves');
  if (!barred || !ring) return;
  const take = Math.round((20 + world.npcs.filter((n) => n.alive && n.guildId === ring.id).length * 5) * levelOf(world));
  const watch = world.npcs.filter((n) => n.alive && n.job === 'watchman').length;
  if (chance(rng, Math.min(0.5, 0.1 + watch * 0.05))) {
    world.treasury += take;
    log(world, 'trade', `ยามจับกองสินค้าเถื่อนของ${ring.name}ได้ ยึดเข้าคลังมูลค่า ${take} ทอง`);
    return;
  }
  ring.treasury += take;
  ring.renown += 1;
}

// The well-off keep a fine table: a measure of spice a month. Nobles who can't get it grumble at
// a court that can't keep its own in comfort; those who can, feel the better for it.
function luxuries(world: WorldState): void {
  const m = ensureMarket(world);
  const rich = LUXURY_AT * levelOf(world);
  for (const n of world.npcs) {
    if (!n.alive || n.age < 16 || n.inside !== undefined) continue;
    const gentry = n.job === 'noble' || n.job === 'king';
    if (!gentry && n.gold < rich) continue;
    const price = m.price.spice;
    if (m.stock.spice >= 1 && n.gold >= price * 3) {
      n.gold -= price;
      m.stock.spice -= 1;
      m.till += price;
      loyaltyNudge(n, 1);
    } else if (gentry) loyaltyNudge(n, -2);
  }
}

// How much of the town's wealth its richest tenth holds, 0..1.
export function inequality(world: WorldState): number {
  const purses = world.npcs.filter((n) => n.alive && n.age >= 16).map((n) => Math.max(0, n.gold)).sort((a, b) => b - a);
  const total = purses.reduce((s, x) => s + x, 0);
  if (purses.length < 10 || total <= 0) return 0;
  return purses.slice(0, Math.ceil(purses.length / 10)).reduce((s, x) => s + x, 0) / total;
}

// The embargo's target: the realm we are at war with, or the one that hates us most.
export function embargoTarget(world: WorldState): Realm | undefined {
  const at = world.war && world.realms?.find((r) => r.id === world.war!.realmId);
  return at ?? (world.realms ?? []).filter((r) => !r.fallen && r.relation <= -60).sort((a, b) => a.relation - b.relation)[0];
}
export function embargo(world: WorldState, r: Realm): void {
  world.embargo = r.id;
  r.relation = clamp(r.relation - 10, -100, 100);
  r.gold = Math.round(r.gold * 0.9);
  r.treaty = undefined;
}

// Whether grain is dear enough that a ruler may cap its price.
export const breadIsDear = (world: WorldState) => priceRatio(world, 'grain') >= 1.8;
