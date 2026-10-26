// The demon lord. Dread gathers while the world is dark and the cult feeds the dungeon;
// at its peak the demon lord wakes and raises a keep beside the dungeon. Its armies raid
// the town until the defenders break, then it rules the town through its cult. The town
// is never razed: only a hero the god awakens can storm the keep and set it free.
import { chance, int, pick, type Rng } from './rng';
import { clamp, kill, log, makePlan, perkLevel } from './core';
import { balanceOf, cultists, sway } from './cult';
import { dungeonDoor, PLACES } from './places';
import { might } from './market';
import { afterStampede, loyaltyOf } from './politics';
import { isAdventurer, legend } from './quests';
import { enthrone, king, leaveTrade } from './society';
import { liberateRealms } from './worldevents';
import type { DemonLord, Npc, WorldState } from './types';

const LORD_NAMES = ['มัลกาซาร์', 'เนเฟรอส', 'ซาร์โกธ', 'โมรเดรา', 'อัซราเอล', 'เบลโกรน'];
export const DREAD_TO_RISE = 100;
const RAID_EVERY = 25; // days between the keep's raids on the town
const FIRST_RAID = 15; // days after the awakening before the first one
export const SIEGES_TO_FALL = 3; // raids the town may fail to hold before it is taken
const TRAIN_DAYS = 40; // the hero trains this long before marching, less with the valor gift
export const trainDays = (world: WorldState) => TRAIN_DAYS - 10 * perkLevel(world, 'valor');
const BATTLE_AFTER = 3; // days inside the keep before the fight
const SELF_HERO_DAYS = 200; // occupied this long with no hero, the old prophecy wakes one
const RESIST_MIGHT = 1.5; // the resistance's might in the hero's battle, per point
const ALLY_MIGHT = 60; // most an allied realm's army adds to the hero's battle
const PARTY = 3; // companions who march with the hero
export const HERO_COST = 20;
export const MAX_POWER = 180; // however long it feeds, a hero with a strong party still has a chance

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);
const byId = (world: WorldState, id: number) => world.npcs.find((n) => n.id === id);
// Same measure the dungeon uses for a delving adventurer, curses and blessings included.
export const fighter = (n: Npc, world: WorldState) => might(world, n);
export const heroOf = (world: WorldState) => {
  const q = world.demon?.hero;
  return q ? world.npcs.find((n) => n.id === q.id && n.alive) : undefined;
};
export const canAwaken = (world: WorldState) => !!world.demon && !heroOf(world);

export const feed = (lord: DemonLord, by: number) => (lord.power = Math.min(MAX_POWER, lord.power + by));

export function demonDay(world: WorldState, rng: Rng): void {
  const lord = world.demon;
  if (!lord) return gatherDread(world, rng);
  feed(lord, 0.05);
  heroDay(world, lord, rng);
  if (!world.demon) return; // slain today
  if (lord.stage === 'risen') {
    if (world.day - lord.lastRaid >= RAID_EVERY) raid(world, lord, rng);
  } else occupation(world, lord);
}

// Darkness past -15 builds dread a little each day; rituals add to it (see performRitual);
// a bright world lets it fade.
function gatherDread(world: WorldState, rng: Rng): void {
  const b = balanceOf(world);
  const ward = 1 - 0.2 * perkLevel(world, 'ward');
  world.dread = clamp((world.dread ?? 0) + Math.max(0, -b - 15) * 0.01 * ward - (b > 10 ? 0.1 : 0), 0, DREAD_TO_RISE);
  if (world.dread >= DREAD_TO_RISE) rise(world, rng);
}

function rise(world: WorldState, rng: Rng): void {
  const d = world.dungeons[0];
  const name = pick(rng, LORD_NAMES);
  world.dread = 0;
  world.demon = {
    name,
    risen: world.day,
    power: 70 + Math.min(30, (world.cult?.rituals ?? 0) * 2),
    stage: 'risen',
    sieges: 0,
    lastRaid: world.day - RAID_EVERY + FIRST_RAID,
  };
  sway(world, -10);
  log(world, 'cult', `จอมมาร${name}ตื่นจากนิทราใต้${d.name}! ปราสาทมืดผุดขึ้นกลางป่า`);
  legend(world, `จอมมาร${name}ตื่นขึ้น`);
}

// The keep sends its host against the town: soldiers and adventurers in town stand against it.
function raid(world: WorldState, lord: DemonLord, rng: Rng): void {
  lord.lastRaid = world.day;
  const d = world.dungeons[0];
  const here = adults(world).filter((n) => n.inside === undefined && n.plan?.kind !== 'crusade');
  const soldiers = here.filter((n) => n.job === 'soldier');
  const fighters = here.filter((n) => isAdventurer(n) && !n.retired);
  const defence = soldiers.reduce((s, n) => s + fighter(n, world) * (0.5 + loyaltyOf(n) / 100), 0) + fighters.reduce((s, n) => s + fighter(n, world) * 0.5, 0);
  const host = lord.power * int(rng, 3, 5);
  log(world, 'disaster', `กองทัพปีศาจของจอมมาร${lord.name}บุกออกจาก${d.name}!`);
  const held = chance(rng, defence / (defence + host));
  for (const n of [...soldiers, ...fighters]) if (chance(rng, held ? 0.03 : 0.08)) kill(world, n, held ? 'สละชีพต้านทัพปีศาจ' : 'ล้มลงต่อหน้าทัพปีศาจ');
  if (held) {
    lord.power = Math.max(50, lord.power - 5);
    log(world, 'battle', `ทหาร ${soldiers.length} นายและนักผจญภัย ${fighters.length} คนต้านทัพปีศาจไว้ได้`);
    afterStampede(world, 0.3);
    return;
  }
  for (const n of here) if (!soldiers.includes(n) && !fighters.includes(n) && chance(rng, 0.02)) kill(world, n, 'ถูกปีศาจสังหารกลางเมือง');
  lord.sieges++;
  sway(world, -3);
  afterStampede(world, 0);
  if (lord.sieges >= SIEGES_TO_FALL) return fall(world, lord, rng);
  log(world, 'cult', `ทัพปีศาจตีแนวป้องกันแตกแล้วถอยกลับไป เมืองต้านได้อีกเพียง ${SIEGES_TO_FALL - lord.sieges} ครั้ง`);
}

// The town is taken, not razed: the king falls, the army breaks and the cult rules for its master.
function fall(world: WorldState, lord: DemonLord, rng: Rng): void {
  lord.stage = 'occupied';
  lord.fell = world.day;
  log(world, 'cult', `เมืองแตก! จอมมาร${lord.name}ยึดครองอาณาจักร`);
  const k = king(world);
  if (k && chance(rng, 0.5)) kill(world, k, 'ถูกจอมมารประหารกลางลานเมือง');
  else if (k) {
    k.alive = false;
    k.left = true;
    k.plan = undefined;
    log(world, 'politics', `กษัตริย์${k.name}หนีออกจากเมืองไปในยามวิกาล`, k.id);
  }
  for (const n of adults(world)) {
    if (n.job === 'soldier') {
      n.job = n.morality < 0 ? 'thief' : 'farmer';
      n.plan = undefined;
    }
    n.knight = undefined;
    n.loyalty = Math.min(loyaltyOf(n), 30);
  }
  log(world, 'politics', 'กองทัพหลวงแตกพ่าย ทหารที่รอดถอดเกราะไปใช้ชีวิตเป็นชาวบ้าน');
  const leader = world.cult && world.npcs.find((n) => n.alive && n.id === world.cult!.leaderId);
  if (leader) {
    lord.governorId = leader.id;
    log(world, 'cult', `${leader.name} ผู้นำ${world.cult!.name}ได้เป็นผู้สำเร็จราชการแทนจอมมาร`, leader.id);
  }
  if (world.crown) world.crown.tax = 'high';
  legend(world, `จอมมาร${lord.name}ยึดครองอาณาจักร`);
}

// Under the demon: the day after each levy it takes half the treasury, and the world sinks.
// If the god stays silent too long, the old prophecy wakes a hero by itself.
function occupation(world: WorldState, lord: DemonLord): void {
  sway(world, -0.03);
  if (world.day % 30 === 16) {
    const tribute = Math.floor(world.treasury * 0.5);
    world.treasury -= tribute;
    feed(lord, tribute / 100 + 1);
    if (tribute) log(world, 'cult', `จอมมาร${lord.name}รีดส่วย ${tribute} ทองจากท้องพระคลัง`);
  }
  if (world.day % 30 === 20) resist(world, lord);
  if (!lord.hero && world.day - Math.max(lord.fell ?? 0, lord.heroLost ?? 0) >= SELF_HERO_DAYS) {
    const n = bestHero(world);
    if (n) awaken(world, lord, n, 'คำทำนายโบราณปลุก');
  }
}

// The town doesn't kneel for long: in cellars and haylofts a resistance grows each month, faster
// with brave hearts and a town that remembers its king, and is set back when the cult hunts it.
function resist(world: WorldState, lord: DemonLord): void {
  const people = adults(world).filter((n) => !n.cultist);
  const brave = people.filter((n) => n.traits.includes('brave') || n.morality >= 40).length;
  const before = lord.resistance ?? 0;
  const purge = world.cult ? Math.min(3, cultists(world).length * 0.3) : 0;
  lord.resistance = clamp(before + 3 + brave * 0.3 - purge, 0, 100);
  const step = (v: number) => Math.floor(v / 25);
  if (step(lord.resistance) > step(before))
    log(world, 'politics', lord.resistance >= 100 ? 'ขบวนการต่อต้านพร้อมลุกฮือทั้งเมือง รอเพียงผู้กล้าเป็นผู้นำ' : `ขบวนการต่อต้านลับเติบโตขึ้น ชาวเมืองแอบซ่อนอาวุธไว้ใต้พื้นบ้าน (${Math.round(lord.resistance)}%)`);
}

// Who stands with the hero at the keep besides the party: the resistance rising inside, and
// allied realms sending their soldiers.
function allies(world: WorldState, lord: DemonLord): { might: number; realms: string[] } {
  const friends = (world.realms ?? []).filter((r) => !r.fallen && (r.pact || r.relation >= 50));
  const might = (lord.resistance ?? 0) * RESIST_MIGHT + friends.reduce((s, r) => s + Math.min(ALLY_MIGHT, r.army), 0);
  return { might, realms: friends.map((r) => r.name) };
}

// ---------- the hero ----------

// The god's eye falls on the strongest good soul: a blessed, seasoned adventurer if there is one.
export function bestHero(world: WorldState): Npc | undefined {
  const score = (n: Npc) => (isAdventurer(n) ? 20 : 0) + n.level * 3 + (n.blessed ? 15 : 0) + n.morality * 0.1 + (n.traits.includes('brave') ? 5 : 0);
  return adults(world)
    .filter((n) => worthy(n) && !n.retired && n.age <= 45)
    .sort((a, b) => score(b) - score(a))[0];
}

export const worthy = (n: Npc) => n.alive && n.age >= 16 && !n.cultist && n.job !== 'king' && n.inside === undefined;

export function awakenHero(world: WorldState, npcId?: number): boolean {
  if (!canAwaken(world)) return false;
  const pickd = npcId === undefined ? bestHero(world) : world.npcs.find((n) => n.id === npcId && worthy(n));
  if (!pickd) return false;
  awaken(world, world.demon!, pickd, 'เทพเจ้าปลุก');
  return true;
}

function awaken(world: WorldState, lord: DemonLord, n: Npc, by: string): void {
  if (!isAdventurer(n)) {
    leaveTrade(n);
    n.job = 'swordsman';
    n.renown ??= 0;
  }
  n.hero = true;
  n.blessed = true;
  n.blessUntil = undefined;
  n.cursedUntil = undefined;
  n.retired = undefined;
  n.morality = Math.max(n.morality, 50);
  n.level += 2 + perkLevel(world, 'valor');
  n.rank = Math.max(n.rank ?? 0, 3);
  if (n.questId === undefined) n.plan = undefined;
  lord.hero = { id: n.id, since: world.day, stage: 'training', companions: [] };
  sway(world, 5);
  log(world, 'bless', `${by}${n.name}ให้ตื่นขึ้นเป็นผู้กล้า! ดาบศักดิ์สิทธิ์เปล่งแสงในมือ`, n.id);
  legend(world, `${n.name} ตื่นขึ้นเป็นผู้กล้า`, n.id);
}

function heroDay(world: WorldState, lord: DemonLord, rng: Rng): void {
  const q = lord.hero;
  if (!q) return;
  const hero = byId(world, q.id);
  if (!hero?.alive) {
    release(world, q.companions);
    lord.hero = undefined;
    lord.heroLost = world.day;
    log(world, 'cult', `ผู้กล้าล้มลงแล้ว เสียงหัวเราะของจอมมาร${lord.name}ก้องไปทั่วป่า`);
    return;
  }
  if (q.stage === 'training') {
    const days = world.day - q.since;
    if (days > 0 && days % 8 === 0) hero.level++;
    if (days < trainDays(world) || hero.questId !== undefined || hero.inside !== undefined) return;
    return march(world, hero, q);
  }
  // Companions pulled away on the road drop out of the march.
  q.companions = q.companions.filter((id) => {
    const c = byId(world, id);
    return c?.alive && c.plan?.kind === 'crusade';
  });
  const d = world.dungeons[0];
  if (hero.inside === undefined) {
    if (hero.plan?.kind !== 'crusade') hero.plan = makePlan('crusade', dungeonDoor(d), 0, d.id);
    return;
  }
  q.entered ??= world.day;
  if (world.day - q.entered >= BATTLE_AFTER) battle(world, lord, hero, rng);
}

function march(world: WorldState, hero: Npc, q: NonNullable<DemonLord['hero']>): void {
  const d = world.dungeons[0];
  const allies = adults(world)
    .filter((n) => n !== hero && isAdventurer(n) && !n.retired && !n.cultist && n.questId === undefined && n.inside === undefined)
    .sort((a, b) => fighter(b, world) - fighter(a, world))
    .slice(0, PARTY);
  q.stage = 'march';
  q.companions = allies.map((n) => n.id);
  for (const n of [hero, ...allies]) n.plan = makePlan('crusade', dungeonDoor(d), 0, d.id);
  const company = allies.length ? `พร้อมสหาย ${allies.map((n) => n.name).join(', ')}` : 'เพียงลำพัง';
  log(world, 'quest', `ผู้กล้า${hero.name}${company} ออกเดินทางสู่ปราสาทจอมมาร`, hero.id);
}

function battle(world: WorldState, lord: DemonLord, hero: Npc, rng: Rng): void {
  const q = lord.hero!;
  const party = q.companions.map((id) => byId(world, id)!).filter((n) => n.inside !== undefined);
  const help = allies(world, lord);
  const might = fighter(hero, world) * 2 + party.reduce((s, n) => s + fighter(n, world), 0) + help.might;
  const foe = lord.power * 2.5;
  log(world, 'battle', `ผู้กล้า${hero.name}บุกเข้าท้องพระโรงของจอมมาร${lord.name}!`, hero.id);
  if (lord.resistance && lord.resistance >= 25) log(world, 'battle', `ขบวนการต่อต้านลุกฮือทั่วเมืองพร้อมกัน ตรึงกำลังปีศาจไว้ให้ผู้กล้า`);
  if (help.realms.length) log(world, 'battle', `${help.realms.join(' และ ')}ส่งทัพมาช่วยผู้กล้าบุกปราสาทจอมมาร`);
  const won = chance(rng, might / (might + foe));
  for (const n of party) if (chance(rng, won ? 0.15 : 0.5)) kill(world, n, `สละชีพในศึกปราบจอมมาร${lord.name}`);
  release(world, [hero.id, ...q.companions]);
  if (won) return slay(world, lord, hero);
  lord.power = Math.max(50, lord.power - 15);
  lord.resistance = (lord.resistance ?? 0) * 0.5; // the rising is crushed, its leaders hanged
  if (chance(rng, 0.6)) return kill(world, hero, `ล้มลงต่อหน้าจอมมาร${lord.name}`); // heroDay notices tomorrow
  // Beaten but alive: back to town to train again.
  lord.hero = { id: hero.id, since: world.day, stage: 'training', companions: [] };
  log(world, 'battle', `ผู้กล้า${hero.name}พ่ายแพ้ แต่หนีรอดกลับมาได้อย่างสะบักสะบอม จอมมารก็บาดเจ็บไม่น้อย`, hero.id);
}

// Out of the keep (or off the march) and back to the guild.
function release(world: WorldState, ids: number[]): void {
  for (const id of ids) {
    const n = byId(world, id);
    if (!n?.alive || n.plan?.kind !== 'crusade') continue;
    n.inside = undefined;
    n.plan = makePlan('return', PLACES.guild, 0);
  }
}

function slay(world: WorldState, lord: DemonLord, hero: Npc): void {
  log(world, 'world', `ผู้กล้า${hero.name}ปราบจอมมาร${lord.name}ได้สำเร็จ! ปราสาทมืดพังทลายลง`, hero.id);
  legend(world, `ผู้กล้า${hero.name}ปราบจอมมาร${lord.name}`, hero.id);
  hero.renown = (hero.renown ?? 0) + 30;
  sway(world, 40);
  world.dread = 0;
  world.demonsSlain = (world.demonsSlain ?? 0) + 1;
  liberateRealms(world, hero.name);
  world.slayers = [...(world.slayers ?? []), hero.name];
  for (const d of world.dungeons) d.power = 10;
  // Without their master the cult scatters into the night.
  const fled = cultists(world);
  for (const n of fled) {
    n.cultist = false;
    n.alive = false;
    n.left = true;
    n.plan = undefined;
  }
  if (world.cult) log(world, 'cult', `${world.cult.name}แตกสลาย สาวก ${fled.length} คนหนีออกจากเมือง`);
  world.cult = undefined;
  const freed = lord.stage === 'occupied';
  world.demon = undefined;
  if (freed) {
    enthrone(world, hero, 'ปราบจอมมารและปลดปล่อยอาณาจักร');
    for (const n of adults(world)) n.loyalty = Math.min(100, loyaltyOf(n) + 25);
    if (world.crown) world.crown.tax = 'low';
    log(world, 'politics', 'อาณาจักรได้รับอิสรภาพคืน ชาวเมืองออกมาเฉลิมฉลองทั่วทุกถนน');
    return;
  }
  const k = king(world);
  const reward = Math.min(200, Math.floor(world.treasury / 2));
  world.treasury -= reward;
  hero.gold += reward;
  hero.knight = true;
  hero.loyalty = 100;
  if (k) log(world, 'politics', `กษัตริย์${k.name}แต่งตั้งผู้กล้า${hero.name}เป็นอัศวินพร้อมรางวัล ${reward} ทอง`, hero.id);
}
