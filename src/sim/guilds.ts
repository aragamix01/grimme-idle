// Guilds are founded by ambitious NPCs, grow through friendship and reputation, and fall apart
// when their leader dies with nobody to take over.
import { chance, pick, type Rng } from './rng';
import { log } from './core';
import { isActive, isAdventurer, legend, postExpedition, rankName } from './quests';
import { ENEMY, FRIEND, getTie } from './ties';
import type { Guild, GuildKind, Npc, WorldState } from './types';

const MAX_GUILDS = 5;
const FOUND_CHANCE = 0.008; // per eligible NPC per day
const FOUND_COST = 30;
const JOIN_CHANCE = 0.06; // per unaffiliated NPC per day, when a guild appeals
const LEAVE_CHANCE = 0.05; // per day for members who've come to hate their leader
const EXPEDITION_CHANCE = 0.008; // per guild per day

const EMBLEMS = ['หมาป่า', 'มังกร', 'กุหลาบ', 'นกฮูก', 'สิงโต', 'หงส์', 'จิ้งจอก', 'เหยี่ยว', 'ภูต', 'ดาบ'];
const COLOURS = ['เงิน', 'ทอง', 'แดง', 'ดำ', 'ขาว', 'คราม', 'มรกต', 'อำพัน'];

const memberOf = (world: WorldState, g: Guild) => world.npcs.filter((n) => n.alive && n.guildId === g.id);
// Who each kind of guild takes in. Merchants' guilds welcome farmers too: they sell the harvest.
export const fits = (n: Npc, kind: GuildKind) => {
  if (n.age < 16) return false;
  if (kind === 'thieves') return n.job === 'thief';
  if (kind === 'merchants') return n.job === 'merchant' || n.job === 'farmer';
  return isAdventurer(n);
};
const hasKind = (world: WorldState, kind: GuildKind) => world.guilds.some((g) => g.kind === kind);

export function updateGuilds(world: WorldState, rng: Rng): void {
  for (const g of [...world.guilds]) succession(world, g);
  found(world, rng);
  for (const n of world.npcs) if (n.alive) n.guildId === undefined ? considerJoining(world, n, rng) : considerLeaving(world, n, rng);
  for (const g of world.guilds) {
    const leader = world.npcs.find((n) => n.id === g.leaderId);
    const busy = world.quests.some((q) => isActive(q) && q.patronGuildId === g.id);
    if (g.kind === 'adventurers' && leader && !busy && memberOf(world, g).length >= 2 && chance(rng, EXPEDITION_CHANCE)) postExpedition(world, g);
  }
}

function guildName(world: WorldState, kind: GuildKind, rng: Rng): string {
  const taken = new Set(world.guilds.map((g) => g.name));
  for (let i = 0; i < 20; i++) {
    const core = `${pick(rng, EMBLEMS)}${pick(rng, COLOURS)}`;
    const name = kind === 'thieves' ? `สมาคมเงา${core}` : kind === 'merchants' ? `สมาคมการค้า${core}` : `กิลด์${core}`;
    if (!taken.has(name)) return name;
  }
  return `กิลด์ที่ ${world.guilds.length + 1}`;
}

// A seasoned adventurer with drive starts their own guild; a prosperous merchant starts a trade
// association; a rich thief with a dark heart starts a thieves' society.
function found(world: WorldState, rng: Rng): void {
  if (world.guilds.length >= MAX_GUILDS) return;
  for (const n of world.npcs) {
    if (!n.alive || n.gold < FOUND_COST + 10 || n.questId !== undefined) continue;
    const current = world.guilds.find((g) => g.id === n.guildId);
    // Members only strike out on their own when they're at odds with their leader.
    if (current && (current.leaderId === n.id || getTie(world, n.id, current.leaderId) >= 0)) continue;
    const driven = n.traits.includes('brave') || n.traits.includes('greedy') || n.traits.includes('loyal');
    const adventurer = isAdventurer(n) && ((n.rank ?? 0) >= 1 || n.level >= 3) && driven;
    const merchant = n.job === 'merchant' && n.age >= 16 && n.gold >= 60 && !hasKind(world, 'merchants');
    const thief = n.job === 'thief' && n.age >= 16 && n.morality <= -20 && !hasKind(world, 'thieves');
    if ((!adventurer && !merchant && !thief) || !chance(rng, FOUND_CHANCE)) continue;
    const kind: GuildKind = thief ? 'thieves' : merchant ? 'merchants' : 'adventurers';
    const g: Guild = { id: world.nextId++, name: guildName(world, kind, rng), kind, leaderId: n.id, founded: world.day, renown: 0, treasury: FOUND_COST };
    n.gold -= FOUND_COST;
    n.guildId = g.id;
    world.guilds.push(g);
    const title = kind === 'adventurers' ? `นักผจญภัยแรงก์ ${rankName(n.rank)} ก่อตั้ง` : kind === 'merchants' ? 'พ่อค้าผู้มั่งคั่ง ก่อตั้ง' : 'จัดตั้ง';
    if (current) log(world, 'guild', `${n.name} แยกตัวจาก${current.name} มาก่อตั้ง${g.name}`, n.id);
    else log(world, 'guild', `${n.name} ${title}${g.name}`, n.id);
    return; // one founding a day is plenty
  }
}

// Unaffiliated NPCs weigh each guild: how they feel about its leader and members, its reputation,
// and whether its leader's morals sit right with theirs.
function considerJoining(world: WorldState, n: Npc, rng: Rng): void {
  if (!world.guilds.length || !chance(rng, JOIN_CHANCE)) return;
  let best: Guild | undefined;
  let bestScore = 10;
  for (const g of world.guilds) {
    if (!fits(n, g.kind)) continue;
    const leader = world.npcs.find((x) => x.id === g.leaderId);
    if (!leader?.alive) continue;
    const members = memberOf(world, g).filter((m) => m.id !== leader.id);
    const friends = members.reduce((s, m) => s + Math.max(-20, getTie(world, n.id, m.id)), 0);
    let score = getTie(world, n.id, leader.id) + friends * 0.5 + g.renown * 0.3 - Math.abs(n.morality - leader.morality) * 0.2;
    score -= Math.max(0, members.length - 3) * 5; // big guilds feel crowded
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  if (!best) return;
  n.guildId = best.id;
  log(world, 'guild', `${n.name} เข้าร่วม${best.name}`, n.id);
}

function considerLeaving(world: WorldState, n: Npc, rng: Rng): void {
  const g = world.guilds.find((x) => x.id === n.guildId);
  if (!g) {
    n.guildId = undefined;
    return;
  }
  if (g.leaderId === n.id || !fits(n, g.kind)) {
    if (!fits(n, g.kind) && g.leaderId !== n.id) {
      n.guildId = undefined; // a dream changed their calling
      log(world, 'guild', `${n.name} ออกจาก${g.name}เพื่อเริ่มชีวิตใหม่`, n.id);
    }
    return;
  }
  if (getTie(world, n.id, g.leaderId) <= ENEMY && chance(rng, LEAVE_CHANCE)) {
    n.guildId = undefined;
    const leader = world.npcs.find((x) => x.id === g.leaderId);
    log(world, 'guild', `${n.name} ลาออกจาก${g.name} เพราะทนหัวหน้า${leader?.name ?? ''}ไม่ไหว`, n.id);
  }
}

// When a leader dies the most renowned member steps up, ideally one the others like; otherwise the guild dissolves.
function succession(world: WorldState, g: Guild): void {
  const leader = world.npcs.find((n) => n.id === g.leaderId);
  if (leader?.alive && leader.guildId === g.id) return;
  const members = memberOf(world, g);
  if (!members.length) {
    world.guilds = world.guilds.filter((x) => x !== g);
    log(world, 'guild', `${g.name} ถูกยุบ ไม่เหลือสมาชิกสืบทอด`);
    if (g.renown >= 20) legend(world, `${g.name} ที่เคยรุ่งเรือง ปิดตำนานลง`);
    return;
  }
  const support = (m: Npc) => (m.renown ?? 0) + members.reduce((s, o) => s + (getTie(world, m.id, o.id) >= FRIEND ? 3 : 0), 0);
  const heir = members.reduce((a, b) => (support(b) > support(a) ? b : a));
  g.leaderId = heir.id;
  log(world, 'guild', `${heir.name} ขึ้นเป็นหัวหน้า${g.name}คนใหม่`, heir.id);
}
