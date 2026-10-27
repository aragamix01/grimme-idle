// Swordsmen, mages and their guilds in the politics of the town. The two callings are no longer
// one: mages ward the dungeons from afar and pay for their art where the faith is the state's,
// swordsmen hold the line. And the guilds are powers in their own right: their weight (renown,
// coffers, members) buys them a voice on the council's decrees and in the republic's elections,
// sides them with the ruler or the generals when the army moves, and earns them the ruler's
// suspicion: a fearful or grasping ruler may tax them or ban them, and a guild that has had
// enough takes its people over the border. In war the crown may hire a guild outright.
import { chance, type Rng } from './rng';
import { log, loyaltyNudge, occupied } from './core';
import { amend, charterOf } from './charter';
import { isAdventurer, legend } from './quests';
import { commit, jailed } from './justice';
import { isAvatar } from './avatar';
import { king } from './society';
import { getTie } from './ties';
import { loyaltyOf } from './politics';
import type { Decree, Guild, GuildKind, Npc, WorldState } from './types';

const DAY = 12; // day of the month the guilds and the inquisitors stir
const WARD_EACH = 0.04; // how much each seasoned mage slows the dungeons' return
const WARD_MAX = 0.5;
const LOBBY_FLOOR = 25; // influence a guild needs before the council listens
const GUILD_TAX = 0.1; // of a guild's coffers, monthly, where the charter taxes them
const MERC_FEE = 100;
const FAMOUS = 30; // renown past which a ruler starts to watch an adventurer

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);
export const membersOf = (world: WorldState, g: Guild) => world.npcs.filter((n) => n.alive && n.guildId === g.id);
// A guild's weight in the town: its name, its coffers and its numbers.
export const influenceOf = (world: WorldState, g: Guild) => Math.round(g.renown + Math.min(30, g.treasury / 20) + membersOf(world, g).length * 2); // coffers buy only so much say
const strongest = (world: WorldState) => [...world.guilds].sort((a, b) => influenceOf(world, b) - influenceOf(world, a))[0];

// The wards: seasoned mages at home slow the monsters' return to the dungeons.
export function ward(world: WorldState): number {
  const mages = world.npcs.filter((n) => n.alive && n.job === 'mage' && n.level >= 2 && n.inside === undefined && !n.retired).length;
  return Math.min(WARD_MAX, mages * WARD_EACH);
}

// ---------- the council: guilds lobby on decrees ----------

// What each kind of guild wants of each decree: +1 for, -1 against.
const STAKE: Record<GuildKind, Partial<Record<Decree, number>>> = {
  adventurers: { bounty: 1, colonize: 1, garrison: 1, levy: -1 }, // paid work; but not their people pressed into the ranks
  merchants: { taxfree: 1, labour: 1, expand: 1, tribute: -1, curfew: -1, debase: -1, tariff: -1, embargo: -1, ceiling: -1 },
  thieves: { curfew: -1, levy: -1, bounty: -1, tariff: 1, embargo: 1, ceiling: 1 }, // every barrier is a smuggler's living
};
// The guild that will weigh in on a decree, if it has the weight and the stake: one seat's worth, two for the mighty.
export function lobby(world: WorldState, d: Decree): { guild: Guild; aye: boolean; weight: number } | undefined {
  if (charterOf(world).guilds === 'banned') return undefined;
  const g = [...world.guilds].filter((x) => STAKE[x.kind][d]).sort((a, b) => influenceOf(world, b) - influenceOf(world, a))[0];
  const inf = g ? influenceOf(world, g) : 0;
  if (!g || inf < LOBBY_FLOOR) return undefined;
  return { guild: g, aye: STAKE[g.kind][d]! > 0, weight: inf >= 60 ? 2 : 1 };
}

// ---------- the republic: guilds back candidates ----------

// Each guild's leader backs the candidate they like best, if they like one well enough.
export function endorsements(world: WorldState, field: Npc[]): Map<number, number> {
  const out = new Map<number, number>();
  if (charterOf(world).guilds === 'banned') return out;
  for (const g of world.guilds) {
    if (influenceOf(world, g) < LOBBY_FLOOR) continue;
    const leader = world.npcs.find((n) => n.id === g.leaderId && n.alive);
    if (!leader) continue;
    const pick1 = field.map((c) => ({ c, t: c === leader ? 100 : getTie(world, leader.id, c.id) })).sort((a, b) => b.t - a.t)[0];
    if (!pick1 || pick1.t < 10) continue;
    out.set(g.id, pick1.c.id);
    log(world, 'guild', `${g.name}ประกาศหนุน${pick1.c.name}ในการเลือกตั้ง`, pick1.c.id);
  }
  return out;
}

// The most renowned adventurer stands for office too, if their name is big enough.
export const champion = (eligible: Npc[]) => eligible.filter((n) => isAdventurer(n) && (n.rank ?? 0) >= 4).sort((a, b) => (b.renown ?? 0) - (a.renown ?? 0))[0];

// ---------- the coup: whose side the adventurers take ----------

// When the army moves, the strongest adventurers' guild stands with whichever side its leader
// favours. True if they stood by the ruler and broke the coup.
export function guildInCoup(world: WorldState, ruler: Npc, general: Npc, soldiers: number, rng: Rng): boolean {
  if (charterOf(world).guilds === 'banned') return false;
  const g = [...world.guilds].filter((x) => x.kind === 'adventurers').sort((a, b) => influenceOf(world, b) - influenceOf(world, a))[0];
  const leader = g && world.npcs.find((n) => n.id === g.leaderId && n.alive);
  if (!g || !leader) return false;
  const lean = getTie(world, leader.id, ruler.id) - getTie(world, leader.id, general.id) + (loyaltyOf(leader) - 50) / 2;
  if (lean <= -10) {
    log(world, 'guild', `${g.name}ยืนข้างทหาร ไม่ยื่นมือช่วย${ruler.name}`, leader.id);
    return false;
  }
  if (lean < 10) return false;
  const inf = influenceOf(world, g);
  if (!chance(rng, inf / (inf + soldiers * 6))) {
    log(world, 'guild', `${g.name}ออกมาปกป้อง${ruler.name} แต่ต้านกองทัพไม่ไหว`, leader.id);
    return false;
  }
  g.renown += 10;
  for (const n of membersOf(world, g)) loyaltyNudge(n, 5);
  general.jailedUntil = world.day + 365;
  commit(world, general, 'corruption', rng);
  log(world, 'guild', `${g.name}นำโดย${leader.name}ปกป้อง${ruler.name}ไว้ได้ การยึดอำนาจของ${general.name}ล้มเหลว ${general.name}ถูกจับขังคุก`, leader.id);
  legend(world, `${g.name}ล้มการรัฐประหารของ${general.name}`, leader.id);
  return true;
}

// ---------- each month ----------

export function adventurersDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== DAY || occupied(world)) return;
  inquisition(world, rng);
  const c = charterOf(world);
  // Taxed guilds pay their share to the treasury.
  if (c.guilds === 'taxed')
    for (const g of world.guilds) {
      const due = Math.floor(g.treasury * GUILD_TAX);
      g.treasury -= due;
      world.treasury += due;
    }
  // A guild whose people have soured on the town under a hostile law goes over the border.
  if (c.guilds && c.guilds !== 'free')
    for (const g of [...world.guilds]) {
      const people = membersOf(world, g);
      const mood = people.length ? people.reduce((s, n) => s + loyaltyOf(n), 0) / people.length : 50;
      if (mood < 25 && chance(rng, 0.15)) emigrate(world, g, 'ทนกฎหมายที่กดขี่กิลด์ไม่ไหว');
    }
  hireMercs(world);
  suspicion(world, rng);
}

// Where the faith is the state's, the priests hunt for heresy among the mages.
function inquisition(world: WorldState, rng: Rng): void {
  const pious = world.regime === 'theocracy' ? 0.012 : charterOf(world).stateFaith ? 0.002 : 0;
  if (!pious || !adults(world).some((n) => n.job === 'priest')) return;
  for (const n of adults(world)) {
    if (n.job !== 'mage' || n.inside !== undefined || n.questId !== undefined || jailed(world, n) || isAvatar(world, n) || !chance(rng, pious)) continue;
    // The timid run before the knock at the door.
    if (n.traits.includes('coward') && chance(rng, 0.5)) {
      n.alive = false;
      n.left = true;
      n.plan = undefined;
      log(world, 'politics', `จอมเวท${n.name}หนีออกจากเมืองก่อนถูกไต่สวนข้อหานอกรีต`, n.id);
      continue;
    }
    log(world, 'politics', `นักบวชกล่าวหาจอมเวท${n.name}ว่าใช้เวทมนตร์นอกรีต ถูกจับขึ้นศาล`, n.id);
    commit(world, n, 'heresy', rng, 0, undefined, true);
  }
}

// The crown hires the strongest adventurers' guild for the duration of a war.
function hireMercs(world: WorldState): void {
  const w = world.war;
  const ruler = king(world);
  if (!w || w.mercs !== undefined || !ruler || ruler.traits.includes('coward') || charterOf(world).guilds === 'banned') return;
  const g = [...world.guilds].filter((x) => x.kind === 'adventurers' && membersOf(world, x).length >= 3).sort((a, b) => influenceOf(world, b) - influenceOf(world, a))[0];
  if (!g || world.treasury < MERC_FEE + 300) return;
  world.treasury -= MERC_FEE;
  g.treasury += MERC_FEE;
  w.mercs = g.id;
  log(world, 'guild', `ราชสำนักว่าจ้าง${g.name}เป็นทหารรับจ้างในสงคราม (${MERC_FEE} ทอง) สมาชิก ${membersOf(world, g).length} คนออกรบเต็มกำลัง`);
}

// A vengeful ruler grows afraid of an adventurer whose name rivals their own, and drives them out.
function suspicion(world: WorldState, rng: Rng): void {
  const ruler = king(world);
  if (!ruler || !ruler.traits.includes('vengeful')) return;
  const rival = adults(world).filter((n) => isAdventurer(n) && !n.knight && !n.hero && (n.renown ?? 0) >= FAMOUS && n.inside === undefined && !isAvatar(world, n) && getTie(world, n.id, ruler.id) < 20)[0];
  if (!rival || !chance(rng, 0.03)) return;
  rival.alive = false;
  rival.left = true;
  rival.plan = undefined;
  for (const n of adults(world)) if (isAdventurer(n)) loyaltyNudge(n, -10);
  log(world, 'politics', `${ruler.name}ระแวงชื่อเสียงของ${rival.name}นักผจญภัยแรงก์สูง สั่งเนรเทศออกจากเมือง นักผจญภัยทั้งเมืองไม่พอใจ`, rival.id);
}

// A whole guild leaves for the friendliest neighbour, its people swelling their numbers.
function emigrate(world: WorldState, g: Guild, why: string): void {
  const to = [...(world.realms ?? [])].filter((r) => !r.fallen).sort((a, b) => b.relation - a.relation)[0];
  const people = membersOf(world, g).filter((n) => !isAvatar(world, n) && n.id !== world.kingId && !jailed(world, n));
  for (const n of people) {
    n.alive = false;
    n.left = true;
    n.plan = undefined;
    n.guildId = undefined;
  }
  if (to) {
    to.people += people.length;
    if (g.kind === 'adventurers') to.army += Math.ceil(people.length / 2);
  }
  world.guilds = world.guilds.filter((x) => x !== g);
  log(world, 'guild', `${g.name}${why} สมาชิก ${people.length} คนพากันย้ายไป${to?.name ?? 'ต่างเมือง'}`);
}

// ---------- the charter's guild clause ----------

// Called by the town's amendments: a fearful, grasping ruler bans or taxes the guilds; a kind one
// frees them. Returns true if an amendment was made.
export function guildLaw(world: WorldState, ruler: Npc, strong: boolean, title: string, rng: Rng): boolean {
  if (!world.guilds.length && !charterOf(world).guilds) return false;
  const law = charterOf(world).guilds ?? 'free';
  const top = strongest(world);
  // A guild strong enough to rival the throne, led by someone at odds with the ruler.
  const mighty = !!top && influenceOf(world, top) >= 70 && getTie(world, top.leaderId, ruler.id) < 0;
  const fearful = ruler.traits.includes('vengeful') || world.regime === 'junta';
  if (law !== 'banned' && fearful && mighty && strong && chance(rng, 0.06)) {
    amend(world, { guilds: 'banned' }, `${title}${ruler.name}สั่งยุบกิลด์ทั้งหมด หวั่นเกรงอิทธิพลของ${top!.name}`);
    for (const g of [...world.guilds]) {
      const people = membersOf(world, g);
      const mood = people.length ? people.reduce((s, n) => s + loyaltyOf(n), 0) / people.length : 50;
      if (mood < 40) emigrate(world, g, 'ถูกสั่งยุบ จึงย้ายไปตั้งกิลด์ใหม่ที่อื่น');
      else {
        for (const n of people) n.guildId = undefined;
        world.guilds = world.guilds.filter((x) => x !== g);
        log(world, 'guild', `${g.name}ถูกยุบตามคำสั่ง สมาชิกแยกย้ายกันไป`);
      }
    }
    for (const n of adults(world)) if (isAdventurer(n) || n.job === 'merchant') loyaltyNudge(n, -10);
    return true;
  }
  if (law === 'free' && ruler.traits.includes('greedy') && world.guilds.reduce((s, g) => s + g.treasury, 0) >= 300 && chance(rng, 0.25)) {
    amend(world, { guilds: 'taxed' }, `${title}${ruler.name}เก็บภาษีกิลด์ร้อยละ ${GUILD_TAX * 100} ของคลังกิลด์ทุกเดือน`);
    for (const n of adults(world)) if (n.guildId !== undefined) loyaltyNudge(n, -5);
    return true;
  }
  if (law !== 'free' && (ruler.traits.includes('kind') || world.regime === 'republic') && !fearful && chance(rng, 0.3)) {
    amend(world, { guilds: 'free' }, 'รับรองเสรีภาพในการรวมกลุ่ม ตั้งกิลด์ได้อย่างเสรีและไม่ต้องเสียภาษีกิลด์');
    return true;
  }
  return false;
}

// The guilds' standing as the kingdom tab shows it.
export const GUILD_LAW_TH = { free: 'เสรีภาพในการรวมกลุ่ม ตั้งกิลด์ได้อย่างเสรี', taxed: `กิลด์ต้องเสียภาษีร้อยละ ${GUILD_TAX * 100} ของคลังทุกเดือน`, banned: 'ห้ามตั้งกิลด์' } as const;
