import { chance, createRng, int, pick, type Rng } from './rng';
import { clamp, cursed, kill, log, makePlan as plan, perkLevel, stepToward } from './core';
import { updateGuilds } from './guilds';
import { DIVINE_QUEST_COST, ensureGuild, isAdventurer, maybeBounty, maybePestQuest, postDivineQuest, questDay, updateQuests } from './quests';
import { birthday, births, childDay, crushOf, homeOf, isBirthday, isChild, romance } from './life';
import { addTie, pruneTies, socialize } from './ties';
import { DUNGEON_NAMES, FIRST_NAMES, JOB_TH } from './names';
import { FIELDS, PLACES, dungeonDoor } from './places';
import { snap, walkable } from './nav';
import { WALL } from './town';
import { arrivalJob, buyGear, caravanDay, departCaravan, considerTrade, might, harvest, lootFound, marketDay, sell, tendShop, wantsGear, wearGear } from './market';
import { afterStampede, rule } from './politics';
import { REVEAL_COST, darkness, performRitual, reveal, sway } from './cult';
import { HERO_COST, awakenHero, demonDay } from './demonlord';
import { buyPerk, statueHero } from './era';
import { createRealms, ensureRealms, realmsDay } from './realms';
import { diplomacy } from './diplomacy';
import { WAR_COST, warAct, warDay } from './war';
import { realmMiracle, realmMiracleCost, worldEvents } from './worldevents';
import { DUNGEON_KINDS, calm, dungeonsDay, ensureDungeons, healBosses, maybeDiscover, newBoss, tierOf } from './dungeons';
import { bless, curse, dream, fadeBlessing, miracle, miracleCost } from './divine';
import { garrison, guardNear, hasSmith, holdCourt, leisure, levy, patrolPost, payRent, payroll, pickJob, smith } from './society';
import { AWAY, type Command, type Dungeon, type Legacy, type Npc, type Plan, type Trait, type WorldState } from './types';

const TRAITS: readonly Trait[] = ['greedy', 'brave', 'coward', 'loyal', 'vengeful', 'kind'];
const STAMPEDE_POWER = 100;
export const COMMAND_COST = { bless: 5, curse: 5, dream: 3, divineQuest: DIVINE_QUEST_COST, reveal: REVEAL_COST, hero: HERO_COST, perk: 0, war: 0, realm: 0 } as const;
// The faith a power takes, less for a god with the gentle-grace gift.
export const costOf = (world: WorldState, type: keyof typeof COMMAND_COST) =>
  type === 'perk' || type === 'war' || type === 'realm' ? 0 : Math.max(1, Math.round(COMMAND_COST[type] * (1 - 0.1 * perkLevel(world, 'grace'))));
const TOWN_SIZE = 80;
const ARRIVAL_CHANCE = 0.02; // per day while the town is below TOWN_SIZE...
const ARRIVAL_PER_MISSING = 0.004; // ...plus this per missing resident, so a half-empty town refills in months
const MIN_ADVENTURERS = 20; // below this, newcomers come as adventurers
const ADVENTURE_CHANCE = 0.04; // solo dungeon trips are rare and risky; most adventuring goes through quests
const STEAL_CHANCE = 0.12; // when a thief picks their next plan; higher floods the chronicle
const PURSUIT_DAYS = 30; // a thief gives up the chase after this long
const PRUNE_EVERY = 30; // days between dropping long-dead NPCs from the save

export function createWorld(seed: number, npcCount = TOWN_SIZE, legacy?: Legacy): WorldState {
  const rng = createRng(seed);
  const world: WorldState = {
    version: 1,
    seed,
    rng: 0,
    day: 0,
    faith: 10,
    width: 40,
    height: 25,
    npcs: [],
    dungeons: [],
    quests: [],
    legends: [],
    guilds: [],
    ties: {},
    treasury: 300,
    chronicle: [],
    chronicleSeq: 0,
    nextId: 1,
    legacy: legacy ?? { era: 1, stars: 0, perks: {}, past: [] },
  };
  world.faith += perkLevel(world, 'faith') * 25;
  for (let i = 0; i < npcCount; i++) world.npcs.push(spawnNpc(world, rng));
  // The first dungeon is always a gentle one: a cave or a wolf den.
  const kind = pick(rng, ['cave', 'den'] as const);
  world.dungeons.push({
    id: world.nextId++,
    name: pick(rng, kind === 'cave' ? DUNGEON_NAMES : DUNGEON_KINDS.den.names),
    x: int(rng, 30, 37),
    y: int(rng, 3, 20),
    power: 10,
    kind,
    boss: newBoss(kind),
  });
  createRealms(world, rng);
  world.rng = rng.state;
  log(world, 'world', `ยุคที่ ${legacy?.era ?? 1} เริ่มต้น โลกตื่นจากนิทรา`);
  const hero = statueHero(world);
  if (hero) log(world, 'world', `รูปปั้นของผู้กล้า${hero}จากยุคก่อนตั้งตระหง่านกลางเมือง`);
  return world;
}

export function tick(world: WorldState, commands: Command[] = []): WorldState {
  const rng: Rng = { state: world.rng };
  ensureGuild(world);
  ensureDungeons(world);
  ensureRealms(world, rng);
  applyCommands(world, commands, rng);

  world.day++;
  holdCourt(world, rng);
  rule(world, rng);
  darkness(world, rng);
  demonDay(world, rng);
  for (const npc of world.npcs) {
    if (!npc.alive) continue;
    fadeBlessing(world, npc);
    if (isBirthday(world, npc)) birthday(world, npc, rng);
    if (npc.alive) live(world, npc, rng);
  }
  socialize(world, rng);
  romance(world, rng);
  births(world, rng);
  marketDay(world, rng);
  levy(world);
  payroll(world);
  leisure(world, rng);
  updateGuilds(world, rng);
  updateQuests(world, rng);
  dungeonsDay(world);
  realmsDay(world, rng);
  diplomacy(world, rng);
  warDay(world, rng);
  worldEvents(world, rng);
  healBosses(world);
  for (const d of world.dungeons) {
    if (!calm(world, d)) d.power += 0.2;
    if (d.power >= STAMPEDE_POWER) {
      log(world, 'disaster', `มอนสเตอร์ล้นออกจาก ${d.name}!`);
      d.power = 30;
      // Children are hidden indoors; fighters stand in the way, so they're the ones who fall.
      // The garrison holds the streets, sparing the townsfolk behind them.
      const { soldiers, shield } = garrison(world);
      if (soldiers.length) log(world, 'battle', `ทหาร ${soldiers.length} นายออกรบปกป้องเมืองจากฝูงมอนสเตอร์`);
      for (const npc of world.npcs) {
        if (!npc.alive || isChild(npc)) continue;
        // Deadlier kinds of dungeon spill deadlier monsters.
        const risk = tierOf(d) * (npc.job === 'soldier' ? 0.1 / (1 + (npc.gear ?? 0)) : (isAdventurer(npc) ? 0.08 : 0.04) * (1 - shield));
        if (chance(rng, risk)) kill(world, npc, npc.job === 'soldier' ? 'สละชีพปกป้องเมืองจากมอนสเตอร์' : 'ถูกมอนสเตอร์ล้มลง');
      }
      afterStampede(world, shield);
    }
  }
  // Travellers walk in through the west gate while the town is below its starting size.
  const living = world.npcs.filter((n) => n.alive).length;
  if (living < TOWN_SIZE && chance(rng, ARRIVAL_CHANCE + (TOWN_SIZE - living) * ARRIVAL_PER_MISSING)) traveller(world, rng);
  if (world.day % PRUNE_EVERY === 0) prune(world);
  world.faith += world.npcs.filter((n) => n.alive && n.blessed).length * 0.1 + 0.1;
  world.rng = rng.state;
  return world;
}

// A newcomer walks in through the west gate and heads for the inn.
export function traveller(world: WorldState, rng: Rng): void {
  {
    const npc = spawnNpc(world, rng);
    // Adventurers die far more often than farmers; word of guild work draws fighters in when it's short-handed.
    const adventurers = world.npcs.filter((n) => n.alive && isAdventurer(n)).length;
    if (adventurers < MIN_ADVENTURERS && !isAdventurer(npc)) {
      npc.job = pick(rng, ['swordsman', 'mage'] as const);
      npc.rank = 0;
      npc.renown = 0;
    } else {
      const wanted = arrivalJob(world, rng);
      if (wanted && !isAdventurer(npc)) npc.job = wanted;
    }
    npc.x = PLACES.gate.x;
    npc.y = PLACES.gate.y;
    npc.plan = plan('arrive', PLACES.inn, 5);
    world.npcs.push(npc);
    log(world, 'world', `นักเดินทาง ${npc.name} (${JOB_TH[npc.job]}) มาถึงเมือง`, npc.id);
  }
}

// Prefer a name nobody living has; once the pool runs out, number the repeat.
function uniqueName(world: WorldState, rng: Rng): string {
  const taken = new Set(world.npcs.filter((n) => n.alive).map((n) => n.name));
  const free = FIRST_NAMES.filter((n) => !taken.has(n));
  if (free.length) return pick(rng, free);
  const base = pick(rng, FIRST_NAMES);
  let i = 2;
  while (taken.has(`${base} ที่ ${i}`)) i++;
  return `${base} ที่ ${i}`;
}

function spawnNpc(world: WorldState, rng: Rng): Npc {
  const t1 = pick(rng, TRAITS);
  const t2 = pick(rng, TRAITS);
  const npc: Npc = {
    id: world.nextId++,
    name: uniqueName(world, rng),
    age: int(rng, 16, 50),
    job: pickJob(rng, world),
    level: 1,
    gold: int(rng, 5, 30),
    morality: int(rng, -20, 40),
    traits: t1 === t2 ? [t1] : [t1, t2],
    ...snap(world, { x: int(rng, WALL.x0 + 1, WALL.x1 - 1), y: int(rng, WALL.y0 + 1, WALL.y1 - 1) }),
    alive: true,
    blessed: false,
  };
  if (isAdventurer(npc)) {
    npc.rank = 0;
    npc.renown = 0;
  }
  return npc;
}

// ---------- daily life: walk to where the plan is, then act there ----------

function live(world: WorldState, npc: Npc, rng: Rng): void {
  if (isChild(npc)) return childDay(world, npc, rng);
  if (npc.questId !== undefined && questDay(world, npc, rng)) return;
  if (npc.inside === AWAY && npc.trip !== undefined) return caravanDay(world, npc, rng);
  if (npc.inside !== undefined && npc.plan?.kind === 'crusade') return; // in the demon's keep, waiting on the battle
  if (npc.inside !== undefined) return delve(world, npc, rng);
  npc.plan ??= choosePlan(world, npc, rng);
  const p = npc.plan;

  if (p.kind === 'steal') {
    const victim = world.npcs.find((n) => n.id === p.target);
    if (!victim?.alive || victim.inside !== undefined || --p.days <= 0) {
      npc.plan = undefined; // lost the mark
      return;
    }
    p.x = victim.x;
    p.y = victim.y;
    if (Math.abs(npc.x - victim.x) + Math.abs(npc.y - victim.y) <= 1) return steal(world, npc, victim, rng);
  }

  if (npc.x !== p.x || npc.y !== p.y) return stepToward(world, npc, p, rng);
  arrive(world, npc, p, rng);
}

function choosePlan(world: WorldState, npc: Npc, rng: Rng): Plan {
  const home = homeOf(npc, world);
  // Someone sweet on another drifts to wherever they are.
  const crush = crushOf(world, npc);
  if (crush && crush.inside === undefined && chance(rng, 0.3)) return plan('idle', crush, int(rng, 2, 5));
  // Stand somewhere near the spot, not on it, so busy places look like a crowd rather than a stack.
  const near = (s: { x: number; y: number }) => ({
    x: clamp(s.x + int(rng, -3, 3), 0, world.width - 1),
    y: clamp(s.y + int(rng, -1, 3), 0, world.height - 1),
  });
  const idle = () =>
    plan('idle', near(pick(rng, [PLACES.inn, PLACES.square, PLACES.church, home, PLACES.guild, ...PLACES.hangouts])), int(rng, 3, 8));
  considerTrade(world, npc, rng);
  // An empty belly loosens morals; thieves get bolder, and the shady start pilfering.
  const hungry = (npc.hunger ?? 0) >= 2;
  if (hungry && npc.job !== 'thief' && npc.morality < 0 && chance(rng, 0.1)) {
    const prey = world.npcs.filter((n) => n.alive && n !== npc && n.inside === undefined && n.gold >= 5);
    if (prey.length) {
      const mark = pick(rng, prey);
      return plan('steal', mark, PURSUIT_DAYS, mark.id);
    }
  }

  switch (npc.job) {
    case 'swordsman':
    case 'mage': {
      const courage = npc.traits.includes('brave') ? 1.6 : npc.traits.includes('coward') ? 0.4 : 1;
      if (wantsGear(world, npc) && chance(rng, 0.2)) return plan('buy', PLACES.shop, 0);
      if (chance(rng, ADVENTURE_CHANCE * courage)) {
        const d = pick(rng, world.dungeons);
        return plan('adventure', dungeonDoor(d), 0, d.id);
      }
      return chance(rng, 0.6) ? plan('idle', near(pick(rng, [PLACES.guild, PLACES.inn])), int(rng, 3, 8)) : idle();
    }
    case 'merchant':
      return chance(rng, 0.7) ? plan('work', PLACES.shop, int(rng, 5, 10)) : idle();
    case 'blacksmith':
      return chance(rng, 0.75) ? plan('work', PLACES.forge, int(rng, 5, 10)) : idle();
    case 'innkeeper':
      return chance(rng, 0.8) ? plan('work', PLACES.inn, int(rng, 5, 10)) : idle();
    case 'courtesan':
      return chance(rng, 0.7) ? plan('work', PLACES.brothel, int(rng, 4, 8)) : idle();
    case 'priest':
      return chance(rng, 0.75) ? plan('work', PLACES.church, int(rng, 5, 10)) : idle();
    case 'soldier':
      return chance(rng, 0.7) ? plan('work', patrolPost(rng), int(rng, 4, 8)) : idle();
    case 'noble':
      return chance(rng, 0.5) ? plan('idle', near(pick(rng, [PLACES.manor, PLACES.castle])), int(rng, 3, 8)) : idle();
    case 'king':
      return chance(rng, 0.7) ? plan('idle', near(PLACES.castle), int(rng, 4, 10)) : idle();
    case 'farmer':
      // The fields are a walk past the south gate, so farmers stay out there a good while.
      if (chance(rng, 0.8)) {
        const field = { x: int(rng, FIELDS.x0, FIELDS.x1), y: int(rng, FIELDS.y0, FIELDS.y1) };
        return plan('work', field, int(rng, 10, 20));
      }
      return idle();
    case 'thief': {
      const marks = world.npcs.filter((n) => n.alive && n !== npc && n.inside === undefined && n.gold >= 5);
      if (marks.length && chance(rng, STEAL_CHANCE * (hungry ? 2 : 1))) {
        const victim = pick(rng, marks);
        return plan('steal', victim, PURSUIT_DAYS, victim.id);
      }
      return idle();
    }
  }
}

function arrive(world: WorldState, npc: Npc, p: Plan, rng: Rng): void {
  switch (p.kind) {
    case 'adventure':
      npc.inside = p.target;
      npc.plan = plan('delve', p, int(rng, 3, 6), p.target);
      return;
    case 'buy':
      buyGear(world, npc);
      npc.plan = undefined;
      return;
    case 'ritual':
      performRitual(world, npc);
      npc.plan = undefined;
      return;
    case 'caravan':
      departCaravan(world, npc);
      return;
    case 'crusade':
      npc.inside = p.target; // through the dungeon to the keep behind it
      return;
    case 'work':
      if (npc.job === 'farmer') {
        payRent(world, npc, harvest(world, npc, rng), rng);
        maybePestQuest(world, npc, rng);
      } else if (npc.job === 'merchant') tendShop(world, npc, rng, hasSmith(world));
      else if (npc.job === 'blacksmith') smith(world, npc, rng);
      else if (npc.job === 'priest') world.faith += 0.02; // prayers said for the god who watches
      const trade = world.guilds.find((g) => g.id === npc.guildId && g.kind === 'merchants');
      if (trade && chance(rng, 0.15)) trade.treasury += 1; // membership dues
      if (--p.days <= 0) npc.plan = undefined;
      return;
    case 'idle':
      // Mill about near the spot, then pick something new.
      if (--p.days <= 0) npc.plan = undefined;
      else if (chance(rng, 0.4)) {
        const x = npc.x + int(rng, -1, 1);
        const y = npc.y + int(rng, -1, 1);
        if (walkable(world, x, y)) {
          npc.x = x;
          npc.y = y;
        }
        p.x = npc.x;
        p.y = npc.y;
      }
      return;
    default:
      npc.plan = undefined; // return, flee, arrive: the walk was the point
  }
}

// Time passes inside the dungeon; the outcome is decided as the adventurer comes out.
function delve(world: WorldState, npc: Npc, rng: Rng): void {
  const p = npc.plan!;
  if (--p.days > 0) return;
  const d = world.dungeons.find((x) => x.id === npc.inside) as Dungeon;
  npc.inside = undefined;
  // Strength grows slower than levels and the dungeon always fights back, so nobody snowballs.
  const strength = might(world, npc);
  if (chance(rng, strength / (strength + (d.power * 0.5 + 10) * tierOf(d)))) {
    npc.gold += Math.round(int(rng, 5, 20) * tierOf(d));
    sell(world, npc, 'loot', Math.round(lootFound(rng) * tierOf(d)), rng);
    maybeDiscover(world, npc, rng); // fangs, hides and crystals for the shop
    d.power = Math.max(10, d.power - 5);
    // Each level is harder to earn than the last; only level-ups make the chronicle.
    if (chance(rng, 2 / (npc.level + 1))) {
      npc.level++;
      log(world, 'battle', `${npc.name} พิชิต ${d.name} ขึ้นเลเวล ${npc.level}`, npc.id);
    }
  } else {
    if (chance(rng, 0.08)) return kill(world, npc, `หายไปใน ${d.name}`);
    wearGear(npc, rng);
  }
  npc.plan = plan('return', PLACES.guild, 0);
}

function steal(world: WorldState, npc: Npc, victim: Npc, rng: Rng): void {
  // More often than not the mark notices and the thief slinks off empty-handed.
  // A thieves' society teaches its members a lighter touch.
  const society = world.guilds.find((g) => g.id === npc.guildId && g.kind === 'thieves');
  // A soldier on watch nearby may catch the thief in the act.
  const guard = guardNear(world, victim.x, victim.y);
  const doomed = cursed(world, npc); // a cursed thief fumbles
  if (guard && chance(rng, doomed ? 0.85 : 0.5)) {
    const fine = Math.floor(npc.gold / 2);
    npc.gold -= fine;
    world.treasury += fine;
    addTie(world, victim, npc, -15);
    addTie(world, guard, npc, -10);
    addTie(world, victim, guard, 8);
    log(world, 'theft', `ทหาร${guard.name}จับ${npc.name}ได้ขณะกำลังขโมยของ${victim.name}${fine ? ` ปรับ ${fine} ทอง` : ''}`, npc.id);
    npc.plan = plan('flee', snap(world, { x: int(rng, 0, 26), y: int(rng, 18, 24) }), 0);
    return;
  }
  if (chance(rng, (society ? 0.55 : 0.4) * (doomed ? 0.5 : 1))) {
    const stolen = Math.ceil(victim.gold / 2);
    victim.gold -= stolen;
    npc.gold += stolen;
    npc.morality = clamp(npc.morality - 5, -100, 100);
    if (society) society.treasury += Math.floor(stolen / 5);
    sway(world, -0.3);
    log(world, 'theft', `${npc.name} ขโมยทอง ${stolen} เหรียญจาก ${victim.name}`, npc.id);
    addTie(world, victim, npc, -10); // rumours get around
    maybeBounty(world, victim, npc, stolen, rng);
  } else {
    addTie(world, victim, npc, -25); // caught in the act
  }
  const hideout = snap(world, { x: int(rng, 0, 26), y: int(rng, 18, 24) }); // out past the fields
  npc.plan = plan('flee', hideout, 0);
}

// Drop the dead nobody's story still points at, so saves don't grow forever.
function prune(world: WorldState): void {
  const remembered = new Set([...world.chronicle, ...world.legends].map((e) => e.npcId));
  for (const q of world.quests) for (const id of [...q.partyIds, q.patronId, q.targetId]) remembered.add(id);
  for (const g of world.guilds) remembered.add(g.leaderId);
  world.npcs = world.npcs.filter((n) => n.alive || remembered.has(n.id));
  pruneTies(world, new Set(world.npcs.filter((n) => n.alive).map((n) => n.id)));
}

// Paused, powers land without a tick, so they draw from the world's own random stream.
export function applyCommands(world: WorldState, commands: Command[], rng?: Rng): void {
  const r = rng ?? { state: world.rng };
  for (const cmd of commands) applyCommand(world, cmd, r);
  if (!rng) world.rng = r.state;
}

function applyCommand(world: WorldState, cmd: Command, rng: Rng): void {
  if (cmd.type === 'perk') {
    buyPerk(world, cmd.perk);
    return;
  }
  if (cmd.type === 'realm') {
    const cost = realmMiracleCost(world, cmd.kind);
    if (world.faith >= cost && realmMiracle(world, cmd.realmId, cmd.kind)) world.faith -= cost;
    return;
  }
  if (cmd.type === 'war') {
    const cost = Math.max(1, Math.round(WAR_COST[cmd.act] * (1 - 0.1 * perkLevel(world, 'grace'))));
    if (world.faith >= cost && warAct(world, cmd.act)) world.faith -= cost;
    return;
  }
  if (cmd.type === 'miracle') {
    const cost = miracleCost(world, cmd.kind);
    if (world.faith >= cost && miracle(world, cmd.kind, rng)) world.faith -= cost;
    return;
  }
  const cost = costOf(world, cmd.type);
  if (world.faith < cost) return;
  if (cmd.type === 'divineQuest') {
    world.faith -= cost;
    postDivineQuest(world);
    return;
  }
  if (cmd.type === 'hero') {
    if (awakenHero(world, cmd.npcId)) world.faith -= cost;
    return;
  }
  if (cmd.type === 'reveal') {
    if (reveal(world)) world.faith -= cost;
    return;
  }
  const npc = world.npcs.find((n) => n.id === cmd.npcId && n.alive);
  if (!npc) return;
  if (cmd.type === 'bless') bless(world, npc);
  else if (cmd.type === 'curse') curse(world, npc);
  else if (!dream(world, npc, cmd.job, cmd.kind)) return; // nothing to dream of: the faith is kept
  world.faith -= cost;
}
