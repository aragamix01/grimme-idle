// How the town grows from a pioneers' camp into a city. Its rank follows how many live there
// (a camp, a village, a town, a city), and as it grows and takes up new trades, it founds the
// buildings a town has: a shop once someone keeps one, a church once there is a priest, an inn
// once travellers come, the castle and its walls once it is a town. Each is paid for (by the
// crown, or by whoever's trade it serves) and goes up over some weeks. A town founded whole (old
// saves, the tests) has all of them already.
import { isAdventurer, legend, log } from './core';
import { levelOf } from './market';
import { payrollReserve } from './society';
import { townPop } from './housing';
import type { Civic, Npc, WorldState } from './types';

export const TOWN_RANKS = [
  { name: 'ค่ายผู้บุกเบิก', from: 0 },
  { name: 'หมู่บ้าน', from: 40 },
  { name: 'เมือง', from: 80 },
  { name: 'นคร', from: 150 },
] as const;
export const TOWN_RANK = 2; // from here the town is a town: a castle, walls, the crown's works

interface CivicDef {
  name: string;
  when: string; // what it waits for, as the works tab says it
  cost: number; // gold, at the founding's prices
  days: number;
  needs: (world: WorldState, folk: Npc[]) => boolean;
  payer?: Npc['job']; // whose trade it serves: one of them who can afford it pays; else the crown
  text: string;
}

const has = (folk: Npc[], job: Npc['job'], n = 1) => folk.filter((f) => f.job === job).length >= n;

export const CIVICS: Record<Civic, CivicDef> = {
  shop: { name: 'ร้านค้า', when: 'ชาวเมือง 25 คนและมีพ่อค้า', cost: 80, days: 30, needs: (w, f) => townPop(w) >= 25 && has(f, 'merchant'), payer: 'merchant', text: 'พ่อค้ามีที่รับซื้อขายสินค้า' },
  church: { name: 'โบสถ์', when: 'ชาวเมือง 30 คนและมีนักบวช', cost: 120, days: 45, needs: (w, f) => townPop(w) >= 30 && has(f, 'priest'), payer: 'priest', text: 'ผู้ศรัทธามีที่ภาวนา ศรัทธาของผู้คนมั่นคงขึ้น' },
  inn: { name: 'โรงเตี๊ยม', when: 'ชาวเมือง 35 คน', cost: 100, days: 40, needs: (w) => townPop(w) >= 35, payer: 'innkeeper', text: 'นักเดินทางมีที่พัก คนต่างถิ่นแวะมาบ่อยขึ้น' },
  forge: { name: 'โรงตีเหล็ก', when: 'ชาวเมือง 30 คนและมีช่างตีเหล็ก', cost: 90, days: 35, needs: (w, f) => townPop(w) >= 30 && has(f, 'blacksmith'), payer: 'blacksmith', text: 'ช่างตีเหล็กตีอาวุธและเครื่องมือได้' },
  barn: { name: 'โรงนา', when: 'มีคนเลี้ยงสัตว์', cost: 60, days: 25, needs: (_w, f) => has(f, 'herder'), payer: 'herder', text: 'ฝูงสัตว์มีที่หลบหนาว' },
  guild: { name: 'กิลด์นักผจญภัย', when: 'ชาวเมือง 45 คนและนักผจญภัย 4 คน', cost: 150, days: 50, needs: (w, f) => townPop(w) >= 45 && f.filter(isAdventurer).length >= 4, text: 'นักผจญภัยมีที่รับเควสและรวมกลุ่ม' },
  barracks: { name: 'ค่ายทหาร', when: 'ทหาร 3 นาย', cost: 140, days: 45, needs: (_w, f) => has(f, 'soldier', 3), text: 'ทหารมีที่ฝึกและพัก' },
  castle: { name: 'ปราสาท', when: 'ขึ้นเป็นเมือง (80 คน)', cost: 400, days: 120, needs: (w) => rankOf(w) >= TOWN_RANK, text: 'โถงหัวหน้าค่ายกลายเป็นปราสาทหิน' },
  walls: { name: 'กำแพงเมือง', when: 'เป็นเมืองและมีปราสาท', cost: 500, days: 150, needs: (w) => rankOf(w) >= TOWN_RANK && founded(w, 'castle'), text: 'กำแพงหินล้อมเมือง ประตูสามด้าน' },
  manor: { name: 'คฤหาสน์ขุนนาง', when: 'เป็นเมืองและมีขุนนาง', cost: 250, days: 60, needs: (w, f) => rankOf(w) >= TOWN_RANK && has(f, 'noble'), payer: 'noble', text: 'ขุนนางมีที่อยู่สมฐานะ' },
  brothel: { name: 'หอนางโลม', when: 'ชาวเมือง 70 คนและมีนางโลม', cost: 120, days: 40, needs: (w, f) => townPop(w) >= 70 && has(f, 'courtesan'), payer: 'courtesan', text: 'ความบันเทิงยามค่ำคืน' },
};
export const CIVIC_ORDER = Object.keys(CIVICS) as Civic[];
const CHECK_DAY = 9; // day of the month the town looks at what it lacks
const CROWN_SPARE = 150; // beyond the payroll, before the crown pays for one

// A building the town has. Saves from before foundings (and a town founded whole) have them all.
export const founded = (world: WorldState, k: Civic) => !world.founded || world.founded[k] !== undefined;
export const walled = (world: WorldState) => founded(world, 'walls');

export function rankOf(world: WorldState): number {
  const n = townPop(world);
  let r = 0;
  for (let i = 0; i < TOWN_RANKS.length; i++) if (n >= TOWN_RANKS[i].from) r = i;
  return r;
}
export const townRankName = (world: WorldState) => TOWN_RANKS[rankOf(world)].name;

// Who pays: one of the trade it serves who can spare it, else the crown, else nobody yet.
function payer(world: WorldState, folk: Npc[], k: Civic, cost: number): Npc | 'crown' | undefined {
  const job = CIVICS[k].payer;
  const rich = job ? folk.filter((n) => n.job === job && n.gold >= cost).sort((a, b) => b.gold - a.gold)[0] : undefined;
  if (rich) return rich;
  return world.treasury >= cost + payrollReserve(world) + CROWN_SPARE ? 'crown' : undefined;
}

// Daily: a building going up is finished. Monthly: the rank is noted, and the next building the
// town lacks is started if someone can pay.
export function growthDay(world: WorldState): void {
  const r = world.raising;
  if (r && world.day >= r.until) {
    (world.founded ??= {})[r.kind] = world.day;
    world.raising = undefined;
    world.buildRev = (world.buildRev ?? 0) + 1;
    log(world, 'world', `${CIVICS[r.kind].name}สร้างเสร็จแล้ว! ${CIVICS[r.kind].text}`);
    if (r.kind === 'castle' || r.kind === 'walls') legend(world, `สร้าง${CIVICS[r.kind].name}`);
  }
  if (world.day % 30 !== CHECK_DAY) return;
  const rank = rankOf(world);
  if (world.rank === undefined) world.rank = rank;
  else if (rank !== world.rank) {
    const up = rank > world.rank;
    world.rank = rank;
    log(world, 'world', up ? `ผู้คนมาอยู่กันมากขึ้นเรื่อย ๆ ${TOWN_RANKS[rank].name}ของเราเติบโตขึ้นแล้ว!` : `ผู้คนร่อยหรอลง เมืองของเราเหลือเพียง${TOWN_RANKS[rank].name}`);
    if (up && rank >= TOWN_RANK) legend(world, `ถิ่นฐานของเราได้ขึ้นเป็น${TOWN_RANKS[rank].name}`);
  }
  if (!world.founded || world.raising) return;
  const folk = world.npcs.filter((n) => n.alive && n.age >= 16);
  for (const k of CIVIC_ORDER) {
    if (founded(world, k) || !CIVICS[k].needs(world, folk)) continue;
    const cost = Math.round(CIVICS[k].cost * levelOf(world));
    const who = payer(world, folk, k, cost);
    if (!who) continue;
    if (who === 'crown') world.treasury -= cost;
    else who.gold -= cost;
    // The builders are paid from it; with none, the hands that turn out from the market.
    const builders = folk.filter((n) => n.job === 'builder');
    if (builders.length) for (const b of builders) b.gold += Math.floor(cost / builders.length);
    else if (world.market) world.market.till += cost;
    world.raising = { kind: k, until: world.day + Math.max(15, Math.round(CIVICS[k].days / (1 + builders.length * 0.3))) };
    world.buildRev = (world.buildRev ?? 0) + 1;
    log(world, 'world', `${who === 'crown' ? 'ทางการ' : who.name}ออกเงิน ${cost} ทองสร้าง${CIVICS[k].name}`, who === 'crown' ? undefined : who.id);
    return;
  }
}
