// The town beyond adventuring: a king with nobles and soldiers, and the trades and
// pleasures people spend their money on. Who holds which rank is decided here.
import { chance, next, pick, type Rng } from './rng';
import { log, occupied } from './core';
import { addTie } from './ties';
import { buy, ensureMarket, sell } from './market';
import { PLACES, type Spot } from './places';
import { JOB_TH } from './names';
import { TAX_RATE, ensureCrown, loyaltyOf } from './politics';
import type { Job, Npc, WorldState } from './types';

// How newcomers and grown children spread across the trades. The king and nobles are
// never picked: they are crowned and titled.
const JOB_WEIGHTS: [Job, number][] = [
  ['farmer', 14],
  ['herder', 5],
  ['hunter', 3],
  ['swordsman', 12],
  ['mage', 8],
  ['merchant', 8],
  ['soldier', 10],
  ['thief', 6],
  ['blacksmith', 4],
  ['innkeeper', 3],
  ['courtesan', 3],
  ['priest', 3],
];
export const COMMON_JOBS: readonly Job[] = JOB_WEIGHTS.map(([j]) => j);
export const isGentry = (n: Npc) => n.job === 'king' || n.job === 'noble';

const MAX_NOBLES = 4;
const MIN_NOBLES = 2;
const TITLE_GOLD = 80; // a commoner this rich may be raised to the nobility
const COURT_EVERY = 30; // days between the crown's appointments
const PAY_EVERY = 10; // days between soldiers' pay
const SALARY = 5;
const LEVY_DAY = 15; // day of each month the crown collects its tax
const LEVY_FLOOR = 10;
const TRIBUTE = 0.1; // nobles pay this share of their wealth above TRIBUTE_FLOOR instead
const TRIBUTE_FLOOR = 100;
const STIPEND = 5; // the king's own pay, each payday
const KNIGHT_PAY = 8;
const ARMY_TARGET = 8; // the crown recruits up to this many while it can pay them
const DESERT_AFTER = 3; // missed paydays before a soldier walks away
const LEISURE_EVERY = 5; // days between evenings out
const ALE = 2;
const COMPANY = 6;
const RENT = 0.2; // share of a harvest a noble landlord takes
const PATROL_REACH = 4; // tiles a soldier on duty can see

// With a world given, soldiers are only picked while the crown can afford their pay.
export function pickJob(rng: Rng, world?: WorldState): Job {
  const army = world ? living(world, 'soldier').length : 0;
  const affordable = !world || (!occupied(world) && army < ARMY_TARGET && world.treasury >= SALARY * 3 * (army + 1));
  const weights = JOB_WEIGHTS.filter(([j]) => affordable || j !== 'soldier');
  let r = next(rng) * weights.reduce((s, [, w]) => s + w, 0);
  for (const [job, w] of weights) if ((r -= w) < 0) return job;
  return 'farmer';
}

const living = (world: WorldState, job: Job) => world.npcs.filter((n) => n.alive && n.job === job && n.age >= 16);
export const king = (world: WorldState) => world.npcs.find((n) => n.id === world.kingId && n.alive && n.job === 'king');

// Soldiers' posts: the three gates, the square and the barracks door.
const POSTS: Spot[] = [
  { x: 1, y: 9 },
  { x: 25, y: 9 },
  { x: 13, y: 16 },
  PLACES.square,
  PLACES.barracks,
];
export const patrolPost = (rng: Rng) => pick(rng, POSTS);

// A grown child of the gentry is gentry too, while there is room at court.
export function inheritedJob(world: WorldState, parents: Npc[], rng: Rng): Job {
  if (parents.some(isGentry) && living(world, 'noble').length < MAX_NOBLES) return 'noble';
  const trade = parents.filter((p) => !isGentry(p));
  // Children take after a parent's trade, though few follow a mother into the pleasure house.
  const followable = trade.filter((p) => p.job !== 'courtesan');
  return followable.length && chance(rng, 0.6) ? pick(rng, followable).job : pickJob(rng, world);
}

// Keep a king on the throne and enough nobles at court. Runs every day (a dead king is
// replaced at once) but only titles new nobles once a month.
export function holdCourt(world: WorldState, rng: Rng): void {
  let crowned = king(world);
  // Under the demon lord there is no throne to fill, only trades to keep going.
  if (occupied(world)) {
    if (world.day % COURT_EVERY === 0) fillTrades(world, rng);
    return;
  }
  if (!crowned) {
    const old = world.npcs.find((n) => n.id === world.kingId);
    const adults = world.npcs.filter((n) => n.alive && n.age >= 16 && n.questId === undefined && n.inside === undefined);
    const heir = adults.filter((n) => old && n.parentIds?.includes(old.id)).sort((a, b) => b.age - a.age)[0];
    const lord = adults.filter((n) => n.job === 'noble').sort((a, b) => b.gold - a.gold)[0];
    const elder = adults.filter((n) => n.morality > 0).sort((a, b) => b.age - a.age)[0];
    const next = heir ?? lord ?? elder;
    if (!next) return;
    const how = heir ? `สืบราชสมบัติต่อจาก${old!.name}` : lord ? 'ได้รับเลือกจากเหล่าขุนนาง' : 'ได้รับเลือกจากชาวเมือง';
    enthrone(world, next, how);
    crowned = next;
  }
  if (world.day % COURT_EVERY !== 0) return;
  fillTrades(world, rng);
  if (living(world, 'noble').length >= MIN_NOBLES) return;
  const candidate = world.npcs
    .filter((n) => n.alive && n.age >= 16 && n.gold >= TITLE_GOLD && ['merchant', 'farmer', 'herder', 'blacksmith', 'innkeeper'].includes(n.job))
    .sort((a, b) => b.gold - a.gold)[0];
  if (!candidate || !chance(rng, 0.5)) return;
  leaveTrade(candidate);
  candidate.job = 'noble';
  candidate.plan = undefined;
  candidate.loyalty = Math.max(loyaltyOf(candidate), 70);
  addTie(world, crowned, candidate, 15);
  log(world, 'politics', `กษัตริย์${crowned.name}พระราชทานบรรดาศักดิ์ขุนนางให้${candidate.name}`, candidate.id);
}

// Put someone on the throne. A new reign gives everyone a fresh start: loyalty drifts
// back toward the middle, whatever they thought of the last king.
export function enthrone(world: WorldState, n: Npc, how: string): void {
  leaveTrade(n);
  n.job = 'king';
  n.knight = undefined;
  n.plan = undefined;
  world.kingId = n.id;
  const crown = ensureCrown(world);
  crown.since = world.day;
  crown.unrest = 0;
  for (const o of world.npcs) if (o.alive && o !== n) o.loyalty = Math.round(loyaltyOf(o) * 0.6 + 50 * 0.4);
  log(world, 'politics', `${n.name} ขึ้นครองบัลลังก์เป็นกษัตริย์ (${how})`, n.id);
}

// A trade the town is short of is an opening: a farmer, or a merchant if the shop can spare one,
// takes it up. The shop needs at least two hands to keep the stall and run the caravans.
const ESSENTIAL: [Job, number][] = [['merchant', 2], ['herder', 2], ['hunter', 1], ['blacksmith', 1], ['innkeeper', 1], ['priest', 1], ['courtesan', 1]];
function fillTrades(world: WorldState, rng: Rng): void {
  for (const [job, need] of ESSENTIAL) {
    if (living(world, job).length >= need) continue;
    const merchants = living(world, 'merchant').length;
    const pool = world.npcs.filter(
      (n) => n.alive && n.age >= 16 && n.questId === undefined && n.inside === undefined && (n.job === 'farmer' || (n.job === 'merchant' && job !== 'merchant' && merchants > 2)),
    );
    if (pool.length < 6) continue;
    const n = pick(rng, pool);
    const was = n.job;
    leaveTrade(n);
    n.job = job;
    n.plan = undefined;
    log(world, 'world', `${n.name} เลิกเป็น${JOB_TH[was]} หันมาเป็น${JOB_TH[job]}เพราะในเมืองยังไม่มีใครทำ`, n.id);
  }
}

export function leaveTrade(n: Npc): void {
  n.rank = undefined;
  n.renown = undefined;
  n.guildId = undefined;
  n.retired = undefined;
}

// The crown's monthly tax on everyone's savings; nobles pay tribute at their own rate.
export function levy(world: WorldState): void {
  if (world.day % 30 !== LEVY_DAY) return;
  for (const n of world.npcs) {
    if (!n.alive || n.age < 16 || n.job === 'king') continue;
    const [rate, floor] = n.job === 'noble' ? [TRIBUTE, TRIBUTE_FLOOR] : [TAX_RATE[world.crown?.tax ?? 'normal'], LEVY_FLOOR];
    if (n.gold <= floor) continue;
    const due = Math.floor((n.gold - floor) * rate);
    n.gold -= due;
    world.treasury += due;
  }
}

// Payday at the barracks. Unpaid soldiers grumble, then desert; the crown also kits
// out a bare-handed soldier when it can spare the gold.
export function payroll(world: WorldState): void {
  if (world.day % PAY_EVERY !== 0) return;
  // The king lives off the treasury: a share of it, more when it's full.
  const crowned = king(world);
  const stipend = Math.min(100, Math.max(STIPEND, Math.floor(world.treasury * 0.01)));
  if (crowned && world.treasury >= stipend) {
    world.treasury -= stipend;
    crowned.gold += stipend;
  }
  for (const n of world.npcs) {
    if (!n.alive || !n.knight || world.treasury < KNIGHT_PAY) continue;
    world.treasury -= KNIGHT_PAY;
    n.gold += KNIGHT_PAY;
    n.loyalty = Math.min(100, loyaltyOf(n) + 2);
  }
  for (const s of living(world, 'soldier')) {
    if (world.treasury >= SALARY) {
      world.treasury -= SALARY;
      s.gold += SALARY;
      s.unpaid = 0;
      s.loyalty = Math.min(100, loyaltyOf(s) + 3);
      if (loyaltyOf(s) >= 10) continue;
    } else {
      s.unpaid = (s.unpaid ?? 0) + 1;
      s.loyalty = Math.max(0, loyaltyOf(s) - 8);
      if (s.unpaid < DESERT_AFTER && loyaltyOf(s) >= 10) continue;
    }
    const why = (s.unpaid ?? 0) >= DESERT_AFTER ? 'เพราะไม่ได้รับเงินเดือน' : 'เพราะหมดศรัทธาในกษัตริย์';
    s.unpaid = 0;
    s.job = s.morality < 0 ? 'thief' : 'farmer';
    s.plan = undefined;
    log(world, 'politics', `ทหาร${s.name}หนีทัพ${why} แล้วไปเป็น${s.job === 'thief' ? 'โจร' : 'ชาวนา'}`, s.id);
  }
  recruit(world);
  const m = ensureMarket(world);
  const bare = living(world, 'soldier').find((s) => !s.gear);
  if (bare && m.stock.gear >= 1 && world.treasury >= m.price.gear + 60) {
    world.treasury -= m.price.gear;
    m.stock.gear -= 1;
    m.till += m.price.gear;
    bare.gear = 1;
  }
}

// With gold to spare the crown takes on a poor, able commoner, the loyal and brave first.
function recruit(world: WorldState): void {
  const army = living(world, 'soldier').length;
  // In wartime the crown raises more men while it can pay them.
  if (occupied(world) || army >= ARMY_TARGET + (world.war ? 4 : 0) || world.treasury < payrollReserve(world) + SALARY * 6 + 50) return;
  const keen = (n: Npc) => (n.traits.includes('loyal') ? 2 : 0) + (n.traits.includes('brave') ? 1 : 0) - (n.traits.includes('coward') ? 3 : 0);
  // Only honest trades with hands to spare: the crown won't enlist outlaws, and never takes a trade's last two.
  const spare = (job: Job) => ['farmer', 'herder', 'hunter', 'merchant', 'blacksmith', 'innkeeper'].includes(job) && living(world, job).length > 2;
  const r = world.npcs
    .filter((n) => n.alive && n.age >= 16 && n.age < 45 && spare(n.job) && n.rank === undefined && n.questId === undefined && n.inside === undefined && n.gold < 30)
    .sort((a, b) => keen(b) - keen(a) || a.gold - b.gold)[0];
  if (!r || keen(r) < 0) return;
  const was = r.job;
  leaveTrade(r);
  r.job = 'soldier';
  r.plan = undefined;
  log(world, 'world', `${r.name} เลิกเป็น${JOB_TH[was]} สมัครเข้ากองทัพ`, r.id);
}

// Evenings out: a mug at the inn for anyone with coin to spare, and for some, company
// at the pleasure house. The inn brews its ale from market grain.
export function leisure(world: WorldState, rng: Rng): void {
  if (world.day % LEISURE_EVERY !== 0) return;
  const keepers = living(world, 'innkeeper');
  const courtesans = living(world, 'courtesan');
  if (!keepers.length && !courtesans.length) return;
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  for (const n of world.npcs) {
    if (!n.alive || n.age < 16 || n.inside !== undefined || n.job === 'innkeeper' || n.job === 'courtesan') continue;
    if (keepers.length && n.gold >= 30 && chance(rng, 0.25)) {
      const k = pick(rng, keepers);
      n.gold -= ALE;
      k.gold += ALE;
      k.ales = (k.ales ?? 0) + 1;
      if (k.ales >= 2 && buy(world, k, 'grain')) k.ales -= 2;
    }
    const spouse = byId.get(n.spouseId ?? -1);
    const married = !!spouse?.alive;
    const odds = married ? (n.morality < 0 ? 0.02 : 0) : 0.06;
    if (courtesans.length && n.gold >= 50 && chance(rng, odds)) {
      const c = pick(rng, courtesans);
      n.gold -= COMPANY;
      c.gold += COMPANY;
      addTie(world, n, c, 3);
      if (married && chance(rng, 0.3)) {
        addTie(world, spouse!, n, -30);
        log(world, 'bond', `${spouse!.name} จับได้ว่า${n.name}แอบไปหอนางโลม`, spouse!.id);
      }
    }
  }
}

// A blacksmith at the anvil turns two lots of dungeon loot into a set of gear.
export function smith(world: WorldState, npc: Npc, rng: Rng): void {
  const m = ensureMarket(world);
  if (m.stock.loot >= 2 && chance(rng, 0.35)) {
    m.stock.loot -= 2;
    sell(world, npc, 'gear', 1, rng);
    return;
  }
  // No loot to forge: mend tools and shoe horses for a small fee from the market.
  const fee = Math.floor(m.till * 0.01);
  if (fee >= 1 && chance(rng, 0.5)) {
    m.till -= fee;
    npc.gold += fee;
  }
}

// Gold the crown holds back for the next few paydays before spending on anything else.
export const payrollReserve = (world: WorldState) =>
  living(world, 'soldier').length * SALARY * 3 + world.npcs.filter((n) => n.alive && n.knight).length * KNIGHT_PAY * 3 + STIPEND * 3;

export const hasSmith = (world: WorldState) => living(world, 'blacksmith').length > 0;

// Farmers on a noble's land pay part of each harvest as rent.
export function payRent(world: WorldState, farmer: Npc, earned: number, rng: Rng): void {
  const lords = living(world, 'noble');
  if (!lords.length || earned <= 0) return;
  const lord = lords[farmer.id % lords.length];
  const rent = Math.floor(earned * RENT) + (chance(rng, (earned * RENT) % 1) ? 1 : 0);
  const due = Math.min(rent, farmer.gold);
  farmer.gold -= due;
  lord.gold += due;
}

// A soldier on duty close enough to see what happens at (x, y).
export function guardNear(world: WorldState, x: number, y: number): Npc | undefined {
  return world.npcs.find(
    (n) => n.alive && n.job === 'soldier' && n.plan?.kind === 'work' && n.inside === undefined && Math.abs(n.x - x) + Math.abs(n.y - y) <= PATROL_REACH,
  );
}

// How well the garrison shields the town when monsters pour in: 0 (nobody) to 0.7.
export function garrison(world: WorldState): { soldiers: Npc[]; shield: number } {
  const soldiers = living(world, 'soldier').filter((s) => s.inside === undefined);
  const strength = soldiers.reduce((s, n) => s + 1 + (n.gear ?? 0) * 0.5, 0);
  return { soldiers, shield: Math.min(0.7, strength * 0.05) };
}

