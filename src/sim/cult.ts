// The world's balance between light and dark, and the cult that feeds the dark.
// Balance (-100 evil .. +100 good) follows the town's morals and swings with its deeds.
// A cult grows in secret among the cruel, the hungry and the bitter, gathering at the
// dungeon to feed it; priests, soldiers on watch and the gods can expose its members.
import { chance, pick, type Rng } from './rng';
import { clamp, kill, log, makePlan, occupied, perkLevel } from './core';
import { getTie, FRIEND } from './ties';
import { dungeonDoor } from './places';
import { loyaltyOf } from './politics';
import { guardNear } from './society';
import { feed } from './demonlord';
import type { Npc, WorldState } from './types';

const CULT_NAMES = ['เงาจันทร์', 'ดวงตาสีเลือด', 'งูดำ', 'เปลวไฟนรก', 'รุ่งอรุณมืด', 'มงกุฎหนาม'];
const FOUND_MORALITY = -25;
const MAX_CULTISTS = 14;
const RITUAL_POWER = 1.5; // dungeon power each cultist feeds per ritual
export const REVEAL_COST = 8;
const DREAD_PER_RITUAL = 1.5;

export const balanceOf = (world: WorldState) => world.balance ?? 0;
const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);
export const cultists = (world: WorldState) => world.npcs.filter((n) => n.alive && n.cultist);

// Nudge the balance after a deed: theft and murder darken the world, blessings brighten it.
export function sway(world: WorldState, by: number): void {
  world.balance = clamp(balanceOf(world) + by, -100, 100);
}

export function darkness(world: WorldState, rng: Rng): void {
  const grown = adults(world);
  const morals = grown.length ? grown.reduce((s, n) => s + n.morality, 0) / grown.length : 0;
  // Slow to settle, so a run of deeds or a growing cult can drag it far from what morals alone say.
  world.balance = clamp(balanceOf(world) + (morals * 0.8 - balanceOf(world)) * 0.005, -100, 100);
  // Hunger wears down scruples.
  if (world.day % 10 === 0) for (const n of grown) if ((n.hunger ?? 0) >= 2) n.morality = clamp(n.morality - 1, -100, 100);
  omens(world);
  const day = world.day % 30;
  if (day === 7) found(world, rng);
  if (day === 14) recruit(world, rng);
  if (day === 22) ritual(world, rng);
  if (day === 26) inquisition(world, rng);
}

// The chronicle notes when the world tips far toward light or dark, once per swing.
function omens(world: WorldState): void {
  const b = balanceOf(world);
  const was = world.omen ?? 0;
  let now = b <= -50 ? -2 : b <= -20 ? -1 : b >= 35 ? 1 : 0;
  // Hold a level until the balance pulls ten points back past its threshold.
  if (was === -2 && b <= -40) now = -2;
  else if (was === -1 && now === 0 && b <= -10) now = -1;
  else if (was === 1 && b >= 25) now = 1;
  if (now === was) return;
  world.omen = now;
  if (now === -2) log(world, 'cult', 'ท้องฟ้าเป็นสีเลือด พลังมืดแผ่ซ่านจนสัตว์ป่าเงียบกริบ จอมมารใกล้ตื่นแล้ว');
  else if (now === -1 && was > -1) log(world, 'cult', 'เงามืดเริ่มคืบคลานเข้ามาในเมือง ผู้คนฝันร้ายกันทั่ว');
  else if (now === 1) log(world, 'bless', 'แสงศักดิ์สิทธิ์ส่องทั่วเมือง ยุคแห่งความดีงามมาถึง');
}

// The cruelest soul in town may found a cult, more readily when the world is already dark.
function found(world: WorldState, rng: Rng): void {
  if (world.cult && world.npcs.some((n) => n.alive && n.id === world.cult!.leaderId)) return;
  const members = cultists(world);
  if (world.cult && members.length) {
    // The leader is gone; the most wicked follower takes over.
    const heir = members.sort((a, b) => a.morality - b.morality)[0];
    world.cult.leaderId = heir.id;
    log(world, 'cult', `${heir.name} ขึ้นเป็นผู้นำ${world.cult.name}คนใหม่`, heir.id);
    return;
  }
  if (world.cult) {
    log(world, 'cult', `${world.cult.name}สลายไปแล้ว`);
    world.cult = undefined;
  }
  const founder = adults(world)
    .filter((n) => n.morality <= FOUND_MORALITY && n.job !== 'king' && n.job !== 'priest' && n.questId === undefined)
    .sort((a, b) => a.morality - b.morality)[0];
  if (!founder || !chance(rng, balanceOf(world) < 0 ? 0.5 : 0.2)) return;
  const name = `ลัทธิ${pick(rng, CULT_NAMES)}`;
  world.cult = { name, founded: world.day, leaderId: founder.id, rituals: 0 };
  founder.cultist = true;
  log(world, 'cult', `${founder.name} ก่อตั้ง${name}ขึ้นอย่างลับๆ บูชาพลังจากใต้ดันเจี้ยน`, founder.id);
}

// Each cultist whispers to a few souls who might listen: the wicked, the hungry, the bitter,
// the greedy promised riches, the vengeful promised revenge, or a friend.
function recruit(world: WorldState, rng: Rng): void {
  if (!world.cult) return;
  for (const c of cultists(world)) {
    for (let tries = 0; tries < 3; tries++) {
      if (cultists(world).length >= MAX_CULTISTS) return;
      const mark = adults(world).filter((n) => !n.cultist && n.job !== 'king' && n.job !== 'priest' && !n.knight && !n.hero);
      if (!mark.length) return;
      const n = pick(rng, mark);
      const pull =
        (n.morality < 10 ? 1 : 0) +
        (n.morality < -10 ? 1 : 0) +
        ((n.hunger ?? 0) >= 2 ? 1 : 0) +
        (loyaltyOf(n) < 35 ? 1 : 0) +
        (n.traits.includes('greedy') || n.traits.includes('vengeful') ? 1 : 0) +
        (getTie(world, c.id, n.id) >= FRIEND ? 1 : 0) -
        (n.blessed ? 3 : 0) -
        (n.traits.includes('kind') ? 1 : 0);
      if (pull > 1 && chance(rng, 0.1 * pull)) {
        n.cultist = true;
        n.morality = clamp(n.morality - 10, -100, 100);
      }
    }
  }
}

// Monthly the cult walks out to the dungeon by night. A soldier on watch at the gate may see them go.
function ritual(world: WorldState, rng: Rng): void {
  const members = cultists(world).filter((n) => n.questId === undefined && n.inside === undefined);
  const d = world.dungeons[0];
  if (!world.cult || members.length < 3 || !d) return;
  world.cult.rituals++;
  log(world, 'cult', `เงาดำ ${members.length} ร่างมุ่งหน้าไปยัง${d.name}ยามค่ำคืน`);
  for (const n of members) {
    const guard = guardNear(world, n.x, n.y) ?? guardNear(world, 25, 9);
    if (guard && chance(rng, 0.04)) {
      expose(world, n, `ทหาร${guard.name}เห็น${n.name}แอบออกไปร่วมพิธีมืด`);
      continue;
    }
    n.plan = makePlan('ritual', dungeonDoor(d), 2, d.id);
  }
}

// A cultist who reaches the dungeon door feeds it and sinks deeper.
export function performRitual(world: WorldState, n: Npc): void {
  const d = world.dungeons.find((x) => x.id === n.plan?.target) ?? world.dungeons[0];
  if (d) d.power += RITUAL_POWER;
  // Each offering also stirs the demon lord below, or feeds it once it walks.
  if (world.demon) feed(world.demon, 0.3);
  else world.dread = clamp((world.dread ?? 0) + DREAD_PER_RITUAL * (1 - 0.2 * perkLevel(world, 'ward')), 0, 100);
  n.morality = clamp(n.morality - 2, -100, 100);
  sway(world, -0.5);
}

// Priests watch their flock; one may spot a cultist's mark.
function inquisition(world: WorldState, rng: Rng): void {
  const members = cultists(world);
  if (!members.length || occupied(world)) return; // under the demon the priests keep their heads down
  for (const p of adults(world).filter((n) => n.job === 'priest')) {
    if (!chance(rng, 0.15)) continue;
    const n = pick(rng, cultists(world));
    if (!n) return;
    expose(world, n, `นักบวช${p.name}พบตราสัญลักษณ์มารบนตัว${n.name}`);
  }
}

// Out in the open: a kind king banishes the cultist, a harder one has them executed.
export function expose(world: WorldState, n: Npc, how: string): void {
  n.cultist = false;
  sway(world, 2);
  const leader = world.cult?.leaderId === n.id;
  const king = world.npcs.find((k) => k.id === world.kingId && k.alive);
  log(world, 'cult', `${how}${leader ? ` ผู้นำ${world.cult!.name}ถูกเปิดโปง!` : ''}`, n.id);
  if (king?.traits.includes('kind')) {
    n.alive = false;
    n.left = true;
    n.plan = undefined;
    log(world, 'cult', `${n.name} ถูกเนรเทศออกจากเมืองฐานบูชามาร`, n.id);
  } else {
    kill(world, n, 'ถูกประหารฐานบูชามาร');
  }
}

// The player's god sends a vision naming one cultist.
export function reveal(world: WorldState): boolean {
  const members = cultists(world);
  if (!members.length) return false;
  const n = members[world.day % members.length];
  expose(world, n, `เทพเจ้าส่งนิมิตเปิดโปง${n.name}ว่าเป็นสาวก${world.cult?.name ?? 'ลัทธิมาร'}`);
  return true;
}

