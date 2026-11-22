// What an adventurer becomes, and what a party needs. A seasoned swordsman takes up a calling as a
// knight who holds the line or a ranger who hunts beasts; a seasoned mage, as a war-cleric who
// heals and smites the dead or a warlock who burns. A party with someone to hold the line, someone
// to heal and someone to strike does better than three of a kind, and every kind of dungeon has
// what it fears: the crypt's dead the cleric, the den's beasts the ranger, the cave's slimes the
// warlock's fire, the fort's garrison a knight in good steel. And the deeper a party has mapped a
// dungeon, the richer its floors and the worse its dangers.
import { log } from './core';
import type { Calling, Dungeon, DungeonKind, Npc, WorldState } from './types';

export const CALLING_TH: Record<Calling, string> = { knight: 'อัศวิน', ranger: 'พรานอสูร', cleric: 'นักบวชรบ', warlock: 'จอมเวทเพลิง' };
export const CALLING_LEVEL = 8; // level an adventurer takes up a calling at
const CALLING_DAY = 19; // day of the month the guild hall recognises them
export const MAX_DEPTH = 5; // floors a dungeon is mapped down to
export const WEAK_TO: Record<DungeonKind, Calling> = { crypt: 'cleric', den: 'ranger', cave: 'warlock', fort: 'knight' };

type Role = 'guard' | 'healer' | 'striker';
export function roleOf(n: Npc): Role | undefined {
  if (n.calling === 'cleric') return 'healer';
  if (n.calling === 'ranger' || n.calling === 'warlock' || n.job === 'mage') return 'striker';
  if (n.job === 'swordsman') return 'guard';
  return undefined;
}

// Monthly: the seasoned take up a calling, by their nature.
export function callingsDay(world: WorldState): void {
  if (world.day % 30 !== CALLING_DAY) return;
  for (const n of world.npcs) {
    if (!n.alive || n.calling || n.level < CALLING_LEVEL || (n.job !== 'swordsman' && n.job !== 'mage')) continue;
    const devout = n.creed === 'god' && (n.piety ?? 50) >= 55;
    n.calling =
      n.job === 'swordsman'
        ? n.traits.includes('brave') || n.traits.includes('loyal') ? 'knight' : 'ranger'
        : devout || n.traits.includes('kind') ? 'cleric' : 'warlock';
    log(world, 'rank', `${n.name}ได้รับการยอมรับเป็น${CALLING_TH[n.calling]}`, n.id);
  }
}

// How much better a party fights for being well made up, and for having what the place fears.
export function partyEdge(party: Npc[], kind?: DungeonKind): number {
  const roles = new Set(party.map(roleOf).filter(Boolean));
  const made = roles.size >= 3 ? 1.2 : roles.size === 2 ? 1.08 : 1;
  const feared = kind ? Math.min(3, party.filter((n) => n.calling === WEAK_TO[kind]).length) * 0.15 : 0;
  return made * (1 + feared);
}
// A healer in the party: the share of a failed quest's danger the others still face.
export const healed = (party: Npc[]) => (party.some((n) => n.calling === 'cleric') ? 0.7 : 1);

// A delve that came back alive maps another floor; the boss's fall closes the deep ways for a time.
export const depthOf = (d: Dungeon) => d.depth ?? 0;
export function mapFloor(world: WorldState, d: Dungeon, party: Npc[]): void {
  if (depthOf(d) >= MAX_DEPTH) return;
  d.depth = depthOf(d) + 1;
  if (d.depth === MAX_DEPTH) log(world, 'quest', `${party[0]?.name ?? 'ปาร์ตี้'}สำรวจ${d.name}ถึงชั้นล่างสุดแล้ว ของล้ำค่ารออยู่ แต่ก็อันตรายที่สุด`, party[0]?.id);
}
// What a floor gives over the first, and how much worse it bites.
export const floorSpoils = (d: Dungeon) => 1 + 0.25 * depthOf(d);
export const floorDanger = (d: Dungeon) => 1 + 0.1 * depthOf(d);
