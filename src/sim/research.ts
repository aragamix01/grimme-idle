// Research: the crown sets its scholars a question, and once the town has worked out enough
// (its knowledge) the answer is found and changes how the town lives for good. Which question
// comes first is the king's call: what the town has been suffering, and what kind of king he is.
import { chance, type Rng } from './rng';
import { known, log } from './core';
import { legend } from './quests';
import { king } from './society';
import type { Npc, Tech, WorldState } from './types';

export interface TechDef {
  name: string;
  cost: number; // knowledge spent when it is found
  text: string; // what it does, for the kingdom tab
  icon: string;
  needs?: Tech[]; // found before this one can be asked
}

export const TECHS: Record<Tech, TechDef> = {
  plough: { name: 'คันไถเหล็ก', cost: 120, text: 'ชาวนาเก็บเกี่ยวข้าวได้มากขึ้น 25%', icon: 'plough' },
  medicine: { name: 'การแพทย์', cost: 180, text: 'โรคระบาดคร่าชีวิตน้อยลง 40%', icon: 'medicine' },
  metallurgy: { name: 'โลหะวิทยา', cost: 240, text: 'ช่างตีเหล็กใช้ของจากดันเจี้ยนครึ่งเดียวต่ออาวุธหนึ่งชุด', icon: 'metallurgy' },
  architecture: { name: 'สถาปัตยกรรม', cost: 300, text: 'งานก่อสร้างของราชสำนักถูกลงและเสร็จเร็วขึ้น 25% สร้างหอนาฬิกาได้', icon: 'architecture' },
  navigation: { name: 'การเดินเรือและแผนที่', cost: 380, text: 'กองคาราวานเดินทางเร็วขึ้น ปลอดภัยขึ้น และได้กำไรมากขึ้น', icon: 'navigation', needs: ['plough'] },
  arcana: { name: 'เวทศาสตร์', cost: 440, text: 'จอมเวทร่ายเวทได้แรงขึ้นมาก', icon: 'arcana', needs: ['medicine'] },
  printing: { name: 'การพิมพ์', cost: 500, text: 'เด็กๆ เรียนได้เร็วขึ้น สร้างโรงพิมพ์ได้ ความคิดใหม่ๆ แพร่ไปทั่วเมือง', icon: 'printing', needs: ['architecture'] },
};
export const TECH_ORDER: readonly Tech[] = ['plough', 'medicine', 'metallurgy', 'architecture', 'navigation', 'arcana', 'printing'];

const ASK_DAY = 12; // day of the month the king sets a new question

// How much the town needs each answer right now, as the king sees it.
function want(world: WorldState, t: Tech, ruler: Npc): number {
  const recent = world.chronicle.filter((e) => e.day > world.day - 730);
  const has = (tr: Npc['traits'][number]) => (ruler.traits.includes(tr) ? 1 : 0);
  switch (t) {
    case 'plough':
      return 1 + recent.filter((e) => /ข้าวหมดตลาด|ความหิวโหย/.test(e.text)).length + has('kind');
    case 'medicine':
      return 1 + recent.filter((e) => e.text.includes('โรคระบาด')).length * 2 + has('kind');
    case 'metallurgy':
      return 1 + has('brave') + has('vengeful') + (world.war ? 2 : 0);
    case 'architecture':
      return 1 + has('greedy') + (world.building ? 1 : 0);
    case 'navigation':
      return 1 + has('greedy') + ((world.realms ?? []).filter((r) => r.pact).length ? 1 : 0);
    case 'arcana':
      return 1 + has('brave') + (world.demon || (world.dread ?? 0) >= 50 ? 2 : 0);
    case 'printing':
      return 1 + has('kind') + (world.works?.school !== undefined ? 1 : 0);
  }
}

export function researchDay(world: WorldState, rng: Rng): void {
  const t = world.research;
  if (t && (world.knowledge ?? 0) >= TECHS[t].cost) {
    world.knowledge! -= TECHS[t].cost;
    (world.techs ??= {})[t] = world.day;
    world.research = undefined;
    log(world, 'world', `นักปราชญ์ค้นพบ${TECHS[t].name}! ${TECHS[t].text}`);
    legend(world, `ค้นพบ${TECHS[t].name}`);
  }
  if (world.research || world.day % 30 !== ASK_DAY) return;
  const ruler = king(world);
  if (!ruler) return; // no crown, no one to set the question
  const open = TECH_ORDER.filter((k) => !known(world, k) && (TECHS[k].needs ?? []).every((n) => known(world, n)));
  if (!open.length) return;
  // Equal needs are settled by the king's whim.
  const next = open.map((k) => [k, want(world, k, ruler) + (chance(rng, 0.5) ? 0.5 : 0)] as const).sort((a, b) => b[1] - a[1])[0][0];
  world.research = next;
  log(world, 'politics', `กษัตริย์${ruler.name}สั่งให้นักปราชญ์ค้นคว้าเรื่อง${TECHS[next].name}`, ruler.id);
}
