// The faiths of the world beyond the walls. Each neighbouring realm keeps its own god, by its
// land, until enough of its people take up ours. Faith spreads along the trade roads while the
// church stands tall, and faster with a missionary: a priest the god sends out, who may come home
// with converts or die a martyr in a hostile land. A realm that takes up our god prays to it,
// warms to us, and is slower to make war on us; under the god's holy war, a devout ruler marches
// on those who worship other gods, and a war won converts the vanquished.
import { chance, type Rng } from './rng';
import { clamp, kill, log, makePlan, perkLevel, tenetOn } from './core';
import { charterOf, faithLawOf } from './charter';
import { churchOf, headOf } from './church';
import { believer, pietyOf } from './religion';
import { AWAY, type Npc, type Realm, type Terrain, type WorldState } from './types';

const DAY = 12; // day of the month the faith spreads abroad
export const MISSION_COST = 25;
const MISSION_DAYS = 120;
const TURN = 60; // share of a realm's people who must believe before its court takes up the god
const LAPSE = 25; // and below which a converted realm drifts back to its old god
const ABROAD_PRAYER = 0.0001; // faith a day for each of a realm's people who believes

export const FOREIGN_GODS: Record<Terrain, string> = { desert: 'สุริยเทพ', coast: 'เทพีแห่งท้องทะเล', mountain: 'เทพแห่งขุนเขา', forest: 'มารดาแห่งพงไพร' };
export const sharesFaith = (r: Realm) => r.faith === 'god';
export const realmFaithName = (r: Realm) => (sharesFaith(r) ? 'เทพเจ้าองค์เดียวกับเรา' : FOREIGN_GODS[r.terrain]);
export const missionCost = (world: WorldState) => Math.max(1, Math.round(MISSION_COST * (1 - 0.1 * perkLevel(world, 'grace'))));
const standing = (world: WorldState) => (world.realms ?? []).filter((r) => !r.fallen);

// A priest who can be spared: never the head of the church, never the last one at home.
export function missionary(world: WorldState): Npc | undefined {
  const priests = world.npcs.filter((n) => n.alive && n.age >= 16 && n.job === 'priest' && believer(n) && n.inside === undefined && n.questId === undefined);
  if (priests.length < 2) return undefined;
  return priests.filter((n) => n.id !== headOf(world)?.id).sort((a, b) => pietyOf(b) - pietyOf(a))[0];
}

// Why a mission to this realm can't go now, if it can't.
export function missionBlocked(world: WorldState, r: Realm): string | undefined {
  if (r.fallen) return 'จอมมารยึดไปแล้ว';
  if (r.war) return 'กำลังทำสงครามกัน';
  if (r.mission) return 'มีมิชชันนารีอยู่ที่นั่นแล้ว';
  if (sharesFaith(r) && (r.converts ?? 0) >= 100) return 'ทั้งแคว้นนับถือเทพของเราแล้ว';
  if (!missionary(world)) return 'นักบวชในเมืองมีไม่พอ (ต้องเหลือไว้อย่างน้อยหนึ่งคน)';
  return undefined;
}

// The god's dream sends a priest out to preach.
export function sendMission(world: WorldState, realmId: number): boolean {
  const r = world.realms?.find((x) => x.id === realmId);
  if (!r || missionBlocked(world, r)) return false;
  const priest = missionary(world)!;
  r.mission = { priestId: priest.id, until: world.day + MISSION_DAYS };
  priest.inside = AWAY;
  priest.plan = makePlan('mission', { x: priest.x, y: priest.y }, MISSION_DAYS, realmId);
  log(world, 'dream', `${priest.name}ฝันว่าเทพเจ้าให้ไปเผยแผ่ศาสนาที่${r.name} จึงออกเดินทางในเช้าวันรุ่งขึ้น`, priest.id);
  return true;
}

// The prayers of the believers abroad.
export const abroadPrayers = (world: WorldState) => standing(world).reduce((s, r) => s + (sharesFaith(r) ? (r.people * (r.converts ?? 0)) / 100 : 0), 0) * ABROAD_PRAYER;

export function missionsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== DAY) return;
  const church = churchOf(world).influence;
  const law = faithLawOf(charterOf(world));
  for (const r of standing(world)) {
    if (sharesFaith(r)) r.relation = clamp(r.relation + 1, -100, 100); // brothers in faith
    else if (law === 'persecute') r.relation = clamp(r.relation - 0.5, -100, 100); // they hear how we treat their kind
    // Along the trade roads, as the church stands tall; set back by hatred.
    const trade = r.treaty || (r.trades ?? 0) >= 5 ? 0.6 : 0.15;
    let gain = trade * (church / 100) - (r.relation <= -40 ? 1 : 0);
    if (r.mission) gain += preach(world, r, rng);
    r.converts = clamp((r.converts ?? 0) + gain, 0, 100);
    turn(world, r, rng);
  }
}

// A month of the missionary's preaching, and the end of the mission: home, or martyrdom.
function preach(world: WorldState, r: Realm, rng: Rng): number {
  const m = r.mission!;
  const priest = world.npcs.find((n) => n.id === m.priestId);
  if (!priest?.alive) {
    r.mission = undefined;
    return 0;
  }
  if (r.relation <= -30 && chance(rng, 0.15)) {
    r.mission = undefined;
    priest.inside = undefined;
    kill(world, priest, `ถูกประหารระหว่างเผยแผ่ศาสนาที่${r.name}`);
    log(world, 'death', `ชาวเมืองไว้ทุกข์ให้${priest.name}ผู้พลีชีพเพื่อศรัทธา`, priest.id);
    for (const n of world.npcs) if (n.alive && believer(n)) n.piety = clamp(pietyOf(n) + 5, 0, 100);
    r.relation = clamp(r.relation - 10, -100, 100);
    return 0;
  }
  const won = 4 + Math.min(6, priest.level);
  if (world.day >= m.until) {
    r.mission = undefined;
    priest.inside = undefined;
    priest.plan = undefined;
    priest.level++;
    log(world, 'world', `${priest.name}กลับจากการเผยแผ่ศาสนาที่${r.name} ชาวที่นั่นนับถือเทพของเรา ${Math.round((r.converts ?? 0) + won)}%`, priest.id);
  }
  return won;
}

// A realm whose people have mostly come to the god takes it up; one whose believers dwindle lapses.
function turn(world: WorldState, r: Realm, rng: Rng): void {
  const c = r.converts ?? 0;
  if (!sharesFaith(r) && c >= TURN && chance(rng, 0.25)) {
    r.faith = 'god';
    r.relation = clamp(r.relation + 15, -100, 100);
    log(world, 'bless', `${r.ruler.name}แห่ง${r.name}ประกาศนับถือเทพเจ้าของเรา ทิ้ง${FOREIGN_GODS[r.terrain]}ที่บูชามาแต่โบราณ`);
  } else if (sharesFaith(r) && c < LAPSE) {
    r.faith = undefined;
    log(world, 'world', `${r.name}หวนกลับไปบูชา${FOREIGN_GODS[r.terrain]}ดังเดิม`);
  }
}

// A war won against a realm of another god, fought as the god's war, turns many of its people.
export function warConverts(world: WorldState, r: Realm): void {
  if (sharesFaith(r) || !tenetOn(world, 'holywar')) return;
  r.converts = clamp((r.converts ?? 0) + 30, 0, 100);
  log(world, 'world', `นักบวชตามกองทัพเข้าไปใน${r.name} ชาวที่นั่นหันมานับถือเทพของเรา ${Math.round(r.converts)}%`);
}

// Under the god's holy war, a devout ruler's grievance against a realm of another god.
export const holyTarget = (world: WorldState, r: Realm, ruler?: Npc) =>
  !!ruler && tenetOn(world, 'holywar') && !sharesFaith(r) && pietyOf(ruler) >= 60 && r.relation < -10;
