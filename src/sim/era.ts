// Eras: when an age has run its course the player may close it. The town is reborn from a
// new seed, but the god keeps what it earned: legend stars spent on lasting gifts, and the
// memory of past eras and their heroes, whose statue stands in the new town's square.
import { createWorld } from './world';
import { balanceOf } from './cult';
import { perkLevel } from './core';
import { ageOf } from './ages';
import type { EraRecord, Legacy, Perk, WorldState } from './types';

export const ERA_YEARS = 10; // an era may close after this long even without a great deed
const OCCUPIED_YEARS = 2; // ...or after this long under the demon lord, as a dark age
const YEAR = 365;
const ERAS_KEPT = 20;
export const FAITH_PER_STAR = 200; // faith left unspent at the close becomes stars

export const PERKS: Record<Perk, { name: string; text: string; max: number; base: number; step: number }> = {
  faith: { name: 'ศรัทธาตั้งต้น', text: 'เริ่มยุคใหม่พร้อมศรัทธา +25 ต่อขั้น', max: 5, base: 2, step: 2 },
  grace: { name: 'พรอันอ่อนโยน', text: 'พลังเทพใช้ศรัทธาน้อยลง 10% ต่อขั้น', max: 3, base: 4, step: 3 },
  valor: { name: 'สายเลือดวีรชน', text: 'ผู้กล้าฝึกเร็วขึ้น 10 วันและตื่นมาเก่งขึ้น 1 เลเวลต่อขั้น', max: 3, base: 3, step: 3 },
  harvest: { name: 'แผ่นดินอุดม', text: 'ทุ่งนาให้ผลผลิตเพิ่ม 10% ต่อขั้น', max: 3, base: 3, step: 2 },
  ward: { name: 'ผนึกศักดิ์สิทธิ์', text: 'ลางร้ายก่อตัวช้าลง 20% ต่อขั้น', max: 3, base: 3, step: 3 },
  lore: { name: 'ปัญญาสืบทอด', text: 'เมืองใหม่เริ่มยุคพร้อมวิทยาการที่รู้แล้ว 2 อย่างต่อขั้น', max: 3, base: 4, step: 4 },
};
export const PERK_ORDER = Object.keys(PERKS) as Perk[];

export const eraOf = (world: WorldState) => world.legacy?.era ?? 1;
export const starsOf = (world: WorldState) => world.legacy?.stars ?? 0;
export const perkCost = (world: WorldState, p: Perk) => PERKS[p].base + perkLevel(world, p) * PERKS[p].step;

// The era may close after a demon lord falls, after ten years, or after two years under occupation.
export function canEndEra(world: WorldState): boolean {
  const d = world.demon;
  return (world.demonsSlain ?? 0) > 0 || world.day >= ERA_YEARS * YEAR || (d?.stage === 'occupied' && world.day - (d.fell ?? world.day) >= OCCUPIED_YEARS * YEAR);
}

export function eraTitle(world: WorldState): string {
  const b = balanceOf(world);
  if (world.demon?.stage === 'occupied') return 'ยุคมืดใต้เงาจอมมาร';
  if (world.demonsSlain) return 'ยุคแห่งวีรบุรุษ';
  if (b >= 35) return 'ยุคแห่งแสง';
  if (b <= -20) return 'ยุคแห่งเงามืด';
  return 'ยุคสงบสุข';
}

const LONG_YEARS = 50; // years past ERA_YEARS still count, at half, up to this
const PER_AGE = 4; // stars for each age of learning the town came into
const PER_TECH = 0.5;
const PER_MASTERY = 1;
const PER_TIER = 0.5; // each tier of the monument

// Stars the era is worth, part by part: the years it lasted (a long era still pays, at half after
// the first ten), how far its learning came, what it built, the demon lords slain, the light it
// ended in, the people alive at its close, the legends told of it, and the faith never spent.
export function starsParts(world: WorldState): [label: string, stars: number][] {
  const y = world.day / YEAR;
  const mastery = Object.values(world.mastery ?? {}).reduce((s, n) => s + (n ?? 0), 0);
  return [
    ['ปี', Math.min(ERA_YEARS, y) + Math.max(0, Math.min(y, LONG_YEARS) - ERA_YEARS) / 2],
    ['สมัย', ageOf(world) * PER_AGE],
    ['วิทยาการ', Object.keys(world.techs ?? {}).length * PER_TECH + mastery * PER_MASTERY],
    ['อนุสรณ์สถาน', (world.monument ?? 0) * PER_TIER],
    ['ปราบจอมมาร', (world.demonsSlain ?? 0) * 5],
    ['แสงสว่าง', Math.max(0, balanceOf(world)) / 10],
    ['ชาวเมือง', world.npcs.filter((n) => n.alive).length / 20],
    ['ตำนาน', world.legends.length * 0.25],
    ['ศรัทธา', world.faith / FAITH_PER_STAR],
  ];
}

export function starsFor(world: WorldState): number {
  return Math.max(1, Math.floor(starsParts(world).reduce((s, [, n]) => s + n, 0)));
}

export function buyPerk(world: WorldState, p: Perk): boolean {
  const legacy = world.legacy;
  const cost = perkCost(world, p);
  if (!legacy || !PERKS[p] || perkLevel(world, p) >= PERKS[p].max || legacy.stars < cost) return false;
  legacy.stars -= cost;
  legacy.perks[p] = perkLevel(world, p) + 1;
  return true;
}

// Close this era and start the next from a fresh seed, carrying the legacy forward.
export function newEra(old: WorldState, seed: number): WorldState {
  const earned = starsFor(old);
  const king = old.npcs.find((n) => n.id === old.kingId);
  const record: EraRecord = {
    era: eraOf(old),
    title: eraTitle(old),
    years: Math.floor(old.day / YEAR),
    stars: earned,
    demons: old.demonsSlain ?? 0,
    heroes: old.slayers ?? [],
    king: king?.name,
    balance: Math.round(balanceOf(old)),
  };
  const legacy: Legacy = {
    era: eraOf(old) + 1,
    stars: starsOf(old) + earned,
    perks: { ...(old.legacy?.perks ?? {}) },
    past: [...(old.legacy?.past ?? []), record].slice(-ERAS_KEPT),
  };
  return createWorld(seed, undefined, legacy);
}

// The latest hero who slew a demon lord in any past era; the new town raises their statue.
export const statueHero = (world: WorldState) =>
  [...(world.legacy?.past ?? [])].reverse().find((r) => r.heroes.length)?.heroes.at(-1);
