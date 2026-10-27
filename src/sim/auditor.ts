// The independent auditor: an office the charter may set up to watch those the watch can't
// touch. The watch chases thieves and murderers, but never the ruler, and a bought judge sits on
// the very bench that would try him. Where the charter allows it, someone who reads, trusted by
// the people and not the ruler's friend, holds the office and goes through the books each month:
// the ruler's, the officials', and the village headmen's. How hard they look depends on how
// independent they are: a ruler may pack the office with a crony or buy its holder, and a free
// press makes whatever is found impossible to bury. A ruler caught is impeached in a republic,
// stripped of the stolen gold under a crown; a headman caught loses his chair.
import { chance, int, type Rng } from './rng';
import { clamp, known, log, loyaltyNudge, occupied } from './core';
import { amend, charterOf } from './charter';
import { crownPower } from './politics';
import { king } from './society';
import { getTie } from './ties';
import { literate } from './learning';
import { isAvatar } from './avatar';
import { commit, jailed, prosecute } from './justice';
import { election } from './republic';
import { villagers } from './villages';
import type { Npc, WorldState } from './types';

const AUDIT_DAY = 9; // day of the month the auditor goes through the books
const OFFICIALS = ['noble', 'judge', 'watchman'];

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);
export const auditorOf = (world: WorldState) => world.npcs.find((n) => n.alive && n.id === world.auditor?.id);
// Crimes not yet tried and not gone cold.
const open = (world: WorldState, n: Npc) => (n.record ?? []).findIndex((r) => !r.tried && r.kind === 'corruption' && world.day - r.day <= 730);

// How independent someone would be in the office: their conscience, less their friendship with the ruler.
function independenceOf(world: WorldState, n: Npc, ruler: Npc | undefined): number {
  const tie = ruler ? getTie(world, n.id, ruler.id) : 0;
  return clamp(Math.round(55 + n.morality / 3 - Math.max(0, tie) / 2 + (n.traits.includes('brave') ? 10 : 0) - (n.traits.includes('greedy') ? 15 : 0) - (n.traits.includes('coward') ? 10 : 0)), 5, 100);
}

// Fill the office. The people (or the council) want a clean, lettered soul; a strong, grasping
// ruler puts in a friend; the merchants of an oligarchy put in one of their own.
function appoint(world: WorldState, rng: Rng): void {
  const ruler = king(world);
  const pool = adults(world).filter((n) => n.age >= 25 && n.age <= 68 && n !== ruler && literate(n) && !jailed(world, n) && !n.cultist && !isAvatar(world, n) && n.inside === undefined);
  if (!pool.length) return;
  const r = world.regime ?? 'monarchy';
  const packs = !!ruler && (ruler.traits.includes('greedy') || ruler.traits.includes('vengeful')) && crownPower(world).total >= 70;
  let pick1: Npc;
  let how: string;
  if (packs) {
    pick1 = pool.sort((a, b) => getTie(world, b.id, ruler!.id) - getTie(world, a.id, ruler!.id))[0];
    how = `ผู้ปกครอง${ruler!.name}แต่งตั้งคนสนิท`;
  } else if (r === 'oligarchy') {
    pick1 = pool.filter((n) => n.job === 'merchant').sort((a, b) => b.gold - a.gold)[0] ?? pool[0];
    how = 'สภาพ่อค้าเลือกคนของตน';
  } else {
    pick1 = pool.sort((a, b) => independenceOf(world, b, ruler) + b.level - (independenceOf(world, a, ruler) + a.level) || int(rng, -1, 1))[0];
    how = r === 'republic' ? 'สภาเลือก' : 'เหล่าขุนนางเสนอชื่อ';
  }
  const independence = clamp(independenceOf(world, pick1, ruler) - (packs ? 25 : 0) - (r === 'oligarchy' ? 15 : 0), 5, 100);
  world.auditor = { id: pick1.id, independence, cases: world.auditor?.cases ?? 0, caught: world.auditor?.caught ?? 0, since: world.day };
  log(world, 'politics', `${how} ${pick1.name}ดำรงตำแหน่งผู้ตรวจการแผ่นดิน (ความเป็นอิสระ ${independence})`, pick1.id);
}

// The office is gone: the charter no longer has it.
export function closeOffice(world: WorldState): void {
  world.auditor = undefined;
}

export function auditDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== AUDIT_DAY || occupied(world)) return;
  const c = charterOf(world);
  if (!c.auditor) {
    if (world.auditor) closeOffice(world);
    return;
  }
  if (!auditorOf(world)) appoint(world, rng);
  const a = auditorOf(world);
  const office = world.auditor;
  if (!a || !office) return;
  const ruler = king(world);
  // The ruler's purse at work: a grasping ruler buys a pliable auditor, and that too is a crime.
  if (ruler && ruler !== a && ruler.traits.includes('greedy') && (a.traits.includes('greedy') || a.morality < 0) && ruler.gold >= 150 && chance(rng, 0.3)) {
    const bribe = Math.floor(ruler.gold * 0.2);
    ruler.gold -= bribe;
    a.gold += bribe;
    office.independence = clamp(office.independence - 20, 5, 100);
    commit(world, a, 'corruption', rng, bribe);
    commit(world, ruler, 'corruption', rng, bribe);
    return;
  }
  // Otherwise independence drifts back toward the holder's own nature.
  office.independence = clamp(Math.round(office.independence + (independenceOf(world, a, ruler) - office.independence) * 0.1), 5, 100);
  const press = !!c.freePress && known(world, 'printing');
  const odds = (0.06 + a.level * 0.01 + (press ? 0.08 : 0)) * (office.independence / 100);

  // The ruler first, then the officials, then the headmen out on the lands.
  if (ruler && ruler !== a) {
    const i = open(world, ruler);
    if (i >= 0 && chance(rng, odds * 0.7)) return exposeRuler(world, ruler, i, a, press, rng);
  }
  for (const n of adults(world)) {
    if (n === a || n === ruler || !OFFICIALS.includes(n.job) || jailed(world, n)) continue;
    const i = open(world, n);
    if (i < 0 || !chance(rng, odds)) continue;
    office.cases++;
    office.caught++;
    log(world, 'politics', `ผู้ตรวจการแผ่นดิน${a.name}พบหลักฐานการทุจริตของ${n.name} ส่งเรื่องขึ้นศาล`, n.id);
    prosecute(world, n, i, rng);
  }
  for (const r of world.regions ?? []) {
    if (r.owner !== 'us' || !r.village?.chiefId) continue;
    const chief = villagers(world).find((n) => n.alive && n.id === r.village!.chiefId);
    const i = chief ? open(world, chief) : -1;
    if (!chief || i < 0 || !chance(rng, odds)) continue;
    const crime = chief.record![i];
    crime.tried = world.day;
    crime.verdict = 'guilty';
    const back = Math.min(chief.gold, crime.gold ?? 0);
    chief.gold -= back;
    r.village.purse += back;
    r.village.chiefId = undefined; // the villagers choose again at their next council
    r.village.loyalty = clamp(r.village.loyalty + 6, 0, 100); // justice from the capital, for once
    office.cases++;
    office.caught++;
    log(world, 'politics', `ผู้ตรวจการแผ่นดิน${a.name}พบว่า${chief.name}ผู้ใหญ่บ้านแห่ง${r.name}ยักยอกเงินกองกลาง ถูกปลดจากตำแหน่งและคืนเงิน ${back} ทองให้หมู่บ้าน`, chief.id);
  }
}

// The ruler is caught. In a republic the leader is impeached and stands trial as a citizen; under
// a crown the stolen gold is seized and the court is shaken; and a ruler with the power and the
// temper for it may strike back at the office itself.
function exposeRuler(world: WorldState, ruler: Npc, i: number, a: Npc, press: boolean, rng: Rng): void {
  const office = world.auditor!;
  office.cases++;
  office.caught++;
  const gold = ruler.record![i].gold ?? 0;
  const loud = press ? ' ข่าวตีพิมพ์ไปทั่วเมือง' : '';
  if (world.regime === 'republic') {
    log(world, 'politics', `ผู้ตรวจการแผ่นดิน${a.name}ยื่นถอดถอนผู้นำ${ruler.name}ฐานทุจริต ${gold} ทอง${loud} สภาลงมติถอดถอน`, ruler.id);
    for (const n of adults(world)) if (n !== ruler) loyaltyNudge(n, press ? 4 : 2); // the system worked
    world.republic!.impeached = ruler.id;
    election(world, rng, 'ผู้นำถูกถอดถอน');
    if (world.kingId !== ruler.id) prosecute(world, ruler, i, rng);
    return;
  }
  const crime = ruler.record![i];
  crime.tried = world.day;
  crime.verdict = 'guilty';
  const seized = Math.min(ruler.gold, Math.max(gold, Math.floor(ruler.gold / 2)));
  ruler.gold -= seized;
  world.treasury += seized;
  for (const n of adults(world)) if (n !== ruler) loyaltyNudge(n, press ? -6 : -3);
  if (world.crown) world.crown.unrest += 1;
  log(world, 'politics', `ผู้ตรวจการแผ่นดิน${a.name}เปิดโปงว่ากษัตริย์${ruler.name}ยักยอกท้องพระคลัง ริบทรัพย์คืน ${seized} ทอง${loud}`, ruler.id);
  // A strong, vengeful or grasping ruler hits back: the office is abolished.
  if ((ruler.traits.includes('vengeful') || ruler.traits.includes('greedy')) && crownPower(world).total >= 60 && chance(rng, 0.5)) {
    for (const n of adults(world)) if (literate(n)) loyaltyNudge(n, -8);
    amend(world, { auditor: false }, `กษัตริย์${ruler.name}ยุบองค์กรอิสระหลังถูกตรวจสอบ ปลด${a.name}ออกจากตำแหน่ง ชาวเมืองที่อ่านออกเขียนได้ไม่พอใจ`);
    closeOffice(world);
  } else if (chance(rng, 0.3)) a.level++; // the auditor's name is made
}
