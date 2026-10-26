// The republic: no crown, only an office the townsfolk fill by vote every few years. A handful
// of the town's most prominent people stand; each voter backs whoever they are closest to, who
// shares their trade, or who speaks for their purse, the rich for the rich and the poor for the kind.
import { chance, next, type Rng } from './rng';
import { log, loyaltyNudge, occupied } from './core';
import { legend } from './quests';
import { ensureCrown, loyaltyOf } from './politics';
import { leaveTrade } from './society';
import { getTie } from './ties';
import { literate } from './learning';
import { charterOf, writeCharter } from './charter';
import type { Npc, WorldState } from './types';

// Days between elections, as the charter sets them.
const term = (world: WorldState) => (charterOf(world).termYears || 3) * 365;
const CANDIDATES = 3;
const RICH = 60; // a voter this well off votes with their purse

export const isRepublic = (world: WorldState) => world.regime === 'republic';

// How prominent someone is: wealth, deeds, friends, letters.
function standing(world: WorldState, n: Npc): number {
  const friends = world.npcs.filter((o) => o.alive && o !== n && getTie(world, n.id, o.id) >= 40).length;
  return n.gold / 40 + n.level * 0.5 + (n.renown ?? 0) / 10 + friends * 0.4 + (literate(n) ? 1 : 0) + (n.job === 'noble' ? 1 : 0) + (n.id === world.kingId ? 2 : 0);
}

function candidates(world: WorldState): Npc[] {
  const eligible = world.npcs.filter((n) => n.alive && n.age >= 25 && n.age <= 68 && n.job !== 'thief' && !n.cultist && n.questId === undefined && n.inside === undefined);
  return eligible.sort((a, b) => standing(world, b) - standing(world, a)).slice(0, CANDIDATES);
}

// One voter's pull toward one candidate.
function appeal(world: WorldState, v: Npc, c: Npc, rng: Rng): number {
  if (v === c) return 100; // everyone votes for themselves
  const trade = (c.formerJob ?? c.job) === v.job ? 1 : 0;
  const purse = v.gold >= RICH ? (c.gold >= 100 || c.traits.includes('greedy') ? 1 : 0) : (c.traits.includes('kind') ? 1.2 : 0) + (c.gold < RICH ? 0.5 : 0);
  const sitting = c.id === world.kingId ? (loyaltyOf(v) - 50) / 25 : 0; // the content keep the incumbent, the angry throw them out
  const danger = c.traits.includes('brave') && (world.war || world.demon) ? 1 : 0;
  return getTie(world, v.id, c.id) / 20 + trade + purse + sitting + danger + next(rng) * 2 - 1;
}

// Put the winner in office; the one they replace goes back to their old trade.
function install(world: WorldState, winner: Npc): void {
  const old = world.npcs.find((n) => n.id === world.kingId);
  if (old && old !== winner && old.alive && old.job === 'king') {
    old.job = old.formerJob ?? 'merchant';
    old.formerJob = undefined;
    if (old.job === 'swordsman' || old.job === 'mage') old.rank = old.renown = 0;
    old.plan = undefined;
  }
  if (winner.job !== 'king') {
    winner.formerJob = winner.job === 'noble' ? 'noble' : winner.job;
    leaveTrade(winner);
    winner.job = 'king';
    winner.knight = undefined;
    winner.plan = undefined;
  }
  world.kingId = winner.id;
  const crown = ensureCrown(world);
  crown.since = world.day;
  crown.unrest = 0;
}

// Hold an election now. Returns the winner, if anyone stood.
export function election(world: WorldState, rng: Rng, why: string): Npc | undefined {
  const field = candidates(world);
  if (!field.length) return undefined;
  const votes = new Map(field.map((c) => [c.id, 0]));
  const backers = new Map<number, Npc[]>(field.map((c) => [c.id, []]));
  for (const v of world.npcs) {
    if (!v.alive || v.age < 16 || v.inside !== undefined) continue;
    let best = field[0];
    let top = -Infinity;
    for (const c of field) {
      const a = appeal(world, v, c, rng);
      if (a > top) [best, top] = [c, a];
    }
    votes.set(best.id, votes.get(best.id)! + 1);
    backers.get(best.id)!.push(v);
  }
  const ranked = [...field].sort((a, b) => votes.get(b.id)! - votes.get(a.id)! || standing(world, b) - standing(world, a));
  const winner = ranked[0];
  const kept = winner.id === world.kingId;
  install(world, winner);
  // Those who backed the winner warm to the new government; the rest sulk a little.
  for (const v of world.npcs) if (v.alive && v.age >= 16) loyaltyNudge(v, backers.get(winner.id)!.includes(v) ? 5 : -3);
  const r = (world.republic ??= { since: world.day, elections: 0, nextVote: 0 });
  r.elections++;
  r.nextVote = world.day + term(world);
  r.last = { day: world.day, results: ranked.map((c) => ({ id: c.id, name: c.name, votes: votes.get(c.id)! })) };
  const tally = ranked.map((c) => `${c.name} ${votes.get(c.id)} เสียง`).join(' · ');
  log(world, 'politics', `การเลือกตั้งครั้งที่ ${r.elections} (${why}): ${tally} ${winner.name}${kept ? 'ได้รับเลือกอีกสมัย' : 'ได้เป็นผู้นำสภาคนใหม่'}`, winner.id);
  return winner;
}

// The crown falls to a town that reads: instead of a new king, the people proclaim a republic.
export function proclaimRepublic(world: WorldState, leader: Npc, rng: Rng): void {
  log(world, 'politics', `${leader.name}ประกาศว่าเมืองนี้จะไม่มีกษัตริย์อีกต่อไป ชาวเมืองจะเลือกผู้นำของตนเอง สาธารณรัฐถือกำเนิดขึ้น!`, leader.id);
  world.regime = 'republic';
  world.republic = { since: world.day, elections: 0, nextVote: 0 };
  writeCharter(world, 'สาธารณรัฐถือกำเนิด');
  legend(world, `${leader.name} ก่อตั้งสาธารณรัฐ`, leader.id);
  election(world, rng, 'ครั้งแรกของสาธารณรัฐ');
}

// The hero who freed the town from the demon leads it by acclaim until the next election.
export function acclaim(world: WorldState, hero: Npc, how: string): void {
  install(world, hero);
  world.republic!.nextVote = world.day + term(world);
  log(world, 'politics', `ชาวเมืองยกให้${hero.name}เป็นผู้นำสภาโดยไม่ต้องเลือกตั้ง (${how})`, hero.id);
}

// Each day under the republic: elections when the term is up, or at once if the office is empty.
export function republicDay(world: WorldState, rng: Rng): void {
  if (!isRepublic(world) || occupied(world)) return;
  const r = world.republic!;
  const leader = world.npcs.find((n) => n.id === world.kingId && n.alive && n.job === 'king');
  if (!leader) election(world, rng, 'ผู้นำคนเดิมจากไป');
  else if (charterOf(world).emergency) r.nextVote = Math.max(r.nextVote, world.day + 1); // no votes under emergency powers
  else if (world.day >= r.nextVote) election(world, rng, 'ครบวาระ');
  else if ((world.crown?.unrest ?? 0) >= 2 && chance(rng, 0.5)) {
    world.crown!.unrest = 0;
    election(world, rng, 'ชาวเมืองไม่พอใจ เรียกร้องให้เลือกตั้งใหม่');
  }
}
