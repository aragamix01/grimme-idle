// Chibi characters, 16x24, front-facing, 2 walk frames.
// Built from a flat body template plus layers; slots 1-5 are recoloured per job,
// then shading and outline are applied automatically so every sprite matches.
import { Grid } from './lib.mjs';
import { SHADE } from './palette.mjs';

const BODY = [
  '................',
  '................',
  '................',
  '................',
  '....ssssssss....',
  '...ssssssssss...',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '..ssskssssksss..',
  '..ssskssssksss..',
  '..spssssssssps..',
  '...ssssSSssss...',
  '....ssssssss....',
  '....11111111....',
  '...s11111111s...',
  '...s11111111s...',
  '....22222222....',
  '....11111111....',
  '....33....33....',
  '....33....33....',
  '....44....44....',
  '...444....444...',
  '................',
  '................',
];

// Second walk frame: left foot lifted.
const LEGS_B = [
  '....33....33....',
  '....44....33....',
  '...444....44....',
  '..........444...',
];

const HAIR_SHORT = [
  '................',
  '................',
  '................',
  '....55555555....',
  '...5555555555...',
  '..555555555555..',
  '..5555.5555.55..',
  '..5..........5..',
  '..5..........5..',
];

const HAIR_LONG = [
  ...HAIR_SHORT.slice(0, 7),
  '..5..........5..',
  '.55..........55.',
  '.55..........55.',
  '.55..........55.',
  '.55..........55.',
  '..55........55..',
  '..55........55..',
];

const MAGE_HAT = [
  '.........vvv....',
  '.......vvvv.....',
  '......vvvvv.....',
  '.....vvvvvv.....',
  '....vvvvvvvv....',
  '....yyyyyyyy....',
  '.vvvvvvvvvvvvvv.',
];

const CROWN = [
  '................',
  '....y..yy..y....',
  '....yy.yy.yy....',
  '....yyyyyyyy....',
  '....yryyyyby....',
];

const BEARD = [
  '..c..........c..',
  '..ccc......ccc..',
  '...cccccccccc...',
  '.....cccccc.....',
];

const HELMET = [
  '................',
  '.......rr.......',
  '......rrr.......',
  '....xxxxxxxx....',
  '...xxxxxxxxxx...',
  '..xxxxxxxxxxxx..',
  '..yyyyyyyyyyyy..',
  '..x..........x..',
  '..x..........x..',
];

const STRAW_HAT = [
  '................',
  '................',
  '................',
  '.....nnnnnn.....',
  '....nnnnnnnn....',
  '....rrrrrrrr....',
  '.nnnnnnnnnnnnnn.',
];

const CAP = [
  '................',
  '................',
  '................',
  '....GGGGGGGG....',
  '...GGGGGGGGGG...',
  '..GGGGGGGGGGGG..',
  '..yyyyyyyyyyyy..',
];

const HOOD = [
  '................',
  '................',
  '................',
  '....LLLLLLLL....',
  '...LLLLLLLLLL...',
  '..LLLLLLLLLLLL..',
  '..LLLLLLLLLLLL..',
  '..LL........LL..',
  '..L..........L..',
  '..L..........L..',
  '..L..........L..',
  '...L........L...',
  '...rrrrrrrrrr...',
];

const MITRE = [
  '................',
  '......cccc......',
  '.....cccccc.....',
  '.....ccyycc.....',
  '....ccyyyycc....',
  '....cccyyccc....',
];

const SWORD = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.............z..',
  '.............zx.',
  '.............zx.',
  '.............zx.',
  '.............zx.',
  '.............zx.',
  '.............zx.',
  '.............zx.',
  '.............zx.',
  '............yyy.',
  '.............M..',
];

const SHIELD = [
  '.bbbb...........',
  '.byyb...........',
  '.byyb...........',
  '.bbbb...........',
  '..bb............',
];

const STAFF_GEM = [
  '..w.............',
  '.aaa............',
  '..a.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
  '..N.............',
];

const STAFF_CROSS = [
  '..y.............',
  '.yyy............',
  '..y.............',
  ...STAFF_GEM.slice(3),
];

const SCEPTER = [
  '.rrr............',
  '.rur............',
  '..y.............',
  '..y.............',
  '..y.............',
  '..y.............',
  '..y.............',
  '..y.............',
  '..y.............',
  '..y.............',
];

const HOE = [
  '...........xxx..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
];

const COIN_BAG = [
  '............Y...',
  '...........yyy..',
  '..........yyyyy.',
  '..........yyYyy.',
  '...........yyy..',
];

const DAGGER = [
  '.............z..',
  '.............z..',
  '............yyy.',
];

const CLUB = [
  '............NN..',
  '............NNN.',
  '............NNN.',
  '.............N..',
  '.............N..',
  '.............N..',
  '.............N..',
];

const GOBLIN_EARS = [
  '.g............g.',
  '.gg..........gg.',
];

const SKULL_FACE = [
  '....kk....kk....',
  '....kk....kk....',
  '.......kk.......',
  '.....kzkzkz.....',
];

const RIBS = [
  '....zxzxzxzx....',
  '...zzxzxzxzxz...',
];

function build({ slots, layers = [], remap = {}, frame }) {
  const g = Grid.from(BODY, 'body');
  if (frame === 1) g.stamp(LEGS_B, 0, 18);
  for (const [rows, ox, oy] of layers) g.stamp(rows, ox ?? 0, oy ?? 0);
  g.remap(slots).remap(remap);
  return g.shade(SHADE).outline('o');
}

const JOBS = {
  swordsman: {
    slots: { 1: 'r', 2: 'M', 3: 'h', 4: 'M', 5: 'h' },
    layers: [[HAIR_SHORT], [['..bbbbbbbbbbbb..'], 0, 6], [SWORD]],
  },
  mage: {
    slots: { 1: 'v', 2: 'y', 3: 'v', 4: 'V', 5: 'p' },
    layers: [[HAIR_LONG], [MAGE_HAT], [STAFF_GEM, 0, 6]],
  },
  merchant: {
    slots: { 1: 'n', 2: 'M', 3: 'G', 4: 'M', 5: 'h' },
    layers: [[HAIR_SHORT], [CAP], [COIN_BAG, 0, 14]],
  },
  farmer: {
    slots: { 1: 'b', 2: 'B', 3: 'b', 4: 'M', 5: 'Y' },
    layers: [[HAIR_SHORT], [STRAW_HAT], [HOE, 0, 3]],
  },
  thief: {
    slots: { 1: 'l', 2: 'M', 3: 'L', 4: 'l', 5: 'k' },
    layers: [[HOOD], [DAGGER, 0, 12]],
  },
  priest: {
    slots: { 1: 'c', 2: 'y', 3: 'c', 4: 'N', 5: 'h' },
    layers: [[HAIR_SHORT], [MITRE], [STAFF_CROSS, 0, 6]],
  },
  king: {
    slots: { 1: 'r', 2: 'y', 3: 'r', 4: 'M', 5: 'C' },
    layers: [[HAIR_SHORT], [CROWN], [['....cccccccc....'], 0, 13], [BEARD, 0, 10], [SCEPTER, 0, 7]],
  },
  hero: {
    slots: { 1: 'b', 2: 'M', 3: 'B', 4: 'M', 5: 'y' },
    layers: [[HAIR_SHORT], [HELMET], [['....xxxxxxxx....'], 0, 13], [SWORD], [SHIELD, 0, 13]],
  },
};

const MONSTERS_FROM_BODY = {
  goblin: {
    slots: { 1: 'h', 2: 'M', 3: 'g', 4: 'G', 5: 'h' },
    layers: [[GOBLIN_EARS, 0, 7], [CLUB, 0, 8]],
    remap: { s: 'g', S: 'G', p: 'G', k: 'D' },
  },
  skeleton: {
    slots: { 1: 'z', 2: 'x', 3: 'z', 4: 'x', 5: 'z' },
    layers: [[SKULL_FACE, 0, 8], [RIBS, 0, 14], [SWORD]],
    remap: { s: 'z', S: 'x', p: 'z' },
  },
};

export function characters() {
  return Object.entries(JOBS).map(([name, def]) => ({
    name,
    group: 'characters',
    frames: [build({ ...def, frame: 0 }), build({ ...def, frame: 1 })],
  }));
}

export function bodyMonsters() {
  return Object.entries(MONSTERS_FROM_BODY).map(([name, def]) => ({
    name,
    group: 'monsters',
    frames: [build({ ...def, frame: 0 }), build({ ...def, frame: 1 })],
  }));
}
