// Happenings, after the events of grand strategy games: now and then a matter comes up (a
// bumper harvest, refugees at the gate, a noble wanting land), someone in town must decide it,
// and they decide as the person they are: a greedy king sells the surplus, a kind one throws a
// feast. The matter waits a few days first, and in that time the god may whisper in the
// decider's dreams to tip the scale, never to force it. A life the player is living decides its
// own matters. Every happening, its options, the choice and why, goes in the chronicle and the
// town's book of happenings; lasting effects become mods (see modOf) that wear off in time.
import { chance, int, next, pick, type Rng } from './rng';
import { addMod, clamp, log, loyaltyNudge, perkLevel } from './core';
import { isAvatar } from './avatar';
import { jobName } from './ages';
import { TRAIT_TH } from './names';
import { king } from './society';
import { headOf } from './church';
import { addTie } from './ties';
import { basePrice, ensureMarket, levelOf, priceRatio, target } from './market';
import { traveller } from './world';
import { capacity, inShack } from './housing';
import { AFFAIRS } from './affairs';
import { SAGA_DEFS } from './sagas';
import type { Happening, HappeningKind, Mod, ModKey, Npc, Trait, WorldState } from './types';

export const WHISPER_COST = 8; // faith to whisper for one option
const WHISPER_PULL = 4; // how much a whisper multiplies that option's weight
const PENDING_DAYS = 5; // a matter waits this long for the decider (and the god) before it is settled
const KEPT = 30; // happenings kept in the book
const MONTH = 30;

export interface Option {
  key: string;
  label: string;
  base?: number; // weight before the decider's traits; 1 if missing
  likes?: Partial<Record<Trait, number>>; // multiplies the weight for a decider with that trait
  can?: (world: WorldState, h: Happening) => boolean; // offered only when this holds
  act: (world: WorldState, rng: Rng, h: Happening, decider: Npc) => string; // what comes of it, for the log
}

export interface Def {
  title: string;
  mtth: number; // mean days before it comes up, while it can
  gap: number; // days at least between two of a kind
  can: (world: WorldState) => boolean;
  sooner?: (world: WorldState) => number; // >1 brings it on faster
  decider: (world: WorldState, rng: Rng) => Npc | undefined;
  ctx?: (world: WorldState, rng: Rng) => number | undefined; // who or what it is about
  text: (world: WorldState, h: Happening) => string;
  options: Option[];
}

// ---------- mods: a happening's lasting effect on some rate in the sim (addMod, modOf in core.ts) ----------

export const MOD_TH: Record<ModKey, string> = { harvest: 'ผลผลิตข้าว', sickness: 'โรคภัย', crime: 'อาชญากรรม', arrivals: 'คนย้ายเข้าเมือง', piety: 'ศรัทธา', fire: 'ไฟไหม้', building: 'การสร้างบ้านของทางการ' };
export const activeMods = (world: WorldState): Mod[] => (world.mods ?? []).filter((m) => m.until > world.day);

// ---------- who decides ----------

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);
const ofJob = (world: WorldState, job: Npc['job']) => adults(world).filter((n) => n.job === job);
const byId = (world: WorldState, id?: number) => (id === undefined ? undefined : world.npcs.find((n) => n.id === id && n.alive));
// The ruler, or failing one the senior noble.
const ruler = (world: WorldState) => king(world) ?? ofJob(world, 'noble').sort((a, b) => b.age - a.age)[0];
const realmOf = (world: WorldState, h: Happening) => world.realms?.find((r) => r.id === h.ctx);
const nudgeAll = (ns: Npc[], by: number) => ns.forEach((n) => loyaltyNudge(n, by));
const grainSurplus = (world: WorldState) => ensureMarket(world).stock.grain - target(world, 'grain');

const DEFS: Record<HappeningKind, Def> = {
  bumper: {
    title: 'ข้าวล้นยุ้ง',
    mtth: 360,
    gap: 360,
    can: (w) => grainSurplus(w) >= target(w, 'grain') * 0.5,
    decider: ruler,
    text: (w) => `ปีนี้ข้าวดีจนล้นยุ้ง เกินกว่าที่เมืองต้องกินถึง ${Math.round(grainSurplus(w))} กระสอบ จะทำอย่างไรกับส่วนที่เหลือ`,
    options: [
      {
        key: 'sell',
        label: 'ขายให้แคว้นข้างเคียง',
        likes: { greedy: 3, vengeful: 1.2 },
        act: (w) => {
          const n = Math.floor(grainSurplus(w) * 0.6);
          const gold = Math.round(n * basePrice('grain') * levelOf(w) * 0.8);
          ensureMarket(w).stock.grain -= n;
          w.treasury += gold;
          return `ส่งข้าว ${n} กระสอบออกไปขาย ได้ทอง ${gold} เข้าคลัง`;
        },
      },
      {
        key: 'store',
        label: 'เก็บไว้ยามข้าวยากหมากแพง',
        likes: { coward: 2.5, loyal: 1.5 },
        act: () => 'ข้าวทั้งหมดเก็บไว้ในยุ้ง เผื่อปีที่ฟ้าไม่เป็นใจ',
      },
      {
        key: 'feast',
        label: 'จัดงานเลี้ยงฉลองทั้งเมือง',
        likes: { kind: 3, brave: 1.3 },
        act: (w) => {
          const n = Math.floor(grainSurplus(w) * 0.4);
          ensureMarket(w).stock.grain -= n;
          nudgeAll(adults(w), 4);
          addMod(w, 'piety', 4, 90, 'งานเลี้ยงฉลองข้าวล้นยุ้ง');
          return `ทั้งเมืองกินเลี้ยงสามวันสามคืน ใช้ข้าวไป ${n} กระสอบ ชาวเมืองรักผู้ปกครองขึ้นและขอบคุณเทพเจ้า`;
        },
      },
    ],
  },
  refugees: {
    title: 'ผู้ลี้ภัยที่ประตูเมือง',
    mtth: 540,
    gap: 360,
    can: (w) => !!troubledRealm(w),
    sooner: (w) => (capacity(w) > living(w) + 5 ? 1.5 : 0.7),
    decider: ruler,
    ctx: (w, rng) => {
      const r = troubled(w);
      return r.length ? pick(rng, r).id : undefined;
    },
    text: (w, h) => `ผู้คนจาก${realmOf(w, h)?.name ?? 'แคว้นข้างเคียง'}หนีภัยมาขออาศัยอยู่ในเมืองของเรา`,
    options: [
      {
        key: 'all',
        label: 'เปิดประตูรับทุกคน',
        likes: { kind: 3, loyal: 1.2, greedy: 0.5 },
        act: (w, rng, h) => {
          const n = int(rng, 4, 7);
          for (let i = 0; i < n; i++) traveller(w, rng);
          const r = realmOf(w, h);
          if (r) r.relation = clamp(r.relation + 10, -100, 100);
          return `ผู้ลี้ภัย ${n} คนเข้ามาตั้งรกรากในเมือง${r ? ` ${r.name}ซาบซึ้งในน้ำใจ` : ''}`;
        },
      },
      {
        key: 'skilled',
        label: 'รับเฉพาะคนมีฝีมือ',
        likes: { greedy: 2.5, coward: 1.2 },
        act: (w, rng, h) => {
          for (const job of ['builder', 'blacksmith'] as const) traveller(w, rng, job);
          const r = realmOf(w, h);
          if (r) r.relation = clamp(r.relation + 2, -100, 100);
          return 'รับช่างก่อสร้างกับช่างตีเหล็กไว้ ที่เหลือต้องเดินทางต่อ';
        },
      },
      {
        key: 'shut',
        label: 'ปิดประตูเมือง',
        likes: { coward: 3, vengeful: 2, kind: 0.3 },
        act: (w, _rng, h) => {
          const r = realmOf(w, h);
          if (r) r.relation = clamp(r.relation - 8, -100, 100);
          nudgeAll(adults(w).filter((n) => n.traits.includes('kind')), -4);
          return `ผู้ลี้ภัยถูกไล่ไป${r ? ` ${r.name}ไม่พอใจ` : ''} คนใจดีในเมืองต่างสลดใจ`;
        },
      },
    ],
  },
  clearing: {
    title: 'ถางป่าทำไร่',
    mtth: 360,
    gap: 720,
    can: (w) => priceRatio(w, 'grain') >= 1.3 && (w.game ?? 0) >= 8,
    decider: ruler,
    text: () => 'ข้าวแพงขึ้นทุกวัน ชาวนาขอถางป่าตะวันออกเปิดไร่ใหม่ แต่พรานป่าคัดค้านเพราะสัตว์จะหนีหมด',
    options: [
      {
        key: 'clear',
        label: 'ถางป่าเปิดไร่ใหม่',
        likes: { greedy: 2, brave: 1.5 },
        act: (w) => {
          w.game = Math.max(0, (w.game ?? 0) - 8);
          addMod(w, 'harvest', 0.15, 720, 'ไร่ใหม่จากการถางป่า');
          nudgeAll(ofJob(w, 'hunter'), -10);
          nudgeAll(ofJob(w, 'farmer'), 4);
          return 'ป่าถูกถางเป็นไร่ ข้าวจะได้มากขึ้นสองปี แต่กวางหนีไปมาก พรานป่าโกรธเคือง';
        },
      },
      {
        key: 'keep',
        label: 'รักษาป่าไว้',
        likes: { kind: 1.5, loyal: 1.3, coward: 1.2 },
        act: (w) => {
          nudgeAll(ofJob(w, 'farmer'), -5);
          return 'ป่ายังอยู่ พรานป่าโล่งใจ ชาวนาบ่นว่าผู้ปกครองไม่เห็นใจคนหิว';
        },
      },
    ],
  },
  wages: {
    title: 'ช่างขอขึ้นค่าแรง',
    mtth: 540,
    gap: 540,
    can: (w) => ofJob(w, 'builder').length >= 2 && w.treasury >= 300,
    decider: ruler,
    text: (w) => `ช่างก่อสร้าง ${ofJob(w, 'builder').length} คนรวมตัวกันที่หน้าปราสาท ขอค่าแรงเพิ่ม`,
    options: [
      {
        key: 'pay',
        label: 'ขึ้นค่าแรงให้',
        likes: { kind: 2.5, loyal: 1.2, greedy: 0.4 },
        act: (w) => {
          const bs = ofJob(w, 'builder');
          w.treasury -= bs.length * 10;
          for (const b of bs) {
            b.gold += 10;
            loyaltyNudge(b, 10);
          }
          return `คลังจ่ายเพิ่ม ${bs.length * 10} ทอง ช่างพอใจกลับไปทำงาน`;
        },
      },
      {
        key: 'refuse',
        label: 'ปฏิเสธ',
        likes: { greedy: 2.5, vengeful: 1.5 },
        act: (w, rng) => {
          nudgeAll(ofJob(w, 'builder'), -12);
          if (!chance(rng, 0.4)) return 'ช่างกลับไปทำงานอย่างไม่เต็มใจ';
          w.strike = Math.max(w.strike ?? 0, w.day + 10);
          return 'ช่างไม่ยอม คนงานทั้งเมืองนัดหยุดงานตามไปสิบวัน';
        },
      },
    ],
  },
  fair: {
    title: 'งานตลาดนัดประจำปี',
    mtth: 360,
    gap: 360,
    can: (w) => ofJob(w, 'merchant').length >= 3,
    decider: ruler,
    text: () => 'พ่อค้าขออนุญาตจัดงานตลาดนัดกลางเมือง จะเชิญพ่อค้าต่างเมืองมาด้วย',
    options: [
      {
        key: 'allow',
        label: 'อนุญาต',
        likes: { kind: 2, brave: 1.3 },
        act: (w) => {
          addMod(w, 'arrivals', 0.5, 90, 'งานตลาดนัด');
          addMod(w, 'crime', 0.3, 30, 'ฝูงชนในงานตลาดนัด');
          nudgeAll(adults(w), 2);
          return 'งานคึกคัก คนต่างเมืองแวะมาหลายคน แต่ขโมยก็ชุกชุมตามฝูงชน';
        },
      },
      {
        key: 'tax',
        label: 'อนุญาตแต่เก็บค่าที่',
        likes: { greedy: 3 },
        act: (w) => {
          const ms = ofJob(w, 'merchant');
          let got = 0;
          for (const m of ms) {
            const fee = Math.min(m.gold, 8);
            m.gold -= fee;
            got += fee;
            loyaltyNudge(m, -3);
          }
          w.treasury += got;
          addMod(w, 'arrivals', 0.3, 90, 'งานตลาดนัด');
          return `เก็บค่าที่ได้ ${got} ทอง พ่อค้าบ่นแต่ก็จัดงาน`;
        },
      },
      {
        key: 'ban',
        label: 'ห้ามจัด',
        likes: { coward: 2, vengeful: 1.5 },
        act: (w) => {
          nudgeAll(ofJob(w, 'merchant'), -6);
          return 'ไม่มีงานตลาดนัดปีนี้ พ่อค้าผิดหวัง';
        },
      },
    ],
  },
  manorland: {
    title: 'ขุนนางขอที่ดิน',
    mtth: 540,
    gap: 360,
    can: (w) => ofJob(w, 'noble').some((n) => (n.loyalty ?? 50) < 65) && !!ruler(w),
    decider: ruler,
    ctx: (w, rng) => {
      const ns = ofJob(w, 'noble').filter((n) => (n.loyalty ?? 50) < 65);
      return ns.length ? pick(rng, ns).id : undefined;
    },
    text: (w, h) => `${byId(w, h.ctx)?.name ?? 'ขุนนางคนหนึ่ง'}ทูลขอที่ดินนอกเมืองเป็นรางวัลที่รับใช้มานาน`,
    options: [
      {
        key: 'grant',
        label: 'พระราชทานให้',
        likes: { loyal: 1.5, coward: 2, greedy: 0.6 },
        act: (w, _rng, h) => {
          const n = byId(w, h.ctx);
          if (n) loyaltyNudge(n, 20);
          nudgeAll(adults(w).filter((a) => a.job !== 'noble' && a.job !== 'king'), -2);
          return `${n?.name ?? 'ขุนนาง'}ได้ที่ดินไป จงรักภักดีขึ้นมาก แต่ชาวบ้านมองว่าขุนนางได้ทุกอย่าง`;
        },
      },
      {
        key: 'refuse',
        label: 'ไม่ให้',
        likes: { brave: 1.5, vengeful: 2, kind: 1.3 },
        act: (w, _rng, h, decider) => {
          const n = byId(w, h.ctx);
          if (n) {
            loyaltyNudge(n, -15);
            addTie(w, n, decider, -15);
          }
          return `${n?.name ?? 'ขุนนาง'}กลับไปด้วยความขุ่นเคือง`;
        },
      },
    ],
  },
  foulwell: {
    title: 'บ่อน้ำเน่า',
    mtth: 360,
    gap: 540,
    can: (w) => living(w) >= capacity(w) * 0.85,
    sooner: (w) => (living(w) > capacity(w) ? 2 : 1),
    decider: ruler,
    text: () => 'ผู้คนอยู่กันแน่นจนบ่อน้ำกลางเมืองเริ่มส่งกลิ่นเหม็น เด็ก ๆ เริ่มท้องเสีย',
    options: [
      {
        key: 'dig',
        label: 'ขุดบ่อใหม่ (150 ทอง)',
        likes: { kind: 2, loyal: 1.5, greedy: 0.5 },
        can: (w) => w.treasury >= 150,
        act: (w) => {
          w.treasury -= 150;
          addMod(w, 'sickness', -0.5, 720, 'บ่อน้ำใหม่');
          return 'บ่อน้ำใหม่ขุดเสร็จในเดือนเดียว น้ำใสสะอาด โรคภัยลดลง';
        },
      },
      {
        key: 'pray',
        label: 'ให้นักบวชทำพิธีชำระน้ำ',
        likes: { loyal: 1.3, coward: 1.5 },
        act: (w) => {
          addMod(w, 'piety', 3, 180, 'พิธีชำระน้ำ');
          addMod(w, 'sickness', 0.5, 180, 'บ่อน้ำเน่า');
          return 'นักบวชสวดเหนือบ่อ ผู้คนศรัทธาขึ้น แต่น้ำก็ยังเน่าอยู่';
        },
      },
      {
        key: 'ignore',
        label: 'ปล่อยไว้',
        likes: { greedy: 2, coward: 1.2 },
        act: (w) => {
          addMod(w, 'sickness', 1, 180, 'บ่อน้ำเน่า');
          return 'ไม่มีใครทำอะไร กลิ่นเหม็นลอยไปทั่วย่าน';
        },
      },
    ],
  },
  wanderlust: {
    title: 'ความฝันถึงเมืองใหญ่',
    mtth: 480,
    gap: 360,
    can: (w) => living(w) >= 30 && youths(w).length > 0,
    sooner: (w) => (living(w) > capacity(w) ? 2 : 1), // a crowded town pushes its young out
    decider: (w, rng) => {
      const ys = youths(w);
      return ys.length ? pick(rng, ys) : undefined;
    },
    text: (w, h) => {
      const n = byId(w, h.chooserId);
      return `${n?.name ?? 'คนหนุ่มสาวคนหนึ่ง'}ได้ยินเรื่องเล่าของเมืองใหญ่จากพ่อค้า และอยากออกไปแสวงโชค`;
    },
    options: [
      {
        key: 'go',
        label: 'ออกเดินทาง',
        likes: { brave: 3, greedy: 1.5, loyal: 0.4, coward: 0.4 },
        act: (_w, _rng, _h, n) => {
          n.alive = false;
          n.left = true;
          n.plan = undefined;
          return `${n.name}เก็บของใส่ห่อแล้วทิ้งเมืองไปแสวงโชค`;
        },
      },
      {
        key: 'stay',
        label: 'อยู่ช่วยครอบครัว',
        likes: { loyal: 3, coward: 2, kind: 1.5 },
        act: (_w, _rng, _h, n) => {
          loyaltyNudge(n, 3);
          return `${n.name}ตัดสินใจอยู่บ้านเกิดต่อไป`;
        },
      },
    ],
  },
  festival: {
    title: 'งานบุญประจำปี',
    mtth: 360,
    gap: 360,
    can: (w) => !!priestOf(w) && ((w.alms ?? 0) >= 100 || w.treasury >= 300),
    decider: (w) => priestOf(w),
    text: () => 'ใกล้ถึงวันครบรอบที่เทพเจ้าปกปักษ์เมืองนี้ ศาสนจักรจะจัดงานบุญแบบไหนดี',
    options: [
      {
        key: 'grand',
        label: 'จัดงานบุญใหญ่',
        likes: { kind: 2, loyal: 2, greedy: 0.5 },
        act: (w) => {
          const fromAlms = Math.min(w.alms ?? 0, 100);
          w.alms = (w.alms ?? 0) - fromAlms;
          w.treasury -= 100 - fromAlms;
          addMod(w, 'piety', 6, 120, 'งานบุญใหญ่');
          nudgeAll(adults(w), 2);
          return 'ขบวนแห่ยาวทั้งเมือง ผู้คนศรัทธาเทพเจ้ามากขึ้น';
        },
      },
      {
        key: 'modest',
        label: 'ทำบุญเรียบง่าย เก็บเงินไว้เลี้ยงคนยาก',
        likes: { greedy: 1.5, coward: 1.5, kind: 1.2 },
        act: (w) => {
          addMod(w, 'piety', 2, 60, 'งานบุญเรียบง่าย');
          return 'งานบุญเงียบ ๆ ที่โบสถ์ เงินในโรงทานยังอยู่ครบ';
        },
      },
    ],
  },
  bribe: {
    title: 'ส่วยจากเงามืด',
    mtth: 540,
    gap: 540,
    can: (w) => ofJob(w, 'thief').length >= 2 && !!lawman(w),
    decider: (w) => lawman(w),
    text: () => 'หัวหน้าโจรส่งคนมาเสนอถุงทองทุกเดือน ขอแค่ทางการทำเป็นมองไม่เห็น',
    options: [
      {
        key: 'take',
        label: 'รับไว้',
        likes: { greedy: 4, coward: 1.5, loyal: 0.4, brave: 0.5 },
        act: (w, _rng, _h, n) => {
          n.gold += 30;
          n.morality = clamp(n.morality - 10, -100, 100);
          addMod(w, 'crime', 0.5, 180, 'ทางการรับส่วยโจร');
          return `${n.name}รับถุงทองไว้ โจรได้ใจ ขโมยชุกชุมขึ้น`;
        },
      },
      {
        key: 'crack',
        label: 'กวาดล้างโจร',
        likes: { brave: 2, vengeful: 2, loyal: 1.5 },
        act: (w) => {
          addMod(w, 'crime', -0.4, 180, 'กวาดล้างโจร');
          nudgeAll(ofJob(w, 'thief'), -10);
          return 'ทหารออกลาดตระเวนทุกคืน โจรต้องหลบซ่อน';
        },
      },
    ],
  },
  shanty: {
    title: 'ชุมชนแออัดนอกกำแพง',
    mtth: 120,
    gap: 360,
    can: (w) => (w.shacks?.length ?? 0) >= 4,
    decider: ruler,
    text: (w) => `เพิง ${w.shacks?.length ?? 0} หลังเบียดกันนอกกำแพง คน ${w.slum ?? 0} คนไม่มีบ้านจริง ๆ ให้อยู่ ขโมยและโรคภัยเริ่มลามเข้าเมือง`,
    options: [
      {
        key: 'clear',
        label: 'รื้อทิ้ง ไล่คนออกไป',
        likes: { vengeful: 2.5, greedy: 1.5, kind: 0.3 },
        act: (w) => {
          const out = w.npcs.filter((n) => n.alive && inShack(n));
          for (const n of out) {
            n.home = undefined;
            loyaltyNudge(n, -8);
          }
          w.shacks = [];
          w.slum = 0;
          w.homeless = (w.homeless ?? 0) + out.length;
          addMod(w, 'crime', -0.2, 90, 'รื้อชุมชนแออัด');
          return `ทหารรื้อเพิงทั้งหมด คน ${out.length} คนไม่มีที่ซุกหัวนอน หลายคนคงต้องทิ้งเมืองไป`;
        },
      },
      {
        key: 'house',
        label: 'ทางการสร้างบ้านให้',
        likes: { kind: 3, loyal: 1.5, greedy: 0.4 },
        can: (w) => w.treasury >= 300,
        act: (w) => {
          addMod(w, 'building', 1, 360, 'ทางการเร่งสร้างบ้านให้คนในชุมชนแออัด');
          nudgeAll(w.npcs.filter((n) => n.alive && inShack(n)), 6);
          return 'ทางการเร่งจ้างช่างสร้างบ้านทีละหลายหลัง ออกเงินเองตลอดปี';
        },
      },
      {
        key: 'ignore',
        label: 'ปล่อยไว้',
        likes: { greedy: 2, coward: 1.5 },
        act: (w) => {
          addMod(w, 'crime', 0.3, 180, 'ชุมชนแออัดที่ไม่มีใครดูแล');
          return 'ไม่มีใครทำอะไร ชุมชนแออัดยังขยายต่อไป';
        },
      },
    ],
  },
  firecode: {
    title: 'หลังเพลิงสงบ',
    mtth: 1,
    gap: 0,
    can: () => false, // raised by a fire (slums.ts)
    decider: ruler,
    text: () => 'เถ้าถ่านยังกรุ่นอยู่ บ้านที่ไหม้จะสร้างขึ้นใหม่อย่างไร',
    options: [
      {
        key: 'stone',
        label: 'สร้างใหม่ด้วยอิฐและหิน (200 ทอง)',
        likes: { kind: 1.5, loyal: 1.5, coward: 2, greedy: 0.4 },
        can: (w) => w.treasury >= 200,
        act: (w) => {
          w.treasury -= 200;
          addMod(w, 'fire', -0.6, 1800, 'บ้านสร้างใหม่ด้วยอิฐ');
          return 'บ้านที่สร้างใหม่ทนไฟกว่าเดิมมาก ไฟจะไหม้ยากขึ้นไปอีกหลายปี';
        },
      },
      {
        key: 'wood',
        label: 'สร้างด้วยไม้เหมือนเดิม',
        likes: { greedy: 2, brave: 1.3 },
        act: (w) => {
          for (const r of w.ruins ?? []) r.until = w.day + Math.ceil((r.until - w.day) * 0.7);
          return 'บ้านไม้กลับมายืนเร็ว แต่ก็ไหม้ได้อีกเหมือนเดิม';
        },
      },
      {
        key: 'ban',
        label: 'ห้ามก่อไฟในบ้านไม้ยามค่ำ',
        likes: { vengeful: 2, coward: 1.5, kind: 0.6 },
        act: (w) => {
          addMod(w, 'fire', -0.3, 720, 'กฎห้ามก่อไฟยามค่ำ');
          nudgeAll(adults(w), -2);
          return 'ยามเดินตรวจทุกคืน ชาวเมืองบ่นว่าหนาวและมืด แต่ไฟไหม้ยากขึ้น';
        },
      },
    ],
  },
  ...AFFAIRS,
  ...SAGA_DEFS,
};
export const HAPPENING_ORDER = Object.keys(DEFS) as HappeningKind[];
export const happeningTitle = (k: HappeningKind) => DEFS[k].title;

function living(world: WorldState): number {
  let n = 0;
  for (const p of world.npcs) if (p.alive) n++;
  return n;
}
// Realms in trouble: struck by disaster or plague, or at war with us.
const troubled = (world: WorldState) => (world.realms ?? []).filter((r) => !r.fallen && ((r.disaster && r.disaster.until > world.day) || (r.plagueUntil ?? 0) > world.day || r.war));
const troubledRealm = (world: WorldState) => troubled(world)[0];
const youths = (world: WorldState) =>
  adults(world).filter((n) => n.age <= 25 && n.spouseId === undefined && n.questId === undefined && n.guildId === undefined && !['king', 'noble', 'priest', 'judge'].includes(n.job)); // nobody with a guild or an office to keep them
const priestOf = (world: WorldState) => headOf(world) ?? ofJob(world, 'priest')[0];
const lawman = (world: WorldState) => ofJob(world, 'judge')[0] ?? king(world);

// ---------- coming up, and being decided ----------

// Once a day: settle a matter whose time is up, else maybe raise a new one. Each kind is
// looked at once a month, on its own day, so the checks are spread thin.
export function happeningsDay(world: WorldState, rng: Rng): void {
  const h = world.happening;
  if (h) {
    if (world.day >= h.until) decide(world, rng);
    return;
  }
  if (world.day % MONTH === 0 && world.mods?.length) world.mods = world.mods.filter((m) => m.until > world.day);
  HAPPENING_ORDER.forEach((k, i) => {
    if (world.happening || (world.day + i * 3) % MONTH !== 0) return;
    const def = DEFS[k];
    const last = world.happenAt?.[k];
    if (last !== undefined && world.day - last < def.gap) return;
    if (!def.can(world)) return;
    const odds = 1 - 0.5 ** ((MONTH * (def.sooner?.(world) ?? 1)) / def.mtth);
    if (chance(rng, odds)) raise(world, k, rng);
  });
}

// Bring a matter up (also used by tests to force one).
export function raise(world: WorldState, k: HappeningKind, rng: Rng): Happening | undefined {
  const def = DEFS[k];
  const decider = def.decider(world, rng);
  if (!decider) return undefined;
  const h: Happening = { kind: k, title: def.title, day: world.day, until: world.day + PENDING_DAYS, text: '', who: deciderName(world, decider), chooserId: decider.id, options: [] };
  h.ctx = def.ctx?.(world, rng);
  if (def.ctx && h.ctx === undefined) return undefined;
  h.text = def.text(world, h);
  h.options = def.options.filter((o) => !o.can || o.can(world, h)).map((o) => ({ key: o.key, label: o.label }));
  if (h.options.length < 2) return undefined;
  (world.happenAt ??= {})[k] = world.day;
  world.happening = h;
  log(world, 'happening', `${def.title}: ${h.text} (${h.who}จะตัดสินใจใน ${PENDING_DAYS} วัน)`, decider.id);
  return h;
}

const deciderName = (world: WorldState, n: Npc) => `${jobName(world, n.job)}${n.name}`;

export const whisperCost = (world: WorldState) => Math.max(1, Math.round(WHISPER_COST * (1 - 0.1 * perkLevel(world, 'grace'))));

// The god whispers for an option, or a life the player lives decides its own matter. True when
// it took (the caller charges faith for a whisper).
export function whisper(world: WorldState, key: string, rng: Rng): boolean {
  const h = world.happening;
  if (!h || !h.options.some((o) => o.key === key)) return false;
  const decider = world.npcs.find((n) => n.id === h.chooserId);
  if (isAvatar(world, decider)) {
    decide(world, rng, key);
    return true;
  }
  if (world.avatar || h.whisper) return false;
  h.whisper = key;
  return true;
}

// Weigh the options as the decider would, and see it done.
export function decide(world: WorldState, rng: Rng, forced?: string): void {
  const h = world.happening;
  if (!h) return;
  world.happening = undefined;
  const def = DEFS[h.kind];
  const decider = world.npcs.find((n) => n.id === h.chooserId && n.alive);
  if (!decider) {
    h.outcome = `${h.who}ไม่อยู่ตัดสินแล้ว เรื่องนี้จึงเงียบหายไป`;
    return keep(world, h);
  }
  const options = def.options.filter((o) => h.options.some((x) => x.key === o.key));
  const weight = (o: Option) => (o.base ?? 1) * decider.traits.reduce((m, t) => m * (o.likes?.[t] ?? 1), 1) * (h.whisper === o.key ? WHISPER_PULL : 1);
  let picked = options.find((o) => o.key === forced);
  if (!picked) {
    let roll = next(rng) * options.reduce((s, o) => s + weight(o), 0);
    picked = options.find((o) => (roll -= weight(o)) < 0) ?? options[options.length - 1];
  }
  h.chosen = picked.key;
  h.reason = forced ? 'เลือกด้วยตัวเอง' : reasonFor(h, picked, decider);
  h.outcome = picked.act(world, rng, h, decider);
  log(world, 'happening', `${h.title}: ${h.who}เลือก「${picked.label}」${h.reason ? ` (${h.reason})` : ''} ${h.outcome}`, decider.id);
  keep(world, h);
}

// Why they chose it: the god's whisper if it was heeded, else the trait that pulled hardest.
function reasonFor(h: Happening, o: Option, n: Npc): string {
  if (h.whisper === o.key) return 'ได้ยินเสียงกระซิบในฝัน';
  const t = [...n.traits].sort((a, b) => (o.likes?.[b] ?? 1) - (o.likes?.[a] ?? 1))[0];
  if (t && (o.likes?.[t] ?? 1) > 1) return `เพราะเป็นคน${TRAIT_TH[t]}`;
  if (h.whisper) return 'ไม่ฟังเสียงกระซิบในฝัน';
  return '';
}

function keep(world: WorldState, h: Happening): void {
  const book = (world.happenings ??= []);
  book.push(h);
  if (book.length > KEPT) book.shift();
}
