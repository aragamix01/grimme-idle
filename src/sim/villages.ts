// The villages out on the lands. A land is worked by people, not by gold alone: the crown sends
// families out from town to work what it has raised, and conquered or bought land comes with
// the folk already living there. Each village lives its own small life (its people grow up,
// marry, raise children and die), picks a headman from among its own, and the headman has a
// mind of his own: he sends the harvest home or keeps a cut, asks the crown for help in a bad
// month and remembers whether it came, builds up the village with what it keeps, and when
// the crown has lost him altogether he breaks away, or goes over to a neighbour who woos him.
import { chance, int, pick, type Rng } from './rng';
import { clamp, kill, log } from './core';
import { isAvatar } from './avatar';
import { jailed } from './justice';
import { ADULT_AGE, ELDER_AGE, isBirthday, isChild } from './life';
import { FIRST_NAMES } from './names';
import { TOWN_SIZE } from './town';
import { LAND_TH, USES, best, isOurs, levelOf, touches } from './lands';
import type { Job, LandUse, Npc, Realm, Region, Trait, Village, VillageWork, WorldState } from './types';

export const WORKERS_PER_LEVEL = 2; // hands each level of a use needs to bring in all it can
const TOWN_FLOOR = Math.round(TOWN_SIZE * 0.85); // the crown sends nobody while the town is smaller than this
const VILLAGE_DAY = 23; // day of the month the villages hold council (after the harvest on the 17th)
const KEEP = 0.15; // what a contented village keeps of its harvest for itself
const GIFT = 150; // what the crown sends a village whose headman is losing faith in it
const REJOIN_COST = 300; // what the crown pays a free village to come back

export const WORK_TH: Record<VillageWork, string> = { well: 'บ่อน้ำ', granary: 'ยุ้งฉาง', shrine: 'ศาลเจ้า', palisade: 'รั้วค่าย', market: 'ลานตลาด' };
const WORK_COST: Record<VillageWork, number> = { well: 120, granary: 150, shrine: 150, palisade: 200, market: 250 };
// What each kind of headman builds first.
const WANTS: Record<Trait, VillageWork[]> = {
  kind: ['well', 'granary', 'shrine', 'market', 'palisade'],
  loyal: ['shrine', 'granary', 'well', 'palisade', 'market'],
  brave: ['palisade', 'well', 'granary', 'market', 'shrine'],
  greedy: ['market', 'granary', 'well', 'palisade', 'shrine'],
  vengeful: ['palisade', 'granary', 'market', 'well', 'shrine'],
  coward: ['palisade', 'granary', 'well', 'shrine', 'market'],
};
// The town's trades that can be spared for the land; the crown never sends its soldiers, priests or officials.
const SPARE: readonly Job[] = ['farmer', 'herder', 'hunter', 'builder', 'blacksmith', 'merchant'];
// What each use needs its people to be.
export const WORKER_JOB: Record<LandUse, Job> = { farm: 'farmer', pasture: 'herder', mine: 'builder', lumber: 'hunter', fishery: 'merchant' };
// What villagers are called by their work on the land.
export const VILLAGER_TH: Partial<Record<Job, string>> = { farmer: 'ชาวนา', herder: 'คนเลี้ยงสัตว์', builder: 'คนงานเหมือง', hunter: 'คนตัดไม้', merchant: 'ชาวประมง' };

export const villagers = (world: WorldState) => world.villagers ?? [];
export const folkOf = (world: WorldState, r: Region) => villagers(world).filter((n) => n.alive && n.regionId === r.id);
const grown = (n: Npc) => n.age >= ADULT_AGE && n.age < ELDER_AGE + 7;
export const workersOf = (world: WorldState, r: Region) => folkOf(world, r).filter(grown);
export const levels = (r: Region) => Object.values(r.dev ?? {}).reduce((s, l) => s + l, 0);
export const needOf = (r: Region) => levels(r) * WORKERS_PER_LEVEL;
export const chiefOf = (world: WorldState, r: Region) => villagers(world).find((n) => n.alive && n.id === r.village?.chiefId && n.regionId === r.id);
export const hasWork = (r: Region, w: VillageWork) => !!r.village?.works?.includes(w);
const capOf = (r: Region) => Math.min(18, 3 + needOf(r) + (hasWork(r, 'well') ? 3 : 0));
// How much of a land's yield its hands can bring in. Neighbours' lands are worked in broad strokes.
export function labour(world: WorldState, r: Region): number {
  if (!isOurs(r)) return 1;
  const need = needOf(r);
  return need ? Math.min(1, workersOf(world, r).length / need) : 0;
}
// What the headman keeps of the harvest for the village, by his loyalty and his nature.
export function keepOf(world: WorldState, r: Region): number {
  const v = r.village;
  if (!v) return 0;
  if (v.loyalty < 20) return 1; // nothing goes to a crown he no longer answers to
  let keep = KEEP + (v.loyalty < 35 ? 0.35 : 0);
  if (chiefOf(world, r)?.traits.includes('greedy')) keep += 0.2;
  return Math.min(1, keep);
}

const villageOf = (r: Region, loyalty: number): Village => (r.village ??= { loyalty, purse: 0 });

// Land changes hands: the village's loyalty now runs to its new owner. A land that has nobody
// on it yet, taken from a neighbour, comes with the folk who already live there.
export function changeHands(world: WorldState, r: Region, how: 'settle' | 'buy' | 'cede' | 'war' | 'rejoin', rng?: Rng): void {
  const loyalty = { settle: 70, buy: 45, cede: 50, war: 25, rejoin: 55 }[how];
  const v = r.village;
  if (v) {
    v.free = undefined;
    v.plea = undefined;
    v.loyalty = loyalty;
  }
  if (!isOurs(r) || how === 'settle' || folkOf(world, r).length || !rng) return;
  // Locals: a couple of families, wary of their new lords.
  villageOf(r, loyalty).chiefId = undefined;
  for (let i = int(rng, 2, 3); i > 0; i--) family(world, r, rng);
  choose(world, r, rng);
}

// A local family: a couple and a child or two.
function family(world: WorldState, r: Region, rng: Rng): void {
  const job = WORKER_JOB[best(r)];
  const a = local(world, r, rng, int(rng, 22, 40), job);
  const b = local(world, r, rng, int(rng, 20, 38), job);
  a.spouseId = b.id;
  b.spouseId = a.id;
  for (let i = int(rng, 0, 2); i > 0; i--) {
    const kid = local(world, r, rng, int(rng, 1, 12), job);
    kid.parentIds = [a.id, b.id];
  }
}

const TRAITS: readonly Trait[] = ['greedy', 'brave', 'coward', 'loyal', 'vengeful', 'kind'];
function local(world: WorldState, r: Region, rng: Rng, age: number, job: Job, parents?: [Npc, Npc]): Npc {
  const t1 = parents ? pick(rng, parents[0].traits) : pick(rng, TRAITS);
  const t2 = parents ? pick(rng, parents[1].traits) : pick(rng, TRAITS);
  const npc: Npc = {
    id: world.nextId++,
    name: freshName(world, rng),
    age,
    job,
    level: 1,
    gold: parents ? 0 : int(rng, 2, 15),
    morality: parents ? Math.round((parents[0].morality + parents[1].morality) / 4) : int(rng, -10, 40),
    traits: t1 === t2 ? [t1] : [t1, t2],
    x: 0,
    y: 0,
    alive: true,
    blessed: false,
    regionId: r.id,
    parentIds: parents && [parents[0].id, parents[1].id],
  };
  (world.villagers ??= []).push(npc);
  return npc;
}

function freshName(world: WorldState, rng: Rng): string {
  const taken = new Set([...world.npcs, ...villagers(world)].filter((n) => n.alive).map((n) => n.name));
  const free = FIRST_NAMES.filter((n) => !taken.has(n));
  if (free.length) return pick(rng, free);
  const base = pick(rng, FIRST_NAMES);
  let i = 2;
  while (taken.has(`${base} ที่ ${i}`)) i++;
  return `${base} ที่ ${i}`;
}

// ---------- the crown sends people out ----------

// Someone the town can spare: grown, at home, free and holding no office.
function spare(world: WorldState, n: Npc): boolean {
  return (
    n.alive &&
    n.age >= 18 &&
    n.age <= 45 &&
    SPARE.includes(n.job) &&
    n.inside === undefined &&
    n.trip === undefined &&
    n.questId === undefined &&
    !n.knight &&
    !n.hero &&
    !n.cultist &&
    n.formerJob === undefined &&
    n.id !== world.kingId &&
    !world.guilds.some((g) => g.leaderId === n.id) &&
    !jailed(world, n) &&
    !isAvatar(world, n)
  );
}

// Whether the town has anyone to send.
export const canSend = (world: WorldState) => world.npcs.filter((n) => n.alive).length >= TOWN_FLOOR && world.npcs.some((n) => spare(world, n));

// A family from town moves out to a land: the one picked, their spouse and their children.
// Returns how many went, or 0 when the town has nobody to spare.
export function sendFamily(world: WorldState, r: Region, rng: Rng): number {
  const town = world.npcs.filter((n) => n.alive);
  if (town.length < TOWN_FLOOR) return 0;
  const want = WORKER_JOB[best(r)];
  const pool = town.filter((n) => spare(world, n));
  if (!pool.length) return 0;
  const head = pool.find((n) => n.job === want) ?? pool.find((n) => n.job === 'farmer' || n.job === 'herder') ?? pick(rng, pool);
  const spouse = town.find((n) => n.id === head.spouseId);
  const going = [head, ...(spouse && spouse.inside === undefined && !jailed(world, spouse) && !isAvatar(world, spouse) && spouse.id !== world.kingId && !spouse.knight && spouse.formerJob === undefined ? [spouse] : [])];
  for (const kid of town) if (isChild(kid) && !isAvatar(world, kid) && going.some((p) => kid.parentIds?.includes(p.id))) going.push(kid);
  const moving = new Set(going.map((n) => n.id));
  world.npcs = world.npcs.filter((n) => !moving.has(n.id));
  for (const n of going) {
    n.regionId = r.id;
    n.plan = undefined;
    n.guildId = undefined;
    n.rank = n.renown = undefined;
    if (!isChild(n)) n.job = want;
    (world.villagers ??= []).push(n);
  }
  villageOf(r, 70);
  log(world, 'politics', `ครอบครัวของ${head.name} ${going.length} คน ย้ายออกจากเมืองไปบุกเบิกทำ${LAND_TH[r.kind]}ที่${r.name}`, head.id);
  if (!chiefOf(world, r)) choose(world, r, rng);
  return going.length;
}

// ---------- village life ----------

export function villagesDay(world: WorldState, rng: Rng): void {
  for (const n of villagers(world)) if (n.alive && isBirthday(world, n)) birthday(world, n, rng);
  if (world.day % 30 !== VILLAGE_DAY) return;
  const regions = new Map((world.regions ?? []).map((r) => [r.id, r]));
  for (const r of world.regions ?? []) if (r.village && folkOf(world, r).length) council(world, r, rng);
  // The dead drop off the rolls, but a headman's name stays while the village remembers him.
  const chiefs = new Set((world.regions ?? []).map((r) => r.village?.chiefId));
  world.villagers = villagers(world).filter((n) => (n.alive || chiefs.has(n.id)) && regions.has(n.regionId!));
  // Ours to send to: lands short of hands get a family, one a month.
  const short = (world.regions ?? []).filter((r) => isOurs(r) && !r.seat && labour(world, r) < 1 && folkOf(world, r).length < capOf(r));
  short.sort((a, b) => labour(world, a) - labour(world, b));
  if (short[0]) sendFamily(world, short[0], rng);
}

function birthday(world: WorldState, n: Npc, rng: Rng): void {
  n.age++;
  const r = world.regions?.find((x) => x.id === n.regionId);
  if (n.age === ADULT_AGE && r) {
    // A child of the village takes up its work: the use that is shortest of hands.
    const short = USES[r.kind].filter((u) => levelOf(r, u) > 0)[0] ?? best(r);
    n.job = WORKER_JOB[short];
    log(world, 'world', `${n.name} เติบโตเป็นหนุ่มสาวแห่ง${r.name}`, n.id);
  }
  const frailty = Math.max(0, (n.age - 55) / 25);
  const tended = r && hasWork(r, 'well') ? 0.85 : 1;
  if (chance(rng, Math.min(0.9, frailty ** 1.5 * tended))) kill(world, n, `จากไปอย่างสงบที่${r?.name ?? 'หมู่บ้าน'} ด้วยวัย ${n.age} ปี`);
}

// The month's council: weddings and births, a new headman if need be, then his decisions.
function council(world: WorldState, r: Region, rng: Rng): void {
  const v = r.village!;
  const folk = folkOf(world, r);
  // Weddings: two unwed grown folk of the village who are not kin.
  const open = folk.filter((n) => grown(n) && n.age <= 50 && !folk.some((o) => o.id === n.spouseId));
  if (open.length >= 2 && chance(rng, 0.25)) {
    const a = pick(rng, open);
    const b = open.find((o) => o !== a && !kin(a, o) && Math.abs(o.age - a.age) <= 15);
    if (b) {
      a.spouseId = b.id;
      b.spouseId = a.id;
      log(world, 'bond', `${a.name} และ${b.name} แต่งงานกันที่${r.name}`, a.id);
    }
  }
  // Births: a couple in their child-raising years, while the village has room.
  if (folk.length < capOf(r))
    for (const a of folk) {
      const b = folk.find((o) => o.id === a.spouseId);
      if (!b || a.id > b.id || a.age > 45 || b.age > 45) continue;
      const kids = folk.filter((n) => n.parentIds?.includes(a.id) && n.parentIds.includes(b.id)).length;
      if (kids >= 3 || !chance(rng, hasWork(r, 'well') ? 0.08 : 0.05)) continue;
      const child = local(world, r, rng, 0, a.job, [a, b]);
      log(world, 'bond', `${a.name} และ${b.name} ต้อนรับลูกคนใหม่ที่${r.name} ชื่อ${child.name}`, child.id);
    }
  if (!chiefOf(world, r)) choose(world, r, rng);
  const chief = chiefOf(world, r);
  if (!chief) return;
  if (isOurs(r)) ours(world, r, v, chief, rng);
  else if (v.free) free(world, r, v, chief, rng);
  else theirs(world, r, v, chief, rng);
  build(world, r, v, chief);
}

const kin = (a: Npc, b: Npc) =>
  !!(a.parentIds?.includes(b.id) || b.parentIds?.includes(a.id) || (a.parentIds && b.parentIds && a.parentIds.some((p) => b.parentIds!.includes(p))));

// The villagers pick a headman: the eldest and ablest, and better one they can trust.
function choose(world: WorldState, r: Region, rng: Rng): void {
  const grownFolk = folkOf(world, r).filter(grown);
  if (!grownFolk.length) return;
  const score = (n: Npc) => Math.min(n.age, 60) + n.level * 4 + (n.traits.includes('loyal') ? 8 : 0) + (n.traits.includes('brave') ? 5 : 0) + (n.traits.includes('kind') ? 5 : 0) + int(rng, 0, 12);
  const chief = grownFolk.map((n) => ({ n, s: score(n) })).sort((a, b) => b.s - a.s)[0].n;
  const v = villageOf(r, 50);
  const had = v.chiefId !== undefined;
  v.chiefId = chief.id;
  log(world, 'politics', `ชาวบ้านแห่ง${r.name}${had ? 'เลือกผู้ใหญ่บ้านคนใหม่' : 'เลือก'} ${chief.name} เป็นผู้ใหญ่บ้าน`, chief.id);
}

// What a headman thinks of the crown, from his nature.
const LEAN: Record<Trait, number> = { loyal: 18, kind: 6, coward: 4, brave: 0, greedy: -10, vengeful: -8 };
const leanOf = (chief: Npc) => chief.traits.reduce((s, t) => s + LEAN[t], 0);

// A village of ours: its headman weighs the crown, asks for help, and may break away.
function ours(world: WorldState, r: Region, v: Village, chief: Npc, rng: Rng): void {
  const lab = labour(world, r);
  // A plea unanswered by its deadline is remembered, the more by a vengeful man, and long.
  v.grudge = Math.max(0, (v.grudge ?? 0) - 1);
  if (v.plea && world.day >= v.plea.until) {
    v.grudge = (v.grudge ?? 0) + (chief.traits.includes('vengeful') ? 30 : 15);
    v.loyalty -= 10;
    v.plea = undefined;
    v.thought = 'เมืองหลวงไม่เคยเหลียวแลพวกเรา ยามลำบากก็ทิ้งให้สู้กันเอง';
    log(world, 'politics', `${chief.name} ผู้ใหญ่บ้านแห่ง${r.name} ขุ่นเคืองที่เมืองหลวงไม่ส่งความช่วยเหลือมา`, chief.id);
  }
  // Loyalty drifts toward what the headman makes of the crown: his nature, the shrine, a fair share kept.
  const target = 55 + leanOf(chief) - (v.grudge ?? 0) + (hasWork(r, 'shrine') ? 8 : 0) - (lab < 0.5 ? 8 : 0) + wooed(world, r);
  v.loyalty = clamp(Math.round(v.loyalty + (target - v.loyalty) * 0.15 + int(rng, -3, 3)), 0, 100);
  // A bad month: blight, bandits or a murrain; the granary softens it. He asks the crown for help.
  if (!v.plea && chance(rng, hasWork(r, 'granary') ? 0.012 : 0.025)) {
    const what = pick(rng, ['พืชผลเสียหายจากแมลง', 'โจรป่าบุกปล้นหมู่บ้าน', 'โรคระบาดในฝูงสัตว์', 'น้ำป่าพัดยุ้งข้าวพัง']);
    const gold = int(rng, 80, 160);
    v.plea = { gold, until: world.day + 45, text: `${what} ขอเมืองหลวงช่วย ${gold} ทอง` };
    v.thought = `${what} ข้าส่งคนไปขอความช่วยเหลือจากเมืองหลวงแล้ว`;
    log(world, 'politics', `${r.name}เดือดร้อน: ${what} ${chief.name}ผู้ใหญ่บ้านร้องขอความช่วยเหลือ ${gold} ทอง`, chief.id);
  }
  // The crown answers a plea if it can, and woos back a village losing faith.
  if (v.plea && world.treasury - v.plea.gold >= 500 && chance(rng, 0.45)) {
    world.treasury -= v.plea.gold;
    v.purse += v.plea.gold;
    v.loyalty = clamp(v.loyalty + 15, 0, 100);
    log(world, 'politics', `ทางการส่งเงิน ${v.plea.gold} ทองไปช่วย${r.name} ${chief.name}ซาบซึ้งในน้ำใจเมืองหลวง`, chief.id);
    v.plea = undefined;
    v.thought = 'เมืองหลวงไม่ทิ้งพวกเรา ข้าจะส่งส่วยให้ครบทุกเดือน';
  } else if (v.loyalty < 35 && world.treasury >= 500 + GIFT * 3 && chance(rng, 0.5)) {
    world.treasury -= GIFT;
    v.purse += GIFT;
    v.loyalty = clamp(v.loyalty + (chief.traits.includes('greedy') ? 6 : 12), 0, 100);
    log(world, 'politics', `ทางการส่งของขวัญ ${GIFT} ทองไปผูกใจ${chief.name}ผู้ใหญ่บ้านแห่ง${r.name}`, chief.id);
  }
  if (v.loyalty < 15 && chance(rng, 0.3)) return breakAway(world, r, v, chief, rng);
  if (!v.plea) v.thought = mood(world, r, v, chief, lab);
}

// A neighbour next door courts a wavering village.
function wooed(world: WorldState, r: Region): number {
  const near = suitor(world, r);
  return near ? -6 - (near.ruler.traits.includes('greedy') ? 4 : 0) : 0;
}
const suitor = (world: WorldState, r: Region): Realm | undefined =>
  (world.realms ?? []).find((x) => !x.fallen && !x.pact && x.relation < 30 && x.gold > 300 && touches(world, r, x.id));

// The headman's own words on how things stand.
function mood(world: WorldState, r: Region, v: Village, chief: Npc, lab: number): string {
  if (lab < 0.6) return 'คนไม่พอทำงาน ขอเมืองหลวงส่งคนมาเพิ่มด้วยเถิด';
  if (v.loyalty < 20) return 'ข้าจะไม่ส่งส่วยให้เมืองหลวงอีกแล้ว ผลผลิตเป็นของคนที่ลงแรง';
  if (v.loyalty < 35) return suitor(world, r) ? 'แคว้นข้างเคียงสัญญาว่าจะดูแลเราดีกว่าเมืองหลวง… ข้ากำลังชั่งใจ' : 'ส่วยหนักเกินไป ชาวบ้านเริ่มบ่นกันแล้ว';
  if (chief.traits.includes('greedy') && v.purse > 100) return 'เก็บไว้ในหมู่บ้านสักส่วน เมืองหลวงไม่รู้หรอก';
  const want = WANTS[chief.traits[0]].find((w) => !hasWork(r, w));
  if (want && v.purse < WORK_COST[want]) return `เก็บเงินไว้สร้าง${WORK_TH[want]}ให้หมู่บ้าน`;
  return v.loyalty >= 70 ? 'ปีนี้ผลผลิตดี ส่งส่วยให้เมืองหลวงครบ' : 'อยู่กันอย่างสงบ ทำไร่ทำนาไปตามฤดู';
}

// The last straw: a bold headman declares the village free; another goes over to a neighbour who pays.
function breakAway(world: WorldState, r: Region, v: Village, chief: Npc, rng: Rng): void {
  const realm = suitor(world, r);
  v.plea = undefined;
  if (realm && !chief.traits.includes('brave') && !chief.traits.includes('vengeful') && chance(rng, 0.6)) {
    const bribe = Math.min(200, Math.round(realm.gold * 0.3));
    realm.gold -= bribe;
    chief.gold += bribe;
    r.owner = realm.id;
    r.since = world.day;
    v.loyalty = 55;
    v.thought = `${realm.name}ดูแลพวกเราดีกว่าเมืองหลวงที่ไม่เคยเหลียวแล`;
    log(world, 'politics', `${chief.name}ผู้ใหญ่บ้านแห่ง${r.name} รับเงิน ${bribe} ทองจาก${realm.name} แล้วพาหมู่บ้านไปขึ้นกับ${realm.name}`, chief.id);
    return;
  }
  r.owner = undefined;
  r.since = world.day;
  v.free = true;
  v.loyalty = 20;
  v.thought = 'พวกเราปกครองตัวเองแล้ว ไม่มีใครมาเก็บส่วยจากเราอีก';
  log(world, 'politics', `${chief.name}ผู้ใหญ่บ้านแห่ง${r.name} ประกาศแยกตัวเป็นอิสระจากเมืองหลวง ไม่ส่งส่วยอีกต่อไป`, chief.id);
}

// A free village: it keeps all it grows, and its grudge fades; the crown may buy it back.
function free(world: WorldState, r: Region, v: Village, chief: Npc, rng: Rng): void {
  const target = 40 + leanOf(chief) + (hasWork(r, 'shrine') ? 5 : 0);
  v.loyalty = clamp(Math.round(v.loyalty + (target - v.loyalty) * 0.08 + int(rng, -2, 2)), 0, 100);
  v.purse += Math.round(levels(r) * 8 * labourFree(world, r));
  v.thought = v.loyalty >= 45 ? 'อยู่กันเองก็ลำบาก ถ้าเมืองหลวงยื่นมือมาอย่างจริงใจ ข้าก็พร้อมคุย' : 'พวกเราปกครองตัวเองแล้ว ไม่มีใครมาเก็บส่วยจากเราอีก';
  if (v.loyalty < 45 || !touches(world, r, 'us') || world.treasury < 600 + REJOIN_COST || !chance(rng, 0.4)) return;
  world.treasury -= REJOIN_COST;
  v.purse += REJOIN_COST;
  r.owner = 'us';
  r.since = world.day;
  changeHands(world, r, 'rejoin');
  v.thought = 'กลับมาอยู่ใต้ร่มเมืองหลวงอีกครั้ง ขอให้คราวนี้ดูแลกันดีกว่าเดิม';
  log(world, 'politics', `ทูตของเราเจรจาสำเร็จ ${chief.name}ผู้ใหญ่บ้านพา${r.name}กลับมาขึ้นกับเมืองหลวง ด้วยเงินช่วยเหลือ ${REJOIN_COST} ทอง`, chief.id);
}
// A village under a neighbour: it settles in, or, under a greedy lord and with us next door,
// asks to come home to us.
function theirs(world: WorldState, r: Region, v: Village, chief: Npc, rng: Rng): void {
  const realm = world.realms?.find((x) => x.id === r.owner);
  if (!realm) return;
  const target = 50 + leanOf(chief) / 2 - (realm.ruler.traits.includes('greedy') ? 15 : 0) - (realm.fallen ? 30 : 0);
  v.loyalty = clamp(Math.round(v.loyalty + (target - v.loyalty) * 0.08 + int(rng, -3, 3)), 0, 100);
  v.thought = v.loyalty < 30 ? `${realm.name}รีดส่วยหนักเหลือเกิน คิดถึงสมัยที่อยู่กับเมืองหลวง` : `อยู่ใต้การปกครองของ${realm.name} ก็พออยู่กันได้`;
  if (v.loyalty >= 20 || !touches(world, r, 'us') || !chance(rng, 0.2)) return;
  r.owner = 'us';
  r.since = world.day;
  changeHands(world, r, 'rejoin');
  v.thought = 'กลับบ้านแล้ว ขอให้เมืองหลวงดูแลพวกเราดีกว่าเจ้านายคนก่อน';
  log(world, 'politics', `${chief.name}ผู้ใหญ่บ้านแห่ง${r.name} พาหมู่บ้านหนีจาก${realm.name} กลับมาขึ้นกับเมืองหลวงของเรา`, chief.id);
}

const labourFree = (world: WorldState, r: Region) => {
  const need = needOf(r);
  return need ? Math.min(1, workersOf(world, r).length / need) : 0;
};

// The headman spends the village's purse on the next work he wants; a greedy one pockets a share.
function build(world: WorldState, r: Region, v: Village, chief: Npc): void {
  if (hasWork(r, 'market')) v.purse += 10; // pedlars come to the village's own market
  if (chief.traits.includes('greedy') && v.purse > 60) {
    const cut = Math.round(v.purse * 0.1);
    v.purse -= cut;
    chief.gold += cut;
  }
  const want = WANTS[chief.traits[0]].find((w) => !hasWork(r, w));
  if (!want) {
    // Everything built: the rest of the purse goes round the village.
    const folk = folkOf(world, r).filter(grown);
    if (v.purse > 200 && folk.length) {
      const each = Math.floor((v.purse - 200) / folk.length);
      for (const n of folk) n.gold += each;
      v.purse -= each * folk.length;
    }
    return;
  }
  if (v.purse < WORK_COST[want]) return;
  v.purse -= WORK_COST[want];
  (v.works ??= []).push(want);
  log(world, 'world', `ชาวบ้านแห่ง${r.name}ช่วยกันสร้าง${WORK_TH[want]} ตามที่${chief.name}ผู้ใหญ่บ้านวางแผนไว้`, chief.id);
}
