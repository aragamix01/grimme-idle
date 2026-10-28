// The rule tests run by run.mjs: each sets up a scene in a fresh world, ticks it, and checks.
import { createWorld, tick } from '../../src/sim/world';
import { kill } from '../../src/sim/core';
import { wed, births } from '../../src/sim/life';
import { creedCounts, daysToHoly, isHolyDay, prayers, religionOf } from '../../src/sim/religion';
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
