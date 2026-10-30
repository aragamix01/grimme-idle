// The hard side of a growing town. Those with no room anywhere knock up shacks past the south
// wall, and the shanty breeds thieves and sickness. And a town of timber burns: a fire in one home
// spreads along the row, the shanty worst of all, until the town rebuilds (in what, is the
// ruler's call: see the firecode happening).
import { chance, int, pick, type Rng } from './rng';
import { kill, log, modOf } from './core';
import { LOTS, SHACK_SPOTS } from './town';
import { inShack, standing } from './housing';
import { ageOf } from './ages';
import { seasonOf } from './market';
import { weatherOf } from './divine';
import { plagueStrike } from './worldevents';
import { raise } from './happenings';
import type { Home, WorldState } from './types';

const FIRE_DAY = 14; // day of the month a fire may break out
const FIRE_ODDS = 0.0008; // monthly, for each timber home (a hut counts twice, a shack thrice)
const SPREAD = 3; // tiles along the row a fire can jump
const CATCH = { hut: 0.6, timber: 0.4, shack: 0.7 } as const;
const BURNED_FOR = [120, 240] as const; // days a burnt home lies before it is rebuilt
const SHANTY_SICK = 0.012; // monthly chance of sickness, for each shack
const SHANTY_CRIME = 1; // thieving multiplies by up to this much more as the shanty's share of the town grows

// Timber burns: huts and houses until the age of brick; a townhouse is half stone.
const timber = (world: WorldState, h: Home) => (h.tier === 0 ? 2 : ageOf(world) >= 3 ? 0 : h.tier === 2 ? 0.5 : 1);

// How much more the shanty's people steal: by its share of the town.
export function shantyCrime(world: WorldState): number {
  const n = world.slum ?? 0;
  if (!n) return 1;
  const pop = world.npcs.filter((x) => x.alive).length;
  return 1 + SHANTY_CRIME * Math.min(1, (n / Math.max(1, pop)) * 4);
}

// A fire in town: one home catches, the flames run along its row, and a burnt shack is gone for good.
export function fire(world: WorldState, rng: Rng, start?: { x: number; y: number }): number {
  const up = (world.homes ?? []).filter((h) => standing(world, h) && timber(world, h) > 0);
  const first = start ? undefined : pick(rng, up);
  const at = start ?? (first ? LOTS[first.lot] : undefined);
  if (!at) return 0;
  let burnt = 0;
  const ruins = (world.ruins ??= []);
  for (const h of up) {
    const l = LOTS[h.lot];
    const near = l.y === at.y && Math.abs(l.x - at.x) <= SPREAD + 1;
    if (h !== first && !(near && chance(rng, h.tier === 0 ? CATCH.hut : CATCH.timber))) continue;
    ruins.push({ x: l.x, y: l.y, until: world.day + int(rng, ...BURNED_FOR) });
    burnt++;
  }
  // The shanty goes up like straw.
  let shacks = 0;
  if (world.shacks?.length) {
    const lit = start ? world.shacks.filter((s) => Math.abs(SHACK_SPOTS[s].y - at.y) <= 1 && Math.abs(SHACK_SPOTS[s].x - at.x) <= SPREAD) : [];
    const gone = new Set(lit.filter(() => chance(rng, CATCH.shack)));
    shacks = gone.size;
    if (shacks) world.shacks = world.shacks.filter((s) => !gone.has(s));
  }
  if (!burnt && !shacks) return 0;
  // Most get out; the old and the very young are slower.
  let dead = 0;
  for (const n of world.npcs)
    if (n.alive && n.home !== undefined && n.inside === undefined && chance(rng, (n.age >= 60 || n.age < 6 ? 0.04 : 0.01) * (inShack(n) ? 2 : 0.5))) {
      const l = inShack(n) ? SHACK_SPOTS[n.home - 1000] : LOTS[n.home];
      if (l && Math.abs(l.y - at.y) <= 1 && Math.abs(l.x - at.x) <= SPREAD + 1) {
        kill(world, n, 'เสียชีวิตในกองเพลิง');
        dead++;
      }
    }
  log(world, 'disaster', `ไฟไหม้! เปลวไฟลามจากบ้านหลังหนึ่งไปทั้งแถว บ้านวอด ${burnt} หลัง${shacks ? ` เพิงในชุมชนแออัดไหม้ ${shacks} หลัง` : ''}${dead ? ` มีผู้เสียชีวิต ${dead} คน` : ''}`);
  return burnt + shacks;
}

// Monthly: maybe a fire, and the shanty's sickness.
export function slumsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== FIRE_DAY) return;
  const wood = (world.homes ?? []).reduce((s, h) => s + (standing(world, h) ? timber(world, h) : 0), 0) + (world.shacks?.length ?? 0) * 3;
  const season = seasonOf(world.day);
  const odds = FIRE_ODDS * wood * (season === 'summer' ? 1.5 : season === 'winter' ? 1.3 : 1) * (weatherOf(world) === 'drought' ? 2 : 1) * Math.max(0.1, 1 + modOf(world, 'fire'));
  if (chance(rng, odds)) {
    // A fire is likelier to start in the shanty, among the braziers and straw.
    const fromShanty = world.shacks?.length && chance(rng, 0.4);
    const burnt = fromShanty ? fire(world, rng, SHACK_SPOTS[pick(rng, world.shacks!)]) : fire(world, rng);
    if (burnt && !world.happening) raise(world, 'firecode', rng);
  }
  const shacks = world.shacks?.length ?? 0;
  if (shacks && chance(rng, SHANTY_SICK * shacks)) plagueStrike(world, rng, 0.15 + shacks * 0.02, `ชุมชนแออัด ${shacks} เพิงนอกกำแพงไม่มีน้ำสะอาด โรคระบาดลามเข้าเมือง`);
}
