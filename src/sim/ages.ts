// Civilisation's ages (สมัย; not to be confused with the god's prestige eras, ยุค): how far the
// town's learning has come, read off the finds its scholars have made. Each age changes how the
// town looks and sounds: thatch and homespun, then tiles and dyed cloth, then dormer windows,
// ruffed collars and livelier music, then brick, chimneys and neckties.
import { log } from './core';
import { legend } from './quests';
import type { WorldState } from './types';

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

// The sprite suffix each age wears; the middle age is the plain art.
export const AGE_SUFFIX = ['-age0', '', '-age2', '-age3'] as const;

// Called after a find: announce a new age when the town crosses into one.
export function markAge(world: WorldState, before: number): void {
  const now = ageOf(world);
  if (now <= before) return;
  log(world, 'world', `อาณาจักรก้าวเข้าสู่${AGES[now].name}! ${AGES[now].text}`);
  legend(world, `เข้าสู่${AGES[now].name}`);
}
