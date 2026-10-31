// What the crown does with gold it has no use for. Taxes and tithes bring in more than the
// soldiers, works and bounties cost, so past a comfortable reserve the ruler spends two-fifths
// of the surplus each month, each in their own way: a kind ruler gives alms, a brave one arms the
// soldiers, a greedy one buys jewels, a vengeful one lets the court feast on it. The other
// regimes spend on their own: the church, the merchants' caravans, the army, the poor.
import { log } from './core';
import { ensureMarket, levelOf } from './market';
import { king, payrollReserve } from './society';
import { WORK_ORDER, built, workCost } from './works';
import { known } from './core';
import type { Npc, WorldState } from './types';

const SPEND_DAY = 16; // day of the month the surplus is spent
const CUSHION = 1000; // gold kept beyond three paydays and the next work
const SHARE = 0.4; // of the surplus, each month
const LOUD = 150; // spending this large makes the chronicle
const ALMS_EACH = 10; // the most a poor townsperson is handed in a month
const WEALTHY = 500; // a purse past this is spent from each month
const LAVISH = 0.06; // of what's past it

type Outlet = 'alms' | 'arms' | 'jewels' | 'court' | 'church' | 'trade' | 'feast';

// Gold the ruler wants to keep: three paydays, the cushion, and the next work they could afford.
function reserve(world: WorldState): number {
  const next = WORK_ORDER.filter((w) => (w === 'monument' || !built(world, w)) && (w !== 'boulevard' || known(world, 'steam')) && (w !== 'powerplant' || known(world, 'electricity'))).map((w) => workCost(world, w)); // the boulevard is no prospect before steam
  return payrollReserve(world) * 3 + CUSHION + (next.length ? Math.min(...next) : 0);
}

function outletOf(world: WorldState, ruler: Npc): Outlet {
  switch (world.regime) {
    case 'theocracy':
      return 'church';
    case 'oligarchy':
      return 'trade';
    case 'junta':
      return 'arms';
    case 'republic':
      return 'alms';
  }
  const has = (t: Npc['traits'][number]) => ruler.traits.includes(t);
  return has('greedy') ? 'jewels' : has('vengeful') ? 'court' : has('kind') ? 'alms' : has('brave') ? 'arms' : 'feast';
}

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);

// Split gold evenly among some townsfolk; the remainder stays in the purse.
function share(to: Npc[], gold: number): number {
  if (!to.length) return 0;
  const each = Math.floor(gold / to.length);
  for (const n of to) n.gold += each;
  return each * to.length;
}

// The town's rich spend too, each in their way: the kind on the church's larder, the greedy
// hardly at all, the rest on fine things from the market and nights at the inn.
function richSpend(world: WorldState): void {
  const m = ensureMarket(world);
  const keepers = adults(world).filter((n) => n.job === 'innkeeper');
  const wealthy = WEALTHY * levelOf(world); // rich, in what the coin buys today
  for (const n of adults(world)) {
    if (n.gold <= wealthy) continue;
    const gold = Math.floor((n.gold - wealthy) * LAVISH * (n.traits.includes('greedy') ? 0.3 : 1));
    n.gold -= gold;
    if (n.traits.includes('kind')) world.alms = (world.alms ?? 0) + gold;
    else m.till += gold - share(keepers.filter((k) => k !== n), Math.floor(gold / 3));
  }
}

export function spendSurplus(world: WorldState): void {
  if (world.day % 30 !== SPEND_DAY) return;
  richSpend(world);
  const ruler = king(world);
  if (!ruler) return;
  const gold = Math.floor((world.treasury - reserve(world)) * SHARE);
  if (gold < 20) return;
  const outlet = outletOf(world, ruler);
  const m = ensureMarket(world);
  let spent = gold;
  let what = '';
  switch (outlet) {
    case 'alms': {
      // A few coins each to the poorest third (not enough to keep them from work); the rest
      // stocks the church's larder for the hungry.
      const poor = adults(world).sort((a, b) => a.gold - b.gold).slice(0, Math.ceil(adults(world).length / 3));
      const handout = share(poor, Math.min(gold, poor.length * ALMS_EACH));
      world.alms = (world.alms ?? 0) + gold - handout;
      for (const n of poor) n.loyalty = Math.min(100, (n.loyalty ?? 50) + 2);
      what = `แจกทานคนยากจน ${poor.length} คน`;
      break;
    }
    case 'arms': {
      // Gear for soldiers who lack it, then a bonus for every man under arms.
      const soldiers = adults(world).filter((n) => n.job === 'soldier' || n.knight);
      let left = gold;
      for (const s of soldiers.filter((n) => (n.gear ?? 0) < 2)) {
        if (m.stock.gear < 1 || left < m.price.gear) break;
        left -= m.price.gear;
        m.stock.gear--;
        m.till += m.price.gear;
        s.gear = (s.gear ?? 0) + 1;
      }
      spent = gold - left + share(soldiers, left);
      for (const s of soldiers) s.loyalty = Math.min(100, (s.loyalty ?? 50) + 2);
      what = `ทุ่มให้กองทัพ ทหาร ${soldiers.length} นายได้อาวุธและเงินพิเศษ`;
      break;
    }
    case 'jewels':
      // Gone into crowns and goblets; a little sticks to the ruler's own fingers.
      ruler.gold += Math.floor(gold * 0.2);
      for (const n of adults(world)) if (n.gold < 15) n.loyalty = Math.max(0, (n.loyalty ?? 50) - 1);
      what = 'ซื้ออัญมณีและเครื่องทองเข้าคลังส่วนตัว';
      break;
    case 'court': {
      // Feasts for the court: half goes to the nobles' purses, the rest is eaten and drunk.
      const nobles = adults(world).filter((n) => n.job === 'noble');
      share(nobles, Math.floor(gold / 2));
      what = `จัดงานเลี้ยงให้ขุนนาง ${nobles.length} คน`;
      break;
    }
    case 'church': {
      const priests = adults(world).filter((n) => n.job === 'priest');
      share(priests, Math.floor(gold / 2));
      world.faith += gold / 50;
      what = 'ถวายวัดและจัดพิธีบวงสรวงเทพเจ้า';
      break;
    }
    case 'trade':
      m.till += gold; // capital for the shop and its caravans
      what = 'ลงทุนกับร้านค้าและกองคาราวาน';
      break;
    case 'feast': {
      // A town feast: the innkeepers and the market are paid for it.
      const keepers = adults(world).filter((n) => n.job === 'innkeeper');
      m.till += gold - share(keepers, Math.floor(gold / 2));
      for (const n of adults(world)) n.loyalty = Math.min(100, (n.loyalty ?? 50) + 1);
      what = 'จัดงานเลี้ยงให้ชาวเมืองทั้งเมือง';
      break;
    }
  }
  world.treasury -= spent;
  if (spent >= LOUD) log(world, 'politics', `กษัตริย์${ruler.name}ใช้ทองส่วนเกินจากท้องพระคลัง ${spent} เหรียญ ${what}`, ruler.id);
}

