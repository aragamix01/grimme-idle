// A golden age breeds its own trouble. Months of full coffers, full bellies and no enemy at
// the gates count up; the longer it lasts, the likelier something breaks the calm: the court's
// greed, sickness in crowded streets, a dragon drawn by the gold.
import { chance, type Rng } from './rng';
import { approval, intrigue } from './politics';
import { king } from './society';
import type { WorldState } from './types';

const GOLDEN_TREASURY = 900;
const GOLDEN_APPROVAL = 52;
const CALM_MONTHS = 6; // a golden age runs this long before it starts to strain
const STRAIN = 0.04; // added to the monthly chance of trouble for each month past CALM_MONTHS
const MAX_CHANCE = 0.35;

// A prosperous, peaceful month: money in the treasury, a content town, nobody starving, no war.
export function goldenMonth(world: WorldState): boolean {
  const hungry = world.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2).length;
  return world.treasury >= GOLDEN_TREASURY && approval(world) >= GOLDEN_APPROVAL && hungry < 3 && !world.war && !world.demon;
}

export const troubleChance = (months: number) => Math.min(MAX_CHANCE, Math.max(0, months - CALM_MONTHS) * STRAIN);

// Once a month: count the golden age along, and maybe end it.
export function troubles(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== 22) return;
  if (!goldenMonth(world)) {
    world.golden = 0;
    return;
  }
  const months = (world.golden = (world.golden ?? 0) + 1);
  if (!chance(rng, troubleChance(months))) return;
  const k = king(world);
  // Whatever happens, the town has been shaken out of its ease.
  if (k && intrigue(world, k, rng)) world.golden = 0;
}
