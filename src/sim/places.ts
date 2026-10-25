// Tiles NPCs walk to. They sit in front of the buildings WorldScene draws, so the
// two must move together if the town layout changes.
export interface Spot {
  x: number;
  y: number;
}

export const PLACES = {
  gate: { x: 0, y: 10 },
  guild: { x: 7, y: 4 },
  inn: { x: 11, y: 4 },
  church: { x: 15, y: 3 },
  shop: { x: 6, y: 8 },
  homes: [
    { x: 3, y: 8 },
    { x: 9, y: 8 },
    { x: 12, y: 8 },
  ],
  square: { x: 13, y: 5 },
} satisfies Record<string, Spot | Spot[]>;

// Farmland south of the fence; the pond (2-6, 14-17) stays clear.
export const FIELDS = { x0: 8, y0: 13, x1: 16, y1: 22 };

// Where an NPC stands to enter a dungeon drawn at (d.x, d.y).
export const dungeonDoor = (d: Spot): Spot => ({ x: d.x + 1, y: d.y + 2 });
