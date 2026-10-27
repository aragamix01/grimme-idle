// The crown's building works. A treasury with gold to spare puts it into the town: a new
// building on one of the royal plots outside the walls, or an old one rebuilt grander. Which
// one is the king's call: what the town has been suffering, and what kind of king he is.
import { chance, type Rng } from './rng';
import { known, log } from './core';
import { legend } from './quests';
import { king, payrollReserve } from './society';
import { PLOTS } from './town';
import { basePrice, ensureMarket, levelOf } from './market';
import { mastery } from './research';
import { traveller } from './world';
import { feed } from './demonlord';
import type { Good, Npc, Work, WorldState } from './types';

export interface WorkDef {
  name: string;
  cost: number;
  days: number; // to build
  text: string; // what it does, for the kingdom tab
  art: string; // its sprite
  plot?: { x: number; y: number }; // a new building's royal plot (top-left tile, 2x2)...
  replaces?: string; // ...or the building it rebuilds in place
}

// The monument is never finished: each tier costs more than the last, so a rich crown always
// has somewhere to put its gold.
const MONUMENT_COST = 1500;
const MONUMENT_STEP = 800;

export const WORKS: Record<Work, WorkDef> = {
  granary: { name: 'ยุ้งฉางหลวง', cost: 500, days: 60, text: 'ข้าวเน่าเสียช้าลงมาก เนื้อเก็บได้นานขึ้น', art: 'granary', plot: PLOTS.granary },
  watchtowers: { name: 'หอธนูประจำประตูเมือง', cost: 700, days: 90, text: 'ป้องกันเมืองตอนมอนสเตอร์ทะลักได้ดีขึ้น', art: 'watchtower', replaces: 'gate-tower' },
  yard: { name: 'ลานฝึกนักรบ', cost: 600, days: 75, text: 'นักผจญภัยเลเวลขึ้นเร็วขึ้นเมื่อลงดันเจี้ยน', art: 'yard', plot: PLOTS.yard },
  cathedral: { name: 'มหาวิหาร', cost: 900, days: 120, text: 'นักบวชสวดได้ศรัทธามากขึ้นเท่าตัว และรักษาโรคระบาดได้ดีขึ้น', art: 'cathedral', replaces: 'church' },
  market: { name: 'หอตลาดใหญ่', cost: 800, days: 90, text: 'ร้านรับซื้อของในราคาดีขึ้น กองคาราวานได้กำไรมากขึ้น', art: 'market-hall', replaces: 'shop' },
  school: { name: 'โรงเรียนหลวง', cost: 600, days: 75, text: 'นักปราชญ์ได้สอนหนังสือ ค้นคว้าได้ความรู้เพิ่มเป็นเท่าตัว', art: 'school', plot: PLOTS.school },
  clocktower: { name: 'หอนาฬิกา', cost: 700, days: 90, text: 'ระฆังบอกเวลาทำให้ทุกคนทำงานตรงเวลา ผลผลิตข้าวและความรู้เพิ่ม 10%', art: 'clocktower', plot: PLOTS.clocktower },
  press: { name: 'โรงพิมพ์', cost: 800, days: 90, text: 'หนังสือราคาถูก ผู้ใหญ่หัดอ่านเองได้ นักปราชญ์ค้นคว้าได้ไวขึ้น 25%', art: 'press', plot: PLOTS.press },
  monument: { name: 'อนุสรณ์สถานแห่งอาณาจักร', cost: MONUMENT_COST, days: 120, text: 'สร้างต่อเติมได้ไม่รู้จบ ทุกระดับทำให้ชาวเมืองภาคภูมิใจและศรัทธามากขึ้น', art: 'monument-1', plot: PLOTS.monument },
  factory: { name: 'โรงงาน', cost: 1200, days: 120, text: 'ผลิตอาวุธเดือนละ 4 ชุด ขายสินค้าได้เงินเข้าคลังเดือนละ 80 แต่ควันทำให้โรคระบาดรุนแรงขึ้น หากจอมมารยึดเมืองจะผลิตอาวุธให้ทัพปีศาจแทน', art: 'factory', plot: PLOTS.factory },
  station: { name: 'สถานีรถไฟ', cost: 1000, days: 120, text: 'นักเดินทางมาถึงเมืองบ่อยขึ้น กองคาราวานได้กำไรมากขึ้น 20% (ใต้การยึดครองของจอมมารไม่มีรถไฟมา)', art: 'station', plot: PLOTS.station },
  palace: { name: 'พระราชวังทองคำ', cost: 1500, days: 150, text: 'ราชบัลลังก์มั่นคงขึ้น ขุนนางพอใจ แต่ชาวเมืองมองว่าฟุ่มเฟือย', art: 'palace', replaces: 'castle' },
};
export const WORK_ORDER: readonly Work[] = ['granary', 'watchtowers', 'yard', 'cathedral', 'market', 'school', 'clocktower', 'press', 'factory', 'station', 'palace', 'monument'];
const FACTORY_GEAR = 4; // arms the factory turns out each month
const FACTORY_GOLD = 80; // and what its other goods fetch for the crown
const STATION_VISITORS = 0.3; // monthly chance a train brings a newcomer

const SPARE = 300; // gold the crown keeps back beyond the soldiers' pay before it builds
const ASK_DAY = 8; // day of the month the king considers a new work

export const built = (world: WorldState, k: Work) => world.works?.[k] !== undefined;
export const monumentTier = (world: WorldState) => world.monument ?? 0;
const open = (world: WorldState, k: Work) => k === 'monument' || !built(world, k);
// Architecture makes every work a quarter cheaper and quicker.
const plans = (world: WorldState) => (known(world, 'architecture') ? 0.75 : 1) * Math.max(0.4, 1 - mastery(world, 'engineering'));
export const workCost = (world: WorldState, k: Work) => Math.round((WORKS[k].cost + (k === 'monument' ? monumentTier(world) * MONUMENT_STEP : 0)) * plans(world));
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
    case 'factory':
      return known(world, 'steam') ? 2 + (ruler.traits.includes('greedy') ? 1 : 0) : 0;
    case 'station':
      return known(world, 'railway') ? 2 : 0;
    case 'monument':
      return 0.5; // after everything the town needs; a vain ruler is the same as anyone here
    case 'palace':
      // Only a vain or grasping king builds himself a palace; a kind one never would.
      return ruler.traits.includes('kind') ? 0 : ruler.traits.includes('greedy') ? 3 : ruler.traits.includes('vengeful') ? 1 : 0;
  }
}

// Monthly: the factory's output, and who the trains bring.
function industry(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== ASK_DAY) return;
  const lord = world.demon?.stage === 'occupied' ? world.demon : undefined;
  if (built(world, 'factory')) {
    if (lord) feed(lord, 1); // its arms go to the demon's host
    else {
      // The furnaces eat ore: short of it, the factory turns out half as much.
      const m = ensureMarket(world);
      const ore = Math.min(m.stock.ore, FACTORY_GEAR);
      m.stock.ore -= ore;
      m.stock.gear += ore + Math.floor((FACTORY_GEAR - ore) / 2);
      world.treasury += FACTORY_GOLD;
    }
  }
  if (built(world, 'station') && !lord && chance(rng, STATION_VISITORS)) traveller(world, rng);
}

// A work is built of timber and iron as well as gold: bought off the market's shelves at today's
// price, and whatever the shelves lack shipped in at twice the usual cost.
const materialsOf = (world: WorldState, k: Work) => ({ timber: Math.round(workCost(world, k) / 12), ore: Math.round(workCost(world, k) / 30) });
export function materialsCost(world: WorldState, k: Work): number {
  const m = ensureMarket(world);
  return Object.entries(materialsOf(world, k)).reduce((s, [g, n]) => {
    const here = Math.min(n, Math.floor(m.stock[g as Good]));
    return s + here * m.price[g as Good] + (n - here) * basePrice(g as Good) * 2 * levelOf(world);
  }, 0);
}
function buyMaterials(world: WorldState, k: Work): number {
  const m = ensureMarket(world);
  const cost = Math.round(materialsCost(world, k));
  for (const [g, n] of Object.entries(materialsOf(world, k)) as [Good, number][]) {
    const here = Math.min(n, Math.floor(m.stock[g]));
    m.stock[g] -= here;
    m.till += here * m.price[g]; // what the shelves supplied, the shop is paid for
  }
  world.treasury -= cost;
  return cost;
}

export function crownWorks(world: WorldState, rng: Rng): void {
  industry(world, rng);
  const job = world.building;
  if (job && world.day >= job.done) {
    (world.works ??= {})[job.kind] = world.day;
    world.building = undefined;
    if (job.kind === 'monument') {
      world.monument = monumentTier(world) + 1;
      log(world, 'world', `${WORKS.monument.name}ระดับ ${world.monument} สร้างเสร็จแล้ว! ชาวเมืองมาชื่นชมกันทั้งเมือง`);
      legend(world, `สร้าง${WORKS.monument.name}ระดับ ${world.monument}`);
    } else {
      log(world, 'world', `${WORKS[job.kind].name}สร้างเสร็จแล้ว! ${WORKS[job.kind].text}`);
      legend(world, `สร้าง${WORKS[job.kind].name}`);
    }
  }
  if (world.building || world.day % 30 !== ASK_DAY) return;
  const ruler = king(world);
  if (!ruler) return;
  // A greedy king sits on his gold more often than not.
  if (ruler.traits.includes('greedy') && chance(rng, 0.5)) return;
  const budget = world.treasury - payrollReserve(world) - SPARE;
  const k = WORK_ORDER.filter((w) => open(world, w) && workCost(world, w) + materialsCost(world, w) <= budget && want(world, w, ruler) > 0).sort((a, b) => want(world, b, ruler) - want(world, a, ruler))[0];
  if (!k) return;
  const materials = buyMaterials(world, k);
  world.treasury -= workCost(world, k);
  world.building = { kind: k, done: world.day + workDays(world, k) };
  log(world, 'politics', `กษัตริย์${ruler.name}ทุ่มทอง ${workCost(world, k)} เหรียญสร้าง${WORKS[k].name} และซื้อไม้กับแร่อีก ${materials} ทอง`, ruler.id);
}
