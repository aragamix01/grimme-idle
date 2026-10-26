// Research: the crown sets its scholars a question, and once the town has worked out enough
// (its knowledge) the answer is found and changes how the town lives for good. Which question
// comes first is the king's call: what the town has been suffering, and what kind of king he is.
import { chance, type Rng } from './rng';
import { known, log } from './core';
import { legend } from './quests';
import { king } from './society';
import { ageOf, markAge } from './ages';
import type { Field, Npc, Tech, WorldState } from './types';

export interface TechDef {
  name: string;
  cost: number; // knowledge spent when it is found
  text: string; // what it does, for the kingdom tab
  icon: string;
  needs?: Tech[]; // found before this one can be asked
}

export const TECHS: Record<Tech, TechDef> = {
  plough: { name: 'คันไถเหล็ก', cost: 200, text: 'ชาวนาเก็บเกี่ยวข้าวได้มากขึ้น 25%', icon: 'plough' },
  medicine: { name: 'การแพทย์', cost: 280, text: 'โรคระบาดคร่าชีวิตน้อยลง 40%', icon: 'medicine' },
  metallurgy: { name: 'โลหะวิทยา', cost: 380, text: 'ช่างตีเหล็กใช้ของจากดันเจี้ยนครึ่งเดียวต่ออาวุธหนึ่งชุด', icon: 'metallurgy' },
  architecture: { name: 'สถาปัตยกรรม', cost: 480, text: 'งานก่อสร้างของราชสำนักถูกลงและเสร็จเร็วขึ้น 25% สร้างหอนาฬิกาได้', icon: 'architecture' },
  navigation: { name: 'การเดินเรือและแผนที่', cost: 650, text: 'กองคาราวานเดินทางเร็วขึ้น ปลอดภัยขึ้น และได้กำไรมากขึ้น', icon: 'navigation', needs: ['plough'] },
  arcana: { name: 'เวทศาสตร์', cost: 750, text: 'จอมเวทร่ายเวทได้แรงขึ้นมาก', icon: 'arcana', needs: ['medicine'] },
  printing: { name: 'การพิมพ์', cost: 900, text: 'เด็กๆ เรียนได้เร็วขึ้น สร้างโรงพิมพ์ได้ ความคิดใหม่ๆ แพร่ไปทั่วเมือง', icon: 'printing', needs: ['architecture'] },
  irrigation: { name: 'คลองชลประทาน', cost: 420, text: 'ขุดคลองส่งน้ำเข้าทุ่ง ภัยแล้งทำให้ข้าวเสียหายน้อยลงมาก สัตว์และคนแก่ล้มตายน้อยลง', icon: 'irrigation', needs: ['plough'] },
  levee: { name: 'คันกั้นน้ำ', cost: 520, text: 'คันดินริมแม่น้ำ น้ำท่วมใหญ่เกิดยากขึ้นมาก และเสียหายเพียงครึ่งเดียว', icon: 'levee', needs: ['architecture'] },
  ironframe: { name: 'โครงเหล็กทนแผ่นดินไหว', cost: 1300, text: 'บ้านและอาคารหลวงมีโครงเหล็ก แผ่นดินไหวทำให้บ้านพังและคนตายน้อยลงมาก', icon: 'ironframe', needs: ['architecture', 'metallurgy'] },
  chemistry: { name: 'เคมี', cost: 1500, text: 'ยาและน้ำยาฆ่าเชื้อชนิดใหม่ โรคระบาดคร่าชีวิตน้อยลงอีก 30%', icon: 'chemistry', needs: ['medicine', 'arcana'] },
  steam: { name: 'เครื่องจักรไอน้ำ', cost: 1800, text: 'เครื่องจักรช่วยทุ่นแรง ผลผลิตข้าวเพิ่ม 15% สร้างโรงงานได้', icon: 'steam', needs: ['printing', 'metallurgy'] },
  railway: { name: 'ทางรถไฟ', cost: 2400, text: 'กองคาราวานเดินทางเร็วขึ้นอีก สร้างสถานีรถไฟได้', icon: 'railway', needs: ['steam', 'navigation'] },
};
export const TECH_ORDER: readonly Tech[] = ['plough', 'medicine', 'metallurgy', 'architecture', 'irrigation', 'levee', 'navigation', 'arcana', 'printing', 'ironframe', 'chemistry', 'steam', 'railway'];

const ASK_DAY = 12; // day of the month the king sets a new question

// Once every discovery is made, the scholars go deeper, field by field, without end: each level
// costs more than the last and adds a little.
export const FIELDS: Record<Field, { name: string; text: string; icon: string; step: number }> = {
  agronomy: { name: 'เกษตรศาสตร์ขั้นสูง', text: 'ผลผลิตข้าว', icon: 'plough', step: 0.03 },
  physick: { name: 'แพทยศาสตร์ขั้นสูง', text: 'โรคระบาดคร่าชีวิตน้อยลง', icon: 'medicine', step: 0.04 },
  commerce: { name: 'เศรษฐศาสตร์', text: 'กำไรกองคาราวาน', icon: 'navigation', step: 0.04 },
  engineering: { name: 'วิศวกรรมศาสตร์', text: 'งานก่อสร้างถูกลงและเร็วขึ้น', icon: 'architecture', step: 0.04 },
};
export const FIELD_ORDER = Object.keys(FIELDS) as Field[];
const MASTERY_BASE = 1500;
const MASTERY_STEP = 500; // per level already reached, in any field
export const masteryLevel = (world: WorldState, f: Field) => world.mastery?.[f] ?? 0;
export const masteryCost = (world: WorldState) => MASTERY_BASE + MASTERY_STEP * FIELD_ORDER.reduce((s, f) => s + masteryLevel(world, f), 0);
// The bonus a field gives: a multiplier above one (yield, profit) or below it (deaths, costs).
export const mastery = (world: WorldState, f: Field) => masteryLevel(world, f) * FIELDS[f].step;

// Which field the ruler sets next: what has hurt the town lately, and their nature.
function wantField(world: WorldState, f: Field, ruler: Npc): number {
  const recent = world.chronicle.filter((e) => e.day > world.day - 730);
  const has = (tr: Npc['traits'][number]) => (ruler.traits.includes(tr) ? 1 : 0);
  switch (f) {
    case 'agronomy':
      return 1 + recent.filter((e) => /ข้าวหมดตลาด|ความหิวโหย/.test(e.text)).length + has('kind');
    case 'physick':
      return 1 + recent.filter((e) => e.text.includes('โรคระบาด')).length + has('kind');
    case 'commerce':
      return 1 + has('greedy') * 2;
    case 'engineering':
      return 1 + has('brave') + (world.ruins?.length ? 1 : 0);
  }
}

function advancedStudy(world: WorldState, rng: Rng): void {
  const f = world.study;
  if (f && (world.knowledge ?? 0) >= masteryCost(world)) {
    world.knowledge! -= masteryCost(world);
    (world.mastery ??= {})[f] = masteryLevel(world, f) + 1;
    world.study = undefined;
    log(world, 'world', `นักปราชญ์ก้าวหน้าใน${FIELDS[f].name}เป็นขั้นที่ ${masteryLevel(world, f)}! ${FIELDS[f].text}ดีขึ้นอีก`);
  }
  if (world.study || world.day % 30 !== ASK_DAY) return;
  const ruler = king(world);
  if (!ruler) return;
  world.study = FIELD_ORDER.map((k) => [k, wantField(world, k, ruler) + (chance(rng, 0.5) ? 0.5 : 0)] as const).sort((a, b) => b[1] - a[1])[0][0];
  log(world, 'politics', `กษัตริย์${ruler.name}สั่งให้นักปราชญ์ศึกษา${FIELDS[world.study].name}ต่อ`, ruler.id);
}

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
    // The town wants the defence against whatever has hurt it lately.
    case 'irrigation':
      return recent.filter((e) => /ภัยแล้งแผ่ไป/.test(e.text)).length * 3 + has('kind') * 0.5;
    case 'levee':
      return recent.filter((e) => /น้ำท่วมใหญ่!|ฝนตกไม่หยุดทั้งวัน/.test(e.text)).length * 3 + has('kind') * 0.5;
    case 'ironframe':
      return recent.filter((e) => /แผ่นดินไหวครั้งใหญ่/.test(e.text)).length * 4 + has('kind') * 0.5;
    case 'chemistry':
      return 1 + has('kind') + recent.filter((e) => e.text.includes('โรคระบาด')).length;
    case 'steam':
      return 1 + has('greedy') + has('brave');
    case 'railway':
      return 1 + has('greedy') + ((world.realms ?? []).filter((r) => (r.trades ?? 0) >= 5).length ? 1 : 0);
  }
}

// What the town knows beyond what its next question needs goes abroad: with a press, books sold
// to the neighbours bring in gold; once a year scholars go to teach at a friendly court behind us
// in learning, which warms to us and comes on faster.
const ABROAD_DAY = 18;
const SPARE = 200; // knowledge kept back beyond the current question
const BOOKS = 100; // knowledge a month's printing for export takes
const TEACHING = 150; // knowledge a year's embassy of scholars takes
function knowledgeAbroad(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== ABROAD_DAY) return;
  const need = (world.research ? TECHS[world.research].cost : world.study ? masteryCost(world) : 0) + SPARE;
  if ((world.knowledge ?? 0) - need >= BOOKS && world.works?.press !== undefined) {
    world.knowledge! -= BOOKS;
    const gold = 60 + 20 * ageOf(world);
    world.treasury += gold;
    if (chance(rng, 0.2)) log(world, 'trade', `โรงพิมพ์ส่งตำราไปขายต่างแดน ได้ทองเข้าคลัง ${gold} เหรียญ`);
  }
  if (world.day % 365 >= 30 || (world.knowledge ?? 0) - need < TEACHING) return;
  const r = (world.realms ?? []).filter((x) => !x.fallen && !x.war && x.relation >= 0 && !x.tutored && (x.age ?? 1) < ageOf(world)).sort((a, b) => b.relation - a.relation)[0];
  if (!r) return;
  world.knowledge! -= TEACHING;
  r.tutored = true;
  r.relation = Math.min(100, r.relation + 8);
  log(world, 'world', `นักปราชญ์ของเราเดินทางไปสอนหนังสือที่${r.name} ราชสำนักนั้นซาบซึ้งในน้ำใจ`);
}

export function researchDay(world: WorldState, rng: Rng): void {
  knowledgeAbroad(world, rng);
  const t = world.research;
  if (t && (world.knowledge ?? 0) >= TECHS[t].cost) {
    const age = ageOf(world);
    world.knowledge! -= TECHS[t].cost;
    (world.techs ??= {})[t] = world.day;
    world.research = undefined;
    log(world, 'world', `นักปราชญ์ค้นพบ${TECHS[t].name}! ${TECHS[t].text}`);
    legend(world, `ค้นพบ${TECHS[t].name}`);
    markAge(world, age);
  }
  if (TECH_ORDER.every((k) => known(world, k))) return advancedStudy(world, rng);
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
