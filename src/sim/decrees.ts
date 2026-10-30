// Royal decrees: the king answers the town's troubles with policy, each kind of king in his
// own way. A decree is issued at the start of a month when its need is plain, costs the
// treasury what it costs, runs a while, and can't be issued again for a season.
import { chance, int, pick, type Rng } from './rng';
import { decreeActive, known, log, loyaltyNudge } from './core';
import { leaveTrade } from './society';
import { ensureMarket, priceRatio } from './market';
import { literate } from './learning';
import { king, payrollReserve } from './society';
import { traveller } from './world';
import { putToCouncil } from './government';
import { builtFor } from './housing';
import { charterOf, landPolicyOf } from './charter';
import { frontier } from './lands';
import { canSend, folkOf, labour } from './villages';
import { conquestWar, weakest } from './war';
import { CEILING, TARIFF, TARIFF_ON_IMPORTS, breadIsDear, embargo, embargoTarget } from './commerce';
import type { Decree, Job, Npc, WorldState } from './types';

export interface DecreeDef {
  name: string;
  text: string; // what it does, for the kingdom tab
  days: number; // how long it stands
}

export const DECREES: Record<Decree, DecreeDef> = {
  labour: { name: 'ป่าวประกาศจ้างแรงงานต่างเมือง', text: 'ใช้ทองจ้างคนจากเมืองอื่นมาทำงานเมื่อคนในเมืองไม่พอ', days: 60 },
  subsidy: { name: 'ข้าวราคาหลวง', text: 'ท้องพระคลังออกค่าอาหารให้ครึ่งหนึ่งในยามข้าวยากหมากแพง', days: 60 },
  bounty: { name: 'ตั้งค่าหัวมอนสเตอร์', text: 'ให้รางวัลนักผจญภัยทุกครั้งที่ลงดันเจี้ยนสำเร็จ เมื่อดันเจี้ยนใกล้ทะลัก', days: 90 },
  curfew: { name: 'ประกาศเคอร์ฟิว', text: 'ห้ามออกจากบ้านยามค่ำ โจรลงมือยากขึ้น แต่ชาวเมืองอึดอัด', days: 60 },
  taxfree: { name: 'งดเก็บภาษี', text: 'พักการเก็บภาษีเพื่อเอาใจชาวเมืองที่กำลังไม่พอใจ', days: 60 },
  levy: { name: 'เกณฑ์ทหาร', text: 'บังคับชาวบ้านเข้ากองทัพในยามศึกสงครามหรือจอมมารคุกคาม', days: 30 },
  colonize: { name: 'ล่าอาณานิคม', text: 'บังคับย้ายครอบครัวไปบุกเบิกทุกเดือน รีดส่วยหัวเมืองเต็มที่ และยกทัพยึดดินแดนเพื่อนบ้านที่อ่อนแอ หมู่บ้านไม่พอใจ', days: 180 },
  expand: { name: 'ขยายแผ่นดิน', text: 'ให้เงินตั้งตัวครอบครัวที่อาสาไปบุกเบิกดินแดนใหม่ หมู่บ้านใหม่ภักดีต่อเมืองหลวง', days: 120 },
  tribute: { name: 'เกณฑ์ส่วยหัวเมือง', text: 'เรียกเก็บผลผลิตทั้งหมดจากหมู่บ้านเพื่ออุดท้องพระคลัง หมู่บ้านไม่พอใจ', days: 60 },
  relief: { name: 'ลดส่วยหัวเมือง', text: 'ลดส่วยให้หมู่บ้านที่ลำบากหรือไม่พอใจ เก็บผลผลิตไว้เองได้มากขึ้น', days: 90 },
  garrison: { name: 'ส่งทหารรักษาหัวเมือง', text: 'ส่งทหารไปประจำหมู่บ้านที่คิดแยกตัว กันไม่ให้แยกตัวได้ แต่ชาวบ้านรู้สึกถูกยึดครอง', days: 120 },
  tariff: { name: 'ภาษีศุลกากร', text: 'เก็บภาษีสินค้าเข้าออกประตูเมือง คลังได้เงินเพิ่ม แต่การค้าซบเซาและกิลด์โจรได้ลักลอบขนของ', days: 120 },
  embargo: { name: 'ห้ามค้ากับแคว้นศัตรู', text: 'ปิดเส้นทางการค้ากับแคว้นที่เป็นศัตรู ทำให้เขาเสียรายได้ แต่ของเถื่อนไหลเข้ามาแทน', days: 180 },
  ceiling: { name: 'คุมราคาข้าว', text: 'กำหนดราคาข้าวสูงสุดในยามข้าวแพง ข้าวบางส่วนหลุดไปขายในตลาดมืดแทน', days: 60 },
  debase: { name: 'ลดค่าเหรียญ', text: 'ผสมโลหะลงในเหรียญทองเพื่อผลิตเหรียญเพิ่ม ท้องพระคลังได้ทองทันที แต่ข้าวของแพงขึ้นทั้งเมือง', days: 30 },
};
export const DECREE_ORDER: readonly Decree[] = ['labour', 'subsidy', 'bounty', 'curfew', 'taxfree', 'levy', 'colonize', 'expand', 'tribute', 'relief', 'garrison', 'tariff', 'embargo', 'ceiling', 'debase'];

const REVIEW_DAY = 3; // day of the month the king looks over his decrees
const COOLDOWN = 180; // days before the same decree may be issued again
const VETO_WAIT = 60; // days before a decree the council blocked may be put to it again
const SPARE = 200; // gold kept back beyond the soldiers' pay
const SHORT = 6; // residents missing before the king sends for labour
const WAGE = 35; // gold per worker: the crier, the road, and a purse to settle in
const recent = (world: WorldState, days: number, re: RegExp) => world.chronicle.filter((e) => e.day > world.day - days && re.test(e.text)).length;
const has = (k: Npc, t: Npc['traits'][number]) => k.traits.includes(t);
const LABOUR_JOBS: readonly Job[] = ['farmer', 'farmer', 'farmer', 'herder', 'herder', 'hunter', 'merchant', 'blacksmith'];

export { decreeActive };
const budget = (world: WorldState) => world.treasury - payrollReserve(world) - SPARE;
const ready = (world: WorldState, k: Decree) => world.day - (world.decreeAt?.[k] ?? -COOLDOWN) >= COOLDOWN;

// Workers to send for, and what it would cost; none if the town is near full or the crown can't pay.
function labourNeed(world: WorldState): number {
  const living = world.npcs.filter((n) => n.alive).length;
  const missing = builtFor(world) - living;
  if (missing < SHORT) return 0;
  return Math.min(missing, Math.floor(budget(world) / WAGE), 10);
}

// Each kind of decree: whether this king would issue it now, and issuing it.
const RULES: Record<Decree, { wants: (world: WorldState, k: Npc, rng: Rng) => boolean; issue: (world: WorldState, k: Npc, rng: Rng) => string }> = {
  labour: {
    wants: (world, k) => labourNeed(world) >= 3 && !(k.traits.includes('greedy') && world.treasury < 1500),
    issue: (world) => {
      const n = labourNeed(world);
      world.treasury -= n * WAGE;
      world.labour = (world.labour ?? 0) + n;
      // Word goes out along the trade roads; the friendliest neighbour sends the most.
      const from = [...(world.realms ?? [])].filter((r) => !r.fallen && !r.war).sort((a, b) => b.relation - a.relation)[0];
      if (from) from.people = Math.max(50, from.people - n);
      return `จ้างแรงงาน ${n} คน${from ? `จาก${from.name}` : ''} (${n * WAGE} ทอง)`;
    },
  },
  // Dear bread: a kind king, or one losing the people, has the treasury pay half of every meal.
  subsidy: {
    wants: (world, k, rng) =>
      !has(k, 'greedy') && budget(world) >= 300 && (priceRatio(world, 'grain') >= 1.8 || world.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2).length >= 5) && (has(k, 'kind') || (world.crown?.unrest ?? 0) > 0 || chance(rng, 0.5)),
    issue: () => 'ท้องพระคลังจะช่วยออกค่าอาหารครึ่งหนึ่ง 60 วัน',
  },
  // A dungeon close to spilling over: gold for every adventurer who goes down and comes back.
  bounty: {
    wants: (world, k) => budget(world) >= 400 && world.dungeons.some((d) => d.power >= 60) && (has(k, 'brave') || !has(k, 'greedy') || world.treasury > 2000),
    issue: () => `จ่าย ${BOUNTY} ทองทุกครั้งที่นักผจญภัยลงดันเจี้ยนสำเร็จ 90 วัน`,
  },
  // A thieving season: a stern king locks the streets at night.
  curfew: {
    wants: (world, k) => !has(k, 'kind') && recent(world, 90, /ขโมยทอง/) >= 6,
    issue: (world) => `หลังเกิดการลักขโมย ${recent(world, 90, /ขโมยทอง/)} ครั้งในสามเดือน`,
  },
  // Grumbling streets and a full treasury: let them keep their coin for a while.
  taxfree: {
    wants: (world, k) => budget(world) >= 800 && approvalOf(world) < 40 && (has(k, 'kind') || (world.crown?.unrest ?? 0) > 0),
    issue: () => 'ชาวเมืองไม่ต้องจ่ายภาษี 60 วัน',
  },
  // War at the gates or the demon lord awake, and too few under arms: press commoners into service.
  levy: {
    wants: (world) => (!!world.war || world.demon?.stage === 'risen') && pressable(world).length >= 3 && world.npcs.filter((n) => n.alive && n.job === 'soldier').length < 10,
    issue: (world, _k, rng) => {
      const taken = pressable(world).slice(0, int(rng, 3, 4));
      for (const n of taken) {
        leaveTrade(n);
        n.job = 'soldier';
        n.plan = undefined;
        loyaltyNudge(n, -10);
      }
      return `เกณฑ์ ${taken.map((n) => n.name).join(', ')} เข้ากองทัพ`;
    },
  },
  // A grasping ruler with gold to spend reaches for an empire: settlers driven out, the villages bled,
  // and, where the charter allows conquest, the army sent against a weak neighbour.
  colonize: {
    wants: (world, k) =>
      has(k, 'greedy') && !has(k, 'kind') && landPolicyOf(charterOf(world)) !== 'peace' && budget(world) >= 800 && !world.war && (openCountry(world) || (landPolicyOf(charterOf(world)) === 'conquest' && !!weakest(world))),
    issue: (world) => {
      const prey = landPolicyOf(charterOf(world)) === 'conquest' ? weakest(world) : undefined;
      if (prey) conquestWar(world, prey);
      return `บังคับย้ายครอบครัวไปบุกเบิกและรีดส่วยหัวเมืองเต็มที่ 180 วัน${prey ? ` และยกทัพไปยึดดินแดนของ${prey.name}` : ''}`;
    },
  },
  // A gentle or bold ruler pays families to go out and break new ground.
  expand: {
    wants: (world, k) => has(k, 'kind') || has(k, 'brave') ? !has(k, 'greedy') && budget(world) >= 500 && (openCountry(world) || ourVillages(world).some((r) => labour(world, r) < 0.7)) && canSend(world) : false,
    issue: () => `ให้เงินตั้งตัวครอบครัวละ ${GRANT} ทองแก่ผู้อาสาไปบุกเบิก 120 วัน`,
  },
  // An empty treasury and a greedy ruler: every grain the villages grow goes to the capital.
  tribute: {
    wants: (world, k) => has(k, 'greedy') && !charterOf(world).provinces && world.treasury < 400 && ourVillages(world).length >= 2,
    issue: (world) => `เรียกเก็บผลผลิตทั้งหมดจาก ${ourVillages(world).length} หมู่บ้าน 60 วัน`,
  },
  // The villages are restless: a kind or loyal ruler eases their burden.
  relief: {
    wants: (world, k) => (has(k, 'kind') || has(k, 'loyal')) && !has(k, 'greedy') && (restless(world, 45).length >= 2 || restless(world, 30).length >= 1),
    issue: (world) => `ลดส่วยให้หมู่บ้าน 90 วัน (${restless(world, 45).length} หมู่บ้านกำลังไม่พอใจ)`,
  },
  // A ruler who wants the gates to pay: a greedy one, or a crown short of gold, where the charter allows it.
  tariff: {
    wants: (world, k) => world.day > 365 && world.day - (world.decreeAt?.tariff ?? -9999) >= 540 && charterOf(world).economy !== 'free' && budget(world) < (has(k, 'greedy') ? 100 : -100) && !has(k, 'kind') && world.npcs.some((n) => n.alive && n.job === 'merchant'), // a squeeze for a crown in real need, not a habit
    issue: () => `เก็บภาษีขาออก ${TARIFF * 100}% และขาเข้า ${Math.round((TARIFF_ON_IMPORTS - 1) * 100)}% ที่ประตูเมือง 120 วัน`,
  },
  // A bold or vengeful ruler starves an enemy of our trade.
  embargo: {
    wants: (world, k) => (has(k, 'vengeful') || has(k, 'brave')) && !!embargoTarget(world),
    issue: (world) => {
      const r = embargoTarget(world)!;
      embargo(world, r);
      return `ปิดเส้นทางการค้ากับ${r.name} 180 วัน`;
    },
  },
  // Bread too dear for the poor: a kind ruler, or one afraid of the street, caps its price.
  ceiling: {
    wants: (world, k) => charterOf(world).economy !== 'free' && breadIsDear(world) && (has(k, 'kind') || world.regime === 'junta' || (world.crown?.unrest ?? 0) > 0),
    issue: () => `ราคาข้าวต้องไม่เกิน ${CEILING} เท่าของราคาปกติ 60 วัน`,
  },
  // A greedy ruler with an empty vault thins the coin rather than tighten the belt.
  debase: {
    wants: (world, k) => has(k, 'greedy') && world.treasury < payrollReserve(world) && (ensureMarket(world).debase ?? 1) < 1.6 && world.day - (world.decreeAt?.debase ?? -9999) >= 1095, // once in three years at most
    issue: (world, k) => debase(world, k),
  },
  // A village on the edge of breaking away: a bold or vengeful ruler sends soldiers to hold it.
  garrison: {
    wants: (world, k) => (has(k, 'brave') || has(k, 'vengeful')) && restless(world, 25).length >= 1 && world.npcs.filter((n) => n.alive && n.job === 'soldier').length >= 6 && budget(world) >= GARRISON_COST,
    issue: (world) => {
      const held = restless(world, 25).slice(0, 2);
      world.treasury -= GARRISON_COST * held.length;
      for (const r of held) r.village!.garrison = world.day + DECREES.garrison.days;
      return `ส่งทหารไปประจำ${held.map((r) => r.name).join(' และ')}`;
    },
  },
};
// Clipping the coin: a greedy ruler short of gold mints more out of the same metal. The vault
// fills at once; every coin in every purse is worth less from then on, and a free press says so.
const DEBASE_BY = 1.12;
function debase(world: WorldState, k: Npc): string {
  const m = ensureMarket(world);
  const minted = 200 + Math.floor(Math.max(0, world.treasury) * 0.2);
  world.treasury += minted;
  m.debase = Math.round((m.debase ?? 1) * DEBASE_BY * 1000) / 1000;
  if (charterOf(world).freePress && known(world, 'printing')) {
    for (const n of world.npcs) if (n.alive && n.age >= 16 && literate(n)) loyaltyNudge(n, -6);
    log(world, 'politics', `ใบปลิวเปิดโปงว่า${k.name}สั่งผสมโลหะในเหรียญ ชาวเมืองที่อ่านออกโกรธเคือง`, k.id);
  }
  return `ผลิตเหรียญใหม่ได้ ${minted} ทอง ค่าเงินลดลงอีก ${Math.round((DEBASE_BY - 1) * 100)}%`;
}

export const GRANT = 40; // gold for each family who goes out under the expansion decree
const GARRISON_COST = 60; // the soldiers' upkeep, per village held

// Our villages, and the ones that are restless.
const ourVillages = (world: WorldState) => (world.regions ?? []).filter((r) => r.owner === 'us' && !r.seat && r.village && folkOf(world, r).length);
const restless = (world: WorldState, below: number) => ourVillages(world).filter((r) => r.village!.loyalty < below);
const openCountry = (world: WorldState) => frontier(world, 'us').some((r) => r.owner === undefined && !r.village?.free);

// Young, able commoners in trades the town can spare a hand from.
function pressable(world: WorldState): Npc[] {
  const count = (j: Job) => world.npcs.filter((n) => n.alive && n.job === j && n.age >= 16).length;
  return world.npcs.filter(
    (n) => n.alive && n.age >= 16 && n.age <= 40 && n.questId === undefined && n.inside === undefined && ['farmer', 'herder', 'hunter', 'merchant'].includes(n.job) && count(n.job) > 2 && !n.cultist,
  );
}

const approvalOf = (world: WorldState) => {
  const a = world.npcs.filter((n) => n.alive && n.age >= 16 && n.job !== 'king');
  return a.length ? a.reduce((s, n) => s + (n.loyalty ?? 50), 0) / a.length : 50;
};

export const BOUNTY = 12;

export function decreesDay(world: WorldState, rng: Rng): void {
  // Hired hands trickle in through the west gate over the following weeks.
  if (world.labour && chance(rng, 0.25)) {
    world.labour--;
    traveller(world, rng, pick(rng, LABOUR_JOBS));
  }
  if (world.decrees?.length) world.decrees = world.decrees.filter((d) => d.until > world.day);
  if (world.day % 30 !== REVIEW_DAY) return;
  const k = king(world);
  if (!k) return;
  const next = DECREE_ORDER.find((d) => !decreeActive(world, d) && ready(world, d) && RULES[d].wants(world, k, rng));
  if (!next) return;
  if (!putToCouncil(world, next, DECREES[next].name, k, rng)) {
    (world.decreeAt ??= {})[next] = world.day - COOLDOWN + VETO_WAIT; // the king may try again later
    return;
  }
  const what = RULES[next].issue(world, k, rng);
  (world.decrees ??= []).push({ kind: next, since: world.day, until: world.day + DECREES[next].days });
  (world.decreeAt ??= {})[next] = world.day;
  log(world, 'politics', `กษัตริย์${k.name}ออกพระราชโองการ${DECREES[next].name}: ${what}`, k.id);
}
