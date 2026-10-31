// The rule tests run by run.mjs: each sets up a scene in a fresh world, ticks it, and checks.
import { applyCommands, createWorld, foundWorld, tick, traveller } from '../../src/sim/world';
import { TOWN_RANK, founded, rankOf } from '../../src/sim/growth';
import { kill } from '../../src/sim/core';
import { wed, births, bornTo, homeOf } from '../../src/sim/life';
import { ROOMS, capacity, inShack, shackDoor, townPop } from '../../src/sim/housing';
import { fire, shantyCrime } from '../../src/sim/slums';
import { FIRST_LOTS, LOTS, MAP_W, MILL_PLOTS, SHACK_SPOTS, WALL, millDoor, townLayout } from '../../src/sim/town';
import { walkable } from '../../src/sim/nav';
import { TECH_ORDER } from '../../src/sim/research';
import { found as foundMill, handsOf, industryDay, wageOf } from '../../src/sim/industry';
import { goodsOf, harvest } from '../../src/sim/market';
import { ruinHomes } from '../../src/sim/disasters';
import { MAX_TENETS, creedCounts, daysToHoly, isHolyDay, pietyPull, prayers, proclaim, religionOf, strain, tenetCost } from '../../src/sim/religion';
import { tenetOn } from '../../src/sim/core';
import { churchOf, headOf } from '../../src/sim/church';
import { faithLaw } from '../../src/sim/charter';
import { commit, jailed } from '../../src/sim/justice';
import { FOREIGN_GODS, abroadPrayers, holyTarget, realmFaithName, sendMission, sharesFaith } from '../../src/sim/missions';
import { endWar, raid as raidRealm, warDay } from '../../src/sim/war';
import { begin as beginSaga, sagasDay } from '../../src/sim/sagas';
import { log as logLine } from '../../src/sim/core';
import { ourForces } from '../../src/sim/war';
import { PLACES } from '../../src/sim/places';
import { decide, raise, whisperCost } from '../../src/sim/happenings';
import { addMod, modOf } from '../../src/sim/core';
import { payrollReserve } from '../../src/sim/society';
import { TARGET, ensureMarket, target } from '../../src/sim/market';
import { canSend } from '../../src/sim/villages';
import { concede, crackdown, members, revolution } from '../../src/sim/movements';
import { setTie } from '../../src/sim/ties';
import { reignDay } from '../../src/sim/succession';
import { regimeEventsDay } from '../../src/sim/regimeEvents';
import { election } from '../../src/sim/republic';
import { forbids, general, governor, mind, partiesDay, rulingIdeology } from '../../src/sim/parties';
import { communeDay, proclaimCommune } from '../../src/sim/commune';
import { council } from '../../src/sim/government';
import { grant } from '../../src/sim/decrees';
import { writeCharter } from '../../src/sim/charter';
import type { Npc, WorldState } from '../../src/sim/types';

type Test = [string, () => void];
export const tests: Test[] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

function ok(cond: unknown, what: string): void {
  if (!cond) throw new Error(what);
}

const world = (seed = 7): WorldState => {
  const w = createWorld(seed);
  tick(w); // everyone takes up a creed on the first day
  return w;
};
const grown = (w: WorldState) => w.npcs.filter((n) => n.alive && n.age >= 16 && n.job !== 'king');
const run = (w: WorldState, days: number) => {
  for (let i = 0; i < days; i++) tick(w);
};
// Two single grown townsfolk, neither a priest, and one priest.
function cast(w: WorldState): { a: Npc; b: Npc; priest: Npc } {
  const [a, b, priest] = grown(w).filter((n) => n.spouseId === undefined && n.questId === undefined);
  priest.job = 'priest';
  for (const n of grown(w)) if (n.job === 'priest' && n !== priest) n.job = 'farmer';
  return { a, b, priest };
}

// ---------- phase 1: belief in daily life ----------

test('every soul takes up a creed, the town mostly the god, the villages more the spirits', () => {
  const w = world();
  ok(w.npcs.every((n) => !n.alive || n.creed), 'a townsperson has no creed');
  const c = creedCounts(w);
  ok(c.god > c.spirits + c.none, `the god should lead in town: ${JSON.stringify(c)}`);
  for (const n of w.npcs) ok(n.piety! >= 0 && n.piety! <= 100, `piety out of range: ${n.piety}`);
});

test('the god draws faith only from those who believe in them', () => {
  const w = world();
  for (const n of [...w.npcs, ...(w.villagers ?? [])]) n.creed = 'none';
  ok(prayers(w) === 0, 'unbelievers should not pray');
  for (const n of w.npcs) {
    n.creed = 'god';
    n.piety = 100;
  }
  const full = prayers(w);
  for (const n of w.npcs) n.piety = 20;
  ok(full > 0 && prayers(w) < full, 'devout believers should pray more than lukewarm ones');
});

test('before a holy day the devout near the church walk over; on the day believers give for the larder', () => {
  const w = world();
  while (daysToHoly({ ...w, day: w.day + 1 }) !== 2) tick(w);
  for (const n of grown(w)) {
    n.creed = 'god';
    n.piety = 100;
    n.gold = 100;
    if (n.questId === undefined && n.inside === undefined) {
      n.plan = undefined;
      Object.assign(n, { x: PLACES.church.x, y: PLACES.church.y + 1 });
    }
  }
  tick(w);
  const praying = w.npcs.filter((n) => n.plan?.kind === 'pray');
  ok(praying.length >= 10, `few went to the church: ${praying.length}`);
  run(w, 2);
  ok(isHolyDay(w), 'two days on should be the holy day');
  ok((religionOf(w).worshippers ?? 0) >= praying.length, `fewer kept the day than went: ${religionOf(w).worshippers}`);
  ok(religionOf(w).offerings > 0, 'nobody gave on the holy day');
  run(w, 3);
  ok(!w.npcs.some((n) => n.plan?.kind === 'pray'), 'someone stayed at the church after the holy day');
});

test('believers marry at the church: the priest is paid and the less devout takes the creed', () => {
  const w = world();
  const { a, b, priest } = cast(w);
  a.creed = 'god';
  a.piety = 90;
  b.creed = 'spirits';
  b.piety = 30;
  a.gold = b.gold = 100;
  const purse = priest.gold;
  wed(w, a, b);
  ok(w.chronicle.at(-1)!.text.includes('โบสถ์'), `not told as a church wedding: ${w.chronicle.at(-1)!.text}`);
  ok(priest.gold > purse, 'the priest was not paid');
  ok(b.creed === 'god', 'the less devout partner kept their creed');
  ok(religionOf(w).weddings === 1, 'the wedding was not counted');
});

test('unbelievers marry by the old rites, with no priest paid', () => {
  const w = world();
  const { a, b, priest } = cast(w);
  a.creed = b.creed = 'spirits';
  const purse = priest.gold;
  wed(w, a, b);
  ok(w.chronicle.at(-1)!.text.includes('ผีบรรพบุรุษ'), `not told as the old rites: ${w.chronicle.at(-1)!.text}`);
  ok(priest.gold === purse, 'a priest was paid for a wedding outside the church');
});

test('a child takes the faith of the more devout parent and is named at the church', () => {
  const w = world();
  const { a, b } = cast(w);
  a.creed = 'none';
  a.piety = 10;
  b.creed = 'god';
  b.piety = 80;
  a.age = b.age = 30;
  wed(w, a, b);
  const before = w.npcs.length;
  for (let i = 0; i < 4000 && w.npcs.length === before; i++) births(w, { state: i + 1 });
  const child = w.npcs.at(-1)!;
  ok(w.npcs.length > before && child.parentIds?.includes(a.id), 'no child was born');
  ok(child.creed === 'god', `the child took ${child.creed}`);
  ok(religionOf(w).namings >= 1, 'the naming was not counted');
});

test("a believer's funeral pays the priest and turns the family toward the god", () => {
  const w = world();
  const { a, b, priest } = cast(w);
  wed(w, a, b);
  a.creed = b.creed = 'god';
  b.piety = 40;
  b.gold = 100;
  const purse = priest.gold;
  kill(w, a, 'จากไปอย่างสงบ');
  tick(w);
  ok(religionOf(w).funerals >= 1, 'no funeral was held');
  ok(priest.gold > purse, 'the priest was not paid');
  ok(b.piety! > 40, 'grief did not turn the widow toward the god');
});

test('letters and a town without priests wear belief down; priests and a cathedral build it up', () => {
  const doubt = world(3);
  for (const n of doubt.npcs) {
    n.lettered = true;
    if (n.job === 'priest') n.job = 'farmer';
  }
  const faith = world(3);
  (faith.works ??= {}).cathedral = 0;
  for (const n of grown(faith).slice(0, 8)) n.job = 'priest';
  run(doubt, 365 * 3);
  run(faith, 365 * 3);
  const d = creedCounts(doubt);
  const f = creedCounts(faith);
  ok(d.piety < f.piety, `piety: doubters ${d.piety}, faithful ${f.piety}`);
  ok(d.god / (d.god + d.spirits + d.none) < f.god / (f.god + f.spirits + f.none), 'the doubters kept as many believers');
});

// ---------- phase 2: the god's commandments ----------

const devout = (w: WorldState) => {
  for (const n of w.npcs) {
    n.creed = 'god';
    n.piety = 90;
  }
  religionOf(w).adherence = 0.9;
};

test("a commandment goes to the most devout priest in a dream, who becomes the prophet", () => {
  const w = world();
  const { priest } = cast(w);
  priest.piety = 99;
  w.faith = 500;
  applyCommands(w, [{ type: 'command' as never, tenet: 'charity' } as never]); // unknown commands are ignored
  applyCommands(w, [{ type: 'tenet', tenet: 'charity' }]);
  ok(tenetOn(w, 'charity'), 'the commandment was not handed down');
  ok(priest.prophet && religionOf(w).tenets![0].prophetId === priest.id, 'the devout priest was not the prophet');
  ok(w.faith === 500 - tenetCost(w, 'nomeat'), `faith paid: ${500 - w.faith}`);
  applyCommands(w, [{ type: 'tenet', tenet: 'charity' }]);
  ok(!tenetOn(w, 'charity'), 'the commandment was not taken back');
});

test(`no more than ${MAX_TENETS} commandments at once, and none without the faith to pay`, () => {
  const w = world();
  cast(w);
  w.faith = 1000;
  for (const k of ['usury', 'charity', 'nomeat', 'learning'] as const) applyCommands(w, [{ type: 'tenet', tenet: k }]);
  ok(religionOf(w).tenets!.length === MAX_TENETS, `in force: ${religionOf(w).tenets!.length}`);
  w.faith = 5;
  applyCommands(w, [{ type: 'tenet', tenet: 'usury' }]);
  ok(tenetOn(w, 'usury'), 'taken back without the faith to pay');
});

test('no usury: the crown owes the trade house no interest while the town keeps the word', () => {
  const owed = (on: boolean) => {
    const w = world();
    const { a } = cast(w);
    devout(w);
    if (on) proclaim(w, 'usury');
    a.job = 'merchant';
    a.guildId = 999;
    w.guilds.push({ id: 999, name: 'บ้านทดสอบ', kind: 'merchants', leaderId: a.id, founded: 0, renown: 0, treasury: 5000 });
    w.debt = { guildId: 999, owed: 700, since: 0 }; // not so deep the house calls it in and takes the crown
    w.npcs.find((n) => n.id === w.kingId)!.traits = ['kind']; // nor a greedy king who refuses to pay
    // Enough for the payroll, so the crown neither repays nor goes bankrupt (and hands the town to the merchants).
    for (let d = 0; d < 31; d++) {
      w.treasury = payrollReserve(w) + 150;
      tick(w);
    }
    return [w.debt?.owed ?? 0, w.guilds.some((g) => g.id === 999)];
  };
  const [kept, without] = [owed(true), owed(false)];
  ok(kept[0] < without[0], `the debt grew as fast under the commandment: ${kept} vs ${without}`);
});

test('no meat: the devout eat grain, and hunters and herders are ground down by it', () => {
  const meatLeft = (on: boolean) => {
    const w = world();
    cast(w);
    devout(w);
    if (on) proclaim(w, 'nomeat');
    const m = w.market!;
    m.stock.grain = m.stock.meat = 500;
    m.price.grain = 2;
    m.price.meat = 2; // meat the cheaper for its worth: without the word, they would eat it
    for (const n of w.npcs) n.gold = 100;
    run(w, 10);
    return m.stock.meat;
  };
  const kept = meatLeft(true);
  const eaten = meatLeft(false);
  ok(kept > eaten + 30, `meat left: ${Math.round(kept)} with the word, ${Math.round(eaten)} without`);
  const w = world();
  const { a } = cast(w);
  a.job = 'hunter';
  ok(strain(w, a, 'nomeat') < 0, 'a hunter does not mind the commandment');
});

test('a day of rest: the devout farmer brings in no harvest on the holy day', () => {
  const harvested = (on: boolean) => {
    const w = world();
    const { a } = cast(w);
    devout(w);
    if (on) proclaim(w, 'restday');
    while (!isHolyDay({ ...w, day: w.day + 1 })) tick(w);
    a.job = 'farmer';
    a.plan = { kind: 'work', x: a.x, y: a.y, days: 5 };
    const grain = w.market!.stock.grain;
    const gold = a.gold;
    tick(w);
    return w.market!.stock.grain - grain + (a.gold - gold);
  };
  ok(harvested(true) <= 0 && harvested(false) !== harvested(true), 'the farmer worked the holy day');
});

test('holy war makes our army stronger; learning lets readers keep their faith and study faster', () => {
  const w = world();
  cast(w);
  devout(w);
  const before = ourForces(w).strength;
  proclaim(w, 'holywar');
  ok(ourForces(w).strength > before, 'the army did not grow stronger');
  const reader = grown(w)[0];
  reader.lettered = true;
  const pull = pietyPull(w, reader, 2, 50);
  proclaim(w, 'learning');
  ok(pietyPull(w, reader, 2, 50) > pull, 'reading still wears faith down under the commandment');
});

// ---------- phase 3: the church, the law of the faith, and sects ----------

const toMonthDay = (w: WorldState, d: number) => {
  while ((w.day + 1) % 30 !== d) tick(w);
};

test('a tenth of the tithe goes to the church purse, and the church picks a head and weighs its standing', () => {
  const w = world();
  const { priest } = cast(w);
  priest.level = 9;
  for (const n of grown(w)) n.gold = 500;
  while ((w.day + 1) % 30 !== 0) tick(w);
  const purse = churchOf(w).purse;
  tick(w);
  ok(churchOf(w).purse > purse, 'the tithe left the church purse empty');
  toMonthDay(w, 5);
  tick(w);
  ok(headOf(w)?.id === priest.id, 'the seasoned priest was not made head');
  ok(churchOf(w).influence > 0, 'the church has no standing');
});

test('an influential church denounces an impious ruler, and the devout turn against the throne', () => {
  const w = world();
  cast(w);
  const ruler = w.npcs.find((n) => n.id === w.kingId)!;
  ruler.creed = 'none';
  for (const n of grown(w)) if (n !== ruler) Object.assign(n, { creed: 'god', piety: 90, loyalty: 60 });
  (w.works ??= {}).cathedral = 0;
  toMonthDay(w, 5);
  tick(w);
  ok(churchOf(w).stance === 'denounces', `the church's word: ${churchOf(w).stance} (influence ${churchOf(w).influence})`);
  const devout = grown(w).filter((n) => n !== ruler);
  ok(devout.reduce((s, n) => s + (n.loyalty ?? 50), 0) / devout.length < 60, 'the devout kept their loyalty');
});

test('under a hunting law, outsiders convert out of fear or flee, and a sect member is tried', () => {
  const w = world();
  cast(w);
  Object.assign(w.charter!, faithLaw('persecute'));
  const outsiders = grown(w).filter((n) => n.job !== 'king').slice(0, 30);
  for (const n of outsiders) n.creed = 'none';
  const preacher = outsiders[0];
  preacher.creed = 'sect';
  religionOf(w).sect = { name: 'นิกายทดสอบ', founded: 0, leaderId: preacher.id, cause: 'reform' };
  for (let m = 0; m < 12; m++) {
    toMonthDay(w, 5);
    tick(w);
  }
  const stayed = outsiders.filter((n) => n.alive && n.creed === 'none').length;
  ok(stayed < 29, `nobody was pressed: ${stayed} still outside`);
  ok(w.chronicle.some((e) => e.text.includes('ข้อหานอกรีต')) || preacher.creed !== 'sect', 'the sect was never tried');
});

test('a reading town breeds a sect, led by a lettered believer', () => {
  const w = world(11);
  cast(w);
  for (const n of grown(w)) Object.assign(n, { lettered: true, creed: 'god', piety: 70 });
  w.crown!.fear = Infinity; // a crown that keeps its streets quiet, so the town stays as it is
  for (let m = 0; m < 240 && !religionOf(w).sect; m++) {
    toMonthDay(w, 5);
    tick(w);
  }
  const sect = religionOf(w).sect;
  ok(sect, 'no sect broke away in twenty years');
  ok(w.npcs.find((n) => n.id === sect!.leaderId)?.creed === 'sect', 'the leader does not follow the sect');
});

const withSect = () => {
  const w = world();
  cast(w);
  const members = grown(w).filter((n) => n.job !== 'king' && n.job !== 'priest').slice(0, 10);
  for (const n of members) Object.assign(n, { creed: 'sect', piety: 60 });
  religionOf(w).sect = { name: 'นิกายทดสอบ', founded: 0, leaderId: members[0].id, cause: 'tenet' };
  w.faith = 100;
  return { w, members };
};

test('the god embraces a sect: its people return to the church, which reforms', () => {
  const { w, members } = withSect();
  w.faith = 100;
  proclaim(w, 'nomeat');
  applyCommands(w, [{ type: 'sect', act: 'embrace' }]);
  ok(!religionOf(w).sect, 'the sect is still apart');
  ok(members.every((n) => n.creed === 'god'), 'not every follower came back');
  ok(religionOf(w).reformed, 'the church did not reform');
  ok(!tenetOn(w, 'nomeat'), 'the commandment the sect rejected still stands');
  ok(w.faith < 100, 'the god paid nothing');
  const reader = grown(w)[0];
  reader.lettered = true;
  const reformed = pietyPull(w, reader, 2, 50);
  religionOf(w).reformed = false;
  ok(reformed > pietyPull(w, reader, 2, 50), 'reading wears faith down as much in a reformed church');
});

test('the god condemns a sect: it scatters, half back to the church and half out of the faith', () => {
  const { w, members } = withSect();
  applyCommands(w, [{ type: 'sect', act: 'condemn' }]);
  ok(!religionOf(w).sect, 'the sect still stands');
  ok(members.filter((n) => n.creed === 'god').length === 5 && members.filter((n) => n.creed === 'none').length === 5, `creeds after: ${members.map((n) => n.creed)}`);
});

test("a sect follower before the church's court may recant", () => {
  let recanted = 0;
  for (let i = 0; i < 10; i++) {
    const { w, members } = withSect();
    commit(w, members[1], 'heresy', { state: i + 1 }, 0, undefined, true);
    if (members[1].creed === 'god') recanted++;
  }
  ok(recanted > 0 && recanted < 10, `recanted ${recanted} of 10`);
});

// ---------- phase 4: the faiths of the world ----------

// Two priests, so one can be spared for a mission.
function twoPriests(w: WorldState): [Npc, Npc] {
  const { priest, a } = cast(w);
  a.job = 'priest';
  a.creed = priest.creed = 'god';
  a.piety = 95;
  priest.piety = 60;
  priest.level = 9; // the head of the church stays home
  return [priest, a];
}

test('each realm keeps the old god of its land until its people take up ours', () => {
  const w = world();
  for (const r of w.realms!) ok(!sharesFaith(r) && realmFaithName(r) === FOREIGN_GODS[r.terrain], `${r.name} starts with ${realmFaithName(r)}`);
});

test('a missionary leaves town, wins converts, and comes home; the last priest is never sent', () => {
  const w = world();
  const [, missionaryPriest] = twoPriests(w);
  const r = w.realms!.find((x) => !x.fallen)!;
  r.relation = 20;
  w.faith = 100;
  applyCommands(w, [{ type: 'mission', realmId: r.id }]);
  ok(r.mission?.priestId === missionaryPriest.id, 'the devout priest was not sent');
  ok(missionaryPriest.inside !== undefined, 'the missionary is still in town');
  run(w, 155); // home at the first month's reckoning after the mission's days are out
  ok(!r.mission && missionaryPriest.alive && missionaryPriest.inside === undefined, 'the missionary did not come home');
  ok((r.converts ?? 0) >= 15, `converts: ${r.converts}`);
  const lone = world();
  cast(lone);
  lone.faith = 100;
  applyCommands(lone, [{ type: 'mission', realmId: lone.realms![0].id }]);
  ok(!lone.realms![0].mission && lone.faith === 100, 'the only priest was sent away');
});

test('a hostile realm may martyr the missionary, and the faithful at home are stirred by it', () => {
  let martyred = 0;
  for (let i = 0; i < 6 && !martyred; i++) {
    const w = world(20 + i);
    const [, m] = twoPriests(w);
    const r = w.realms!.find((x) => !x.fallen)!;
    r.relation = -80;
    sendMission(w, r.id);
    run(w, 125);
    if (!m.alive) martyred++;
  }
  ok(martyred > 0, 'no missionary in a hateful land was ever martyred');
});

test('a realm whose people mostly believe takes up our god, warms to us, and prays to it', () => {
  const w = world();
  const r = w.realms!.find((x) => !x.fallen)!;
  r.converts = 95;
  r.relation = 0;
  for (let m = 0; m < 24 && !sharesFaith(r); m++) {
    toMonthDay(w, 12);
    tick(w);
  }
  ok(sharesFaith(r), 'the realm never took up our god');
  ok(r.relation > 0, `relation: ${r.relation}`);
  ok(abroadPrayers(w) > 0, 'the believers abroad do not pray');
});

test('under holy war, a won war turns the vanquished; a devout ruler has grievance against other gods', () => {
  const w = world();
  devout(w);
  proclaim(w, 'holywar');
  const r = w.realms!.find((x) => !x.fallen)!;
  r.relation = -50;
  const ruler = w.npcs.find((n) => n.id === w.kingId)!;
  ruler.piety = 90;
  ok(holyTarget(w, r, ruler), 'a devout ruler under holy war bears no grievance against another god');
  r.faith = 'god';
  ok(!holyTarget(w, r, ruler), 'a holy war against the same god');
  r.faith = undefined;
  r.converts = 0;
  w.war = { realmId: r.id, since: w.day, attacker: 'us', nextBattle: w.day + 99, score: 3, battles: 3 };
  r.war = true;
  endWar(w, r, 'won');
  ok((r.converts ?? 0) >= 30, `converts after the war: ${r.converts}`);
});

// ---------- happenings: matters that come up, decided by someone in town ----------

const rngOf = (w: WorldState) => ({ state: w.rng });
const kingOf = (w: WorldState) => w.npcs.find((n) => n.id === w.kingId && n.alive)!;
// A bumper harvest: the market holds well over what the town needs.
function bumper(w: WorldState): void {
  ensureMarket(w).stock.grain = TARGET.grain * 2.5;
}
// How often a decider takes each option over many fresh tries at the same matter.
function tally(seedBase: number, setup: (w: WorldState) => void, tries = 40): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < tries; i++) {
    const w = world(seedBase + i);
    setup(w);
    const r = rngOf(w);
    raise(w, 'bumper', r);
    decide(w, r);
    const h = w.happenings!.at(-1)!;
    out[h.chosen!] = (out[h.chosen!] ?? 0) + 1;
  }
  return out;
}

test('a happening waits a few days, then its decider settles it; the book and the chronicle keep it', () => {
  const w = world();
  bumper(w);
  const h = raise(w, 'bumper', rngOf(w))!;
  ok(h && w.happening === h, 'the bumper harvest did not come up');
  ok(h.chooserId === w.kingId, 'the king should decide what to do with the harvest');
  run(w, 2);
  ok(w.happening === h, 'it was decided before its time');
  run(w, 5);
  ok(!w.happening, 'still waiting after its time was up');
  const done = w.happenings!.at(-1)!;
  ok(done.chosen && done.outcome, 'decided with no choice or outcome');
  ok(w.chronicle.some((e) => e.kind === 'happening' && e.text.includes('เลือก')), 'the chronicle does not say what was chosen');
});

test('the decider decides as the person they are: a greedy king sells, a kind one feasts', () => {
  const greedy = tally(100, (w) => {
    bumper(w);
    kingOf(w).traits = ['greedy'];
  });
  const kind = tally(100, (w) => {
    bumper(w);
    kingOf(w).traits = ['kind'];
  });
  ok((greedy.sell ?? 0) > (greedy.feast ?? 0), `greedy king: ${JSON.stringify(greedy)}`);
  ok((kind.feast ?? 0) > (kind.sell ?? 0), `kind king: ${JSON.stringify(kind)}`);
});

test('the god whispers for an option once, pays for it, and tips the scale', () => {
  const w = world();
  bumper(w);
  w.faith = 100;
  raise(w, 'bumper', rngOf(w));
  applyCommands(w, [{ type: 'whisper', key: 'feast' }]);
  ok(w.happening!.whisper === 'feast', 'the whisper did not take');
  ok(w.faith === 100 - whisperCost(w), `faith after whispering: ${w.faith}`);
  applyCommands(w, [{ type: 'whisper', key: 'sell' }]);
  ok(w.happening!.whisper === 'feast' && w.faith === 100 - whisperCost(w), 'a second whisper changed the matter or cost faith');
  const plain = tally(200, (x) => {
    bumper(x);
    kingOf(x).traits = ['greedy'];
  });
  let feasts = 0;
  for (let i = 0; i < 40; i++) {
    const x = world(200 + i);
    bumper(x);
    kingOf(x).traits = ['greedy'];
    x.faith = 100;
    const r = rngOf(x);
    raise(x, 'bumper', r);
    x.happening!.whisper = 'feast';
    decide(x, r);
    if (x.happenings!.at(-1)!.chosen === 'feast') feasts++;
  }
  ok(feasts > (plain.feast ?? 0), `whispered feasts ${feasts} vs plain ${plain.feast ?? 0}`);
});

test('a life the player lives decides its own matter, for free and at once', () => {
  const w = world();
  const young = grown(w).find((n) => n.age <= 25 && n.spouseId === undefined && n.questId === undefined && !['king', 'noble', 'priest', 'judge'].includes(n.job))!;
  ok(young, 'no young single townsperson to test with');
  young.inside = undefined;
  for (const n of grown(w)) if (n !== young && n.age <= 25) n.age = 26; // the only one dreaming of the city
  applyCommands(w, [{ type: 'incarnate', npcId: young.id }]);
  const r = rngOf(w);
  const h = raise(w, 'wanderlust', r);
  ok(h?.chooserId === young.id, `the player was never the one to decide: avatar ${w.avatar?.id}, young ${young.id}, last ${h?.chooserId}`);
  const faith = w.faith;
  applyCommands(w, [{ type: 'whisper', key: 'stay' }]);
  ok(!w.happening, 'the player\'s choice did not settle it');
  ok(w.happenings!.at(-1)!.chosen === 'stay' && young.alive, 'the player stayed but the choice says otherwise');
  ok(w.faith === faith, 'the player paid faith for their own life\'s choice');
});

test('a happening\'s lasting effect counts while in force and then wears off', () => {
  const w = world();
  addMod(w, 'harvest', 0.15, 10, 'test');
  ok(Math.abs(modOf(w, 'harvest') - 0.15) < 1e-9, `harvest mod: ${modOf(w, 'harvest')}`);
  run(w, 11);
  ok(modOf(w, 'harvest') === 0, 'the mod did not wear off');
});

test('happenings come up on their own over the years, and each is decided', () => {
  const w = world(11);
  run(w, 360 * 4);
  const book = w.happenings ?? [];
  ok(book.length >= 3, `only ${book.length} happenings in four years`);
  ok(book.every((h) => h.chosen || h.outcome), 'a happening left undecided');
});

// ---------- homes: the town holds as many as its homes have room for ----------

const settleNow = (w: WorldState) => {
  while (w.day % 10 !== 3) tick(w);
  tick(w); // the day homes are sorted out
};

test('at the founding everyone has a home with room for them, a child at a parent\'s', () => {
  const w = world();
  ok(w.homes!.length === FIRST_LOTS, `homes at the founding: ${w.homes!.length}`);
  ok(capacity(w) >= townPop(w), `rooms ${capacity(w)} for ${townPop(w)}`);
  ok(!w.homeless, `homeless at the founding: ${w.homeless}`);
  const [a, b] = grown(w).filter((n) => n.spouseId === undefined && n.job !== 'noble');
  wed(w, a, b);
  const child = bornTo(w, a, b, rngOf(w));
  w.npcs.push(child);
  settleNow(w);
  ok(a.home !== undefined && a.home === b.home && child.home === a.home, `the family is split: ${a.home} ${b.home} ${child.home}`);
  ok(JSON.stringify(homeOf(child, w)) === JSON.stringify(homeOf(a, w)), 'the child goes home somewhere else');
});

test('a full town: someone who can pay hires builders, and the new home stands after a while', () => {
  const w = world();
  for (let i = 0; i < 20; i++) traveller(w, rngOf(w));
  ensureMarket(w).stock.timber = 100;
  const rich = grown(w).find((n) => n.job === 'merchant') ?? grown(w)[0];
  rich.gold = 2000;
  const before = capacity(w);
  const rev = w.buildRev ?? 0;
  settleNow(w);
  ok((w.homeless ?? 0) + (w.slum ?? 0) > 0, 'nobody without a home in an overfull town');
  const site = w.homes!.find((h) => h.until !== undefined);
  ok(site, 'no home was started');
  ok((w.buildRev ?? 0) > rev, 'the town was not laid out again for the site');
  ok(rich.gold < 2000 || w.homes!.some((h) => h.ownerId === undefined && h.until), 'nobody paid for it');
  const lot = LOTS[site!.lot];
  ok(!walkable(w, lot.x, lot.y), 'the lot can still be walked through');
  run(w, 70);
  ok(site!.until === undefined, 'the home never stood');
  ok(capacity(w) > before, `rooms did not grow: ${before} -> ${capacity(w)}`);
});

test('once every lot is built on, homes are built up a storey', () => {
  const w = world();
  for (const t of [...TECH_ORDER.slice(0, 6), 'printing' as const]) (w.techs ??= {})[t] = 0; // the age of townhouses
  w.homes = LOTS.map((_, lot) => ({ lot, tier: 1 as const, built: 0 }));
  w.buildRev = (w.buildRev ?? 0) + 1;
  for (let i = 0; i < 120; i++) traveller(w, rngOf(w));
  ensureMarket(w).stock.timber = 100;
  w.treasury = 50_000;
  settleNow(w);
  ok(w.homes!.some((h) => h.tier === 2), 'no home was built up');
});

test('without a roof, households drift away; with rooms to spare, newcomers come', () => {
  const w = world();
  w.homes = w.homes!.slice(0, 8); // half the town's homes gone
  w.buildRev = (w.buildRev ?? 0) + 1;
  ensureMarket(w).stock.timber = 0; // and nothing to build with
  const start = townPop(w);
  run(w, 360);
  ok((w.slum ?? 0) > 0, 'those with no home did not turn to the shanty');
  ok(townPop(w) < start, `the homeless did not leave: ${start} -> ${townPop(w)}`); // slowly: a shack is a roof of sorts
  ok(w.chronicle.some((e) => e.text.includes('จึงทิ้งเมืองไปหาที่อยู่ใหม่')), 'nobody was said to leave for want of a home');
  const full = world(8);
  full.homes!.push(...LOTS.slice(FIRST_LOTS).map((_, i) => ({ lot: FIRST_LOTS + i, tier: 1 as const, built: 0 })));
  full.buildRev = (full.buildRev ?? 0) + 1;
  const before = townPop(full);
  run(full, 360);
  ok(townPop(full) > before + 10, `newcomers did not fill the empty homes: ${before} -> ${townPop(full)}`);
});

test('a home brought down by a disaster takes its rooms with it until it is rebuilt', () => {
  const w = world();
  const before = capacity(w);
  ruinHomes(w, rngOf(w), 2);
  ok(capacity(w) === before - 2 * ROOMS[1], `rooms after two homes fell: ${before} -> ${capacity(w)}`);
});

// ---------- from a camp to a city ----------

test('a new game starts as a pioneers\' camp: huts by the track, a chief\'s hall, no walls, no church', () => {
  const w = foundWorld(5);
  tick(w);
  ok(townPop(w) < 40 && rankOf(w) === 0, `a camp of ${townPop(w)}, rank ${rankOf(w)}`);
  ok(w.homes!.every((h) => h.tier === 0), 'the pioneers live in something better than huts');
  ok(!founded(w, 'church') && !founded(w, 'walls') && !founded(w, 'castle'), 'the camp has a church, walls or a castle');
  ok(walkable(w, WALL.x0, WALL.y0 + 3), 'there is a wall where the town will one day put one');
  const town = world();
  ok(founded(town, 'walls') && !walkable(town, WALL.x0, WALL.y0 + 3), 'a town founded whole has no walls');
  ok(w.npcs.some((n) => n.spouseId !== undefined) && w.npcs.some((n) => n.age < 16), 'no families among the pioneers');
});

test('the town founds a building once it has the people for it and someone pays', () => {
  const w = foundWorld(5);
  tick(w);
  const priest = w.npcs.find((n) => n.alive && n.job === 'priest')!;
  priest.gold = 1000;
  for (let i = 0; i < 10; i++) traveller(w, rngOf(w));
  while (w.day % 30 !== 9) tick(w);
  ok(w.raising?.kind === 'church' || founded(w, 'church') || w.raising, `nothing was started: ${JSON.stringify(w.raising)}`);
  const kind = w.raising!.kind;
  run(w, 200);
  ok(founded(w, kind), `the ${kind} never stood`);
  ok(w.chronicle.some((e) => e.text.includes('สร้างเสร็จแล้ว')), 'the chronicle missed it');
});

test('a camp grows into a town over the years: proper houses, a castle and walls, the crown\'s works', () => {
  const w = foundWorld(3);
  run(w, 365 * 16);
  ok(rankOf(w) >= TOWN_RANK, `still only rank ${rankOf(w)} with ${townPop(w)} people after sixteen years`);
  ok(founded(w, 'castle'), 'no castle in a town');
  ok(w.homes!.filter((h) => h.tier >= 1).length > w.homes!.filter((h) => h.tier === 0).length, 'still mostly huts');
  ok((w.rank ?? 0) >= TOWN_RANK, `the town's rise was never noted: rank ${w.rank}`);
});

test('a camp neither titles nobles nor raises an army, and the crown builds no works there', () => {
  const w = foundWorld(5);
  w.treasury = 50_000;
  run(w, 400);
  ok(rankOf(w) === 0 || w.npcs.every((n) => !n.alive || n.job !== 'noble'), 'a camp has nobles');
  ok(!w.building && !Object.keys(w.works ?? {}).length, 'the crown built works in a camp');
});

// ---------- the shanty and fire ----------

test('with no room in any home, the homeless knock up shacks; they come down once homes are built', () => {
  const w = world();
  for (let i = 0; i < 25; i++) traveller(w, rngOf(w));
  ensureMarket(w).stock.timber = 0; // nothing to build with
  settleNow(w);
  ok((w.shacks?.length ?? 0) > 0 && (w.slum ?? 0) > 0, `no shanty: ${w.shacks?.length} shacks, ${w.slum} in them`);
  const s = w.shacks![0];
  const dweller = w.npcs.find((n) => n.alive && inShack(n))!;
  ok(JSON.stringify(homeOf(dweller, w)) === JSON.stringify(shackDoor(s)) || dweller.home! >= 1000, 'the shack dweller goes home elsewhere');
  ok(shantyCrime(w) > 1, 'the shanty does not breed thieves');
  w.homes!.push(...LOTS.slice(FIRST_LOTS).map((_, i) => ({ lot: FIRST_LOTS + i, tier: 1 as const, built: 0 })));
  w.buildRev = (w.buildRev ?? 0) + 1;
  settleNow(w);
  ok(!w.shacks?.length, `shacks still standing with homes to spare: ${w.shacks?.length}`);
});

test('a fire runs along a row of timber homes; the ruler decides how the town rebuilds', () => {
  const w = world();
  const before = capacity(w);
  const burnt = fire(w, rngOf(w), { x: LOTS[4].x, y: LOTS[4].y });
  ok(burnt >= 1, 'nothing burnt');
  ok(capacity(w) < before, 'the burnt homes still count their rooms');
  ok(w.chronicle.some((e) => e.text.startsWith('ไฟไหม้!')), 'the fire was not told');
  const h = raise(w, 'firecode', rngOf(w));
  ok(h && h.chooserId === w.kingId, 'the king does not decide how to rebuild');
});

test('the shanty comes up as a happening, and the ruler\'s choice is carried out', () => {
  const w = world();
  w.shacks = [0, 1, 2, 3, 4];
  const k = kingOf(w);
  k.traits = ['vengeful'];
  const r = rngOf(w);
  raise(w, 'shanty', r);
  decide(w, r, 'clear');
  ok(!w.shacks.length, 'the shacks were not cleared');
  ok(w.happenings!.at(-1)!.chosen === 'clear', 'the choice was not kept');
});

test('someone sentenced while down a dungeon is fetched back to serve it, not lost in there', () => {
  const w = world();
  const n = grown(w).find((x) => x.job !== 'king' && x.job !== 'judge' && x.questId === undefined)!;
  const d = w.dungeons[0];
  for (let i = 0; i < 20 && !jailed(w, n); i++) {
    n.inside = d.id;
    n.plan = { kind: 'delve', x: d.x, y: d.y, days: 5, target: d.id };
    n.gold = 0; // nothing to bribe the bench with
    commit(w, n, 'theft', rngOf(w), 0, undefined, true);
  }
  ok(jailed(w, n), 'never sentenced');
  ok(n.inside === undefined, 'left inside the dungeon with no plan');
  run(w, 3); // and the town goes on
});

test('a camp is beneath the notice of the demon lord, its neighbours\' armies and the crown\'s colonists', () => {
  const w = foundWorld(5);
  tick(w);
  w.dread = 100;
  w.balance = -80;
  run(w, 40);
  ok(!w.demon, 'the demon lord rose over a camp');
  ok(!w.war, 'a war came to a camp');
  ok(canSend(w) === false, 'the crown would send colonists from a camp');
});

test('a camp\'s bread is priced for its own few mouths, not a town\'s', () => {
  const w = foundWorld(5);
  tick(w);
  ok(target(w, 'grain') < target(world(), 'grain') / 3, `a camp of ${townPop(w)} wants ${target(w, 'grain')} sacks in store`);
});

// ---------- politics: movements ----------

// A town angry about one thing: high taxes, empty purses, sour on the ruler, and all friends of one bold soul.
function angryTown(w: WorldState): Npc[] {
  w.crown!.tax = 'high';
  const folk = grown(w).filter((n) => !['noble', 'soldier'].includes(n.job) && !n.knight && n.inside === undefined && n.questId === undefined).slice(0, 14);
  for (const n of folk) {
    n.loyalty = 15;
    n.gold = 0;
    n.cultist = undefined;
  }
  for (const a of folk) for (const b of folk) if (a.id < b.id) setTie(w, a.id, b.id, 30); // one circle of friends
  folk[0].traits = ['brave'];
  return folk;
}
// Tick up to the movement's monthly meeting, the king kept from lowering the tax meanwhile.
const toMeeting = (w: WorldState) => {
  const taxed = w.crown!.tax === 'high';
  do {
    if (taxed) w.crown!.tax = 'high';
    tick(w);
  } while (w.day % 30 !== 22);
};

test('townsfolk sharing a grievance band together behind the boldest, through their friends', () => {
  const w = world();
  const folk = angryTown(w);
  toMeeting(w);
  ok(w.movement, 'no movement formed');
  ok(w.movement!.cause === 'tax', `formed over ${w.movement!.cause}, not the tax`);
  ok(members(w).length >= 3, `only ${members(w).length} members`);
  ok(folk.filter((n) => n.marcher).length >= 3, 'the angry friends did not join');
  ok(members(w).every((n) => n.job !== 'soldier' && n.job !== 'noble'), 'a soldier or noble joined on their own');
});

test('a ruler who gives in on the tax lowers it and keeps it down for a year', () => {
  const w = world();
  angryTown(w);
  toMeeting(w);
  const k = kingOf(w);
  const said = concede(w, w.movement!, k, rngOf(w));
  ok(said && w.crown!.tax === 'normal', `tax is ${w.crown!.tax} after giving in`);
  w.treasury = 0; // a broke crown would raise it again, but for the promise
  run(w, 60);
  ok(w.crown!.tax !== 'high', 'the tax went back up inside the year');
});

test('soldiers with friends in the crowd refuse to march on it, and go over', () => {
  const w = world();
  const folk = angryTown(w);
  toMeeting(w);
  const mv = w.movement!;
  mv.stage = 2;
  const soldiers = w.npcs.filter((n) => n.alive && n.inside === undefined && (n.job === 'soldier' || n.knight));
  ok(soldiers.length >= 2, 'too few soldiers to test');
  for (const s of soldiers) {
    s.loyalty = 20;
    setTie(w, s.id, folk[1].id, 40);
  }
  // Each soldier's refusal is a roll: try the order a few times over, from the same morning.
  let went = false;
  for (let i = 0; i < 5 && !went; i++) {
    const x = structuredClone(w);
    crackdown(x, x.movement!, kingOf(x), { state: w.rng + i * 977 });
    went = x.movement!.defectors > 0 && x.npcs.some((n) => soldiers.some((s) => s.id === n.id) && n.marcher);
  }
  ok(went, 'no soldier went over');
});

test('a crackdown on a riot jails the leader and makes martyrs who anger the rest', () => {
  const w = world();
  angryTown(w);
  toMeeting(w);
  const mv = w.movement!;
  for (const n of grown(w).filter((x) => x.job !== 'soldier' && !x.knight && x.job !== 'noble').slice(0, 40)) n.marcher = true;
  for (const s of w.npcs.filter((n) => n.job === 'soldier')) s.loyalty = 90;
  mv.stage = 4;
  mv.anger = 50;
  const leader = w.npcs.find((n) => n.id === mv.leaderId)!;
  let held = false;
  for (let i = 0; i < 8 && (!mv.martyrs || !held) && w.movement; i++) {
    mv.stage = 4;
    crackdown(w, mv, kingOf(w), { state: w.rng + i * 977 });
    held ||= jailed(w, leader);
  }
  ok(mv.martyrs > 0, 'nobody fell in a riot put down by soldiers');
  ok(held, 'the leader was never taken');
});

test('a crowd that wins in a town that cannot read sets up a people\'s council, not a new king', () => {
  const w = world();
  angryTown(w);
  toMeeting(w);
  const mv = w.movement!;
  for (const n of grown(w).filter((x) => x.job !== 'noble' && x.job !== 'soldier' && !x.knight)) {
    n.marcher = true;
    n.lettered = false;
  }
  for (const s of w.npcs.filter((n) => n.job === 'soldier' || n.knight)) s.loyalty = 0; // nobody stands for the crown
  const leader = w.npcs.find((n) => n.id === mv.leaderId)!;
  leader.traits = ['kind'];
  leader.morality = 60;
  mv.cause = 'tax';
  delete w.techs?.printing;
  const old = kingOf(w);
  revolution(w, mv, old, leader, rngOf(w));
  ok(w.kingId !== old.id, 'the ruler held on against everyone');
  ok(w.regime === 'republic', `the town became a ${w.regime ?? 'monarchy'}`);
  ok(!w.movement, 'the movement stayed out after winning');
});

test('a camp has no court to plot in, and a ruler never flees a famine', () => {
  const w = foundWorld(5);
  tick(w);
  const k = kingOf(w);
  const lord = grown(w).find((n) => n !== k)!;
  lord.job = 'noble';
  lord.traits = ['greedy'];
  lord.gold = 900;
  for (const n of grown(w)) n.loyalty = 0;
  for (let i = 0; i < 300; i++) {
    k.hunger = 9;
    tick(w);
  }
  ok(!w.chronicle.some((e) => /บุกวังหมายชิง/.test(e.text)), 'a noble stormed a camp\'s hut for its chief\'s seat');
  ok(k.alive || !k.left, 'the ruler walked out of town hungry');
});

test('a republic\'s march on the hall calls an early election instead of a fight', () => {
  const w = world();
  w.regime = 'republic';
  w.republic = { since: 0, elections: 1, nextVote: w.day + 3000 };
  angryTown(w);
  toMeeting(w);
  const mv = w.movement!;
  for (const n of grown(w).filter((x) => x.job !== 'noble' && x.job !== 'soldier' && !x.knight).slice(0, 30)) n.marcher = true;
  mv.anger = 90;
  mv.stage = 1;
  const before = w.republic.elections;
  for (let i = 0; i < 4 && w.republic!.elections === before; i++) {
    if (w.movement) w.movement.stage = 1;
    toMeeting(w);
  }
  ok(w.republic!.elections > before, 'no early election');
  ok(!w.chronicle.some((e) => /บุกวัง หมายโค่น/.test(e.text)), 'a republic\'s crowd stormed the hall');
});

test('a movement out on the street gathers its idle members before the palace, never its workers', () => {
  const w = world();
  angryTown(w);
  toMeeting(w);
  const mv = w.movement!;
  mv.stage = 2;
  mv.rally = w.day + 60;
  const farmers = members(w).filter((n) => n.job === 'farmer');
  const gathered = new Set<number>(); // members who stood before the palace at some point
  let pulled = 0;
  for (let i = 0; i < 45; i++) {
    tick(w);
    for (const n of members(w)) if (n.plan?.kind === 'protest') gathered.add(n.id);
    for (const f of farmers) if (f.plan?.kind === 'protest' && f.plan.days > 6) pulled++;
  }
  ok(gathered.size >= 2, `only ${gathered.size} gathered before the palace`);
  ok(!pulled, 'a protest plan longer than a free spell');
  ok(!w.npcs.some((n) => !n.marcher && n.plan?.kind === 'protest'), 'someone outside the movement joined the crowd');
});

test('the god can harden a crowd\'s resolve or cool its anger, for faith', () => {
  const w = world();
  angryTown(w);
  toMeeting(w);
  const mv = w.movement!;
  mv.anger = 50;
  w.faith = 100;
  applyCommands(w, [{ type: 'movement', act: 'stir' }], rngOf(w));
  ok(mv.anger > 50 && w.faith < 100, `stir: anger ${mv.anger}, faith ${w.faith}`);
  const before = mv.anger;
  applyCommands(w, [{ type: 'movement', act: 'calm' }], rngOf(w));
  ok(mv.anger < before, 'calm did not cool the crowd');
  w.faith = 0;
  applyCommands(w, [{ type: 'movement', act: 'stir' }], rngOf(w));
  ok(mv.anger < before, 'a god without faith still stirred the crowd');
});

// ---------- politics: reigns and succession ----------

test('a long reign wears on the town: the same ruler after twenty years has a sourer people', () => {
  const fresh = world();
  const old = world();
  old.crown!.since = old.day - 365 * 25;
  run(fresh, 120);
  run(old, 120);
  const avg = (w: WorldState) => grown(w).reduce((s, n) => s + (n.loyalty ?? 50), 0) / grown(w).length;
  ok(avg(old) < avg(fresh) - 3, `twenty-five years in, loyalty ${avg(old).toFixed(1)} vs a new reign's ${avg(fresh).toFixed(1)}`);
});

test('a dead king\'s child heir takes the throne with a regent, and is handed it back at sixteen', () => {
  const w = world();
  const k = kingOf(w);
  k.traits = ['kind'];
  const child = grown(w).find((n) => n.job !== 'noble')!;
  child.age = 10;
  child.parentIds = [k.id];
  const lord = grown(w).find((n) => n !== child && n.job === 'noble') ?? grown(w).find((n) => n !== child)!;
  lord.job = 'noble';
  lord.traits = ['loyal'];
  kill(w, k, 'สิ้นพระชนม์');
  tick(w);
  ok(w.kingId === child.id, 'the child was not crowned');
  ok(w.crown!.regentId !== undefined, 'no regent for a child king');
  child.age = 16;
  for (let i = 0; i < 40 && w.crown!.regentId !== undefined; i++) tick(w);
  ok(w.crown!.regentId === undefined && w.kingId === child.id, 'the regency did not end with the king still crowned');
});

test('an ambitious lord may contest a grown heir\'s right: one of them is crowned, the other gone', () => {
  let contested = 0;
  for (let seed = 1; seed <= 12 && !contested; seed++) {
    const w = world(seed);
    const k = kingOf(w);
    const heir = grown(w).find((n) => n.job !== 'noble' && n.job !== 'soldier')!;
    heir.parentIds = [k.id];
    heir.age = 30;
    const rival = grown(w).find((n) => n !== heir && n.job === 'noble') ?? grown(w).find((n) => n !== heir && n.job !== 'soldier')!;
    Object.assign(rival, { job: 'noble', traits: ['greedy'], gold: 900, loyalty: 10 });
    kill(w, k, 'สิ้นพระชนม์');
    tick(w);
    if (!w.chronicle.some((e) => /^ศึกชิงบัลลังก์!/.test(e.text))) continue;
    contested++;
    ok(w.kingId === heir.id || w.kingId === rival.id, 'someone else took the throne');
    const loser = w.kingId === heir.id ? rival : heir;
    ok(!loser.alive, 'the loser of the war of succession is still in town');
  }
  ok(contested, 'no lord ever contested a grown heir');
});

test('an old ruler falls ill, and the illness ends in recovery or death', () => {
  const w = world();
  const k = kingOf(w);
  k.age = 70;
  w.day += (38 - (w.day % 30)) % 30; // the court's day of the month
  for (let i = 0; i < 200 && w.crown!.ailing === undefined; i++) reignDay(w, { state: i * 7919 });
  ok(w.crown!.ailing !== undefined, 'a king of seventy never fell ill');
  for (let i = 0; i < 200 && w.crown!.ailing !== undefined && k.alive; i++) reignDay(w, { state: i * 104729 });
  ok(w.crown!.ailing === undefined || !k.alive, 'the illness never ended');
});

// ---------- politics: each regime's own troubles ----------

const toEventDay = (w: WorldState) => {
  w.day += (46 - (w.day % 30)) % 30 || 30; // the regimes' day of the month
};

test('a junta under pressure promises elections, and when they fall due it keeps or breaks the promise', () => {
  const w = world();
  w.regime = 'junta';
  const k = kingOf(w);
  k.traits = ['kind'];
  for (const n of grown(w)) n.loyalty = 25; // a sour town
  for (let i = 0; i < 40 && w.crown!.promise === undefined; i++) {
    toEventDay(w);
    regimeEventsDay(w, { state: i * 7919 });
  }
  ok(w.crown!.promise !== undefined, 'the general never promised to hand power back');
  w.day = w.crown!.promise! - 1;
  toEventDay(w);
  regimeEventsDay(w, rngOf(w));
  ok(w.regime === 'republic', `a kind general's promise came due and the town is a ${w.regime}`);
});

test('a vengeful general jails the readers who speak against them', () => {
  const w = world();
  w.regime = 'junta';
  const k = kingOf(w);
  k.traits = ['vengeful'];
  w.crown!.promise = w.day + 9999; // already promised, so the month goes to the purge
  for (const n of grown(w).filter((x) => x.job !== 'soldier' && !x.knight).slice(0, 8)) Object.assign(n, { lettered: true, loyalty: 10 });
  for (const s of grown(w).filter((x) => x.job === 'soldier' || x.knight)) s.loyalty = 90; // no colonel stirs
  let jailedNow = 0;
  for (let i = 0; i < 60 && !jailedNow; i++) {
    toEventDay(w);
    regimeEventsDay(w, { state: i * 104729 });
    jailedNow = grown(w).filter((n) => jailed(w, n)).length;
  }
  ok(jailedNow >= 3, `${jailedNow} critics jailed`);
});

test('a losing, grasping republic leader may stuff the ballot boxes and keep the office', () => {
  let rigged = false;
  for (let seed = 1; seed <= 20 && !rigged; seed++) {
    const w = world(seed);
    w.regime = 'republic';
    w.republic = { since: 0, elections: 1, nextVote: w.day + 3000 };
    const k = kingOf(w);
    Object.assign(k, { traits: ['greedy'], morality: -40, age: 40 });
    for (const n of grown(w)) n.loyalty = 5; // everyone wants them out
    w.techs = { ...(w.techs ?? {}), printing: 0 };
    const won = election(w, rngOf(w), 'ทดสอบ');
    rigged = won === k; // only stuffed boxes keep a leader everyone wants gone
  }
  ok(rigged, 'a hated, grasping leader never once kept the office');
});

test('the merchants\' council throws out a chairman a richer member outweighs', () => {
  const w = world();
  w.regime = 'oligarchy';
  const k = kingOf(w);
  k.gold = 100;
  w.crown!.since = w.day - 800;
  const rich = grown(w).find((n) => n.job === 'merchant') ?? grown(w)[0];
  rich.job = 'merchant';
  rich.gold = 2000;
  for (let i = 0; i < 80 && w.kingId === k.id; i++) {
    toEventDay(w);
    regimeEventsDay(w, { state: i * 7919 });
  }
  ok(w.kingId === rich.id && w.regime === 'oligarchy', 'the richer merchant did not take the chair');
});

// ---------- parties, parliaments, the commune ----------

const toPartyDay = (w: WorldState) => {
  w.day += (54 - (w.day % 30)) % 30 || 30; // the parties' day of the month
};
// A republic with its charter written and its house open, a few nobles at court.
function republic(w: WorldState): void {
  w.regime = 'republic';
  w.republic = { since: w.day, elections: 1, nextVote: w.day + 3000 };
  writeCharter(w, 'ทดสอบ');
  w.parliament = { seats: 0, coalition: [], nextVote: w.day + 3000, elections: 0 };
  const nobles = grown(w).filter((n) => n.job === 'noble');
  for (const n of grown(w).filter((x) => x.job === 'farmer').slice(0, Math.max(0, 3 - nobles.length))) n.job = 'noble';
}
// Two parties set up by hand: the poor's and the merchants'.
function twoParties(w: WorldState): { labour: Npc[]; trade: Npc[] } {
  const folk = grown(w).filter((n) => n.inside === undefined && n.questId === undefined);
  const labour = folk.slice(0, Math.ceil(folk.length * 0.7));
  const trade = folk.slice(labour.length);
  for (const n of labour) Object.assign(n, { gold: 0, job: n.job === 'merchant' ? 'farmer' : n.job });
  for (const n of trade) Object.assign(n, { gold: 500, job: 'merchant' });
  w.parties = [
    { id: 9001, name: 'พรรคแรงงาน', ideology: 'labour', leaderId: labour[0].id, founded: 0, treasury: 0, seats: 0, mps: [] },
    { id: 9002, name: 'พรรคการค้าเสรี', ideology: 'trade', leaderId: trade[0].id, founded: 0, treasury: 0, seats: 0, mps: [] },
  ];
  for (const n of labour) n.partyId = 9001;
  for (const n of trade) n.partyId = 9002;
  return { labour, trade };
}

test('a republic grows parties out of its guilds, movements and court, each with its own platform', () => {
  const w = world();
  republic(w);
  for (let i = 0; i < 60 && (w.parties?.length ?? 0) < 3; i++) {
    toPartyDay(w);
    partiesDay(w, { state: i * 7919 + 1 });
  }
  const ps = w.parties ?? [];
  ok(ps.length >= 3, `only ${ps.length} parties formed`);
  ok(new Set(ps.map((p) => p.ideology)).size === ps.length, 'two parties formed for one platform');
  ok(ps.every((p) => w.npcs.some((n) => n.id === p.leaderId && n.partyId === p.id)), 'a party has no leader among its members');
  ok(ps.some((p) => w.npcs.filter((n) => n.alive && n.partyId === p.id).length >= 3), 'no party drew members');
});

test('a general election shares the seats by the vote, and the biggest side forms the government', () => {
  const w = world();
  republic(w);
  const { labour } = twoParties(w);
  const head = general(w, rngOf(w), 'ทดสอบ')!;
  const [lab, tra] = w.parties!;
  const house = w.parliament!;
  ok(house.seats % 2 === 1 && lab.seats + tra.seats === house.seats, `seats don't add up: ${lab.seats}+${tra.seats} of ${house.seats}`);
  ok(lab.seats > tra.seats, `the poor's party (most of the town) won fewer seats: ${lab.seats} vs ${tra.seats}`);
  ok(house.coalition.includes(lab.id), 'the biggest party is not in government');
  ok(head === labour[0] && w.kingId === head.id, 'the labour leader did not become the republic\'s leader');
  ok(council(w).every((n) => lab.mps.includes(n.id) || tra.mps.includes(n.id)), 'the council is not the elected house');
});

test('a party government rules by its platform: never what it swore against, and pays for being forced to', () => {
  const w = world();
  republic(w);
  twoParties(w);
  const head = general(w, rngOf(w), 'ทดสอบ')!;
  ok(rulingIdeology(w) === 'labour', `ruling by ${rulingIdeology(w)}`);
  ok(forbids(w, 'curfew') && !forbids(w, 'subsidy'), 'the labour platform does not forbid a curfew');
  ok(mind(w, head).includes('kind'), 'a labour government does not decide with a kind heart');
  const before = w.npcs.filter((n) => n.alive && n.partyId === 9001).reduce((s, n) => s + (n.loyalty ?? 50), 0);
  grant(w, 'curfew', head, rngOf(w), 'ฝูงชน');
  ok(w.parties![0].broke === w.day, 'the broken promise was not recorded');
  const after = w.npcs.filter((n) => n.alive && n.partyId === 9001).reduce((s, n) => s + (n.loyalty ?? 50), 0);
  ok(after < before, 'the party\'s members did not mind the broken promise');
});

test('the opposition can bring down a minority government with no confidence, calling an early election', () => {
  let fell = false;
  for (let seed = 1; seed <= 8 && !fell; seed++) {
    const w = world(seed);
    republic(w);
    twoParties(w);
    general(w, rngOf(w), 'ทดสอบ');
    const [lab, tra] = w.parties!;
    // The government loses its majority: most of its seats go over to the opposition.
    const moved = lab.mps.splice(0, Math.ceil(w.parliament!.seats / 2));
    tra.mps.push(...moved);
    for (const id of moved) w.npcs.find((n) => n.id === id)!.partyId = tra.id;
    lab.seats = lab.mps.length;
    tra.seats = tra.mps.length;
    const pm = kingOf(w);
    Object.assign(pm, { traits: ['kind'], morality: 50 });
    for (let i = 0; i < 60 && !fell; i++) {
      toPartyDay(w);
      partiesDay(w, { state: seed * 31 + i * 7919 });
      fell = w.republic!.nextVote <= w.day;
    }
  }
  ok(fell, 'a government without a majority was never brought down');
});

test('with no parties a vote nobody wins outright goes to a second round, and the house is still elected', () => {
  let runoff = false;
  for (let seed = 1; seed <= 12; seed++) {
    const w = world(seed);
    republic(w);
    w.parties = [];
    const won = election(w, rngOf(w), 'ทดสอบ');
    const res = w.republic!.last!.results;
    const total = res.reduce((s, r) => s + r.votes, 0);
    ok(won && res[0].id === won.id && res[0].votes * 2 >= total, `the winner holds ${res[0].votes} of ${total} votes`);
    runoff ||= res.length === 2 && w.chronicle.some((e) => /รอบสอง/.test(e.text));
    ok((w.parliament?.independents?.length ?? 0) >= 5, 'no independent house was elected');
  }
  ok(runoff, 'no election ever went to a second round');
});

test('a leader re-elected keeps the street\'s anger and their years in office', () => {
  const w = world();
  republic(w);
  w.parties = [];
  const k = kingOf(w);
  w.crown!.since = w.day - 700;
  w.crown!.unrest = 5;
  for (const n of grown(w)) {
    n.loyalty = 100;
    setTie(w, n.id, k.id, 80);
  }
  const won = election(w, rngOf(w), 'ทดสอบ');
  ok(won === k, 'a beloved leader lost');
  ok(w.crown!.unrest === 5 && w.crown!.since === w.day - 700, `unrest ${w.crown!.unrest}, since ${w.crown!.since}`);
});

test('each regime has its own council: priests, trade-house heads, officers, the Party', () => {
  const w = world();
  w.regime = 'theocracy';
  ok(council(w).length > 0 && council(w).every((n) => n.job === 'priest'), 'the theocracy\'s council is not its priests');
  w.regime = 'junta';
  ok(council(w).every((n) => n.job === 'soldier' || n.knight), 'the junta\'s council is not its officers');
  w.regime = 'oligarchy';
  const head = grown(w).find((n) => n.job === 'farmer')!;
  w.guilds.push({ id: 8001, name: 'สมาคมการค้าทดสอบ', kind: 'merchants', leaderId: head.id, founded: 0, renown: 0, treasury: 100 });
  ok(council(w).includes(head), 'a trade house\'s head does not sit on the merchants\' council');
  w.regime = 'monarchy';
  ok(council(w).every((n) => n.job === 'noble'), 'a plain crown\'s council is not its nobles');
});

test('the workers of a factory town who win their revolution abolish property and set up the Party', () => {
  const w = world();
  angryTown(w);
  toMeeting(w);
  const mv = w.movement!;
  for (const n of grown(w).filter((x) => x.job !== 'noble' && x.job !== 'soldier' && !x.knight)) n.marcher = true;
  for (const s of w.npcs.filter((n) => n.job === 'soldier' || n.knight)) s.loyalty = 0;
  mv.cause = 'wealth';
  (w.works ??= {}).factory = 0;
  const leader = w.npcs.find((n) => n.id === mv.leaderId)!;
  const rich = grown(w).filter((n) => n !== leader).sort((a, b) => b.gold - a.gold)[0];
  rich.gold = 2000;
  const noble = grown(w).find((n) => n.job === 'noble' && n !== leader);
  const treasury = w.treasury;
  revolution(w, mv, kingOf(w), leader, rngOf(w));
  ok(w.regime === 'commune', `the town became a ${w.regime ?? 'monarchy'}`);
  ok(rich.gold < 1000 && w.treasury > treasury, `the rich kept ${rich.gold}`);
  ok(!noble || noble.job === 'farmer', 'a noble kept their estate');
  ok(w.guilds.length === 0 && w.parties?.length === 1 && w.parties[0].leaderId === w.kingId, 'the Party is not the only party, led by the secretary');
  ok(council(w).every((n) => n.partyId === w.parties![0].id), 'the politburo is not the Party');
});

test('under the commune, what piles up past a fair share is levied and the poor are rationed', () => {
  const w = world();
  const sec = kingOf(w);
  proclaimCommune(w, sec, rngOf(w), 'ทดสอบ');
  w.commune!.plan = w.day + 9999;
  const fat = grown(w).find((n) => n !== sec)!;
  const poor = grown(w).find((n) => n !== sec && n !== fat)!;
  fat.gold = 1000;
  fat.loyalty = 90; // not one to flee
  poor.gold = 0;
  w.treasury = 5000;
  w.day += (56 - (w.day % 30)) % 30 || 30;
  communeDay(w, rngOf(w));
  ok(fat.gold < 1000, 'a fortune was left alone');
  ok(poor.gold > 0, 'the poor got no ration');
});

test('a king who grants a parliament keeps the crown; the elected house makes the prime minister', () => {
  const w = world();
  angryTown(w);
  toMeeting(w);
  const k = kingOf(w);
  const mv = w.movement!;
  mv.cause = 'voice';
  w.charter!.councilVeto = true;
  w.charter!.freePress = true;
  const said = concede(w, mv, k, rngOf(w));
  ok(said && w.charter!.parliament, 'the king did not grant a parliament');
  twoParties(w);
  w.parliament!.nextVote = w.day;
  toPartyDay(w);
  partiesDay(w, rngOf(w));
  ok(w.kingId === k.id && k.job === 'king', 'the king lost the crown to the election');
  const pm = governor(w)!;
  ok(pm !== k && pm.id === w.parliament!.pmId, 'no prime minister was chosen');
});

test('the merchants\' council weighs a trade house\'s chest, not only its head\'s purse', () => {
  const w = world();
  w.regime = 'oligarchy';
  const k = kingOf(w);
  k.gold = 200;
  w.crown!.since = w.day - 800;
  const head = grown(w).find((n) => n.job === 'farmer')!;
  head.gold = 50; // poorer than the chairman in their own purse
  w.guilds.push({ id: 8002, name: 'สมาคมการค้าทดสอบ', kind: 'merchants', leaderId: head.id, founded: 0, renown: 0, treasury: 3000 });
  for (let i = 0; i < 80 && w.kingId === k.id; i++) {
    toEventDay(w);
    regimeEventsDay(w, { state: i * 7919 });
  }
  ok(w.kingId === head.id, 'the head of the rich trade house did not take the chair');
});

test('a party does not hoard: a chest past what a campaign needs flows back into the market', () => {
  const w = world();
  republic(w);
  twoParties(w);
  w.parties![1].treasury = 5000;
  const till = ensureMarket(w).till;
  for (let i = 0; i < 12; i++) {
    toPartyDay(w);
    partiesDay(w, { state: i * 7919 + 3 });
  }
  ok(w.parties![1].treasury < 1500, `the chest still holds ${w.parties![1].treasury}`);
  ok(ensureMarket(w).till > till, 'the spending did not reach the market');
});

// ---------- loud and quiet news, affairs of state, sagas, raids ----------

test('routine news is folded away, headlines are marked, and a long run of routine never pushes a headline out first', () => {
  const w = world();
  logLine(w, 'trade', 'พ่อค้าสมชายนำกองคาราวานไปค้าขายที่แคว้นหนึ่ง');
  ok(w.chronicle.at(-1)!.minor && !w.chronicle.at(-1)!.major, 'a caravan setting out should be routine');
  logLine(w, 'politics', 'กษัตริย์สมชายประกาศสงครามกับแคว้นหนึ่ง ทหารเตรียมเดินทัพ');
  const war = w.chronicle.at(-1)!;
  ok(war.major && !war.minor, 'a declaration of war should be a headline');
  logLine(w, 'politics', 'ผู้ปกครองออกพระราชโองการใหม่');
  ok(!w.chronicle.at(-1)!.minor && !w.chronicle.at(-1)!.major, 'ordinary news should be neither');
  for (let i = 0; i < 700; i++) logLine(w, 'trade', `พ่อค้าคนที่ ${i} นำกองคาราวานไปค้าขายที่แคว้นหนึ่ง`);
  ok(w.chronicle.length <= 500, 'the chronicle outgrew its limit');
  ok(w.chronicle.includes(war), 'routine caravans pushed the war out of the chronicle');
});

// Every affair of state, each in a scene where it can come up: it must be raised, offer at
// least two options, and every option must play out and say what came of it.
function stage(w: WorldState): void {
  republic(w);
  const { labour, trade } = twoParties(w);
  w.parliament!.coalition = [9001];
  w.parties![0].seats = 5;
  w.parties![0].mps = labour.slice(0, 5).map((n) => n.id);
  w.parties![0].treasury = 500;
  w.republic!.nextVote = w.day + 2000;
  w.parliament!.nextVote = w.day + 2000;
  for (const n of grown(w)) n.loyalty = 20; // a sullen town
  w.treasury = 5000;
  w.guilds.push({ id: 8101, name: 'บ้านการค้ามั่งมี', kind: 'merchants', leaderId: trade[0].id, founded: 0, renown: 0, treasury: 2000 });
  w.guilds.push({ id: 8102, name: 'บ้านการค้าใกล้เจ๊ง', kind: 'merchants', leaderId: trade[1].id, founded: 0, renown: 0, treasury: 0, stock: { spice: 5 } });
  trade[1].guildId = 8102;
  trade[2].guildId = 8102;
  w.day = Math.max(w.day, 400);
  const c = churchOf(w);
  c.purse = 1000;
  const priests = grown(w).filter((n) => n.job === 'priest');
  if (!priests.length) grown(w).find((n) => n.job === 'farmer')!.job = 'priest';
  c.headId = grown(w).find((n) => n.job === 'priest')!.id;
  const flock = grown(w).filter((n) => n.job === 'farmer').slice(0, 5);
  for (const n of flock) n.creed = 'sect';
  religionOf(w).sect = { name: 'นิกายทดสอบ', founded: 0, leaderId: flock[0].id, cause: 'reform' };
  const hero = grown(w).find((n) => n.job === 'swordsman' || n.job === 'mage') ?? grown(w).find((n) => n.job === 'farmer')!;
  Object.assign(hero, { job: 'swordsman', rank: 4, renown: 200, guildId: undefined, questId: undefined, inside: undefined });
  for (const n of grown(w).filter((x) => x.job === 'farmer').slice(5, 8)) n.job = 'soldier';
  // A royal child of age, and the realms as friends and foes.
  const k = w.npcs.find((n) => n.id === w.kingId) ?? grown(w)[0];
  w.kingId = k.id;
  k.job = 'king';
  const child = grown(w).find((n) => n !== k && n.spouseId === undefined && n.job === 'farmer' && n.questId === undefined)!;
  Object.assign(child, { parentIds: [k.id], age: 20, inside: undefined });
  const [friend, foe] = w.realms!;
  Object.assign(friend, { relation: 30, war: false, wed: undefined, pact: undefined, fallen: false });
  Object.assign(foe, { relation: -40, war: false, pact: undefined, fallen: false, truceUntil: 0 });
  // One of our lands with a sullen village and its headman.
  const r = (w.regions ?? []).find((x) => x.owner === 'us' && !x.seat) ?? w.regions![0];
  r.owner = 'us';
  const chief = { ...structuredClone(grown(w)[1]), id: w.nextId++, regionId: r.id, partyId: undefined, guildId: undefined };
  (w.villagers ??= []).push(chief);
  r.village = { chiefId: chief.id, loyalty: 30, purse: 80 };
}
test('every affair of state comes up in its scene, offers a real choice, and every choice plays out', () => {
  const kinds = ['scandal', 'dissolution', 'templeland', 'chapel', 'monopoly', 'failing', 'match', 'exile', 'warpact', 'homerule', 'bandits', 'knighthood'] as const;
  const base = world(11);
  stage(base);
  ok(rankOf(base) >= TOWN_RANK, 'the test town should be a town');
  for (const k of kinds) {
    const probe = structuredClone(base);
    const h = raise(probe, k, rngOf(probe));
    ok(h, `${k} did not come up in its scene`);
    ok(h!.options.length >= 2, `${k} offers only ${h!.options.length} option`);
    for (const o of h!.options) {
      const w = structuredClone(base);
      raise(w, k, rngOf(w));
      decide(w, rngOf(w), o.key);
      const done = w.happenings!.at(-1)!;
      ok(done.chosen === o.key && done.outcome, `${k}/${o.key} did not play out`);
    }
  }
});

test('the opposition can force an early election; a scandal denied costs the governing party at the polls', () => {
  const w = world(11);
  stage(w);
  raise(w, 'dissolution', rngOf(w));
  decide(w, rngOf(w), 'dissolve');
  ok(w.republic!.nextVote <= w.day, 'dissolving the house did not call an election');
  const x = world(11);
  stage(x);
  raise(x, 'scandal', rngOf(x));
  decide(x, rngOf(x), 'deny');
  ok(x.parties!.find((p) => p.id === 9001)!.broke === x.day, 'the denied scandal left no mark on the party');
});

test('a gold rush opened to all fills purses and brings strangers, then runs dry', () => {
  const w = world(12);
  w.day = Math.max(w.day, 400);
  ok(beginSaga(w, 'goldrush', rngOf(w)), 'the gold rush did not begin');
  ok(w.happening?.kind === 'goldrush', 'nobody was asked what to do with the gold');
  decide(w, rngOf(w), 'open');
  ok(modOf(w, 'arrivals') > 0, 'word of gold drew nobody');
  const purse = w.npcs.reduce((s, n) => s + (n.alive ? n.gold : 0), 0);
  for (let i = 0; i < 9 && w.saga; i++) {
    w.day += 30 - (w.day % 30) + 14;
    sagasDay(w, { state: 1000 + i });
  }
  ok(!w.saga, 'the gold rush never ended');
  ok(w.npcs.reduce((s, n) => s + (n.alive ? n.gold : 0), 0) > purse, 'nobody found any gold');
  ok(w.chronicle.some((e) => e.major && e.text.includes('สายแร่ทอง')), 'the end of the rush was not a headline');
});

test('a stolen royal child is held away from town until paid for, and comes home', () => {
  const w = world(13);
  w.day = Math.max(w.day, 400);
  const k = w.npcs.find((n) => n.id === w.kingId)!;
  const child = grown(w).find((n) => n !== k && n.questId === undefined)!;
  Object.assign(child, { parentIds: [k.id], age: 12 });
  w.treasury = 5000;
  ok(beginSaga(w, 'ransom', rngOf(w)), 'nobody was taken');
  const taken = w.npcs.find((n) => n.id === w.saga!.ctx)!;
  ok(taken.inside === -1, 'the child is still walking about town');
  run(w, 3);
  ok(taken.inside === -1, 'the child wandered home from the bandit camp on their own');
  decide(w, rngOf(w), 'pay');
  w.day += 30 - (w.day % 30) + 14;
  sagasDay(w, { state: 5 });
  ok(taken.alive && taken.inside === undefined, 'the child did not come home after the ransom');
  ok(!w.saga, 'the saga did not end');
});

test('a town sealed against the plague sends out no caravans, and the plague takes fewer', () => {
  const deaths = (choice: string) => {
    let dead = 0;
    for (let s = 0; s < 6; s++) {
      const w = world(20 + s);
      w.day = Math.max(w.day, 400);
      beginSaga(w, 'pestilence', rngOf(w));
      decide(w, rngOf(w), choice);
      const before = w.npcs.filter((n) => n.alive).length;
      for (let i = 0; i < 5 && w.saga; i++) {
        w.day += 30 - (w.day % 30) + 14;
        sagasDay(w, { state: 77 + i * 13 + s });
      }
      dead += before - w.npcs.filter((n) => n.alive).length;
      if (choice === 'close') ok(!w.saga && !w.sealed, 'the gates stayed shut after the plague');
    }
    return dead;
  };
  const closed = deaths('close');
  const open = deaths('open');
  ok(closed < open, `sealing the town did not save lives (${closed} dead sealed, ${open} open)`);
  const w = world(30);
  w.sealed = w.day + 100;
  const m = ensureMarket(w);
  m.stock.wool = 9999;
  m.caravan = undefined;
  run(w, 20);
  ok(!m.caravan || m.caravan.grain > 0, 'a caravan went out of a sealed town with goods to sell');
});

test('a neighbour whose tribute we refused comes for it: a raid on a village, a war on a town', () => {
  let raided = 0;
  const base = world(40);
  base.day = 30 * 40 + 20;
  base.war = undefined;
  for (let s = 0; s < 300 && !raided; s++) {
    const w = structuredClone(base);
    const r = w.realms![0];
    Object.assign(r, { spurned: w.day - 10, pact: undefined, fallen: false, truceUntil: 0, raided: undefined });
    warDay(w, { state: s * 31 + 7 });
    if (w.war || w.chronicle.some((e) => e.text.includes('กองโจรม้า'))) raided++;
  }
  ok(raided, 'no spurned neighbour ever came for its tribute');
  const v = world(41);
  v.founded = 0;
  v.day = 30 * 40 + 20;
  const r = v.realms![0];
  Object.assign(r, { spurned: v.day - 10, pact: undefined, fallen: false, truceUntil: 0 });
  raidRealm(v, r, { state: 9 });
  ok(v.chronicle.some((e) => e.major && e.text.includes('กองโจรม้า')), 'the raid was not a headline');
  ok(!v.war, 'a raid should not start a war');
});

// ---------- the steam age: mills, hands, engines on the farms ----------

const steamTown = (seed = 7) => {
  const w = world(seed);
  for (const t of TECH_ORDER) (w.techs ??= {})[t] = 0;
  return w;
};
const toMillDay = (w: WorldState) => {
  w.day += ((18 - (w.day % 30)) + 30) % 30 || 30;
};

test('before steam the market knows nothing of the steam age, and nobody builds a mill', () => {
  const w = world();
  ok(!goodsOf(w).includes('coal'), 'coal is on the shelves before steam');
  w.guilds.push({ id: 8201, name: 'บ้านการค้ารวย', kind: 'merchants', leaderId: grown(w)[0].id, founded: 0, renown: 0, treasury: 9000 });
  for (let i = 0; i < 3; i++) {
    toMillDay(w);
    industryDay(w, { state: i + 1 });
  }
  ok(!(w.mills ?? []).length, 'a mill went up before anyone knew steam');
});

test('a rich trade house builds a mill once steam is known; it hires spare hands, never the farms the town needs, and turns inputs into goods', () => {
  const w = steamTown();
  const m = ensureMarket(w);
  m.stock.meat = 200;
  m.stock.coal = 100;
  const head = grown(w).find((n) => n.job === 'merchant')!;
  w.guilds.push({ id: 8202, name: 'บริษัททดสอบ', kind: 'merchants', leaderId: head.id, founded: 0, renown: 0, treasury: 9000 });
  const mill = foundMill(w, 8202, 'cannery')!;
  ok(mill && mill.owner === 8202, 'the house built no mill');
  const farmers = () => grown(w).filter((n) => n.job === 'farmer').length;
  const before = farmers();
  const lean = before <= grown(w).length * 0.3 + 1; // a town with no farmers to spare
  for (let i = 0; i < 6; i++) {
    toMillDay(w);
    industryDay(w, { state: 50 + i });
  }
  const hands = handsOf(w, mill);
  ok(hands.length >= 2, `only ${hands.length} hands at the mill`);
  ok(!lean || farmers() >= before, `the mills took farmers from a town with none to spare (${before} → ${farmers()})`);
  ok((mill.made ?? 0) > 0 && m.stock.tins > 0, 'the cannery made no tins');
  ok(hands.every((n) => n.gold >= 10), 'the hands were not paid');
});

test('a mill that cannot pay its hands sends them back to the fields', () => {
  const w = steamTown();
  const head = grown(w).find((n) => n.job === 'merchant')!;
  w.guilds.push({ id: 8203, name: 'บริษัทจน', kind: 'merchants', leaderId: head.id, founded: 0, renown: 0, treasury: 0 });
  const mill = foundMill(w, 8203, 'textile')!;
  mill.ready = w.day;
  const hand = grown(w).find((n) => n.job === 'herder')!;
  Object.assign(hand, { job: 'worker', millId: mill.id });
  toMillDay(w);
  industryDay(w, { state: 9 });
  ok(hand.job === 'farmer' && hand.millId === undefined, 'the unpaid hand stayed at the mill');
});

test('engines go out to the farms and a mechanised field yields more grain', () => {
  const w = steamTown();
  const m = ensureMarket(w);
  m.stock.engine = 40;
  for (const n of grown(w).filter((x) => x.job === 'farmer')) n.gold = 5000;
  toMillDay(w);
  industryDay(w, { state: 3 });
  ok((w.mech ?? 0) >= 0.99, `the farms are ${Math.round((w.mech ?? 0) * 100)}% mechanised`);
  const yieldOn = (mech: number) => {
    const x = structuredClone(w);
    x.mech = mech;
    const farmer = x.npcs.find((n) => n.alive && n.job === 'farmer')!;
    const before = ensureMarket(x).stock.grain;
    for (let i = 0; i < 200; i++) harvest(x, farmer, { state: 1000 + i });
    return ensureMarket(x).stock.grain - before;
  };
  ok(yieldOn(1) > yieldOn(0) * 1.15, 'engines did not raise the harvest');
});

test('in a dearth the town eats from the cannery tins', () => {
  const w = steamTown();
  const m = ensureMarket(w);
  m.stock.grain = 0;
  m.stock.meat = 0;
  m.stock.tins = 500;
  for (const n of w.npcs) n.gold = 100;
  run(w, 12);
  ok(m.stock.tins < 500, 'nobody ate the tins');
  ok(!w.npcs.some((n) => n.alive && (n.hunger ?? 0) >= 2), 'people went hungry beside a store of tins');
});

test('our mines out on the lands send coal (hills) and mana crystal (peaks) to the mills', () => {
  const w = steamTown();
  const m = ensureMarket(w);
  const hills = (w.regions ?? []).find((r) => r.kind === 'hills' || r.kind === 'peaks')!;
  ok(hills, 'no hills or peaks on the map');
  hills.owner = 'us';
  hills.dev = { mine: 2 };
  const chief = { ...structuredClone(grown(w)[1]), id: w.nextId++, regionId: hills.id, job: 'farmer' as const };
  (w.villagers ??= []).push(chief, { ...chief, id: w.nextId++ }, { ...chief, id: w.nextId++ });
  hills.village = { chiefId: chief.id, loyalty: 80, purse: 0 };
  const coal = m.stock.coal;
  const crystal = m.stock.crystal;
  toMillDay(w);
  industryDay(w, { state: 4 });
  ok(m.stock.coal > coal || m.stock.crystal > crystal, 'the mine sent nothing');
});

// ---------- the steam age's troubles: unions, the factory acts, smog, machine-breakers ----------

// A steam town with a running mill full of hands, owned by a rich house.
function millTown(seed = 7) {
  const w = steamTown(seed);
  const m = ensureMarket(w);
  Object.assign(m.stock, { meat: 400, coal: 300, wool: 200, ore: 200, steel: 50, crystal: 30 });
  const head = grown(w).find((n) => n.job === 'merchant')!;
  w.guilds.push({ id: 8301, name: 'บริษัทไอน้ำ', kind: 'merchants', leaderId: head.id, founded: 0, renown: 0, treasury: 20000 });
  const mills = [foundMill(w, 8301, 'cannery')!, foundMill(w, 8301, 'textile')!];
  for (const mill of mills) mill.ready = w.day;
  const hands = grown(w).filter((n) => n.job !== 'king' && n.job !== 'merchant' && n.questId === undefined && n.partyId === undefined).slice(0, 8);
  hands.forEach((n, i) => Object.assign(n, { job: 'worker', millId: mills[i % 2].id, guildId: undefined }));
  return { w, mills, hands, head };
}

test('enough mill hands form a union, and the coal smoke makes the town sicker', () => {
  const { w } = millTown();
  toMillDay(w);
  industryDay(w, { state: 5 });
  ok(w.union, 'eight hands formed no union');
  ok((w.smog ?? 0) > 0 && modOf(w, 'sickness') > 0, `no smog (${w.smog}) or no sickness from it`);
});

test('a strike won raises every hand wage; the factory acts raise it again for a shorter shift', () => {
  const { w } = millTown();
  toMillDay(w);
  industryDay(w, { state: 5 });
  const base = wageOf(w);
  w.market!.level = 1.5;
  ok(raise(w, 'millstrike', rngOf(w)), 'the strike did not come up');
  decide(w, rngOf(w), 'raise');
  ok(wageOf(w) > base, 'the strike won no raise');
  const raised = wageOf(w);
  ok(raise(w, 'factoryact', rngOf(w)), 'the factory act was not put forward');
  decide(w, rngOf(w), 'pass');
  ok(w.charter!.labour === 'protected' && wageOf(w) > raised, 'the factory act changed nothing');
});

test('every steam-age trouble comes up in its scene and every choice plays out', () => {
  const { w } = millTown();
  toMillDay(w);
  industryDay(w, { state: 5 });
  w.market!.level = 1.5;
  const hill = (w.regions ?? []).find((r) => r.kind === 'hills' || r.kind === 'peaks')!;
  hill.owner = 'us';
  hill.dev = { mine: 2 };
  const v = { ...structuredClone(grown(w)[1]), id: w.nextId++, regionId: hill.id, job: 'farmer' as const };
  (w.villagers ??= []).push(v, { ...v, id: w.nextId++ }, { ...v, id: w.nextId++ });
  hill.village = { chiefId: v.id, loyalty: 60, purse: 0 };
  w.treasury = 5000;
  const noble = grown(w).find((n) => n.job === 'noble') ?? grown(w).find((n) => n.job === 'farmer')!;
  Object.assign(noble, { job: 'noble', gold: 5 });
  for (let i = 0; i < 6; i++) grown(w).filter((n) => n.job === 'farmer')[i] && (grown(w).filter((n) => n.job === 'farmer')[i].job = 'soldier');
  for (const k of ['millfire', 'millstrike', 'factoryact', 'minecollapse', 'estatesale'] as const) {
    const probe = structuredClone(w);
    const h = raise(probe, k, rngOf(probe));
    ok(h, `${k} did not come up in its scene`);
    for (const o of h!.options) {
      const x = structuredClone(w);
      raise(x, k, rngOf(x));
      decide(x, rngOf(x), o.key);
      ok(x.happenings!.at(-1)!.outcome, `${k}/${o.key} did not play out`);
    }
  }
});

test('when engines take the farmhands work, the machine-breakers smash them until the crown answers', () => {
  const w = steamTown();
  w.day = Math.max(w.day, 400);
  w.machinery = 20;
  w.mech = 1;
  ok(beginSaga(w, 'luddites', rngOf(w)), 'the machine-breakers never rose');
  ok(w.machinery < 20, 'the first night broke nothing');
  decide(w, rngOf(w), 'ignore');
  const after = w.machinery;
  w.day += 30 - (w.day % 30) + 14;
  sagasDay(w, { state: 3 });
  ok(w.machinery < after, 'left alone they stopped breaking machines');
  const x = steamTown();
  x.day = Math.max(x.day, 400);
  Object.assign(x, { machinery: 20, mech: 1 });
  beginSaga(x, 'luddites', rngOf(x));
  decide(x, rngOf(x), 'hang');
  x.day += 30 - (x.day % 30) + 14;
  sagasDay(x, { state: 3 });
  ok(!x.saga, 'hanging the ringleaders did not end it');
});

// ---------- the steam age on the map ----------

test('mills stand on their plots with a reachable gate, the station brings the railway, steam lights the lamps, the boulevard takes the walls', () => {
  const w = steamTown();
  const before = townLayout(w);
  ok(before.props.some((p) => p.key === 'lamp'), 'no gas lamps in a town that knows steam');
  ok(before.props.some((p) => p.key === 'town-wall'), 'the walls are missing before the boulevard');
  for (let i = 0; i < 6; i++) (w.mills ??= []).push({ id: 9900 + i, kind: 'textile', name: 'x', plot: i, owner: 'crown', since: 0, ready: 0 });
  w.works = { ...(w.works ?? {}), station: 0, boulevard: 0 };
  const after = townLayout(w);
  ok(after !== before, 'the layout did not change when mills, the railway and the boulevard came');
  for (let i = 0; i < MILL_PLOTS.length; i++) {
    const p = MILL_PLOTS[i];
    ok(after.cost[p.y * MAP_W + p.x] === 0, `mill plot ${i} is not built on`);
    const gate = millDoor(i);
    ok(after.cost[gate.y * MAP_W + gate.x] > 0, `nobody can reach the gate of mill ${i}`);
  }
  ok(after.props.filter((p) => p.key === 'rail').length >= 15, 'the railway is missing');
  ok(!after.props.some((p) => p.key === 'town-wall' || p.key === 'gate-tower'), 'the walls still stand behind the boulevard');
});
