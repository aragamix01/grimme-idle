// Small helpers shared by the world loop and the guild.
import { chance, type Rng } from './rng';
import type { Decree, EventKind, Npc, Perk, Plan, PlanKind, Regime, Tech, WorldState } from './types';
import type { Spot } from './places';
import { walk } from './nav';

const CHRONICLE_LIMIT = 500;

// Who holds power under each regime, and what the nobles' council is called there.
export const RULER_TH: Record<Regime, string> = { monarchy: 'กษัตริย์', republic: 'ผู้นำสภา', theocracy: 'มหานักบวช', oligarchy: 'ประธานสมาคมการค้า', junta: 'จอมทัพ' };
const COUNCIL_TH: Record<Regime, string> = { monarchy: 'สภาขุนนาง', republic: 'วุฒิสภา', theocracy: 'สภาสงฆ์', oligarchy: 'สภาพ่อค้า', junta: 'สภาขุนศึก' };
// Court news is written as if a king rules; outside a monarchy the titles are swapped for the real ones.
function retitle(world: WorldState, text: string): string {
  const r = world.regime;
  if (!r || r === 'monarchy') return text;
  return text.replaceAll('สภาขุนนาง', COUNCIL_TH[r]).replaceAll('พระราชโองการ', 'ประกาศ').replaceAll('กษัตริย์', RULER_TH[r]);
}
export const councilName = (world: WorldState) => COUNCIL_TH[world.regime ?? 'monarchy'];

export function log(world: WorldState, kind: EventKind, text: string, npcId?: number): void {
  world.chronicle.push({ seq: ++world.chronicleSeq, day: world.day, kind, text: retitle(world, text), npcId });
  if (world.chronicle.length > CHRONICLE_LIMIT) world.chronicle.shift();
}

export function kill(world: WorldState, npc: Npc, reason: string): void {
  npc.alive = false;
  npc.plan = undefined;
  log(world, 'death', `${npc.name} ${reason}`, npc.id);
  // Their gold goes to the spouse and children.
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
