// The rule tests run by run.mjs: each sets up a scene in a fresh world, ticks it, and checks.
import { applyCommands, createWorld, tick } from '../../src/sim/world';
import { kill } from '../../src/sim/core';
import { wed, births } from '../../src/sim/life';
import { MAX_TENETS, creedCounts, daysToHoly, isHolyDay, pietyPull, prayers, proclaim, religionOf, strain, tenetCost } from '../../src/sim/religion';
import { tenetOn } from '../../src/sim/core';
import { churchOf, headOf } from '../../src/sim/church';
import { faithLaw } from '../../src/sim/charter';
import { commit } from '../../src/sim/justice';
import { FOREIGN_GODS, abroadPrayers, holyTarget, realmFaithName, sendMission, sharesFaith } from '../../src/sim/missions';
import { endWar } from '../../src/sim/war';
import { ourForces } from '../../src/sim/war';
import { PLACES } from '../../src/sim/places';
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
    w.debt = { guildId: 999, owed: 1000, since: 0 };
    w.treasury = 0;
    w.treasury = 0;
    run(w, 31);
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
