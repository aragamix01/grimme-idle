// Civilisation's ages (สมัย; not to be confused with the god's prestige eras, ยุค): how far the
// town's learning has come, read off the finds its scholars have made. Each age changes how the
// town looks and sounds: thatch and homespun, then tiles and dyed cloth, then dormer windows,
// ruffed collars and livelier music, then brick, chimneys and neckties.
import { log } from './core';
import { legend } from './quests';
import { JOB_TH } from './names';
import type { Job, WorldState } from './types';

export interface AgeDef {
  name: string;
  text: string;
  next?: string; // what it takes to reach the following age
}

export const AGES: readonly AgeDef[] = [
  { name: 'สมัยบุกเบิก', text: 'บ้านมุงจาก ผู้คนสวมผ้าทอมือ', next: 'ค้นพบวิทยาการ 3 อย่าง' },
  { name: 'สมัยกลาง', text: 'หลังคากระเบื้อง ผ้าย้อมสีสด', next: 'ค้นพบวิทยาการ 6 อย่าง รวมถึงการพิมพ์' },
  { name: 'สมัยฟื้นฟูศิลปวิทยา', text: 'บ้านมีหน้าต่างใต้หลังคา ผู้คนสวมปกระบาย ดนตรีคึกคัก', next: 'ค้นพบวิทยาการ 9 อย่าง รวมถึงเครื่องจักรไอน้ำ' },
  { name: 'สมัยอุตสาหกรรม', text: 'บ้านอิฐมีปล่องไฟ ผู้คนผูกเนกไท เสียงเครื่องจักรดังทั่วเมือง' },
];

export function ageOf(world: WorldState): number {
  const found = Object.keys(world.techs ?? {}).length;
  if (found >= 9 && world.techs?.steam !== undefined) return 3;
  if (found >= 6 && world.techs?.printing !== undefined) return 2;
  return found >= 3 ? 1 : 0;
}

// What each trade is called in each age, where it isn't the plain name: the same work done with
// the tools and words of the time. Elsewhere the plain name.
const AGE_JOBS: Partial<Record<Job, (string | undefined)[]>> = {
  farmer: ['ชาวไร่', undefined, undefined, 'เกษตรกร'],
  herder: [undefined, undefined, undefined, 'เจ้าของฟาร์มปศุสัตว์'],
  hunter: [undefined, undefined, undefined, 'นักล่าสัตว์'],
  blacksmith: [undefined, undefined, undefined, 'ช่างเครื่องกล'],
  merchant: [undefined, undefined, 'วาณิช', 'นักธุรกิจ'],
  innkeeper: [undefined, undefined, undefined, 'เจ้าของโรงแรม'],
  courtesan: [undefined, undefined, 'นางระบำ', 'นักร้องคาบาเรต์'],
  scholar: ['ผู้รู้', undefined, 'นักวิชาการ', 'นักวิทยาศาสตร์'],
  builder: ['ช่างไม้', undefined, undefined, 'กรรมกรก่อสร้าง'],
  soldier: ['ทหารเกณฑ์', undefined, undefined, 'ทหารปืนไฟ'],
  mage: [undefined, undefined, undefined, 'นักเวทศาสตร์'],
  doctor: [undefined, undefined, undefined, 'แพทย์'],
  watchman: ['คนเฝ้ายาม', undefined, undefined, 'ตำรวจ'],
  judge: ['ผู้ใหญ่บ้าน', 'ตุลาการ', undefined, undefined],
  lawyer: [undefined, undefined, 'ผู้ว่าความ', undefined],
};

export function jobName(world: WorldState, job: Job): string {
  if (job === 'alchemist' && world.techs?.chemistry !== undefined) return 'นักเคมี'; // the old art made a science
  return AGE_JOBS[job]?.[ageOf(world)] ?? JOB_TH[job];
}

// How much the trades of the industrial age change the work itself (see where each is used):
// the smith at the factory forges without dungeon loot, soldiers carry firearms, hunters rifles,
// and in a town of science fewer prayers rise from the church.
export const industrial = (world: WorldState) => ageOf(world) >= 3;

// The sprite suffix each age wears; the middle age is the plain art.
export const AGE_SUFFIX = ['-age0', '', '-age2', '-age3'] as const;

// Called after a find: announce a new age when the town crosses into one.
export function markAge(world: WorldState, before: number): void {
  const now = ageOf(world);
  if (now <= before) return;
  log(world, 'world', `อาณาจักรก้าวเข้าสู่${AGES[now].name}! ${AGES[now].text}`);
  legend(world, `เข้าสู่${AGES[now].name}`);
}
