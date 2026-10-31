// Relationships between NPCs: one number per pair, from sworn enemies (-100) to best friends (100).
import { chance, type Rng } from './rng';
import { clamp, log } from './core';
import type { Npc, WorldState } from './types';

export const FRIEND = 15;
export const BEST_FRIEND = 40;
export const RIVAL = -15;
export const ENEMY = -40;
const SOCIAL_CHANCE = 0.08; // per nearby pair per day
const TILE_ROW = 1024; // a tile's bucket: y * TILE_ROW + x (wider than any map, so x + 1 never wraps a row)

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function getTie(world: WorldState, a: number, b: number): number {
  return world.ties[key(a, b)] ?? 0;
}

// Set a tie quietly, for bonds people are born with.
export function setTie(world: WorldState, a: number, b: number, value: number): void {
  world.ties[key(a, b)] = clamp(value, -100, 100);
}

// Adjust a tie and tell the chronicle when two people become best friends or enemies.
export function addTie(world: WorldState, a: Npc, b: Npc, delta: number): void {
  if (a.id === b.id || !delta) return;
  const k = key(a.id, b.id);
  const before = world.ties[k] ?? 0;
  const after = clamp(before + delta, -100, 100);
  world.ties[k] = after;
  // Every pair of friends is the town's daily round; the friendships of the great are news.
  if (before < BEST_FRIEND && after >= BEST_FRIEND) log(world, 'bond', `${a.name} กับ${b.name} กลายเป็นเพื่อนสนิท`, a.id, notable(world, a) || notable(world, b) ? 'plain' : 'minor');
  if (before > ENEMY && after <= ENEMY) log(world, 'bond', `${a.name} กับ${b.name} กลายเป็นศัตรูกัน`, a.id);
}

// Someone whose friends and feuds the town talks about.
const notable = (world: WorldState, n: Npc) => n.id === world.kingId || n.hero || ['king', 'noble', 'priest', 'judge'].includes(n.job) || (world.parties ?? []).some((p) => p.leaderId === n.id) || world.movement?.leaderId === n.id;

export function tieLabel(v: number): string {
  if (v >= BEST_FRIEND) return 'เพื่อนสนิท';
  if (v >= FRIEND) return 'เพื่อน';
  if (v <= ENEMY) return 'ศัตรู';
  if (v <= RIVAL) return 'คู่อริ';
  return 'คนรู้จัก';
}

// The strongest feelings this NPC has, either way.
export function topTies(world: WorldState, id: number, n = 3): { id: number; value: number }[] {
  const out: { id: number; value: number }[] = [];
  for (const [k, value] of Object.entries(world.ties)) {
    const [a, b] = k.split('-').map(Number);
    if (a === id || b === id) out.push({ id: a === id ? b : a, value });
  }
  return out.sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, n);
}

// People who hang around the same spot slowly get to know each other; temperament colours how.
export function socialize(world: WorldState, rng: Rng): void {
  const here = world.npcs.filter((n) => n.alive && n.inside === undefined && (n.plan?.kind === 'idle' || n.plan?.kind === 'work'));
  // Bucket everyone by tile, so only neighbours are paired: a city has tens of thousands of pairs.
  const at = new Map<number, Npc[]>();
  for (const n of here) {
    const k = n.y * TILE_ROW + n.x;
    const list = at.get(k);
    if (list) list.push(n);
    else at.set(k, [n]);
  }
  const meet = (a: Npc, b: Npc) => {
    if (!chance(rng, SOCIAL_CHANCE)) return;
      let delta = 3;
      if (a.traits.includes('kind') || b.traits.includes('kind')) delta += 2;
      if (a.traits.includes('greedy') && b.traits.includes('greedy')) delta -= 4; // two misers squabble
      if (Math.sign(a.morality) !== Math.sign(b.morality) && Math.abs(a.morality - b.morality) > 60) delta -= 5;
      addTie(world, a, b, delta);
  };
  // Each pair once: on the same tile, or one step east or south of it.
  for (const [k, list] of at) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) meet(list[i], list[j]);
      for (const b of at.get(k + 1) ?? []) meet(list[i], b);
      for (const b of at.get(k + TILE_ROW) ?? []) meet(list[i], b);
    }
  }
}

export function pruneTies(world: WorldState, keep: Set<number>): void {
  for (const k in world.ties) {
    const dash = k.indexOf('-');
    if (!keep.has(+k.slice(0, dash)) || !keep.has(+k.slice(dash + 1))) delete world.ties[k];
  }
}
