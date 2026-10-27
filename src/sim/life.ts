// Growing up, growing old, falling in love and raising a family.
import { chance, int, pick, type Rng } from './rng';
import { atSpot, kill, log, makePlan, stepToward } from './core';
import { jobName } from './ages';
import { isAvatar, offer, offerCalling } from './avatar';
import { PLACES } from './places';
import { TOWN_SIZE } from './town';
import { inheritedJob } from './society';
import { priceRatio } from './market';
import { graduate, lesson, schoolAge } from './learning';
import { built } from './works';
import { addTie, getTie, setTie } from './ties';
import type { Npc, Trait, WorldState } from './types';

export const ADULT_AGE = 16;
export const ELDER_AGE = 58; // adventurers retire; everyone starts to feel their years
const MARRY_TIE = 55; // how close two people must be before they'll marry
const COURT_TIE = 40; // close enough to seek each other out
const MARRY_CHANCE = 0.02; // per eligible couple per day
const BIRTH_CHANCE = 0.0015; // per couple per day
const MAX_CHILDREN = 3;
const POPULATION_CAP = TOWN_SIZE + 10; // families stop growing when the town is this full

export const isChild = (n: Npc) => n.age < ADULT_AGE;
export const isElder = (n: Npc) => n.age >= ELDER_AGE;
// Who is who and who is still single, built once a day: romance asks it for every pair in town,
// and a long offline catch-up runs thousands of days of that.
let index: { npcs: Npc[]; day: number; byId: Map<number, Npc>; single: Set<number>; open: Npc[] } | null = null;
// Crushes change slowly, so they are worked out afresh only every few days.
const CRUSH_EVERY = 5;
let crushCache: { ties: WorldState['ties']; bucket: number; map: Map<number, Npc> } | null = null;
function lookup(world: WorldState) {
  if (index?.npcs === world.npcs && index.day === world.day && index.byId.size === world.npcs.length) return index;
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  const single = new Set(world.npcs.filter((n) => !(n.spouseId !== undefined && byId.get(n.spouseId)?.alive)).map((n) => n.id));
  const open = world.npcs.filter((n) => n.alive && !isChild(n) && single.has(n.id)); // grown, living and unwed
  return (index = { npcs: world.npcs, day: world.day, byId, single, open });
}
const single = (world: WorldState, n: Npc) => lookup(world).single.has(n.id);
const byId = (world: WorldState, id?: number) => (id === undefined ? undefined : lookup(world).byId.get(id));

// Birthdays are spread over the year so the town doesn't age all at once.
export const isBirthday = (world: WorldState, n: Npc) => (world.day + n.id * 37) % 365 === 0;

export function birthday(world: WorldState, n: Npc, rng: Rng): void {
  n.age++;
  if (n.age === ADULT_AGE) comeOfAge(world, n, rng);
  if (n.age === ELDER_AGE && n.rank !== undefined && !n.retired) {
    n.retired = true;
    log(world, 'world', `${n.name} ปลดเกษียณจากการผจญภัยด้วยวัย ${n.age} ปี`, n.id);
  }
  // Odds of not seeing another year climb steeply after 55 (about 1 in 11 at 60, nearly half at 70).
  const frailty = Math.max(0, (n.age - 55) / 25);
  const doctors = world.npcs.filter((o) => o.alive && o.job === 'doctor' && o.age >= 16).length;
  const tended = 1 - Math.min(0.3, doctors * 0.1); // a doctor in town adds years
  if (chance(rng, Math.min(0.9, frailty ** 1.5 * tended))) kill(world, n, `จากไปอย่างสงบด้วยวัย ${n.age} ปี`);
}

// At sixteen a child picks a calling, usually a parent's; in a famine, often the plough.
function comeOfAge(world: WorldState, n: Npc, rng: Rng): void {
  const parents = (n.parentIds ?? []).map((id) => byId(world, id)).filter((p): p is Npc => !!p);
  n.job = inheritedJob(world, parents, rng);
  if (n.job !== 'noble' && priceRatio(world, 'grain') >= 1.8 && chance(rng, 0.5)) n.job = 'farmer';
  graduate(world, n, rng);
  if (n.job === 'swordsman' || n.job === 'mage') {
    n.rank = 0;
    n.renown = 0;
  }
  n.plan = undefined;
  log(world, 'world', `${n.name} เติบโตเป็นผู้ใหญ่ และเลือกเป็น${jobName(world, n.job)}`, n.id);
  if (isAvatar(world, n)) offerCalling(world, n); // the player picks, the town's guess is the default
}

// Who this NPC is sweet on: their closest single adult friend, if close enough.
export function crushOf(world: WorldState, n: Npc): Npc | undefined {
  if (isChild(n) || !single(world, n)) return undefined;
  const c = crushes(world).get(n.id);
  return c && c.alive && single(world, c) ? c : undefined; // someone who has married since is off the market
}

// Everyone's crush at once, read off the ties that are warm enough, rather than asking every
// pair in town for every single: a town of a hundred and more would spend its days on it.
function crushes(world: WorldState): Map<number, Npc> {
  const bucket = Math.floor(world.day / CRUSH_EVERY);
  if (crushCache?.ties === world.ties && crushCache.bucket === bucket) return crushCache.map;
  const idx = lookup(world);
  const open = new Map(idx.open.map((n) => [n.id, n]));
  const best = new Map<number, [Npc, number]>();
  const consider = (n: Npc, o: Npc, t: number) => {
    const cur = best.get(n.id);
    if (!cur || t > cur[1] || (t === cur[1] && o.id < cur[0].id)) best.set(n.id, [o, t]);
  };
  for (const k in world.ties) {
    const t = world.ties[k];
    if (t < COURT_TIE) continue;
    const dash = k.indexOf('-');
    const a = open.get(Number(k.slice(0, dash)));
    const b = a && open.get(Number(k.slice(dash + 1)));
    if (!a || !b || related(a, b)) continue;
    consider(a, b, t);
    consider(b, a, t);
  }
  const map = new Map([...best].map(([id, [o]]) => [id, o]));
  crushCache = { ties: world.ties, bucket, map };
  return map;
}

const related = (a: Npc, b: Npc) =>
  a.parentIds?.includes(b.id) ||
  b.parentIds?.includes(a.id) ||
  (!!a.parentIds && !!b.parentIds && a.parentIds.some((p) => b.parentIds!.includes(p)));

// Close friends who are both single may marry; married couples keep growing closer.
export function romance(world: WorldState, rng: Rng): void {
  const adults = world.npcs.filter((n) => n.alive && !isChild(n));
  for (const a of adults) {
    const spouse = byId(world, a.spouseId);
    if (spouse?.alive) {
      if (a.id < spouse.id && chance(rng, 0.1)) addTie(world, a, spouse, 1);
      continue;
    }
    if (a.age > 60) continue;
    const b = crushOf(world, a);
    if (!b || a.id > b.id || b.age > 60 || crushOf(world, b) !== a) continue; // it has to be mutual
    if (getTie(world, a.id, b.id) < MARRY_TIE || Math.abs(a.morality - b.morality) > 80 || !chance(rng, MARRY_CHANCE)) continue;
    const me = isAvatar(world, a) ? a : isAvatar(world, b) ? b : undefined;
    if (me) {
      // The player's own heart decides; a suitor turned down waits a while before asking again.
      const other = me === a ? b : a;
      if ((world.avatar!.refused?.[other.id] ?? 0) > world.day) continue;
      offer(world, { kind: 'marry', text: `${other.name}สารภาพรักและขอแต่งงานกับ${me.name} จะตอบว่าอย่างไร?`, options: [{ key: 'yes', label: 'ตกลงแต่งงาน' }, { key: 'no', label: 'ปฏิเสธ' }], fallback: 'yes', other: other.id });
      continue;
    }
    wed(world, a, b);
  }
}

export function wed(world: WorldState, a: Npc, b: Npc): void {
  a.spouseId = b.id;
  b.spouseId = a.id;
  lookup(world).single.delete(a.id);
  lookup(world).single.delete(b.id);
  log(world, 'bond', `${a.name} และ${b.name} แต่งงานกัน`, a.id);
}

// Couples in their child-raising years sometimes welcome a child.
export function births(world: WorldState, rng: Rng): void {
  const living = world.npcs.filter((n) => n.alive).length;
  if (living >= POPULATION_CAP) return;
  for (const a of world.npcs) {
    const b = byId(world, a.spouseId);
    if (!a.alive || !b?.alive || a.id > b.id || a.age > 45 || b.age > 45) continue;
    const kids = world.npcs.filter((n) => n.alive && n.parentIds?.includes(a.id) && n.parentIds.includes(b.id)).length;
    if (kids >= MAX_CHILDREN || !chance(rng, BIRTH_CHANCE)) continue;
    const child = bornTo(world, a, b, rng);
    world.npcs.push(child);
    log(world, 'bond', `${a.name} และ${b.name} ต้อนรับลูกคนใหม่ ชื่อ${child.name}`, child.id);
  }
}

export function bornTo(world: WorldState, a: Npc, b: Npc, rng: Rng): Npc {
  // One trait from each parent, with a chance of something all their own.
  const traits = new Set<Trait>([pick(rng, a.traits), pick(rng, b.traits)]);
  if (chance(rng, 0.2)) traits.add(pick(rng, ['greedy', 'brave', 'coward', 'loyal', 'vengeful', 'kind'] as const));
  const home = homeOf(a);
  const child: Npc = {
    id: world.nextId++,
    name: freshName(world, rng),
    age: 0,
    job: a.job, // placeholder until they come of age
    level: 1,
    gold: 0,
    morality: Math.round((a.morality + b.morality) / 2 / 2), // kids start gentler than their parents
    traits: [...traits].slice(0, 2),
    x: home.x,
    y: home.y,
    alive: true,
    blessed: false,
    parentIds: [a.id, b.id],
  };
  setTie(world, child.id, a.id, 50);
  setTie(world, child.id, b.id, 50);
  for (const sib of world.npcs) if (sib.alive && sib.parentIds?.includes(a.id)) setTie(world, child.id, sib.id, 30);
  return child;
}

function freshName(world: WorldState, rng: Rng): string {
  // Reuse the town's own naming so children feel local; numbered if every name is taken.
  const taken = new Set(world.npcs.filter((n) => n.alive).map((n) => n.name));
  const pool = [
    'ลิลลี่', 'ทอม', 'เมย์', 'ฟินน์', 'โรส', 'เบน', 'แอนนา', 'ซาช่า', 'ไมโล', 'เอมมี่',
    'โนอาห์', 'ไลลา', 'เจค', 'ปิ่น', 'ต้นข้าว', 'ใบเตย', 'ดาว', 'ฟ้า', 'ภูผา', 'น้ำใส',
    'มะลิ', 'ข้าวหอม', 'ไผ่', 'ทับทิม', 'ลมเย็น', 'พลอย', 'ขวัญ', 'ตะวัน', 'จันทร์', 'เมฆ',
    'โอลิเวอร์', 'คลาร่า', 'ฮิวจ์', 'เอดา', 'ฟลอร่า', 'จูด', 'ไอริส', 'แมกซ์', 'ซีเลีย', 'ทีโอ',
  ];
  const free = pool.filter((n) => !taken.has(n));
  if (free.length) return pick(rng, free);
  const base = pick(rng, pool);
  let i = 2;
  while (taken.has(`${base} ที่ ${i}`)) i++;
  return `${base} ที่ ${i}`;
}

// A married couple shares the home of whichever of them settled first.
export function homeOf(n: Npc, world?: WorldState): { x: number; y: number } {
  const spouse = world && byId(world, n.spouseId);
  const anchor = spouse && spouse.id < n.id ? spouse.id : n.id;
  const parent = n.parentIds?.[0];
  return PLACES.homes[(n.age < ADULT_AGE && parent !== undefined ? parent : anchor) % PLACES.homes.length];
}

// Children tag along after a parent or play in the square.
export function childDay(world: WorldState, n: Npc, rng: Rng): void {
  const parents = (n.parentIds ?? []).map((id) => byId(world, id)).filter((p): p is Npc => !!p?.alive && p.inside === undefined);
  const school = built(world, 'school') && schoolAge(n);
  if (!n.plan || n.plan.days <= 0) {
    if (school && chance(rng, 0.6)) {
      n.plan = makePlan('idle', PLACES.school, int(rng, 3, 5)); // off to lessons
    } else if (parents.length && chance(rng, 0.6)) {
      const p = pick(rng, parents);
      n.plan = makePlan('idle', p, int(rng, 2, 5), p.id);
    } else {
      n.plan = makePlan('idle', chance(rng, 0.5) ? PLACES.square : homeOf(n, world), int(rng, 3, 6));
    }
  }
  const p = n.plan;
  const following = p.target !== undefined ? byId(world, p.target) : undefined;
  if (following?.alive) {
    p.x = following.x;
    p.y = following.y + 1;
  }
  if (!atSpot(n, p, following ? 1 : 0)) stepToward(world, n, p, rng);
  else {
    p.days--;
    lesson(world, n, school && p.x === PLACES.school.x && p.y === PLACES.school.y, following);
  }
}
