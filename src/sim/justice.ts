// Crime and the law. Every theft, murder and dipping into the treasury goes on the offender's
// record, whether or not anyone knows yet. Watchmen catch thieves in the act and, month by
// month, run down the rest; a judge hears each case (the ruler, where there is none), a lawyer
// argues for those who can pay one, and a judge with an itch in the palm may be bought. The
// guilty are fined, jailed in the castle's cells, driven out, or hanged, as the crime and the
// kind of government decide. A bought verdict is itself corruption, and goes on the judge's record.
import { chance, int, pick, type Rng } from './rng';
import { clamp, kill, log, loyaltyNudge, occupied } from './core';
import { getTie } from './ties';
import { king } from './society';
import { jobName } from './ages';
import { isAvatar } from './avatar';
import type { CrimeKind, Npc, WorldState } from './types';

export const CRIME_TH: Record<CrimeKind, string> = { theft: 'ลักทรัพย์', murder: 'ฆาตกรรม', corruption: 'ทุจริต' };
const DAY = 6; // day of the month the watch follows up old crimes
const COLD = 365; // days after which a crime is no longer chased
const WATCH_PAY = 1; // gold a day for a watchman
const JUDGE_PAY = 2;
const LAWYER_FEE = 20;
const MURDER_CHANCE = 0.12; // monthly, for a wicked soul with a bitter enemy
const SKIM = 0.02; // of the treasury a greedy official takes in a month

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);
const living = (world: WorldState, job: string) => adults(world).filter((n) => n.job === job);
export const jailed = (world: WorldState, n: Npc) => (n.jailedUntil ?? 0) > world.day;
const justiceOf = (world: WorldState) => (world.justice ??= { cases: 0, convicted: 0, acquitted: 0, bribes: 0, executions: 0, corruption: 0 });

// An offence goes on the record. Caught in the act, it comes to trial at once.
export function commit(world: WorldState, n: Npc, kind: CrimeKind, rng: Rng, gold = 0, victimId?: number, caught = false): void {
  (n.record ??= []).push({ kind, day: world.day, gold: gold || undefined, victimId });
  if (kind === 'corruption') justiceOf(world).corruption += gold;
  if (caught) trial(world, n, n.record.length - 1, rng);
}

// Someone with murder in their heart and a bitter enemy acts on it.
function murders(world: WorldState, rng: Rng): void {
  for (const n of adults(world)) {
    if (n.morality > -10 || isAvatar(world, n) || jailed(world, n) || n.inside !== undefined || !n.traits.some((t) => t === 'vengeful' || t === 'greedy')) continue;
    const foe = adults(world).find((o) => o !== n && o.inside === undefined && !o.hero && getTie(world, n.id, o.id) <= -45);
    if (!foe || !chance(rng, MURDER_CHANCE)) continue;
    kill(world, foe, 'ถูกฆาตกรรมอย่างเลือดเย็น ไม่มีใครรู้ว่าใครเป็นคนลงมือ');
    n.morality = clamp(n.morality - 20, -100, 100);
    commit(world, n, 'murder', rng, 0, foe.id);
  }
}

// Officials with sticky fingers: a greedy noble, judge or watch captain skims the treasury.
function skims(world: WorldState, rng: Rng): void {
  for (const n of adults(world)) {
    if (!['noble', 'judge', 'watchman'].includes(n.job) || !n.traits.includes('greedy') || n.morality > 0 || !chance(rng, 0.3)) continue;
    const take = Math.floor(world.treasury * SKIM);
    if (take < 5) continue;
    world.treasury -= take;
    n.gold += take;
    commit(world, n, 'corruption', rng, take);
  }
}

// The watch follows up: each open case may be cracked, likelier with more watchmen and judges.
function investigate(world: WorldState, rng: Rng): void {
  const watch = living(world, 'watchman').length + living(world, 'soldier').length * 0.2;
  const odds = Math.min(0.6, 0.05 + watch * 0.06);
  for (const n of adults(world)) {
    if (jailed(world, n) || n.job === 'king') continue;
    const i = (n.record ?? []).findIndex((r) => !r.tried && world.day - r.day <= COLD);
    if (i < 0 || !chance(rng, odds * (n.record![i].kind === 'murder' ? 1.3 : 1))) continue;
    log(world, 'politics', `ยามสืบจนพบว่า${n.name}คือผู้ก่อคดี${CRIME_TH[n.record![i].kind]} ถูกจับตัวขึ้นศาล`, n.id);
    trial(world, n, i, rng);
  }
}

// Bring an offence on someone's record to trial now (the auditor's cases go straight to court).
export const prosecute = (world: WorldState, n: Npc, i: number, rng: Rng) => trial(world, n, i, rng);

// The trial: a judge (or the ruler) hears it; a lawyer may sway it; a bribe may buy it.
function trial(world: WorldState, n: Npc, i: number, rng: Rng): void {
  const crime = n.record![i];
  crime.tried = world.day;
  const j = justiceOf(world);
  j.cases++;
  const judge = pick(rng, living(world, 'judge').filter((x) => x !== n)) ?? king(world);
  const bench = judge ? `${judge.job === 'judge' ? jobName(world, 'judge') : 'ผู้ปกครอง'}${judge.name}` : 'ชาวเมือง';
  // A bought judge: the rich defendant pays half their purse and walks free.
  if (judge && judge !== n && (judge.traits.includes('greedy') || judge.morality < -10) && n.gold >= 100 && chance(rng, 0.6)) {
    const bribe = Math.floor(n.gold / 2);
    n.gold -= bribe;
    judge.gold += bribe;
    crime.verdict = 'acquitted';
    j.acquitted++;
    j.bribes++;
    commit(world, judge, 'corruption', rng, bribe);
    log(world, 'politics', `${bench}ตัดสินให้${n.name}พ้นผิดคดี${CRIME_TH[crime.kind]} ชาวเมืองลือกันว่ามีการจ่ายใต้โต๊ะ`, n.id);
    return;
  }
  // A lawyer for those who can pay: a fair chance at doubt.
  const lawyer = n.gold >= LAWYER_FEE ? living(world, 'lawyer').find((x) => x !== n) : undefined;
  if (lawyer) {
    n.gold -= LAWYER_FEE;
    lawyer.gold += LAWYER_FEE;
  }
  if (chance(rng, lawyer ? 0.35 : 0.12)) {
    crime.verdict = 'acquitted';
    j.acquitted++;
    log(world, 'politics', `${bench}ตัดสินให้${n.name}พ้นผิดคดี${CRIME_TH[crime.kind]}เพราะหลักฐานไม่พอ${lawyer ? ` (${jobName(world, 'lawyer')}${lawyer.name}ว่าความให้)` : ''}`, n.id);
    return;
  }
  j.convicted++;
  sentence(world, n, crime, judge, bench, rng);
}

// The sentence, by the crime, the offender's past, the judge's heart and the regime.
function sentence(world: WorldState, n: Npc, crime: NonNullable<Npc['record']>[number], judge: Npc | undefined, bench: string, rng: Rng): void {
  const priors = (n.record ?? []).filter((r) => r.verdict === 'guilty').length;
  crime.verdict = 'guilty';
  const r = world.regime ?? 'monarchy';
  const merciful = !!judge?.traits.includes('kind') || r === 'republic';
  const harsh = !!judge?.traits.includes('vengeful') || r === 'junta' || r === 'theocracy';
  const jail = (days: number, what: string) => {
    n.jailedUntil = world.day + days;
    n.plan = undefined;
    log(world, 'politics', `${bench}ตัดสินให้${n.name}มีความผิดฐาน${CRIME_TH[crime.kind]} ${what}จำคุก ${days} วัน`, n.id);
  };
  switch (crime.kind) {
    case 'theft': {
      const fine = Math.floor(n.gold / 2);
      n.gold -= fine;
      world.treasury += fine;
      return jail(priors >= 2 ? 120 : 30, fine ? `ปรับ ${fine} ทองและ` : '');
    }
    case 'corruption': {
      const back = Math.min(n.gold, crime.gold ?? 0);
      n.gold -= back;
      world.treasury += back;
      if (n.job === 'judge' || n.job === 'watchman' || n.job === 'noble') {
        log(world, 'politics', `${n.name}ถูกปลดจากตำแหน่ง${jobName(world, n.job)}`, n.id);
        n.job = 'farmer';
      }
      return jail(harsh ? 240 : 120, back ? `คืนเงิน ${back} ทองให้คลังและ` : '');
    }
    case 'murder':
      if (!merciful && (harsh || chance(rng, 0.5))) {
        justiceOf(world).executions++;
        log(world, 'politics', `${bench}ตัดสินประหารชีวิต${n.name}ฐานฆาตกรรม`, n.id);
        for (const o of adults(world)) loyaltyNudge(o, o.traits.includes('kind') ? -1 : 1);
        return kill(world, n, 'ถูกประหารชีวิตฐานฆาตกรรม');
      }
      if (chance(rng, 0.3)) {
        n.alive = false;
        n.left = true;
        n.plan = undefined;
        log(world, 'politics', `${bench}ตัดสินเนรเทศ${n.name}ออกจากเมืองตลอดกาลฐานฆาตกรรม`, n.id);
        return;
      }
      return jail(int(rng, 2, 4) * 365, '');
  }
}

// Each day: the watch and the bench are paid; prisoners sit in the cells and are let out on time.
export function justiceDay(world: WorldState, rng: Rng): void {
  for (const w of living(world, 'watchman')) if (world.treasury >= WATCH_PAY) (world.treasury -= WATCH_PAY), (w.gold += WATCH_PAY);
  for (const j of living(world, 'judge')) if (world.treasury >= JUDGE_PAY) (world.treasury -= JUDGE_PAY), (j.gold += JUDGE_PAY);
  for (const n of adults(world)) {
    if (n.jailedUntil === undefined || n.jailedUntil > world.day) continue;
    n.jailedUntil = undefined;
    n.morality = clamp(n.morality + 2, -100, 100); // some come out sorry
    log(world, 'politics', `${n.name}พ้นโทษออกจากคุก`, n.id);
  }
  if (world.day % 30 !== DAY || occupied(world)) return;
  murders(world, rng);
  skims(world, rng);
  investigate(world, rng);
}
