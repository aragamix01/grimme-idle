// Events that cross borders: plague carried along the trade roads, neighbours warring
// among themselves and sending refugees our way, the demon lord swallowing whole kingdoms,
// and the god's miracles worked on other realms.
import { chance, int, pick, type Rng } from './rng';
import { clamp, kill, log, perkLevel, known } from './core';
import { draughts } from './learning';
import { legend } from './quests';
import { traveller } from './world';
import { aidRealm } from './disasters';
import type { Realm, RealmMiracle, WorldState } from './types';

const PLAGUE_DAYS = 120;
const REALM_MIRACLE_GAP = 30;
export const REALM_MIRACLE_COST: Record<RealmMiracle, number> = { bless: 10, blight: 12 };
const hawk = (r: Realm) => r.ruler.traits.some((t) => t === 'brave' || t === 'greedy' || t === 'vengeful');
export const plagued = (world: WorldState, r: Realm) => (r.plagueUntil ?? 0) > world.day;
const standing = (world: WorldState) => (world.realms ?? []).filter((r) => !r.fallen);

// A plague strikes the town: the old and the young suffer most; priests ease it.
export function plagueStrike(world: WorldState, rng: Rng, severity: number, how: string): number {
  const priests = world.npcs.filter((n) => n.alive && n.age >= 16 && n.job === 'priest').length;
  const hall = world.works?.cathedral !== undefined; // the cathedral's infirmary
  const care = (1 - Math.min(hall ? 0.65 : 0.5, priests * (hall ? 0.15 : 0.1))) * (known(world, 'medicine') ? 0.6 : 1) * (draughts(world) ? 0.85 : 1);
  let dead = 0;
  for (const n of world.npcs) {
    if (!n.alive || n.inside !== undefined) continue;
    const risk = (n.age >= 58 ? 0.3 : n.age < 16 ? 0.04 : 0.08) * care * severity;
    if (chance(rng, risk)) {
      kill(world, n, 'สิ้นใจด้วยโรคระบาด');
      dead++;
    }
  }
  log(world, 'disaster', `${how} คร่าชีวิตไป ${dead} คน${priests ? ` นักบวช ${priests} คนช่วยรักษาผู้ป่วย` : ''}`);
  return dead;
}

// A caravan home from a plague-stricken realm may bring the sickness with it.
export function caravanHome(world: WorldState, from: Realm | undefined, rng: Rng): void {
  if (from && plagued(world, from) && chance(rng, 0.35)) plagueStrike(world, rng, 0.5, `โรคระบาดจาก${from.name}ติดมากับกองคาราวาน`);
}

export function worldEvents(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== 13) return;
  const realms = standing(world);
  // Plague breaks out now and then, wears down a realm, and spreads to its neighbours.
  for (const r of realms) {
    if (plagued(world, r)) {
      r.people = Math.round(r.people * 0.95);
      r.army = Math.max(3, Math.round(r.army * 0.95));
      for (const o of realms) if (o !== r && !plagued(world, o) && chance(rng, 0.06)) catchPlague(world, o);
    } else if (chance(rng, 0.006)) catchPlague(world, r);
  }
  // Two warlike neighbours fight; the loser's people flee, some to us.
  const hawks = realms.filter((r) => hawk(r) && !r.war);
  if (hawks.length >= 2 && chance(rng, 0.03)) {
    const a = pick(rng, hawks);
    const b = pick(rng, realms.filter((r) => r !== a && !r.war));
    if (b) skirmish(world, a, b, rng);
  }
  // The demon lord's armies swallow neighbouring kingdoms while it walks.
  if (world.demon && realms.length && chance(rng, world.demon.stage === 'occupied' ? 0.25 : 0.12)) {
    const r = pick(rng, realms);
    r.fallen = true;
    r.war = undefined;
    r.pact = undefined;
    r.army = 0;
    world.demon.power = Math.min(180, world.demon.power + 10);
    log(world, 'cult', `กองทัพของจอมมาร${world.demon.name}บุกยึด${r.name} ราชวงศ์${r.ruler.name}ล่มสลาย`);
  }
}

function catchPlague(world: WorldState, r: Realm): void {
  r.plagueUntil = world.day + PLAGUE_DAYS;
  log(world, 'world', `โรคระบาดแพร่ไปทั่ว${r.name} พ่อค้าพากันเลี่ยงเส้นทางนั้น`);
}

function skirmish(world: WorldState, a: Realm, b: Realm, rng: Rng): void {
  const [win, lose] = chance(rng, a.army / (a.army + b.army)) ? [a, b] : [b, a];
  const spoils = Math.round(lose.gold * 0.3);
  lose.gold -= spoils;
  win.gold += spoils;
  lose.army = Math.max(3, Math.round(lose.army * 0.7));
  win.army = Math.max(3, Math.round(win.army * 0.9));
  lose.people = Math.round(lose.people * 0.85);
  const fled = int(rng, 2, 4);
  for (let i = 0; i < fled; i++) traveller(world, rng);
  log(world, 'world', `${win.name}รบชนะ${lose.name} ผู้ลี้ภัย ${fled} คนหนีภัยสงครามมาถึงเมืองของเรา`);
}

// The demon lord is slain: every kingdom it took is free again, and grateful.
export function liberateRealms(world: WorldState, hero: string): void {
  const freed = (world.realms ?? []).filter((r) => r.fallen);
  if (!freed.length) return;
  for (const r of freed) {
    r.fallen = undefined;
    r.army = 10;
    r.relation = clamp(r.relation + 30, -100, 100);
  }
  log(world, 'world', `${freed.map((r) => r.name).join(', ')} ได้รับอิสรภาพคืนจากจอมมาร ต่างสรรเสริญผู้กล้า${hero}`);
  legend(world, `ผู้กล้า${hero}ปลดปล่อย${freed.length} อาณาจักรจากจอมมาร`);
}

// The god's hand on a neighbour: a blessing they credit to our gods, or blight on their fields.
export const realmMiracleCost = (world: WorldState, k: RealmMiracle) => Math.max(1, Math.round(REALM_MIRACLE_COST[k] * (1 - 0.1 * perkLevel(world, 'grace'))));
export const realmMiracleReady = (world: WorldState, r: Realm) => world.day - (r.miracleAt ?? -REALM_MIRACLE_GAP) >= REALM_MIRACLE_GAP;

export function realmMiracle(world: WorldState, realmId: number, kind: RealmMiracle): boolean {
  const r = world.realms?.find((x) => x.id === realmId && !x.fallen);
  if (!r || !realmMiracleReady(world, r)) return false;
  r.miracleAt = world.day;
  if (kind === 'bless') {
    aidRealm(world, r);
    r.gold += 150;
    r.people = Math.round(r.people * 1.05);
    r.relation = clamp(r.relation + 10, -100, 100);
    log(world, 'bless', `เทพเจ้าบันดาลพรให้${r.name} ชาวเมืองนั้นต่างเชื่อว่าเทพของเราคุ้มครองพวกเขา`);
  } else {
    r.gold = Math.round(r.gold * 0.7);
    r.people = Math.round(r.people * 0.92);
    r.army = Math.max(3, Math.round(r.army * 0.9));
    log(world, 'curse', `โรคพืชระบาดทั่วทุ่งนาของ${r.name} ยุ้งฉางว่างเปล่า`);
  }
  return true;
}
