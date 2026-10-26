// How regimes rise and fall besides a crown passing from hand to hand. Once a month the town may
// turn: a disloyal army takes over (junta), a bankrupt crown is bought by the merchants
// (oligarchy), a pious town in a bad year hands power to its high priest (theocracy), or a
// reading town reforms itself into a republic, sooner if the god blesses its reformers or sends
// its ruler a vision. Each regime then favours its own: soldiers, the rich, or the faithful.
import { chance, pick, type Rng } from './rng';
import { log, occupied } from './core';
import { legend } from './quests';
import { approval, crownPower, loyaltyOf } from './politics';
import { enthrone, king, payrollReserve } from './society';
import { literacy, literate } from './learning';
import { proclaimRepublic } from './republic';
import type { Npc, Regime, WorldState } from './types';

const TURN_DAY = 27; // day of the month the town may change how it is ruled
const REFORM_LITERACY = 0.6; // readers past which a kind ruler may hand power to the people
const REFORMER_PULL = 0.05; // extra monthly chance of reform for each reformer the god has blessed
const JUNTA_LOYALTY = 35; // an army this sour on its ruler may take over
const PIOUS_FAITH = 300;

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined && n.questId === undefined);
const avgLoyalty = (list: Npc[]) => (list.length ? list.reduce((s, n) => s + loyaltyOf(n), 0) / list.length : 50);

// Literate townsfolk of good heart the god has blessed: they argue for a fairer order.
export const reformers = (world: WorldState) => adults(world).filter((n) => n.blessed && literate(n) && n.morality > 20 && n.job !== 'king' && n.job !== 'noble');

// Who takes power under each regime when the seat falls empty.
export function successor(world: WorldState, r: Regime): Npc | undefined {
  const pool = adults(world);
  if (r === 'theocracy') return pool.filter((n) => n.job === 'priest').sort((a, b) => b.level - a.level || b.age - a.age)[0];
  if (r === 'oligarchy') return pool.filter((n) => n.job === 'merchant' || n.job === 'noble').sort((a, b) => b.gold - a.gold)[0];
  if (r === 'junta') return pool.filter((n) => n.job === 'soldier' || n.knight).sort((a, b) => b.level + (b.gear ?? 0) - (a.level + (a.gear ?? 0)))[0];
  return undefined;
}

// Put a new kind of rule in place with its first ruler.
export function seize(world: WorldState, r: Regime, n: Npc, how: string, legendText: string): void {
  world.regime = r;
  world.republic = undefined;
  if (n.job !== 'king') n.formerJob = n.job;
  enthrone(world, n, how, true);
  legend(world, legendText, n.id);
}

// Monthly: does the town turn?
export function regimeDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== TURN_DAY || occupied(world)) return;
  const ruler = king(world);
  if (!ruler) return;
  const r = world.regime ?? 'monarchy';
  const soldiers = adults(world).filter((n) => n.job === 'soldier' || n.knight);
  // The army turns on a ruler it no longer trusts (any regime but its own).
  // Only once a reign has had time to sour, and only over real grievance: unpaid wages or an angry town.
  const grievance = soldiers.some((n) => (n.unpaid ?? 0) > 0) || approval(world) < 35;
  const settled = world.day - (world.crown?.since ?? 0) > 365;
  if (r !== 'junta' && settled && grievance && soldiers.length >= 6 && avgLoyalty(soldiers) < JUNTA_LOYALTY && crownPower(world).total < 60 && chance(rng, 0.2)) {
    const general = successor(world, 'junta')!;
    log(world, 'politics', `ทหารหมดความอดทนกับ${ruler.name} ${general.name}นำกองทัพยึดอำนาจ ตั้งคณะทหารปกครองเมือง!`, general.id);
    retire(ruler, rng);
    return seize(world, 'junta', general, 'ยึดอำนาจโดยกองทัพ', `${general.name} ยึดอำนาจตั้งคณะทหาร`);
  }
  if (r !== 'monarchy') return; // the other turns happen to crowns
  // A crown that can't pay its way, or that a merchant prince outweighs in gold, is bought out
  // by the merchants who lend to it.
  const magnate = adults(world).filter((n) => n.job === 'merchant').sort((a, b) => b.gold - a.gold)[0];
  const outweighed = !!magnate && magnate.gold >= 300 && magnate.gold > world.treasury * 1.5 && chance(rng, 0.1);
  if (magnate && ((world.treasury < payrollReserve(world) && magnate.gold >= 200 && chance(rng, 0.25)) || outweighed)) {
    log(world, 'politics', `ท้องพระคลังว่างเปล่า กษัตริย์${ruler.name}ติดหนี้พ่อค้าจนต้องยอมสละอำนาจ ${magnate.name}และเหล่าพ่อค้ารวมกันขึ้นปกครองเมือง`, magnate.id);
    retire(ruler, rng);
    return seize(world, 'oligarchy', magnate, 'พ่อค้าซื้ออำนาจจากราชบัลลังก์', `${magnate.name} นำพ่อค้าขึ้นปกครองเมือง`);
  }
  // A frightened, pious town turns from a king who failed it to the church.
  const priest = successor(world, 'theocracy');
  if (priest && world.faith >= PIOUS_FAITH && world.works?.cathedral !== undefined && approval(world) < 40 && chance(rng, 0.15)) {
    log(world, 'politics', `ชาวเมืองหมดศรัทธาในกษัตริย์${ruler.name} หันไปพึ่งมหาวิหาร ${priest.name}ประกาศปกครองเมืองในนามของเทพเจ้า`, priest.id);
    retire(ruler, rng);
    return seize(world, 'theocracy', priest, 'ได้รับการยกย่องจากชาวเมืองผู้ศรัทธา', `${priest.name} ตั้งเทวาธิปไตย`);
  }
  // A reading town and a kind king: power handed to the people without a drop of blood.
  const pull = (ruler.traits.includes('kind') ? 0.012 : 0.003) + reformers(world).length * REFORMER_PULL;
  if (literacy(world) >= REFORM_LITERACY && chance(rng, pull)) {
    const voice = reformers(world)[0] ?? ruler;
    log(world, 'politics', `${voice.name}เรียกร้องให้ชาวเมืองเลือกผู้นำเอง กษัตริย์${ruler.name}ยอมสละราชสมบัติอย่างสงบ`, voice.id);
    retire(ruler, rng);
    proclaimRepublic(world, voice.alive && voice.job !== 'king' ? voice : ruler, rng);
  }
}

// The god's vision to a ruler: a ruler of a reading town sees the people choosing for themselves
// and steps down; otherwise the dream only softens their heart.
export function reformVision(world: WorldState, ruler: Npc, rng: Rng): string {
  if (literacy(world) >= 0.35 && world.regime !== 'republic') {
    const voice = reformers(world)[0] ?? pick(rng, adults(world).filter((n) => literate(n) && n !== ruler).concat(ruler));
    retire(ruler, rng);
    proclaimRepublic(world, voice, rng);
    return 'ตื่นขึ้นมาแล้วประกาศสละอำนาจ ให้ชาวเมืองเลือกผู้นำของตนเอง';
  }
  if (!ruler.traits.includes('kind')) ruler.traits = [...ruler.traits.filter((t) => t !== 'vengeful' && t !== 'greedy').slice(0, 1), 'kind'];
  return 'ตื่นขึ้นมาด้วยหัวใจที่อ่อนโยนลง';
}

// A ruler who loses power lives on as a noble (or goes back to their old trade).
function retire(n: Npc, rng: Rng): void {
  if (!n.alive) return;
  n.job = n.formerJob ?? (chance(rng, 0.5) ? 'noble' : 'merchant');
  n.formerJob = undefined;
  n.plan = undefined;
}
