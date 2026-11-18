// Sagas: great matters that run over months and touch many parts of the town at once. A gold
// rush draws strangers, coin and thieves; a comet sets the preachers and the frightened going; a
// royal child is stolen and the crown must pay, fight or wait; the black death sweeps the known
// world and the town must choose between its trade and its life. Each opens with a headline and
// a decision (a happening raised here, decided like any other) and then plays out month by
// month as the town chose. One saga at a time, a good while apart; the gold rush and the comet
// can come to a village.
import { chance, int, pick, type Rng } from './rng';
import { addMod, clamp, headline, kill, known, legend, log, loyaltyNudge, occupied, isAdventurer } from './core';
import { king, payrollReserve } from './society';
import { ensureCrown } from './politics';
import { levelOf } from './market';
import { headOf } from './church';
import { rankOf } from './growth';
import { raise, type Def } from './happenings';
import { plagueStrike } from './worldevents';
import { AWAY, type Npc, type Saga, type SagaKind, type WorldState } from './types';

const SAGA_DAY = 14; // day of the month sagas begin and move on
const GAP = 540; // days at least from the end of one saga to the start of the next
const ODDS = 0.08; // monthly chance one begins once the gap has passed and one can
const AGAIN = 8 * 365; // days at least before the same kind of saga comes round again
const RUSH_MONTHS = 8;
const COMET_MONTHS = 3;
const PLAGUE_WAVES = 3;

const adults = (w: WorldState) => w.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);
const ofJob = (w: WorldState, job: Npc['job']) => adults(w).filter((n) => n.job === job);
const ruler = (w: WorldState) => king(w) ?? ofJob(w, 'noble').sort((a, b) => b.age - a.age)[0];
const nudgeAll = (ns: Npc[], by: number) => ns.forEach((n) => loyaltyNudge(n, by));
const spare = (w: WorldState) => w.treasury - payrollReserve(w);
const lvl = (w: WorldState) => levelOf(w);
const living = (w: WorldState) => w.npcs.filter((n) => n.alive && n.inside === undefined).length;
const sagaOf = (w: WorldState, k: SagaKind) => (w.saga?.kind === k ? w.saga : undefined);
const choose = (w: WorldState, k: SagaKind, c: string) => {
  const s = sagaOf(w, k);
  if (s) s.choice = c;
};
// A child of the ruler young enough to be carried off, and not the heir about to inherit.
const stealable = (w: WorldState) => {
  const k = king(w);
  return k && w.npcs.find((n) => n.alive && n.inside === undefined && n.questId === undefined && n.parentIds?.includes(k.id) && n.age >= 4 && n.age <= 20 && n.job !== 'king');
};
const captive = (w: WorldState) => w.npcs.find((n) => n.id === w.saga?.ctx && n.alive);

export const SAGA_TH: Record<SagaKind, string> = { goldrush: 'ตื่นทอง', comet: 'ดาวหาง', ransom: 'ราชบุตรถูกลักพาตัว', pestilence: 'กาฬโรค', luddites: 'ขบวนการค้อนเหล็ก' };
const BREAK_MONTHS = 3; // nights of machine-breaking a town that lets them be sees
const BROKEN = 0.25; // of the farms' engines smashed each month they go on

// When each may begin.
const CAN: Record<SagaKind, (w: WorldState) => boolean> = {
  goldrush: (w) => rankOf(w) >= 1 && living(w) >= 25 && !!ruler(w),
  comet: (w) => living(w) >= 20,
  ransom: (w) => rankOf(w) >= 1 && !!stealable(w),
  pestilence: (w) => rankOf(w) >= 1 && living(w) >= 50 && (w.realms ?? []).filter((r) => !r.fallen).length >= 2,
  luddites: (w) => known(w, 'steam') && (w.mech ?? 0) >= 0.5 && (w.machinery ?? 0) >= 4 && !!ruler(w),
};

// Once a day: on the saga day, move the one under way along, or perhaps begin one.
export function sagasDay(w: WorldState, rng: Rng): void {
  if (w.day % 30 !== SAGA_DAY || occupied(w)) return;
  const s = w.saga;
  if (s) {
    s.stage++;
    if (STEP[s.kind](w, s, rng)) {
      w.saga = undefined;
      w.sagaAt = w.day;
    }
    return;
  }
  if (w.happening || w.day < 365 || w.day - (w.sagaAt ?? 0) < GAP || !chance(rng, ODDS)) return;
  const open = (Object.keys(CAN) as SagaKind[]).filter((k) => CAN[k](w) && w.day - (w.sagaLast?.[k] ?? -AGAIN) >= AGAIN);
  if (open.length) begin(w, pick(rng, open), rng);
}

// Start a saga (also used by tests to force one).
export function begin(w: WorldState, k: SagaKind, rng: Rng): boolean {
  if (w.saga || !CAN[k](w)) return false;
  w.saga = { kind: k, stage: 0, since: w.day };
  (w.sagaLast ??= {})[k] = w.day;
  START[k](w, rng);
  return true;
}

const START: Record<SagaKind, (w: WorldState, rng: Rng) => void> = {
  goldrush: (w, rng) => {
    const finder = pick(rng, ofJob(w, 'farmer').length ? ofJob(w, 'farmer') : adults(w));
    w.saga!.ctx = finder.id;
    finder.gold += Math.round(20 * lvl(w));
    headline(w, 'world', `${finder.name}ร่อนพบเกล็ดทองคำในลำธารนอกเมือง! ข่าวลือแพร่ไปทั่วตลาดภายในวันเดียว`, finder.id);
    if (!raise(w, 'goldrush', rng)) choose(w, 'goldrush', 'open');
  },
  comet: (w, rng) => {
    headline(w, 'world', 'ดาวหางหางยาวสีเพลิงปรากฏบนฟ้าทุกค่ำคืน ผู้คนออกมายืนมองกันทั้งเมือง บ้างว่าเป็นลางดี บ้างว่าเป็นลางร้าย');
    if (!raise(w, 'comet', rng)) choose(w, 'comet', 'good');
  },
  ransom: (w, rng) => {
    const child = stealable(w)!;
    const k = king(w)!;
    w.saga!.ctx = child.id;
    child.inside = AWAY;
    child.plan = undefined;
    child.trip = undefined;
    ensureCrown(w).unrest += 1;
    headline(w, 'politics', `${child.name} บุตรของ${k.name} ถูกชุมโจรลักพาตัวไประหว่างเที่ยวป่า! โจรส่งจดหมายเรียกค่าไถ่มาถึงวัง`, child.id);
    if (!raise(w, 'ransom', rng)) choose(w, 'ransom', 'refuse');
  },
  pestilence: (w, rng) => {
    const realms = (w.realms ?? []).filter((r) => !r.fallen);
    for (const r of realms) if (chance(rng, 0.6)) r.plagueUntil = Math.max(r.plagueUntil ?? 0, w.day + 240);
    headline(w, 'disaster', 'กาฬโรคระบาดไปทั่วแผ่นดิน! แคว้นข้างเคียงหลายแห่งศพกองเต็มถนน พ่อค้าเล่าว่าโรคกำลังมาตามเส้นทางการค้า');
    if (!raise(w, 'quarantine', rng)) choose(w, 'pestilence', 'open');
  },
  luddites: (w, rng) => {
    smash(w);
    headline(w, 'politics', 'ชาวไร่ที่ตกงานเพราะเครื่องจักรเวทรวมตัวกันกลางดึก เรียกตัวเองว่าขบวนการค้อนเหล็ก ทุบเครื่องจักรในไร่นาพังไปหลายเครื่อง!');
    if (!raise(w, 'breakers', rng)) choose(w, 'luddites', 'ignore');
  },
};
// A night's work for the machine-breakers.
const smash = (w: WorldState) => (w.machinery = (w.machinery ?? 0) * (1 - BROKEN));

// A month on; true when it is over.
const STEP: Record<SagaKind, (w: WorldState, s: Saga, rng: Rng) => boolean> = {
  goldrush: (w, s, rng) => {
    const c = s.choice ?? 'open';
    if (c === 'hush') {
      log(w, 'world', 'ลำธารถูกถมและไม่มีใครพูดถึงทองอีก ชาวบ้านบางคนยังแอบไปร่อนทองตอนกลางคืน');
      return true;
    }
    if (s.stage >= RUSH_MONTHS) {
      headline(w, 'world', `สายแร่ทองในลำธารหมดลงแล้ว${c === 'open' ? ' ผู้แสวงโชคที่มาไม่ทันเก็บข้าวของจากไป' : ' คลังหลวงปิดเหมือง'}`);
      legend(w, 'ยุคตื่นทองของเมือง');
      return true;
    }
    if (c === 'crown') {
      const take = Math.round(35 * lvl(w));
      w.treasury += take;
      if (s.stage % 3 === 1) log(w, 'world', `เหมืองทองหลวงส่งทองเข้าคลังเดือนนี้ ${take} ทอง คนงานเหมืองบ่นว่าค่าแรงไม่คุ้มเหนื่อย`);
      if (s.stage % 3 === 2) nudgeAll(ofJob(w, 'farmer'), -2);
    } else {
      // Every hand with a pan has a chance at it; most find nothing.
      const lucky = adults(w).filter(() => chance(rng, 0.08));
      for (const n of lucky) n.gold += Math.round(int(rng, 4, 14) * lvl(w));
      if (s.stage % 3 === 1) log(w, 'world', `ผู้แสวงโชคแห่มาร่อนทองริมลำธาร เดือนนี้มี ${lucky.length} คนร่อนได้ทอง ตลาดคึกคักแต่ขโมยก็ชุม`);
    }
    // Word reaches a greedy neighbour, who wants a share.
    if (s.stage === 4) {
      const r = (w.realms ?? []).filter((x) => !x.fallen && !x.war && x.ruler.traits.includes('greedy'))[0];
      if (r) {
        r.relation = clamp(r.relation - 10, -100, 100);
        log(w, 'politics', `ข่าวทองคำไปถึง${r.name} ${r.ruler.name}ส่งคนมาอ้างว่าลำธารสายนี้เป็นของแคว้นตน`);
      }
    }
    return false;
  },
  comet: (w, s) => {
    const c = s.choice ?? 'good';
    if (s.stage === 1 && c === 'doom') {
      const leaving = adults(w).filter((n) => n.traits.includes('coward') && n.job !== 'king').slice(0, 2);
      for (const n of leaving) {
        n.alive = false;
        n.left = true;
        n.plan = undefined;
      }
      log(w, 'world', `นักเทศน์วันสิ้นโลกเดินตะโกนทั่วตลาด${leaving.length ? ` ${leaving.map((n) => n.name).join(' กับ')}หนีออกจากเมืองไปพร้อมครอบครัว` : ''} คนที่เหลือแห่ไปทำบุญ`);
      return false;
    }
    if (s.stage === 1 && c === 'study') {
      w.knowledge = (w.knowledge ?? 0) + 40;
      log(w, 'world', 'นักปราชญ์เฝ้าดูดาวหางทุกคืน จดบันทึกเส้นทางของมันลงตำรา ความรู้ของเมืองก้าวหน้าขึ้น');
      return false;
    }
    if (s.stage < COMET_MONTHS) return false;
    if (c === 'doom') {
      const head = headOf(w);
      if (head) loyaltyNudge(head, 4);
      nudgeAll(ofJob(w, 'priest'), 3);
      headline(w, 'world', 'ดาวหางลับฟ้าไปโดยไม่มีอะไรเกิดขึ้น นักบวชประกาศว่าเป็นเพราะชาวเมืองกลับใจทันเวลา');
    } else headline(w, 'world', 'ดาวหางค่อยๆ ลับฟ้าไป เด็กๆ ในเมืองยังเล่าเรื่องมันกันไปอีกนาน');
    legend(w, 'ปีที่ดาวหางผ่านฟ้า');
    return true;
  },
  ransom: (w, s, rng) => {
    const child = captive(w);
    if (!child) return true;
    const home = (how: string) => {
      child.inside = undefined;
      child.plan = undefined;
      headline(w, 'politics', how, child.id);
      return true;
    };
    const c = s.choice ?? 'refuse';
    if (c === 'pay') return home(`${child.name}ได้รับการปล่อยตัวกลับวังอย่างปลอดภัยหลังจ่ายค่าไถ่ ชาวเมืองออกมาต้อนรับ`);
    if (c === 'rescue' || c === 'soldiers') {
      const odds =
        c === 'rescue'
          ? Math.min(0.9, 0.4 + 0.05 * Math.max(0, ...adults(w).filter(isAdventurer).map((n) => n.level)))
          : Math.min(0.85, 0.35 + 0.08 * ofJob(w, 'soldier').length);
      if (chance(rng, odds)) {
        const by = c === 'rescue' ? adults(w).filter(isAdventurer).sort((a, b) => b.level - a.level)[0] : undefined;
        if (by) {
          by.renown = (by.renown ?? 0) + 5;
          legend(w, `${by.name} ช่วย${child.name}จากชุมโจร`, by.id);
        }
        nudgeAll(adults(w), 3);
        return home(`${by ? by.name : 'ทหารหลวง'}บุกค่ายโจรกลางดึก ช่วย${child.name}ออกมาได้! ทั้งเมืองฉลองกันจนรุ่งเช้า`);
      }
      if (c === 'soldiers') {
        const troop = ofJob(w, 'soldier');
        if (troop.length) kill(w, pick(rng, troop), 'สละชีพระหว่างบุกค่ายโจรเพื่อช่วยราชบุตร');
      }
      s.choice = 'refuse'; // the bandits slip away deeper into the woods
      log(w, 'politics', `การบุกค่ายโจรล้มเหลว โจรพา${child.name}หนีลึกเข้าไปในป่า`, child.id);
      return false;
    }
    // Nobody pays: the child is held until it escapes, or worse.
    if (s.stage < 4) return false;
    if (chance(rng, 0.55)) return home(`${child.name}หนีออกจากค่ายโจรได้เองหลังถูกขังมาหลายเดือน เดินกลับเข้าเมืองในสภาพผอมโซ`);
    child.inside = undefined;
    kill(w, child, 'ถูกชุมโจรสังหารเพราะไม่ได้ค่าไถ่');
    const k = king(w);
    if (k) loyaltyNudge(k, -10);
    ensureCrown(w).unrest += 3;
    headline(w, 'politics', `ข่าวร้ายมาถึงวัง ${child.name}ถูกโจรสังหาร ชาวเมืองโทษว่าผู้ปกครองใจดำ`);
    return true;
  },
  pestilence: (w, s, rng) => {
    const c = s.choice ?? 'open';
    const severity = c === 'close' ? 0.15 : c === 'care' ? 0.28 : 0.42;
    if (s.stage <= PLAGUE_WAVES) {
      plagueStrike(w, rng, severity, s.stage === 1 ? 'กาฬโรคมาถึงเมือง' : 'กาฬโรคระลอกใหม่');
      return false;
    }
    w.sealed = undefined;
    headline(w, 'disaster', `กาฬโรคสงบลงแล้ว${c === 'close' ? ' ประตูเมืองเปิดอีกครั้ง พ่อค้ากลับมาค้าขาย' : ''} ผู้รอดชีวิตจุดเทียนรำลึกถึงคนที่จากไป`);
    legend(w, 'ปีกาฬโรค');
    return true;
  },
  luddites: (w, s, rng) => {
    const c = s.choice ?? 'ignore';
    if (c === 'hang') {
      headline(w, 'politics', 'ศาลสั่งแขวนคอแกนนำขบวนการค้อนเหล็กกลางลานเมือง ไม่มีใครกล้าแตะเครื่องจักรอีก แต่ชาวไร่ไม่มีวันลืม');
      return true;
    }
    if (c === 'relief') {
      log(w, 'politics', 'ชาวไร่ที่ได้ค่าชดเชยกลับบ้าน บางคนไปสมัครเป็นกรรมกรโรงงาน ขบวนการค้อนเหล็กสลายตัวไปเงียบๆ');
      return true;
    }
    if (s.stage <= BREAK_MONTHS) {
      smash(w);
      const mill = (w.mills ?? []).filter((m) => w.day >= m.ready)[0];
      if (mill && chance(rng, 0.4)) mill.ready = w.day + 30; // a mill's gears jammed with a clog
      log(w, 'politics', `ขบวนการค้อนเหล็กออกทุบเครื่องจักรอีกคืน${mill ? ` และลอบพัง${mill.name}` : ''} เครื่องจักรในไร่นาเหลือ ${Math.floor(w.machinery ?? 0)} เครื่อง`);
      return false;
    }
    headline(w, 'politics', 'ขบวนการค้อนเหล็กหมดแรงไปเอง เครื่องจักรที่เหลือกลับมาไถนาอีกครั้ง');
    legend(w, 'ยุคขบวนการค้อนเหล็ก');
    return true;
  },
};

// The decisions the sagas raise, decided like any happening (they join DEFS in happenings.ts).
export const SAGA_DEFS = {
  goldrush: {
    title: 'ทองคำในลำธาร',
    mtth: 1,
    gap: 0,
    can: () => false, // raised by the saga
    decider: ruler,
    text: () => 'พบทองคำในลำธารนอกเมือง ผู้คนอยากรู้ว่าทางการจะทำอย่างไรกับมัน',
    options: [
      {
        key: 'open',
        label: 'เปิดให้ทุกคนร่อนทอง',
        likes: { kind: 1.5, brave: 1.5, greedy: 0.8 },
        act: (w) => {
          choose(w, 'goldrush', 'open');
          addMod(w, 'arrivals', 0.6, 30 * RUSH_MONTHS, 'ข่าวตื่นทอง');
          addMod(w, 'crime', 0.1, 30 * RUSH_MONTHS, 'ผู้แสวงโชคแปลกหน้า');
          return 'ใครมีกระทะก็ลงร่อนได้ ผู้แสวงโชคจากต่างถิ่นเริ่มหลั่งไหลเข้าเมือง';
        },
      },
      {
        key: 'crown',
        label: 'ผูกขาดเป็นเหมืองหลวง',
        likes: { greedy: 3, vengeful: 1.2, kind: 0.5 },
        act: (w) => {
          choose(w, 'goldrush', 'crown');
          nudgeAll(adults(w), -3);
          return 'ทหารล้อมลำธารไว้ ทองทุกเกล็ดต้องเข้าคลังหลวง ชาวบ้านบ่นว่าผู้ปกครองฮุบของที่เทพประทานให้ทุกคน';
        },
      },
      {
        key: 'hush',
        label: 'ปิดข่าว ถมลำธาร',
        likes: { coward: 2, loyal: 1.3, brave: 0.5 },
        act: (w) => {
          choose(w, 'goldrush', 'hush');
          return 'ทางการประกาศว่าเป็นแค่ทรายสีเหลือง และส่งคนไปถมลำธาร เมืองยังสงบเหมือนเดิม';
        },
      },
    ],
  },
  comet: {
    title: 'ดาวหางบนฟ้า',
    mtth: 1,
    gap: 0,
    can: () => false,
    decider: (w) => headOf(w) ?? ofJob(w, 'priest')[0] ?? ruler(w),
    text: () => 'ทั้งเมืองรอฟังว่าดาวหางคือลางอะไร',
    options: [
      {
        key: 'good',
        label: 'ประกาศว่าเป็นลางดี',
        likes: { kind: 2, loyal: 1.3 },
        act: (w) => {
          choose(w, 'comet', 'good');
          addMod(w, 'piety', 3, 120, 'ดาวหางลางดี');
          nudgeAll(adults(w), 2);
          return 'ผู้คนจุดประทีปบูชาดาวหาง เชื่อว่าเทพประทานพรให้เมือง';
        },
      },
      {
        key: 'doom',
        label: 'ประกาศว่าเป็นลางร้าย ให้ทุกคนกลับใจ',
        likes: { coward: 2, vengeful: 1.5, greedy: 1.3 },
        act: (w) => {
          choose(w, 'comet', 'doom');
          addMod(w, 'piety', 8, 150, 'ดาวหางลางร้าย');
          addMod(w, 'arrivals', -0.3, 150, 'ข่าวลางร้าย');
          const c = w.religion?.church;
          if (c) c.purse += Math.round(30 * lvl(w));
          if (ensureCrown(w) && (w.npcs.find((n) => n.id === w.kingId)?.loyalty ?? 50) < 50) ensureCrown(w).unrest += 2;
          return 'นักบวชเทศนาว่าเทพพิโรธ ผู้คนแห่ไปทำบุญจนวัดล้น บางคนกระซิบว่าเทพพิโรธผู้ปกครอง';
        },
      },
      {
        key: 'study',
        label: 'ให้นักปราชญ์ศึกษา',
        likes: { brave: 1.5, kind: 1.1, coward: 0.6 },
        can: (w) => ofJob(w, 'scholar').length > 0,
        act: (w) => {
          choose(w, 'comet', 'study');
          return 'นักปราชญ์ตั้งกล้องดูดาวบนหอคอย ชาวเมืองครึ่งหนึ่งสนใจ อีกครึ่งว่าเป็นการลบหลู่';
        },
      },
    ],
  },
  ransom: {
    title: 'ค่าไถ่ราชบุตร',
    mtth: 1,
    gap: 0,
    can: () => false,
    decider: (w) => king(w),
    text: (w) => `โจรเรียกค่าไถ่ ${Math.round(80 * lvl(w))} ทองแลกกับ${captive(w)?.name ?? 'ราชบุตร'}`,
    options: [
      {
        key: 'pay',
        label: 'จ่ายค่าไถ่',
        likes: { kind: 2, coward: 2, loyal: 1.3, greedy: 0.4 },
        can: (w) => spare(w) >= 80 * lvl(w),
        act: (w) => {
          choose(w, 'ransom', 'pay');
          const fee = Math.round(80 * lvl(w));
          w.treasury -= fee;
          addMod(w, 'crime', 0.08, 360, 'โจรได้ค่าไถ่');
          return `คลังหลวงจ่าย ${fee} ทองให้โจร โจรป่าได้ใจ`;
        },
      },
      {
        key: 'rescue',
        label: 'ส่งนักผจญภัยไปช่วย',
        likes: { brave: 2.5, vengeful: 1.3, coward: 0.5 },
        can: (w) => adults(w).some(isAdventurer),
        act: (w) => {
          choose(w, 'ransom', 'rescue');
          return 'นักผจญภัยฝีมือดีที่สุดของเมืองออกตามรอยโจรเข้าป่า';
        },
      },
      {
        key: 'soldiers',
        label: 'ส่งทหารบุกค่ายโจร',
        likes: { brave: 2, vengeful: 2, kind: 0.7 },
        can: (w) => ofJob(w, 'soldier').length >= 2,
        act: (w) => {
          choose(w, 'ransom', 'soldiers');
          return 'ทหารหลวงเตรียมอาวุธ มุ่งหน้าไปยังค่ายโจร';
        },
      },
      {
        key: 'refuse',
        label: 'ไม่เจรจากับโจร',
        likes: { vengeful: 2, greedy: 2, kind: 0.3 },
        act: (w) => {
          choose(w, 'ransom', 'refuse');
          return 'ผู้ปกครองประกาศว่าจะไม่ให้ทองแม้แต่เหรียญเดียวกับโจร ชาวเมืองใจหายแทนราชบุตร';
        },
      },
    ],
  },
  quarantine: {
    title: 'กาฬโรคใกล้ประตูเมือง',
    mtth: 1,
    gap: 0,
    can: () => false,
    decider: ruler,
    text: () => 'กาฬโรคกำลังมาตามเส้นทางการค้า ต้องเลือกว่าจะปิดเมืองหรือค้าขายต่อ',
    options: [
      {
        key: 'close',
        label: 'ปิดเมือง ห้ามคาราวานเข้าออก',
        likes: { coward: 2.5, loyal: 1.2, greedy: 0.5 },
        act: (w) => {
          choose(w, 'pestilence', 'close');
          w.sealed = w.day + 30 * (PLAGUE_WAVES + 1);
          addMod(w, 'arrivals', -0.8, 30 * (PLAGUE_WAVES + 1), 'ปิดเมืองหนีกาฬโรค');
          nudgeAll(ofJob(w, 'merchant'), -10);
          return 'ประตูเมืองปิด ให้ผ่านเฉพาะเกวียนข้าว พ่อค้าโวยวายว่าจะล้มละลาย';
        },
      },
      {
        key: 'open',
        label: 'ค้าขายตามปกติ',
        likes: { greedy: 2.5, brave: 1.5, coward: 0.3 },
        act: (w) => {
          choose(w, 'pestilence', 'open');
          nudgeAll(ofJob(w, 'merchant'), 4);
          return 'ประตูเมืองยังเปิด พ่อค้าดีใจ แต่หมอและนักบวชส่ายหน้า';
        },
      },
      {
        key: 'care',
        label: 'ให้วัดและหมอตั้งโรงพยาบาลสนาม',
        likes: { kind: 2.5, loyal: 1.2 },
        can: (w) => ofJob(w, 'priest').length + ofJob(w, 'doctor').length > 0,
        act: (w) => {
          choose(w, 'pestilence', 'care');
          const c = w.religion?.church;
          if (c) c.purse = Math.max(0, c.purse - Math.round(30 * lvl(w)));
          addMod(w, 'piety', 4, 180, 'นักบวชดูแลคนป่วย');
          return 'วัดเปิดศาลาเป็นที่พักคนป่วย หมอและนักบวชผลัดกันดูแลทั้งวันทั้งคืน';
        },
      },
    ],
  },
  breakers: {
    title: 'ขบวนการค้อนเหล็ก',
    mtth: 1,
    gap: 0,
    can: () => false,
    decider: ruler,
    text: () => 'ชาวไร่ที่ตกงานเพราะเครื่องจักรเวทออกทุบเครื่องจักรทุกคืน ต้องเลือกว่าจะทำอย่างไรกับพวกเขา',
    options: [
      {
        key: 'hang',
        label: 'จับแกนนำแขวนคอ',
        likes: { vengeful: 3, greedy: 1.3, kind: 0.2 },
        act: (w) => {
          choose(w, 'luddites', 'hang');
          nudgeAll(ofJob(w, 'farmer'), -10);
          ensureCrown(w).unrest += 3;
          return 'ทหารตามล่าแกนนำทุกหมู่บ้าน เจ้าของเครื่องจักรโล่งใจ ชาวไร่เกลียดผู้ปกครองเข้ากระดูก';
        },
      },
      {
        key: 'relief',
        label: 'จ่ายค่าชดเชยให้ชาวไร่ที่ตกงาน',
        likes: { kind: 3, loyal: 1.2, greedy: 0.3 },
        can: (w) => spare(w) >= 80 * lvl(w),
        act: (w) => {
          choose(w, 'luddites', 'relief');
          const poor = ofJob(w, 'farmer').filter((n) => n.gold < 20 * lvl(w));
          const each = Math.round(5 * lvl(w));
          const paid = Math.min(poor.length * each, Math.round(80 * lvl(w)));
          w.treasury -= paid;
          for (const n of poor.slice(0, Math.floor(paid / Math.max(1, each)))) n.gold += each;
          nudgeAll(ofJob(w, 'farmer'), 6);
          return `คลังหลวงจ่ายค่าชดเชย ${paid} ทอง ชาวไร่วางค้อนลง เจ้าของโรงงานบ่นว่าใช้ภาษีไปเลี้ยงคนขี้เกียจ`;
        },
      },
      {
        key: 'ignore',
        label: 'ปล่อยให้เจ้าของเครื่องจักรจัดการกันเอง',
        likes: { coward: 2.5, greedy: 1.3 },
        act: (w) => {
          choose(w, 'luddites', 'ignore');
          return 'ทางการไม่ยื่นมือเข้าไป การทุบเครื่องจักรลามไปทุกหมู่บ้าน';
        },
      },
    ],
  },
} satisfies Record<string, Def>;
