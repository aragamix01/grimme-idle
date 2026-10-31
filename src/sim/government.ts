// How the town is governed. A king rules by default, but not alone: the nobles sit as his
// council and vote on every decree, and a council that says no can stop one, unless the king
// is strong enough to override them and willing to pay for it in their loyalty.
import { chance, type Rng } from './rng';
import { log, loyaltyNudge } from './core';
import { RULER_TH } from './lexicon';
import { crownPower, loyaltyOf } from './politics';
import { getTie } from './ties';
import { charterOf } from './charter';
import { lobby } from './adventurers';
import { houses } from './tradehouses';
import { bodyIdeology, hasParliament, inGovernment, mps, partyOf, PLATFORM, partiesOf } from './parties';
import type { Decree, Npc, Regime, WorldState } from './types';

export interface RegimeDef {
  name: string;
  ruler: string; // the title of whoever holds power
  text: string;
}

export const REGIMES: Record<Regime, RegimeDef> = {
  monarchy: { name: 'ราชาธิปไตย', ruler: RULER_TH.monarchy, text: 'กษัตริย์ปกครอง โดยมีสภาขุนนางคอยถ่วงดุล' },
  republic: { name: 'สาธารณรัฐ', ruler: RULER_TH.republic, text: 'ชาวเมืองเลือกผู้นำของตนเองทุกสองสามปี' },
  theocracy: { name: 'เทวาธิปไตย', ruler: RULER_TH.theocracy, text: 'นักบวชปกครองในนามของเทพเจ้า' },
  oligarchy: { name: 'คณาธิปไตยพ่อค้า', ruler: RULER_TH.oligarchy, text: 'พ่อค้าผู้มั่งคั่งที่สุดร่วมกันปกครอง' },
  junta: { name: 'คณะทหาร', ruler: RULER_TH.junta, text: 'ทหารยึดอำนาจและปกครองด้วยกำลัง' },
  commune: { name: 'สาธารณรัฐประชาชน', ruler: RULER_TH.commune, text: 'พรรคของคนงานปกครองในนามของประชาชน ทรัพย์สินเป็นของส่วนรวม' },
};

export const regimeOf = (world: WorldState): Regime => world.regime ?? 'monarchy';
// The ruler's title, and the sprite they wear, under the town's regime.
export const rulerTitle = (world: WorldState) => REGIMES[regimeOf(world)].ruler;
const LOOK: Record<Regime, string> = { monarchy: 'king', republic: 'consul', theocracy: 'pontiff', oligarchy: 'oligarch', junta: 'general', commune: 'secretary' };
export const rulerLook = (world: WorldState) => LOOK[regimeOf(world)];

const OVERRIDE_POWER = 70; // a crown this strong can ignore its council
const SNUB = -8; // loyalty a councillor loses when the king overrides their no

const SEATS = 7; // the most a regime's own council seats

// Who sits on the council that votes on the ruler's decrees: each regime has its own. The elected
// house where there is one; the senior priests, the heads of the trade houses and the richest
// merchants, the senior officers, or the Party's politburo; under a plain crown, the nobles.
export function council(world: WorldState): Npc[] {
  const seated = (n: Npc) => n.alive && n.age >= 16 && n.job !== 'king' && n.inside === undefined;
  const nobles = world.npcs.filter((n) => seated(n) && n.job === 'noble');
  if (hasParliament(world)) {
    const house = mps(world);
    const free = (world.parliament?.independents ?? []).map((id) => world.npcs.find((n) => n.id === id)).filter((n): n is Npc => !!n && seated(n));
    return house.length + free.length >= 2 ? [...house, ...free] : nobles; // before the first election, the old council sits on
  }
  const top = (list: Npc[], score: (n: Npc) => number) => list.sort((a, b) => score(b) - score(a)).slice(0, SEATS);
  const folk = world.npcs.filter(seated);
  switch (world.regime) {
    case 'theocracy':
      return top(folk.filter((n) => n.job === 'priest'), (n) => n.level + (n.piety ?? 50) / 25);
    case 'oligarchy': {
      const heads = new Set(houses(world).map((g) => g.leaderId));
      return top(folk.filter((n) => heads.has(n.id) || n.job === 'merchant' || n.job === 'noble'), (n) => (heads.has(n.id) ? 1e6 : 0) + n.gold);
    }
    case 'junta':
      return top(folk.filter((n) => n.job === 'soldier' || n.knight), (n) => n.level + (n.gear ?? 0));
    case 'commune': {
      const party = partiesOf(world)[0];
      return party ? top(folk.filter((n) => n.partyId === party.id), (n) => n.level + loyaltyOf(n) / 25) : [];
    }
    default:
      return nobles;
  }
}

// How a councillor leans on a decree: their own interest and temper, then how they feel about
// the crown and about the king himself.
function lean(world: WorldState, n: Npc, d: Decree, ruler: Npc): number {
  const has = (t: Npc['traits'][number]) => (n.traits.includes(t) ? 1 : 0);
  const stake: Record<Decree, number> = {
    labour: 0.5 - has('greedy'), // gold spent on strangers
    subsidy: has('kind') - has('greedy') * 2, // the treasury feeding the poor
    bounty: has('brave') - has('greedy'),
    curfew: 0.5 + has('vengeful') - has('kind'), // order suits the gentry
    taxfree: 1 + has('greedy'), // their tribute is spared too
    levy: has('brave') + has('loyal') - has('coward') - 0.5, // their tenants marched off
    colonize: has('greedy') + has('brave') * 0.5 - has('kind') * 1.5, // new estates, bought with the villages' grief
    expand: 0.5 + has('kind') - has('greedy') * 0.5,
    tribute: has('greedy') - has('kind'),
    relief: has('kind') - has('greedy'),
    garrison: has('brave') + has('vengeful') - has('kind'),
    debase: has('greedy') * 0.5 - has('loyal') - 0.5, // their rents are paid in the same thin coin
    tariff: has('greedy') * 0.5 - 0.25, // the crown's gain, their merchants' loss
    embargo: has('vengeful') + has('brave') * 0.5 - has('greedy') * 0.5,
    ceiling: has('kind') - has('greedy') * 1.5, // their own granaries sell at the cap too
  };
  // A councillor who sits for a party or a body votes its platform, and a party in government
  // backs its own ministers; the nobles' own stake weighs less on anyone but a noble.
  const ideo = bodyIdeology(world, n);
  const platform = ideo ? (PLATFORM[ideo].likes.includes(d) ? 1.5 : PLATFORM[ideo].hates.includes(d) ? -1.5 : 0) : 0;
  const p = partyOf(world, n);
  const side = p && p.mps.includes(n.id) ? (inGovernment(world, p) ? 0.8 : -0.8) : 0;
  return stake[d] * (n.job === 'noble' || !ideo ? 1 : 0.5) + platform + side + (loyaltyOf(n) - 50) / 25 + getTie(world, n.id, ruler.id) / 50;
}

// The council votes on a decree the king wants. True if it goes ahead.
export function putToCouncil(world: WorldState, d: Decree, name: string, ruler: Npc, rng: Rng): boolean {
  const seats = council(world);
  const house = hasParliament(world);
  if (seats.length < 2 || (!charterOf(world).councilVeto && !house) || charterOf(world).emergency) return true; // too few lords, no veto in the charter, or emergency powers
  // A council in a feud with the ruler votes everything down.
  const feud = (world.council?.deadlock ?? 0) > world.day;
  const nays = feud ? seats : seats.filter((n) => lean(world, n, d, ruler) + (chance(rng, 0.5) ? 0.5 : -0.5) < 0);
  const c = (world.council ??= { vetoes: 0, overrides: 0 });
  // A guild with the weight to be heard casts its seat (or two) with the lords.
  const guild = lobby(world, d);
  const total = seats.length + (guild?.weight ?? 0);
  const no = nays.length + (guild && !guild.aye ? guild.weight : 0);
  const tally = `${total - no} ต่อ ${no}`;
  const swung = !!guild && (no * 2 <= total) !== (nays.length * 2 <= seats.length);
  if (swung) log(world, 'guild', `${guild!.guild.name}ล็อบบี้สภา${guild!.aye ? 'หนุน' : 'ค้าน'}${name} จนพลิกผลมติ`);
  if (no * 2 <= total) {
    c.last = { decree: d, day: world.day, ayes: total - no, nays: no, result: 'passed' };
    return true;
  }
  if (house) {
    // No one overrides an elected house.
    c.vetoes++;
    c.last = { decree: d, day: world.day, ayes: total - no, nays: no, result: 'vetoed' };
    log(world, 'politics', `รัฐสภาลงมติไม่เห็นชอบ${name} (${tally}) รัฐบาลของ${ruler.name}ต้องถอนเรื่อง`, ruler.id);
    return false;
  }
  // A strong crown, or a hot-headed king, may push it through anyway.
  const forceful = crownPower(world).total >= OVERRIDE_POWER || ((ruler.traits.includes('vengeful') || ruler.traits.includes('greedy')) && chance(rng, 0.4));
  if (forceful) {
    for (const n of nays) loyaltyNudge(n, SNUB);
    c.overrides++;
    c.last = { decree: d, day: world.day, ayes: total - no, nays: no, result: 'overridden' };
    log(world, 'politics', `สภาขุนนางลงมติคัดค้าน${name} (${tally}) แต่กษัตริย์${ruler.name}ทรงใช้พระราชอำนาจผลักดันจนได้ ขุนนางที่คัดค้านไม่พอใจ`, ruler.id);
    return true;
  }
  c.vetoes++;
  c.last = { decree: d, day: world.day, ayes: total - no, nays: no, result: 'vetoed' };
  log(world, 'politics', `สภาขุนนางลงมติยับยั้ง${name} (${tally}) กษัตริย์${ruler.name}ต้องถอยไปก่อน`, ruler.id);
  return false;
}
