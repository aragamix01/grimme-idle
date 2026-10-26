// Royal decrees: the king answers the town's troubles with policy, each kind of king in his
// own way. A decree is issued at the start of a month when its need is plain, costs the
// treasury what it costs, runs a while, and can't be issued again for a season.
import { chance, pick, type Rng } from './rng';
import { log } from './core';
import { king, payrollReserve } from './society';
import { traveller } from './world';
import type { Decree, Job, Npc, WorldState } from './types';

export interface DecreeDef {
  name: string;
  text: string; // what it does, for the kingdom tab
  days: number; // how long it stands
}

export const DECREES: Record<Decree, DecreeDef> = {
  labour: { name: 'ป่าวประกาศจ้างแรงงานต่างเมือง', text: 'ใช้ทองจ้างคนจากเมืองอื่นมาทำงานเมื่อคนในเมืองไม่พอ', days: 60 },
};
export const DECREE_ORDER: readonly Decree[] = ['labour'];

const REVIEW_DAY = 3; // day of the month the king looks over his decrees
const COOLDOWN = 180; // days before the same decree may be issued again
const SPARE = 200; // gold kept back beyond the soldiers' pay
const FULL_TOWN = 80;
const SHORT = 6; // residents missing before the king sends for labour
const WAGE = 35; // gold per worker: the crier, the road, and a purse to settle in
const LABOUR_JOBS: readonly Job[] = ['farmer', 'farmer', 'farmer', 'herder', 'herder', 'hunter', 'merchant', 'blacksmith'];

export const decreeActive = (world: WorldState, k: Decree) => (world.decrees ?? []).some((d) => d.kind === k && d.until > world.day);
const budget = (world: WorldState) => world.treasury - payrollReserve(world) - SPARE;
const ready = (world: WorldState, k: Decree) => world.day - (world.decreeAt?.[k] ?? -COOLDOWN) >= COOLDOWN;

// Workers to send for, and what it would cost; none if the town is near full or the crown can't pay.
function labourNeed(world: WorldState): number {
  const living = world.npcs.filter((n) => n.alive).length;
  const missing = FULL_TOWN - living;
  if (missing < SHORT) return 0;
  return Math.min(missing, Math.floor(budget(world) / WAGE), 10);
}

// Each kind of decree: whether this king would issue it now, and issuing it.
const RULES: Record<Decree, { wants: (world: WorldState, k: Npc) => boolean; issue: (world: WorldState, k: Npc, rng: Rng) => string }> = {
  labour: {
    wants: (world, k) => labourNeed(world) >= 3 && !(k.traits.includes('greedy') && world.treasury < 1500),
    issue: (world) => {
      const n = labourNeed(world);
      world.treasury -= n * WAGE;
      world.labour = (world.labour ?? 0) + n;
      // Word goes out along the trade roads; the friendliest neighbour sends the most.
      const from = [...(world.realms ?? [])].filter((r) => !r.fallen && !r.war).sort((a, b) => b.relation - a.relation)[0];
      if (from) from.people = Math.max(50, from.people - n);
      return `จ้างแรงงาน ${n} คน${from ? `จาก${from.name}` : ''} (${n * WAGE} ทอง)`;
    },
  },
};

export function decreesDay(world: WorldState, rng: Rng): void {
  // Hired hands trickle in through the west gate over the following weeks.
  if (world.labour && chance(rng, 0.25)) {
    world.labour--;
    traveller(world, rng, pick(rng, LABOUR_JOBS));
  }
  if (world.decrees?.length) world.decrees = world.decrees.filter((d) => d.until > world.day);
  if (world.day % 30 !== REVIEW_DAY) return;
  const k = king(world);
  if (!k) return;
  const next = DECREE_ORDER.find((d) => !decreeActive(world, d) && ready(world, d) && RULES[d].wants(world, k));
  if (!next) return;
  const what = RULES[next].issue(world, k, rng);
  (world.decrees ??= []).push({ kind: next, since: world.day, until: world.day + DECREES[next].days });
  (world.decreeAt ??= {})[next] = world.day;
  log(world, 'politics', `กษัตริย์${k.name}ออกพระราชโองการ${DECREES[next].name}: ${what}`, k.id);
}
