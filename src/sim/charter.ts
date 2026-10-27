// The town's constitution: a handful of clauses that say how power works here, written when a
// regime takes over and amended by the town itself as rulers, councils and crises push on it.
// It decides how long a leader's term runs and how many they may serve, who may vote, whether
// the council can block decrees, how high taxes may go, whether the faith is the state's, and
// whether the ruler holds emergency powers, whether an independent auditor watches the officials
// and the press may print what it finds, how the crown may win land, and what the villages are owed.
import { log } from './core';
import { GUILD_LAW_TH } from './adventurers';
import type { Charter, LandPolicy, Regime, Tax, WorldState } from './types';

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
      return { termYears: 3, termLimit: 2, franchise: 'all', councilVeto: true, taxCap: null, stateFaith: false, auditor: true, freePress: true, landPolicy: 'settle', provinces: true };
    case 'theocracy':
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: true, taxCap: null, stateFaith: true, landPolicy: 'peace', guilds: 'taxed', economy: 'guided' };
    case 'oligarchy':
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: true, taxCap: 'normal', stateFaith: false, auditor: true, freePress: true, landPolicy: 'settle', economy: 'free' };
    case 'junta':
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: false, taxCap: null, stateFaith: false, emergency: true, landPolicy: 'conquest', guilds: 'taxed', economy: 'guided' };
    default:
      return { termYears: 0, termLimit: null, franchise: 'none', councilVeto: true, taxCap: null, stateFaith: false, landPolicy: 'settle' };
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
  if (c.emergency) out.push(`ประกาศภาวะฉุกเฉิน ผู้ปกครองมีอำนาจเด็ดขาด${c.termYears ? ' งดการเลือกตั้ง' : ''}`);
  out.push(c.auditor ? 'มีองค์กรอิสระตรวจสอบเจ้าหน้าที่รัฐทุกคน รวมถึงผู้ปกครอง' : 'ไม่มีองค์กรอิสระตรวจสอบผู้ปกครอง');
  out.push(c.freePress ? 'สื่อมีเสรีภาพ ตีพิมพ์เรื่องของผู้มีอำนาจได้' : 'สื่อถูกควบคุม');
  out.push(POLICY_TH[landPolicyOf(c)]);
  out.push(GUILD_LAW_TH[c.guilds ?? 'free']);
  out.push(c.economy === 'free' ? 'การค้าเสรี ห้ามเก็บภาษีศุลกากรและห้ามคุมราคา' : c.economy === 'guided' ? 'รัฐกำกับตลาด เก็บภาษีศุลกากรและคุมราคาได้' : 'ผู้ปกครองกำหนดนโยบายการค้าได้ตามสถานการณ์');
  out.push(c.provinces ? 'กฎบัตรหัวเมือง: หมู่บ้านเก็บส่วนแบ่งได้อย่างน้อยหนึ่งในสี่ และเลือกผู้ใหญ่บ้านเอง' : 'หัวเมืองขึ้นตรงต่อเมืองหลวง ส่วยเรียกเก็บได้ตามใจผู้ปกครอง');
  return out;
}
const TAX_WORD: Record<Tax, string> = { low: 'ต่ำ', normal: 'ปกติ', high: 'สูง' };
export const landPolicyOf = (c: Charter): LandPolicy => c.landPolicy ?? 'settle';
export const POLICY_TH: Record<LandPolicy, string> = {
  peace: 'นโยบายดินแดน: สันติ ขยายแผ่นดินได้ด้วยการบุกเบิกและเจรจาเท่านั้น ห้ามรบเพื่อแย่งดินแดน',
  settle: 'นโยบายดินแดน: บุกเบิกและซื้อขาย รบได้เมื่อถูกยั่วยุ',
  conquest: 'นโยบายดินแดน: พิชิต ผู้ปกครองยกทัพยึดดินแดนเพื่อนบ้านได้',
};
