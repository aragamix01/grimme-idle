// The crown's building works. A treasury with gold to spare puts it into the town: a new
// building on one of the royal plots outside the walls, or an old one rebuilt grander. Which
// one is the king's call: what the town has been suffering, and what kind of king he is.
import { chance, type Rng } from './rng';
import { known, log } from './core';
import { legend } from './quests';
import { king, payrollReserve } from './society';
import { PLOTS } from './town';
import type { Npc, Work, WorldState } from './types';

export interface WorkDef {
  name: string;
  cost: number;
  days: number; // to build
  text: string; // what it does, for the kingdom tab
  art: string; // its sprite
  plot?: { x: number; y: number }; // a new building's royal plot (top-left tile, 2x2)...
  replaces?: string; // ...or the building it rebuilds in place
}

export const WORKS: Record<Work, WorkDef> = {
  granary: { name: 'ยุ้งฉางหลวง', cost: 500, days: 60, text: 'ข้าวเน่าเสียช้าลงมาก เนื้อเก็บได้นานขึ้น', art: 'granary', plot: PLOTS.granary },
  watchtowers: { name: 'หอธนูประจำประตูเมือง', cost: 700, days: 90, text: 'ป้องกันเมืองตอนมอนสเตอร์ทะลักได้ดีขึ้น', art: 'watchtower', replaces: 'gate-tower' },
  yard: { name: 'ลานฝึกนักรบ', cost: 600, days: 75, text: 'นักผจญภัยเลเวลขึ้นเร็วขึ้นเมื่อลงดันเจี้ยน', art: 'yard', plot: PLOTS.yard },
  cathedral: { name: 'มหาวิหาร', cost: 900, days: 120, text: 'นักบวชสวดได้ศรัทธามากขึ้นเท่าตัว และรักษาโรคระบาดได้ดีขึ้น', art: 'cathedral', replaces: 'church' },
  market: { name: 'หอตลาดใหญ่', cost: 800, days: 90, text: 'ร้านรับซื้อของในราคาดีขึ้น กองคาราวานได้กำไรมากขึ้น', art: 'market-hall', replaces: 'shop' },
  school: { name: 'โรงเรียนหลวง', cost: 600, days: 75, text: 'นักปราชญ์ได้สอนหนังสือ ค้นคว้าได้ความรู้เพิ่มเป็นเท่าตัว', art: 'school', plot: PLOTS.school },
  clocktower: { name: 'หอนาฬิกา', cost: 700, days: 90, text: 'ระฆังบอกเวลาทำให้ทุกคนทำงานตรงเวลา ผลผลิตข้าวและความรู้เพิ่ม 10%', art: 'clocktower', plot: PLOTS.clocktower },
  press: { name: 'โรงพิมพ์', cost: 800, days: 90, text: 'หนังสือราคาถูก ผู้ใหญ่หัดอ่านเองได้ นักปราชญ์ค้นคว้าได้ไวขึ้น 25%', art: 'press', plot: PLOTS.press },
  palace: { name: 'พระราชวังทองคำ', cost: 1500, days: 150, text: 'ราชบัลลังก์มั่นคงขึ้น ขุนนางพอใจ แต่ชาวเมืองมองว่าฟุ่มเฟือย', art: 'palace', replaces: 'castle' },
};
export const WORK_ORDER: readonly Work[] = ['granary', 'watchtowers', 'yard', 'cathedral', 'market', 'school', 'clocktower', 'press', 'palace'];

const SPARE = 300; // gold the crown keeps back beyond the soldiers' pay before it builds
const ASK_DAY = 8; // day of the month the king considers a new work

export const built = (world: WorldState, k: Work) => world.works?.[k] !== undefined;
// Architecture makes every work a quarter cheaper and quicker.
const plans = (world: WorldState) => (known(world, 'architecture') ? 0.75 : 1);
export const workCost = (world: WorldState, k: Work) => Math.round(WORKS[k].cost * plans(world));
const workDays = (world: WorldState, k: Work) => Math.round(WORKS[k].days * plans(world));

// How much the town needs each work right now, as the king sees it.
function want(world: WorldState, k: Work, ruler: Npc): number {
  const year = world.chronicle.filter((e) => e.day > world.day - 730);
  const brave = ruler.traits.includes('brave') ? 1 : 0;
  switch (k) {
    case 'granary':
      return 1 + year.filter((e) => /ข้าวหมดตลาด|ความหิวโหย/.test(e.text)).length + (ruler.traits.includes('kind') ? 1 : 0);
    case 'watchtowers':
      return 1 + year.filter((e) => e.text.includes('มอนสเตอร์ล้นออกจาก')).length * 2 + brave;
    case 'yard': {
      const adv = world.npcs.filter((n) => n.alive && n.rank !== undefined);
      const avg = adv.reduce((s, n) => s + n.level, 0) / Math.max(1, adv.length);
      return (avg < 3 ? 2 : 1) + brave;
    }
    case 'cathedral':
      return 1 + (ruler.traits.includes('kind') ? 1 : 0) + ((world.balance ?? 0) < 0 ? 1 : 0);
    case 'market':
      return 1 + (ruler.traits.includes('greedy') ? 1 : 0) + (world.npcs.filter((n) => n.alive && n.job === 'merchant').length >= 3 ? 1 : 0);
    case 'school': {
      // Wanted once the town has scholars to teach in it, more by a kind king with children to raise.
      const scholars = world.npcs.filter((n) => n.alive && n.job === 'scholar' && n.age >= 16).length;
      const kids = world.npcs.filter((n) => n.alive && n.age < 16).length;
      return scholars ? 1 + (scholars >= 2 ? 1 : 0) + (kids >= 12 ? 1 : 0) + (ruler.traits.includes('kind') ? 1 : 0) : 0;
    }
    case 'clocktower':
      return known(world, 'architecture') ? 1 + (ruler.traits.includes('greedy') ? 0 : 1) : 0;
    case 'press':
      return known(world, 'printing') ? 2 + (ruler.traits.includes('kind') ? 1 : 0) : 0;
    case 'palace':
      // Only a vain or grasping king builds himself a palace; a kind one never would.
      return ruler.traits.includes('kind') ? 0 : ruler.traits.includes('greedy') ? 3 : ruler.traits.includes('vengeful') ? 1 : 0;
  }
}

export function crownWorks(world: WorldState, rng: Rng): void {
  const job = world.building;
  if (job && world.day >= job.done) {
    (world.works ??= {})[job.kind] = world.day;
    world.building = undefined;
    log(world, 'world', `${WORKS[job.kind].name}สร้างเสร็จแล้ว! ${WORKS[job.kind].text}`);
    legend(world, `สร้าง${WORKS[job.kind].name}`);
  }
  if (world.building || world.day % 30 !== ASK_DAY) return;
  const ruler = king(world);
  if (!ruler) return;
  // A greedy king sits on his gold more often than not.
  if (ruler.traits.includes('greedy') && chance(rng, 0.5)) return;
  const budget = world.treasury - payrollReserve(world) - SPARE;
  const k = WORK_ORDER.filter((w) => !built(world, w) && workCost(world, w) <= budget && want(world, w, ruler) > 0).sort((a, b) => want(world, b, ruler) - want(world, a, ruler))[0];
  if (!k) return;
  world.treasury -= workCost(world, k);
  world.building = { kind: k, done: world.day + workDays(world, k) };
  log(world, 'politics', `กษัตริย์${ruler.name}ทุ่มทอง ${workCost(world, k)} เหรียญสร้าง${WORKS[k].name}`, ruler.id);
}
