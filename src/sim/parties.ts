// Political parties and the elected house. Where the town has a parliament (every republic, and a
// crown made constitutional) people band together behind a platform: the merchants' guilds found a
// free-trade party, the adventurers' guilds a nationalist one, the poor's movement a labour party,
// the church a party of the faith, the nobles a party of the old order. Each townsperson votes the
// party that speaks for their purse, their trade, their faith and their friends; the seats are
// shared out by the vote, the parties that can agree form a government, and the government rules
// by its platform. It can lose its majority to a no-confidence vote, buy defectors, split, sweep
// the house and rewrite the rules, or, a workers' party in the age of factories, abolish property.
import { chance, next, pick, type Rng } from './rng';
import { clamp, known, log, loyaltyNudge, occupied } from './core';
import { getTie } from './ties';
import { legend } from './quests';
import { king } from './society';
import { approval, ensureCrown, loyaltyOf } from './politics';
import { literate } from './learning';
import { amend, charterOf } from './charter';
import { ensureMarket, levelOf, priceRatio } from './market';
import { headOf, churchOf } from './church';
import { houses } from './tradehouses';
import { influenceOf, membersOf } from './adventurers';
import { rankOf, TOWN_RANK } from './growth';
import { industrial } from './ages';
import { install, mayVote, standing } from './republic';
import { proclaimCommune } from './commune';
import type { Decree, Ideology, Npc, Party, Tax, Trait, WorldState } from './types';

const PARTY_DAY = 24; // day of the month the parties meet, recruit and scheme
const MAX_PARTIES = 6;
const FOUND = 0.25; // monthly chance a party forms for a constituency that has none
const CONSTITUENCY = 3; // adults who must lean its way before a party forms
const JOIN = 0.15; // monthly chance someone drawn to a party joins it
const DUES = 1; // gold a member pays each month, if they have it
const TERM = 4; // years between general elections in a constitutional monarchy
const NO_CONFIDENCE = 0.12; // monthly chance the opposition moves against a weak government
const BRIBE = 40; // gold a government pays an opposition member to cross the floor
const SCANDAL = 2.5;
const CHEST = 200; // gold a party keeps for its next campaign; past this it spends // pull a party loses when its vote-buying is exposed

export const IDEOLOGIES: readonly Ideology[] = ['labour', 'faith', 'nation', 'trade', 'old'];

export const IDEOLOGY_TH: Record<Ideology, { name: string; party: string; text: string }> = {
  trade: { name: 'เสรีนิยม', party: 'พรรคการค้าเสรี', text: 'ภาษีต่ำ ค้าขายเสรี รัฐไม่ยุ่งกับตลาด' },
  nation: { name: 'ชาตินิยม', party: 'พรรคชาตินิยม', text: 'กองทัพเข้มแข็ง ปราบมอนสเตอร์ ขยายดินแดน' },
  labour: { name: 'สังคมนิยม', party: 'พรรคแรงงาน', text: 'ข้าวราคาถูก ค่าแรงเป็นธรรม ช่วยคนจน' },
  faith: { name: 'ศาสนานิยม', party: 'พรรคธรรมะ', text: 'ศีลธรรมและศาสนาของเทพเจ้านำบ้านเมือง' },
  old: { name: 'อนุรักษ์นิยม', party: 'พรรคอนุรักษ์', text: 'รักษาระเบียบเดิม ที่ดินและสิทธิ์ของผู้ดี' },
};

// What each platform wants from the government: a tax level, decrees it pushes for and decrees it
// swore never to issue, and the temper it lends whoever governs in its name.
export const PLATFORM: Record<Ideology, { tax: Tax; likes: Decree[]; hates: Decree[]; temper: Trait[] }> = {
  trade: { tax: 'low', likes: ['labour', 'expand', 'bounty'], hates: ['subsidy', 'ceiling', 'tariff', 'debase', 'curfew'], temper: ['greedy'] },
  nation: { tax: 'normal', likes: ['bounty', 'levy', 'garrison', 'colonize', 'embargo'], hates: ['relief', 'taxfree'], temper: ['brave'] },
  labour: { tax: 'normal', likes: ['subsidy', 'ceiling', 'relief', 'taxfree', 'labour'], hates: ['curfew', 'levy', 'tribute', 'debase', 'colonize'], temper: ['kind'] },
  faith: { tax: 'normal', likes: ['relief', 'subsidy', 'curfew'], hates: ['debase', 'colonize'], temper: ['kind', 'loyal'] },
  old: { tax: 'normal', likes: ['curfew', 'garrison', 'tribute'], hates: ['taxfree', 'relief', 'expand'], temper: ['loyal'] },
};
// Left to right: who will sit with whom in a coalition.
const AXIS: Record<Ideology, number> = { labour: 0, faith: 1.5, nation: 2.5, trade: 3, old: 4 };
const PARTNER = 2.5; // parties further apart than this will not govern together
// The temper of each regime when no party governs.
const REGIME_IDEOLOGY: Partial<Record<NonNullable<WorldState['regime']>, Ideology>> = { theocracy: 'faith', oligarchy: 'trade', junta: 'nation', commune: 'labour' };
const SUFFIX = ['ประชาชน', 'ก้าวหน้า', 'รวมใจ', 'พลังเมือง', 'ไทย', 'ใหม่', 'เพื่อชาติ'];

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);
const has = (n: Npc, t: Trait) => n.traits.includes(t);
const ambitious = (n: Npc) => has(n, 'greedy') || has(n, 'vengeful');

export const partiesOf = (world: WorldState) => world.parties ?? [];
export const partyOf = (world: WorldState, n: Npc) => (n.partyId === undefined ? undefined : partiesOf(world).find((p) => p.id === n.partyId));
export const partyMembers = (world: WorldState, p: Party) => world.npcs.filter((n) => n.alive && n.partyId === p.id);
const leaderOf = (world: WorldState, p: Party) => world.npcs.find((n) => n.id === p.leaderId && n.alive);

// Whether the town elects a house: every republic does, and a crown that has granted a parliament.
export const hasParliament = (world: WorldState) => world.regime === 'republic' || ((world.regime ?? 'monarchy') === 'monarchy' && !!charterOf(world).parliament);
export const constitutional = (world: WorldState) => (world.regime ?? 'monarchy') === 'monarchy' && !!charterOf(world).parliament;
// Who sits in the house now.
export function mps(world: WorldState): Npc[] {
  const ids = new Set(partiesOf(world).flatMap((p) => p.mps));
  return world.npcs.filter((n) => n.alive && ids.has(n.id) && n.inside === undefined);
}
const coalitionOf = (world: WorldState) => partiesOf(world).filter((p) => world.parliament?.coalition.includes(p.id));
export const inGovernment = (world: WorldState, p: Party) => !!world.parliament?.coalition.includes(p.id);

// The prime minister of a constitutional monarchy; elsewhere whoever holds power.
export function governor(world: WorldState): Npc | undefined {
  if (constitutional(world)) {
    const pm = world.npcs.find((n) => n.id === world.parliament?.pmId && n.alive);
    if (pm) return pm;
  }
  return king(world);
}

// The platform the government rules by: the governing party's, else the regime's own.
export function rulingIdeology(world: WorldState): Ideology | undefined {
  if (hasParliament(world)) {
    const head = governor(world);
    const p = head && partyOf(world, head);
    if (p && inGovernment(world, p)) return p.ideology;
  }
  if (world.regime === 'commune') return 'labour';
  return REGIME_IDEOLOGY[world.regime ?? 'monarchy'];
}
const rulingParty = (world: WorldState) => {
  const head = governor(world);
  const p = head && partyOf(world, head);
  return p && inGovernment(world, p) ? p : undefined;
};

// The traits a ruler decides policy with: their own, and the temper of the platform they govern by.
export function mind(world: WorldState, n: Npc): Trait[] {
  const ideo = rulingIdeology(world);
  return ideo ? [...new Set([...n.traits, ...PLATFORM[ideo].temper])] : n.traits;
}
// Only an elected government has promises to keep; a regime's temper leans, it does not swear.
export const forbids = (world: WorldState, d: Decree) => {
  const p = rulingParty(world);
  return !!p && PLATFORM[p.ideology].hates.includes(d);
};
export const favours = (world: WorldState, d: Decree) => {
  const ideo = rulingIdeology(world);
  return !!ideo && PLATFORM[ideo].likes.includes(d);
};
// The party a councillor votes with: their party in the house, or the body they sit for.
export function bodyIdeology(world: WorldState, n: Npc): Ideology | undefined {
  const p = partyOf(world, n);
  if (p && p.mps.includes(n.id)) return p.ideology;
  if (hasParliament(world)) return undefined;
  return REGIME_IDEOLOGY[world.regime ?? 'monarchy'];
}

// A government made to do what its platform swore against: its members and voters take it hard.
export function brokePromise(world: WorldState, what: string): void {
  const p = rulingParty(world);
  if (!p) return;
  p.broke = world.day;
  for (const n of partyMembers(world, p)) loyaltyNudge(n, -4);
  log(world, 'politics', `${p.name}ผิดสัญญาที่หาเสียงไว้ (${what}) สมาชิกพรรคไม่พอใจ`);
}

// ---------- who leans which way ----------

// How strongly one townsperson's life pulls them toward a platform.
export function interest(world: WorldState, v: Npc, ideo: Ideology): number {
  const lvl = levelOf(world);
  const job = v.formerJob && v.job === 'king' ? v.formerJob : v.job;
  switch (ideo) {
    case 'trade':
      return (['merchant', 'innkeeper', 'blacksmith', 'alchemist'].includes(job) ? 2 : 0) + (v.gold >= 60 * lvl ? 1.5 : 0) + (houses(world).some((g) => g.id === v.guildId) ? 1 : 0) + (ensureCrown(world).tax === 'high' ? 0.5 : 0);
    case 'nation':
      return (job === 'soldier' || v.knight ? 2.5 : 0) + (job === 'swordsman' || job === 'mage' ? 1.5 : 0) + (has(v, 'brave') ? 0.5 : 0) + (world.war || world.demon || world.dungeons.some((d) => d.power >= 60) ? 1 : 0);
    case 'labour':
      return (v.gold < 20 * lvl ? 1.5 : 0) + ((v.hunger ?? 0) >= 1 ? 1.5 : 0) + (['farmer', 'herder', 'hunter', 'builder', 'courtesan'].includes(job) ? 0.8 : 0) + (v.marcher ? 1.5 : 0) + (priceRatio(world, 'grain') >= 1.5 ? 0.5 : 0);
    case 'faith':
      return (job === 'priest' ? 3 : 0) + (v.creed === 'god' ? Math.max(0, ((v.piety ?? 50) - 55) / 12) : v.creed === 'sect' ? 0.5 : -1);
    case 'old':
      return (job === 'noble' ? 3 : 0) + (v.knight ? 1 : 0) + (v.age >= 55 ? 0.7 : 0) + (v.gold >= 150 * lvl ? 1 : 0) + (has(v, 'loyal') ? 0.5 : 0) + (loyaltyOf(v) >= 65 ? 0.5 : 0);
  }
}
// Their pull toward one party: the platform, its leader, and belonging.
const pull = (world: WorldState, v: Npc, p: Party) => interest(world, v, p.ideology) + getTie(world, v.id, p.leaderId) / 25 + (v.partyId === p.id ? 2 : 0);

// ---------- the parties' month ----------

export function partiesDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== PARTY_DAY || occupied(world)) return;
  const law = charterOf(world).parties ?? 'free';
  if (law === 'banned') return void disband(world, 'ถูกยุบตามกฎหมาย');
  for (const p of [...partiesOf(world)]) succeed(world, p);
  if (law === 'free' && hasParliament(world) && rankOf(world) >= TOWN_RANK) found(world, rng);
  recruit(world, rng);
  if (!hasParliament(world)) return; // no house to campaign for: no dues to spend
  for (const p of partiesOf(world)) dues(world, p);
  const house = (world.parliament ??= { seats: 0, coalition: [], nextVote: world.day, elections: 0 });
  // A constitutional monarchy holds its own general elections; a republic's come through republicDay.
  if (constitutional(world) && world.day >= house.nextVote && partiesOf(world).length >= 2) return void general(world, rng, house.elections ? 'ครบวาระ' : 'ครั้งแรกของรัฐสภา');
  if (constitutional(world) && house.elections && !world.npcs.some((n) => n.id === house.pmId && n.alive)) return void form(world, rng); // the prime minister is gone: the house chooses again
  if (law === 'free' && split(world, rng)) return;
  if (floorCrossing(world, rng)) return;
  noConfidence(world, rng);
}

// A party forms for a constituency with no party of its own, led by whoever already leads them.
function found(world: WorldState, rng: Rng): void {
  if (partiesOf(world).length >= MAX_PARTIES) return;
  const folk = adults(world);
  for (const ideo of IDEOLOGIES) {
    if (partiesOf(world).some((p) => p.ideology === ideo)) continue;
    if (folk.filter((n) => interest(world, n, ideo) >= 2).length < CONSTITUENCY || !chance(rng, FOUND)) continue;
    const f = founderOf(world, ideo) ?? champion(world, ideo);
    if (!f) continue;
    const { n: leader, from } = f;
    const p = create(world, ideo, leader, from);
    log(world, 'politics', `${leader.name}${from ? `แห่ง${from}` : ''}ก่อตั้ง${p.name} ชูนโยบาย${IDEOLOGY_TH[ideo].text}`, leader.id);
    return; // one founding a month
  }
}

// Who founds each kind of party: the head of the guild, movement or church it grows out of.
function founderOf(world: WorldState, ideo: Ideology): { n: Npc; from: string } | undefined {
  const lvl = levelOf(world);
  const free = (n?: Npc) => (n && n.alive && n.age >= 20 && n.partyId === undefined && n.inside === undefined && n.questId === undefined && n.job !== 'king' ? n : undefined);
  const guildHead = (gs: WorldState['guilds']) => {
    const g = [...gs].sort((a, b) => influenceOf(world, b) - influenceOf(world, a))[0];
    const n = g && free(world.npcs.find((x) => x.id === g.leaderId));
    return n && g ? { n, from: g.name } : undefined;
  };
  const best = (list: Npc[], score: (n: Npc) => number) => list.map(free).filter((n): n is Npc => !!n).sort((a, b) => score(b) - score(a))[0];
  const folk = adults(world);
  switch (ideo) {
    case 'trade': {
      const n = best(folk.filter((n) => n.job === 'merchant' && n.gold >= 60 * lvl), (n) => n.gold);
      return guildHead(houses(world)) ?? (n && { n, from: '' });
    }
    case 'nation': {
      const n = best(folk.filter((n) => (n.job === 'soldier' || n.knight || n.job === 'swordsman') && n.level >= 3), (n) => n.level + (n.renown ?? 0) / 20);
      return guildHead(world.guilds.filter((g) => g.kind === 'adventurers' && membersOf(world, g).length >= 2)) ?? (n && { n, from: '' });
    }
    case 'labour': {
      const mv = world.movement;
      const head = mv && (mv.cause === 'wealth' || mv.cause === 'bread' || mv.cause === 'tax') ? free(world.npcs.find((n) => n.id === mv.leaderId)) : undefined;
      if (head) return { n: head, from: mv!.name };
      const n = best(folk.filter((n) => n.gold < 30 * lvl && (literate(n) || has(n, 'brave') || has(n, 'kind'))), (n) => world.npcs.filter((o) => o.alive && getTie(world, n.id, o.id) >= 15).length);
      return n && { n, from: '' };
    }
    case 'faith': {
      const head = free(headOf(world));
      if (head && churchOf(world).influence >= 30) return { n: head, from: 'ศาสนจักร' };
      const n = best(folk.filter((n) => n.creed === 'god' && (n.piety ?? 50) >= 75), (n) => n.piety ?? 50);
      return n && { n, from: '' };
    }
    case 'old': {
      const nobles = folk.filter((n) => n.job === 'noble');
      const n = nobles.length >= 2 ? best(nobles, (n) => n.gold) : undefined;
      return n && { n, from: 'เหล่าขุนนาง' };
    }
  }
}

// With no guild, movement or church to grow out of, whoever that constituency looks up to most.
function champion(world: WorldState, ideo: Ideology): { n: Npc; from: string } | undefined {
  const n = adults(world)
    .filter((n) => n.age >= 20 && n.partyId === undefined && n.job !== 'king' && n.questId === undefined && interest(world, n, ideo) >= 2)
    .sort((a, b) => interest(world, b, ideo) * 2 + standing(world, b) - (interest(world, a, ideo) * 2 + standing(world, a)))[0];
  return n && { n, from: '' };
}

function create(world: WorldState, ideo: Ideology, leader: Npc, from: string, name?: string): Party {
  const taken = new Set(partiesOf(world).map((p) => p.name));
  let pname = name ?? IDEOLOGY_TH[ideo].party;
  for (let i = 0; taken.has(pname) && i < SUFFIX.length; i++) pname = `${IDEOLOGY_TH[ideo].party}${SUFFIX[(world.day + i) % SUFFIX.length]}`;
  const p: Party = { id: world.nextId++, name: pname, ideology: ideo, leaderId: leader.id, founded: world.day, treasury: 0, from: from || undefined, seats: 0, mps: [] };
  const stake = Math.min(20, Math.floor(leader.gold / 4));
  leader.gold -= stake;
  p.treasury += stake;
  leader.partyId = p.id;
  (world.parties ??= []).push(p);
  return p;
}

// A party whose leader is gone passes to its most prominent member, or breaks up.
function succeed(world: WorldState, p: Party): void {
  if (leaderOf(world, p)) return;
  const heir = partyMembers(world, p).sort((a, b) => standing(world, b) - standing(world, a))[0];
  if (heir) {
    p.leaderId = heir.id;
    log(world, 'politics', `${heir.name}ขึ้นเป็นหัวหน้า${p.name}คนใหม่`, heir.id);
    return;
  }
  dissolve(world, p, 'ไม่เหลือสมาชิก');
}
function dissolve(world: WorldState, p: Party, why: string): void {
  for (const n of world.npcs) if (n.partyId === p.id) n.partyId = undefined;
  world.parties = partiesOf(world).filter((x) => x !== p);
  if (world.parliament) world.parliament.coalition = world.parliament.coalition.filter((id) => id !== p.id);
  log(world, 'politics', `${p.name}ล่มสลาย (${why})`);
}
// Every party broken up at once: the law bans them, or a regime with no use for them takes power.
export function disband(world: WorldState, why: string, keep?: Party): void {
  const gone = partiesOf(world).filter((p) => p !== keep);
  if (!gone.length) return;
  for (const n of world.npcs) if (n.partyId !== undefined && n.partyId !== keep?.id) n.partyId = undefined;
  world.parties = keep ? [keep] : [];
  if (world.parliament) world.parliament.coalition = world.parliament.coalition.filter((id) => id === keep?.id);
  log(world, 'politics', `พรรคการเมือง ${gone.length} พรรค${why}`);
}

// Members join the party that speaks for them, and leave one that no longer does.
function recruit(world: WorldState, rng: Rng): void {
  const ps = partiesOf(world);
  if (!ps.length) return;
  const one = charterOf(world).parties === 'one';
  for (const n of adults(world)) {
    if (n.job === 'king' && n.partyId !== undefined) continue;
    const own = partyOf(world, n);
    if (own) {
      if (own.leaderId !== n.id && !own.mps.includes(n.id) && pull(world, n, own) < (one ? 1.5 : 1) && chance(rng, 0.1)) n.partyId = undefined;
      continue;
    }
    // Under one party, the loyal join for what membership brings; elsewhere, for what it stands for.
    const best = ps.map((p) => ({ p, s: one ? (loyaltyOf(n) - 55) / 8 + getTie(world, n.id, p.leaderId) / 25 : pull(world, n, p) })).sort((a, b) => b.s - a.s)[0];
    if (best.s >= 2.5 && chance(rng, JOIN)) n.partyId = best.p.id;
  }
}
function dues(world: WorldState, p: Party): void {
  for (const n of partyMembers(world, p)) {
    if (n.gold < 10) continue;
    n.gold -= DUES;
    p.treasury += DUES;
  }
  // A rich leader bankrolls their own party.
  const leader = leaderOf(world, p);
  if (leader && leader.gold >= 200 * levelOf(world)) {
    const gift = Math.floor(leader.gold * 0.02);
    leader.gold -= gift;
    p.treasury += gift;
  }
  // A chest past what a campaign needs goes on rallies, broadsheets and ale, back into the town.
  const keep = CHEST * levelOf(world);
  if (p.treasury > keep) {
    const spent = Math.ceil((p.treasury - keep) * 0.25);
    p.treasury -= spent;
    ensureMarket(world).till += spent;
  }
}

// ---------- the general election ----------

// Seats in the house: about one for every six voters, an odd number from 5 to 15.
const houseSize = (voters: number) => {
  const s = clamp(Math.round(voters / 6), 5, 15);
  return s % 2 ? s : s + 1;
};

// Hold a general election by party. Returns the head of the new government.
export function general(world: WorldState, rng: Rng, why: string): Npc | undefined {
  const ps = partiesOf(world);
  if (ps.length < 2) return undefined;
  const voters = world.npcs.filter((v) => mayVote(world, v));
  const house = (world.parliament ??= { seats: 0, coalition: [], nextVote: 0, elections: 0 });
  // The campaign: each party spends its chest on posters, criers and ale, which goes back to the town.
  const m = ensureMarket(world);
  for (const p of ps) {
    const spent = Math.min(p.treasury, 30 + Math.floor(p.treasury / 2));
    p.treasury -= spent;
    m.till += spent;
  }
  // A grasping leader with gold to spare buys the votes of the poor; the presses may find out.
  const bought = new Map<number, number>();
  for (const p of ps) {
    const leader = leaderOf(world, p);
    if (!leader || !ambitious(leader) || leader.morality >= 0 || p.treasury < 40) continue;
    bought.set(p.id, 1.5);
    for (const v of voters) {
      if (p.treasury < 2) break;
      if (v.gold >= 20 * levelOf(world)) continue;
      p.treasury -= 2;
      v.gold += 2;
    }
    if (known(world, 'printing') && chance(rng, charterOf(world).freePress ? 0.5 : 0.2)) {
      bought.set(p.id, -SCANDAL);
      log(world, 'politics', `ใบปลิวเปิดโปงว่า${p.name}แจกเงินซื้อเสียงคนจน`, leader.id);
    }
  }
  const votes = new Map(ps.map((p) => [p.id, 0]));
  const backers = new Map<number, Npc[]>(ps.map((p) => [p.id, []]));
  const wear = governmentWear(world);
  for (const v of voters) {
    let best = ps[0];
    let top = -Infinity;
    for (const p of ps) {
      const poor = v.gold < 20 * levelOf(world);
      const sitting = inGovernment(world, p) ? (loyaltyOf(v) - 50) / 25 - wear - (p.broke !== undefined && world.day - p.broke < 365 ? 1 : 0) : 0;
      const a = pull(world, v, p) + sitting + (bought.has(p.id) && (poor || bought.get(p.id)! < 0) ? bought.get(p.id)! : 0) + next(rng) * 1.5;
      if (a > top) [best, top] = [p, a];
    }
    votes.set(best.id, votes.get(best.id)! + 1);
    backers.get(best.id)!.push(v);
  }
  // Seats by the largest remainder.
  const total = houseSize(voters.length);
  const cast = Math.max(1, voters.length);
  const quota = ps.map((p) => ({ p, q: (votes.get(p.id)! * total) / cast }));
  for (const { p, q } of quota) p.seats = Math.floor(q);
  let left = total - ps.reduce((s, p) => s + p.seats, 0);
  for (const { p } of [...quota].sort((a, b) => (b.q % 1) - (a.q % 1))) if (left-- > 0) p.seats++;
  // Each party fills its seats from its members, then from those who voted for it.
  for (const p of ps) {
    const sitters = [...partyMembers(world, p).filter((n) => n.job !== 'king' || n.id === p.leaderId), ...backers.get(p.id)!.filter((n) => n.partyId === undefined && n.age >= 20)];
    const lead = leaderOf(world, p);
    const ranked = [...new Set([...(lead ? [lead] : []), ...sitters.sort((a, b) => standing(world, b) - standing(world, a))])];
    p.mps = ranked.slice(0, p.seats).map((n) => n.id);
    for (const id of p.mps) {
      const n = world.npcs.find((x) => x.id === id)!;
      n.partyId = p.id;
    }
    p.seats = p.mps.length;
  }
  house.seats = ps.reduce((s, p) => s + p.seats, 0);
  house.independents = undefined;
  house.elections++;
  house.nextVote = world.day + (charterOf(world).termYears || TERM) * 365;
  const ranked = [...ps].sort((a, b) => b.seats - a.seats || votes.get(b.id)! - votes.get(a.id)!);
  house.last = { day: world.day, results: ranked.map((p) => ({ partyId: p.id, name: p.name, votes: votes.get(p.id)!, seats: p.seats })) };
  log(world, 'politics', `การเลือกตั้งทั่วไปครั้งที่ ${house.elections} (${why}): ${ranked.map((p) => `${p.name} ${p.seats} ที่นั่ง`).join(' · ')}`);
  for (const p of ps) for (const v of backers.get(p.id)!) loyaltyNudge(v, p === ranked[0] ? 4 : -2);
  const head = form(world, rng);
  sweep(world, ranked[0], rng);
  return head;
}

// How much the governing parties have worn on the voters: years in office and broken promises.
function governmentWear(world: WorldState): number {
  const since = world.republic?.inOffice ?? world.crown?.since ?? world.day;
  return Math.min(2, ((world.day - since) / 365) * 0.3);
}

// The largest party gathers partners it can sit with until it holds a majority; short of one it
// governs alone as a minority. Its leader heads the government.
export function form(world: WorldState, rng: Rng): Npc | undefined {
  const house = world.parliament;
  const ps = [...partiesOf(world)].filter((p) => p.seats > 0).sort((a, b) => b.seats - a.seats);
  if (!house || !ps.length) return undefined;
  const lead = ps.find((p) => leaderOf(world, p)) ?? ps[0];
  const coalition = [lead];
  let held = lead.seats;
  for (const p of ps.filter((p) => p !== lead).sort((a, b) => Math.abs(AXIS[a.ideology] - AXIS[lead.ideology]) - Math.abs(AXIS[b.ideology] - AXIS[lead.ideology]))) {
    if (held * 2 > house.seats) break;
    if (Math.abs(AXIS[p.ideology] - AXIS[lead.ideology]) > PARTNER) continue;
    coalition.push(p);
    held += p.seats;
  }
  house.coalition = coalition.map((p) => p.id);
  // A leader the charter's term limit bars hands the office to the party's next most prominent member.
  const limit = charterOf(world).termLimit;
  const barred = (n: Npc) => world.regime === 'republic' && ((limit !== null && n.id === world.kingId && (world.republic?.streak ?? 0) >= limit) || world.republic?.impeached === n.id);
  const bench = lead.mps.map((id) => world.npcs.find((n) => n.id === id && n.alive)).filter((n): n is Npc => !!n).sort((a, b) => standing(world, b) - standing(world, a));
  const chief = leaderOf(world, lead);
  const head = chief && !barred(chief) ? chief : bench.find((n) => !barred(n));
  if (!head) return undefined;
  if (chief && head !== chief) log(world, 'politics', `${chief.name}${world.republic?.impeached === chief.id ? 'ถูกถอดถอน หมดสิทธิ์ดำรงตำแหน่ง' : 'ดำรงตำแหน่งครบวาระตามรัฐธรรมนูญ'} ${lead.name}ส่ง${head.name}ขึ้นแทน`, head.id);
  const kind = held * 2 > house.seats ? (coalition.length > 1 ? `รัฐบาลผสม ${coalition.map((p) => p.name).join(' + ')}` : `${lead.name}ได้เสียงข้างมากเด็ดขาด`) : `รัฐบาลเสียงข้างน้อยของ${lead.name}`;
  if (constitutional(world)) {
    house.pmId = head.id;
    log(world, 'politics', `${kind} ${head.name}ได้รับแต่งตั้งเป็นนายกรัฐมนตรี (${held}/${house.seats} ที่นั่ง)`, head.id);
  } else {
    install(world, head);
    log(world, 'politics', `${kind} ${head.name}ได้เป็นผู้นำสภา (${held}/${house.seats} ที่นั่ง)`, head.id);
  }
  void rng;
  return head;
}
const held = (world: WorldState) => coalitionOf(world).reduce((s, p) => s + p.seats, 0);

// One party with two thirds of the house, twice running: an ambitious leader rewrites the rules
// so it never has to face the voters on equal terms again; a workers' party in the age of the
// factory may go further and abolish property itself.
function sweep(world: WorldState, top: Party, rng: Rng): void {
  const house = world.parliament!;
  house.sweep = top.seats * 3 >= house.seats * 2 ? (house.sweep ?? 0) + 1 : 0;
  const leader = leaderOf(world, top);
  if ((house.sweep ?? 0) < 2 || !leader || !ambitious(leader) || !inGovernment(world, top)) return;
  if (top.ideology === 'labour' && world.regime === 'republic' && (industrial(world) || world.works?.factory !== undefined) && chance(rng, 0.5)) {
    return proclaimCommune(world, leader, rng, `${top.name}ครองสภาเบ็ดเสร็จ ${leader.name}ประกาศยกเลิกกรรมสิทธิ์ส่วนบุคคล สถาปนาสาธารณรัฐประชาชน`);
  }
  const c = charterOf(world);
  if (c.termLimit === null && !c.freePress) return;
  amend(world, { termLimit: null, freePress: false }, `${top.name}ใช้เสียงข้างมากเด็ดขาดแก้รัฐธรรมนูญ ยกเลิกการจำกัดวาระและควบคุมสื่อ`);
  for (const n of adults(world)) if (literate(n) && n.partyId !== top.id) loyaltyNudge(n, -8);
  ensureCrown(world).unrest += 2;
  legend(world, `${top.name} ครองเมืองด้วยเสียงข้างมากเด็ดขาด`, leader.id);
}

// ---------- the house between elections ----------

// A party grown big enough to fight itself: an ambitious member at odds with the leader walks out
// with whoever is closer to them.
function split(world: WorldState, rng: Rng): boolean {
  if (partiesOf(world).length >= MAX_PARTIES) return false;
  for (const p of partiesOf(world)) {
    const people = partyMembers(world, p);
    const leader = leaderOf(world, p);
    if (!leader || people.length < 8 || !chance(rng, 0.03)) continue;
    const rebel = people.filter((n) => n !== leader && ambitious(n) && getTie(world, n.id, leader.id) <= -15 && n.job !== 'king').sort((a, b) => standing(world, b) - standing(world, a))[0];
    if (!rebel) continue;
    rebel.partyId = undefined;
    const q = create(world, p.ideology, rebel, p.name, `${IDEOLOGY_TH[p.ideology].party}${pick(rng, SUFFIX)}`);
    for (const n of people) if (n !== leader && n !== rebel && getTie(world, n.id, rebel.id) > getTie(world, n.id, leader.id)) n.partyId = q.id;
    // Seats follow the members who held them.
    q.mps = p.mps.filter((id) => world.npcs.find((n) => n.id === id)?.partyId === q.id);
    p.mps = p.mps.filter((id) => !q.mps.includes(id));
    q.seats = q.mps.length;
    p.seats = p.mps.length;
    log(world, 'politics', `${rebel.name}แตกหักกับ${leader.name} พาสมาชิก ${partyMembers(world, q).length} คนแยกจาก${p.name} ตั้ง${q.name}`, rebel.id);
    if (inGovernment(world, p) && q.seats) world.parliament!.coalition.push(q.id); // they keep their seats in government, for now
    return true;
  }
  return false;
}

// A government short of a majority buys a greedy opposition member across the floor.
function floorCrossing(world: WorldState, rng: Rng): boolean {
  const house = world.parliament;
  const gov = rulingParty(world);
  const pm = governor(world);
  if (!house || !gov || !pm || gov.treasury < BRIBE || held(world) * 2 > house.seats || !(ambitious(pm) || pm.morality < 0) || !chance(rng, 0.25)) return false;
  const turncoat = partiesOf(world)
    .filter((p) => !inGovernment(world, p))
    .flatMap((p) => p.mps.map((id) => ({ p, n: world.npcs.find((x) => x.id === id && x.alive) })))
    .find((x) => x.n && has(x.n, 'greedy') && x.n.id !== x.p.leaderId);
  if (!turncoat?.n) return false;
  const { p, n } = turncoat;
  gov.treasury -= BRIBE;
  n.gold += BRIBE;
  p.mps = p.mps.filter((id) => id !== n.id);
  p.seats = p.mps.length;
  gov.mps.push(n.id);
  gov.seats = gov.mps.length;
  n.partyId = gov.id;
  log(world, 'politics', `${n.name} ส.ส.${p.name} ย้ายไปอยู่${gov.name} ข่าวลือว่ารับเงิน ${BRIBE} ทอง`, n.id);
  if (known(world, 'printing') && chance(rng, 0.4)) {
    for (const v of adults(world)) if (literate(v)) loyaltyNudge(v, -3);
    ensureCrown(world).unrest += 1;
    log(world, 'politics', `ใบปลิวเปิดโปงการซื้อตัว ส.ส. ของ${gov.name} ชาวเมืองเรียกว่า "งูเห่า"`, n.id);
  }
  return true;
}

// The opposition moves no confidence in a weak or unpopular government. Partners who were made to
// swallow a broken promise, and ambitious members of the head's own party, may vote it down.
function noConfidence(world: WorldState, rng: Rng): void {
  const house = world.parliament;
  const head = governor(world);
  if (!house || !head || !house.coalition.length || house.elections < 1) return;
  const weak = held(world) * 2 <= house.seats || approval(world) < 32;
  if (!weak || !chance(rng, NO_CONFIDENCE)) return;
  const own = partyOf(world, head);
  let ayes = 0;
  for (const n of mps(world)) {
    const p = partyOf(world, n)!;
    if (!inGovernment(world, p)) ayes++;
    else if (p !== own && ((p.broke !== undefined && world.day - p.broke < 365) || (rulingParty(world)?.broke ?? -9999) > world.day - 365) && chance(rng, 0.5)) ayes++;
    else if (p === own && n !== head && ambitious(n) && getTie(world, n.id, head.id) < 0 && chance(rng, 0.3)) ayes++;
  }
  const passed = ayes * 2 > house.seats;
  log(world, 'politics', `ฝ่ายค้านยื่นญัตติไม่ไว้วางใจ${head.name} มติ ${ayes} ต่อ ${house.seats - ayes} ${passed ? 'รัฐบาลแพ้มติ ต้องยุบสภาเลือกตั้งใหม่' : 'รัฐบาลรอดไปได้'}`, head.id);
  if (!passed) return;
  if (world.regime === 'republic') world.republic!.nextVote = world.day; // republicDay calls the election tomorrow
  else house.nextVote = world.day;
}

// A republic's or a crown's parliament granted: an empty house waits for its first election.
export function openParliament(world: WorldState): void {
  world.parliament ??= { seats: 0, coalition: [], nextVote: world.day + 30, elections: 0 };
}
