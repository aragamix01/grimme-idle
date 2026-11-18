// What each kind of rule breeds of its own, once a month. A republic's leader may rig a vote or
// take emergency powers with no emergency; a junta promises elections it may never hold, purges
// its critics, and fears its own colonels; a theocracy's zealots turn on the unbelievers and its
// sect may rise; the merchants' council throws out a chairman a richer man outweighs.
import { chance, pick, type Rng } from './rng';
import { clamp, kill, log, occupied } from './core';
import { enthrone, king } from './society';
import { approval, crownPower, ensureCrown, loyaltyOf } from './politics';
import { literate } from './learning';
import { amend, charterOf } from './charter';
import { proclaimRepublic } from './republic';
import { legend } from './quests';
import { sectMembers, sectOf } from './church';
import { rally } from './movements';
import { getTie } from './ties';
import { houses } from './tradehouses';
import { levelOf } from './market';
import type { Good, Guild, Npc, WorldState } from './types';

const EVENT_DAY = 16; // day of the month a regime's own trouble may come
const PROMISE = 365 * 2; // how long a junta's promise of elections holds off the street

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.job !== 'king' && n.inside === undefined);
const has = (n: Npc, t: Npc['traits'][number]) => n.traits.includes(t);
const ambitious = (n: Npc) => has(n, 'greedy') || has(n, 'vengeful');
const soldiers = (world: WorldState) => adults(world).filter((n) => n.job === 'soldier' || n.knight);
const avg = (list: Npc[]) => (list.length ? list.reduce((s, n) => s + loyaltyOf(n), 0) / list.length : 50);

export function regimeEventsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== EVENT_DAY || occupied(world)) return;
  const ruler = king(world);
  if (!ruler) return;
  switch (world.regime ?? 'monarchy') {
    case 'republic':
      return void selfCoup(world, ruler, rng);
    case 'junta':
      if (!counterCoup(world, ruler, rng) && !promise(world, ruler, rng)) purge(world, ruler, rng);
      return;
    case 'theocracy':
      if (!sectRising(world, rng)) zealots(world, rng);
      return;
    case 'oligarchy':
      return void ousted(world, ruler, rng);
  }
}

// A republic's leader, strong and grasping and losing the people, suspends the republic in the
// name of order: emergency powers with no emergency, and no elections while they hold.
function selfCoup(world: WorldState, ruler: Npc, rng: Rng): boolean {
  const c = charterOf(world);
  if (c.emergency || !ambitious(ruler) || crownPower(world).total < 55 || approval(world) >= 45 || !chance(rng, 0.04)) return false;
  amend(world, { emergency: true }, `ผู้นำสภา${ruler.name}อ้างว่าบ้านเมืองไม่สงบ ประกาศภาวะฉุกเฉินและงดการเลือกตั้งไม่มีกำหนด`);
  for (const n of adults(world)) if (literate(n)) n.loyalty = clamp(loyaltyOf(n) - 10, 0, 100);
  ensureCrown(world).unrest += 2; // the street will remember it
  return true;
}

// The colonels turn on the general: an ambitious officer with a sour army takes the junta over.
function counterCoup(world: WorldState, ruler: Npc, rng: Rng): boolean {
  const army = soldiers(world);
  const colonel = army.filter((n) => ambitious(n) || has(n, 'brave')).sort((a, b) => b.level + (b.gear ?? 0) - (a.level + (a.gear ?? 0)))[0];
  if (!colonel || army.length < 6 || avg(army) >= 40 || world.day - (world.crown?.since ?? 0) < 365 || !chance(rng, 0.08)) return false;
  log(world, 'politics', `นายทหาร${colonel.name}ไม่พอใจจอมทัพ${ruler.name} นำทหารยึดกองบัญชาการซ้อน!`, colonel.id);
  if (chance(rng, 0.5)) kill(world, ruler, 'ถูกนายทหารของตัวเองยิงในกองบัญชาการ');
  else {
    ruler.job = 'soldier';
    ruler.formerJob = undefined;
  }
  colonel.formerJob = colonel.job;
  enthrone(world, colonel, 'รัฐประหารซ้อน', true);
  legend(world, `${colonel.name} รัฐประหารซ้อนในคณะทหาร`, colonel.id);
  return true;
}

// Under pressure the general promises to hand power back. When the promise falls due they keep it
// (a kind or loyal general, or a town too angry to refuse) or put it off, and the street knows.
function promise(world: WorldState, ruler: Npc, rng: Rng): boolean {
  const crown = ensureCrown(world);
  const p = crown.promise;
  if (p !== undefined && world.day >= p) {
    crown.promise = undefined;
    if (has(ruler, 'kind') || has(ruler, 'loyal') || approval(world) < 30 || chance(rng, 0.3)) {
      log(world, 'politics', `จอมทัพ${ruler.name}รักษาสัญญา คืนอำนาจให้ประชาชนเลือกผู้นำเอง`, ruler.id);
      ruler.job = ruler.formerJob ?? 'soldier';
      ruler.formerJob = undefined;
      const voice = adults(world).filter((n) => literate(n) && n.morality > 0).sort((a, b) => b.level - a.level)[0] ?? ruler;
      proclaimRepublic(world, voice, rng, `คณะทหารคืนอำนาจ ${voice.name}ประกาศตั้งสาธารณรัฐ ชาวเมืองจะได้เลือกผู้นำของตนเอง`);
      return true;
    }
    crown.unrest += 3;
    for (const n of adults(world)) if (n.job !== 'soldier') n.loyalty = clamp(loyaltyOf(n) - 6, 0, 100);
    log(world, 'politics', `จอมทัพ${ruler.name}เลื่อนการเลือกตั้งออกไปอีก อ้างว่าบ้านเมืองยังไม่พร้อม ชาวเมืองโกรธเกรี้ยว`, ruler.id);
    return true;
  }
  if (p !== undefined || ((world.movement?.stage ?? 0) < 1 && approval(world) >= 40) || !chance(rng, 0.3)) return false;
  crown.promise = world.day + PROMISE;
  if (world.movement) world.movement.anger = clamp(world.movement.anger - 25, 0, 100);
  for (const n of adults(world)) n.loyalty = clamp(loyaltyOf(n) + 5, 0, 100);
  log(world, 'politics', `จอมทัพ${ruler.name}ให้สัญญาว่าจะคืนอำนาจและจัดการเลือกตั้งภายในสองปี`, ruler.id);
  return true;
}

// A vengeful general rounds up the readers who speak against them.
function purge(world: WorldState, ruler: Npc, rng: Rng): boolean {
  if (!has(ruler, 'vengeful') && !has(ruler, 'greedy')) return false;
  const critics = adults(world).filter((n) => literate(n) && loyaltyOf(n) < 30 && n.job !== 'soldier' && (n.jailedUntil ?? 0) <= world.day);
  if (critics.length < 3 || !chance(rng, 0.15)) return false;
  const taken = critics.sort((a, b) => loyaltyOf(a) - loyaltyOf(b)).slice(0, 3);
  for (const n of taken) {
    n.jailedUntil = world.day + 180;
    n.marcher = undefined;
  }
  for (const n of adults(world)) if (taken.some((t) => getTie(world, t.id, n.id) >= 15)) n.loyalty = clamp(loyaltyOf(n) - 8, 0, 100);
  ensureCrown(world).unrest += 1;
  log(world, 'politics', `จอมทัพ${ruler.name}สั่งกวาดล้างผู้เห็นต่าง จับ${taken.map((n) => n.name).join(', ')}ขังคุกข้อหาปลุกปั่น`, ruler.id);
  return true;
}

// Under the priests' rule a big enough sect takes to the street for its own way to the god.
function sectRising(world: WorldState, rng: Rng): boolean {
  const sect = sectOf(world);
  const folk = sectMembers(world).filter((n) => n.inside === undefined && n.job !== 'soldier');
  const leader = sect && world.npcs.find((n) => n.id === sect.leaderId && n.alive);
  if (!sect || !leader || folk.length < 6 || world.movement || !chance(rng, 0.15)) return false;
  return rally(world, 'faith', folk, leader, 2, rng);
}

// The devout turn on the unbelievers: a mob at a doubter's door. The pulpit's fervour, the town's shame.
function zealots(world: WorldState, rng: Rng): boolean {
  const devout = adults(world).filter((n) => n.creed === 'god' && (n.piety ?? 50) >= 80);
  const doubters = adults(world).filter((n) => n.creed === 'none' || n.creed === 'spirits');
  if (devout.length < 5 || !doubters.length || !chance(rng, 0.06)) return false;
  const victim = pick(rng, doubters);
  kill(world, victim, 'ถูกฝูงชนผู้คลั่งศาสนารุมทำร้ายจนตาย ข้อหาไม่นับถือเทพเจ้า');
  for (const n of doubters) n.loyalty = clamp(loyaltyOf(n) - 10, 0, 100);
  ensureCrown(world).unrest += 1;
  return true;
}

// The merchants' council votes out a chairman whom a richer trade house outweighs. A house's weight
// is its chest and its warehouse as well as its head's own purse; with no trade houses, the
// richest merchant's purse alone.
function ousted(world: WorldState, ruler: Npc, rng: Rng): boolean {
  const lvl = levelOf(world);
  const stock = (g: Guild) => Object.entries(g.stock ?? {}).reduce((s, [good, q]) => s + (q ?? 0) * (world.market?.price[good as Good] ?? 0), 0);
  const weight = (n: Npc) => {
    const g = houses(world).find((h) => h.leaderId === n.id);
    return n.gold + (g ? g.treasury + stock(g) : 0);
  };
  const heads = houses(world).map((g) => adults(world).find((n) => n.id === g.leaderId)).filter((n): n is Npc => !!n);
  const pool = heads.length ? heads : adults(world).filter((n) => n.job === 'merchant' || n.job === 'noble');
  const rival = pool.filter((n) => n !== ruler).sort((a, b) => weight(b) - weight(a))[0];
  if (!rival || weight(rival) < weight(ruler) * 1.5 || weight(rival) < 300 * lvl || world.day - (world.crown?.since ?? 0) < 365 || !chance(rng, 0.1)) return false;
  const house = houses(world).find((h) => h.leaderId === rival.id);
  log(world, 'politics', `สภาพ่อค้าลงมติปลดประธาน${ruler.name} ${rival.name}${house ? `แห่ง${house.name}` : ''}ผู้มั่งคั่งกว่าขึ้นแทน`, rival.id);
  ruler.job = ruler.formerJob ?? 'merchant';
  ruler.formerJob = undefined;
  rival.formerJob = rival.job;
  enthrone(world, rival, 'สภาพ่อค้าลงมติเลือก', true);
  return true;
}
