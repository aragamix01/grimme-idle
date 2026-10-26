// Learning: scholars read, argue and write things down, and what they work out becomes the town's
// knowledge, the store research will draw on. A school doubles their work: they teach there, and
// teaching sharpens their own thinking.
import { chance, type Rng } from './rng';
import { built } from './works';
import type { Job, Npc, WorldState } from './types';

const KNOW_PER_DAY = 0.08; // one scholar's day at the desk, before level, school and blessing
const INSIGHT = 15; // knowledge from a dream the god sends a scholar
const SCHOOL_AGE = 6; // children younger than this only play
const LETTERED_AT = 150; // days of lessons before a child can read for good
const TOP_OF_CLASS = 400; // days of lessons that make a child start grown life a step ahead
const HOME_LESSON = 0.15; // a day spent beside a parent who reads counts for this much

// Trades that cannot be done without letters: anyone who comes to town in one of them reads.
const LETTERED_JOBS: readonly Job[] = ['scholar', 'priest', 'noble', 'king', 'mage'];
const MAX_SCHOLARS = 4; // past this the crown has no desk for another

export const literate = (n: Npc) => n.lettered ?? LETTERED_JOBS.includes(n.job);
export const schoolAge = (n: Npc) => n.age >= SCHOOL_AGE && n.age < 16;

// Share of grown townsfolk who can read, 0..1.
export function literacy(world: WorldState): number {
  const adults = world.npcs.filter((n) => n.alive && n.age >= 16);
  return adults.length ? adults.filter(literate).length / adults.length : 0;
}

// A child's day of lessons: a full day at the school, or a little from a parent who reads.
export function lesson(n: Npc, atSchool: boolean, parent?: Npc): void {
  if (!schoolAge(n)) return;
  if (atSchool) n.schooling = (n.schooling ?? 0) + 1;
  else if (parent && literate(parent)) n.schooling = (n.schooling ?? 0) + HOME_LESSON;
}

// At sixteen the lessons tell: a child who learned to read is lettered for life, may take up
// the scholar's desk if one is free, and the best of the class start out a level ahead.
export function graduate(world: WorldState, n: Npc, rng: Rng): void {
  const days = n.schooling ?? 0;
  if (days >= LETTERED_AT) n.lettered = true; // otherwise their trade decides, as for newcomers
  n.schooling = undefined;
  if (!n.lettered || n.job === 'noble') return;
  const scholars = world.npcs.filter((o) => o.alive && o.job === 'scholar').length;
  if (scholars < MAX_SCHOLARS && chance(rng, 0.15)) n.job = 'scholar';
  n.level += days >= TOP_OF_CLASS ? 2 : 1;
}

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
