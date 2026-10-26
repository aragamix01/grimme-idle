// Learning: scholars read, argue and write things down, and what they work out becomes the town's
// knowledge, the store research will draw on. A school doubles their work: they teach there, and
// teaching sharpens their own thinking.
import { chance, type Rng } from './rng';
import { built } from './works';
import type { Npc, WorldState } from './types';

const KNOW_PER_DAY = 0.06; // one scholar's day at the desk, before level, school and blessing
const INSIGHT = 15; // knowledge from a dream the god sends a scholar

export const knowledgeOf = (world: WorldState) => world.knowledge ?? 0;

// A day of study, at the school if the town has one, else in the castle's library.
export function study(world: WorldState, npc: Npc, rng: Rng): void {
  const rate = KNOW_PER_DAY * (1 + Math.min(5, npc.level) * 0.1) * (built(world, 'school') ? 2 : 1) * (npc.blessed ? 1.5 : 1);
  world.knowledge = knowledgeOf(world) + rate;
  if (chance(rng, 0.004)) npc.level++; // years of reading tell, slowly
}

// The god's dream to a scholar: a whole book's worth of insight in one night.
export function insight(world: WorldState, npc: Npc): number {
  world.knowledge = knowledgeOf(world) + INSIGHT;
  npc.level++;
  return INSIGHT;
}
