// Map tiles (16x16), props and buildings. Buildings are drawn procedurally from
// shared parts (roof, wall, window, door) so the whole town reads as one set.
import { Grid, rng } from './lib.mjs';
import { SHADE } from './palette.mjs';

// ---------- tiles ----------
function grass(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'g');
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * 14) + 1;
    const y = Math.floor(r() * 13) + 2;
    g.set(x, y, 'G').set(x - 1, y - 1, 'G').set(x + 1, y - 1, 'G');
  }
  for (let i = 0; i < 5; i++) g.set(Math.floor(r() * 16), Math.floor(r() * 16), 'j');
  return g;
}

function path(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 't');
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * 15);
    const y = Math.floor(r() * 15);
    g.set(x, y, 'T').set(x + 1, y, 'T').set(x, y - 1, 'c');
  }
  return g;
}

function water(frame) {
  const g = new Grid(16, 16, 'a');
  for (let y = 2; y < 16; y += 5) {
    const off = (y + frame * 3) % 8;
    g.hline(off, y, 4, 'A').hline((off + 8) % 16, y + 2, 3, 'A');
    g.set((off + 1) % 16, y - 1, 'w');
  }
  return g;
}

function flowers() {
  const g = grass(7);
  const spots = [[3, 4, 'r'], [10, 3, 'y'], [6, 10, 'p'], [12, 11, 'w'], [2, 13, 'y']];
  for (const [x, y, c] of spots) g.set(x - 1, y, c).set(x + 1, y, c).set(x, y - 1, c).set(x, y + 1, c).set(x, y, 'y');
  return g;
}

function stoneWall() {
  const g = new Grid(16, 16, 'x');
  for (let y = 0; y < 16; y += 4) {
    g.hline(0, y + 3, 16, 'X');
    g.hline(0, y, 16, 'z');
    const off = (y / 4) % 2 ? 4 : 0;
    for (let x = off; x < 16; x += 8) g.vline(x, y, 4, 'X');
  }
  return g;
}

const TREE = [
  '................',
  '.....GGGGGG.....',
  '...GGGGGGGGGG...',
  '..GGjjGGGGGGGG..',
  '.GGjjGGGGGGFGGG.',
  '.GGjGGGGGGFGGGG.',
  '.GGGGGFGGGGGGGG.',
  '.GGGGFGGGGGGGFG.',
  '.GGGGGGGGGGGFGG.',
  '.GGjGGGGGFGGGGG.',
  '..GGGGGGFGGGGG..',
  '..GGGGGGGGGGFG..',
  '...GGGGGGGGGG...',
  '.....GGGGGG.....',
  '......NNNN......',
  '......NNNN......',
  '......NNNN......',
  '.....NNNNNN.....',
];

const BUSH = [
  '................',
  '................',
  '................',
  '................',
  '.....GGGGG......',
  '...GGjjGGGGG....',
  '..GGjGGGGrGGG...',
  '.GGGGGrGGGGGGG..',
  '.GGGGGGGGGGrGG..',
  '.GGrGGGGGGGGGG..',
  '..GGGGGGGGGGG...',
  '...GGGGGGGGG....',
  '................',
  '................',
  '................',
  '................',
];

const FENCE = [
  '................',
  '................',
  '................',
  '..nn........nn..',
  '..nn........nn..',
  '..nn........nn..',
  'nnnnnnnnnnnnnnnn',
  '..nn........nn..',
  '..nn........nn..',
  '..nn........nn..',
  'nnnnnnnnnnnnnnnn',
  '..nn........nn..',
  '..nn........nn..',
  '..nn........nn..',
  '................',
  '................',
];

const ROCK = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......xxxx......',
  '....xxzzxxxx....',
  '...xxzxxxxxxx...',
  '..xxxxxxxxxxxx..',
  '..xxxxxxxxXxxx..',
  '..xxxXxxxxxxxx..',
  '...xxxxxxxxxx...',
  '................',
  '................',
  '................',
  '................',
];

const prop = (rows, name) => Grid.from(rows, name).shade(SHADE).outline('o');

export function tiles() {
  const tree = new Grid(16, 24).layer(prop(TREE, 'tree'), 0, 4);
  return [
    { name: 'grass', group: 'tiles', frames: [grass(1), grass(2), grass(3)] },
    { name: 'path', group: 'tiles', frames: [path(4), path(5)] },
    { name: 'water', group: 'tiles', frames: [water(0), water(1)] },
    { name: 'flowers', group: 'tiles', frames: [flowers()] },
    { name: 'stone-wall', group: 'tiles', frames: [stoneWall()] },
    { name: 'tree', group: 'props', frames: [tree] },
    { name: 'bush', group: 'props', frames: [prop(BUSH, 'bush')] },
    { name: 'fence', group: 'props', frames: [prop(FENCE, 'fence')] },
    { name: 'rock', group: 'props', frames: [prop(ROCK, 'rock')] },
  ];
}

// ---------- building parts ----------
const ROOFS = {
  red: ['r', 'R', 'u'],
  blue: ['b', 'B', 'i'],
  orange: ['O', 'Q', 'n'],
  brown: ['N', 'M', 'n'],
  slate: ['X', 'l', 'x'],
};

function roof(g, x, y, w, h, kind) {
  const [base, dark, light] = ROOFS[kind];
  g.rect(x, y, w, h, base);
  g.hline(x + 1, y, w - 2, light);
  for (let j = y + 3, row = 0; j < y + h - 1; j += 3, row++) {
    g.hline(x, j, w, dark);
    for (let i = x + (row % 2 ? 1 : 3); i < x + w; i += 4) g.set(i, j - 1, dark);
  }
  g.hline(x, y + h - 1, w, dark);
  g.set(x, y, '.').set(x + w - 1, y, '.');
}

function wall(g, x, y, w, h, kind = 'plaster') {
  if (kind === 'stone') {
    g.rect(x, y, w, h, 'x');
    for (let j = y + 2; j < y + h; j += 3) {
      g.hline(x, j, w, 'X');
      for (let i = x + ((j - y) % 2 ? 2 : 5); i < x + w; i += 6) g.vline(i, j - 2, 2, 'X');
    }
  } else {
    g.rect(x, y, w, h, 'c');
    g.vline(x, y, h, 'M').vline(x + w - 1, y, h, 'M');
  }
  g.hline(x, y, w, kind === 'stone' ? 'X' : 'C'); // shadow under the eave
}

function windowAt(g, x, y, w = 6, h = 5) {
  g.rect(x, y, w, h, 'M');
  g.rect(x + 1, y + 1, w - 2, h - 2, 'a');
  g.vline(x + Math.floor(w / 2), y + 1, h - 2, 'M');
  g.set(x + 1, y + 1, 'w');
  g.hline(x, y + h, w, 'G'); // flower box
  g.set(x + 1, y + h, 'r').set(x + w - 2, y + h, 'p');
}

function door(g, x, y, w, h) {
  g.rect(x, y, w, h, 'M');
  g.rect(x + 1, y + 1, w - 2, h - 1, 'N');
  for (let i = x + 2; i < x + w - 1; i += 2) g.vline(i, y + 2, h - 2, 'h');
  g.set(x, y, '.').set(x + w - 1, y, '.');
  g.set(x + w - 3, y + Math.floor(h / 2) + 1, 'y');
}

function sign(g, x, y, icon) {
  g.rect(x, y, 8, 6, 'M');
  g.rect(x + 1, y + 1, 6, 4, 'n');
  g.stamp(icon, x + 2, y + 1);
}

function flag(g, x, y, c) {
  g.vline(x, y, 7, 'M');
  g.rect(x + 1, y, 4, 3, c);
  g.set(x + 4, y + 2, '.');
}

const finishBuilding = (g) => g.outline('o');

function house() {
  const g = new Grid(32, 32);
  g.rect(22, 0, 4, 6, 'x').hline(22, 0, 4, 'X');
  roof(g, 1, 3, 30, 15, 'brown');
  g.rect(22, 0, 4, 4, 'x').hline(21, 0, 6, 'X');
  wall(g, 3, 18, 26, 12);
  door(g, 13, 22, 6, 8);
  windowAt(g, 5, 20);
  windowAt(g, 21, 20);
  g.hline(3, 30, 26, 'X');
  return finishBuilding(g);
}

function shop() {
  const g = new Grid(32, 32);
  roof(g, 1, 2, 30, 14, 'red');
  wall(g, 3, 16, 26, 14);
  // striped awning over the counter window
  for (let i = 0; i < 14; i++) g.vline(4 + i, 18, 3, i % 4 < 2 ? 'r' : 'c');
  g.hline(4, 21, 14, 'R');
  g.rect(5, 22, 12, 5, 'a').set(6, 23, 'w');
  g.rect(5, 26, 12, 2, 'N');
  g.set(7, 25, 'y').set(9, 25, 'r').set(11, 25, 'g').set(13, 25, 'y');
  door(g, 20, 21, 6, 9);
  g.hline(3, 30, 26, 'X');
  sign(g, 20, 13, ['.yy...', 'yYYy..', '.yy...', '......'].map((r) => r.slice(0, 4)));
  return finishBuilding(g);
}

function inn() {
  const g = new Grid(40, 36);
  g.rect(6, 0, 4, 6, 'x').hline(6, 0, 4, 'X');
  roof(g, 1, 3, 38, 16, 'orange');
  wall(g, 3, 19, 34, 15);
  g.hline(3, 25, 34, 'M');
  windowAt(g, 6, 20, 6, 4);
  windowAt(g, 28, 20, 6, 4);
  windowAt(g, 6, 27);
  windowAt(g, 28, 27);
  door(g, 16, 26, 8, 8);
  sign(g, 16, 17, ['cc..', 'yyY.', 'yyY.', 'yy..']);
  g.hline(3, 34, 34, 'X');
  return finishBuilding(g);
}

function guild() {
  const g = new Grid(48, 40);
  roof(g, 1, 4, 46, 17, 'blue');
  flag(g, 4, 0, 'r');
  flag(g, 42, 0, 'y');
  wall(g, 3, 21, 42, 17, 'stone');
  g.rect(3, 21, 42, 2, 'X');
  windowAt(g, 7, 25);
  windowAt(g, 35, 25);
  // double door under a big sign with crossed swords
  door(g, 18, 28, 6, 10);
  door(g, 24, 28, 6, 10);
  g.rect(16, 17, 16, 9, 'M').rect(17, 18, 14, 7, 'n');
  g.stamp(['z.......z', '.z.....z.', '..z...z..', '...z.z...', '....y....', '...z.z...', '..y...y..'], 19, 18);
  g.hline(3, 38, 42, 'l');
  return finishBuilding(g);
}

function church() {
  const g = new Grid(32, 48);
  // bell tower
  g.stamp(['..y..', '.yyy.', '..y..'], 13, 0);
  g.tri(15.5, 3, 5, 8, 'B');
  g.rect(11, 11, 10, 9, 'c').vline(11, 11, 9, 'C').vline(20, 11, 9, 'C');
  g.rect(14, 13, 4, 5, 'k').rect(15, 14, 2, 2, 'y');
  roof(g, 1, 18, 30, 14, 'slate');
  wall(g, 3, 32, 26, 14);
  // rose window
  g.disc(16, 36.5, 3, 'M').disc(16, 36.5, 2.2, 'p').set(15, 35, 'w').set(16, 36, 'y');
  door(g, 13, 39, 6, 7);
  windowAt(g, 5, 35, 4, 6);
  windowAt(g, 23, 35, 4, 6);
  g.hline(3, 46, 26, 'X');
  return finishBuilding(g);
}

function castle() {
  const g = new Grid(64, 56);
  const tower = (x) => {
    g.tri(x + 6, 0, 7, 14, 'b');
    g.vline(x + 6, 0, 2, 'M').rect(x + 7, 0, 3, 2, 'r');
    g.hline(x - 1, 13, 15, 'B');
    wall(g, x, 14, 13, 40, 'stone');
    windowAt(g, x + 4, 22, 5, 6);
  };
  // keep behind
  g.tri(32, 4, 9, 14, 'b');
  wall(g, 22, 17, 20, 18, 'stone');
  windowAt(g, 29, 22, 6, 7);
  tower(2);
  tower(49);
  // front curtain wall with battlements
  wall(g, 13, 34, 38, 20, 'stone');
  for (let x = 13; x < 51; x += 4) g.rect(x, 31, 2, 3, 'x').hline(x, 31, 2, 'z');
  // gate
  g.rect(25, 40, 14, 14, 'k');
  g.set(25, 40, 'x').set(38, 40, 'x');
  for (let x = 27; x < 38; x += 3) g.vline(x, 41, 13, 'X');
  g.hline(26, 44, 12, 'X').hline(26, 48, 12, 'X');
  g.hline(0, 54, 64, 'l');
  flag(g, 31, 0, 'r');
  return finishBuilding(g);
}

function dungeon() {
  const g = new Grid(48, 32);
  g.ellipse(24, 22, 23, 18, 'x');
  g.ellipse(17, 12, 6, 3, 'z');
  g.ellipse(36, 24, 9, 7, 'X');
  g.ellipse(10, 26, 6, 4, 'X');
  g.rect(0, 30, 48, 2, '.');
  // cave mouth with spell glow
  g.ellipse(24, 26, 9, 9, 'k');
  g.rect(15, 30, 18, 2, '.');
  g.ellipse(24, 28, 5, 4, 'V');
  g.ellipse(24, 29, 3, 2, 'v');
  g.hline(16, 29, 16, 'X');
  // torches
  for (const x of [11, 36]) g.vline(x, 20, 6, 'M').rect(x - 1, 17, 3, 3, 'r').set(x, 17, 'y').set(x, 16, 'y');
  // skull over the entrance
  g.stamp(['.zzz.', 'zkzkz', '.zzz.', '.z.z.'], 22, 13);
  return finishBuilding(g);
}

export function buildings() {
  return [
    { name: 'house', group: 'buildings', frames: [house()] },
    { name: 'shop', group: 'buildings', frames: [shop()] },
    { name: 'inn', group: 'buildings', frames: [inn()] },
    { name: 'guild', group: 'buildings', frames: [guild()] },
    { name: 'church', group: 'buildings', frames: [church()] },
    { name: 'castle', group: 'buildings', frames: [castle()] },
    { name: 'dungeon', group: 'buildings', frames: [dungeon()] },
  ];
}
