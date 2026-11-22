// What the wild and the deep places give beyond gold, and the hands that work it. Each kind of
// dungeon yields its own spoils (a den's hides, a crypt's bones, a slime cave's gel, a fort's mana
// cores) for the party to sell; hunters bring herbs back from the woods; mages brew healing
// potions from gel and herbs; the smith forges hides and bones into gear as well as loot and ore;
// a mage with gold to spare studies a mana core. A potion carried down a dungeon saves a life when
// a quest goes wrong, and the market's potions save the sick when plague comes.
import { chance, int, type Rng } from './rng';
import { homeKind } from './terrain';
import { log } from './core';
import { ensureMarket, priceRatio, sell } from './market';
import { woodsShare } from './wilds';
import type { DungeonKind, Good, Npc, WorldState } from './types';

// What each kind of dungeon leaves behind besides its loot.
export const SPOILS: Record<DungeonKind, Good> = { cave: 'gel', den: 'hide', crypt: 'bone', fort: 'core' };
export const MAX_POTIONS = 2; // an adventurer carries no more than this
const HERB_DAY = 0.08; // a hunter's daily chance of a bunch of herbs, in untouched woods
const BREW_DAY = 0.12; // a mage's daily chance of brewing, with the makings to hand
const STUDY_DAY = 0.01; // a mage's daily chance of buying a core to study

const inTown = (n: Npc) => n.alive && n.age >= 16 && n.inside === undefined && n.questId === undefined;

// A party back from a dungeon sells what the place left behind (quests.ts).
export function sellSpoils(world: WorldState, party: Npc[], kind: DungeonKind, tier: number, rng: Rng): void {
  for (const n of party) sell(world, n, SPOILS[kind], Math.max(1, Math.round(int(rng, 1, 2) * tier * (kind === 'fort' ? 0.5 : 1))), rng);
}

// Daily: herbs from the woods, potions at the mages' benches, a core studied now and then.
export function craftsDay(world: WorldState, rng: Rng): void {
  const m = ensureMarket(world);
  const woods = Math.min(1, woodsShare(world));
  const deep = homeKind(world.seed) === 'woods'; // a woodland home is thick with herbs
  for (const n of world.npcs) {
    if (!inTown(n)) continue;
    if (n.job === 'hunter' && chance(rng, HERB_DAY * woods * (deep ? 1.5 : 1))) sell(world, n, 'herb', 1, rng);
    if (n.job !== 'mage') continue;
    // A potion from a measure of gel and a bunch of herbs, bought off the shelves.
    const makings = m.price.gel + m.price.herb;
    if (m.stock.gel >= 1 && m.stock.herb >= 1 && n.gold >= makings && priceRatio(world, 'potion') >= 0.6 && chance(rng, BREW_DAY)) {
      m.stock.gel -= 1;
      m.stock.herb -= 1;
      n.gold -= makings;
      m.till += makings;
      sell(world, n, 'potion', 1, rng);
      continue;
    }
    if (m.stock.core >= 1 && n.gold >= m.price.core * 3 && chance(rng, STUDY_DAY)) {
      m.stock.core -= 1;
      n.gold -= m.price.core;
      m.till += m.price.core;
      n.level++;
      log(world, 'world', `${n.name}ศึกษาแกนมานาจากป้อมร้างจนแตกฉานขึ้นอีกขั้น (เลเวล ${n.level})`, n.id, 'minor');
    }
  }
}

// An adventurer stocking up before the next delve (world.ts, on a trip to the shop).
export function buyPotion(world: WorldState, n: Npc): boolean {
  const m = ensureMarket(world);
  const price = m.price.potion;
  if ((n.potions ?? 0) >= MAX_POTIONS || m.stock.potion < 1 || n.gold < price * 3) return false;
  m.stock.potion -= 1;
  n.gold -= price;
  m.till += price;
  n.potions = (n.potions ?? 0) + 1;
  return true;
}

// A potion drunk at the brink: true if it saved them.
export function drinkPotion(n: Npc): boolean {
  if (!n.potions) return false;
  n.potions--;
  return true;
}

// The sick dosed from the market's shelves, paid by the crown; true if a potion was there to give.
export function dose(world: WorldState): boolean {
  const m = ensureMarket(world);
  if (m.stock.potion < 1 || world.treasury < m.price.potion) return false;
  m.stock.potion -= 1;
  world.treasury -= m.price.potion;
  m.till += m.price.potion;
  return true;
}
