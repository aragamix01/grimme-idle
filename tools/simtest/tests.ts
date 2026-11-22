// The rule tests run by run.mjs: each sets up a scene in a fresh world, ticks it, and checks.
import { applyCommands, createWorld, foundWorld, tick, traveller } from '../../src/sim/world';
import { TOWN_RANK, founded, rankOf } from '../../src/sim/growth';
import { kill } from '../../src/sim/core';
import { wed, births, bornTo, homeOf } from '../../src/sim/life';
import { FIRST_HOMES, ROOMS, capacity, inShack, shackDoor, townPop } from '../../src/sim/housing';
import { fire, shantyCrime } from '../../src/sim/slums';
import { MAP_W, SHACK_BASE, footprint, lotXY, millDoor, townLayout } from '../../src/sim/town';
import { WATER, terrainOf } from '../../src/sim/terrain';
import { millSite, placeBuilding } from '../../src/sim/landplan';
import { RING_REF, claimField, drawRing, dungeonSpot, enclosed as enclosedTown, entryOf, fieldYield, homeSpot, landDay, planStyle, plotDoor, ringLength, siteOf, trampled, treesOn } from '../../src/sim/landplan';
import { WEAR_PATH, trod } from '../../src/sim/paths';
import { REGROW_DAYS, darkWoods, randomWoods, wildfireAt, wildsOf } from '../../src/sim/wilds';
import { IN_WALLS, MAP_H, ringMask } from '../../src/sim/town';
import { TREE, homeKind, type HomeKind } from '../../src/sim/terrain';
import { highStreet, ringFor } from '../../src/sim/landplan';
import { gameCap } from '../../src/sim/livestock';
import { miracle, miracleBlocked } from '../../src/sim/divine';
import { walkable } from '../../src/sim/nav';
import { TECH_ORDER } from '../../src/sim/research';
import { found as foundMill, handsOf, industryDay, wageOf } from '../../src/sim/industry';
import { crownWorks } from '../../src/sim/works';
import { realmsDay } from '../../src/sim/realms';
import { ageOf, jobName } from '../../src/sim/ages';
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
import { places } from '../../src/sim/places';
import { ZONES, drawPlan, offPlan, zoneAt, zoneCells, zoningDay } from '../../src/sim/zoning';
import { districtsDay, isSuburb, suburbFeel } from '../../src/sim/districts';
import { foundHomes, newHomeLot } from '../../src/sim/housing';
import { CORE_HOMES, districtSpot, heartOf, quarterOf } from '../../src/sim/landplan';
import { decide, raise, whisperCost } from '../../src/sim/happenings';
import { addMod, modOf } from '../../src/sim/core';
import { payrollReserve } from '../../src/sim/society';
import { CALLING_LEVEL, MAX_DEPTH, depthOf, floorDanger, floorSpoils, healed, mapFloor, partyEdge } from '../../src/sim/callings';
import { slayBoss } from '../../src/sim/dungeons';
import { guildEdge, guildHallsDay, nursed, outdo, tierOf } from '../../src/sim/guildhalls';
import type { Guild } from '../../src/sim/types';
import { cropOf, cropYield, sheepOf, soilOf } from '../../src/sim/farms';
import { SPOILS, craftsDay, drinkPotion, sellSpoils } from '../../src/sim/crafts';
import { smith } from '../../src/sim/society';
import { plagueStrike } from '../../src/sim/worldevents';
import { buyGear } from '../../src/sim/market';
import { TARGET, basePrice, considerTrade, ensureMarket, levelOf, priceRatio, target } from '../../src/sim/market';
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
import { amenitiesDay, amenityJoy, cleaner } from '../../src/sim/amenities';
import { parkSpot } from '../../src/sim/landplan';
import { OPEN_PLOTS } from '../../src/sim/town';

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
  // Two towns each way, so one town's luck does not decide it.
  const towns = (doubting: boolean) =>
    [3, 8].map((seed) => {
      const w = world(seed);
      if (doubting)
        for (const n of w.npcs) {
          n.lettered = true;
          if (n.job === 'priest') n.job = 'farmer';
        }
      else {
        (w.works ??= {}).cathedral = 0;
        for (const n of grown(w).slice(0, 8)) n.job = 'priest';
      }
      run(w, 365 * 3);
      return creedCounts(w);
    });
  const sum = (cs: ReturnType<typeof creedCounts>[]) => ({ god: cs.reduce((s, c) => s + c.god, 0), all: cs.reduce((s, c) => s + c.god + c.spirits + c.none, 0), piety: cs.reduce((s, c) => s + c.piety, 0) / cs.length });
  const d = sum(towns(true));
  const f = sum(towns(false));
  ok(d.piety < f.piety, `piety: doubters ${d.piety}, faithful ${f.piety}`);
  ok(d.god / d.all < f.god / f.all, `the doubters kept as many believers: ${JSON.stringify(d)} vs ${JSON.stringify(f)}`);
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
    // It stays a reading town: the newcomers and the children grown up learn their letters too.
    for (const n of grown(w)) n.lettered = true;
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
  // The shanty may be cleared again within the year (the ruler's call), so look for it all along.
  let slum = 0;
  for (let d = 0; d < 360; d++) {
    tick(w);
    slum = Math.max(slum, w.slum ?? 0);
  }
  ok(slum > 0, 'those with no home did not turn to the shanty');
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
      if (OPEN_PLOTS.has(k)) ok(open(p.x + 1, p.y + 1), `the ${k} cannot be walked over`);
      else ok(!open(p.x, p.y) && footprint(k).w >= 2, `the ${k} can be walked through`);
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

// ---------- paths, fences, palisades, the rulers' plan, the wild country ----------

test('a way walked often is trodden into a footpath within a month, and grows back when left', () => {
  const w = world();
  const lay = townLayout(w);
  const s = siteOf(w);
  let tile = -1;
  for (let r = 4; r < 20 && tile < 0; r++)
    for (let dx = -r; dx <= r && tile < 0; dx++) {
      const i = (s.y + r) * MAP_W + s.x + dx;
      if (lay.ground[i] === 'grass' && lay.cost[i] > 0) tile = i;
    }
  ok(tile >= 0, 'no open grass near the square');
  const x = tile % MAP_W;
  const y = Math.floor(tile / MAP_W);
  while (w.day % 30 !== 25) tick(w);
  for (let k = 0; k < WEAR_PATH * 3; k++) trod(w, x, y);
  tick(w); // the paths are looked at
  ok(w.trails?.includes(tile), 'the trodden tile did not become a path');
  const g = townLayout(w).ground[tile];
  ok(g === 'trail' || g === 'road', `the path is drawn as ${g}`);
  ok(townLayout(w).cost[tile] < 4, 'a path is no quicker than grass');
  // Left to itself, a town treads its own paths.
  const v = world(11);
  run(v, 65);
  ok((v.trails?.length ?? 0) > 0, 'two months of walking trod no paths at all');
});

test('a field beside a pasture is trampled until its farmers fence it, with timber off the shelves', () => {
  const w = world();
  const pasture = w.parcels!.find((p) => p.kind === 'pasture')!;
  const f = { kind: 'field' as const, x: pasture.x + pasture.w, y: pasture.y, w: 4, h: 3, ready: 0 };
  // Only this field is beside the flocks, so it is the one fenced.
  w.parcels = w.parcels!.filter((p) => p.kind !== 'field' || !trampled(w, p));
  w.parcels.push(f);
  ok(trampled(w, f), 'a field next to the flocks is not trampled');
  const m = ensureMarket(w);
  m.stock.timber = 20;
  while (w.day % 30 !== 20) tick(w);
  m.stock.timber = 20;
  tick(w); // land day
  ok(f.fenced && !trampled(w, f), 'the field was not fenced');
  ok(m.stock.timber <= 16, 'the fence took no timber');
});

test('a village raises a palisade, paid by the length of the line; the stone walls come later', () => {
  const w = foundWorld(5);
  ok(!founded(w, 'palisade'), 'a camp starts with a palisade');
  ok(!enclosedTown(w), 'a camp has a line round it');
  const small = ringLength({ x0: 10, y0: 10, x1: 20, y1: 18 }) / RING_REF;
  const big = ringLength({ x0: 10, y0: 10, x1: 40, y1: 38 }) / RING_REF;
  ok(big > small * 2, 'a longer line costs no more');
  (w.founded ??= {}).palisade = w.day;
  drawRing(w);
  const lay = townLayout(w);
  ok(lay.props.some((p) => p.key === 'palisade') && !lay.props.some((p) => p.key === 'gate-tower'), 'the palisade is not drawn as logs');
  ok(enclosedTown(w), 'the palisade does not count as the town line');
  for (const g of lay.gates) ok(walkable(w, g.x, g.y), 'a way through the palisade is blocked');
});

test("the rulers' plan: a republic builds in squared rows, a kingdom in rings round its castle", () => {
  const rows = (style: 'grid' | 'radial') => {
    const w = world(9);
    w.regime = style === 'grid' ? 'republic' : 'monarchy';
    ok(planStyle(w) === style, `the plan is not ${style}`);
    const s = siteOf(w);
    let lined = 0;
    for (let k = 0; k < 8; k++) {
      const lot = homeSpot(w, [], false);
      if (lot < 0) break;
      w.homes!.push({ lot, tier: 1, built: w.day });
      w.buildRev = (w.buildRev ?? 0) + 1;
      const { x, y } = lotXY(lot);
      if ((((x - s.x) % 4) + 4) % 4 === 0 && (((y + 2 - s.y) % 4) + 4) % 4 === 0) lined++;
    }
    return lined;
  };
  const grid = rows('grid');
  const radial = rows('radial');
  ok(grid >= 5 && grid > radial, `a republic lines up ${grid} of 8 homes, a kingdom ${radial}`);
  ok(planStyle(foundWorld(3)) === 'organic', 'a camp follows a plan');
});

test('a summer wildfire burns the woods to ash, the deer go, and the woods grow back in time', () => {
  const w = world();
  const r = rngOf(w);
  const capBefore = gameCap(w);
  const start = randomWoods(w, r)!;
  const burnt = wildfireAt(w, r, start);
  ok(burnt.length > 0, 'nothing burnt');
  const lay = townLayout(w);
  ok(lay.ground[start] === 'ash', `the burnt woods are ${lay.ground[start]}, not ash`);
  ok(!lay.props.some((p) => p.key === 'tree' && p.y * MAP_W + p.x === start), 'a tree still stands where it burnt');
  ok(gameCap(w) <= capBefore, 'the woods hold as many deer after the fire');
  w.day += REGROW_DAYS;
  while (w.day % 30 !== 16) w.day++;
  tick(w);
  ok(!w.wild?.burnt?.length, 'the woods did not grow back');
});

test('the god raises woods, opens a spring by the driest field, and strikes the woods with lightning', () => {
  const w = world();
  const r = rngOf(w);
  w.faith = 1000;
  const trees = () => townLayout(w).props.filter((p) => p.key === 'tree').length;
  const t0 = trees();
  ok(miracle(w, 'grove', r), 'the grove was not raised');
  ok(trees() > t0, 'no new trees');
  if (!miracleBlocked(w, 'spring')) {
    const yield0 = fieldYield(w);
    ok(miracle(w, 'spring', r), 'no spring opened');
    ok(w.wild!.springs!.length === 1 && wildsOf(w).cover[w.wild!.springs![0]] === WATER, 'the spring is not water');
    w.day++;
    ok(fieldYield(w) >= yield0, 'the fields are no better for the spring');
  }
  const timber = ensureMarket(w).stock.timber;
  const t1 = trees();
  ok(miracle(w, 'lightning', r), 'no lightning');
  ok(trees() < t1 && ensureMarket(w).stock.timber >= timber, 'the lightning cleared nothing');
  const e = entryOf(w);
  ok(townLayout(w).cost[e.y * MAP_W + e.x] > 0, 'the road in is cut off');
});

test('land matters come up: a noble encloses the commons, a field is fought over in court', () => {
  const w = world();
  const r = rngOf(w);
  if (!grown(w).some((n) => n.job === 'noble')) grown(w).find((n) => n.job === 'merchant')!.job = 'noble';
  ok(raise(w, 'enclosure', r), 'the enclosure did not come up');
  decide(w, r, 'enclose');
  ok(w.parcels!.some((p) => p.kind === 'pasture' && p.ownerId !== undefined), 'the commons were not enclosed');
  // A landless farmer takes a field to court.
  const owners = new Set(w.parcels!.map((p) => p.ownerId));
  ok(grown(w).some((n) => n.job === 'farmer' && !owners.has(n.id)), 'every farmer has a field');
  const h = raise(w, 'landclaim', r);
  ok(h, 'no land claim came up');
  const claimant = h!.ctx!;
  decide(w, r, 'tiller');
  ok(w.parcels!.some((p) => p.kind === 'field' && p.ownerId === claimant), 'the field did not go to the one who tills it');
});

test('the crown paves the roads inside the walls, and they walk quicker', () => {
  const w = world();
  const lay0 = townLayout(w);
  const roads = lay0.ground.filter((g) => g === 'road').length;
  (w.works ??= {}).paving = w.day;
  w.buildRev = (w.buildRev ?? 0) + 1;
  const lay = townLayout(w);
  const paved = lay.ground.filter((g) => g === 'paved').length;
  ok(paved > 0 && paved < roads, `paved ${paved} of ${roads} roads`);
  const i = lay.ground.indexOf('paved');
  ok(lay.cost[i] < lay0.cost[i], 'paving is no quicker');
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
  const since = (old.crown!.since = old.day - 365 * 25);
  // Day by day, until the tired reign falls (a coup or a rising is the strongest sign of all).
  let fell = false;
  for (let d = 0; d < 120 && !fell; d++) {
    tick(fresh);
    tick(old);
    fell = old.crown!.since !== since;
  }
  const avg = (w: WorldState) => grown(w).reduce((s, n) => s + (n.loyalty ?? 50), 0) / grown(w).length;
  ok(fell || avg(old) < avg(fresh) - 3, `twenty-five years in, loyalty ${avg(old).toFixed(1)} vs a new reign's ${avg(fresh).toFixed(1)} (since ${old.crown!.since}, day ${old.day}, regime ${old.regime}/${fresh.regime}, kings ${old.kingId}/${fresh.kingId})`);
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
  ok(placeBuilding(w, 'station'), 'nowhere for the station');
  for (let i = 0; i < 6; i++) {
    const plot = millSite(w);
    ok(plot >= 0, `no ground for mill ${i}`);
    (w.mills ??= []).push({ id: 9900 + i, kind: 'textile', name: 'x', plot, owner: 'crown', since: 0, ready: 0 });
    w.buildRev = (w.buildRev ?? 0) + 1;
  }
  w.works = { ...(w.works ?? {}), station: 0, boulevard: 0 };
  w.buildRev = (w.buildRev ?? 0) + 1;
  const after = townLayout(w);
  ok(after !== before, 'the layout did not change when mills, the railway and the boulevard came');
  for (const m of w.mills!) {
    const p = lotXY(m.plot);
    ok(after.cost[p.y * MAP_W + p.x] === 0, `the mill at ${p.x},${p.y} is not built on`);
    const gate = millDoor(m.plot);
    ok(after.cost[gate.y * MAP_W + gate.x] > 0, `nobody can reach the gate of the mill at ${p.x},${p.y}`);
  }
  ok(after.props.filter((p) => p.key === 'rail').length >= 10, 'the railway is missing');
  ok(!after.props.some((p) => p.key === 'town-wall' || p.key === 'gate-tower'), 'the walls still stand behind the boulevard');
});

test('a broke swordsman fed by the crown for two months takes up the plough; one who buys his own bread does not', () => {
  const w = world();
  const m = ensureMarket(w);
  const [a, b] = grown(w).filter((n) => n.job === 'swordsman' && n.questId === undefined);
  ok(a && b, 'no two idle swordsmen');
  w.treasury = 5000;
  b.gold = 500;
  for (let d = 0; d < 30; d++) {
    a.gold = 0;
    tick(w);
  }
  ok((a.doled ?? 0) >= 2, `a broke swordsman was fed ${a.doled ?? 0} times by the crown in a month`);
  ok(b.doled === undefined, 'one who buys his own bread is counted as on alms');
  // Two months on alms, grain at its usual price: off to the fields.
  a.doled = 6;
  a.questId = undefined;
  a.job = 'swordsman'; // whatever the month made of him (a builder's hire, say)
  m.price.grain = Math.ceil(basePrice('grain') * levelOf(w) * 1.2);
  ok(priceRatio(w, 'grain') >= 0.8, `grain at ${priceRatio(w, 'grain')} of its price`);
  const rng = rngOf(w); // one stream, so each roll is a new one
  for (let k = 0; k < 400 && a.job === 'swordsman'; k++) considerTrade(w, a, rng);
  ok(a.job === 'farmer' && a.doled === undefined, `a swordsman two months on alms is still a ${a.job}`);
  // Not when the fields already glut the market.
  const c = grown(w).find((n) => n.job === 'mage' && n.questId === undefined)!;
  c.doled = 20;
  m.price.grain = 1;
  for (let k = 0; k < 400; k++) considerTrade(w, c, rng);
  ok(c.job === 'mage', 'with grain glutting the market, a mage on alms went to farm anyway');
});

// ---------- the home country, dark woods, the high street, the town line ----------

test("the home land's kind shapes the country: woods thicker, a shore with the sea along one edge", () => {
  const bySeed = (k: HomeKind) => {
    for (let s = 1; s < 400; s++) if (homeKind(s) === k) return s;
    throw new Error(`no seed gives ${k}`);
  };
  const trees = (seed: number) => terrainOf(seed).cover.filter((c) => c === TREE).length;
  const woods = bySeed('woods');
  const plain = bySeed('plain');
  ok(trees(woods) > trees(plain) * 1.3, `woods ${trees(woods)} trees, plain ${trees(plain)}`);
  const shore = terrainOf(bySeed('shore'));
  const edges = [0, MAP_W - 1].map((x) => [...Array(MAP_H).keys()].filter((y) => shore.cover[y * MAP_W + x] === WATER).length);
  const rows = [0, MAP_H - 1].map((y) => [...Array(MAP_W).keys()].filter((x) => shore.cover[y * MAP_W + x] === WATER).length);
  ok(Math.max(...edges.map((n) => n / MAP_H), ...rows.map((n) => n / MAP_W)) > 0.9, 'a shore has no sea along any edge');
  ok(shore.cover[shore.site.y * MAP_W + shore.site.x] !== WATER, 'the square is in the sea');
  const w = createWorld(bySeed('hills'));
  ok(w.regions![0].kind === 'hills', `the home region is ${w.regions![0].kind}, not the country's kind`);
});

test('thick woods stir the monsters; cleared woods are safer', () => {
  const w = world();
  const before = darkWoods(w);
  wildfireAt(w, rngOf(w), randomWoods(w, rngOf(w))!);
  for (let k = 0; k < 6; k++) {
    const r = { state: w.rng + k * 977 };
    const at = randomWoods(w, r);
    if (at !== undefined) wildfireAt(w, r, at);
  }
  ok(darkWoods(w) < before, `the woods are as dark after the fires: ${before} -> ${darkWoods(w)}`);
});

test('the crown cuts a high street from the square to the road in; the homes in the way come down, paid for', () => {
  const w = world();
  const { tiles } = highStreet(w);
  // Two homes squarely in the way.
  const free = tiles.filter((i) => !(w.homes ?? []).some((h) => h.lot === i));
  const lots = [free[Math.floor(free.length / 2)], free[Math.floor(free.length / 2) + 4]];
  const folk = grown(w).filter((n) => n.job !== 'king').slice(0, 2);
  lots.forEach((lot, k) => {
    w.homes!.push({ lot, tier: 1, built: 0 });
    folk[k].home = lot;
  });
  w.buildRev = (w.buildRev ?? 0) + 1;
  w.treasury = 2000;
  ok(highStreet(w).homes.length >= 2, 'the homes are not in the street\'s way');
  const r = rngOf(w);
  ok(raise(w, 'roadthrough', r), 'the high street did not come up');
  const gold = folk.map((n) => n.gold);
  decide(w, r, 'clear');
  ok(!w.homes!.some((h) => lots.includes(h.lot)), 'the homes still stand');
  ok(folk.every((n) => !lots.includes(n.home!)), 'the evicted still live in the rubble');
  ok(folk.some((n, k) => n.gold > gold[k]), 'nobody was paid for their home');
  const lay = townLayout(w);
  ok(tiles.filter((i) => lay.ground[i] === 'road' || lay.ground[i] === 'paved').length >= tiles.length * 0.7, 'the high street is not a road');
});

test('the town line follows the town: inside it every core home, and less ground than its box', () => {
  const w = world(5);
  const r = ringFor(w);
  ok(r.rows && r.rows.length === (r.y1 - r.y0 + 1) * 2, 'the line has no rows');
  w.ring = r;
  const m = ringMask(r);
  const s = siteOf(w);
  for (const h of w.homes ?? []) {
    const { x, y } = lotXY(h.lot);
    if (Math.hypot(x - s.x, (y - s.y) * 1.2) > 16) continue;
    ok(m[y * MAP_W + x] === IN_WALLS, `a home at ${x},${y} by the square is left outside the walls`);
  }
  const inside = m.filter((v) => v !== 0).length;
  const box = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  ok(inside <= box, `the line takes in ${inside} tiles of a ${box}-tile box`);
  ok(ringLength(r) > 0, 'a line with no wall');
});

// ---------- the dungeons' spoils, herbs and potions ----------

test('each kind of dungeon leaves its own spoils; hunters bring herbs; mages brew potions from gel and herbs', () => {
  const w = world();
  const m = ensureMarket(w);
  const r = rngOf(w);
  const party = grown(w).filter((n) => n.job === 'swordsman').slice(0, 2);
  const hides = m.stock.hide;
  const gold = party.reduce((s, n) => s + n.gold, 0);
  sellSpoils(w, party, 'den', 2, r);
  ok(m.stock.hide > hides && party.reduce((s, n) => s + n.gold, 0) > gold, 'a den gave no hides, or paid nothing for them');
  ok(SPOILS.crypt === 'bone' && SPOILS.cave === 'gel' && SPOILS.fort === 'core', 'the spoils do not follow the dungeons');
  // Herbs from the woods, and potions brewed from them.
  m.stock.herb = 0;
  m.stock.gel = 20;
  m.stock.potion = 0;
  for (const n of grown(w).filter((x) => x.job === 'mage')) n.gold = 500;
  if (!grown(w).some((n) => n.job === 'hunter')) grown(w).find((n) => n.job === 'merchant')!.job = 'hunter';
  for (let d = 0; d < 120; d++) {
    craftsDay(w, r);
    if (m.stock.herb > 0) m.stock.herb = Math.max(m.stock.herb, 1);
  }
  ok(m.stock.potion > 0 && m.stock.gel < 20, `no potions brewed: ${m.stock.potion} potions, ${m.stock.gel} gel left`);
});

test('the smith forges hides and bones into gear; a potion carried down saves a life; the sick are dosed in a plague', () => {
  const w = world();
  const m = ensureMarket(w);
  const r = rngOf(w);
  const smithy = grown(w).find((n) => n.job === 'blacksmith')!;
  Object.assign(m.stock, { loot: 0, ore: 0, hide: 6, bone: 6 });
  const gear = m.stock.gear;
  for (let d = 0; d < 30; d++) smith(w, smithy, r);
  ok(m.stock.gear > gear && m.stock.hide + m.stock.bone < 12, 'the smith made nothing of the monster parts');
  const hero = grown(w).find((n) => n.job === 'swordsman')!;
  hero.potions = 1;
  ok(drinkPotion(hero) && !hero.potions && !drinkPotion(hero), 'a potion did not save, or saved twice');
  // Buying one on the way to the dungeon.
  m.stock.potion = 5;
  hero.gold = 500;
  buyGear(w, hero);
  ok(hero.potions === 1, 'an adventurer with gold to spare bought no potion');
  // A plague with the shelves full of potions: some are dosed back to health.
  m.stock.potion = 60;
  w.treasury = 5000;
  plagueStrike(w, r, 3, 'โรคระบาดทดสอบ');
  ok(m.stock.potion < 60, 'nobody was dosed from the shelves');
});

// ---------- callings, parties, what the dungeons fear, the floors below ----------

test('seasoned adventurers take up a calling by their nature; a well-made party and the feared calling fight better', () => {
  const w = world();
  const [a, b] = grown(w).filter((n) => n.job === 'swordsman');
  const mage = grown(w).find((n) => n.job === 'mage')!;
  Object.assign(a, { level: CALLING_LEVEL, traits: ['brave'], calling: undefined });
  Object.assign(b, { level: CALLING_LEVEL, traits: ['greedy'], calling: undefined });
  Object.assign(mage, { level: CALLING_LEVEL, traits: ['kind'], calling: undefined });
  while (w.day % 30 !== 18) tick(w);
  tick(w);
  ok(a.calling === 'knight' && b.calling === 'ranger' && mage.calling === 'cleric', `callings: ${a.calling}, ${b.calling}, ${mage.calling}`);
  const plain = grown(w).filter((n) => n.job === 'swordsman' && !n.calling).slice(0, 3);
  ok(partyEdge([a, b, mage]) > partyEdge(plain), 'a guard, a striker and a healer fight no better than three of a kind');
  ok(partyEdge([a, b, mage], 'crypt') > partyEdge([a, b, mage], 'cave'), 'the dead do not fear the cleric');
  ok(healed([mage]) < healed([a]), 'a healer spares the party nothing');
});

test('each delve that comes back maps a floor; deeper floors give more and bite harder; the boss falling closes them', () => {
  const w = world();
  const d = w.dungeons[0];
  const party = grown(w).filter((n) => n.job === 'swordsman').slice(0, 2);
  ok(depthOf(d) === 0 && floorSpoils(d) === 1, 'a dungeon starts mapped');
  for (let k = 0; k < 8; k++) mapFloor(w, d, party);
  ok(depthOf(d) === MAX_DEPTH, `mapped to ${depthOf(d)} floors`);
  ok(floorSpoils(d) > 1 && floorDanger(d) > 1, 'the deep floors are no richer or worse');
  d.boss = d.boss ?? { name: 'x', hp: 1, maxHp: 1, relic: 'y', generation: 1 };
  slayBoss(w, d, party);
  ok(depthOf(d) === 0, 'the deep ways stayed open after the boss fell');
});

// ---------- crops, soil, pests, the flock, what the country gives ----------

test('while bread is cheap a third of the fields turn to cash crops; when it is dear they go back to grain', () => {
  const w = world();
  const m = ensureMarket(w);
  const fields = () => (w.parcels ?? []).filter((p) => p.kind === 'field');
  for (const p of fields()) p.ownerId ??= grown(w).find((n) => n.job === 'farmer')!.id;
  // Bread cheap, wine dear.
  m.stock.grain = target(w, 'grain') * 3;
  m.price.grain = 1;
  m.price.wine = 40;
  while (w.day % 365 !== 4) w.day++;
  tick(w);
  const cash = fields().filter((p) => cropOf(p) !== 'grain' && cropOf(p) !== 'fallow');
  ok(cash.length > 0 && cash.length <= Math.ceil(fields().length / 3), `${cash.length} of ${fields().length} fields turned to cash crops`);
  ok(cash.some((p) => cropOf(p) === 'vines'), 'wine was dearest, yet no vines were planted');
  // A vine farmer's day brings in wine.
  const vintner = w.npcs.find((n) => n.id === cash[0].ownerId)!;
  ok(cropYield(w, vintner, 4).good === 'wine', 'a vineyard yields no wine');
  // Bread dear: back to grain next spring.
  m.stock.grain = 1; // the stores all but empty: bread dear whatever the shop asked yesterday
  m.price.grain = 20;
  w.day += 365;
  while (w.day % 365 !== 4) w.day--;
  tick(w);
  ok(fields().every((p) => cropOf(p) === 'grain' || cropOf(p) === 'fallow'), 'cash crops stayed while bread was dear');
});

test('the soil tires under the same crop, mends with a change or a fallow year, and a worn field is rested', () => {
  const w = world();
  const f = (w.parcels ?? []).find((p) => p.kind === 'field')!;
  f.crop = 'grain';
  f.last = 'grain';
  f.soil = 1;
  while (w.day % 365 !== 299) w.day++;
  tick(w);
  ok(soilOf(f) < 1, `the soil did not tire: ${soilOf(f)}`);
  f.soil = 0.6;
  // Plenty of fields to spare: the worn one rests.
  for (const n of grown(w).filter((x) => x.job === 'farmer').slice(3)) n.job = 'merchant';
  while (w.day % 365 !== 4) w.day++;
  tick(w);
  ok(cropOf(f) === 'fallow', `a worn-out field was sown with ${cropOf(f)}`);
  const before = soilOf(f);
  while (w.day % 365 !== 299) w.day++;
  tick(w);
  ok(soilOf(f) > before, 'a fallow year did not mend the soil');
});

test('the herders lean to sheep when wool pays; a shore town fishes; a pest halves a field', () => {
  const w = world();
  const m = ensureMarket(w);
  m.price.wool = 40;
  m.price.meat = 1;
  const before = sheepOf(w);
  while (w.day % 30 !== 23) w.day++;
  tick(w);
  ok(sheepOf(w) > before, `the flock did not lean to sheep: ${before} -> ${sheepOf(w)}`);
  const f = (w.parcels ?? []).find((p) => p.kind === 'field')!;
  const owner = grown(w).find((n) => n.job === 'farmer')!;
  f.ownerId = owner.id;
  f.crop = 'grain';
  f.soil = 1;
  const clean = cropYield(w, owner, 4).n;
  f.pest = w.day + 30;
  ok(cropYield(w, owner, 4).n < clean, 'a pest took nothing');
});

// ---------- the adventurers' guilds as houses ----------

test("a guild builds halls out of its coffers, rises in standing, lures a rival's renowned, and outdoes rivals at a boss", () => {
  const w = world();
  const ws = (k: string) => w.npcs.filter((n) => n.alive && n.age >= 16 && n.job === k && n.questId === undefined);
  const make = (id: number, leader: Npc, renown: number) => {
    const g: Guild = { id, name: `กิลด์${id}`, kind: 'adventurers', leaderId: leader.id, founded: 0, renown, treasury: 5000 };
    w.guilds.push(g);
    leader.guildId = id;
    return g;
  };
  w.guilds = w.guilds.filter((g) => g.kind !== 'adventurers');
  const [l1, l2, star] = ws('swordsman');
  const top = make(9001, l1, 130);
  const low = make(9002, l2, 10);
  Object.assign(star, { guildId: low.id, rank: 3 });
  setTie(w, star.id, l2.id, -20);
  ok(tierOf(top) === 2 && tierOf(low) === 0, `tiers ${tierOf(top)} and ${tierOf(low)}`);
  // Halls go up; and with a few tries, the rival's star is lured over.
  const r = rngOf(w);
  for (let k = 0; k < 12 && star.guildId !== top.id; k++) {
    w.day += 30 - (w.day % 30) + 21;
    guildHallsDay(w, r);
  }
  ok(top.halls?.includes('infirmary') && top.halls.includes('armoury'), `halls: ${top.halls}`);
  ok(star.guildId === top.id, 'the renowned member was never lured');
  ok(guildEdge(w, [l1]) > guildEdge(w, [l2]), 'a silver guild with an armoury fights no better');
  ok(nursed(w, [l1]) < 1, 'the infirmary spares nobody');
  const before = low.renown;
  outdo(w, [l1], 'ราชาสไลม์');
  ok(low.renown < before, 'the rival lost no face');
  ok(w.chronicle.some((e) => e.text.includes('ชิงปราบ') && e.major), 'outdoing the rivals is not a headline');
});

// ---------- the town's public places ----------

test('the crown lays out a park where the town has outgrown its green; nothing is built on it, and it can be walked across', () => {
  const w = world();
  w.treasury = 5000;
  ok(townPop(w) >= 60, `only ${townPop(w)} people`);
  while (w.day % 30 !== 16) w.day++;
  amenitiesDay(w);
  ok(w.parks?.length === 1, `parks: ${w.parks}`);
  ok(w.chronicle.some((e) => e.text.includes('สวน')), 'no word of the park');
  const lot = w.parks![0];
  const { x, y } = lotXY(lot);
  const lay = townLayout(w);
  ok(lay.cost[(y + 1) * MAP_W + x + 1] > 0, 'the park cannot be walked across');
  // A rich family's new home leans toward the park; and no home is put on it.
  for (let k = 0; k < 6; k++) {
    const spot = homeSpot(w, [grown(w)[k]], true);
    const h = lotXY(spot);
    ok(!(h.x + 1 >= x && h.x <= x + 2 && h.y + 1 >= y && h.y <= y + 2), 'a home was put on the park');
  }
  ok(places(w).hangouts.some((s) => s.x === x + 1 && s.y === y + 2), 'the idle never go to the park');
  // One park is enough for a while.
  w.day += 30;
  amenitiesDay(w);
  ok(w.parks!.length === 1 || townPop(w) >= 120, 'a second park for a town the first is enough for');
});

test('parks, the square, the baths and the theatre lift loyalty; the baths and the parks spare the sick', () => {
  const w = world();
  const n = grown(w)[0];
  const bare = amenityJoy(w, n);
  const bareClean = cleaner(w);
  w.parks = [parkSpot(w)];
  w.works = { ...(w.works ?? {}), plaza: w.day, fountain: w.day, bathhouse: w.day, theatre: w.day };
  ok(amenityJoy(w, n) > bare + 0.5, `the public places please nobody: ${bare} -> ${amenityJoy(w, n)}`);
  ok(cleaner(w) < bareClean * 0.8, `the baths spare nobody: ${cleaner(w)}`);
  // Cold baths do nothing.
  w.bathsCold = true;
  const cold = cleaner(w);
  ok(cold > cleaner({ ...w, bathsCold: false }), 'cold baths still clean');
  // The baths burn firewood off the market each month, and go cold without it.
  w.bathsCold = false;
  const m = ensureMarket(w);
  m.stock.timber = 0;
  m.stock.coal = 0;
  while (w.day % 30 !== 16) w.day++;
  amenitiesDay(w);
  ok(w.bathsCold, 'the baths stayed hot without fuel');
  m.stock.timber = 10;
  w.day += 30;
  amenitiesDay(w);
  ok(!w.bathsCold && m.stock.timber < 10, 'the baths burnt nothing');
});

test('the fountain waits for the grand square, which is open paving people walk over', () => {
  const w = world();
  w.treasury = 20000;
  for (const n of w.npcs) if (n.alive && n.job === 'king') n.traits = ['kind'];
  for (let k = 0; k < 40 && w.works?.fountain === undefined; k++) {
    w.day += 30 - (w.day % 30) + 8;
    crownWorks(w, rngOf(w));
    if (w.building) w.day = w.building.done;
    crownWorks(w, rngOf(w));
    if (w.works?.fountain !== undefined) ok(w.works.plaza !== undefined && w.works.plaza <= w.works.fountain, 'a fountain before its square');
  }
  ok(w.works?.plaza !== undefined, 'the grand square was never built');
  const p = w.plots!.plaza!;
  const lay = townLayout(w);
  ok(lay.ground[(p.y + 1) * MAP_W + p.x + 1] === 'paved' && lay.cost[(p.y + 1) * MAP_W + p.x + 1] > 0, 'the grand square is not open paving');
});

// ---------- the town's quarters ----------

test('a full old town opens a new quarter; new homes go round its well, which can be walked to', () => {
  const w = world();
  w.treasury = 20000;
  foundHomes(w, CORE_HOMES);
  ok((w.homes?.length ?? 0) >= CORE_HOMES - 2, `only ${w.homes?.length} homes in the old town`);
  w.homeless = 12;
  while (w.day % 30 !== 23) w.day++;
  districtsDay(w);
  ok(w.districts?.length === 1, `quarters: ${w.districts?.length}`);
  ok(w.chronicle.some((e) => e.text.includes('เปิดย่านใหม่') && e.major), 'no headline for the new quarter');
  const d = w.districts![0];
  const h = heartOf(d);
  ok(fromSite(w, h.x, h.y) >= 12, `the quarter is in the old town: ${fromSite(w, h.x, h.y)}`);
  const { lot, far } = newHomeLot(w, [grown(w)[0]], false);
  ok(lot >= 0 && !far && quarterOf(w, lot) === 0, `a new home is not put in the quarter: ${lot} ${far} ${lot >= 0 ? quarterOf(w, lot) : ''}`);
  const lay = townLayout(w);
  ok(lay.cost[(d.y + 3) * MAP_W + d.x + 1] > 0 && lay.cost[h.y * MAP_W + h.x] > 0, 'the quarter cannot be walked to');
  ok(lay.ground[h.y * MAP_W + h.x] === 'paved', 'the quarter has no square');
  ok(places(w).hangouts.some((s) => s.x === h.x && s.y === h.y + 1), 'the idle never go to the well');
  // A town lays out only one.
  w.homeless = 12;
  for (let k = 0; k < 5; k++) {
    const l = newHomeLot(w, [], false).lot;
    if (l >= 0) w.homes!.push({ lot: l, tier: 1, built: w.day });
  }
  w.day += 30;
  districtsDay(w);
  ok(w.districts!.length === 1, 'a town of 120 laid out a second quarter');
});

test('a suburb outside the walls likes the crown less, until the crown takes the walls round it', () => {
  const w = world();
  w.treasury = 50000;
  const spot = districtSpot(w)!;
  ok(!!spot, 'nowhere for a quarter');
  // Walls drawn tight round the square, as they were when the town was smaller.
  const s0 = siteOf(w);
  w.ring = { x0: s0.x - 9, y0: s0.y - 7, x1: s0.x + 9, y1: s0.y + 7 };
  w.districts = [{ x: spot.x, y: spot.y, name: spot.name, since: w.day }];
  const d = w.districts[0];
  ok(isSuburb(w, d), 'the quarter is inside the walls already');
  const lots: number[] = [];
  for (let k = 0; k < 4; k++) {
    const l = homeSpot(w, [], false, heartOf(d));
    ok(l >= 0 && quarterOf(w, l) === 0, 'no room in the quarter');
    w.homes!.push({ lot: l, tier: 1, built: w.day });
    w.buildRev = (w.buildRev ?? 0) + 1;
    lots.push(l);
  }
  const n = grown(w)[0];
  n.home = lots[0];
  ok(suburbFeel(w, n) < 0, 'the suburb does not mind the walls');
  while (w.day % 30 !== 23) w.day++;
  const gold = w.treasury;
  districtsDay(w);
  ok(d.walling !== undefined && w.treasury < gold, 'the crown never set about walling the suburb');
  while (w.day < d.walling! || w.day % 30 !== 23) w.day++;
  districtsDay(w);
  const h = heartOf(d);
  ok(d.walled && ringMask(w.ring!)[h.y * MAP_W + h.x] === IN_WALLS, 'the walls do not go round the quarter');
  ok(suburbFeel(w, n) === 0, 'still feels left outside');
});

// ---------- the town plan ----------

test('a town gets a plan from whoever governs it, and each kind of thing keeps to its zone', () => {
  const w = world();
  // A town with room left: half its homes, so the plan has open ground to keep green.
  w.homes = w.homes!.slice(0, 8);
  w.buildRev = (w.buildRev ?? 0) + 1;
  while (w.day % 30 !== 25) w.day++;
  zoningDay(w);
  ok(!!w.zoning, 'no plan for a town of 120');
  ok(w.chronicle.some((e) => e.text.includes('ผังเมือง')), 'no word of the plan');
  for (const z of ZONES) ok(zoneCells(w, z).length > 0, `no ground set aside for ${z}`);
  const at = (lot: number, dx = 1, dy = 1) => zoneAt(w, lotXY(lot).x + dx, lotXY(lot).y + dy);
  let homes = 0;
  for (let k = 0; k < 6; k++) {
    const lot = homeSpot(w, [grown(w)[k]], false);
    ok(lot >= 0 && at(lot) !== 'green', 'a home went on green ground');
    if (at(lot) === 'home') homes++;
  }
  ok(homes >= 4, `only ${homes} of 6 new homes in the homes zone`);
  const mill = millSite(w);
  ok(mill >= 0 && at(mill) === 'works', `a mill outside the works zone: ${mill >= 0 ? at(mill) : 'nowhere'}`);
  const park = parkSpot(w);
  ok(park >= 0 && at(park) === 'green', `a park outside the green ground: ${park >= 0 ? at(park) : 'nowhere'}`);
  // Once laid out, the plan stays for the same government.
  const cells = w.zoning!.cells;
  w.day += 30;
  zoningDay(w);
  ok(w.zoning!.cells === cells, 'the same government redrew its plan');
});

test('each platform draws its own plan; another government redraws it, but not too often', () => {
  const w = world();
  // A town with room left: half its homes, so the plan has open ground to keep green.
  w.homes = w.homes!.slice(0, 8);
  w.buildRev = (w.buildRev ?? 0) + 1;
  const n = (plan: string, c: string) => [...plan].filter((k) => k === c).length;
  const trade = drawPlan(w, 'trade');
  const old = drawPlan(w, 'old');
  const labour = drawPlan(w, 'labour');
  ok(n(trade, 't') > n(old, 't'), `free trade gives the market no more room: ${n(trade, 't')} vs ${n(old, 't')}`);
  ok(n(labour, 'w') > n(old, 'w'), 'labour gives the works no more room');
  ok(n(labour, 'g') > n(trade, 'g'), 'labour lays out no more green');
  while (w.day % 30 !== 25) w.day++;
  w.zoning = { cells: old, since: w.day - 360, by: 'old' };
  w.regime = 'oligarchy'; // a merchants' council governs by free trade
  zoningDay(w);
  ok(w.zoning.by === 'old', 'redrawn within a year');
  w.day += 5 * 360;
  zoningDay(w);
  ok(w.zoning!.by === 'trade', `not redrawn by the new government: ${w.zoning!.by}`);
});

test('homes on ground the plan keeps for the works or the parks, and shacks on planned ground, stand against it', () => {
  const w = world();
  // A town with room left: half its homes, so the plan has open ground to keep green.
  w.homes = w.homes!.slice(0, 8);
  w.buildRev = (w.buildRev ?? 0) + 1;
  w.zoning = { cells: drawPlan(w, 'labour'), since: w.day, by: 'labour' };
  const g = zoneCells(w, 'green')[0];
  const before = offPlan(w).homes.length;
  w.homes!.push({ lot: (g.y - 1) * MAP_W + g.x - 1, tier: 1, built: w.day });
  ok(offPlan(w).homes.length === before + 1, 'a home on green ground is not against the plan');
  const h = zoneCells(w, 'home')[0];
  w.shacks = [...(w.shacks ?? []), h.y * MAP_W + h.x];
  ok(offPlan(w).shacks.includes(h.y * MAP_W + h.x), 'a shack on ground for homes is not against the plan');
});
