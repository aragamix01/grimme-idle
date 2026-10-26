// Meat for the town's table, beside the farmers' grain: herders raise beasts in the pasture
// past the south gate, and hunters stalk deer in the forest to the east. A herd yields the
// same all year (milk, eggs, the odd beast for the pot), so it carries the town through the
// winter the fields can't; deer are hunted out if too many go after them, and come back slowly.
import { chance, int, type Rng } from './rng';
import { cursed, kill, log } from './core';
import { seasonOf, sell } from './market';
import type { Npc, WorldState } from './types';

export const HERD_CAP = 24; // beasts the pasture can feed
const HERD_START = 12;
const YIELD_PER_BEAST = 0.1; // meat a day's tending brings in, per beast in the pasture
const RESTOCK_BELOW = 4;
const STRAY_FLOOR = 4; // a few old beasts never leave the barn, herder or no
const BREED = 0.12; // chance a day's tending adds a beast, outside winter
export const GAME_CAP = 20; // deer the forest holds
const GAME_START = 14;
const HUNT = 0.25; // chance of a kill on a hunter's day, with the forest full of deer
const MAULED = 0.001; // a bear, a boar, a fall
const MURRAIN = 0.025; // monthly chance of sickness in a full pasture; less in a sparse one

export function ensureWilds(world: WorldState): void {
  world.herd ??= HERD_START;
  world.game ??= GAME_START;
}

// A day's work in the pasture. Returns the gold made, so a landlord can take their cut.
export function tendHerd(world: WorldState, npc: Npc, rng: Rng): number {
  ensureWilds(world);
  // A pasture all but empty is restocked with a few young beasts from the neighbours.
  if (world.herd! < RESTOCK_BELOW && chance(rng, 0.05)) world.herd! += 3;
  const herd = world.herd!;
  if (herd >= 2 && herd < HERD_CAP && seasonOf(world.day) !== 'winter' && chance(rng, BREED)) world.herd!++;
  const y = herd * YIELD_PER_BEAST * (npc.blessed ? 1.3 : 1);
  return sell(world, npc, 'meat', Math.floor(y) + (chance(rng, y % 1) ? 1 : 0), rng);
}

// A day in the forest. Fewer deer, colder weather and the god's curse all thin the odds.
export function hunt(world: WorldState, npc: Npc, rng: Rng): void {
  ensureWilds(world);
  if (chance(rng, MAULED)) return kill(world, npc, 'ถูกหมีป่าขย้ำระหว่างออกล่า');
  const odds = HUNT * (world.game! / GAME_CAP) * (seasonOf(world.day) === 'winter' ? 0.6 : 1) * (cursed(world, npc) ? 0.5 : 1) * (npc.blessed ? 1.3 : 1);
  if (!chance(rng, odds)) return;
  world.game!--;
  sell(world, npc, 'meat', int(rng, 3, 5) + (npc.level >= 3 ? 1 : 0), rng);
  if (chance(rng, 0.03 / npc.level)) npc.level++; // a sharper eye with every season
}

// Deer breed back in the forest; a flock nobody minds wanders off a beast at a time.
export function wildsDay(world: WorldState, rng: Rng): void {
  ensureWilds(world);
  const g = world.game!;
  if (g < GAME_CAP && chance(rng, 0.03 + 0.25 * (g / GAME_CAP) * (1 - g / GAME_CAP))) world.game!++;
  const herders = world.npcs.some((n) => n.alive && n.job === 'herder' && n.age >= 16);
  if (!herders && world.herd! > STRAY_FLOOR && chance(rng, 0.01)) world.herd!--;
  if (world.day % 30 === 9) murrain(world, rng);
}

// Sickness in the herd. It spreads easiest in a packed pasture; seasoned herders cull the sick
// early and a blessed one's flock is spared the worst.
function murrain(world: WorldState, rng: Rng): void {
  const herd = world.herd!;
  if (herd < 6 || !chance(rng, MURRAIN * (herd / HERD_CAP) ** 2)) return;
  const herders = world.npcs.filter((n) => n.alive && n.job === 'herder' && n.age >= 16);
  const skill = herders.reduce((s, n) => s + Math.min(3, n.level) * 0.05 + (n.blessed ? 0.15 : 0), 0);
  const lost = Math.max(1, Math.round(herd * Math.max(0.15, int(rng, 35, 60) / 100 - skill)));
  world.herd = herd - lost;
  for (const n of herders) if (chance(rng, 0.5)) n.level++; // a hard lesson
  log(world, 'disaster', `โรคระบาดในคอกสัตว์! สัตว์ล้มตายไป ${lost} ตัว เหลือ ${world.herd} ตัว`);
}

// Wolves that come for the flock take a beast or two before anyone drives them off.
export function wolvesAtFlock(world: WorldState, rng: Rng): void {
  world.herd = Math.max(0, (world.herd ?? 0) - int(rng, 1, 2));
}
