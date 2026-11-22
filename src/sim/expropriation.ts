// Expropriation (เวนคืน): where the town plan (zoning.ts) and the town disagree, whoever governs
// decides what gives. Homes standing on ground the plan keeps for the works or the parks can be bought
// out at a fair price, taken for a pittance, or left where they are and the plan bent round them; the
// shacks squatting on planned ground can be cleared with new homes for their people, cleared and their
// people turned out, or left. Those turned out cheaply remember it (Npc.evicted) and may band together
// over it (movements.ts, cause 'land'); a powerful owner will not be paid a pittance at all. A ruler
// who gives way to them (concede) pledges to take no more land for a while.
import { addMod, log, loyaltyNudge } from './core';
import { levelOf } from './market';
import { ensureCrown } from './politics';
import { governor } from './parties';
import { amendPlan, offPlan } from './zones';
import { SHACK_BASE, lotXY } from './town';
import type { Def } from './happenings';
import type { Home, Npc, WorldState } from './types';

const HOME_PRICE = [40, 110, 160] as const; // a fair price for a home of each tier, at the founding's prices
const CHEAP = 0.25; // what a pittance is of a fair price
const AT_ONCE = 3; // homes taken in one go
const REHOUSE = 25; // gold a shack, at the founding's prices, for the crown to house its people
export const GRUDGE = 3 * 360; // days someone turned out of their home without fair pay holds it against the crown

const fair = (w: WorldState, h: Home) => Math.round(HOME_PRICE[h.tier] * levelOf(w));
// The homes in the plan's way, a few at a time, the ones on green ground first.
export const inTheWay = (w: WorldState): Home[] => {
  const lots = new Set(offPlan(w).homes.slice(0, AT_ONCE));
  return (w.homes ?? []).filter((h) => lots.has(h.lot));
};
const dwellers = (w: WorldState, lots: Set<number>) => w.npcs.filter((n) => n.alive && n.home !== undefined && lots.has(n.home));
// Who is paid for a home: whoever paid for it, else the eldest who lives there.
const ownerOf = (w: WorldState, h: Home) =>
  w.npcs.find((n) => n.id === h.ownerId && n.alive) ?? dwellers(w, new Set([h.lot])).filter((n) => n.age >= 16).sort((a, b) => b.age - a.age)[0];
// Someone with the standing to make a fuss the governor has to listen to.
const powerful = (w: WorldState, n: Npc | undefined) => !!n && (n.job === 'noble' || n.job === 'priest' || (n.job === 'merchant' && n.gold >= 200 * levelOf(w)));
// The street was promised no more of it (concede, cause 'land').
export const pledged = (w: WorldState) => w.crown?.pledge?.cause === 'land' && w.crown.pledge.until > w.day;
const planned = (w: WorldState) => !!w.zoning && (w.rank ?? 2) >= 2 && !!governor(w) && !pledged(w);

// The homes go: those in them are out on the street until the town finds them room.
function evict(w: WorldState, homes: Home[], wronged: boolean): Npc[] {
  const lots = new Set(homes.map((h) => h.lot));
  const out = dwellers(w, lots);
  for (const n of out) {
    n.home = undefined;
    if (wronged) n.evicted = w.day;
    loyaltyNudge(n, wronged ? -20 : -6);
  }
  w.homes = (w.homes ?? []).filter((h) => !lots.has(h.lot));
  w.buildRev = (w.buildRev ?? 0) + 1;
  return out;
}

// The shacks on planned ground, and their people.
const squatters = (w: WorldState) => offPlan(w).shacks;
function clearShacks(w: WorldState, wronged: boolean): Npc[] {
  const tiles = new Set(squatters(w));
  const out = w.npcs.filter((n) => n.alive && n.home !== undefined && n.home >= SHACK_BASE && tiles.has(n.home - SHACK_BASE));
  for (const n of out) {
    n.home = undefined;
    if (wronged) n.evicted = w.day;
    loyaltyNudge(n, wronged ? -15 : 5);
  }
  w.shacks = (w.shacks ?? []).filter((s) => !tiles.has(s));
  w.slum = Math.max(0, (w.slum ?? 0) - out.length);
  return out;
}

const ofJob = (w: WorldState, job: Npc['job']) => w.npcs.filter((n) => n.alive && n.age >= 16 && n.job === job && n.inside === undefined);

export const EXPROPRIATION: Record<'expropriate' | 'slumclear', Def> = {
  expropriate: {
    title: 'เวนคืนที่ดินตามผังเมือง',
    mtth: 360,
    gap: 540,
    can: (w) => planned(w) && inTheWay(w).length > 0,
    decider: (w) => governor(w),
    text: (w) => {
      const hs = inTheWay(w);
      const cost = hs.reduce((s, h) => s + fair(w, h), 0);
      return `ผังเมืองกันที่ไว้ทำโรงงานและสวน แต่มีบ้าน ${hs.length} หลังขวางอยู่ ถ้าจะเวนคืนตามราคาที่เป็นธรรมต้องจ่าย ${cost} ทอง เจ้าของบ้านบางคนบอกว่าไม่ยอมย้ายง่าย ๆ`;
    },
    options: [
      {
        key: 'pay',
        label: 'เวนคืนและจ่ายค่าชดเชยเต็มราคา',
        likes: { kind: 1.5, loyal: 1.3, brave: 1.2 },
        can: (w) => w.treasury >= inTheWay(w).reduce((s, h) => s + fair(w, h), 0),
        act: (w) => {
          const hs = inTheWay(w);
          let paid = 0;
          for (const h of hs) {
            const o = ownerOf(w, h);
            w.treasury -= fair(w, h);
            paid += fair(w, h);
            if (o) o.gold += fair(w, h);
          }
          const out = evict(w, hs, false);
          return `บ้าน ${hs.length} หลังถูกเวนคืน เจ้าของได้ค่าชดเชยรวม ${paid} ทอง ${out.length} คนต้องหาที่อยู่ใหม่ แต่ไม่มีใครว่าทางการโกง ที่ดินพร้อมสร้างตามผัง`;
        },
      },
      {
        key: 'cheap',
        label: 'เวนคืนโดยจ่ายแค่พอเป็นพิธี',
        likes: { greedy: 2.2, brave: 1.3, kind: 0.3 },
        act: (w) => {
          const hs = inTheWay(w);
          let paid = 0;
          const loud: string[] = [];
          for (const h of hs) {
            const o = ownerOf(w, h);
            // The powerful will not be paid a pittance: they get their price, or the governor hears of it.
            const price = powerful(w, o) ? fair(w, h) : Math.round(fair(w, h) * CHEAP);
            if (powerful(w, o)) loud.push(o!.name);
            const pay = Math.min(price, Math.max(0, w.treasury));
            w.treasury -= pay;
            paid += pay;
            if (o) o.gold += pay;
          }
          const lots = new Set(hs.map((h) => h.lot));
          const poor = dwellers(w, lots).filter((n) => !loud.includes(n.name));
          const out = evict(w, hs, true);
          for (const n of out) if (!poor.includes(n)) n.evicted = undefined; // the powerful were paid in full
          ensureCrown(w).unrest += 2;
          return `บ้าน ${hs.length} หลังถูกรื้อ ทางการจ่ายไปแค่ ${paid} ทอง${loud.length ? ` (${loud.join(' ')} ไม่ยอมรับเงินเล็กน้อย ทางการต้องจ่ายเต็มราคา)` : ''} ${poor.length} คนถูกไล่ที่โดยแทบไม่ได้อะไร และจะไม่ลืมเรื่องนี้`;
        },
      },
      {
        key: 'defer',
        label: 'เลื่อนแผน แก้ผังให้บ้านเหล่านั้นอยู่ต่อ',
        likes: { coward: 1.8, kind: 1.4, loyal: 1.1 },
        act: (w) => {
          const hs = inTheWay(w);
          for (const h of hs) amendPlan(w, lotXY(h.lot).x + 1, lotXY(h.lot).y + 1, 0, 'home', 'any');
          w.buildRev = (w.buildRev ?? 0) + 1;
          for (const n of ofJob(w, 'merchant')) loyaltyNudge(n, -4);
          return `ผังเมืองถูกแก้ให้บ้าน ${hs.length} หลังอยู่ที่เดิม ชาวบ้านโล่งใจ แต่พ่อค้าบ่นว่าเขตโรงงานและสวนเล็กลง`;
        },
      },
    ],
  },
  slumclear: {
    title: 'รื้อชุมชนแออัด',
    mtth: 360,
    gap: 720,
    can: (w) => planned(w) && squatters(w).length >= 3,
    decider: (w) => governor(w),
    text: (w) => `เพิง ${squatters(w).length} หลังบุกรุกที่ที่ผังเมืองกันไว้ให้บ้าน ร้านค้า และสวน ทางการต้องตัดสินว่าจะทำอย่างไรกับคนที่อยู่ในนั้น`,
    options: [
      {
        key: 'rehouse',
        label: 'รื้อเพิงแล้วสร้างบ้านให้คนที่อยู่',
        likes: { kind: 2, loyal: 1.3 },
        can: (w) => w.treasury >= squatters(w).length * Math.round(REHOUSE * levelOf(w)),
        act: (w) => {
          const cost = squatters(w).length * Math.round(REHOUSE * levelOf(w));
          w.treasury -= cost;
          const out = clearShacks(w, false);
          addMod(w, 'building', 1, 360, 'โครงการบ้านสำหรับคนที่ถูกรื้อเพิง');
          return `ทางการใช้ ${cost} ทองรื้อเพิงและเร่งสร้างบ้านให้ ${out.length} คนที่เคยอยู่ในชุมชนแออัด ระหว่างรอบ้านเสร็จพวกเขายังไม่มีที่อยู่ แต่มีความหวัง`;
        },
      },
      {
        key: 'clear',
        label: 'ไล่รื้อ ใครไม่มีที่ไปก็ออกจากเมือง',
        likes: { greedy: 1.8, brave: 1.5, kind: 0.2 },
        act: (w) => {
          const out = clearShacks(w, true);
          addMod(w, 'crime', -0.1, 360, 'ชุมชนแออัดถูกรื้อ');
          ensureCrown(w).unrest += 2;
          return `ทหารรื้อเพิงทิ้ง ${out.length} คนถูกไล่ออกมาอยู่ข้างถนน ย่านนั้นสะอาดตาและลักขโมยน้อยลง แต่คนที่ถูกไล่จะไม่ลืม`;
        },
      },
      {
        key: 'leave',
        label: 'ปล่อยให้อยู่ไปก่อน',
        likes: { coward: 1.6, kind: 1.3, greedy: 1.1 },
        act: (w) => {
          for (const n of ofJob(w, 'merchant')) loyaltyNudge(n, -3);
          addMod(w, 'crime', 0.05, 360, 'ชุมชนแออัดในเขตเมือง');
          return 'เพิงยังอยู่ที่เดิม คนในนั้นโล่งใจ พ่อค้าบ่นว่าขโมยชุกและไม่มีใครกล้าเดินผ่านตอนค่ำ';
        },
      },
    ],
  },
};

// How much being turned out without fair pay weighs on someone (movements.ts grievances).
export const evictedGrudge = (w: WorldState, n: Npc) => (n.evicted !== undefined && w.day - n.evicted < GRUDGE ? 3 : 0);

// The street wins (movements.ts concede): those turned out are paid what they were owed, and the
// governor promises to take no more land for two years.
export function compensate(w: WorldState, members: Npc[]): string | undefined {
  const wronged = members.filter((n) => n.evicted !== undefined);
  const each = Math.round(40 * levelOf(w));
  if (!wronged.length || w.treasury < wronged.length * each) return undefined;
  for (const n of wronged) {
    w.treasury -= each;
    n.gold += each;
    n.evicted = undefined;
  }
  ensureCrown(w).pledge = { cause: 'land', until: w.day + 720 };
  log(w, 'politics', `ทางการจ่ายค่าชดเชยเพิ่มให้ ${wronged.length} คนที่ถูกไล่ที่ คนละ ${each} ทอง`);
  return 'จ่ายค่าชดเชยที่เป็นธรรมและสัญญาว่าจะไม่เวนคืนที่ดินอีกสองปี';
}
