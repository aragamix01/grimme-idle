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

// Tilled rows; frame 1 is the same field gone gold at harvest.
function crops(ripe) {
  const g = new Grid(16, 16, 'N');
  for (let y = 0; y < 16; y += 4) {
    g.hline(0, y + 3, 16, 'M');
    for (let x = (y / 4) % 2 ? 1 : 3; x < 16; x += 4) {
      if (ripe) g.vline(x, y, 3, 'Y').set(x, y, 'y').set(x + 1, y, 'y');
      else g.set(x, y + 1, 'G').set(x - 1, y, 'j').set(x + 1, y, 'G');
    }
  }
  return g;
}

// The cash crops and the resting field (farms.ts), each on its own tilled rows.
// Flax: tall green stems with sky-blue flowers.
function flax(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'G');
  for (let y = 0; y < 16; y += 4) {
    g.hline(0, y + 3, 16, 'M');
    for (let x = 0; x < 16; x++) g.set(x, y + 2, r() < 0.5 ? 'F' : 'G');
    for (let x = (y / 4) % 2 ? 0 : 1; x < 16; x += 2) {
      g.set(x, y + 1, 'j');
      if (r() < 0.8) g.set(x, y, 'i').set(x, y + 1, r() < 0.5 ? 'b' : 'j');
    }
  }
  return g;
}

// Vines: rows of posts and a wire, the leaves along it, purple grapes hanging.
function vines(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'N');
  for (let y = 0; y < 16; y += 8) {
    g.hline(0, y + 7, 16, 'M');
    g.hline(0, y + 1, 16, 'n');
    for (const x of [1, 9]) g.vline(x, y, 6, 'M');
    for (let x = 0; x < 16; x++) {
      if (x === 1 || x === 9) continue;
      g.set(x, y + 2, 'G').set(x, y + 3, r() < 0.5 ? 'G' : 'F');
      if (r() < 0.4) g.set(x, y, 'j');
      if (r() < 0.25) g.set(x, y + 4, 'v').set(x, y + 5, 'V');
    }
  }
  return g;
}

// Herbs: low clumps of many greens, dotted with their flowers.
function herbs(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'N');
  for (let y = 0; y < 16; y += 4) g.hline(0, y + 3, 16, 'M');
  for (let y = 0; y < 16; y += 4)
    for (let x = (y / 4) % 2 ? 1 : 3; x < 16; x += 4) {
      const leaf = ['G', 'F', 'j', 'g'][Math.floor(r() * 4)];
      g.rect(x - 1, y, 3, 2, leaf).set(x, y + 2, 'F');
      g.set(x, y, ['p', 'y', 'w', 'v'][Math.floor(r() * 4)]);
    }
  return g;
}

// A field resting a year: ploughed earth gone to weeds and the odd wild flower.
function fallow(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'N');
  for (let y = 0; y < 16; y += 4) g.hline(0, y + 3, 16, 'M');
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * 15);
    const y = Math.floor(r() * 15);
    g.set(x, y, 'g').set(x + 1, y, 'j').set(x, y + 1, 'G');
  }
  g.set(Math.floor(r() * 16), Math.floor(r() * 16), 'y');
  return g;
}

// Reeds by the water: tall stalks and brown cattails over the grass.
function reeds(seed) {
  const r = rng(seed);
  const g = grass(seed);
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(r() * 14);
    const h = 5 + Math.floor(r() * 5);
    g.vline(x, 15 - h, h, r() < 0.5 ? 'G' : 'F');
    if (r() < 0.6) g.rect(x, 15 - h - 2, 1, 3, 'M').set(x, 15 - h - 3, 'G');
    else g.set(x - 1, 15 - h, 'G');
  }
  return g;
}

// Toadstools at the wood's edge.
function mushrooms(seed) {
  const r = rng(seed);
  const g = grass(seed);
  for (let i = 0; i < 3; i++) {
    const x = 2 + Math.floor(r() * 11);
    const y = 4 + Math.floor(r() * 9);
    const cap = r() < 0.7 ? 'r' : 'n';
    g.rect(x, y + 2, 2, 2, 'z').set(x + 1, y + 3, 'x');
    g.rect(x - 1, y, 4, 2, cap).set(x - 1, y + 1, cap === 'r' ? 'R' : 'N').set(x + 2, y + 1, cap === 'r' ? 'R' : 'N');
    g.set(x, y, 'w').set(x + 2, y, cap === 'r' ? 'w' : 'c');
  }
  return g;
}

// A footpath trodden through the grass: bare earth down the middle, grass at the edges.
function trail(seed) {
  const r = rng(seed);
  const g = grass(seed + 10);
  for (let y = 0; y < 16; y++) {
    const w = 3 + Math.floor(r() * 3);
    g.hline(8 - w, y, w * 2, 't');
  }
  for (let i = 0; i < 4; i++) g.set(4 + Math.floor(r() * 8), Math.floor(r() * 16), 'T');
  return g;
}

// Cobbles the crown has laid: rounded stones in offset rows.
export function cobbles(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'X');
  for (let y = 0; y < 16; y += 4) {
    const off = (y / 4) % 2 ? 2 : 0;
    for (let x = off - 4; x < 16; x += 4) {
      g.rect(x + 1, y + 1, 3, 2, r() < 0.3 ? 'z' : 'x');
      g.set(x + 1, y + 1, 'z');
    }
  }
  return g;
}

// Burnt woods: grey ash, black stumps, a green shoot or two coming back.
function ashes(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'L');
  for (let i = 0; i < 10; i++) g.set(Math.floor(r() * 16), Math.floor(r() * 16), 'l');
  for (let i = 0; i < 2; i++) {
    const x = 2 + Math.floor(r() * 11);
    const y = 3 + Math.floor(r() * 10);
    g.rect(x, y, 3, 2, 'k').set(x + 1, y - 1, 'k');
  }
  g.set(Math.floor(r() * 16), Math.floor(r() * 16), 'g').set(Math.floor(r() * 16), Math.floor(r() * 16), 'j');
  return g;
}

// A palisade of sharpened logs, before the town can afford stone.
function palisade() {
  const g = new Grid(16, 20);
  for (const x of [0, 4, 8, 12]) {
    g.set(x + 1, 0, 'n').rect(x, 1, 4, 1, 'n');
    g.rect(x, 2, 4, 17, 'N').vline(x, 2, 17, 'n').vline(x + 3, 2, 17, 'M');
  }
  g.hline(0, 7, 16, 'M').hline(0, 14, 16, 'M');
  g.hline(0, 19, 16, 'H');
  return g.outline('o');
}

// The side walls seen from above: a walkway between two rows of merlons.
function wallTop() {
  const g = new Grid(16, 16, 'x');
  g.rect(4, 0, 8, 16, 'X');
  for (let y = 0; y < 16; y += 8) {
    g.rect(0, y, 4, 5, 'z').hline(0, y + 5, 4, 'X');
    g.rect(12, y, 4, 5, 'z').hline(12, y + 5, 4, 'X');
  }
  for (let y = 3; y < 16; y += 4) g.hline(5, y, 6, 'l');
  g.vline(0, 0, 16, 'o').vline(15, 0, 16, 'o');
  return g;
}

// The north and south walls face the viewer: battlements over a stone face.
function townWall() {
  const g = new Grid(16, 24);
  for (const x of [0, 8]) g.rect(x, 1, 5, 4, 'x').hline(x, 1, 5, 'z');
  g.rect(0, 5, 16, 3, 'x').hline(0, 5, 16, 'z');
  wall(g, 0, 8, 16, 15, 'stone');
  g.hline(0, 8, 16, 'X');
  g.hline(0, 23, 16, 'l');
  return g.outline('o');
}

// Round tower with a pointed roof, on the corners and either side of each gate.
export function gateTower() {
  const g = new Grid(16, 40);
  g.vline(8, 0, 4, 'M').rect(9, 0, 4, 3, 'r').set(12, 2, '.');
  g.tri(7.5, 3, 8, 11, 'b');
  g.hline(0, 13, 16, 'B');
  for (const x of [0, 6, 12]) g.rect(x, 14, 4, 3, 'x').hline(x, 14, 4, 'z');
  g.rect(0, 17, 16, 2, 'x');
  wall(g, 1, 19, 14, 20, 'stone');
  g.rect(7, 23, 2, 5, 'k').set(7, 23, 'X');
  g.hline(1, 39, 14, 'l');
  return g.outline('o');
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

// Pines on the hills and in the deep woods.
const PINE = [
  '.......FF.......',
  '......FGGF......',
  '.....FGGGGF.....',
  '....FGjGGGGF....',
  '......FGGF......',
  '.....FGGGGF.....',
  '....FGjGGGGF....',
  '...FGGGGGGGGF...',
  '.....FGGGGF.....',
  '....FGjGGGGF....',
  '...FGGGGGGFGF...',
  '..FGGGGGGGGGGF..',
  '....FGGGGGGF....',
  '...FGjGGGGGGF...',
  '..FGGGGGGGFGGF..',
  '.FGGGGGGGGGGGGF.',
  '.......NN.......',
  '.......NN.......',
  '......NNNN......',
];

// Birches: white bark with black marks under light leaves.
const BIRCH = [
  '................',
  '......jjjj......',
  '....jjggjjjg....',
  '...jggjjggggj...',
  '..jgggggjggGgg..',
  '..ggjggggggGgg..',
  '..gggGggjgggGg..',
  '...ggggGgggggg..',
  '...gjggggGggg...',
  '....gggGgggg....',
  '.....ggggzg.....',
  '.......zz.......',
  '.......zk.......',
  '.......zz.......',
  '.......kz.......',
  '.......zz.......',
  '......zzzz......',
];

// Fruit trees near the homes: a round crown hung with apples.
const FRUIT = [
  '................',
  '.....GGGGGG.....',
  '...GGjjGGrGGG...',
  '..GGjGGGGGGGGG..',
  '.GGGGrGGGGGGrGG.',
  '.GGGGGGGFGGGGGG.',
  '.GrGGGGGGGGrGGG.',
  '.GGGGGFGGGGGGGG.',
  '..GGGGGGrGGFGG..',
  '...GGrGGGGGGG...',
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
  // Every tree stands on the same 16x24 frame, its foot on the bottom row.
  const tall = (rows, name) => {
    const p = prop(rows, name);
    return new Grid(16, 24).layer(p, 0, 24 - p.h);
  };
  return [
    { name: 'flax', group: 'tiles', frames: [flax(21), flax(22)] },
    { name: 'vines', group: 'tiles', frames: [vines(23), vines(24)] },
    { name: 'herbs', group: 'tiles', frames: [herbs(25), herbs(26)] },
    { name: 'fallow', group: 'tiles', frames: [fallow(27), fallow(28)] },
    { name: 'reeds', group: 'tiles', frames: [reeds(29), reeds(30)] },
    { name: 'mushrooms', group: 'tiles', frames: [mushrooms(31), mushrooms(32)] },
    { name: 'pine', group: 'props', frames: [tall(PINE, 'pine')] },
    { name: 'birch', group: 'props', frames: [tall(BIRCH, 'birch')] },
    { name: 'fruit-tree', group: 'props', frames: [tall(FRUIT, 'fruit-tree')] },
    { name: 'grass', group: 'tiles', frames: [grass(1), grass(2), grass(3)] },
    { name: 'path', group: 'tiles', frames: [path(4), path(5)] },
    { name: 'trail', group: 'tiles', frames: [trail(6), trail(7)] },
    { name: 'paved', group: 'tiles', frames: [cobbles(8), cobbles(9)] },
    { name: 'ash', group: 'tiles', frames: [ashes(10), ashes(11)] },
    { name: 'palisade', group: 'props', frames: [palisade()] },
    { name: 'water', group: 'tiles', frames: [water(0), water(1)] },
    { name: 'flowers', group: 'tiles', frames: [flowers()] },
    { name: 'stone-wall', group: 'tiles', frames: [stoneWall()] },
    { name: 'crops', group: 'tiles', frames: [crops(false), crops(true)] },
    { name: 'wall-top', group: 'tiles', frames: [wallTop()] },
    { name: 'town-wall', group: 'props', frames: [townWall()] },
    { name: 'gate-tower', group: 'props', frames: [gateTower()] },
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
  pink: ['p', 'P', 'w'],
  thatch: ['n', 'N', 'y'],
};

export function roof(g, x, y, w, h, kind) {
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

export function wall(g, x, y, w, h, kind = 'plaster') {
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

export function windowAt(g, x, y, w = 6, h = 5) {
  g.rect(x, y, w, h, 'M');
  g.rect(x + 1, y + 1, w - 2, h - 2, 'a');
  g.vline(x + Math.floor(w / 2), y + 1, h - 2, 'M');
  g.set(x + 1, y + 1, 'w');
  g.hline(x, y + h, w, 'G'); // flower box
  g.set(x + 1, y + h, 'r').set(x + w - 2, y + h, 'p');
}

export function door(g, x, y, w, h) {
  g.rect(x, y, w, h, 'M');
  g.rect(x + 1, y + 1, w - 2, h - 1, 'N');
  for (let i = x + 2; i < x + w - 1; i += 2) g.vline(i, y + 2, h - 2, 'h');
  g.set(x, y, '.').set(x + w - 1, y, '.');
  g.set(x + w - 3, y + Math.floor(h / 2) + 1, 'y');
}

export function sign(g, x, y, icon) {
  g.rect(x, y, 8, 6, 'M');
  g.rect(x + 1, y + 1, 6, 4, 'n');
  g.stamp(icon, x + 2, y + 1);
}

export function flag(g, x, y, c) {
  g.vline(x, y, 7, 'M');
  g.rect(x + 1, y, 4, 3, c);
  g.set(x + 4, y + 2, '.');
}

const finishBuilding = (g) => g.outline('o');

// A house by civilisation's age: thatch and no chimney at first, tiles and a stone chimney,
// then a dormer window in the roof and flower boxes under the windows, then brick under slate
// with a smoking chimney and tall sash windows.
function house(roofKind = 'brown', age = 1) {
  if (age === 3) return brickHouse(roofKind);
  const g = new Grid(32, 32);
  if (age > 0) g.rect(22, 0, 4, 6, 'x').hline(22, 0, 4, 'X');
  roof(g, 1, 3, 30, 15, age === 0 ? 'thatch' : roofKind);
  if (age > 0) g.rect(22, 0, 4, 4, 'x').hline(21, 0, 6, 'X');
  if (age === 2) windowAt(g, 12, 8, 8, 6);
  wall(g, 3, 18, 26, 12);
  door(g, 13, 22, 6, 8);
  windowAt(g, 5, 20);
  windowAt(g, 21, 20);
  if (age === 2) for (const x of [5, 21]) g.hline(x, 25, 6, 'N').set(x + 1, 24, 'r').set(x + 3, 24, 'p').set(x + 4, 24, 'y');
  g.hline(3, 30, 26, 'X');
  return finishBuilding(g);
}

// Red brick, mortar lines staggered.
export function brick(g, x, y, w, h) {
  g.rect(x, y, w, h, 'r');
  for (let j = y + 2; j < y + h; j += 3) {
    g.hline(x, j, w, 'R');
    for (let i = x + ((j - y) % 2 ? 1 : 4); i < x + w; i += 6) g.vline(i, j - 2, 2, 'R');
  }
}

function brickHouse(roofKind) {
  const g = new Grid(32, 32);
  g.rect(22, 3, 4, 5, 'R').hline(21, 3, 6, 'X'); // the chimney
  g.disc(20, 1.5, 1.5, 'x').set(23, 1, 'z').set(18, 0, 'z'); // its smoke
  roof(g, 1, 6, 30, 12, 'slate');
  g.hline(1, 6, 30, roofKind === 'red' ? 'r' : roofKind === 'blue' ? 'b' : 'N'); // a painted ridge
  brick(g, 3, 18, 26, 12);
  door(g, 13, 22, 6, 8);
  for (const x of [5, 21]) {
    g.rect(x, 19, 6, 7, 'M').rect(x + 1, 20, 4, 5, 'a').hline(x + 1, 22, 4, 'M').set(x + 1, 20, 'w');
    g.hline(x, 26, 6, 'z'); // stone sill
  }
  g.hline(3, 30, 26, 'X');
  return finishBuilding(g);
}

export function shop() {
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

export function church() {
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

export function castle() {
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

// Smithy: stone under a slate roof, a smoking chimney and an open front glowing at the anvil.
function forge() {
  const g = new Grid(32, 32);
  g.rect(23, 0, 5, 9, 'X').hline(23, 0, 5, 'l');
  g.set(25, 0, '.').set(24, 0, '.');
  roof(g, 1, 5, 30, 12, 'slate');
  g.rect(23, 1, 5, 4, 'X');
  g.set(25, 0, 'r').set(24, 1, 'y').set(26, 1, 'r');
  wall(g, 3, 17, 26, 13, 'stone');
  // open workshop: dark interior, red glow, anvil in front
  g.rect(5, 19, 14, 11, 'k');
  g.rect(6, 25, 5, 4, 'r').rect(7, 26, 3, 2, 'y');
  g.rect(12, 26, 6, 2, 'l').rect(14, 28, 2, 2, 'l').hline(11, 26, 2, 'l');
  door(g, 21, 21, 6, 9);
  sign(g, 21, 13, ['xx..', 'xxN.', '..N.', '..N.']);
  g.hline(3, 30, 26, 'X');
  return finishBuilding(g);
}

// Barracks: a long stone hall with a red roof, shields on the wall and the crown's flags.
function barracks() {
  const g = new Grid(48, 32);
  roof(g, 1, 5, 46, 12, 'red');
  flag(g, 4, 0, 'y');
  flag(g, 42, 0, 'y');
  wall(g, 3, 17, 42, 13, 'stone');
  windowAt(g, 6, 20);
  windowAt(g, 36, 20);
  door(g, 20, 20, 8, 10);
  for (const x of [14, 30]) g.rect(x, 21, 4, 5, 'r').rect(x + 1, 22, 2, 3, 'y').set(x, 25, '.').set(x + 3, 25, '.');
  g.hline(3, 30, 42, 'l');
  return finishBuilding(g);
}

// Pleasure house: two storeys under a pink roof, red lanterns along the eaves.
function brothel() {
  const g = new Grid(32, 40);
  roof(g, 1, 3, 30, 13, 'pink');
  wall(g, 3, 16, 26, 22);
  g.hline(3, 26, 26, 'M');
  windowAt(g, 5, 18, 6, 5);
  windowAt(g, 21, 18, 6, 5);
  windowAt(g, 5, 28, 5, 5);
  door(g, 13, 29, 6, 9);
  for (const x of [4, 15, 26]) g.vline(x + 1, 16, 1, 'M').rect(x, 17, 3, 3, 'r').set(x + 1, 18, 'y');
  g.rect(13, 20, 6, 4, 'p').set(14, 21, 'w').set(16, 22, 'w');
  g.hline(3, 38, 26, 'X');
  return finishBuilding(g);
}

// Manor: the nobles' townhouse, wide and tall under a blue roof, with a gilded door.
function manor() {
  const g = new Grid(48, 40);
  roof(g, 1, 4, 46, 15, 'blue');
  flag(g, 23, 0, 'v');
  wall(g, 3, 19, 42, 19);
  g.hline(3, 28, 42, 'C');
  for (const x of [6, 14, 28, 36]) {
    windowAt(g, x, 21, 6, 5);
    windowAt(g, x, 30, 6, 5);
  }
  door(g, 20, 29, 8, 9);
  g.hline(20, 28, 8, 'y');
  g.hline(3, 38, 42, 'X');
  return finishBuilding(g);
}


// The demon lord's keep: black stone, violet spires, windows burning red.
function demonCastle() {
  const g = new Grid(48, 56);
  const dark = (x, y, w, h) => {
    g.rect(x, y, w, h, 'l');
    for (let j = y + 2; j < y + h; j += 3) {
      g.hline(x, j, w, 'k');
      for (let i = x + ((j - y) % 2 ? 2 : 5); i < x + w; i += 6) g.vline(i, j - 2, 2, 'k');
    }
    g.vline(x, y, h, 'L');
  };
  const ember = (x, y, w, h) => {
    g.rect(x, y, w, h, 'k');
    g.rect(x + 1, y + 1, w - 2, h - 1, 'D');
    g.set(x + 1, y + 1, 'y');
  };
  const spire = (cx, top, hw, h) => {
    g.tri(cx, top, hw, h, 'd');
    g.vline(cx, top, Math.floor(h / 2), 'v');
    g.set(cx, top - 1, 'D').set(cx, top - 2, 'D');
  };
  // central keep
  spire(24, 3, 7, 14);
  dark(17, 16, 14, 22);
  ember(22, 21, 4, 6);
  // side towers, leaning outward like horns
  spire(7, 11, 5, 12);
  dark(2, 22, 11, 32);
  ember(5, 28, 4, 5);
  spire(41, 11, 5, 12);
  dark(35, 22, 11, 32);
  ember(39, 28, 4, 5);
  // front wall, jagged teeth on top
  dark(10, 36, 28, 18);
  for (let x = 10; x < 38; x += 4) g.tri(x + 1, 32, 1, 4, 'l');
  // maw of a gate
  g.ellipse(24, 50, 6, 8, 'k');
  g.rect(18, 50, 12, 4, 'k');
  for (let x = 20; x < 29; x += 2) g.set(x, 43 + (x % 4 ? 1 : 0), 'z');
  g.ellipse(24, 52, 3, 2, 'D');
  g.hline(0, 54, 48, 'k');
  return finishBuilding(g);
}

// A past era's hero in stone, sword raised, on a plinth with a gold plaque.
function statue() {
  const g = new Grid(20, 36);
  // plinth
  g.rect(2, 26, 16, 9, 'x');
  g.hline(2, 26, 16, 'z');
  g.hline(1, 34, 18, 'X');
  g.rect(6, 29, 8, 3, 'y').hline(6, 31, 8, 'Y');
  // figure
  g.rect(7, 18, 6, 8, 'x'); // legs and robe
  g.vline(10, 21, 5, 'X');
  g.rect(6, 11, 8, 8, 'x'); // body
  g.hline(6, 11, 8, 'z');
  g.disc(10, 8, 3, 'x'); // head
  g.set(9, 7, 'z');
  g.rect(13, 10, 2, 4, 'x'); // raised arm
  g.vline(15, 0, 11, 'z').vline(16, 1, 9, 'x'); // sword
  g.hline(13, 10, 5, 'X'); // crossguard
  g.rect(3, 13, 3, 6, 'X'); // shield
  return g.shade(SHADE).outline('o');
}

// A pioneer's hut: log walls under a deep thatch, one small window and a low door.
function hut() {
  const g = new Grid(32, 32);
  g.tri(16, 6, 15, 15, 'n'); // the thatch, nearly to the ground
  for (let j = 9; j < 21; j += 3) g.hline(16 - Math.floor((j - 6) * 0.95), j, Math.floor((j - 6) * 1.9), 'N');
  g.set(16, 6, 'y').set(15, 7, 'y').set(17, 7, 'y');
  g.rect(5, 20, 22, 10, 'N'); // log walls
  for (let j = 22; j < 30; j += 2) g.hline(5, j, 22, 'M');
  g.vline(5, 20, 10, 'M').vline(26, 20, 10, 'M');
  door(g, 13, 23, 6, 7);
  g.rect(7, 23, 4, 3, 'M').rect(8, 24, 2, 1, 'a');
  g.rect(22, 25, 3, 3, 'h').hline(22, 25, 3, 'M'); // a woodpile
  g.hline(5, 30, 22, 'X');
  return finishBuilding(g);
}

// A townhouse a storey up: two rows of windows under a steep roof, by the age it was raised in.
function townhouse(roofKind = 'brown', age = 2) {
  const g = new Grid(32, 32);
  g.rect(23, 0, 4, 5, age === 3 ? 'R' : 'x').hline(22, 0, 6, 'X'); // the chimney
  roof(g, 2, 2, 28, 9, age === 3 ? 'slate' : roofKind);
  if (age === 3) g.hline(2, 2, 28, roofKind === 'red' ? 'r' : roofKind === 'blue' ? 'b' : 'N');
  if (age === 3) brick(g, 4, 11, 24, 19);
  else wall(g, 4, 11, 24, 19);
  if (age !== 3) {
    g.hline(4, 20, 24, 'M'); // the timber between the storeys
    for (const x of [10, 21]) g.vline(x, 11, 9, 'M');
  }
  windowAt(g, 6, 13, 5, 5);
  windowAt(g, 13, 13, 5, 5);
  windowAt(g, 21, 13, 5, 5);
  door(g, 13, 23, 6, 7);
  windowAt(g, 6, 23, 5, 5);
  windowAt(g, 21, 23, 5, 5);
  g.hline(4, 30, 24, 'X');
  return finishBuilding(g);
}

// The chief's hall, before there is a castle: a long timber hall under thatch, the clan's banner.
function hall() {
  const g = new Grid(64, 56);
  g.tri(32, 14, 31, 22, 'n');
  for (let j = 18; j < 36; j += 3) g.hline(32 - Math.floor((j - 14) * 1.4), j, Math.floor((j - 14) * 2.8), 'N');
  g.rect(2, 35, 60, 2, 'N');
  g.rect(5, 37, 54, 17, 'N');
  for (let j = 39; j < 54; j += 3) g.hline(5, j, 54, 'M');
  for (const x of [5, 18, 45, 58]) g.vline(x, 37, 17, 'M');
  g.rect(26, 40, 12, 14, 'M').rect(27, 41, 10, 13, 'h'); // the great doors
  g.vline(32, 41, 13, 'M');
  for (const x of [9, 49]) g.rect(x, 42, 6, 4, 'M').rect(x + 1, 43, 4, 2, 'r'); // firelight
  g.vline(31, 2, 13, 'M').rect(32, 2, 7, 5, 'r').set(38, 6, '.').hline(32, 4, 6, 'y'); // banner
  g.hline(4, 54, 56, 'X');
  return finishBuilding(g);
}

// A shack in the shanty: scrap planks leaning on a post, a patched cloth for a roof.
function shack() {
  const g = new Grid(16, 16);
  g.rect(2, 8, 12, 7, 'N');
  for (const x of [4, 8, 11]) g.vline(x, 8, 7, 'M');
  g.rect(6, 10, 3, 5, 'k'); // the gap for a door
  g.rect(1, 5, 14, 3, 'C').rect(3, 5, 4, 3, 'h').rect(10, 6, 3, 2, 'x'); // patched cloth
  g.hline(1, 5, 14, 'c');
  g.set(13, 4, 'M').set(13, 3, 'M');
  return finishBuilding(g);
}

// The camp's fire in the square, before the town has a church or a market around it.
function campfire() {
  const g = new Grid(16, 16);
  for (const [x, y] of [[3, 12], [6, 13], [9, 13], [12, 12]]) g.rect(x, y, 2, 2, 'x');
  g.hline(4, 14, 8, 'M').hline(5, 13, 6, 'N');
  g.tri(8, 4, 4, 9, 'r');
  g.tri(8, 7, 3, 6, 'O');
  g.tri(8, 9, 2, 4, 'y');
  return finishBuilding(g);
}

export function buildings() {
  return [
    { name: 'hut', group: 'buildings', frames: [hut()] },
    { name: 'hall', group: 'buildings', frames: [hall()] },
    { name: 'campfire', group: 'props', frames: [campfire()] },
    { name: 'shack', group: 'props', frames: [shack()] },
    ...['', '-red', '-blue'].flatMap((c) => [
      { name: `townhouse${c}`, group: 'buildings', frames: [townhouse(c ? c.slice(1) : 'brown', 2)] },
      { name: `townhouse${c}-age3`, group: 'buildings', frames: [townhouse(c ? c.slice(1) : 'brown', 3)] },
    ]),
    { name: 'house', group: 'buildings', frames: [house()] },
    { name: 'house-red', group: 'buildings', frames: [house('red')] },
    { name: 'house-blue', group: 'buildings', frames: [house('blue')] },
    ...['', '-red', '-blue'].flatMap((c) => [
      { name: `house${c}-age0`, group: 'buildings', frames: [house(c ? c.slice(1) : 'brown', 0)] },
      { name: `house${c}-age2`, group: 'buildings', frames: [house(c ? c.slice(1) : 'brown', 2)] },
      { name: `house${c}-age3`, group: 'buildings', frames: [house(c ? c.slice(1) : 'brown', 3)] },
    ]),
    { name: 'shop', group: 'buildings', frames: [shop()] },
    { name: 'inn', group: 'buildings', frames: [inn()] },
    { name: 'guild', group: 'buildings', frames: [guild()] },
    { name: 'church', group: 'buildings', frames: [church()] },
    { name: 'castle', group: 'buildings', frames: [castle()] },
    { name: 'dungeon', group: 'buildings', frames: [dungeon()] },
    { name: 'forge', group: 'buildings', frames: [forge()] },
    { name: 'barracks', group: 'buildings', frames: [barracks()] },
    { name: 'brothel', group: 'buildings', frames: [brothel()] },
    { name: 'manor', group: 'buildings', frames: [manor()] },
    { name: 'demon-castle', group: 'buildings', frames: [demonCastle()] },
    { name: 'statue', group: 'buildings', frames: [statue()] },
  ];
}
