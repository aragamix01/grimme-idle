// The church as a power in the land, the law of the faith, and the sects that break from it.
// The church keeps a purse of its own from the tithe, and its standing (influence) grows with the
// believers, their piety, its purse and its cathedral. Its high priest blesses a pious ruler and
// denounces an impious one, and the devout follow. What the constitution says of the faith (the
// state's, free for all, apart from the state, or hunted) shapes who is pressed and who is free.
// When readers multiply, when a commandment grinds, or when the church grows fat, a sect may break
// away to worship the god in its own way; the god may embrace its reform or condemn it.
import { chance, pick, type Rng } from './rng';
import { clamp, log, loyaltyNudge, perkLevel } from './core';
import { charterOf, faithLawOf } from './charter';
import { literacy, literate } from './learning';
import { levelOf } from './market';
import { king } from './society';
import { built } from './works';
import { commit, jailed } from './justice';
import { sway } from './cult';
import { believer, pietyOf, religionOf, strain, support } from './religion';
import type { Npc, Religion, WorldState } from './types';

const DAY = 5; // day of the month the church takes stock
const RICH = 150; // coins at the founding's prices the church keeps; above this it gives, or a greedy head takes
export const SECT_COST = 30; // faith for the god's word on a schism
const SECT_NAMES = ['ผู้อ่านคัมภีร์', 'แสงใหม่', 'ธรรมบริสุทธิ์', 'ผู้ตื่นรู้', 'คืนสู่ต้นธรรม', 'ปฏิรูป'];

type Church = NonNullable<Religion['church']>;
const grown = (n: Npc) => n.alive && n.age >= 16;
const adults = (world: WorldState) => world.npcs.filter(grown);

export function churchOf(world: WorldState): Church {
  return (religionOf(world).church ??= { purse: 0, influence: 0 });
}
export const headOf = (world: WorldState) => world.npcs.find((n) => n.alive && n.id === world.religion?.church?.headId && n.job === 'priest');
export const sectOf = (world: WorldState) => world.religion?.sect;
export const sectMembers = (world: WorldState) => adults(world).filter((n) => n.creed === 'sect');
export const sectCost = (world: WorldState) => Math.max(1, Math.round(SECT_COST * (1 - 0.1 * perkLevel(world, 'grace'))));
// A church fat on its purse under a greedy head: the kind of church a sect is born against.
const corrupt = (world: WorldState) => {
  const head = headOf(world);
  return !!head && head.traits.includes('greedy') && churchOf(world).purse > RICH * 2 * levelOf(world);
};

export function churchDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== DAY) return;
  const c = churchOf(world);
  chooseHead(world, c);
  c.influence = influence(world, c);
  standOnRuler(world, c);
  spend(world, c);
  pressOthers(world, rng);
  schism(world, rng);
}

// The most seasoned priest leads the church.
function chooseHead(world: WorldState, c: Church): void {
  if (headOf(world)) return;
  const head = adults(world).filter((n) => n.job === 'priest' && n.creed === 'god').sort((a, b) => b.level - a.level || b.age - a.age)[0];
  c.headId = head?.id;
  if (head) log(world, 'world', `นักบวช${head.name}ได้รับเลือกเป็นมหาเถระ ประมุขแห่งศาสนจักร`, head.id);
}

// The church's standing, 0..100.
export function influence(world: WorldState, c: Church): number {
  const grown = adults(world);
  const faithful = grown.filter(believer);
  const law = faithLawOf(charterOf(world));
  const v =
    (grown.length ? faithful.length / grown.length : 0) * 40 +
    (faithful.length ? faithful.reduce((s, n) => s + pietyOf(n), 0) / faithful.length : 0) * 0.3 +
    Math.min(15, c.purse / (40 * levelOf(world))) +
    (built(world, 'cathedral') ? 8 : 0) +
    (law === 'state' || law === 'persecute' ? 10 : law === 'secular' ? -10 : 0) +
    (world.regime === 'theocracy' ? 10 : 0);
  return Math.round(clamp(v, 0, 100));
}

// The high priest's word on the ruler: a blessing for a pious one, a denunciation for one who
// scorns the god, while the church carries weight; the devout follow it.
function standOnRuler(world: WorldState, c: Church): void {
  const ruler = king(world);
  const head = headOf(world);
  let now: Church['stance'];
  if (ruler && head && world.regime !== 'theocracy') {
    const scorns = ruler.creed === 'none' || ruler.creed === 'spirits' || pietyOf(ruler) < 25 || ruler.morality < -30;
    if (c.influence >= 45 && scorns) now = 'denounces';
    else if ((ruler.creed === 'god' || ruler.creed === 'sect') && pietyOf(ruler) >= 65) now = 'blesses';
  }
  if (now !== c.stance && ruler && head) {
    if (now === 'denounces') log(world, 'politics', `มหาเถระ${head.name}ประณามกษัตริย์${ruler.name}ว่าไม่เคารพเทพเจ้า ผู้ศรัทธาเริ่มหันหลังให้ราชบัลลังก์`, head.id);
    else if (now === 'blesses') log(world, 'politics', `มหาเถระ${head.name}ประกาศว่ากษัตริย์${ruler.name}เป็นผู้ปกครองที่เทพเจ้าโปรด`, head.id);
  }
  c.stance = now;
  if (!now) return;
  for (const n of adults(world)) if (believer(n) && pietyOf(n) >= 50 && n !== ruler) loyaltyNudge(n, now === 'denounces' ? -2 : 1);
}

// Above what it keeps, the church gives to its larder for the hungry, and a greedy head skims.
function spend(world: WorldState, c: Church): void {
  const keep = RICH * levelOf(world);
  if (c.purse <= keep) return;
  const over = c.purse - keep;
  const head = headOf(world);
  const skim = head?.traits.includes('greedy') && head.gold < RICH * 2 * levelOf(world) ? Math.floor(over * 0.2) : 0; // a full purse stops reaching
  if (head) head.gold += skim;
  const given = Math.floor((over - skim) / 2);
  world.alms = (world.alms ?? 0) + given;
  c.purse -= given + skim;
}

// What the law does to those outside the church: hunted, they convert out of fear, flee, or are
// tried for heresy; under a state faith the church only tries the sect's preachers.
function pressOthers(world: WorldState, rng: Rng): void {
  const law = faithLawOf(charterOf(world));
  if (law !== 'persecute' && law !== 'state') return;
  let fled = 0;
  let turned = 0;
  for (const n of adults(world)) {
    if (believer(n) || n.job === 'king' || jailed(world, n) || n.inside !== undefined) continue;
    if (n.creed === 'sect') {
      if (chance(rng, law === 'persecute' ? 0.08 : 0.015)) {
        log(world, 'politics', `${n.name}ถูกจับขึ้นศาลข้อหานอกรีต ฐานเป็นสาวก${sectOf(world)?.name ?? 'นิกายนอกรีต'}`, n.id);
        commit(world, n, 'heresy', rng, 0, undefined, true);
      }
      continue;
    }
    if (law !== 'persecute') continue;
    loyaltyNudge(n, -3);
    if (chance(rng, 0.06)) {
      n.creed = 'god';
      n.piety = 25;
      turned++;
    } else if (chance(rng, 0.02) && n.questId === undefined) {
      n.alive = false;
      n.left = true;
      n.plan = undefined;
      fled++;
    }
  }
  if (law === 'persecute') sway(world, -0.5);
  if (fled + turned >= 2) log(world, 'politics', `การไล่ล่าคนนอกศาสนา: ${turned ? `${turned} คนยอมเข้ารีตเพราะความกลัว` : ''}${turned && fled ? ' ' : ''}${fled ? `${fled} คนหนีออกจากเมือง` : ''}`);
}

// ---------- sects ----------

function schism(world: WorldState, rng: Rng): void {
  const sect = sectOf(world);
  if (sect) return tendSect(world, rng);
  // What breeds a sect: a town that reads, a commandment that grinds, a church grown fat.
  const reading = literacy(world) >= 0.3;
  const grinding = (world.religion?.tenets ?? []).some((t) => support(world, t.kind) < 0.4);
  const fat = corrupt(world);
  const pressure = (reading ? 1 : 0) + (grinding ? 1 : 0) + (fat ? 1 : 0);
  if (!pressure || !chance(rng, 0.015 * pressure)) return;
  const head = headOf(world);
  const founder = adults(world)
    .filter((n) => believer(n) && literate(n) && pietyOf(n) >= 50 && !n.prophet && n !== head && n.job !== 'king' && !jailed(world, n))
    .sort((a, b) => Number(b.job === 'priest' || b.job === 'scholar') - Number(a.job === 'priest' || a.job === 'scholar') || pietyOf(b) - pietyOf(a))[0];
  if (!founder) return;
  const cause = fat ? 'corrupt' : grinding ? 'tenet' : 'reform';
  const name = `นิกาย${pick(rng, SECT_NAMES)}`;
  religionOf(world).sect = { name, founded: world.day, leaderId: founder.id, cause };
  founder.creed = 'sect';
  const why = cause === 'corrupt' ? 'ประณามว่าศาสนจักรร่ำรวยและฉ้อฉล' : cause === 'tenet' ? 'ประกาศว่าบัญญัติบางข้อไม่ใช่คำของเทพเจ้า' : 'สอนให้ผู้ศรัทธาอ่านคัมภีร์และเข้าถึงเทพเจ้าได้เอง ไม่ต้องผ่านนักบวช';
  log(world, 'world', `${founder.name}แยกตัวจากศาสนจักรตั้ง${name} ${why}`, founder.id);
}

// A sect gathers the readers and those a commandment grinds; some drift back. Its leader's death
// passes it on; with nobody left it is gone.
function tendSect(world: WorldState, rng: Rng): void {
  const sect = sectOf(world)!;
  const law = faithLawOf(charterOf(world));
  const tenets = world.religion?.tenets ?? [];
  for (const n of adults(world)) {
    if (believer(n) && n.job !== 'priest' && !n.prophet) {
      const ground = tenets.some((t) => strain(world, n, t.kind) < 0);
      const odds = 0.03 * (literate(n) ? 1.5 : 1) * (ground ? 1.5 : 1) * (sect.cause === 'corrupt' ? 1.5 : 1) * (law === 'persecute' ? 0.3 : 1);
      if (chance(rng, odds)) n.creed = 'sect';
    } else if (n.creed === 'sect' && n.id !== sect.leaderId && chance(rng, 0.03)) n.creed = 'god';
  }
  const members = sectMembers(world);
  if (!members.some((n) => n.id === sect.leaderId) && members.length) {
    const heir = members.sort((a, b) => pietyOf(b) - pietyOf(a))[0];
    sect.leaderId = heir.id;
    log(world, 'world', `${heir.name}ขึ้นนำ${sect.name}`, heir.id);
  }
  if (members.length < 2) {
    for (const n of members) n.creed = 'god';
    religionOf(world).sect = undefined;
    log(world, 'world', `${sect.name}เหลือผู้ติดตามไม่กี่คน ค่อยๆ สลายกลับเข้าศาสนจักร`);
  }
}

// The god takes a side: embracing the sect's reform heals the split and changes the church for
// good; condemning it scatters the sect, and sends some away from the faith altogether.
export function judgeSect(world: WorldState, act: 'embrace' | 'condemn'): boolean {
  const sect = sectOf(world);
  if (!sect) return false;
  const rel = religionOf(world);
  const members = sectMembers(world);
  const leader = world.npcs.find((n) => n.id === sect.leaderId);
  if (act === 'embrace') {
    for (const n of members) {
      n.creed = 'god';
      n.piety = clamp(pietyOf(n) + 10, 0, 100);
    }
    rel.reformed = true;
    const harshest = [...(rel.tenets ?? [])].sort((a, b) => support(world, a.kind) - support(world, b.kind))[0];
    if (sect.cause === 'tenet' && harshest) rel.tenets = rel.tenets!.filter((t) => t !== harshest);
    const c = churchOf(world);
    world.alms = (world.alms ?? 0) + Math.floor(c.purse / 2);
    c.purse -= Math.floor(c.purse / 2);
    log(world, 'bless', `ทุกคนในโบสถ์ฝันเห็น${leader?.name ?? 'ผู้นำนิกาย'}ยืนข้างเทพเจ้า ศาสนจักรรับคำสอนของ${sect.name}เข้ามา ปฏิรูปตนเองและแจกทรัพย์ให้คนยากไร้`, leader?.id);
  } else {
    let left = 0;
    members.forEach((n, i) => {
      n.piety = clamp(pietyOf(n) - 15, 0, 100);
      if (i % 2 === 0) {
        n.creed = 'god';
        n.piety = Math.max(30, n.piety);
      } else {
        n.creed = 'none';
        left++;
      }
    });
    sway(world, -1);
    log(world, 'curse', `ผู้ศรัทธาทั้งเมืองฝันว่าเทพเจ้ากริ้ว${sect.name} สาวกครึ่งหนึ่งกลับเข้าโบสถ์ อีก ${left} คนหมดศรัทธาไปเลย`, leader?.id);
  }
  rel.sect = undefined;
  return true;
}

// A preacher of the sect called to the god's court recants, or does not.
export function recant(world: WorldState, n: Npc, rng: Rng): boolean {
  if (n.creed !== 'sect' || !chance(rng, 0.5)) return false;
  n.creed = 'god';
  n.piety = 40;
  log(world, 'politics', `${n.name}ยอมสาบานละทิ้ง${sectOf(world)?.name ?? 'นิกาย'} กลับเข้าศาสนจักร`, n.id);
  return true;
}
