// The town's constitution: a handful of clauses that say how power works here, written when a
// regime takes over and amended by the town itself as rulers, councils and crises push on it.
// It decides how long a leader's term runs and how many they may serve, who may vote, whether
// the council can block decrees, how high taxes may go, whether the faith is the state's, and
// whether the ruler holds emergency powers.
import { log } from './core';
import type { Charter, Regime, Tax, WorldState } from './types';

const KEPT = 8; // amendments the record remembers

export const FRANCHISE_TH: Record<Charter['franchise'], string> = {
  none: 'ไม่มีการเลือกตั้ง',
  all: 'ผู้ใหญ่ทุกคนมีสิทธิ์เลือกตั้ง',
  propertied: 'เฉพาะผู้มีทรัพย์สิน 30 ทองขึ้นไป',
  lettered: 'เฉพาะผู้ที่อ่านออกเขียนได้',
};

// What each regime writes for itself when it takes power.
function draft(r: Regime): Omit<Charter, 'written' | 'amendments'> {
  switch (r) {
    case 'republic':
      return { termYears: 3, termLimit: 2, franchise: 'all', councilVeto: true, taxCap: null, stateFaith: false };
    case 'theocracy':
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: true, taxCap: null, stateFaith: true };
    case 'oligarchy':
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: true, taxCap: 'normal', stateFaith: false };
    case 'junta':
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: false, taxCap: null, stateFaith: false, emergency: true };
    default:
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: true, taxCap: null, stateFaith: false };
  }
}

// Saves from before the charter get the one their regime would have written.
export function charterOf(world: WorldState): Charter {
  return (world.charter ??= { ...draft(world.regime ?? 'monarchy'), written: world.day, amendments: [] });
}

// A new regime tears up the old charter and writes its own.
export function writeCharter(world: WorldState, why: string): void {
  world.charter = { ...draft(world.regime ?? 'monarchy'), written: world.day, amendments: [] };
  log(world, 'politics', `ร่างรัฐธรรมนูญฉบับใหม่ขึ้น (${why})`);
}

// Change one clause and put it on the record.
export function amend(world: WorldState, change: Partial<Charter>, text: string): void {
  const c = charterOf(world);
  Object.assign(c, change);
  c.amendments = [...c.amendments, { day: world.day, text }].slice(-KEPT);
  log(world, 'politics', `แก้ไขรัฐธรรมนูญ: ${text}`);
}

// The clauses as the kingdom tab lists them.
export function clauses(c: Charter): string[] {
  const out: string[] = [];
  if (c.termYears) out.push(`วาระผู้นำ ${c.termYears} ปี · ${c.termLimit ? `ดำรงตำแหน่งได้ไม่เกิน ${c.termLimit} สมัยติดต่อกัน` : 'ไม่จำกัดจำนวนสมัย'}`);
  out.push(FRANCHISE_TH[c.franchise]);
  out.push(c.councilVeto ? 'สภายับยั้งคำสั่งของผู้ปกครองได้' : 'สภาไม่มีอำนาจยับยั้ง');
  out.push(c.taxCap ? `ภาษีเก็บได้ไม่เกินระดับ${TAX_WORD[c.taxCap]}` : 'ผู้ปกครองกำหนดภาษีได้ตามใจ');
  out.push(c.stateFaith ? 'ศาสนาของเทพเจ้าเป็นศาสนาประจำรัฐ' : 'แยกศาสนาออกจากรัฐ');
  if (c.emergency) out.push('ประกาศภาวะฉุกเฉิน ผู้ปกครองมีอำนาจเด็ดขาด งดการเลือกตั้ง');
  return out;
}
const TAX_WORD: Record<Tax, string> = { low: 'ต่ำ', normal: 'ปกติ', high: 'สูง' };
