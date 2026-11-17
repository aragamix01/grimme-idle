// Tiles NPCs walk to: the doors of the town's buildings wherever they were put up, the square,
// and the road in. Worked out afresh whenever the town is built on (buildRev), so they always sit
// in front of what WorldScene draws. A building not yet put up sends people to the square instead.
import { terrainOf, type Spot } from './terrain';
import { doorOf } from './town';
import type { WorldState } from './types';

export { dungeonDoor } from './town';
export type { Spot } from './terrain';

export interface Places {
  gate: Spot; // where the road from the wider world comes in
  square: Spot;
  castle: Spot;
  guild: Spot;
  inn: Spot;
  church: Spot;
  shop: Spot;
  forge: Spot;
  barracks: Spot;
  brothel: Spot;
  manor: Spot;
  barn: Spot;
  school: Spot;
  yard: Spot;
  hangouts: Spot[]; // open-air spots, so a crowd spreads out instead of piling onto a few doorsteps
}

let cache: { world: WorldState; rev: number; seed: number; p: Places } | null = null;

export function places(world: WorldState): Places {
  const rev = world.buildRev ?? 0;
  if (cache?.world === world && cache.rev === rev && cache.seed === world.seed) return cache.p;
  const t = terrainOf(world.seed);
  const s = t.site;
  const door = (k: string, dx: number, dy: number): Spot => {
    const p = world.plots?.[k];
    return p ? doorOf(k, p.x, p.y) : { x: s.x + dx, y: s.y + dy };
  };
  const p: Places = {
    gate: { ...t.entry },
    square: { ...s },
    castle: door('castle', 0, -2),
    guild: door('guild', -2, 1),
    inn: door('inn', -2, -1),
    church: door('church', 2, -1),
    shop: door('shop', 2, 1),
    forge: door('forge', -1, 2),
    barracks: door('barracks', 3, 2),
    brothel: door('brothel', 3, 0),
    manor: door('manor', -3, -2),
    barn: door('barn', 4, 4),
    school: door('school', 1, 2),
    yard: door('yard', -1, 2),
    hangouts: [
      { x: s.x - 5, y: s.y + 4 },
      { x: s.x + 6, y: s.y + 5 },
      { x: s.x - 7, y: s.y - 2 },
      { x: s.x + 7, y: s.y - 3 },
      { x: Math.round((s.x + t.entry.x) / 2), y: Math.round((s.y + t.entry.y) / 2) },
    ],
  };
  cache = { world, rev, seed: world.seed, p };
  return p;
}
