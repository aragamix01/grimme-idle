// A golden age breeds its own trouble. Months of full coffers, full bellies and no enemy at
// the gates count up; the longer it lasts, the likelier something breaks the calm: the court's
// greed, sickness in crowded streets, a dragon drawn by the gold, or a political crisis (see
// crises.ts).
import { chance, pick, type Rng } from './rng';
import { approval, intrigue } from './politics';
import { king } from './society';
import { plagueStrike } from './worldevents';
import { dragonArrives } from './dragon';
import { assassination, deadlock, decadence, rulerScandal, strike } from './crises';
import type { WorldState } from './types';
import { TOWN_SIZE } from './town';

const GOLDEN_TREASURY = 900;
const GOLDEN_APPROVAL = 52;
const CALM_MONTHS = 6; // a golden age runs this long before it starts to strain
const STRAIN = 0.04; // added to the monthly chance of trouble for each month past CALM_MONTHS
const MAX_CHANCE = 0.35;
const CROWDED = TOWN_SIZE - 10; // townsfolk past which sickness spreads street to street
const PACKED = TOWN_SIZE + 8; // so many that it may break out in any month, golden or not
const HATED = 30; // approval under which a ruler may be struck down in any month
const HATED_CHANCE = 0.05;

// A prosperous, peaceful month: money in the treasury, a content town, nobody starving, no war.
export function goldenMonth(world: WorldState): boolean {
  const hungry = world.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2).length;
  return world.treasury >= GOLDEN_TREASURY && approval(world) >= GOLDEN_APPROVAL && hungry < 3 && !world.war && !world.demon;
}

export const troubleChance = (months: number) => Math.min(MAX_CHANCE, Math.max(0, months - CALM_MONTHS) * STRAIN);

const townsfolk = (world: WorldState) => world.npcs.filter((n) => n.alive && n.inside === undefined).length;

// Sickness in streets grown too full. The town's own plague: the priests are all that slow it.
function crowdPlague(world: WorldState, rng: Rng): boolean {
  const people = townsfolk(world);
  if (people < CROWDED) return false;
  plagueStrike(world, rng, 0.4 + (people - CROWDED) * 0.02, `ชาวเมือง ${people} คนอยู่กันแออัด โรคระบาดในเมือง`);
  return true;
}

// Once a month: count the golden age along, and maybe end it.
export function troubles(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== 22) return;
  // A town packed past bursting falls sick whatever the times.
  if (townsfolk(world) >= PACKED && chance(rng, 0.08)) crowdPlague(world, rng);
  // A hated ruler has enemies whatever the times.
  if (king(world) && approval(world) < HATED && chance(rng, HATED_CHANCE)) assassination(world, rng);
  if (!goldenMonth(world)) {
    world.golden = 0;
    return;
  }
  const months = (world.golden = (world.golden ?? 0) + 1);
  if (!chance(rng, troubleChance(months))) return;
  const k = king(world);
  if (months >= CALM_MONTHS) decadence(world, rng); // ease hardens a few hearts
  const kinds: ((w: WorldState, r: Rng) => boolean)[] = [crowdPlague, dragonArrives, rulerScandal, strike, assassination, deadlock];
  if (k) kinds.push((w, r) => intrigue(w, k, r));
  // Try the kinds in a random order until one takes; whatever happens shakes the town out of its ease.
  for (let left = [...kinds]; left.length; ) {
    const f = pick(rng, left);
    if (f(world, rng)) {
      world.golden = 0;
      return;
    }
    left = left.filter((x) => x !== f);
  }
}
