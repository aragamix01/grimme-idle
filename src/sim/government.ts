// How the town is governed. A king rules by default, but not alone: the nobles sit as his
// council and vote on every decree, and a council that says no can stop one, unless the king
// is strong enough to override them and willing to pay for it in their loyalty.
import { chance, type Rng } from './rng';
import { log, loyaltyNudge } from './core';
import { crownPower, loyaltyOf } from './politics';
import { getTie } from './ties';
import type { Decree, Npc, Regime, WorldState } from './types';

export interface RegimeDef {
  name: string;
  ruler: string; // the title of whoever holds power
  text: string;
}

export const REGIMES: Record<Regime, RegimeDef> = {
  monarchy: { name: 'ราชาธิปไตย', ruler: 'กษัตริย์', text: 'กษัตริย์ปกครอง โดยมีสภาขุนนางคอยถ่วงดุล' },
  republic: { name: 'สาธารณรัฐ', ruler: 'ผู้นำสภา', text: 'ชาวเมืองเลือกผู้นำของตนเองทุกสองสามปี' },
  theocracy: { name: 'เทวาธิปไตย', ruler: 'มหานักบวช', text: 'นักบวชปกครองในนามของเทพเจ้า' },
  oligarchy: { name: 'คณาธิปไตยพ่อค้า', ruler: 'ประธานสมาคมการค้า', text: 'พ่อค้าผู้มั่งคั่งที่สุดร่วมกันปกครอง' },
  junta: { name: 'คณะทหาร', ruler: 'จอมทัพ', text: 'ทหารยึดอำนาจและปกครองด้วยกำลัง' },
};

export const regimeOf = (world: WorldState): Regime => world.regime ?? 'monarchy';

const OVERRIDE_POWER = 70; // a crown this strong can ignore its council
const SNUB = -8; // loyalty a councillor loses when the king overrides their no

export const council = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.job === 'noble');

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
  };
  return stake[d] + (loyaltyOf(n) - 50) / 25 + getTie(world, n.id, ruler.id) / 50;
}

// The council votes on a decree the king wants. True if it goes ahead.
export function putToCouncil(world: WorldState, d: Decree, name: string, ruler: Npc, rng: Rng): boolean {
  const seats = council(world);
  if (seats.length < 2) return true; // too few lords to stand in the way
  const nays = seats.filter((n) => lean(world, n, d, ruler) + (chance(rng, 0.5) ? 0.5 : -0.5) < 0);
  const c = (world.council ??= { vetoes: 0, overrides: 0 });
  const tally = `${seats.length - nays.length} ต่อ ${nays.length}`;
  if (nays.length * 2 <= seats.length) {
    c.last = { decree: d, day: world.day, ayes: seats.length - nays.length, nays: nays.length, result: 'passed' };
    return true;
  }
  // A strong crown, or a hot-headed king, may push it through anyway.
  const forceful = crownPower(world).total >= OVERRIDE_POWER || ((ruler.traits.includes('vengeful') || ruler.traits.includes('greedy')) && chance(rng, 0.4));
  if (forceful) {
    for (const n of nays) loyaltyNudge(n, SNUB);
    c.overrides++;
    c.last = { decree: d, day: world.day, ayes: seats.length - nays.length, nays: nays.length, result: 'overridden' };
    log(world, 'politics', `สภาขุนนางลงมติคัดค้าน${name} (${tally}) แต่กษัตริย์${ruler.name}ทรงใช้พระราชอำนาจผลักดันจนได้ ขุนนางที่คัดค้านไม่พอใจ`, ruler.id);
    return true;
  }
  c.vetoes++;
  c.last = { decree: d, day: world.day, ayes: seats.length - nays.length, nays: nays.length, result: 'vetoed' };
  log(world, 'politics', `สภาขุนนางลงมติยับยั้ง${name} (${tally}) กษัตริย์${ruler.name}ต้องถอยไปก่อน`, ruler.id);
  return false;
}
