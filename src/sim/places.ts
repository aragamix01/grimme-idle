// Tiles NPCs walk to, taken from the town layout so they always sit in front of
// the buildings WorldScene draws.
import { BUILDINGS, doorOf } from './town';

export { FIELDS, FOREST, PASTURE, dungeonDoor } from './town';

export interface Spot {
  x: number;
  y: number;
}

const door = (key: string) => {
  const b = BUILDINGS.find(([k]) => k === key)!;
  return doorOf(...b);
};

export const PLACES = {
  gate: { x: 0, y: 9 },
  guild: door('guild'),
  inn: door('inn'),
  church: door('church'),
  shop: door('shop'),
  forge: door('forge'),
  barracks: door('barracks'),
  brothel: door('brothel'),
  manor: door('manor'),
  barn: door('barn'),
  castle: door('castle'),
  homes: BUILDINGS.filter(([k]) => k.startsWith('house')).map((b) => doorOf(...b)),
  square: { x: 13, y: 10 },
  // Open-air spots so a crowd of sixty spreads out instead of piling onto a few doorsteps.
  hangouts: [
    { x: 6, y: 14 }, // by the pond
    { x: 23, y: 13 }, // under the fruit trees
    { x: 12, y: 16 },
    { x: 29, y: 9 }, // just outside the east gate
    { x: 10, y: 18 }, // edge of the fields
  ],
} satisfies Record<string, Spot | Spot[]>;
