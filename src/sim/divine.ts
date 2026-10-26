// The god's hand: blessings that fade, curses that bite, dreams that change a heart, and
// miracles worked on the whole world, from kind rain to plague and eclipse.
import { pick, type Rng } from './rng';
import { clamp, known, log, occupied, perkLevel } from './core';
import { bringDisaster, flooded } from './disasters';
import { king } from './society';
import { plagueStrike } from './worldevents';
import { CULT_NAMES, sway } from './cult';
import { getTie, setTie } from './ties';
import { isAdventurer } from './quests';
import { ensureMarket } from './market';
import { loyaltyOf } from './politics';
import { traveller } from './world';
import { JOB_TH } from './names';
import type { DreamKind, Job, MiracleKind, Npc, WorldState } from './types';
import { insight } from './learning';
import { ambition, reformVision } from './regimes';

export const BLESS_DAYS = 365;
export const CURSE_DAYS = 180;
const MIRACLE_GAP = 30; // days before the same miracle can be worked again
const WEATHER_DAYS = 60;

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);

// ---------- one soul ----------

export function bless(world: WorldState, n: Npc): void {
  n.blessed = true;
  n.blessUntil = world.day + BLESS_DAYS;
  n.cursedUntil = undefined;
  n.hunger = 0;
  n.morality = clamp(n.morality + 10, -100, 100);
  sway(world, 1);
  log(world, 'bless', `แสงศักดิ์สิทธิ์โอบล้อม ${n.name}`, n.id);
}

// Blessings fade after a year, except a hero's. Old saves get a fresh year on their blessing.
export function fadeBlessing(world: WorldState, n: Npc): void {
  if (!n.blessed || n.hero) return;
  n.blessUntil ??= world.day + BLESS_DAYS;
  if (world.day < n.blessUntil) return;
  n.blessed = false;
  n.blessUntil = undefined;
  log(world, 'bless', `พรที่โอบล้อม${n.name}ค่อยๆ จางหายไป`, n.id);
}

// A curse weakens its mark for half a year. Striking the wicked is justice and brightens the
// world; striking the good darkens it. A cursed cultist sinks deeper and grows careless.
export function curse(world: WorldState, n: Npc): void {
  n.blessed = false;
  n.blessUntil = undefined;
  n.cursedUntil = world.day + CURSE_DAYS;
  sway(world, n.morality < 0 ? 1 : -2);
  if (n.cultist) n.morality = clamp(n.morality - 15, -100, 100);
  log(world, 'curse', `${n.name} ต้องคำสาปแห่งกบ${n.morality < 0 ? ' ผู้คนกระซิบว่าเป็นกรรมตามสนอง' : ''}`, n.id);
}

export function dream(world: WorldState, n: Npc, job?: Job, kind?: DreamKind, rng?: Rng): boolean {
  if (kind === 'ambition') return ambition(world, n, rng ?? { state: world.rng });
  if (kind === 'repent') return repent(world, n);
  if (kind === 'love') return love(world, n);
  if (kind === 'nightmare') return nightmare(world, n);
  if (kind === 'vision') return vision(world, n);
  if (!job || job === 'king' || job === 'noble') return false; // titles are granted, not dreamt
  n.job = job;
  if (isAdventurer(n)) {
    n.rank ??= 0;
    n.renown ??= 0;
  }
  if (n.inside === undefined) n.plan = undefined; // the dream changes their next move
  log(world, 'dream', `${n.name} ฝันถึงชีวิตใหม่ในฐานะ${JOB_TH[job]}`, n.id);
  return true;
}

// Wakes in tears and turns over a new leaf: kinder, out of the cult, done with thieving.
function repent(world: WorldState, n: Npc): boolean {
  n.morality = Math.max(clamp(n.morality + 30, -100, 100), 10);
  let what = 'ตื่นขึ้นมาพร้อมน้ำตาและตั้งใจเป็นคนดี';
  if (n.cultist) {
    n.cultist = false;
    what = `ตื่นขึ้นมาแล้วละทิ้ง${world.cult?.name ?? 'ลัทธิมาร'}`;
  } else if (n.job === 'thief') {
    n.job = 'farmer';
    n.plan = undefined;
    what = 'ตื่นขึ้นมาแล้วเลิกเป็นโจร หันไปทำนา';
  }
  sway(world, 1);
  log(world, 'dream', `${n.name} ฝันเห็นผลกรรมของตน ${what}`, n.id);
  return true;
}

// Dreams of the single soul they are already closest to, and so do they.
function love(world: WorldState, n: Npc): boolean {
  const free = (o: Npc) => o.alive && o.age >= 16 && o.age <= 60 && !world.npcs.some((s) => s.alive && s.id === o.spouseId);
  if (!free(n)) return false;
  const kin = (o: Npc) => n.parentIds?.includes(o.id) || o.parentIds?.includes(n.id) || n.parentIds?.some((p) => o.parentIds?.includes(p));
  const match = world.npcs
    .filter((o) => o !== n && free(o) && !kin(o))
    .sort((a, b) => getTie(world, n.id, b.id) - getTie(world, n.id, a.id))[0];
  if (!match) return false;
  setTie(world, n.id, match.id, Math.max(getTie(world, n.id, match.id), 70));
  log(world, 'dream', `${n.name} ฝันถึง${match.name}ทั้งคืน หัวใจของทั้งคู่เต้นแรง`, n.id);
  return true;
}

// Dreams of betrayal by the one they already trust least, and wakes bitter.
function nightmare(world: WorldState, n: Npc): boolean {
  const foe = world.npcs
    .filter((o) => o !== n && o.alive && o.age >= 16)
    .sort((a, b) => getTie(world, n.id, a.id) - getTie(world, n.id, b.id))[0];
  if (foe) setTie(world, n.id, foe.id, clamp(getTie(world, n.id, foe.id) - 40, -100, 100));
  n.morality = clamp(n.morality - 10, -100, 100);
  n.loyalty = clamp(loyaltyOf(n) - 15, 0, 100);
  sway(world, -0.5);
  log(world, 'dream', `${n.name} ฝันร้ายว่าถูก${foe ? foe.name : 'คนรอบตัว'}หักหลัง ตื่นมาด้วยความหวาดระแวง`, n.id);
  return true;
}

// An adventurer dreams an ancient sword form and wakes the better for it; a scholar dreams
// the answer to a question that has stumped them for years.
function vision(world: WorldState, n: Npc): boolean {
  if (n.job === 'king') {
    const name = n.name;
    const what = reformVision(world, n, { state: world.rng });
    log(world, 'dream', `${name} ฝันเห็นชาวเมืองเลือกผู้นำของตนเอง ${what}`, n.id);
    return true;
  }
  if (n.job === 'scholar') {
    const got = insight(world, n);
    log(world, 'dream', `${n.name} ฝันเห็นตำราที่ไม่มีใครเคยเขียน ตื่นมาจดได้ทั้งเล่ม ความรู้ของเมือง +${got}`, n.id);
    return true;
  }
  if (!isAdventurer(n)) return false;
  n.level++;
  n.renown = (n.renown ?? 0) + 2;
  log(world, 'dream', `${n.name} ฝันเห็นวิชาดาบโบราณ ตื่นมาเก่งขึ้นเป็นเลเวล ${n.level}`, n.id);
  return true;
}

// ---------- the whole world ----------

// `big` marks the great miracles: dear, and meant to turn the town's fate.
export const MIRACLES: Record<MiracleKind, { name: string; text: string; cost: number; icon: string; dark: boolean; big?: boolean }> = {
  rain: { name: 'ฝนฉ่ำ', text: 'ฝนตกต้องตามฤดู ผลผลิตข้าว ×1.6 นาน 60 วัน', cost: 12, icon: 'rain', dark: false },
  goldrain: { name: 'ฝนทองคำ', text: 'ทองโปรยลงมาจากฟ้า ท้องพระคลัง +200 และทุกคนได้ 8 ทอง', cost: 15, icon: 'gold', dark: false },
  festival: { name: 'งานฉลองศักดิ์สิทธิ์', text: 'ทั้งเมืองเฉลิมฉลอง ภักดี +15 ศีล +5 ทุกคน', cost: 12, icon: 'banner', dark: false },
  wanderers: { name: 'ส่งนักเดินทาง', text: 'นักเดินทาง 4 คนเดินทางเข้าเมือง', cost: 8, icon: 'wanderer', dark: false },
  blight: { name: 'โรคพืช', text: 'ข้าวในยุ้งเน่าไป 30% และผลผลิต ×0.3 นาน 60 วัน', cost: 10, icon: 'blight', dark: true },
  plague: { name: 'โรคระบาด', text: 'โรคร้ายคร่าชีวิตคนชราและคนอ่อนแอ นักบวชช่วยบรรเทาได้', cost: 20, icon: 'plague', dark: true },
  cult: { name: 'ปลุกลัทธิมาร', text: 'คนใจดำที่สุดในเมืองตั้งลัทธิมารขึ้นพร้อมสาวก 2 คน', cost: 15, icon: 'cult', dark: true },
  surge: { name: 'ปลุกฝูงมอนสเตอร์', text: 'พลังดันเจี้ยน +60 มอนสเตอร์อาจล้นออกมาเร็วๆ นี้', cost: 10, icon: 'surge', dark: true },
  eclipse: { name: 'สุริยุปราคา', text: 'โลกมืดลงอย่างมาก ลางร้ายของจอมมาร +25', cost: 20, icon: 'eclipse', dark: true },
  aegis: { name: 'โล่ศักดิ์สิทธิ์', text: 'คุ้มครองเมืองจากภัยพิบัติครั้งถัดไป', cost: 200, icon: 'bless', dark: false, big: true },
  revive: { name: 'ชุบชีวิต', text: 'ปลุกคนสำคัญที่ตายภายในหนึ่งปีให้ฟื้นคืนชีพ', cost: 300, icon: 'heart', dark: false, big: true },
  wonder: { name: 'สิ่งมหัศจรรย์', text: 'อนุสรณ์สถานแห่งอาณาจักรสูงขึ้นหนึ่งชั้นในชั่วข้ามคืน', cost: 250, icon: 'star', dark: false, big: true },
  bounty: { name: 'ยุ้งฉางล้นเหลือ', text: 'ข้าว +400 กระสอบ สัตว์ในคอก +15 ทุกคนอิ่มท้อง', cost: 150, icon: 'grain', dark: false, big: true },
  uprising: { name: 'ปลุกใจผู้คน', text: 'ใต้การยึดครองของจอมมาร: ขบวนการต่อต้าน +50%', cost: 150, icon: 'sword', dark: false, big: true },
  quake: { name: 'แผ่นดินไหว', text: 'แผ่นดินแยก บ้านเรือนและอาคารหลวงพังทลาย ผู้คนล้มตาย', cost: 150, icon: 'skull', dark: true, big: true },
  flood: { name: 'อุทกภัย', text: 'ฝนตกไม่หยุดจนน้ำท่วมใหญ่ ข้าวเสียหาย คนจมน้ำ บ้านพัง', cost: 150, icon: 'rain', dark: true, big: true },
  drought: { name: 'ภัยแล้ง', text: 'ฝนไม่ตกหลายเดือน ทุ่งนาแห้งแตกระแหง สัตว์และคนแก่ล้มตาย', cost: 120, icon: 'sun', dark: true, big: true },
  tyranny: { name: 'ใจทรราช', text: 'ผู้ปกครองกลายเป็นคนโลภและอาฆาต ชาวเมืองเกลียดชัง', cost: 150, icon: 'crown', dark: true, big: true },
  doom: { name: 'ปลุกจอมมาร', text: 'ลางร้ายเต็มทันที จอมมารตื่นขึ้นในไม่ช้า', cost: 400, icon: 'demon', dark: true, big: true },
};
const REVIVE_DAYS = 365;

// Who the god may raise: the greatest soul to die in the past year, by deeds and standing.
export function reviveTarget(world: WorldState): Npc | undefined {
  const ids = new Set(world.chronicle.filter((e) => e.kind === 'death' && e.day > world.day - REVIVE_DAYS && e.npcId !== undefined).map((e) => e.npcId!));
  return world.npcs
    .filter((n) => !n.alive && !n.left && ids.has(n.id))
    .sort((a, b) => b.level + (b.renown ?? 0) / 5 + (b.hero ? 50 : 0) + (b.job === 'king' ? 10 : 0) - (a.level + (a.renown ?? 0) / 5 + (a.hero ? 50 : 0) + (a.job === 'king' ? 10 : 0)))[0];
}

// Why a great miracle can't be worked now, if it can't.
export function miracleBlocked(world: WorldState, k: MiracleKind): string | undefined {
  if (k === 'cult' && world.cult) return 'มีลัทธิมารอยู่ในเมืองแล้ว';
  if (k === 'aegis' && world.aegis) return 'โล่ศักดิ์สิทธิ์ยังคุ้มครองเมืองอยู่';
  if (k === 'revive' && !reviveTarget(world)) return 'ไม่มีคนสำคัญที่เพิ่งตายในปีนี้';
  if (k === 'uprising' && world.demon?.stage !== 'occupied') return 'ใช้ได้เมื่อจอมมารยึดเมืองเท่านั้น';
  if ((k === 'quake' || k === 'flood' || k === 'drought') && occupied(world)) return 'เมืองอยู่ใต้การยึดครองของจอมมาร';
  if (k === 'tyranny' && !king(world)) return 'เมืองไม่มีผู้ปกครอง';
  if (k === 'doom' && world.demon) return 'จอมมารตื่นอยู่แล้ว';
  return undefined;
}
export const MIRACLE_ORDER = Object.keys(MIRACLES) as MiracleKind[];

export const miracleReady = (world: WorldState, k: MiracleKind) => world.day - (world.miracleAt?.[k] ?? -MIRACLE_GAP) >= MIRACLE_GAP;
// A miracle may be worked again before its wait is up, at twice the price, and twice again each
// time after until it has rested a full wait.
export const miracleRushed = (world: WorldState, k: MiracleKind) => (miracleReady(world, k) ? 0 : (world.miracleRush?.[k] ?? 0) + 1);
export const miracleCost = (world: WorldState, k: MiracleKind) => Math.max(1, Math.round(MIRACLES[k].cost * 2 ** miracleRushed(world, k) * (1 - 0.1 * perkLevel(world, 'grace'))));
export const miracleWait = (world: WorldState, k: MiracleKind) => Math.max(0, MIRACLE_GAP - (world.day - (world.miracleAt?.[k] ?? -MIRACLE_GAP)));
export const weatherOf = (world: WorldState) => (world.weather && world.weather.until > world.day ? world.weather.kind : undefined);
export const weatherYield = (world: WorldState) => {
  const w = weatherOf(world);
  if ((world.flood ?? 0) > world.day) return 0; // the fields are under water
  return w === 'rain' ? 1.6 : w === 'blight' ? 0.3 : w === 'drought' ? (known(world, 'irrigation') ? 0.6 : 0.25) : w === 'deluge' ? 0.5 : 1;
};

export function miracle(world: WorldState, k: MiracleKind, rng: Rng): boolean {
  const rushed = miracleRushed(world, k);
  if (!work(world, k, rng)) return false;
  (world.miracleAt ??= {})[k] = world.day;
  (world.miracleRush ??= {})[k] = rushed;
  return true;
}

function work(world: WorldState, k: MiracleKind, rng: Rng): boolean {
  const grown = adults(world);
  if (miracleBlocked(world, k)) return false;
  switch (k) {
    case 'aegis':
      world.aegis = true;
      sway(world, 2);
      log(world, 'bless', 'แสงสีทองแผ่คลุมทั่วเมืองเป็นโล่ศักดิ์สิทธิ์ ภัยพิบัติครั้งหน้าจะผ่านเลยไป');
      return true;
    case 'revive': {
      const n = reviveTarget(world)!;
      n.alive = true;
      n.hunger = 0;
      n.plan = undefined;
      n.inside = undefined;
      n.questId = undefined;
      n.cursedUntil = undefined;
      sway(world, 3);
      log(world, 'bless', `ปาฏิหาริย์! ${n.name}ลืมตาตื่นขึ้นจากความตาย ชาวเมืองต่างคุกเข่าสรรเสริญเทพเจ้า`, n.id);
      return true;
    }
    case 'wonder':
      world.monument = (world.monument ?? 0) + 1;
      (world.works ??= {}).monument = world.day;
      for (const n of grown) n.loyalty = clamp(loyaltyOf(n) + 5, 0, 100);
      sway(world, 2);
      log(world, 'bless', `ชั่วข้ามคืน อนุสรณ์สถานแห่งอาณาจักรสูงขึ้นเป็นระดับ ${world.monument} ราวกับเทพเจ้าลงมือสร้างเอง`);
      return true;
    case 'bounty': {
      const m = ensureMarket(world);
      m.stock.grain += 400;
      world.herd = (world.herd ?? 0) + 15;
      for (const n of world.npcs) if (n.alive) n.hunger = 0;
      sway(world, 2);
      log(world, 'bless', 'ยุ้งฉางทุกแห่งเต็มล้นด้วยข้าวที่ไม่มีใครปลูก คอกสัตว์มีลูกสัตว์เกิดใหม่เต็มไปหมด');
      return true;
    }
    case 'quake':
    case 'flood':
    case 'drought':
      sway(world, -4);
      bringDisaster(world, rng, k === 'flood' ? 'deluge' : k);
      if (k === 'flood' && !flooded(world)) bringDisaster(world, rng, 'flood');
      return true;
    case 'tyranny': {
      const ruler = king(world)!;
      ruler.traits = ['greedy', 'vengeful'];
      ruler.morality = clamp(ruler.morality - 40, -100, 100);
      for (const n of grown) if (n !== ruler) n.loyalty = clamp(loyaltyOf(n) - 10, 0, 100);
      sway(world, -3);
      log(world, 'curse', `เงามืดกระซิบข้างหู${ruler.name}ทุกคืน จนจิตใจกลายเป็นทรราชที่โลภและอาฆาต`, ruler.id);
      return true;
    }
    case 'doom':
      world.dread = 100;
      sway(world, -10);
      log(world, 'cult', 'ท้องฟ้าแดงฉานดั่งเลือด เสียงหัวเราะดังก้องจากใต้พิภพ ผนึกของจอมมารแตกร้าวจนสุดทาง');
      return true;
    case 'uprising':
      world.demon!.resistance = Math.min(100, (world.demon!.resistance ?? 0) + 50);
      sway(world, 2);
      log(world, 'bless', `ชาวเมืองทุกคนฝันเห็นแสงสว่างเดียวกัน ขบวนการต่อต้านลุกโชน (${Math.round(world.demon!.resistance)}%)`);
      return true;
    case 'rain':
      world.weather = { kind: 'rain', until: world.day + WEATHER_DAYS };
      sway(world, 2);
      log(world, 'bless', 'เทพเจ้าบันดาลให้ฝนตกฉ่ำทั่วแผ่นดิน ทุ่งนาเขียวขจี');
      return true;
    case 'blight': {
      const m = ensureMarket(world);
      const lost = Math.floor(m.stock.grain * 0.3);
      m.stock.grain -= lost;
      world.weather = { kind: 'blight', until: world.day + WEATHER_DAYS };
      sway(world, -2);
      log(world, 'curse', `โรคพืชระบาดทั่วทุ่งนา ข้าวในยุ้งเน่าไป ${lost} กระสอบ`);
      return true;
    }
    case 'goldrain':
      world.treasury += 200;
      for (const n of grown) n.gold += 8;
      log(world, 'bless', 'ทองคำโปรยปรายลงมาจากฟ้า ชาวเมืองวิ่งเก็บกันจ้าละหวั่น');
      return true;
    case 'festival':
      for (const n of grown) {
        n.loyalty = clamp(loyaltyOf(n) + 15, 0, 100);
        n.morality = clamp(n.morality + 5, -100, 100);
      }
      sway(world, 3);
      log(world, 'bless', 'เทพเจ้าบันดาลงานฉลองศักดิ์สิทธิ์ ทั้งเมืองร้องรำทำเพลงจนรุ่งสาง');
      return true;
    case 'wanderers':
      for (let i = 0; i < 4; i++) traveller(world, rng);
      return true;
    case 'plague':
      plagueStrike(world, rng, 1, 'โรคระบาดแพร่ไปทั่วเมือง');
      sway(world, -2);
      return true;
    case 'cult': {
      if (world.cult) return false;
      const pool = grown.filter((n) => !n.cultist && !n.hero && n.job !== 'king' && n.job !== 'priest' && n.questId === undefined && n.inside === undefined);
      const [founder, ...rest] = pool.sort((a, b) => a.morality - b.morality);
      if (!founder) return false;
      const name = `ลัทธิ${pick(rng, CULT_NAMES)}`;
      world.cult = { name, founded: world.day, leaderId: founder.id, rituals: 0 };
      for (const n of [founder, ...rest.slice(0, 2)]) {
        n.cultist = true;
        n.morality = clamp(n.morality - 20, -100, 100);
      }
      sway(world, -3);
      log(world, 'cult', `เสียงกระซิบจากใต้ดินนำทาง${founder.name}ให้ก่อตั้ง${name}ขึ้นอย่างลับๆ`, founder.id);
      return true;
    }
    case 'surge': {
      const d = world.dungeons[0];
      if (!d) return false;
      d.power += 60;
      log(world, 'disaster', `แผ่นดินสั่นสะเทือน ใต้${d.name}เดือดพล่านไปด้วยมอนสเตอร์`);
      return true;
    }
    case 'eclipse':
      sway(world, -15);
      if (world.demon) world.demon.power = Math.min(180, world.demon.power + 20);
      else world.dread = clamp((world.dread ?? 0) + 25, 0, 100);
      log(world, 'cult', 'ดวงอาทิตย์ดับมืดกลางวันแสกๆ สัตว์ป่าเงียบงัน และบางสิ่งใต้ดินขยับตัว');
      return true;
  }
}

