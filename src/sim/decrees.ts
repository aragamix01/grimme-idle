// Royal decrees: the king answers the town's troubles with policy, each kind of king in his
// own way. A decree is issued at the start of a month when its need is plain, costs the
// treasury what it costs, runs a while, and can't be issued again for a season.
import { chance, int, pick, type Rng } from './rng';
import { decreeActive, log, loyaltyNudge } from './core';
import { leaveTrade } from './society';
import { priceRatio } from './market';
import { king, payrollReserve } from './society';
import { traveller } from './world';
import { putToCouncil } from './government';
import { TOWN_SIZE } from './town';
import type { Decree, Job, Npc, WorldState } from './types';

export interface DecreeDef {
  name: string;
  text: string; // what it does, for the kingdom tab
  days: number; // how long it stands
}

export const DECREES: Record<Decree, DecreeDef> = {
  labour: { name: 'ป่าวประกาศจ้างแรงงานต่างเมือง', text: 'ใช้ทองจ้างคนจากเมืองอื่นมาทำงานเมื่อคนในเมืองไม่พอ', days: 60 },
  subsidy: { name: 'ข้าวราคาหลวง', text: 'ท้องพระคลังออกค่าอาหารให้ครึ่งหนึ่งในยามข้าวยากหมากแพง', days: 60 },
  bounty: { name: 'ตั้งค่าหัวมอนสเตอร์', text: 'ให้รางวัลนักผจญภัยทุกครั้งที่ลงดันเจี้ยนสำเร็จ เมื่อดันเจี้ยนใกล้ทะลัก', days: 90 },
  curfew: { name: 'ประกาศเคอร์ฟิว', text: 'ห้ามออกจากบ้านยามค่ำ โจรลงมือยากขึ้น แต่ชาวเมืองอึดอัด', days: 60 },
  taxfree: { name: 'งดเก็บภาษี', text: 'พักการเก็บภาษีเพื่อเอาใจชาวเมืองที่กำลังไม่พอใจ', days: 60 },
  levy: { name: 'เกณฑ์ทหาร', text: 'บังคับชาวบ้านเข้ากองทัพในยามศึกสงครามหรือจอมมารคุกคาม', days: 30 },
};
export const DECREE_ORDER: readonly Decree[] = ['labour', 'subsidy', 'bounty', 'curfew', 'taxfree', 'levy'];

const REVIEW_DAY = 3; // day of the month the king looks over his decrees
const COOLDOWN = 180; // days before the same decree may be issued again
const VETO_WAIT = 60; // days before a decree the council blocked may be put to it again
const SPARE = 200; // gold kept back beyond the soldiers' pay
const FULL_TOWN = TOWN_SIZE;
const SHORT = 6; // residents missing before the king sends for labour
const WAGE = 35; // gold per worker: the crier, the road, and a purse to settle in
const recent = (world: WorldState, days: number, re: RegExp) => world.chronicle.filter((e) => e.day > world.day - days && re.test(e.text)).length;
const has = (k: Npc, t: Npc['traits'][number]) => k.traits.includes(t);
const LABOUR_JOBS: readonly Job[] = ['farmer', 'farmer', 'farmer', 'herder', 'herder', 'hunter', 'merchant', 'blacksmith'];

export { decreeActive };
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
const RULES: Record<Decree, { wants: (world: WorldState, k: Npc, rng: Rng) => boolean; issue: (world: WorldState, k: Npc, rng: Rng) => string }> = {
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
  // Dear bread: a kind king, or one losing the people, has the treasury pay half of every meal.
  subsidy: {
    wants: (world, k, rng) =>
      !has(k, 'greedy') && budget(world) >= 300 && (priceRatio(world, 'grain') >= 1.8 || world.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2).length >= 5) && (has(k, 'kind') || (world.crown?.unrest ?? 0) > 0 || chance(rng, 0.5)),
    issue: () => 'ท้องพระคลังจะช่วยออกค่าอาหารครึ่งหนึ่ง 60 วัน',
  },
  // A dungeon close to spilling over: gold for every adventurer who goes down and comes back.
  bounty: {
    wants: (world, k) => budget(world) >= 400 && world.dungeons.some((d) => d.power >= 60) && (has(k, 'brave') || !has(k, 'greedy') || world.treasury > 2000),
    issue: () => `จ่าย ${BOUNTY} ทองทุกครั้งที่นักผจญภัยลงดันเจี้ยนสำเร็จ 90 วัน`,
  },
  // A thieving season: a stern king locks the streets at night.
  curfew: {
    wants: (world, k) => !has(k, 'kind') && recent(world, 90, /ขโมยทอง/) >= 6,
    issue: (world) => `หลังเกิดการลักขโมย ${recent(world, 90, /ขโมยทอง/)} ครั้งในสามเดือน`,
  },
  // Grumbling streets and a full treasury: let them keep their coin for a while.
  taxfree: {
    wants: (world, k) => budget(world) >= 800 && approvalOf(world) < 40 && (has(k, 'kind') || (world.crown?.unrest ?? 0) > 0),
    issue: () => 'ชาวเมืองไม่ต้องจ่ายภาษี 60 วัน',
  },
  // War at the gates or the demon lord awake, and too few under arms: press commoners into service.
  levy: {
    wants: (world) => (!!world.war || world.demon?.stage === 'risen') && pressable(world).length >= 3 && world.npcs.filter((n) => n.alive && n.job === 'soldier').length < 10,
    issue: (world, _k, rng) => {
      const taken = pressable(world).slice(0, int(rng, 3, 4));
      for (const n of taken) {
        leaveTrade(n);
        n.job = 'soldier';
        n.plan = undefined;
        loyaltyNudge(n, -10);
      }
      return `เกณฑ์ ${taken.map((n) => n.name).join(', ')} เข้ากองทัพ`;
    },
  },
};

// Young, able commoners in trades the town can spare a hand from.
function pressable(world: WorldState): Npc[] {
  const count = (j: Job) => world.npcs.filter((n) => n.alive && n.job === j && n.age >= 16).length;
  return world.npcs.filter(
    (n) => n.alive && n.age >= 16 && n.age <= 40 && n.questId === undefined && n.inside === undefined && ['farmer', 'herder', 'hunter', 'merchant'].includes(n.job) && count(n.job) > 2 && !n.cultist,
  );
}

const approvalOf = (world: WorldState) => {
  const a = world.npcs.filter((n) => n.alive && n.age >= 16 && n.job !== 'king');
  return a.length ? a.reduce((s, n) => s + (n.loyalty ?? 50), 0) / a.length : 50;
};

export const BOUNTY = 12;

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
  const next = DECREE_ORDER.find((d) => !decreeActive(world, d) && ready(world, d) && RULES[d].wants(world, k, rng));
  if (!next) return;
  if (!putToCouncil(world, next, DECREES[next].name, k, rng)) {
    (world.decreeAt ??= {})[next] = world.day - COOLDOWN + VETO_WAIT; // the king may try again later
    return;
  }
  const what = RULES[next].issue(world, k, rng);
  (world.decrees ??= []).push({ kind: next, since: world.day, until: world.day + DECREES[next].days });
  (world.decreeAt ??= {})[next] = world.day;
  log(world, 'politics', `กษัตริย์${k.name}ออกพระราชโองการ${DECREES[next].name}: ${what}`, k.id);
}
