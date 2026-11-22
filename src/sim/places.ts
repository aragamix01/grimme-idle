// Tiles NPCs walk to: the doors of the town's buildings wherever they were put up, the square,
// and the road in. Worked out afresh whenever the town is built on (buildRev), so they always sit
// in front of what WorldScene draws. A building not yet put up sends people to the square instead.
import { terrainOf, type Spot } from './terrain';
import { MAP_W, doorOf, townLayout } from './town';
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

// Street corners round the square, one in each direction, so idle folk stand about the town and
// not out in the woods (on this map the road in runs a long way through the trees).
function hangouts(world: WorldState, s: Spot): Spot[] {
  const lay = townLayout(world);
  const out: Spot[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    let best: Spot | undefined;
    let bestScore = Infinity;
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < 3 || d > 9) continue;
        const g = lay.ground[(s.y + dy) * MAP_W + s.x + dx];
        if (g !== 'road' && g !== 'paved' && g !== 'trail') continue;
        const score = Math.hypot(dx - Math.cos(a) * 6, dy - Math.sin(a) * 5);
        if (score < bestScore) {
          bestScore = score;
          best = { x: s.x + dx, y: s.y + dy };
        }
      }
    out.push(best ?? { x: s.x, y: s.y });
  }
  return out;
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
    hangouts: hangouts(world, s),
  };
  cache = { world, rev, seed: world.seed, p };
  return p;
}
