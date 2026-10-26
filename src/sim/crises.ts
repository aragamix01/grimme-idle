// Political crises: what a long calm does to a town's politics. Alongside the golden age's other
// troubles, the ruler may be caught with their hand in the treasury, the workers may down tools,
// someone with a grudge may try for the ruler's life, or the council may dig in against everything.
// And comfort itself corrodes: in a long golden age some townsfolk grow greedy and hard.
import { chance, pick, type Rng } from './rng';
import { kill, log, loyaltyNudge } from './core';
import { charterOf } from './charter';
import { loyaltyOf } from './politics';
import { king } from './society';
import type { WorldState } from './types';

const STRIKE_DAYS = 30;
const DEADLOCK_DAYS = 120;
const WORKERS = ['farmer', 'herder', 'hunter', 'blacksmith'] as const;
const STRIKE_HOME = 0.7; // an assassin's chance against an unguarded ruler
const GUARD = 0.06; // each soldier or knight about the ruler blunts it

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);
const living = (world: WorldState, job: string) => adults(world).filter((n) => n.job === job);

// The ruler's riches come out: their purse is seized for the treasury, and the town is furious.
export function rulerScandal(world: WorldState): boolean {
  const ruler = king(world);
  if (!ruler || (ruler.gold < 150 && ruler.morality >= 0)) return false;
  const seized = Math.floor(ruler.gold / 2);
  ruler.gold -= seized;
  world.treasury += seized;
  for (const n of adults(world)) if (n !== ruler) loyaltyNudge(n, -10);
  if (world.crown) world.crown.unrest += 1; // a republic calls an early vote on it
  log(world, 'politics', `ข่าวฉาวสะเทือนเมือง! กษัตริย์${ruler.name}ถูกแฉว่ายักยอกทอง ${seized} เหรียญถูกริบคืนเข้าท้องพระคลัง`, ruler.id);
  return true;
}

// The workers down tools over high taxes or a few growing fat: the fields half-tended for a month.
export function strike(world: WorldState, rng: Rng): boolean {
  const ruler = king(world);
  const rich = adults(world).sort((a, b) => b.gold - a.gold)[0];
  const grievance = world.crown?.tax === 'high' || (rich?.gold ?? 0) >= 500;
  const workers = adults(world).filter((n) => (WORKERS as readonly string[]).includes(n.job));
  if (!ruler || !grievance || workers.length < 8) return false;
  world.strike = world.day + STRIKE_DAYS;
  const leader = pick(rng, workers);
  log(world, 'politics', `${leader.name}นำคนงาน ${workers.length} คนนัดหยุดงานประท้วง${world.crown?.tax === 'high' ? 'ภาษีที่สูงเกินไป' : 'ความเหลื่อมล้ำ'} ทุ่งนาถูกทิ้งร้างครึ่งหนึ่ง`, leader.id);
  // A kind ruler pays up; a hard one sends the soldiers.
  if (ruler.traits.includes('kind') && world.treasury >= workers.length * 5) {
    world.treasury -= workers.length * 5;
    for (const n of workers) {
      n.gold += 5;
      loyaltyNudge(n, 8);
    }
    world.strike = world.day + 7;
    log(world, 'politics', `กษัตริย์${ruler.name}ยอมเจรจา แจกค่าแรงชดเชยคนละ 5 ทอง คนงานกลับไปทำงาน`, ruler.id);
  } else if (ruler.traits.includes('greedy') || ruler.traits.includes('vengeful')) {
    for (const n of workers) loyaltyNudge(n, -12);
    if (living(world, 'soldier').length && chance(rng, 0.5)) kill(world, leader, 'ถูกทหารจับกุมระหว่างสลายการชุมนุม และไม่ได้กลับมาอีกเลย');
  }
  return true;
}

// Someone who hates the ruler tries for their life; the guard is not always there.
export function assassination(world: WorldState, rng: Rng): boolean {
  const ruler = king(world);
  if (!ruler) return false;
  const assassin = adults(world)
    .filter((n) => n !== ruler && n.inside === undefined && loyaltyOf(n) < 50 && (n.cultist || n.traits.includes('vengeful') || n.morality < -10))
    .sort((a, b) => loyaltyOf(a) - loyaltyOf(b))[0];
  if (!assassin) return false;
  const guards = living(world, 'soldier').length + world.npcs.filter((n) => n.alive && n.knight).length;
  if (chance(rng, STRIKE_HOME / (1 + guards * GUARD))) {
    log(world, 'politics', `${assassin.name}ลอบสังหารกษัตริย์${ruler.name}กลางงานพิธี!`, assassin.id);
    kill(world, ruler, 'ถูกลอบสังหาร');
    if (chance(rng, 0.6)) kill(world, assassin, 'ถูกองครักษ์สังหารทันทีหลังลงมือ');
  } else {
    kill(world, assassin, `ลอบสังหารกษัตริย์${ruler.name}ไม่สำเร็จ ถูกจับและประหาร`);
    for (const n of adults(world)) loyaltyNudge(n, 4); // the town rallies round
  }
  return true;
}

// The council turns against everything the ruler wants for a season.
export function deadlock(world: WorldState, rng: Rng): boolean {
  const ruler = king(world);
  const seats = adults(world).filter((n) => n.job === 'noble');
  if (!ruler || seats.length < 2 || !charterOf(world).councilVeto) return false;
  const c = (world.council ??= { vetoes: 0, overrides: 0 });
  c.deadlock = world.day + DEADLOCK_DAYS;
  log(world, 'politics', `สภาขุนนางทะเลาะกับกษัตริย์${ruler.name}อย่างรุนแรง ประกาศคว่ำทุกข้อเสนอจนกว่าจะพ้นฤดูนี้`, pick(rng, seats).id);
  return true;
}

// Monthly in a long golden age: ease makes a few hearts harder.
export function decadence(world: WorldState, rng: Rng): void {
  for (const n of adults(world)) if (chance(rng, 0.05)) n.morality = Math.max(-100, n.morality - 6);
}
