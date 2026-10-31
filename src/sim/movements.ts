// Movements: the discontented do not stay alone. People who share a grievance and know each other
// band together behind the boldest of them; the movement grows through friends and family (faster
// in a town that reads), and each month it goes unanswered it may climb a step: grumbling in the
// taverns, a petition, a march on the palace, a strike, a riot, and at last a revolution. The ruler
// answers each step in their own way: gives in, which ends the movement but costs face; cracks
// down, which may make martyrs; or does nothing. Soldiers with friends in the crowd may refuse to
// march on it, and join it instead.
import { chance, type Rng } from './rng';
import { clamp, decreeActive, kill, known, log } from './core';
import { getTie, FRIEND } from './ties';
import { legend } from './quests';
import { king, enthrone, payrollReserve } from './society';
import { crownPower, depose, ensureCrown, loyaltyOf, TAX_TH } from './politics';
import { literacy, literate } from './learning';
import { charterOf, amend, faithLaw, faithLawOf } from './charter';
import { inequality } from './commerce';
import { ensureMarket, levelOf, priceRatio } from './market';
import { churchOf } from './church';
import { election, isRepublic, proclaimRepublic } from './republic';
import { grant } from './decrees';
import { endWar } from './war';
import { seize } from './regimes';
import { jailed } from './justice';
import { fire } from './slums';
import { rankOf } from './growth';
import { industrial } from './ages';
import { proclaimCommune } from './commune';
import { openParliament } from './parties';
import type { Cause, Movement, Npc, Tax, WorldState } from './types';

const MOVE_DAY = 22; // day of the month the movement meets, grows and acts
const CAMP = 20; // a camp this small has no streets to march in
const SEED = 0.06; // of the grown townsfolk sharing a grievance before they band together
const SEED_MIN = 4;
const RECRUIT = 0.08; // monthly pull of each friend or kin already in the movement
const LEAVE = 60; // loyalty past which a member drifts home
const LIE_LOW = 90; // days a movement keeps its head down after a crackdown
const STRIKE_DAYS = 30;
const JAIL = 365; // days a leader is held after a crackdown
const FEAR = 365; // days a crushed revolution keeps the streets quiet
const REFORM_LITERACY = 0.45; // readers past which a victorious crowd does without a ruler

export const CAUSE_TH: Record<Cause, { name: string; demand: string }> = {
  tax: { name: 'กลุ่มต้านภาษี', demand: 'ลดภาษี' },
  bread: { name: 'ขบวนการปากท้อง', demand: 'ข้าวราคาที่คนจนซื้อได้' },
  war: { name: 'กลุ่มต่อต้านสงคราม', demand: 'ยุติสงคราม' },
  graft: { name: 'กลุ่มต้านคอร์รัปชัน', demand: 'ให้ผู้ปกครองคืนทองที่โกงไป' },
  faith: { name: 'กลุ่มเสรีภาพความเชื่อ', demand: 'เลิกไล่ล่าคนต่างความเชื่อ' },
  tyranny: { name: 'กลุ่มต้านเผด็จการ', demand: 'ยกเลิกเคอร์ฟิวและอำนาจพิเศษ' },
  wealth: { name: 'สหภาพคนงาน', demand: 'ค่าแรงที่เป็นธรรม' },
  voice: { name: 'ขบวนการประชาธิปไตย', demand: 'ให้ประชาชนมีสิทธิ์มีเสียง' },
};
// How fast each grievance heats a crowd: an empty belly faster than an unheard voice.
const HEAT: Record<Cause, number> = { tax: 1, bread: 1.2, war: 1, graft: 0.8, faith: 1, tyranny: 0.7, wealth: 0.8, voice: 0.4 };
export const STAGE_TH = ['บ่นกันในโรงเตี๊ยม', 'ยื่นฎีกา', 'เดินขบวน', 'นัดหยุดงาน', 'จลาจล', 'ปฏิวัติ'] as const;
// What it takes to climb to each step: a share of the grown townsfolk, and how angry they are.
const STEP: [share: number, anger: number][] = [
  [0, 0],
  [0, 25],
  [0.08, 40],
  [0.12, 55],
  [0.16, 70],
  [0.2, 85],
];

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.job !== 'king');
const here = (world: WorldState, n: Npc) => n.inside === undefined && n.questId === undefined && !jailed(world, n);
const armed = (world: WorldState) => world.npcs.filter((n) => n.alive && n.inside === undefined && (n.job === 'soldier' || n.knight));
const strength = (list: Npc[]) => list.reduce((s, n) => s + 1 + (n.gear ?? 0) * 0.5, 0);
const kin = (a: Npc, b: Npc) => a.spouseId === b.id || b.spouseId === a.id || !!a.parentIds?.includes(b.id) || !!b.parentIds?.includes(a.id);
const close = (world: WorldState, a: Npc, b: Npc) => kin(a, b) || getTie(world, a.id, b.id) >= FRIEND;
const has = (n: Npc, t: Npc['traits'][number]) => n.traits.includes(t);

export const movementOf = (world: WorldState) => world.movement;
export const members = (world: WorldState) => (world.movement ? world.npcs.filter((n) => n.alive && n.marcher) : []);
// The streets are restless: a movement out in the open, or fresh outrage not yet spent.
export const restless = (world: WorldState) => (world.movement?.stage ?? 0) >= 1 || (world.crown?.unrest ?? 0) > 0;

// A movement's name, as the regime it stands against shapes it.
function nameOf(world: WorldState, cause: Cause): string {
  if (cause === 'voice' && world.regime === 'junta') return 'ขบวนการนักศึกษาและปัญญาชน';
  if (cause === 'voice' && world.regime === 'commune') return 'ขบวนการเสรีภาพ';
  if (cause === 'wealth' && world.regime === 'oligarchy') return 'สหภาพแรงงานทั่วเมือง';
  if (cause === 'faith' && world.religion?.sect && world.regime === 'theocracy') return `ผู้ศรัทธา${world.religion.sect.name}`;
  return CAUSE_TH[cause].name;
}

// What the town is angry about this month, worked out once for everyone.
interface Mood {
  tax: boolean;
  bread: boolean;
  war: boolean;
  graft: boolean;
  persecute: boolean;
  theocracy: boolean;
  tyranny: number;
  unequal: boolean;
  voice: number;
  level: number;
}
function mood(world: WorldState): Mood {
  const ruler = king(world);
  const r = world.regime ?? 'monarchy';
  const c = charterOf(world);
  return {
    tax: world.crown?.tax === 'high',
    bread: priceRatio(world, 'grain') >= 1.6,
    war: !!world.war && world.day - world.war.since > 120,
    graft: !!ruler?.record?.some((x) => x.kind === 'corruption' && x.day > world.day - 730),
    persecute: faithLawOf(c) === 'persecute',
    theocracy: r === 'theocracy',
    tyranny: (decreeActive(world, 'curfew') ? 1 : 0) + (c.emergency ? 1.5 : 0) + (r === 'junta' ? 1 : 0),
    unequal: inequality(world) > (r === 'oligarchy' ? 0.6 : 0.7), // the merchants' rule widens the gap, and the poor feel it sooner
    voice: r === 'republic' || (r === 'monarchy' && c.parliament) ? 0 : (literacy(world) >= 0.35 ? 1 : 0) + (known(world, 'printing') ? 0.5 : 0) + (r === 'commune' ? 1 : 0), // one party is no voice at all
    level: levelOf(world),
  };
}

// How much each grievance weighs on one person.
export function grievances(world: WorldState, n: Npc, m = mood(world)): Partial<Record<Cause, number>> {
  const poor = n.gold < 30 * m.level;
  const g: Partial<Record<Cause, number>> = {};
  if (m.tax) g.tax = poor ? 2 : 1;
  if (m.bread || (n.hunger ?? 0) >= 2) g.bread = (m.bread ? (poor ? 2 : 1) : 0) + ((n.hunger ?? 0) >= 2 ? 2 : 0);
  if (m.war) g.war = world.npcs.some((o) => o.alive && o.job === 'soldier' && kin(n, o)) ? 3 : 1.5;
  if (m.graft) g.graft = literate(n) ? 2 : 1.5;
  if (m.persecute && n.creed && n.creed !== 'god') g.faith = 3;
  else if (m.theocracy && n.creed === 'none') g.faith = 2;
  if (m.tyranny && n.job !== 'soldier' && !n.knight) g.tyranny = m.tyranny;
  if (m.unequal && poor && ['farmer', 'herder', 'hunter', 'blacksmith', 'miner', 'woodcutter', 'weaver'].includes(n.job)) g.wealth = 2;
  if (m.voice && literate(n)) g.voice = m.voice;
  return g;
}

const topCause = (g: Partial<Record<Cause, number>>): Cause | undefined => (Object.entries(g) as [Cause, number][]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1])[0]?.[0];

// Who may march: grown, in town, not the ruler's sworn men.
const commoner = (world: WorldState, n: Npc) => here(world, n) && n.job !== 'noble' && n.job !== 'soldier' && !n.knight && !n.cultist;

// The boldest of the angry, to lead them.
const fiery = (n: Npc) => (has(n, 'brave') ? 10 : 0) + (has(n, 'vengeful') ? 10 : 0) + (literate(n) ? 6 : 0) - (has(n, 'coward') ? 15 : 0) - loyaltyOf(n) * 0.5 + (n.renown ?? 0) / 20;

export function movementsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== MOVE_DAY || !king(world) || world.demon?.stage === 'occupied') return;
  const crown = ensureCrown(world);
  const outrage = crown.unrest; // scandals, broken promises and cruelty since last month
  crown.unrest = 0;
  const m = mood(world);
  if (!world.movement) return form(world, m, outrage);
  const mv = world.movement;
  mv.anger = clamp(mv.anger + outrage * 8, 0, 100);
  grow(world, mv, m, rng);
  if (!world.movement) return;
  climb(world, mv, rng);
  if (world.movement && world.movement.stage >= 2) world.movement.rally = world.day + RALLY;
}

// The crowd is out: its members gather before the palace on their free days.
export const rallying = (world: WorldState) => (world.movement?.stage ?? 0) >= 2 && (world.movement!.rally ?? 0) > world.day;

export const movementCost = (world: WorldState) => Math.max(1, Math.round(MOVE_COST * (1 - 0.1 * (world.legacy?.perks.grace ?? 0))));

// The god's hand on the crowd: a sign in the sky that hardens their resolve (and brings the
// wavering in), or a dream of peace that cools their anger. Neither answers the grievance.
export function sway(world: WorldState, act: 'stir' | 'calm'): boolean {
  const mv = world.movement;
  if (!mv) return false;
  const list = members(world);
  if (act === 'stir') {
    mv.anger = clamp(mv.anger + 25, 0, 100);
    for (const n of list) n.loyalty = clamp(loyaltyOf(n) - 5, 0, 100);
    log(world, 'bless', `แสงศักดิ์สิทธิ์ส่องลงกลาง${mv.name} ผู้ชุมนุมเชื่อว่าเทพเจ้าอยู่ข้างพวกเขา`, mv.leaderId);
  } else {
    mv.anger = clamp(mv.anger - 30, 0, 100);
    for (const n of list) n.loyalty = clamp(loyaltyOf(n) + 8, 0, 100);
    log(world, 'bless', `ผู้ชุมนุมของ${mv.name}ฝันเห็นนิมิตแห่งความสงบ ความโกรธในใจค่อย ๆ จางลง`, mv.leaderId);
  }
  return true;
}

// A grievance shared by enough people who know each other becomes a movement.
function form(world: WorldState, m: Mood, outrage: number): void {
  const crown = ensureCrown(world);
  if ((crown.fear ?? 0) > world.day) return; // the streets remember the last crackdown
  const all = adults(world);
  if (all.length < CAMP || !reach(world)) return;
  const angry = all.filter((n) => commoner(world, n) && loyaltyOf(n) < 40);
  const by = new Map<Cause, Npc[]>();
  for (const n of angry) {
    const c = topCause(grievances(world, n, m));
    if (c) by.set(c, [...(by.get(c) ?? []), n]);
  }
  // A ruler who gave in before has taught the town that pressure works.
  const need = Math.max(SEED_MIN, Math.round(all.length * SEED)) - outrage - Math.min(2, crown.conceded ?? 0);
  const [cause, folk] = [...by.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!cause || !folk || folk.length < need) return;
  const leader = folk.slice().sort((a, b) => fiery(b) - fiery(a))[0];
  const first = folk.filter((n) => n === leader || close(world, n, leader));
  if (first.length < 3 && !(outrage && first.length >= 2)) return;
  for (const n of first) n.marcher = true;
  world.movement = { name: nameOf(world, cause), cause, founded: world.day, leaderId: leader.id, stage: 0, anger: 20 + outrage * 8, martyrs: 0, members: first.length, defectors: 0 };
  log(world, 'politics', `${leader.name}กับเพื่อนอีก ${first.length - 1} คนรวมตัวกันตั้ง${CAUSE_TH[cause].name} บ่นกันในโรงเตี๊ยมว่าต้องการ${CAUSE_TH[cause].demand}`, leader.id);
}

// A movement that starts already out on the street, as a golden age's strike does.
export function rally(world: WorldState, cause: Cause, folk: Npc[], leader: Npc, stage: number, rng: Rng): boolean {
  if (world.movement || !king(world)) return false;
  for (const n of folk) n.marcher = true;
  world.movement = { name: nameOf(world, cause), cause, founded: world.day, leaderId: leader.id, stage, anger: STEP[stage][1] + 5, martyrs: 0, members: folk.length, defectors: 0 };
  if (stage === 3) strike(world, world.movement);
  else log(world, 'politics', `${leader.name}นำชาวเมือง ${folk.length} คนตั้ง${CAUSE_TH[cause].name} เรียกร้อง${CAUSE_TH[cause].demand}`, leader.id);
  if (stage >= 1) answer(world, world.movement, king(world)!, rng);
  return true;
}

// Monthly: friends and kin of members join, the content drift home, and anger follows the cause.
function grow(world: WorldState, mv: Movement, m: Mood, rng: Rng): void {
  const all = adults(world);
  let list = members(world);
  // Members drift home when their life gets better, or the cause is gone.
  for (const n of list) {
    const g = grievances(world, n, m)[mv.cause] ?? 0;
    if (loyaltyOf(n) > LEAVE || (g < 1 && chance(rng, 0.15) && n.id !== mv.leaderId)) n.marcher = undefined;
  }
  list = list.filter((n) => n.marcher);
  // Pamphlets and the crowd in the square carry the word further than talk at the well.
  const reach = 1 + literacy(world) + (known(world, 'printing') ? 0.5 : 0) + (mv.stage >= 2 ? 0.3 : 0) + mv.martyrs * 0.15;
  for (const n of all) {
    if (n.marcher || !commoner(world, n) || loyaltyOf(n) >= 50) continue;
    const g = grievances(world, n, m)[mv.cause] ?? 0;
    if (g < 1 && loyaltyOf(n) >= 30) continue;
    const links = list.filter((o) => close(world, n, o)).length;
    if (links && chance(rng, Math.min(0.5, links * RECRUIT * reach * (g >= 2 ? 1.3 : 1)))) n.marcher = true;
  }
  list = members(world);
  // Anger follows the cause: it burns while the grievance stands, cools when it is gone.
  const share = list.length / Math.max(1, all.length);
  const burning = all.filter((n) => (grievances(world, n, m)[mv.cause] ?? 0) >= 1).length / Math.max(1, all.length);
  let by = burning >= 0.1 ? (4 + burning * 20) * HEAT[mv.cause] : -12;
  if (churchOf(world).stance === 'denounces') by += 4; // the pulpit is on the street's side
  if (churchOf(world).stance === 'blesses') by -= 2;
  mv.anger = clamp(mv.anger + by + share * 10, 0, 100);
  mv.members = list.length;
  // A movement without a leader finds a new one, or melts away.
  // A leader off on a caravan or down a dungeon is still the leader; one dead, gone or jailed is not.
  let leader = list.find((n) => n.id === mv.leaderId);
  if (!leader && list.length >= 3) {
    leader = list.slice().sort((a, b) => fiery(b) - fiery(a))[0];
    mv.leaderId = leader.id;
    log(world, 'politics', `${leader.name}ขึ้นเป็นแกนนำคนใหม่ของ${mv.name}`, leader.id);
  }
  if (list.length < 3 || mv.anger <= 0) disband(world, mv.stage >= 2 ? `${mv.name}ค่อย ๆ สลายตัว ผู้คนกลับไปใช้ชีวิตตามปกติ` : undefined);
}

function disband(world: WorldState, text?: string): void {
  for (const n of world.npcs) n.marcher = undefined;
  world.movement = undefined;
  if (text) log(world, 'politics', text);
}

// Each month a movement out of hand may climb one step, and the ruler must answer it.
function climb(world: WorldState, mv: Movement, rng: Rng): void {
  const ruler = king(world)!;
  const leader = world.npcs.find((n) => n.id === mv.leaderId)!;
  const share = mv.members / Math.max(1, adults(world).length);
  const loyalGuard = strength(armed(world).filter((n) => !n.marcher && loyaltyOf(n) >= 40));
  const next = mv.stage + 1;
  if (next > reach(world)) return;
  // After a crackdown the movement lies low for a season before it shows itself again.
  const lying = mv.last?.act === 'crackdown' && world.day - mv.last.day < LIE_LOW;
  const ready = !lying && (next < 5 || mv.members >= STORM) && next < STEP.length && ((share >= STEP[next][0] && mv.anger >= STEP[next][1]) || (next === 5 && mv.stage === 4 && mv.members >= STORM && mv.defectors > 0 && strength(armed(world).filter((n) => n.marcher)) > loyalGuard));
  if (!ready) return;
  mv.stage = next;
  const { name, demand } = { name: mv.name, demand: CAUSE_TH[mv.cause].demand };
  const n = mv.members;
  if (next === 1) log(world, 'politics', `${leader.name}รวบรวมรายชื่อชาวเมือง ${n} คนยื่นฎีกาต่อกษัตริย์${ruler.name} เรียกร้อง${demand}`, leader.id);
  if (next === 2) log(world, 'politics', `${name} ${n} คนนำโดย${leader.name}เดินขบวนไปหน้าวัง ตะโกนเรียกร้อง${demand}`, leader.id);
  if (next === 3) strike(world, mv);
  if (next === 4) riot(world, mv, rng);
  if (next === 5) return revolution(world, mv, ruler, leader, rng);
  // In a republic the street's answer is the ballot box: a big enough march calls an early vote.
  if (isRepublic(world) && next >= 2) {
    if (!chance(rng, 0.6)) return;
    election(world, rng, `${name}เดินขบวนเรียกร้องให้เลือกตั้งใหม่`);
    mv.anger = clamp(mv.anger - 40, 0, 100);
    mv.stage = 0;
    if (mv.anger < 20) disband(world, `${name}ยุติการชุมนุมหลังการเลือกตั้ง`);
    return;
  }
  answer(world, mv, ruler, rng);
}

// How far a movement can go in a town this size: a camp has none, a village can only petition (its
// few hands can't spare a strike, and a riot would finish it), a town can riot, and only a city's
// crowd is big enough to storm a palace.
const reach = (world: WorldState) => [0, 1, 4, 5][rankOf(world)] ?? 5;
const STORM = 12; // members it takes to storm the palace
const RALLY = 10; // days the crowd gathers before the palace after each meeting out on the street
const MOVE_COST = 25; // faith to hearten or soothe a crowd

// Half the hands out of the fields while the workers among the members down tools.
// One month's strike for each time the movement climbs to it; a hungry town does not leave its own
// fields, so a bread movement shuts the shops instead.
function strike(world: WorldState, mv: Movement): void {
  const workers = members(world).filter((n) => ['farmer', 'herder', 'hunter', 'blacksmith', 'miner', 'woodcutter', 'weaver'].includes(n.job));
  if (workers.length < 3 || mv.cause === 'bread' || priceRatio(world, 'grain') >= 1.6) {
    log(world, 'politics', `ร้านค้าในเมืองปิดประท้วงตาม${mv.name} ตลาดเงียบเหงา`);
    return;
  }
  world.strike = world.day + STRIKE_DAYS;
  log(world, 'politics', `${mv.name}ประกาศนัดหยุดงานทั่วเมือง คนงาน ${workers.length} คนวางเครื่องมือ ทุ่งนาถูกทิ้งร้างครึ่งหนึ่ง`, workers[0].id);
}

// The crowd breaks the market's shutters and the rich men's doors; a torch may catch a roof.
function riot(world: WorldState, mv: Movement, rng: Rng): void {
  const crowd = members(world);
  const m = ensureMarket(world);
  const loot = Math.floor(m.till * 0.15); // the merchants must still buy the next harvest
  m.till -= loot;
  const rich = adults(world).filter((n) => !n.marcher && here(world, n)).sort((a, b) => b.gold - a.gold).slice(0, 3);
  let taken = loot;
  for (const n of rich) {
    const t = Math.floor(n.gold * 0.2);
    n.gold -= t;
    taken += t;
  }
  for (const n of crowd) n.gold += Math.floor(taken / Math.max(1, crowd.length));
  log(world, 'politics', `${mv.name}ก่อจลาจล! ฝูงชน ${crowd.length} คนพังร้านค้าและบ้านคนรวย ปล้นทองไป ${taken} เหรียญ`, mv.leaderId);
  if (chance(rng, 0.3)) {
    const burnt = fire(world, rng);
    if (burnt) log(world, 'disaster', `ไฟจากคบเพลิงของผู้ก่อจลาจลลามไหม้บ้าน ${burnt} หลัง`);
  }
}

// The ruler's answer to a movement that has climbed a step.
function answer(world: WorldState, mv: Movement, ruler: Npc, rng: Rng): void {
  const power = crownPower(world).total;
  const r = world.regime ?? 'monarchy';
  const give = 0.12 + (has(ruler, 'kind') ? 0.3 : 0) + mv.stage * 0.07 + (power < 40 ? 0.15 : 0) - (power >= 70 ? 0.15 : 0) - (has(ruler, 'greedy') ? 0.15 : 0) - (has(ruler, 'vengeful') ? 0.2 : 0) - (r === 'junta' ? 0.2 : 0);
  const crush = 0.1 + (has(ruler, 'vengeful') ? 0.3 : 0) + (has(ruler, 'greedy') ? 0.1 : 0) + (r === 'junta' ? 0.3 : 0) + (power >= 60 ? 0.2 : 0) - (has(ruler, 'kind') ? 0.2 : 0);
  if (chance(rng, Math.max(0.05, give))) {
    const what = concede(world, mv, ruler, rng);
    if (what) return gave(world, mv, ruler, what);
  }
  if (chance(rng, Math.max(0, crush))) return crackdown(world, mv, ruler, rng);
  mv.last = { day: world.day, act: 'ignore' };
}

// Give the movement what it asks, as far as the ruler can. Returns what was given, if anything.
export function concede(world: WorldState, mv: Movement, ruler: Npc, rng: Rng): string | undefined {
  const crown = ensureCrown(world);
  const lower: Record<Tax, Tax> = { high: 'normal', normal: 'low', low: 'low' };
  switch (mv.cause) {
    case 'tax':
      if (crown.tax === 'low') return undefined;
      crown.tax = lower[crown.tax];
      crown.pledge = { cause: 'tax', until: world.day + 365 };
      return `ลดภาษีลงเป็น${TAX_TH[crown.tax]} และสัญญาว่าจะไม่ขึ้นภาษีอีกหนึ่งปี`;
    case 'bread':
      // The treasury pays half of every meal, or at least the tax is lifted; a price cap would only
      // send what grain there is to the black market.
      return grant(world, world.treasury - payrollReserve(world) >= 300 ? 'subsidy' : 'taxfree', ruler, rng, mv.name);
    case 'war': {
      const enemy = world.war && world.realms?.find((x) => x.id === world.war!.realmId);
      if (!enemy) return undefined;
      endWar(world, enemy, 'sued');
      return 'ยอมขอสงบศึก';
    }
    case 'graft': {
      const back = Math.floor(ruler.gold / 2);
      if (back < 20) return undefined;
      ruler.gold -= back;
      world.treasury += back;
      return `คืนทอง ${back} เหรียญเข้าท้องพระคลัง`;
    }
    case 'faith':
      if (faithLawOf(charterOf(world)) !== 'persecute' && world.regime !== 'theocracy') return undefined;
      if (faithLawOf(charterOf(world)) === 'tolerant') return undefined;
      amend(world, faithLaw('tolerant'), `กษัตริย์${ruler.name}ยอมแก้กฎหมายให้ชาวเมืองนับถือศาสนาใดก็ได้ ตามที่${mv.name}เรียกร้อง`);
      return 'ยอมให้เสรีภาพในการนับถือศาสนา';
    case 'tyranny':
      if (world.decrees) world.decrees = world.decrees.filter((d) => d.kind !== 'curfew');
      if (charterOf(world).emergency) amend(world, { emergency: false }, `กษัตริย์${ruler.name}ยอมสละอำนาจพิเศษตามที่${mv.name}เรียกร้อง`);
      crown.pledge = { cause: 'tyranny', until: world.day + 365 };
      return 'ยกเลิกเคอร์ฟิวและอำนาจพิเศษ';
    case 'wealth': {
      const pay = members(world).length * Math.round(5 * levelOf(world));
      if (world.treasury - payrollReserve(world) < pay) return grant(world, 'taxfree', ruler, rng, mv.name);
      world.treasury -= pay;
      for (const n of members(world)) n.gold += Math.round(5 * levelOf(world));
      return `จ่ายค่าแรงชดเชยรวม ${pay} ทอง`;
    }
    case 'voice': {
      const c = charterOf(world);
      if (!c.councilVeto) {
        amend(world, { councilVeto: true }, `กษัตริย์${ruler.name}ยอมให้สภามีอำนาจยับยั้งราชโองการ ตามที่${mv.name}เรียกร้อง`);
        return 'ยอมให้สภามีอำนาจยับยั้ง';
      }
      if (!c.freePress && known(world, 'printing')) {
        amend(world, { freePress: true }, `กษัตริย์${ruler.name}ยอมให้โรงพิมพ์พิมพ์ข่าวได้อย่างเสรี ตามที่${mv.name}เรียกร้อง`);
        return 'ยอมให้มีเสรีภาพสื่อ';
      }
      if ((world.regime ?? 'monarchy') === 'monarchy' && !c.parliament) {
        amend(world, { parliament: true, termYears: 4, parties: 'free' }, `กษัตริย์${ruler.name}ยอมให้มีรัฐสภาจากการเลือกตั้ง ตามที่${mv.name}เรียกร้อง`);
        openParliament(world);
        return 'ยอมให้ราษฎรเลือกตั้งรัฐสภา';
      }
      if (c.parties === 'banned' || c.parties === 'one') {
        amend(world, { parties: 'free' }, `${ruler.name}ยอมให้ตั้งพรรคการเมืองได้อย่างเสรี ตามที่${mv.name}เรียกร้อง`);
        return 'ยอมให้ตั้งพรรคการเมืองได้';
      }
      return undefined;
    }
  }
}

function gave(world: WorldState, mv: Movement, ruler: Npc, what: string): void {
  const crown = ensureCrown(world);
  crown.conceded = (crown.conceded ?? 0) + 1;
  mv.last = { day: world.day, act: 'concede' };
  for (const n of members(world)) n.loyalty = clamp(loyaltyOf(n) + 10, 0, 100);
  // The court thinks less of a ruler the street can move.
  for (const n of adults(world)) if (n.job === 'noble') n.loyalty = clamp(loyaltyOf(n) - 3, 0, 100);
  log(world, 'politics', `กษัตริย์${ruler.name}ยอมตามข้อเรียกร้องของ${mv.name}: ${what}`, ruler.id);
  mv.anger = clamp(mv.anger - 45, 0, 100);
  mv.stage = 0;
  if (mv.anger < 25) disband(world, `${mv.name}ประกาศชัยชนะแล้วสลายตัว`);
}

// The ruler sends the soldiers. Those with friends or kin in the crowd may refuse, and go over.
export function crackdown(world: WorldState, mv: Movement, ruler: Npc, rng: Rng): void {
  const crowd = members(world);
  const leader = crowd.find((n) => n.id === mv.leaderId);
  mv.last = { day: world.day, act: 'crackdown' };
  const guard = armed(world).filter((n) => !n.marcher);
  if (mv.stage >= 2 && guard.length) {
    const refuse = guard.filter((s) => crowd.some((n) => close(world, s, n)) && chance(rng, 0.3 + (loyaltyOf(s) < 40 ? 0.25 : 0)));
    if (refuse.length * 3 >= guard.length) {
      for (const s of refuse) {
        s.marcher = true;
        s.loyalty = clamp(loyaltyOf(s) - 15, 0, 100);
      }
      mv.defectors += refuse.length;
      mv.members += refuse.length;
      mv.anger = clamp(mv.anger + 10, 0, 100);
      log(world, 'politics', `กษัตริย์${ruler.name}สั่งทหารสลายการชุมนุม แต่ทหาร ${refuse.length} นายไม่ยอมทำร้ายประชาชน หันไปยืนข้าง${mv.name}!`, refuse[0].id);
      return;
    }
  }
  // Prisoners, and in a crowd that has come to blows, the dead.
  if (leader && chance(rng, 0.7)) {
    leader.jailedUntil = world.day + JAIL;
    leader.marcher = undefined;
  }
  let dead = 0;
  if (mv.stage >= 3)
    for (const n of crowd) if (n !== leader && n.alive && chance(rng, 0.06 + (mv.stage - 3) * 0.04)) {
      kill(world, n, `ถูกทหารสังหารระหว่างสลายการชุมนุมของ${mv.name}`);
      dead++;
    }
  // Fear sends some home; the dead make the rest angrier.
  for (const n of crowd) if (n.alive && n.marcher && n !== leader && chance(rng, has(n, 'coward') ? 0.5 : 0.25)) n.marcher = undefined;
  mv.martyrs += dead;
  mv.anger = clamp(mv.anger + dead * 12 - (dead ? 0 : 15), 0, 100);
  mv.stage = Math.max(0, mv.stage - 1);
  for (const n of adults(world)) if (!n.marcher && n.job !== 'soldier' && literate(n)) n.loyalty = clamp(loyaltyOf(n) - 2, 0, 100); // the readers hear of it
  const jailedLeader = leader && jailed(world, leader);
  log(world, 'politics', `กษัตริย์${ruler.name}สั่งทหารสลาย${mv.name}${jailedLeader ? ` จับ${leader!.name}ขังคุก` : ''}${dead ? ` มีผู้เสียชีวิต ${dead} คน ชาวเมืองยกย่องเป็นผู้พลีชีพ` : ''}`, ruler.id);
  mv.members = members(world).length;
  if (mv.members < 3) {
    disband(world, `${mv.name}แตกพ่ายหลังถูกปราบ`);
    if (dead) ensureCrown(world).fear = world.day + FEAR / 2;
  }
}

// The last step: the crowd and whoever went over to it storm the palace.
export function revolution(world: WorldState, mv: Movement, ruler: Npc, leader: Npc, rng: Rng): void {
  const crowd = members(world);
  const turned = crowd.filter((n) => n.job === 'soldier' || n.knight);
  const loyal = armed(world).filter((n) => !n.marcher && loyaltyOf(n) >= 40);
  const rebels = (crowd.length - turned.length) * 0.5 + strength(turned) * 1.5;
  const guard = strength(loyal) * 2 + 1;
  log(world, 'politics', `${mv.name} ${crowd.length} คน${turned.length ? `และทหารแปรพักตร์ ${turned.length} นาย` : ''}นำโดย${leader.name}บุกวัง หมายโค่นกษัตริย์${ruler.name}!`, leader.id);
  if (!chance(rng, rebels / (rebels + guard))) {
    if (has(ruler, 'kind')) {
      leader.alive = false;
      leader.left = true;
      leader.plan = undefined;
      log(world, 'politics', `การปฏิวัติล้มเหลว ${leader.name}ถูกเนรเทศออกจากเมือง`, leader.id);
    } else kill(world, leader, 'ถูกประหารหลังการปฏิวัติล้มเหลว');
    for (const n of crowd) if (n !== leader && n.alive && chance(rng, 0.08)) kill(world, n, 'ล้มลงระหว่างการปฏิวัติ');
    for (const n of crowd) n.loyalty = clamp(loyaltyOf(n) - 5, 0, 100);
    ensureCrown(world).fear = world.day + FEAR;
    return disband(world);
  }
  depose(world, ruler, leader, rng);
  const loot = Math.floor(world.treasury / 3);
  world.treasury -= loot;
  for (const n of crowd) n.gold += Math.floor(loot / Math.max(1, crowd.length));
  legend(world, `${leader.name} นำ${mv.name}โค่นกษัตริย์${ruler.name}`, leader.id);
  disband(world);
  settle(world, mv, leader, turned, rng);
}

// Who rules after the crowd wins. Not always its leader on a new throne: a town that reads does
// without a ruler, an army that went over puts its own general in, a faith revolt hands power to
// the church, and only an ambitious leader crowns themselves; otherwise a people's council.
function settle(world: WorldState, mv: Movement, leader: Npc, turned: Npc[], rng: Rng): void {
  const general = turned.slice().sort((a, b) => b.level + (b.gear ?? 0) - (a.level + (a.gear ?? 0)))[0];
  // The workers of a town of factories rise for bread and wages: they abolish property itself.
  if ((mv.cause === 'wealth' || mv.cause === 'bread') && world.regime !== 'commune' && (industrial(world) || world.works?.factory !== undefined) && !(general && turned.length * 3 >= mv.members)) {
    return proclaimCommune(world, leader, rng, `${leader.name}นำคนงานยึดเมือง ประกาศว่าทรัพย์สินทั้งหมดเป็นของประชาชน สาธารณรัฐประชาชนถือกำเนิดขึ้น!`);
  }
  if (known(world, 'printing') || literacy(world) >= REFORM_LITERACY || mv.cause === 'voice') return proclaimRepublic(world, leader, rng);
  if (general && turned.length * 3 >= mv.members) return seize(world, 'junta', general, 'ทหารที่แปรพักตร์ยึดอำนาจหลังการปฏิวัติ', `${general.name} นำทหารแปรพักตร์ตั้งคณะทหาร`);
  if (mv.cause === 'faith' && leader.job === 'priest') return seize(world, 'theocracy', leader, 'นำการปฏิวัติของผู้ศรัทธา', `${leader.name} ตั้งเทวาธิปไตยหลังการปฏิวัติ`);
  if ((has(leader, 'greedy') || has(leader, 'vengeful')) && leader.morality < 20) return enthrone(world, leader, 'นำการปฏิวัติของชาวเมือง');
  proclaimRepublic(world, leader, rng, `ฝูงชนไม่ยอมให้ใครขึ้นเป็นกษัตริย์อีก ${leader.name}ตั้งสภาประชาชนให้ชาวเมืองเลือกผู้นำของตนเอง`);
}
