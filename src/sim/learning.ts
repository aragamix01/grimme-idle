// Learning: scholars read, argue and write things down, and what they work out becomes the town's
// knowledge, the store research will draw on. A school doubles their work: they teach there, and
// teaching sharpens their own thinking.
import { chance, type Rng } from './rng';
import { built } from './works';
import { known, adherence, tenetOn } from './core';
import type { Job, Npc, WorldState } from './types';

const KNOW_PER_DAY = 0.08; // one scholar's day at the desk, before level, school and blessing
const INSIGHT = 15; // knowledge from a dream the god sends a scholar
const SCHOOL_AGE = 6; // children younger than this only play
const LETTERED_AT = 150; // days of lessons before a child can read for good
const TOP_OF_CLASS = 400; // days of lessons that make a child start grown life a step ahead
const HOME_LESSON = 0.15; // a day spent beside a parent who reads counts for this much
const SELF_TAUGHT = 0.03; // monthly chance a grown-up learns to read from the press's cheap books

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
// Printed primers make every lesson count for more.
export function lesson(world: WorldState, n: Npc, atSchool: boolean, parent?: Npc): void {
  if (!schoolAge(n)) return;
  const books = known(world, 'printing') ? 1.5 : 1;
  if (atSchool) n.schooling = (n.schooling ?? 0) + books;
  else if (parent && literate(parent)) n.schooling = (n.schooling ?? 0) + HOME_LESSON * books;
}

// With a press in town, cheap books reach grown-ups too: a few teach themselves to read each month.
export function pressDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== 4 || !built(world, 'press')) return;
  for (const n of world.npcs) if (n.alive && n.age >= 16 && n.age < 50 && !literate(n) && chance(rng, SELF_TAUGHT)) n.lettered = true;
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

// An alchemist brews healing draughts from dungeon finds and sells them across the shop counter.
export function brew(world: WorldState, npc: Npc, rng: Rng): void {
  const m = world.market;
  if (!m || m.stock.loot < 1 || m.till < DRAUGHT || !chance(rng, 0.25)) return;
  m.stock.loot -= 1;
  m.till -= DRAUGHT;
  npc.gold += DRAUGHT;
}
const DRAUGHT = 6; // gold a batch of draughts fetches

// An engineer on the crown's building site: good planning takes days off the work.
export function engineer(world: WorldState, rng: Rng): void {
  const job = world.building;
  if (job && job.done > world.day + 1 && chance(rng, 0.2)) job.done--;
}

// Draughts on hand: adventurers come back from the dungeon more often, plagues kill fewer.
export const draughts = (world: WorldState) => world.npcs.some((n) => n.alive && n.job === 'alchemist' && n.age >= 16);

export const knowledgeOf = (world: WorldState) => world.knowledge ?? 0;

// A day of study, at the school if the town has one, else in the castle's library.
// Past a handful, more scholars mostly go over each other's ground: a city's crowd of them finds
// things sooner than a town's few, but not in proportion (counted once a day).
const SCHOLARS_FULL = 6;
let scholarCount: { npcs: Npc[]; day: number; n: number } | null = null;
function crowdedStudy(world: WorldState): number {
  if (scholarCount?.npcs !== world.npcs || scholarCount.day !== world.day) {
    let n = 0;
    for (const x of world.npcs) if (x.alive && x.job === 'scholar') n++;
    scholarCount = { npcs: world.npcs, day: world.day, n };
  }
  return Math.min(1, Math.sqrt(SCHOLARS_FULL / Math.max(1, scholarCount.n)));
}

export function study(world: WorldState, npc: Npc, rng: Rng): void {
  const rate =
    KNOW_PER_DAY * (1 + Math.min(5, npc.level) * 0.1) * (built(world, 'school') ? 2 : 1) * (npc.blessed ? 1.5 : 1) * (built(world, 'press') ? 1.25 : 1) * (built(world, 'clocktower') ? 1.1 : 1) * (world.charter?.stateFaith ? 0.8 : world.charter?.faith === 'secular' ? 1.1 : 1) * (world.demon?.stage === 'occupied' ? 0.3 : 1) * (tenetOn(world, 'learning') ? 1 + 0.15 * adherence(world) : 1) * (world.power && known(world, 'lightbulb') ? 1.2 : 1); // and electric light lets them read late // the god bids them study; a state church frowns on some questions; under the demon books are hidden
  world.knowledge = knowledgeOf(world) + rate * crowdedStudy(world);
  if (chance(rng, 0.004)) npc.level++; // years of reading tell, slowly
}

// The god's dream to a scholar: a whole book's worth of insight in one night.
export function insight(world: WorldState, npc: Npc): number {
  world.knowledge = knowledgeOf(world) + INSIGHT;
  npc.level++;
  return INSIGHT;
}
