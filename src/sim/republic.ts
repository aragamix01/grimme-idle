// The republic: no crown, only an office the townsfolk fill by vote every few years. The field
// mixes the establishment with new faces: the sitting leader (unless the charter's term limit
// bars them), the most prominent of the rest, a populist the poor love, and a reformer who reads.
// Each voter the charter lets vote backs whoever they are closest to, who shares their trade, or
// who speaks for their purse; a leader long in office wears on them, and is blamed for the
// famines, plagues and lost wars of their term. Where there is a free press, scandal can sink anyone.
import { chance, next, type Rng } from './rng';
import { known } from './core';
import { log, loyaltyNudge, occupied } from './core';
import { legend } from './quests';
import { ensureCrown, loyaltyOf } from './politics';
import { leaveTrade } from './society';
import { getTie } from './ties';
import { literate } from './learning';
import { charterOf, writeCharter } from './charter';
import { champion, endorsements } from './adventurers';
import { general, openParliament, partiesOf } from './parties';
import type { Npc, WorldState } from './types';

// Days between elections, as the charter sets them.
const term = (world: WorldState) => (charterOf(world).termYears || 3) * 365;
const RICH = 60; // a voter this well off votes with their purse
const FATIGUE = 0.35; // appeal a leader loses for each year in office
const BLAME = 0.6; // and for each disaster of their term (most 4)
const SCANDAL = -2.5; // appeal lost by a candidate the press has exposed

export const isRepublic = (world: WorldState) => world.regime === 'republic';

// How prominent someone is: wealth, deeds, friends, letters.
export function standing(world: WorldState, n: Npc): number {
  const friends = world.npcs.filter((o) => o.alive && o !== n && getTie(world, n.id, o.id) >= 40).length;
  return n.gold / 40 + n.level * 0.5 + (n.renown ?? 0) / 10 + friends * 0.4 + (literate(n) ? 1 : 0) + (n.job === 'noble' ? 1 : 0);
}
const friendsOf = (world: WorldState, n: Npc) => world.npcs.filter((o) => o.alive && o !== n && getTie(world, n.id, o.id) >= 15).length;

// The field: the sitting leader if the charter allows another term, the most prominent of the
// rest, a populist (the poor's best-liked kind or brave soul), and a reformer who reads.
function candidates(world: WorldState): { field: Npc[]; barred?: Npc } {
  const r = world.republic;
  const limit = charterOf(world).termLimit;
  const sitting = world.npcs.find((n) => n.id === world.kingId && n.alive && n.job === 'king');
  const barred = sitting && ((limit !== null && (r?.streak ?? 0) >= limit) || r?.impeached === sitting.id) ? sitting : undefined;
  const eligible = world.npcs.filter((n) => n.alive && n.age >= 25 && n.age <= 68 && n.job !== 'thief' && !n.cultist && n.questId === undefined && n.inside === undefined && n !== sitting);
  const field: Npc[] = sitting && !barred ? [sitting] : [];
  const add = (n?: Npc) => n && !field.includes(n) && field.push(n);
  add(eligible.slice().sort((a, b) => standing(world, b) - standing(world, a))[0]);
  add(eligible.filter((n) => n.gold < RICH && (n.traits.includes('kind') || n.traits.includes('brave'))).sort((a, b) => friendsOf(world, b) - friendsOf(world, a))[0]);
  add(eligible.filter((n) => literate(n) && n.morality > 20).sort((a, b) => b.level + b.morality / 20 - (a.level + a.morality / 20))[0]);
  add(champion(eligible)); // an adventurer whose name is known in every tavern
  if (field.length < 2) add(eligible.sort((a, b) => standing(world, b) - standing(world, a)).find((n) => !field.includes(n)));
  return { field, barred };
}

// Who the charter lets vote.
export function mayVote(world: WorldState, v: Npc): boolean {
  if (!v.alive || v.age < 16 || v.inside !== undefined) return false;
  const f = charterOf(world).franchise;
  return f === 'propertied' ? v.gold >= 30 : f === 'lettered' ? literate(v) : true;
}

// The disasters of the sitting leader's time in office.
function blameOf(world: WorldState): number {
  const since = world.republic?.inOffice ?? world.crown?.since ?? 0;
  const bad = world.chronicle.filter((e) => e.day > since && /ข้าวหมดตลาด|ความหิวโหย|โรคระบาดในเมือง|แพ้สงคราม|มอนสเตอร์ล้นออกจาก|ไม่ส่งความช่วยเหลือ/.test(e.text)).length;
  return Math.min(4, bad);
}

// One voter's pull toward one candidate. `wear` is what the sitting leader's years and failures cost them.
function appeal(world: WorldState, v: Npc, c: Npc, rng: Rng, wear: number, shamed: Set<number>): number {
  if (v === c) return 100; // everyone votes for themselves
  const trade = (c.formerJob ?? c.job) === v.job ? 1 : 0;
  const purse = v.gold >= RICH ? (c.gold >= 100 || c.traits.includes('greedy') ? 1 : 0) : (c.traits.includes('kind') ? 1.2 : 0) + (c.gold < RICH ? 0.5 : 0);
  const sitting = c.id === world.kingId ? (loyaltyOf(v) - 50) / 25 - wear : 0; // the content keep the incumbent, the angry and the bored throw them out
  const danger = c.traits.includes('brave') && (world.war || world.demon) ? 1 : 0;
  return getTie(world, v.id, c.id) / 20 + trade + purse + sitting + danger + (shamed.has(c.id) ? SCANDAL : 0) + next(rng) * 2 - 1;
}

// With printing, broadsheets dig up the wicked and the grasping among the candidates.
function scandals(world: WorldState, field: Npc[], rng: Rng): Set<number> {
  const out = new Set<number>();
  if (!known(world, 'printing')) return out;
  for (const c of field) {
    const dirt = c.morality < -10 ? 'เรื่องเลวร้ายในอดีต' : c.gold >= 300 ? 'ทรัพย์สินที่ได้มาอย่างน่าสงสัย' : undefined;
    if (!dirt || !chance(rng, 0.5)) continue;
    out.add(c.id);
    log(world, 'politics', `ใบปลิวทั่วเมืองเปิดโปง${dirt}ของ${c.name} ผู้สมัครรับเลือกตั้ง`, c.id);
  }
  return out;
}

// Put the winner in office; the one they replace goes back to their old trade.
export function install(world: WorldState, winner: Npc): void {
  const old = world.npcs.find((n) => n.id === world.kingId);
  const r = world.republic;
  if (r) {
    r.streak = old === winner ? (r.streak ?? 1) + 1 : 1;
    if (old !== winner) r.inOffice = world.day;
  }
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
  if (old === winner) return; // the same face: the street's anger stands, and so does their time in office
  crown.since = world.day;
  crown.unrest = 0;
}

// Hold an election now. Returns the winner, if anyone stood.
export function election(world: WorldState, rng: Rng, why: string): Npc | undefined {
  // Where parties stand, the town elects a house and the house makes the leader.
  if (partiesOf(world).length >= 2) {
    const head = general(world, rng, why);
    const r = (world.republic ??= { since: world.day, elections: 0, nextVote: 0 });
    r.impeached = undefined;
    r.elections++;
    r.nextVote = world.parliament?.nextVote ?? world.day + term(world);
    if (head) return head;
  }
  const { field, barred } = candidates(world);
  if (!field.length) return undefined;
  if (barred) log(world, 'politics', world.republic?.impeached === barred.id ? `${barred.name}ถูกถอดถอน หมดสิทธิ์ลงสมัคร` : `${barred.name}ดำรงตำแหน่งครบ ${charterOf(world).termLimit} สมัยตามรัฐธรรมนูญแล้ว ลงสมัครอีกไม่ได้`, barred.id);
  const years = (world.day - (world.republic?.inOffice ?? world.crown?.since ?? world.day)) / 365;
  const wear = years * FATIGUE + blameOf(world) * BLAME;
  const shamed = scandals(world, field, rng);
  const votes = new Map(field.map((c) => [c.id, 0]));
  const backers = new Map<number, Npc[]>(field.map((c) => [c.id, []]));
  const backed = endorsements(world, field); // guild members follow their guild's choice
  for (const v of world.npcs) {
    if (!mayVote(world, v)) continue;
    let best = field[0];
    let top = -Infinity;
    for (const c of field) {
      const a = appeal(world, v, c, rng, wear, shamed) + (v.guildId !== undefined && backed.get(v.guildId) === c.id ? 1.5 : 0);
      if (a > top) [best, top] = [c, a];
    }
    votes.set(best.id, votes.get(best.id)! + 1);
    backers.get(best.id)!.push(v);
  }
  rig(world, field, votes, rng);
  let ranked = [...field].sort((a, b) => votes.get(b.id)! - votes.get(a.id)! || standing(world, b) - standing(world, a));
  // No one has half the votes: the top two go to a second round.
  const cast = [...votes.values()].reduce((s, x) => s + x, 0);
  let final = field;
  if (ranked.length > 2 && votes.get(ranked[0].id)! * 2 <= cast) {
    log(world, 'politics', `ไม่มีใครได้เสียงเกินครึ่ง ${ranked[0].name}และ${ranked[1].name}เข้ารอบสอง`, ranked[0].id);
    const two = ranked.slice(0, 2);
    for (const c of field) {
      votes.set(c.id, 0);
      backers.set(c.id, []);
    }
    for (const v of world.npcs) {
      if (!mayVote(world, v)) continue;
      const a = two.map((c) => appeal(world, v, c, rng, wear, shamed) + (v.guildId !== undefined && backed.get(v.guildId) === c.id ? 1.5 : 0));
      const best = a[0] >= a[1] ? two[0] : two[1];
      votes.set(best.id, votes.get(best.id)! + 1);
      backers.get(best.id)!.push(v);
    }
    final = two;
  }
  ranked = [...final].sort((a, b) => votes.get(b.id)! - votes.get(a.id)! || standing(world, b) - standing(world, a));
  const winner = ranked[0];
  const kept = winner.id === world.kingId;
  install(world, winner);
  // Those who backed the winner warm to the new government; the rest sulk a little.
  for (const v of world.npcs) if (v.alive && v.age >= 16) loyaltyNudge(v, backers.get(winner.id)!.includes(v) ? 5 : -3);
  const r = (world.republic ??= { since: world.day, elections: 0, nextVote: 0 });
  r.impeached = undefined;
  r.elections++;
  r.nextVote = world.day + term(world);
  r.last = { day: world.day, results: ranked.map((c) => ({ id: c.id, name: c.name, votes: votes.get(c.id)! })) };
  const tally = ranked.map((c) => `${c.name} ${votes.get(c.id)} เสียง`).join(' · ');
  log(world, 'politics', `การเลือกตั้งครั้งที่ ${r.elections} (${why}): ${tally} ${winner.name}${kept ? 'ได้รับเลือกอีกสมัย' : 'ได้เป็นผู้นำสภาคนใหม่'}`, winner.id);
  independents(world, rng);
  return winner;
}

// With no parties yet the town still elects its house, one person at a time: the most prominent
// stand, each voter backs the one they are closest to, and the top vote-getters take the seats.
function independents(world: WorldState, rng: Rng): void {
  const voters = world.npcs.filter((v) => mayVote(world, v));
  const seats = Math.max(5, Math.min(15, Math.round(voters.length / 6))) | 1;
  const pool = world.npcs.filter((n) => n.alive && n.age >= 20 && n.job !== 'king' && n.job !== 'thief' && !n.cultist && n.inside === undefined).sort((a, b) => standing(world, b) - standing(world, a)).slice(0, seats * 2);
  if (pool.length < 2) return;
  const votes = new Map(pool.map((c) => [c.id, 0]));
  for (const v of voters) {
    let best = pool[0];
    let top = -Infinity;
    for (const c of pool) {
      const a = appeal(world, v, c, rng, 0, new Set());
      if (a > top) [best, top] = [c, a];
    }
    votes.set(best.id, votes.get(best.id)! + 1);
  }
  openParliament(world);
  const house = world.parliament!;
  house.independents = [...pool].sort((a, b) => votes.get(b.id)! - votes.get(a.id)! || standing(world, b) - standing(world, a)).slice(0, seats).map((n) => n.id);
  house.seats = house.independents.length;
  house.coalition = [];
  for (const p of partiesOf(world)) {
    p.mps = [];
    p.seats = 0;
  }
}

// A grasping incumbent losing the count has the ballot boxes stuffed. Where there is a press, the
// broadsheets may find out, and the street hears of it.
function rig(world: WorldState, field: Npc[], votes: Map<number, number>, rng: Rng): void {
  const sitting = field.find((c) => c.id === world.kingId);
  if (!sitting || sitting.morality >= 0 || !(sitting.traits.includes('greedy') || sitting.traits.includes('vengeful'))) return;
  const best = Math.max(...field.filter((c) => c !== sitting).map((c) => votes.get(c.id)!), 0);
  if (votes.get(sitting.id)! > best || !chance(rng, 0.4)) return;
  const rest = field.filter((c) => c !== sitting).reduce((s, c) => s + votes.get(c.id)!, 0);
  votes.set(sitting.id, Math.max(best, rest) + 1 + Math.floor(next(rng) * 4)); // enough to win outright, with no second round to face
  if (!known(world, 'printing') || !chance(rng, charterOf(world).freePress ? 0.8 : 0.4)) return;
  ensureCrown(world).unrest += 3;
  for (const v of world.npcs) if (v.alive && v.age >= 16 && literate(v)) loyaltyNudge(v, -8);
  log(world, 'politics', `ใบปลิวทั่วเมืองเปิดโปงว่า${sitting.name}สั่งยัดหีบบัตรเลือกตั้ง ชาวเมืองโกรธแค้น`, sitting.id);
}

// The crown falls to a town that reads: instead of a new king, the people proclaim a republic.
export function proclaimRepublic(world: WorldState, leader: Npc, rng: Rng, text = `${leader.name}ประกาศว่าเมืองนี้จะไม่มีกษัตริย์อีกต่อไป ชาวเมืองจะเลือกผู้นำของตนเอง สาธารณรัฐถือกำเนิดขึ้น!`): void {
  log(world, 'politics', text, leader.id);
  world.regime = 'republic';
  world.republic = { since: world.day, elections: 0, nextVote: 0 };
  world.commune = undefined;
  writeCharter(world, 'สาธารณรัฐถือกำเนิด');
  openParliament(world);
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
  else if (world.day >= r.nextVote) election(world, rng, 'ครบวาระ'); // an angry street calls early votes through its movement (movements.ts)
}
