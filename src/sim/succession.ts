// A reign wears out, and so does the one who holds it. The longer one ruler holds power the more
// the town tires of them; an old ruler falls ill, may lose their mind, may step down for an heir.
// And when a king dies the throne does not always pass quietly: a child heir rules through a
// regent who may not hand power back, and an ambitious lord may contest the heir's right by arms.
import { chance, type Rng } from './rng';
import { clamp, kill, log, occupied } from './core';
import { getTie } from './ties';
import { legend } from './quests';
import { enthrone, king } from './society';
import { loyaltyOf, crownPower, ensureCrown } from './politics';
import { literate } from './learning';
import { isRepublic } from './republic';
import type { Npc, WorldState } from './types';

const REIGN_DAY = 8; // day of the month the court looks at its ruler
const WEARY = 10; // years in power before the town starts to tire of the same face
const WEAR = 0.1; // loyalty lost each ten days for every year past that
const MAX_WEAR = 1.5;
const FRAIL = 60; // a ruler this old may fall ill
const MAD = 50; // and from this age may lose their mind
const STEP_DOWN = 68; // an old ruler may abdicate for a grown heir
const COMING_OF_AGE = 16;

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.job !== 'king');
const ambitious = (n: Npc) => n.traits.includes('greedy') || n.traits.includes('vengeful');
const has = (n: Npc, t: Npc['traits'][number]) => n.traits.includes(t);
const armed = (world: WorldState) => world.npcs.filter((n) => n.alive && n.inside === undefined && (n.job === 'soldier' || n.knight));

export const reignYears = (world: WorldState) => (world.day - (world.crown?.since ?? world.day)) / 365;

// How much a long reign wears on one townsperson's loyalty, each ten days. A republic's voters
// have their own fatigue at the ballot box; readers tire of the same face sooner.
export function weariness(world: WorldState, n: Npc): number {
  if (isRepublic(world) || world.charter?.parliament) return 0; // a crown that reigns and does not rule is not blamed for it
  const over = reignYears(world) - WEARY;
  if (over <= 0 || n.job === 'noble' || n.knight) return 0; // the court has done well out of it
  return -Math.min(MAX_WEAR, over * WEAR) * (literate(n) ? 1.5 : 1);
}

// The ruler's children, eldest first.
const childrenOf = (world: WorldState, k: Npc) => world.npcs.filter((n) => n.alive && n.parentIds?.includes(k.id) && n.job !== 'king').sort((a, b) => b.age - a.age);

// Monthly: the ruler's health and mind, an old ruler stepping down, and a regency's end.
export function reignDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== REIGN_DAY || occupied(world)) return;
  const k = king(world);
  if (!k) return;
  const crown = ensureCrown(world);
  if (crown.regentId !== undefined) return regency(world, k, rng);
  if (isRepublic(world)) return;
  // Illness: an old ruler may fall ill; an ill one may recover, or not.
  if (crown.ailing !== undefined) {
    if (chance(rng, 0.25)) return kill(world, k, 'สิ้นพระชนม์ด้วยพระอาการประชวร');
    if (chance(rng, 0.25)) {
      crown.ailing = undefined;
      log(world, 'politics', `กษัตริย์${k.name}หายจากพระอาการประชวร กลับมาว่าราชการได้อีกครั้ง`, k.id);
    }
    return;
  }
  if (k.age >= FRAIL && chance(rng, (k.age - FRAIL + 5) * 0.004)) {
    crown.ailing = world.day;
    log(world, 'politics', `กษัตริย์${k.name}ประชวรหนัก ราชสำนักเริ่มซุบซิบว่าใครจะสืบบัลลังก์`, k.id);
    return;
  }
  // Madness: rare, and an old or a bitter ruler more than most. The court will not bear it long.
  if (!crown.mad && k.age >= MAD && chance(rng, 0.002 + (has(k, 'vengeful') ? 0.003 : 0))) {
    crown.mad = world.day;
    k.traits = ['vengeful', ...k.traits.filter((t) => t !== 'kind' && t !== 'vengeful').slice(0, 1)];
    log(world, 'politics', `กษัตริย์${k.name}เริ่มเสียสติ ระแวงทุกคนรอบพระองค์ สั่งการแปลก ๆ ไม่เว้นแต่ละวัน`, k.id);
    return;
  }
  const heir = childrenOf(world, k).find((n) => n.age >= COMING_OF_AGE && n.questId === undefined && n.inside === undefined);
  if (crown.mad !== undefined) {
    for (const n of adults(world)) n.loyalty = clamp(loyaltyOf(n) - 2, 0, 100);
    // The council sets a mad ruler aside for their heir, or, with none, the strongest lord.
    const lord = heir ?? adults(world).filter((n) => n.job === 'noble').sort((a, b) => b.gold - a.gold)[0];
    if (lord && chance(rng, 0.2)) {
      log(world, 'politics', `เหล่าขุนนางลงมติว่ากษัตริย์${k.name}ไม่อาจปกครองได้อีกต่อไป เชิญเสด็จไปประทับในวังหลัง`, k.id);
      k.job = 'noble';
      crown.mad = undefined;
      enthrone(world, lord, `ขึ้นครองแทนกษัตริย์${k.name}ที่เสียสติ`, true);
    }
    return;
  }
  // An old ruler with a grown heir may hand the crown on in their lifetime.
  if (heir && k.age >= STEP_DOWN && (has(k, 'kind') || has(k, 'loyal')) && chance(rng, 0.05)) {
    log(world, 'politics', `กษัตริย์${k.name}ทรงชราภาพ สละราชสมบัติให้${heir.name}อย่างสงบ`, k.id);
    k.job = 'noble';
    enthrone(world, heir, `รับราชสมบัติจากกษัตริย์${k.name}`, true);
  }
}

// When the crown passes to someone's children. Returns who now holds it, if anyone.
// A child heir takes the throne with a regent; a grown heir may find their right contested.
export function inherit(world: WorldState, old: Npc, rng: Rng): Npc | undefined {
  const heirs = childrenOf(world, old).filter((n) => n.questId === undefined && n.inside === undefined);
  const heir = heirs[0];
  if (!heir) return undefined;
  if (heir.age < COMING_OF_AGE) {
    const spouse = world.npcs.find((n) => n.id === old.spouseId && n.alive && n.age >= 16);
    const regent = spouse ?? adults(world).filter((n) => n.job === 'noble').sort((a, b) => loyaltyOf(b) + getTie(world, b.id, old.id) - loyaltyOf(a) - getTie(world, a.id, old.id))[0];
    if (!regent) return undefined; // nobody to rule for a child: the lords choose among themselves
    enthrone(world, heir, `สืบราชสมบัติต่อจาก${old.name}เมื่อพระชนม์เพียง ${heir.age} พรรษา`);
    ensureCrown(world).regentId = regent.id;
    log(world, 'politics', `${regent.name}เป็นผู้สำเร็จราชการแทนกษัตริย์${heir.name}จนกว่าจะทรงบรรลุนิติภาวะ`, regent.id);
    return heir;
  }
  // A grown heir: an ambitious lord, or a younger sibling, may say the crown is theirs.
  const rival = [...adults(world).filter((n) => n.job === 'noble' && ambitious(n) && n.gold >= 150 && loyaltyOf(n) < 50), ...heirs.slice(1).filter((n) => n.age >= COMING_OF_AGE && ambitious(n))].find((n) => n !== heir && n.inside === undefined);
  if (rival && chance(rng, 0.5)) return contest(world, old, heir, rival, rng);
  enthrone(world, heir, `สืบราชสมบัติต่อจาก${old.name}`);
  return heir;
}

// A war of succession: the garrison splits by who each soldier is closer to, and the side with
// more steel takes the throne. The loser is cut down or flees; a few soldiers fall either way.
function contest(world: WorldState, old: Npc, heir: Npc, rival: Npc, rng: Rng): Npc {
  const side = (n: Npc) => getTie(world, n.id, heir.id) + 10 - getTie(world, n.id, rival.id) - (rival.gold / 50);
  const soldiers = armed(world);
  const forHeir = soldiers.filter((n) => side(n) >= 0);
  const forRival = soldiers.filter((n) => side(n) < 0);
  const strength = (list: Npc[]) => list.reduce((s, n) => s + 1 + (n.gear ?? 0) * 0.5, 0) + 1;
  log(world, 'politics', `ศึกชิงบัลลังก์! ${rival.name}ไม่ยอมรับ${heir.name}เป็นกษัตริย์ ทหาร ${forHeir.length} นายยืนข้างรัชทายาท ${forRival.length} นายยืนข้าง${rival.name}`, rival.id);
  const won = chance(rng, strength(forHeir) / (strength(forHeir) + strength(forRival))) ? heir : rival;
  const lost = won === heir ? rival : heir;
  for (const n of soldiers) if (chance(rng, 0.08)) kill(world, n, 'ล้มลงในศึกชิงบัลลังก์');
  if (won.morality < 0 || chance(rng, 0.3)) kill(world, lost, `ถูกสังหารในศึกชิงบัลลังก์`);
  else {
    lost.alive = false;
    lost.left = true;
    lost.plan = undefined;
    log(world, 'politics', `${lost.name}แพ้ศึกชิงบัลลังก์ หนีออกจากเมืองไป`, lost.id);
  }
  enthrone(world, won, won === heir ? `สืบราชสมบัติต่อจาก${old.name}หลังชนะศึกชิงบัลลังก์` : `ชิงบัลลังก์จากรัชทายาทของ${old.name}`);
  legend(world, `${won.name} ชนะศึกชิงบัลลังก์`, won.id);
  return won;
}

// A regency ends when the young king comes of age, unless the regent has learnt to like the throne.
function regency(world: WorldState, k: Npc, rng: Rng): void {
  const crown = ensureCrown(world);
  const regent = world.npcs.find((n) => n.id === crown.regentId && n.alive);
  if (!regent) {
    crown.regentId = undefined;
    if (k.age < COMING_OF_AGE) {
      const next = adults(world).filter((n) => n.job === 'noble').sort((a, b) => loyaltyOf(b) - loyaltyOf(a))[0];
      if (next) {
        crown.regentId = next.id;
        log(world, 'politics', `${next.name}เป็นผู้สำเร็จราชการคนใหม่แทนกษัตริย์${k.name}`, next.id);
      }
    }
    return;
  }
  // A grasping regent with the court weak enough may take the throne for good.
  if (ambitious(regent) && crownPower(world).total < 55 && chance(rng, k.age >= COMING_OF_AGE - 1 ? 0.3 : 0.03)) {
    log(world, 'politics', `ผู้สำเร็จราชการ${regent.name}ไม่ยอมคืนอำนาจ ปลดกษัตริย์${k.name}ออกจากบัลลังก์`, regent.id);
    crown.regentId = undefined;
    k.job = 'noble';
    if (regent.morality < -20) kill(world, k, 'สิ้นพระชนม์อย่างมีเงื่อนงำในวังหลัง');
    enthrone(world, regent, `ยึดบัลลังก์จากกษัตริย์${k.name}ที่ยังทรงพระเยาว์`, true);
    legend(world, `${regent.name} ผู้สำเร็จราชการชิงบัลลังก์`, regent.id);
    return;
  }
  if (k.age < COMING_OF_AGE) return;
  crown.regentId = undefined;
  log(world, 'politics', `กษัตริย์${k.name}ทรงบรรลุนิติภาวะ ${regent.name}คืนพระราชอำนาจทั้งหมด`, k.id);
}
