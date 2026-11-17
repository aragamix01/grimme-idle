// The rule tests run by run.mjs: each sets up a scene in a fresh world, ticks it, and checks.
import { applyCommands, createWorld, foundWorld, tick, traveller } from '../../src/sim/world';
import { TOWN_RANK, founded, rankOf } from '../../src/sim/growth';
import { kill } from '../../src/sim/core';
import { wed, births, bornTo, homeOf } from '../../src/sim/life';
import { FIRST_HOMES, ROOMS, capacity, inShack, shackDoor, townPop } from '../../src/sim/housing';
import { fire, shantyCrime } from '../../src/sim/slums';
import { MAP_W, SHACK_BASE, footprint, lotXY, townLayout } from '../../src/sim/town';
import { WATER, terrainOf } from '../../src/sim/terrain';
import { claimField, dungeonSpot, homeSpot, landDay, plotDoor, siteOf, treesOn } from '../../src/sim/landplan';
import { walkable } from '../../src/sim/nav';
import { TECH_ORDER } from '../../src/sim/research';
import { ruinHomes } from '../../src/sim/disasters';
import { MAX_TENETS, creedCounts, daysToHoly, isHolyDay, pietyPull, prayers, proclaim, religionOf, strain, tenetCost } from '../../src/sim/religion';
import { tenetOn } from '../../src/sim/core';
import { churchOf, headOf } from '../../src/sim/church';
import { faithLaw } from '../../src/sim/charter';
import { commit, jailed } from '../../src/sim/justice';
import { FOREIGN_GODS, abroadPrayers, holyTarget, realmFaithName, sendMission, sharesFaith } from '../../src/sim/missions';
import { endWar } from '../../src/sim/war';
import { ourForces } from '../../src/sim/war';
import { places } from '../../src/sim/places';
import { decide, raise, whisperCost } from '../../src/sim/happenings';
import { addMod, modOf } from '../../src/sim/core';
import { payrollReserve } from '../../src/sim/society';
import { TARGET, ensureMarket, target } from '../../src/sim/market';
import { canSend } from '../../src/sim/villages';
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
  priest.creed = 'god';
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
      Object.assign(n, { x: places(w).church.x, y: places(w).church.y + 1 });
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
// More homes, standing at once, wherever the town would put them.
function addHomes(w: WorldState, n: number): void {
  for (let i = 0; i < n; i++) {
    const lot = homeSpot(w, [], false);
    if (lot < 0) return;
    w.homes!.push({ lot, tier: 1, built: 0 });
    w.buildRev = (w.buildRev ?? 0) + 1;
  }
}
const fromSite = (w: WorldState, x: number, y: number) => Math.hypot(x - siteOf(w).x, y - siteOf(w).y);

test('at the founding everyone has a home with room for them, a child at a parent\'s', () => {
  const w = world();
  ok(w.homes!.length === FIRST_HOMES, `homes at the founding: ${w.homes!.length}`);
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
  const lot = lotXY(site!.lot);
  ok(!walkable(w, lot.x, lot.y), 'the lot can still be walked through');
  run(w, 120); // longer if the trees had to come down first
  ok(site!.until === undefined, 'the home never stood');
  ok(capacity(w) > before, `rooms did not grow: ${before} -> ${capacity(w)}`);
});

test('once the town has spread past an easy walk from the square, homes are built up a storey', () => {
  const w = world();
  for (const t of [...TECH_ORDER.slice(0, 6), 'printing' as const]) (w.techs ??= {})[t] = 0; // the age of townhouses
  for (let i = 0; i < 80; i++) {
    const next = homeSpot(w, [], false);
    if (next < 0 || fromSite(w, lotXY(next).x, lotXY(next).y) > 14) break;
    addHomes(w, 1);
  }
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
  addHomes(full, 11);
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

test('a new game starts as a pioneers\' camp: huts round a clearing, a chief\'s hall, no walls, no church', () => {
  const w = foundWorld(5);
  tick(w);
  ok(townPop(w) < 40 && rankOf(w) === 0, `a camp of ${townPop(w)}, rank ${rankOf(w)}`);
  ok(w.homes!.every((h) => h.tier === 0), 'the pioneers live in something better than huts');
  ok(!founded(w, 'church') && !founded(w, 'walls') && !founded(w, 'castle'), 'the camp has a church, walls or a castle');
  const wall = (x: WorldState) => townLayout(x).props.some((p) => p.key === 'town-wall' || p.key === 'gate-tower');
  ok(!wall(w) && !w.ring, 'a camp has walls');
  ok(w.homes!.every((h) => fromSite(w, lotXY(h.lot).x, lotXY(h.lot).y) < 10), 'the huts are not round the clearing');
  ok((w.parcels ?? []).some((p) => p.kind === 'field' && p.ready <= w.day), 'the pioneers have no field cleared');
  const town = world();
  ok(founded(town, 'walls') && wall(town) && townLayout(town).gates.length > 0, 'a town founded whole has no walls, or no gate in them');
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
  // Rich as the crown is, nobody is titled while the town is still a camp (a village may).
  const nobles = () => w.npcs.filter((n) => n.alive && n.job === 'noble').length;
  for (let d = 0; d < 400; d++) {
    const before = nobles();
    tick(w);
    ok(rankOf(w) > 0 || nobles() <= before, `a noble was titled over a camp on day ${w.day}`);
  }
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
  ok(JSON.stringify(homeOf(dweller, w)) === JSON.stringify(shackDoor(s)) || dweller.home! >= SHACK_BASE, 'the shack dweller goes home elsewhere');
  ok(shantyCrime(w) > 1, 'the shanty does not breed thieves');
  addHomes(w, 11);
  settleNow(w);
  ok(!w.shacks?.length, `shacks still standing with homes to spare: ${w.shacks?.length}`);
});

test('a fire runs along a row of timber homes; the ruler decides how the town rebuilds', () => {
  const w = world();
  const before = capacity(w);
  const burnt = fire(w, rngOf(w), lotXY(w.homes![4].lot));
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

// ---------- the land: wild country, and who builds where ----------

test('every world is cut from its own wild country, the same each time for a seed', () => {
  const a = terrainOf(101);
  const b = terrainOf(202);
  ok(terrainOf(101) === a && createWorld(101).seed === 101, 'the country is not kept for its seed');
  let same = 0;
  for (let i = 0; i < a.cover.length; i++) if (a.cover[i] === b.cover[i]) same++;
  ok(same < a.cover.length * 0.8, `two seeds give nearly the same country: ${same}/${a.cover.length}`);
  ok(a.site.x !== b.site.x || a.site.y !== b.site.y, 'the town is always on the same spot');
  for (const t of [a, b]) {
    ok(t.wet[t.site.y * MAP_W + t.site.x] <= 14, `the square is far from any water: ${t.wet[t.site.y * MAP_W + t.site.x]}`);
    ok(t.cover[t.site.y * MAP_W + t.site.x] !== WATER, 'the square is in the water');
  }
});

test('every door, field and dungeon can be walked to from the road in', () => {
  for (const w of [createWorld(3), createWorld(8), foundWorld(4), foundWorld(9)]) {
    run(w, 400);
    const cost = townLayout(w).cost;
    const open = (x: number, y: number) => cost[y * MAP_W + x] > 0;
    for (const [k, p] of Object.entries(w.plots ?? {})) {
      if (!p) continue;
      const d = plotDoor(w, k)!;
      ok(open(d.x, d.y), `the ${k}'s door (${d.x},${d.y}) cannot be reached in world ${w.seed}`);
      ok(!open(p.x, p.y) && footprint(k).w >= 2, `the ${k} can be walked through`);
    }
    for (const h of w.homes ?? []) ok(open(lotXY(h.lot).x + 1, lotXY(h.lot).y + 2), `a home's door cannot be reached in world ${w.seed}`);
    for (const p of w.parcels ?? []) {
      let any = false;
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) any ||= open(x, y);
      ok(any, `a ${p.kind} at ${p.x},${p.y} cannot be reached in world ${w.seed}`);
    }
    for (const d of w.dungeons) ok(open(d.x + 1, d.y + 2), `the dungeon at ${d.x},${d.y} cannot be reached in world ${w.seed}`);
  }
});

test('a family builds near its kin; the well-off near the castle', () => {
  const w = world();
  // The parent living furthest out, so their side of town is not the side everyone builds on anyway.
  const housed = grown(w).filter((n) => n.home !== undefined && n.home < SHACK_BASE);
  const parent = housed.sort((a, b) => fromSite(w, lotXY(b.home!).x, lotXY(b.home!).y) - fromSite(w, lotXY(a.home!).x, lotXY(a.home!).y))[0];
  const child = grown(w).find((n) => n !== parent && n.spouseId !== parent.id)!;
  child.parentIds = [parent.id];
  child.job = 'builder'; // no workshop of their own to live by
  const at = lotXY(parent.home!);
  const near = lotXY(homeSpot(w, [child], false));
  const castle = plotDoor(w, 'castle')!;
  const rich = lotXY(homeSpot(w, [], true));
  const plain = lotXY(homeSpot(w, [], false));
  ok(Math.hypot(near.x - at.x, near.y - at.y) < Math.hypot(plain.x - at.x, plain.y - at.y) || Math.hypot(near.x - at.x, near.y - at.y) < 8, `the new home is ${Math.hypot(near.x - at.x, near.y - at.y).toFixed(1)} tiles from the parents'`);
  ok(Math.hypot(rich.x - castle.x, rich.y - castle.y) <= Math.hypot(plain.x - castle.x, plain.y - castle.y), `the well-off build ${Math.hypot(rich.x - castle.x, rich.y - castle.y).toFixed(1)} tiles from the castle, further than anyone`);
});

test('farmers short of land clear a new field; woods cost time and bring in timber', () => {
  const w = world();
  const fields = () => (w.parcels ?? []).filter((p) => p.kind === 'field').length;
  const before = fields();
  for (let i = 0; i < 12; i++) grown(w).filter((n) => n.job !== 'farmer' && n.job !== 'king' && !n.questId)[0].job = 'farmer';
  while (w.day % 30 !== 21) tick(w);
  landDay(w);
  ok(fields() > before, `no field was claimed: ${before} -> ${fields()}`);
  const timber = ensureMarket(w).stock.timber;
  const p = claimField(w)!;
  const trees = treesOn(w, p.x, p.y, p.w, p.h);
  ok(p.ready >= w.day + 8 + trees * 3, 'a new field is ready at once');
  ok(ensureMarket(w).stock.timber === timber + trees, 'the felled trees did not go to market');
});

test('dungeons lie out in the woods, away from the town', () => {
  const w = world();
  const s = siteOf(w);
  for (const d of w.dungeons) ok(Math.hypot(d.x - s.x, (d.y - s.y) * 1.2) >= 15, `a dungeon at ${d.x},${d.y} is on the town's doorstep`);
  const spot = dungeonSpot(w, rngOf(w));
  ok(spot && Math.hypot(spot.x - s.x, spot.y - s.y) >= 12, 'no room for another dungeon out in the woods');
});

test('the walls go round the town, with a gate wherever a road runs out', () => {
  const w = world();
  const r = w.ring!;
  const s = siteOf(w);
  const castle = w.plots!.castle!;
  ok(r.x0 < s.x && s.x < r.x1 && r.y0 < s.y && s.y < r.y1, 'the square is outside the walls');
  ok(r.x0 < castle.x && castle.x < r.x1 && r.y0 < castle.y && castle.y < r.y1, 'the castle is outside the walls');
  const lay = townLayout(w);
  for (const g of lay.gates) ok(lay.ground[g.y * MAP_W + g.x] === 'road' && walkable(w, g.x, g.y), `a gate at ${g.x},${g.y} is not on a road`);
});
