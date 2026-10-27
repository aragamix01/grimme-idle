// War with a neighbour, begun only by kings and only as their natures allow: the brave,
// the greedy and the vengeful strike at realms that hate them when they feel the stronger;
// the kind and the timid never do. Every few weeks the armies clash; the first side three
// victories ahead (or the better side after six battles) dictates the peace. A town that
// loses is sacked, never destroyed. The god may only help: bless our ranks, send a storm
// against theirs, or send both kings a vision of peace.
import { chance, type Rng } from './rng';
import { clamp, kill, log, occupied } from './core';
import { legend, isAdventurer } from './quests';
import { king } from './society';
import { loyaltyOf } from './politics';
import { might } from './market';
import { sway } from './cult';
import { realmArms } from './realms';
import { conquer, frontier, peaksHeld } from './lands';
import { charterOf, landPolicyOf } from './charter';
import { ageOf, industrial } from './ages';
import type { Npc, Realm, War, WarAct, WorldState } from './types';

const BATTLE_EVERY = 20;
const WIN_BY = 3;
const MAX_BATTLES = 6;
const TRUCE_DAYS = 3 * 365; // no new war with the same realm this soon after a peace
const ENEMY_MIGHT = 10; // strength per enemy soldier; ours are worth 20 to 40 but they come in numbers
export const WAR_COST: Record<WarAct, number> = { bless: 15, storm: 15, peace: 25 };

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);
export const enemyOf = (world: WorldState) => (world.war ? world.realms?.find((r) => r.id === world.war!.realmId) : undefined);
const hawk = (traits: string[]) => traits.includes('brave') || traits.includes('greedy') || traits.includes('vengeful');
const dove = (traits: string[]) => traits.includes('kind') || traits.includes('coward');

// Who fights for us: the garrison, knights, brave adventurers who volunteer (swordsmen in the
// line hold better than mages), a guild hired for the war, and the hero.
export function ourForces(world: WorldState): { fighters: Npc[]; strength: number } {
  const fighters = adults(world).filter(
    (n) => n.job === 'soldier' || n.knight || n.hero || (isAdventurer(n) && !n.retired && n.questId === undefined && (n.traits.includes('brave') || loyaltyOf(n) >= 60 || (n.guildId !== undefined && n.guildId === world.war?.mercs))), // hired guild members march too
  );
  // Our own age arms us as theirs arms them (the second age is par).
  const firearms = industrial(world) ? 1.2 : 1; // and the industrial age arms the soldiers with guns
  let strength = fighters.reduce((s, n) => s + might(world, n) * (n.job === 'soldier' || n.knight ? firearms : n.hero ? 2 : n.guildId !== undefined && n.guildId === world.war?.mercs ? 1 : n.job === 'swordsman' ? 0.9 : 0.6), 0) * (1 + 0.15 * (ageOf(world) - 1)) * (1 + 0.08 * peaksHeld(world)); // forts on the mountain passes we hold
  // Allies send part of their armies.
  for (const r of world.realms ?? []) if (r.pact && !r.war) strength += theirStrength(r) * 0.5;
  return { fighters, strength };
}

export const theirStrength = (r: Realm) => r.army * ENEMY_MIGHT * realmArms(r); // a realm further on fights with better arms

export function warDay(world: WorldState, rng: Rng): void {
  if (occupied(world)) return;
  if (!world.war) {
    if (world.day % 30 === 20 && world.day > 365) maybeWar(world, rng); // the first year is left in peace
    return;
  }
  const w = world.war;
  const enemy = enemyOf(world);
  if (!enemy) {
    world.war = undefined;
    return;
  }
  if (world.day >= w.nextBattle) battle(world, w, enemy, rng);
}

// A hostile neighbour attacks, or our hawkish king marches, when either side smells weakness.
function maybeWar(world: WorldState, rng: Rng): void {
  const k = king(world);
  const policy = landPolicyOf(charterOf(world));
  const strength = ourForces(world).strength;
  for (const r of world.realms ?? []) {
    if (r.fallen || r.pact || r.relation >= 0 || (r.truceUntil ?? 0) > world.day) continue;
    const hostile = r.relation <= -30;
    // A hostile hawk attacks when it feels the stronger; a greedy one also preys on any cold neighbour it far outmatches.
    if ((hawk(r.ruler.traits) || r.regime === 'junta') && hostile && theirStrength(r) > strength * 1.1 && chance(rng, 0.25)) return declare(world, r, 'them');
    if (r.ruler.traits.includes('greedy') && theirStrength(r) > strength * 1.6 && chance(rng, 0.06)) return declare(world, r, 'them');
    if (policy === 'peace') continue; // the charter forbids wars for land
    if (k && hostile && hawk(k.traits) && !dove(k.traits) && strength > theirStrength(r) * 1.2 && world.treasury >= 300 && chance(rng, 0.15)) return declare(world, r, 'us');
  }
  // Under a charter of conquest a grasping ruler also marches on any cool neighbour far weaker than us.
  if (policy !== 'conquest' || !k || !k.traits.includes('greedy') || world.treasury < 300) return;
  const prey = weakest(world, strength);
  if (prey && chance(rng, 0.04)) declare(world, prey, 'us');
}

// A neighbour on our borders far weaker than us, and not our friend: a war of conquest's target.
export function weakest(world: WorldState, strength = ourForces(world).strength): Realm | undefined {
  return (world.realms ?? [])
    .filter((r) => !r.fallen && !r.pact && !r.war && r.relation < 20 && (r.truceUntil ?? 0) <= world.day && theirStrength(r) * 2 < strength && frontier(world, 'us').some((x) => x.owner === r.id))
    .sort((a, b) => theirStrength(a) - theirStrength(b))[0];
}

// A war of conquest, declared by decree.
export const conquestWar = (world: WorldState, r: Realm) => declare(world, r, 'us');

function declare(world: WorldState, r: Realm, attacker: War['attacker']): void {
  const k = king(world);
  r.war = true;
  world.war = { realmId: r.id, since: world.day, attacker, nextBattle: world.day + BATTLE_EVERY, score: 0, battles: 0 };
  sway(world, -2);
  if (attacker === 'them') log(world, 'politics', `${r.ruler.name}แห่ง${r.name}ประกาศสงครามกับอาณาจักรของเรา! กองทัพกำลังเดินทัพมา`);
  else log(world, 'politics', `กษัตริย์${k?.name ?? ''}ประกาศสงครามกับ${r.name} ทหารเตรียมเดินทัพ`);
  legend(world, `สงครามกับ${r.name}เริ่มขึ้น`);
}

function battle(world: WorldState, w: War, enemy: Realm, rng: Rng): void {
  w.battles++;
  w.nextBattle = world.day + BATTLE_EVERY;
  const { fighters, strength } = ourForces(world);
  const ours = strength * (w.boost ?? 1);
  const theirs = theirStrength(enemy) * (w.storm ?? 1);
  w.boost = undefined;
  w.storm = undefined;
  const where = w.attacker === 'them' ? `บุกประตูเมือง` : `ปะทะกันที่ชายแดน${enemy.name}`;
  log(world, 'battle', `กองทัพ${enemy.name}${w.attacker === 'them' ? where : ''}! ฝ่ายเรา ${fighters.length} คนออกรบ${w.attacker === 'us' ? ` ${where}` : ''}`);
  const won = chance(rng, ours / (ours + theirs + 1));
  // Losers bleed more than winners.
  const ourLoss = won ? 0.04 : 0.1;
  for (const n of fighters) if (chance(rng, ourLoss * (n.hero ? 0.3 : 1))) kill(world, n, `สละชีพในสงครามกับ${enemy.name}`);
  enemy.army = Math.max(3, Math.round(enemy.army * (won ? 0.75 : 0.92)));
  w.score += won ? 1 : -1;
  log(world, 'battle', won ? `ฝ่ายเราชนะศึก! กองทัพ${enemy.name}ถอยร่น` : `ฝ่ายเราพ่ายแพ้ในศึกครั้งนี้`);
  for (const n of adults(world)) n.loyalty = clamp(loyaltyOf(n) + (won ? 3 : -4), 0, 100);
  if (Math.abs(w.score) >= WIN_BY || w.battles >= MAX_BATTLES) return endWar(world, enemy, w.score > 0 ? 'won' : w.score < 0 ? 'lost' : 'draw');
  // A losing king of a gentle or timid nature sues for peace and pays for it.
  const k = king(world);
  if (w.score <= -2 && k && dove(k.traits)) endWar(world, enemy, 'sued');
}

export function endWar(world: WorldState, enemy: Realm, how: 'won' | 'lost' | 'draw' | 'sued' | 'vision'): void {
  world.war = undefined;
  enemy.war = undefined;
  enemy.truceUntil = world.day + TRUCE_DAYS;
  const k = king(world);
  if (how === 'won') {
    const taken = Math.round(enemy.gold * 0.3);
    enemy.gold -= taken;
    const spoils = taken + 80; // plus what the army carried off from their land
    world.treasury += spoils;
    enemy.relation = -20;
    sway(world, 1);
    for (const n of adults(world)) n.loyalty = clamp(loyaltyOf(n) + 12, 0, 100);
    log(world, 'politics', `สงครามจบลง อาณาจักรของเราได้รับชัยชนะ ${enemy.name}ต้องจ่ายค่าปฏิกรรมสงคราม ${spoils} ทอง`);
    const land = conquer(world, enemy, 'us');
    if (land) log(world, 'politics', `${enemy.name}ต้องยก${land.name}ให้เราตามสัญญาสงบศึก`);
    legend(world, `กษัตริย์${k?.name ?? ''}ชนะสงครามกับ${enemy.name}`, k?.id);
  } else if (how === 'lost' || how === 'sued') {
    // Sacked, not destroyed: the treasury and purses are plundered.
    const loot = Math.round(world.treasury * (how === 'sued' ? 0.25 : 0.4));
    world.treasury -= loot;
    enemy.gold += loot;
    if (how === 'lost') for (const n of adults(world)) n.gold = Math.round(n.gold * 0.8);
    enemy.relation = 0;
    for (const n of adults(world)) n.loyalty = clamp(loyaltyOf(n) - 10, 0, 100);
    log(world, 'politics', how === 'sued' ? `กษัตริย์${k?.name ?? ''}ขอสงบศึกกับ${enemy.name} ยอมจ่าย ${loot} ทอง` : `อาณาจักรของเราแพ้สงคราม ทหาร${enemy.name}ปล้นเมืองไป ${loot} ทอง`);
    const land = how === 'lost' ? conquer(world, 'us', enemy) : undefined;
    if (land) log(world, 'politics', `${enemy.name}ยึด${land.name}ไปจากเรา`);
  } else {
    enemy.relation = how === 'vision' ? 10 : -10;
    log(world, 'politics', how === 'vision' ? `ผู้ปกครองทั้งสองฝ่ายฝันเห็นนิมิตเดียวกัน สงครามกับ${enemy.name}ยุติลงอย่างสันติ` : `สงครามกับ${enemy.name}ยืดเยื้อจนทั้งสองฝ่ายหมดแรง จึงยอมสงบศึก`);
  }
}

// The god's help in a war.
export function warAct(world: WorldState, act: WarAct): boolean {
  const w = world.war;
  const enemy = enemyOf(world);
  if (!w || !enemy) return false;
  if (act === 'bless') {
    w.boost = 1.3;
    log(world, 'bless', 'แสงศักดิ์สิทธิ์ส่องลงบนกองทัพของเรา ทหารทุกคนใจฮึกเหิม');
  } else if (act === 'storm') {
    w.storm = 0.7;
    log(world, 'curse', `พายุศักดิ์สิทธิ์โหมกระหน่ำค่ายทัพของ${enemy.name}`);
  } else endWar(world, enemy, 'vision');
  return true;
}

