// Small helpers shared by the world loop and the guild.
import { chance, type Rng } from './rng';
import type { Decree, EventKind, ModKey, Npc, Perk, Plan, PlanKind, Tech, Tenet, WorldState } from './types';
import { COUNCIL_TH, say } from './lexicon';
import type { Spot } from './places';
import { walk } from './nav';

const CHRONICLE_LIMIT = 500;

// Court news is written as if a king rules; outside a monarchy it is reworded for the regime.
export { RULER_TH } from './lexicon';
export const councilName = (world: WorldState) => COUNCIL_TH[world.regime ?? 'monarchy'];

export function log(world: WorldState, kind: EventKind, text: string, npcId?: number): void {
  world.chronicle.push({ seq: ++world.chronicleSeq, day: world.day, kind, text: say(world, text, true), npcId });
  if (world.chronicle.length > CHRONICLE_LIMIT) world.chronicle.shift();
}

const ESTATE_FREE = 200; // an estate this small passes whole
const ESTATE_DUTY = 0.3; // of the rest

export function kill(world: WorldState, npc: Npc, reason: string): void {
  npc.alive = false;
  npc.plan = undefined;
  log(world, 'death', `${npc.name} ${reason}`, npc.id);
  // The crown takes its due of a large estate; the rest goes to the spouse and children.
  if (npc.gold > ESTATE_FREE) {
    const duty = Math.floor((npc.gold - ESTATE_FREE) * ESTATE_DUTY);
    npc.gold -= duty;
    world.treasury += duty;
  }
  const heirs = world.npcs.filter((o) => o.alive && (o.id === npc.spouseId || o.parentIds?.includes(npc.id)));
  if (!heirs.length || npc.gold <= 0) return;
  const share = Math.floor(npc.gold / heirs.length);
  for (const h of heirs) h.gold += share;
  npc.gold -= share * heirs.length;
}

export function makePlan(kind: PlanKind, at: Spot, days: number, target?: number): Plan {
  return { kind, x: at.x, y: at.y, days, target };
}

export const known = (world: WorldState, t: Tech) => world.techs?.[t] !== undefined;

export const perkLevel = (world: WorldState, p: Perk) => world.legacy?.perks[p] ?? 0;

export const cursed = (world: WorldState, n: Npc) => (n.cursedUntil ?? 0) > world.day;

export const occupied = (world: WorldState) => world.demon?.stage === 'occupied';

// The hero the god (or the prophecy) has woken, while still training for the demon lord.
export const inTraining = (world: WorldState, n: Npc) => world.demon?.hero?.id === n.id && world.demon.hero.stage === 'training';

// A commandment of the god in force, and how closely the town keeps its commandments (0..1).
export const tenetOn = (world: WorldState, k: Tenet) => !!world.religion?.tenets?.some((t) => t.kind === k);
export const adherence = (world: WorldState) => world.religion?.adherence ?? 0;

export const decreeActive = (world: WorldState, k: Decree) => (world.decrees ?? []).some((d) => d.kind === k && d.until > world.day);

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export const loyaltyNudge = (n: Npc, by: number) => (n.loyalty = clamp((n.loyalty ?? 50) + by, 0, 100));

export const atSpot = (npc: Npc, s: Spot, slack = 0) => Math.abs(npc.x - s.x) + Math.abs(npc.y - s.y) <= slack;

// One tile a day along the town's roads and around whatever is in the way.
export function stepToward(world: WorldState, npc: Npc, to: Spot, rng: Rng): void {
  if (walk(world, npc, to, rng)) return;
  // Boxed in (an old save standing inside a wall): push straight through to get free.
  const dx = Math.sign(to.x - npc.x);
  const dy = Math.sign(to.y - npc.y);
  const preferX = Math.abs(to.x - npc.x) >= Math.abs(to.y - npc.y);
  if (dx && (preferX || !dy) && !chance(rng, 0.2)) npc.x += dx;
  else if (dy) npc.y += dy;
  else npc.x += dx;
  npc.x = clamp(npc.x, 0, world.width - 1);
  npc.y = clamp(npc.y, 0, world.height - 1);
}

// Lasting effects of happenings (see happenings.ts): each adds to some rate until the day it wears off.
export function addMod(world: WorldState, key: ModKey, value: number, days: number, why: string): void {
  (world.mods ??= []).push({ key, value, until: world.day + days, why });
}

// The sum of the mods in force for this key: 0 when there are none.
export function modOf(world: WorldState, key: ModKey): number {
  let v = 0;
  for (const m of world.mods ?? []) if (m.key === key && m.until > world.day) v += m.value;
  return v;
}

export const isAdventurer = (npc: Npc) => (npc.job === 'swordsman' || npc.job === 'mage') && npc.age >= 16;

const LEGENDS_KEPT = 20;
// A deed for the town's legends: the great things an era is remembered by.
export function legend(world: WorldState, text: string, npcId?: number): void {
  world.legends.push({ day: world.day, text, npcId });
  if (world.legends.length > LEGENDS_KEPT) world.legends.shift();
}
