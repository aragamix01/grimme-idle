// Who holds the town, and how firmly. Everyone grown has a loyalty to the throne;
// the king sets taxes by temperament and purse; knights, festivals and the army prop
// the crown up, and when it weakens, ambitious nobles plot and the hungry rise.
import { chance, pick, type Rng } from './rng';
import { clamp, decreeActive, kill, log } from './core';
import { getTie, FRIEND } from './ties';
import { legend } from './quests';
import { enthrone, king, payrollReserve } from './society';
import { sway } from './cult';
import type { Crown, Npc, Tax, WorldState } from './types';

export const TAX_RATE: Record<Tax, number> = { low: 0.04, normal: 0.08, high: 0.14 };
export const TAX_TH: Record<Tax, string> = { low: 'ภาษีต่ำ', normal: 'ภาษีปกติ', high: 'ภาษีสูง' };
const MAX_KNIGHTS = 4;
const KNIGHT_RANK = 3; // C or better
const FESTIVAL_COST = 250;
const FESTIVAL_GAP = 240; // days between festivals at the most
const PLOT_POWER = 45; // nobles only plot against a crown weaker than this
const UNREST_APPROVAL = 25; // two months below this and the streets rise

export const loyaltyOf = (n: Npc) => n.loyalty ?? 50;
const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.job !== 'king');
const armed = (world: WorldState) => world.npcs.filter((n) => n.alive && n.inside === undefined && (n.job === 'soldier' || n.knight));
const nudge = (n: Npc, by: number) => (n.loyalty = clamp(loyaltyOf(n) + by, 0, 100));

export function ensureCrown(world: WorldState): Crown {
  return (world.crown ??= { since: world.day, tax: 'normal', unrest: 0 });
}

// How content the town is with its king: average loyalty of everyone grown, 0..100.
export function approval(world: WorldState): number {
  const a = adults(world);
  return a.length ? a.reduce((s, n) => s + loyaltyOf(n), 0) / a.length : 50;
}

// The crown's grip, 0..100: a loyal, armed garrison, a court behind it, gold in the
// treasury and a contented people.
export function crownPower(world: WorldState) {
  const army = Math.min(40, armed(world).reduce((s, n) => s + (1 + (n.gear ?? 0) * 0.5) * (loyaltyOf(n) / 100), 0) * 4);
  const court = Math.min(20, adults(world).filter((n) => n.job === 'noble').reduce((s, n) => s + (loyaltyOf(n) / 100) * 8, 0)) + (world.works?.palace !== undefined ? 8 : 0); // a palace awes the court
  const purse = Math.min(15, world.treasury / 100);
  const people = approval(world) * 0.25;
  return { army, court, purse, people, total: Math.round(army + court + purse + people) };
}

export function rule(world: WorldState, rng: Rng): void {
  const crown = ensureCrown(world);
  const k = king(world);
  if (!k) return;
  if (world.day % 10 === 0) drift(world, k);
  const day = world.day % 30;
  if (day === 5) {
    setTaxes(world, crown, k);
    embezzle(world, k);
  }
  if (day === 12) festival(world, crown, k);
  if (day === 18) knight(world, k);
  if (day === 20) plot(world, k, rng);
  if (day === 25) unrest(world, crown, k, rng);
}

// Every ten days loyalty settles toward the middle and moves with how life is going.
function drift(world: WorldState, k: Npc): void {
  const tax = ensureCrown(world).tax;
  const taxfree = decreeActive(world, 'taxfree');
  const curfew = decreeActive(world, 'curfew');
  for (const n of adults(world)) {
    let by = (50 - loyaltyOf(n)) * 0.1; // feelings fade; only what keeps happening holds them away from 50
    if ((n.hunger ?? 0) >= 2) by -= 4;
    by += tax === 'high' ? -1.5 : tax === 'low' ? 1 : 0;
    if (k.traits.includes('kind')) by += 0.5;
    if (k.traits.includes('greedy')) by -= 0.5;
    by += getTie(world, n.id, k.id) / 40;
    if (n.knight) by += 1;
    if (taxfree) by += 2;
    if (curfew && !['noble', 'soldier'].includes(n.job)) by -= 0.8;
    if (n.job === 'noble' && ambitious(n)) by -= 1;
    // The palace pleases the court and galls the poor.
    if (world.works?.palace !== undefined) by += n.job === 'noble' ? 1 : n.gold < 15 ? -0.5 : 0;
    nudge(n, by);
  }
}

const ambitious = (n: Npc) => n.traits.includes('greedy') || n.traits.includes('vengeful');

// The king sets the tax by temperament and by how full the treasury is.
function setTaxes(world: WorldState, crown: Crown, k: Npc): void {
  const levels: Tax[] = ['low', 'normal', 'high'];
  const reserve = payrollReserve(world);
  const t = world.treasury;
  // Thresholds overlap so the rate doesn't flip back and forth every month.
  const want: Record<Tax, Tax> = {
    high: t > reserve * 4 + 300 ? 'normal' : 'high',
    normal: t < reserve * 2 + 100 ? 'high' : t > 1500 ? 'low' : 'normal',
    low: t < 700 ? 'normal' : 'low',
  };
  let i = levels.indexOf(want[crown.tax]);
  if (k.traits.includes('greedy')) i = Math.min(2, i + 1);
  if (k.traits.includes('kind') && world.treasury > reserve * 3) i = Math.max(0, i - 1);
  const next = levels[i];
  if (next === crown.tax) return;
  const up = levels.indexOf(next) > levels.indexOf(crown.tax);
  crown.tax = next;
  log(world, 'politics', `กษัตริย์${k.name}${up ? 'ขึ้นภาษี' : 'ลดภาษี'} ตอนนี้เป็น${TAX_TH[next]}`, k.id);
}

// A greedy king helps himself to the treasury; the court notices.
function embezzle(world: WorldState, k: Npc): void {
  if (!k.traits.includes('greedy') || world.treasury < payrollReserve(world) + 200) return;
  const take = Math.floor(world.treasury * 0.05);
  world.treasury -= take;
  k.gold += take;
  for (const n of adults(world)) if (n.job === 'noble') nudge(n, -2);
}

// A full treasury buys goodwill: a feast for the whole town, the inns doing the serving.
function festival(world: WorldState, crown: Crown, k: Npc): void {
  const cost = Math.max(FESTIVAL_COST, Math.floor(world.treasury * 0.15)); // the richer the crown, the grander the feast
  if (world.treasury < cost + payrollReserve(world) + 600) return;
  const gap = world.treasury > 2000 ? FESTIVAL_GAP / 2 : FESTIVAL_GAP; // a bulging treasury throws parties more often
  if (world.day - (crown.lastFestival ?? -FESTIVAL_GAP) < gap) return;
  if (!k.traits.includes('kind') && approval(world) > 60) return; // a content town needs no feast, unless the king is generous
  world.treasury -= cost;
  crown.lastFestival = world.day;
  sway(world, 2);
  const keepers = adults(world).filter((n) => n.job === 'innkeeper');
  for (const n of keepers) n.gold += Math.floor((cost * 0.6) / keepers.length);
  for (const n of adults(world)) nudge(n, 10);
  log(world, 'politics', `กษัตริย์${k.name}จัดเทศกาลเฉลิมฉลอง ชาวเมืองกินดื่มกันทั้งเมือง`, k.id);
}

// Renowned adventurers who stand by the crown are knighted: paid, sworn, and counted on.
function knight(world: WorldState, k: Npc): void {
  if (adults(world).filter((n) => n.knight).length >= MAX_KNIGHTS) return;
  const pick = adults(world)
    .filter((n) => !n.knight && (n.rank ?? -1) >= KNIGHT_RANK && n.job !== 'noble' && loyaltyOf(n) >= 45)
    .sort((a, b) => (b.renown ?? 0) - (a.renown ?? 0))[0];
  if (!pick) return;
  pick.knight = true;
  nudge(pick, 20);
  log(world, 'politics', `กษัตริย์${k.name}แต่งตั้ง${pick.name}เป็นอัศวินแห่งราชบัลลังก์`, pick.id);
}

function exile(world: WorldState, n: Npc, why: string): void {
  n.alive = false;
  n.left = true;
  n.plan = undefined;
  log(world, 'politics', `${n.name} ${why}`, n.id);
}

// An ambitious noble with gold and a weak king gathers the disloyal and strikes, unless
// a courtesan who heard too much tells the palace first.
function plot(world: WorldState, k: Npc, rng: Rng): void {
  if (crownPower(world).total >= PLOT_POWER) return;
  const schemer = adults(world)
    .filter((n) => n.job === 'noble' && (ambitious(n) || loyaltyOf(n) < 30) && n.gold >= 120 && n.inside === undefined)
    .sort((a, b) => loyaltyOf(a) - loyaltyOf(b))[0];
  if (!schemer || !chance(rng, 0.35)) return;
  const courtesans = adults(world).filter((n) => n.job === 'courtesan');
  if (courtesans.length && chance(rng, 0.35)) {
    const spy = pick(rng, courtesans);
    log(world, 'politics', `นางคณิกา${spy.name}แอบทูลกษัตริย์${k.name}เรื่องแผนกบฏของ${schemer.name}`, spy.id);
    exile(world, schemer, 'ถูกริบทรัพย์และเนรเทศออกจากเมืองฐานคิดกบฏ');
    world.treasury += schemer.gold;
    schemer.gold = 0;
    return;
  }
  const friends = adults(world).filter((n) => n !== schemer && getTie(world, n.id, schemer.id) >= FRIEND).length;
  const turncoats = armed(world).filter((n) => loyaltyOf(n) < 40);
  const loyal = armed(world).filter((n) => loyaltyOf(n) >= 40);
  const rebels = turncoats.reduce((s, n) => s + 1 + (n.gear ?? 0) * 0.5, 0) + friends * 0.5 + schemer.gold / 200;
  const guard = loyal.reduce((s, n) => s + 1 + (n.gear ?? 0) * 0.5, 0);
  log(world, 'politics', `${schemer.name}นำกำลัง${turncoats.length ? `และทหารแปรพักตร์ ${turncoats.length} นาย` : ''}บุกวังหมายชิงบัลลังก์!`, schemer.id);
  sway(world, -3); // blood in the palace
  if (chance(rng, rebels / (rebels + guard + 0.5))) {
    depose(world, k, schemer, rng);
    enthrone(world, schemer, `ยึดอำนาจจากกษัตริย์${k.name}`);
    legend(world, `${schemer.name} ยึดบัลลังก์จากกษัตริย์${k.name}`, schemer.id);
    for (const n of loyal) nudge(n, -20);
    for (const n of turncoats) nudge(n, 25);
  } else if (k.traits.includes('kind')) {
    exile(world, schemer, 'แพ้ในการรัฐประหาร ถูกเนรเทศออกจากเมือง');
  } else {
    kill(world, schemer, 'ถูกประหารฐานกบฏ');
  }
}

// In a long golden age the crown is too strong to storm, so the court's rich and restless
// scheme in quieter ways: poison at a feast, or gold to turn the guard. Returns whether
// anything came of it.
export function intrigue(world: WorldState, k: Npc, rng: Rng): boolean {
  const schemer = adults(world)
    .filter((n) => n.job === 'noble' && n.inside === undefined && n.gold >= 150 && (ambitious(n) || loyaltyOf(n) < 50 || n.morality < 0))
    .sort((a, b) => b.gold - a.gold)[0];
  if (!schemer) return false;
  const courtesans = adults(world).filter((n) => n.job === 'courtesan');
  if (courtesans.length && chance(rng, 0.3)) {
    const spy = pick(rng, courtesans);
    log(world, 'politics', `นางคณิกา${spy.name}ได้ยิน${schemer.name}วางแผนลับในงานเลี้ยง จึงแอบทูลกษัตริย์${k.name}`, spy.id);
    world.treasury += schemer.gold;
    schemer.gold = 0;
    exile(world, schemer, 'ถูกริบทรัพย์และเนรเทศ เพราะความโลภในยามบ้านเมืองรุ่งเรือง');
    return true;
  }
  sway(world, -2);
  if (schemer.morality < 0 && chance(rng, 0.5)) {
    // Poison: quiet, and nobody need know who.
    if (chance(rng, 0.4)) {
      kill(world, k, 'สิ้นพระชนม์กะทันหันหลังงานเลี้ยงฉลองความรุ่งเรือง');
      if (chance(rng, 0.4)) kill(world, schemer, 'ถูกจับได้ว่าวางยาพิษกษัตริย์ ถูกประหารกลางจัตุรัส');
      else log(world, 'politics', `ข่าวลือหนาหูว่า${schemer.name}อยู่เบื้องหลังการสิ้นพระชนม์ แต่ไม่มีใครพิสูจน์ได้`, schemer.id);
    } else kill(world, schemer, `ลอบวางยาพิษกษัตริย์${k.name}ไม่สำเร็จ ถูกจับและประหาร`);
    return true;
  }
  // Bribery: half the schemer's fortune spread among the less loyal of the guard.
  const bribe = Math.floor(schemer.gold / 2);
  schemer.gold -= bribe;
  const guards = armed(world).sort((a, b) => loyaltyOf(a) - loyaltyOf(b));
  const bought = guards.filter((n) => loyaltyOf(n) < 70).slice(0, Math.floor(bribe / 40));
  for (const n of bought) n.gold += Math.floor(bribe / Math.max(1, bought.length));
  const loyal = guards.filter((n) => !bought.includes(n));
  const strength = (list: Npc[]) => list.reduce((s, n) => s + 1 + (n.gear ?? 0) * 0.5, 0);
  const friends = adults(world).filter((n) => n !== schemer && getTie(world, n.id, schemer.id) >= FRIEND).length;
  const rebels = strength(bought) + friends * 0.5;
  log(world, 'politics', `${schemer.name}ใช้ทองซื้อใจทหาร ${bought.length} นาย แล้วบุกวังหมายชิงบัลลังก์ในยามบ้านเมืองสงบสุข!`, schemer.id);
  if (chance(rng, rebels / (rebels + strength(loyal) + 1))) {
    depose(world, k, schemer, rng);
    enthrone(world, schemer, `ซื้อทหารยึดอำนาจจากกษัตริย์${k.name}`);
    legend(world, `${schemer.name} ใช้ทองซื้อบัลลังก์จากกษัตริย์${k.name}`, schemer.id);
    for (const n of bought) nudge(n, 25);
    for (const n of loyal) nudge(n, -15);
  } else if (k.traits.includes('kind')) exile(world, schemer, 'แพ้ในการรัฐประหาร ถูกเนรเทศออกจากเมือง');
  else kill(world, schemer, 'ถูกประหารฐานกบฏ');
  return true;
}

// A cruel usurper kills the old king; a gentler one sends him away.
function depose(world: WorldState, old: Npc, usurper: Npc, rng: Rng): void {
  if (usurper.morality < 0 || chance(rng, 0.2)) kill(world, old, 'ถูกปลงพระชนม์ระหว่างการชิงบัลลังก์');
  else exile(world, old, 'ถูกถอดจากบัลลังก์และเนรเทศออกจากเมือง');
}

// Two bad months in a row and the poorest, angriest commoner leads the town against the palace.
function unrest(world: WorldState, crown: Crown, k: Npc, rng: Rng): void {
  crown.unrest = approval(world) < UNREST_APPROVAL ? crown.unrest + 1 : Math.max(0, crown.unrest - 1);
  if (crown.unrest < 2) return;
  crown.unrest = 0;
  const commoners = adults(world).filter((n) => !['noble', 'soldier'].includes(n.job) && !n.knight && n.questId === undefined && n.inside === undefined);
  const angry = commoners.filter((n) => loyaltyOf(n) < 30);
  const fiery = (n: Npc) => (n.traits.includes('brave') ? 10 : 0) + (n.traits.includes('vengeful') ? 10 : 0) - loyaltyOf(n);
  const leader = angry.sort((a, b) => fiery(b) - fiery(a))[0];
  if (!leader || angry.length < 5) return;
  const guard = armed(world).filter((n) => loyaltyOf(n) >= 40).reduce((s, n) => s + 1 + (n.gear ?? 0) * 0.5, 0);
  log(world, 'politics', `ชาวเมือง ${angry.length} คนนำโดย${leader.name}ลุกฮือขึ้นต่อต้านกษัตริย์${k.name}!`, leader.id);
  if (chance(rng, (angry.length * 0.5) / (angry.length * 0.5 + guard * 2 + 1))) {
    depose(world, k, leader, rng);
    const loot = Math.floor(world.treasury / 2);
    world.treasury -= loot;
    for (const n of angry) n.gold += Math.floor(loot / angry.length);
    enthrone(world, leader, 'นำการปฏิวัติของชาวเมือง');
    legend(world, `${leader.name} นำชาวเมืองโค่นกษัตริย์${k.name}`, leader.id);
    return;
  }
  kill(world, leader, 'ถูกทหารปราบระหว่างการลุกฮือ');
  for (const n of angry) if (n !== leader && chance(rng, 0.08)) kill(world, n, 'ล้มลงระหว่างการลุกฮือ');
  for (const n of angry) nudge(n, -5);
}

// After monsters break in: the garrison that held earns thanks, a crown that left the
// streets open loses face.
export function afterStampede(world: WorldState, shield: number): void {
  for (const n of adults(world)) nudge(n, shield >= 0.2 ? (n.job === 'soldier' ? 4 : 2) : -6);
}

