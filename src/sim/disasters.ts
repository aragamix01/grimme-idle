// Nature's own blows, none of the god's doing: a summer drought that withers the fields and
// the herd, rains that will not stop and rot the grain, the great flood they bring down on
// the fields, and the earthquake. They kill, bring down homes and the crown's buildings, and
// leave everyone poorer. A kind ruler sends relief and the town rebuilds faster; a greedy one
// keeps the gold and the town remembers. Some of those who lost their homes leave for good; the
// rest sleep rough until the builders (farmers taken on by the crown) put the houses back up.
// The god's kind rain ends a drought.
import { chance, int, next, type Rng } from './rng';
import { kill, known, log, loyaltyNudge, occupied } from './core';
import { weatherOf } from './divine';
import { ensureMarket, priceRatio, seasonOf } from './market';
import { plagueStrike } from './worldevents';
import { traveller } from './world';
import { clamp } from './core';
import { king, payrollReserve } from './society';
import { BUILDINGS } from './town';
import { WORKS, WORK_ORDER } from './works';
import type { Realm, Terrain, Work, WorldState } from './types';

const DAY = 27; // day of the month nature may strike
const GAP = 300; // days between disasters at the least
const DROUGHT = 0.035; // monthly chance in summer
const DELUGE = 0.03; // monthly chance in spring and autumn
const FLOOD = 0.008; // monthly chance in spring, of a flood without the long rains
const QUAKE = 0.004; // monthly chance in any season
const RUBBLE_DAYS = [150, 300] as const; // how long a fallen home lies before it's rebuilt
const RELIEF_EACH = 8; // gold the crown spends per townsperson on relief
const HOMELESS_PER_RUIN = 3; // people sleeping rough for each home down
const BUILDERS_PER_RUIN = 0.5; // builders the crown takes on for each home down
const MAX_BUILDERS = 6;
const BUILDER_WAGE = 1; // gold a day from the treasury

const REALM_ODDS = 0.006; // monthly chance a neighbour is struck
const REALM_DAYS = 120; // how long it takes them to recover
// What each land suffers.
const REALM_KINDS: Record<Terrain, NonNullable<Realm['disaster']>['kind'][]> = { coast: ['flood', 'quake'], mountain: ['quake'], desert: ['drought'], forest: ['flood', 'drought'] };
const REALM_TH = { drought: 'ภัยแล้ง', flood: 'น้ำท่วมใหญ่', quake: 'แผ่นดินไหว' } as const;
export const stricken = (world: WorldState, r: Realm) => (r.disaster?.until ?? 0) > world.day;

const HOMES = BUILDINGS.filter(([k]) => k.startsWith('house')).map(([, x, y]) => ({ x, y }));
// Low ground that floods; high ground and stone that shakes.
const FLOODS: readonly Work[] = ['granary', 'market', 'yard'];

const living = (world: WorldState) => world.npcs.filter((n) => n.alive && n.inside === undefined);
export const flooded = (world: WorldState) => (world.flood ?? 0) > world.day;

// The dead of a disaster: the very young and the old die first.
function toll(world: WorldState, rng: Rng, odds: number, how: string): number {
  let dead = 0;
  for (const n of living(world)) {
    const frail = n.age >= 58 ? 2.5 : n.age < 10 ? 2 : 1;
    if (chance(rng, odds * frail)) {
      kill(world, n, how);
      dead++;
    }
  }
  return dead;
}

// Homes come down; rubble stands where they were until the town rebuilds.
function ruinHomes(world: WorldState, rng: Rng, count: number): number {
  const ruins = (world.ruins ??= []);
  const standing = HOMES.filter((h) => !ruins.some((r) => r.x === h.x && r.y === h.y));
  let fell = 0;
  for (let i = 0; i < count && standing.length; i++) {
    const h = standing.splice(int(rng, 0, standing.length - 1), 1)[0];
    ruins.push({ ...h, until: world.day + int(rng, ...RUBBLE_DAYS) });
    fell++;
  }
  return fell;
}

// One of the crown's buildings falls; the crown may rebuild it later. The monument only loses a tier.
function collapse(world: WorldState, k: Work): string {
  if (k === 'monument') {
    world.monument = Math.max(0, (world.monument ?? 1) - 1);
    if (!world.monument) delete world.works!.monument;
    return `${WORKS.monument.name}ถล่มลงมาหนึ่งชั้น`;
  }
  delete world.works![k];
  return `${WORKS[k].name}พังทลาย`;
}

// Some of the newly homeless give up on the town: an unhappy one leaves, and their spouse with them.
function exodus(world: WorldState, rng: Rng, homes: number, how: string): number {
  const gone: string[] = [];
  const pool = living(world).filter((n) => n.age >= 16 && n.job !== 'king' && n.job !== 'noble' && (n.loyalty ?? 50) < 40);
  for (let i = 0; i < homes && pool.length; i++) {
    const n = pool.splice(int(rng, 0, pool.length - 1), 1)[0];
    if (!chance(rng, 0.5)) continue;
    for (const m of [n, world.npcs.find((o) => o.id === n.spouseId && o.alive && o.job !== 'king')]) {
      if (!m) continue;
      m.alive = false;
      m.left = true;
      m.plan = undefined;
      gone.push(m.name);
    }
  }
  if (gone.length) log(world, 'world', `บ้านพังใน${how} ${gone.join(', ')} เก็บข้าวของที่เหลือแล้วทิ้งเมืองไป`);
  return gone.length;
}

// Each month while homes are down: the homeless sleep rough, and in winter the frail among them die of it.
function homeless(world: WorldState, rng: Rng): void {
  const ruins = world.ruins?.length ?? 0;
  if (!ruins) return;
  const poor = living(world).filter((n) => n.age >= 16 && n.job !== 'king').sort((a, b) => a.gold - b.gold).slice(0, ruins * HOMELESS_PER_RUIN);
  for (const n of poor) {
    loyaltyNudge(n, -1);
    if (seasonOf(world.day) === 'winter' && n.age >= 58 && chance(rng, 0.04)) kill(world, n, 'หนาวตายเพราะไม่มีบ้านให้ซุกหัวนอน');
  }
}

// The crown takes farmers on as builders while homes are down, and lets them go once all stand.
function hireBuilders(world: WorldState, rng: Rng): void {
  const builders = living(world).filter((n) => n.job === 'builder');
  // Bread comes first: while grain is dear the builders go back to the fields.
  const want = priceRatio(world, 'grain') >= 1.6 ? 0 : Math.min(MAX_BUILDERS, Math.ceil((world.ruins?.length ?? 0) * BUILDERS_PER_RUIN));
  if (builders.length < want && world.treasury > 100) {
    const farmers = living(world).filter((n) => n.job === 'farmer' && n.age >= 16 && n.questId === undefined);
    for (let i = builders.length; i < want && farmers.length > 6; i++) {
      const n = farmers.splice(int(rng, 0, farmers.length - 1), 1)[0];
      n.formerJob = 'farmer';
      n.job = 'builder';
      n.plan = undefined;
      log(world, 'world', `${n.name}รับจ้างเป็นช่างก่อสร้าง ช่วยสร้างบ้านที่พังขึ้นใหม่`, n.id);
    }
  } else if (!want && (!world.building || priceRatio(world, 'grain') >= 1.6)) {
    for (const n of builders) {
      n.job = n.formerJob ?? 'farmer';
      n.formerJob = undefined;
      n.plan = undefined;
    }
  }
}

// A builder's day: the oldest rubble first, paid by the crown; with none left, the crown's own works.
export function rebuild(world: WorldState, n: { gold: number }, rng: Rng): void {
  const ruin = world.ruins?.length ? world.ruins.reduce((a, b) => (a.until <= b.until ? a : b)) : undefined;
  if (ruin) {
    if (chance(rng, 0.6)) ruin.until--;
    if (world.treasury >= BUILDER_WAGE) {
      world.treasury -= BUILDER_WAGE;
      n.gold += BUILDER_WAGE;
    }
  } else if (world.building && world.building.done > world.day + 1 && chance(rng, 0.15)) world.building.done--;
}

// Where builders stand: in front of a fallen home, else on the crown's site.
export const ruinSite = (world: WorldState) => {
  const r = world.ruins?.[0];
  return r ? { x: r.x + 1, y: r.y + 2 } : undefined;
};

// Everyone's goods and stores are spoiled: a part of every purse goes on mending.
function losses(world: WorldState, share: number): void {
  for (const n of world.npcs) if (n.alive) n.gold = Math.floor(n.gold * (1 - share));
}

// After the blow: a kind ruler (or a republic, or the church) sends relief and the rubble
// clears faster, and most others will too when the treasury is deep; a greedy one sends
// nothing and is hated for it.
function relief(world: WorldState, rng: Rng): void {
  const ruler = king(world);
  if (!ruler) return;
  const people = living(world).filter((n) => n.age >= 16);
  const cost = people.length * RELIEF_EACH;
  const caring = ruler.traits.includes('kind') || world.regime === 'republic' || world.regime === 'theocracy' || (!ruler.traits.includes('greedy') && chance(rng, 0.4));
  const giving = caring && world.treasury - payrollReserve(world) >= cost;
  if (giving) {
    world.treasury -= cost;
    world.alms = (world.alms ?? 0) + Math.floor(cost / 2);
    for (const n of people) {
      n.gold += Math.floor(RELIEF_EACH / 2);
      loyaltyNudge(n, 5);
    }
    for (const r of world.ruins ?? []) r.until = world.day + Math.ceil((r.until - world.day) / 2);
    log(world, 'politics', `กษัตริย์${ruler.name}เปิดท้องพระคลัง ${cost} เหรียญช่วยผู้ประสบภัยและเร่งสร้างบ้านเรือนใหม่`, ruler.id);
  } else {
    const greedy = ruler.traits.includes('greedy');
    for (const n of people) loyaltyNudge(n, greedy ? -6 : -3);
    if (world.crown && greedy) world.crown.unrest += 1;
    log(world, 'politics', `ชาวเมืองที่ไร้บ้านต่างก่นด่า กษัตริย์${ruler.name}ไม่ส่งความช่วยเหลือมาเลย`, ruler.id);
  }
}

function drought(world: WorldState, rng: Rng): void {
  world.weather = { kind: 'drought', until: world.day + int(rng, 90, 150) };
  for (const n of living(world)) loyaltyNudge(n, -3);
  log(world, 'disaster', 'ฝนไม่ตกมาหลายเดือน ภัยแล้งแผ่ไปทั่ว ทุ่งนาแตกระแหง บ่อน้ำแห้งขอด');
}

function deluge(world: WorldState, rng: Rng): void {
  world.weather = { kind: 'deluge', until: world.day + int(rng, 45, 75) };
  log(world, 'disaster', 'ฝนตกไม่หยุดทั้งวันทั้งคืน ทุ่งนาจมน้ำ ข้าวในยุ้งเริ่มขึ้นรา');
  if (chance(rng, known(world, 'levee') ? 0.15 : 0.4)) flood(world, rng);
}

function flood(world: WorldState, rng: Rng): void {
  world.flood = world.day + 30;
  const m = ensureMarket(world);
  const lost = Math.floor(m.stock.grain * (world.works?.granary !== undefined ? 0.2 : 0.4));
  m.stock.grain -= lost;
  world.herd = Math.floor((world.herd ?? 0) * 0.7);
  const banked = known(world, 'levee') ? 0.5 : 1; // the levees hold back the worst of it
  const dead = toll(world, rng, 0.015 * banked, 'จมน้ำตายในน้ำท่วมใหญ่');
  const homes = ruinHomes(world, rng, Math.round(int(rng, 2, 5) * banked));
  const fell = FLOODS.filter((k) => world.works?.[k] !== undefined && chance(rng, 0.2 * banked)).map((k) => collapse(world, k));
  losses(world, 0.15);
  for (const n of living(world)) loyaltyNudge(n, -4);
  const fled = exodus(world, rng, homes, 'น้ำท่วม');
  log(world, 'disaster', `น้ำท่วมใหญ่! แม่น้ำล้นตลิ่งท่วมทุ่งนาและบ้านเรือน ผู้คนจมน้ำตาย ${dead} คน บ้านพัง ${homes} หลัง ข้าวเสียหาย ${lost} กระสอบ${fell.length ? ` ${fell.join(' ')}` : ''}${fled ? ` ทิ้งเมืองไป ${fled} คน` : ''}`);
  relief(world, rng);
}

function quake(world: WorldState, rng: Rng): void {
  const framed = known(world, 'ironframe') ? 0.35 : 1; // iron-framed walls stand
  const dead = toll(world, rng, 0.025 * framed, 'ถูกบ้านถล่มทับตายในแผ่นดินไหว');
  const homes = ruinHomes(world, rng, Math.round(int(rng, 3, 8) * framed));
  const fell = WORK_ORDER.filter((k) => world.works?.[k] !== undefined && chance(rng, 0.3 * framed)).map((k) => collapse(world, k));
  if (world.building && chance(rng, 0.5)) {
    fell.push(`นั่งร้าน${WORKS[world.building.kind].name}ที่กำลังสร้างพังลงมา`);
    world.building = undefined;
  }
  world.treasury = Math.floor(world.treasury * 0.9); // the castle's own cracks to mend
  losses(world, 0.2);
  for (const d of world.dungeons) d.power += 25; // the deep places stir
  for (const n of living(world)) loyaltyNudge(n, -5);
  const fled = exodus(world, rng, homes, 'แผ่นดินไหว');
  log(world, 'disaster', `แผ่นดินไหวครั้งใหญ่! บ้านเรือนพังทลาย ${homes} หลัง มีผู้เสียชีวิต ${dead} คน${fell.length ? ` ${fell.join(' ')}` : ''}${fled ? ` ทิ้งเมืองไป ${fled} คน` : ''}`);
  relief(world, rng);
}

// Each month a drought or the long rains go on: the herd thirsts, the old wilt, grain rots, fever spreads.
function wearOn(world: WorldState, rng: Rng): void {
  const w = weatherOf(world);
  if (w === 'drought') {
    const watered = known(world, 'irrigation');
    world.herd = Math.floor((world.herd ?? 0) * (watered ? 0.93 : 0.85));
    const dead = living(world).filter((n) => n.age >= 58 && chance(rng, watered ? 0.02 : 0.05));
    for (const n of dead) kill(world, n, 'สิ้นใจเพราะความร้อนแล้งที่ยาวนาน');
    for (const n of living(world)) loyaltyNudge(n, -2);
  } else if (w === 'deluge') {
    const m = ensureMarket(world);
    m.stock.grain = Math.floor(m.stock.grain * (world.works?.granary !== undefined ? 0.94 : 0.85));
    if (chance(rng, 0.3)) plagueStrike(world, rng, 0.35, 'ไข้จากน้ำขังระบาดไปทั่วเมือง');
    else if (!flooded(world) && chance(rng, known(world, 'levee') ? 0.07 : 0.2)) flood(world, rng);
  }
}

// Neighbours suffer too: they lose people, gold and soldiers, and some of the homeless come to us.
function realmDisasters(world: WorldState, rng: Rng): void {
  for (const r of world.realms ?? []) {
    if (r.fallen || stricken(world, r) || !chance(rng, REALM_ODDS)) continue;
    const kinds = REALM_KINDS[r.terrain];
    const kind = kinds[int(rng, 0, kinds.length - 1)];
    r.disaster = { kind, until: world.day + REALM_DAYS };
    const lost = Math.round(r.people * (kind === 'drought' ? 0.08 : 0.12));
    r.people = Math.max(50, r.people - lost);
    r.gold = Math.round(r.gold * 0.7);
    r.army = Math.max(3, Math.round(r.army * 0.9));
    const fled = r.relation > -30 ? int(rng, 1, 3) : 0;
    for (let i = 0; i < fled; i++) traveller(world, rng);
    log(world, 'world', `${REALM_TH[kind]}ถล่ม${r.name} ผู้คนล้มตายราว ${lost} คน${fled ? ` ผู้ประสบภัย ${fled} คนหนีมาพึ่งเมืองของเรา` : ''}`);
  }
}

// Our gods' blessing on a stricken neighbour: they don't forget it.
export function aidRealm(world: WorldState, r: Realm): void {
  if (!stricken(world, r)) return;
  r.relation = clamp(r.relation + 10, -100, 100);
  r.disaster!.until = world.day + Math.ceil((r.disaster!.until - world.day) / 2);
  log(world, 'world', `ชาวเมือง${r.name}ที่ประสบ${REALM_TH[r.disaster!.kind]}ต่างซาบซึ้งในพรของเทพเจ้าของเรา`);
}

export function disastersDay(world: WorldState, rng: Rng): void {
  if (world.ruins?.length && world.ruins.some((r) => r.until <= world.day)) world.ruins = world.ruins.filter((r) => r.until > world.day);
  if (world.day % 30 !== DAY) return;
  realmDisasters(world, rng);
  if (occupied(world)) return;
  wearOn(world, rng);
  homeless(world, rng);
  hireBuilders(world, rng);
  if (world.day - (world.disasterAt ?? 0) < GAP) return;
  const season = seasonOf(world.day);
  const calm = !weatherOf(world); // the god's weather holds nature off
  const kinds: [number, (w: WorldState, r: Rng) => void][] = [
    [calm && season === 'summer' ? DROUGHT : 0, drought],
    [calm && (season === 'spring' || season === 'autumn') ? DELUGE : 0, deluge],
    [season === 'spring' && !flooded(world) ? FLOOD * (known(world, 'levee') ? 0.4 : 1) : 0, flood],
    [QUAKE, quake],
  ];
  let roll = next(rng);
  for (const [p, strike] of kinds) {
    if (roll < p) {
      world.disasterAt = world.day;
      if (world.aegis) {
        world.aegis = false;
        log(world, 'bless', 'ฟ้าครืนคราม แผ่นดินสะท้าน แต่โล่ศักดิ์สิทธิ์ของเทพเจ้าปัดเป่าภัยพิบัติให้ผ่านเลยเมืองไป');
        return;
      }
      strike(world, rng);
      return;
    }
    roll -= p;
  }
}

// For tests and the dev console: bring one on now.
export function bringDisaster(world: WorldState, rng: Rng, kind: 'drought' | 'deluge' | 'flood' | 'quake'): void {
  world.disasterAt = world.day;
  ({ drought, deluge, flood, quake })[kind](world, rng);
}

export const ruined = (world: WorldState, x: number, y: number) => !!world.ruins?.some((r) => r.x === x && r.y === y);
