// The people's republic: a workers' revolution in the age of factories, or a labour party that
// swept the house, abolishes property. The rich are stripped of their fortunes, the nobles sent
// to the fields, the guilds and trade houses taken over, every party but the Party dissolved.
// Each month the Party levies what anyone holds past an equal share and rations it to the poor;
// the collective fields yield less until the work units learn their trade, the black market
// thrives, the rich who can still flee, and a politburo watches for enemies of the people. A kind
// secretary may thaw it, letting fortunes be one's own again while the Party keeps power.
import { chance, type Rng } from './rng';
import { addMod, log, loyaltyNudge, occupied } from './core';
import { legend } from './quests';
import { king, leaveTrade, payrollReserve } from './society';
import { approval, ensureCrown, loyaltyOf } from './politics';
import { amend, charterOf } from './charter';
import { ensureMarket, levelOf } from './market';
import { seize } from './regimes';
import { disband, partiesOf, partyMembers } from './parties';
import { getTie } from './ties';
import type { Good, Npc, Party, WorldState } from './types';

const COMMUNE_DAY = 26; // day of the month the Party settles accounts
const SHARE = 40; // gold (at today's prices) anyone may keep; the rest belongs to the people
const SEIZE = 0.7; // of what lay past the share, taken on the day of the revolution
const LEVY = 0.3; // of what has piled up past twice the share, taken each month after
const RATION = 3; // gold a month for each of the poor, while the treasury can spare it
const COLLECTIVE = -0.12; // harvest lost while the collective fields find their feet
const PLAN_YEARS = 5;

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);
const has = (n: Npc, t: Npc['traits'][number]) => n.traits.includes(t);
export const isCommune = (world: WorldState) => world.regime === 'commune';
export const theParty = (world: WorldState): Party | undefined => (isCommune(world) ? partiesOf(world).find((p) => p.ideology === 'labour') : undefined);
const common = (world: WorldState) => isCommune(world) && charterOf(world).property === 'common';

// The revolution's first day.
export function proclaimCommune(world: WorldState, leader: Npc, rng: Rng, how: string): void {
  log(world, 'politics', how, leader.id);
  seize(world, 'commune', leader, 'ขึ้นเป็นเลขาธิการพรรคในนามของชนชั้นแรงงาน', `${leader.name} สถาปนาสาธารณรัฐประชาชน`);
  const lvl = levelOf(world);
  // Fortunes past an equal share go to the people's treasury.
  let seized = 0;
  for (const n of world.npcs) {
    if (!n.alive || n === leader) continue;
    const over = n.gold - SHARE * lvl;
    if (over <= 0) continue;
    const take = Math.floor(over * SEIZE);
    n.gold -= take;
    seized += take;
    loyaltyNudge(n, -25);
  }
  // The nobles to the fields; the guilds and trade houses to the state.
  for (const n of adults(world)) {
    if (n.job !== 'noble') continue;
    leaveTrade(n);
    n.job = 'farmer';
    n.knight = undefined;
    n.plan = undefined;
  }
  const m = ensureMarket(world);
  for (const g of world.guilds) {
    seized += Math.max(0, Math.floor(g.treasury));
    for (const [good, q] of Object.entries(g.stock ?? {}) as [Good, number][]) m.stock[good] += Math.floor(q);
  }
  for (const n of world.npcs) n.guildId = undefined;
  world.guilds = [];
  world.debt = undefined; // the Party does not pay the old regime's creditors
  world.treasury += seized;
  // One party: the workers' party, renamed, or founded on the spot.
  let party = partiesOf(world).find((p) => p.ideology === 'labour');
  if (!party) {
    party = { id: world.nextId++, name: 'พรรคคอมมิวนิสต์', ideology: 'labour', leaderId: leader.id, founded: world.day, treasury: 0, seats: 0, mps: [] };
    (world.parties ??= []).push(party);
  }
  party.name = 'พรรคคอมมิวนิสต์';
  party.leaderId = leader.id;
  party.seats = 0;
  party.mps = [];
  disband(world, 'ถูกยุบ เหลือเพียงพรรคคอมมิวนิสต์พรรคเดียว', party);
  leader.partyId = party.id;
  for (const n of world.npcs) if (n.alive && n.marcher) n.partyId = party.id; // the movement's rank and file
  world.parliament = undefined;
  world.commune = { since: world.day, seized };
  // The poor cheer; the collective fields will take time to learn.
  for (const n of adults(world)) if (n.gold < 20 * lvl) loyaltyNudge(n, 12);
  addMod(world, 'harvest', COLLECTIVE, 365, 'นารวมยังไม่เข้าที่');
  log(world, 'politics', `ยึดทรัพย์สินของคนรวย ขุนนาง และสมาคมการค้าเข้าคลังประชาชนรวม ${seized} ทอง ขุนนางถูกส่งไปทำนารวม`);
  void rng;
}

// Monthly under the Party.
export function communeDay(world: WorldState, rng: Rng): void {
  if (!isCommune(world) || world.day % 30 !== COMMUNE_DAY || occupied(world)) return;
  const sec = king(world);
  if (!sec) return;
  const c = (world.commune ??= { since: world.day, seized: 0 });
  const lvl = levelOf(world);
  const party = theParty(world);
  if (party) party.leaderId = sec.id;
  if (common(world)) {
    // What piles up past twice the share goes back to the people; the poor are rationed.
    let pool = 0;
    for (const n of adults(world)) {
      if (n === sec) continue;
      const over = n.gold - SHARE * 2 * lvl;
      if (over <= 0) continue;
      const take = Math.floor(over * LEVY);
      n.gold -= take;
      pool += take;
    }
    world.treasury += pool;
    const poor = adults(world).filter((n) => n.gold < 10 * lvl);
    const each = Math.round(RATION * lvl);
    const afford = Math.max(0, Math.floor((world.treasury - payrollReserve(world)) / Math.max(1, each)));
    for (const n of poor.slice(0, afford)) {
      n.gold += each;
      world.treasury -= each;
    }
    addMod(world, 'crime', 0.1, 30, 'ตลาดมืด'); // what the ration does not cover is bought under the counter
  }
  // The plan: every five years the Party sets the town a target and drives the works on.
  if (c.plan === undefined || world.day >= c.plan) {
    c.plan = world.day + PLAN_YEARS * 365;
    if (world.building) world.building.done = world.day + Math.ceil((world.building.done - world.day) * 0.6);
    addMod(world, 'building', 1, 365, 'แผนพัฒนาห้าปี');
    log(world, 'politics', `เลขาธิการ${sec.name}ประกาศแผนพัฒนาห้าปีฉบับใหม่ เร่งงานก่อสร้างทั่วเมือง`, sec.id);
    return;
  }
  // The rich who still can slip away, with what they could carry.
  const sour = adults(world).filter((n) => n.gold >= SHARE * lvl && loyaltyOf(n) < 25 && n !== sec && n.partyId === undefined);
  const fled = sour.filter(() => chance(rng, 0.1)).slice(0, 2);
  for (const n of fled) {
    n.alive = false;
    n.left = true;
    n.plan = undefined;
    log(world, 'politics', `${n.name}ลักลอบหนีออกนอกเมืองพร้อมทองที่ซ่อนไว้`, n.id);
  }
  if (fled.length) return;
  if (purge(world, sec, rng)) return;
  thaw(world, sec, rng);
}

// The politburo hunts enemies of the people: the disloyal outside the Party, and any rival inside it.
function purge(world: WorldState, sec: Npc, rng: Rng): boolean {
  if (!has(sec, 'vengeful') && !has(sec, 'greedy')) return false;
  const party = theParty(world);
  const rival = party && partyMembers(world, party).find((n) => n !== sec && (has(n, 'greedy') || has(n, 'vengeful')) && getTie(world, n.id, sec.id) < 0 && n.level >= sec.level - 1);
  const critics = adults(world).filter((n) => n !== sec && loyaltyOf(n) < 25 && (n.jailedUntil ?? 0) <= world.day && n.job !== 'soldier');
  if ((!rival && critics.length < 3) || !chance(rng, 0.2)) return false;
  const taken = [...(rival ? [rival] : []), ...critics.sort((a, b) => loyaltyOf(a) - loyaltyOf(b))].slice(0, 3);
  for (const n of taken) {
    n.jailedUntil = world.day + 240;
    n.marcher = undefined;
    n.partyId = undefined;
  }
  for (const n of adults(world)) if (taken.some((t) => getTie(world, t.id, n.id) >= 15)) loyaltyNudge(n, -6);
  ensureCrown(world).unrest += 1;
  log(world, 'politics', `กรมการเมืองกวาดล้าง "ศัตรูของประชาชน" จับ${taken.map((n) => n.name).join(', ')}ส่งค่ายดัดสันดาน`, sec.id);
  return true;
}

// A kind secretary in a hungry, sullen town opens the market again: fortunes are one's own once
// more, the guilds may form if they pay their tax, but the Party keeps the power.
function thaw(world: WorldState, sec: Npc, rng: Rng): boolean {
  if (!common(world) || !has(sec, 'kind') || approval(world) >= 40 || world.day - (world.commune?.since ?? 0) < 365 * 3 || !chance(rng, 0.08)) return false;
  amend(world, { property: 'private', guilds: 'taxed' }, `เลขาธิการ${sec.name}ประกาศปฏิรูปเปิดตลาด ชาวเมืองมีทรัพย์สินส่วนตัวได้อีกครั้ง แต่พรรคยังกุมอำนาจ`);
  for (const n of adults(world)) loyaltyNudge(n, n.gold >= SHARE * levelOf(world) ? 6 : 2);
  legend(world, `${sec.name} ปฏิรูปเปิดตลาด`, sec.id);
  return true;
}
