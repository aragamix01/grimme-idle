// Trade routes and the king's diplomacy. Caravans pick the neighbour that will pay best for
// what we have spare (or sell us the grain we lack) among those still friendly enough to
// visit. Each month the king, true to their nature, may send envoys, seal an alliance,
// marry a child into a friendly court, pay or refuse a greedy neighbour's demand for
// tribute, or trade insults. The god does not steer any of it.
import { chance, pick, type Rng } from './rng';
import { clamp, log, occupied } from './core';
import { legend } from './quests';
import { king } from './society';
import { HOME } from './realms';
import type { Good, Npc, Realm, Terrain, WorldState } from './types';

// What each kind of country has to sell, and what it is short of.
// Wool has no use in town; it is shorn to be sold abroad, where the cold mountains and desert nights want it.
export const WOOL_BUYERS: readonly Terrain[] = ['mountain', 'desert'];

export const TRADE: Record<Terrain, { sells: Good; wants: Good }> = {
  mountain: { sells: 'gear', wants: 'grain' },
  coast: { sells: 'grain', wants: 'loot' },
  desert: { sells: 'loot', wants: 'grain' },
  forest: { sells: 'grain', wants: 'gear' },
};
const ENVOY_COST = 25;
const ALLY_AT = 50; // relation at which a friendly king offers an alliance
const BREAK_AT = 20; // ...and below which it lapses

export const distanceOf = (r: Realm) => Math.abs(r.x - HOME.x) + Math.abs(r.y - HOME.y);
export const tripDays = (r: Realm) => 6 + Math.round(distanceOf(r) * 0.4);
export const visitable = (r: Realm) => r.relation > -50 && !r.war && !r.fallen; // plague doesn't close a road, only makes it risky

// The best partner for a caravan carrying `spare` goods, or coming for grain if `buying`.
export function tradePartner(world: WorldState, spare: Good[], buying: boolean): Realm | undefined {
  const score = (r: Realm) =>
    r.relation / 10 + (buying && TRADE[r.terrain].sells === 'grain' ? 6 : 0) + (spare.includes(TRADE[r.terrain].wants) || (spare.includes('wool') && WOOL_BUYERS.includes(r.terrain)) ? 4 : 0) + (r.pact ? 2 : 0) - ((r.plagueUntil ?? 0) > world.day ? 4 : 0) - ((r.disaster?.until ?? 0) > world.day ? 3 : 0) - distanceOf(r) / 5 + ((r.id * 31 + world.day) % 9) / 1.5; // merchants try other roads now and then
  return (world.realms ?? []).filter(visitable).sort((a, b) => score(b) - score(a))[0];
}

// Our strength as a neighbour would judge it.
export const homeArmy = (world: WorldState) =>
  world.npcs.filter((n) => n.alive && n.job === 'soldier').length * 4 + world.npcs.filter((n) => n.alive && n.knight).length * 6;

const nudge = (r: Realm, by: number) => (r.relation = clamp(r.relation + by, -100, 100));

export function diplomacy(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== 8 || occupied(world)) return;
  const k = king(world);
  const realms = world.realms ?? [];
  if (!k || !realms.length) return;
  const standing = realms.filter((r) => !r.fallen);
  for (const r of standing) theirMove(world, k, r, rng);
  ourMove(world, k, standing, rng);
}

// The neighbours act first: kind rulers send gifts, greedy strong ones demand tribute.
function theirMove(world: WorldState, k: Npc, r: Realm, rng: Rng): void {
  if (r.war) return;
  const t = r.ruler.traits;
  if (t.includes('kind') && r.relation >= 15 && chance(rng, 0.08)) {
    world.treasury += 40;
    nudge(r, 3);
    log(world, 'politics', `${r.ruler.name}แห่ง${r.name}ส่งของขวัญมาถวายกษัตริย์${k.name} (40 ทอง)`);
    return;
  }
  if (t.includes('greedy') && !r.pact && r.relation < 10 && r.army > homeArmy(world) * 2 && chance(rng, 0.15)) {
    const amount = Math.max(50, Math.floor(world.treasury * 0.2));
    // The king answers from their own nature: the timid and the gentle pay, the proud refuse.
    const pays = (k.traits.includes('coward') || k.traits.includes('kind')) && !k.traits.includes('brave') && !k.traits.includes('vengeful') && world.treasury >= amount;
    if (pays) {
      world.treasury -= amount;
      r.gold += amount;
      nudge(r, 12);
      log(world, 'politics', `${r.name}เรียกเครื่องบรรณาการ กษัตริย์${k.name}ยอมจ่าย ${amount} ทองเพื่อรักษาสันติ`);
    } else {
      nudge(r, -20);
      log(world, 'politics', `${r.name}เรียกเครื่องบรรณาการ แต่กษัตริย์${k.name}ปฏิเสธอย่างไม่ไยดี`);
    }
  }
}

// Our king makes at most one move a month, chosen by temperament.
function ourMove(world: WorldState, k: Npc, realms: Realm[], rng: Rng): void {
  const t = k.traits;
  const calm = realms.filter((r) => !r.war);
  // Alliances lapse when feeling sours, and are offered when it runs high.
  for (const r of calm) {
    if (r.pact && r.relation < BREAK_AT) {
      r.pact = undefined;
      log(world, 'politics', `สนธิสัญญาพันธมิตรกับ${r.name}สิ้นสุดลง ความสัมพันธ์เย็นชาลง`);
    } else if (!r.pact && r.relation >= ALLY_AT) {
      r.pact = 'alliance';
      log(world, 'politics', `กษัตริย์${k.name}ลงนามสนธิสัญญาพันธมิตรกับ${r.ruler.name}แห่ง${r.name}`);
      legend(world, `กษัตริย์${k.name}เป็นพันธมิตรกับ${r.name}`, k.id);
      return;
    }
  }
  // A grown, unmarried child of the king may be wed into an allied court.
  const child = world.npcs.find((n) => n.alive && n.parentIds?.includes(k.id) && n.age >= 16 && n.age <= 35 && !world.npcs.some((s) => s.alive && s.id === n.spouseId));
  const ally = calm.find((r) => r.pact && !r.wed);
  if (child && ally && chance(rng, 0.15)) {
    ally.wed = child.name;
    nudge(ally, 20);
    child.alive = false;
    child.left = true;
    child.plan = undefined;
    log(world, 'bond', `${child.name} บุตรของกษัตริย์${k.name} เดินทางไปอภิเษกสมรสกับราชวงศ์แห่ง${ally.name}`, child.id);
    legend(world, `${child.name} อภิเษกสมรสเชื่อมสัมพันธ์กับ${ally.name}`, child.id);
    return;
  }
  // The vengeful and the greedy trade insults with neighbours they already dislike.
  const disliked = calm.filter((r) => r.relation < 0);
  if ((t.includes('vengeful') || t.includes('greedy')) && disliked.length && chance(rng, 0.1)) {
    const r = pick(rng, disliked);
    nudge(r, -10);
    log(world, 'politics', `กษัตริย์${k.name}ดูหมิ่นทูตแห่ง${r.name}ต่อหน้าราชสำนัก`);
    return;
  }
  // Everyone else sends envoys: the kind to mend fences, the rest to court likely friends.
  if (t.includes('vengeful') || world.treasury < ENVOY_COST + 50) return;
  const open = calm.filter((r) => r.relation > -40 && r.relation < ALLY_AT);
  if (!open.length || !chance(rng, 0.25 + (t.includes('kind') ? 0.2 : 0) + (t.includes('loyal') ? 0.1 : 0))) return;
  const r = t.includes('kind') ? open.sort((a, b) => a.relation - b.relation)[0] : open.sort((a, b) => b.relation - a.relation)[0];
  world.treasury -= ENVOY_COST;
  nudge(r, t.includes('kind') ? 8 : 5);
  log(world, 'politics', `กษัตริย์${k.name}ส่งทูตพร้อมบรรณาการไปเจริญสัมพันธไมตรีกับ${r.name}`);
}
