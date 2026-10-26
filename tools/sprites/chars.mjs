// Chibi characters, 16x24. Each sheet holds 2 walk frames per facing, in the order
// down, up, side (side faces right; the game flips it for left).
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

// Seen from behind: no face, the head all hair.
const FACE_BACK = [
  '..ssssssssssss..',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '...ssssssssss...',
];
const HAIR_BACK = [
  '....55555555....',
  '...5555555555...',
  '..555555555555..',
  '..555555555555..',
  '..555555555555..',
  '..555555555555..',
  '..555555555555..',
  '..555555555555..',
  '...5555555555...',
];
const HAIR_BACK_LONG = ['...5555555555...', '...5555555555...', '...5555555555...', '....55555555....'];

// In profile, facing right: one eye, slimmer body, legs scissoring.
const BODY_SIDE = [
  '................',
  '................',
  '................',
  '................',
  '....ssssssss....',
  '...ssssssssss...',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '..ssssssssssks..',
  '..ssssssssssks..',
  '..ssssssssssssp.',
  '...sssssssssS...',
  '....ssssssss....',
  '.....111111.....',
  '.....1111111s...',
  '.....111111.....',
  '.....222222.....',
  '.....111111.....',
  '......3333......',
  '......3333......',
  '......4444......',
  '......44444.....',
  '................',
  '................',
];
const LEGS_SIDE_B = [
  '.....33..33.....',
  '....33....33....',
  '....44....44....',
  '...444.....444..',
];
const HAIR_SIDE = [
  '................',
  '................',
  '................',
  '....55555555....',
  '...5555555555...',
  '..555555555555..',
  '..5555555555.5..',
  '..555555........',
  '..5555..........',
  '..555...........',
  '...5............',
];
const HAIR_SIDE_LONG = [...HAIR_SIDE.slice(0, 10), '..555...........', '.555............', '.555............', '.55.............'];

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

const KETTLE_HELM = [
  '................',
  '................',
  '................',
  '....xxxxxxxx....',
  '...xzzxxxxxxx...',
  '..xxxxxxxxxxxx..',
  '.xxxxxxxxxxxxxx.',
  '..x..........x..',
];

const SPEAR = [
  '.............z..',
  '............zzz.',
  '............zzz.',
  '.............r..',
  ...Array(15).fill('.............N..'),
];

const FEATHER_CAP = [
  '................',
  '..........rr....',
  '.........rru....',
  '....bbbbbbbbr...',
  '...bbbbbbbbbb...',
  '..bbbbbbbbbbbb..',
  '..yyyyyyyyyyyy..',
];

const RUFF = ['...wwwwwwwwww...'];

// Hunter: a green cap with a long feather, a bow on the back and a quiver.
const HUNTER_CAP = [
  '................',
  '..............r.',
  '.............ru.',
  '....GGGGGGGGr...',
  '...GGGGGGGGGG...',
  '..GGGGGGGGGGGG..',
  '..FFFFFFFFFFFF..',
];
const BOW = [
  '............N...',
  '.............N..',
  '.............Nc.',
  '..............c.',
  '..............c.',
  '..............c.',
  '.............Nc.',
  '.............N..',
  '............N...',
];
const QUIVER = ['.MM.............', '.NN.............', '.NN.............'];

// Herder: a wide straw-brown hat and a shepherd's crook.
const SHEPHERD_HAT = [
  '................',
  '................',
  '................',
  '.....hhhhhh.....',
  '....hhhhhhhh....',
  '....GGGGGGGG....',
  '.hhhhhhhhhhhhhh.',
];
const CROOK = [
  '...........nnn..',
  '..........n...n.',
  '..............n.',
  '..............n.',
  ...Array(14).fill('..............n.'),
];

const HAMMER = [
  '..........xxxx..',
  '..........xxxx..',
  '............N...',
  '............N...',
  '............N...',
  '............N...',
];

const APRON = ['.....NNNNNN.....', '.....NNNNNN.....', '.....NNNNNN.....', '.....NNNNNN.....', '.....NNNNNN.....'];
const WHITE_APRON = APRON.map((r) => r.replaceAll('N', 'c'));

// The scholar's square cap with its gold tassel, and a red-bound book under the arm.
const SCHOLAR_CAP = [
  '................',
  '................',
  '................',
  '.llllllllllllll.',
  '....llllllll.y..',
  '....llllllll.y..',
  '.............y..',
];
const BOOK = ['..........rrrr..', '..........rccr..', '..........rccr..', '..........rrrr..'];

// The alchemist's brass goggles and a bubbling green flask; the engineer's cap and a long rule.
const GOGGLES = ['..MMMMMMMMMMMM..', '...xxxx..xxxx...', '...xakx..xkax...', '...xxxx..xxxx...'];
const FLASK = ['...........cc...', '...........cc...', '..........cvvc..', '..........vpvv..', '...........vv...'];
const ENGINEER_CAP = [
  '................',
  '................',
  '................',
  '....yyyyyyyy....',
  '...yyyyyyyyyy...',
  '..yyyyyyyyyyyy..',
  '.yyyyyyyyyyyyyy.',
];
const RULE = ['..n.............', '..n.............', '..M.............', '..n.............', '..n.............', '..M.............', '..n.............', '..n.............', '..M.............', '..n.............'];

// The elected leader: a laurel wreath, a blue sash across a cream robe, the charter in hand.
const LAUREL = ['................', '................', '...GgG....GgG...', '..GGG......GGG..', '.GG..........GG.', '.G............G.'];
const SASH = ['....bb..........', '......bb........', '........bb......'];
const CHARTER = ['..........cccc..', '..........yccy..', '..........cccc..'];

// Rulers of the other regimes: the high priest's red-and-gold robes, the merchant prince's
// top hat, gold chain and purse, and the general's epaulettes under a plumed helm.
const TOP_HAT = ['................', '.....llllll.....', '.....llllll.....', '.....llllll.....', '.....rrrrrr.....', '...llllllllll...'];
const GOLD_CHAIN = ['....y......y....', '.....yyyyyy.....'];
const PURSE = ['...........yy...', '..........yyyy..', '..........yYyy..'];
const EPAULETTES = ['..yyy......yyy..'];

const MUG = ['...........ccc..', '...........yyyc.', '...........yyyc.', '...........yyy..'];

const DRESS = ['....pppppppp....', '...pppppppppp...', '...pppppppppp...', '..pppppppppppp..', '..PPPPPPPPPPPP..'];
const HAIR_FLOWER = ['...........rr...', '..........ryyr..', '...........rr...'];
const FAN = ['...........yy...', '..........yyyy..', '..........yrry..', '...........MM...'];

// The cult's robes: the thief's hood in demon violet, and a black candle.
const CULT_HOOD = HOOD.map((row) => row.replaceAll('L', 'd').replaceAll('r', 'D'));
const CANDLE = ['............y...', '...........yry..', '............l...', '............l...', '............l...'];

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

const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));

function build({ slots, layers = [], remap = {}, back = {}, frame, facing = 'down' }) {
  const long = layers.some(([rows]) => rows === HAIR_LONG);
  let g;
  if (facing === 'up') {
    g = Grid.from(BODY, 'body').stamp(FACE_BACK, 0, 8);
    if (frame === 1) g.stamp(LEGS_B, 0, 18);
    g.stamp(HAIR_BACK, 0, 3);
    if (long) g.stamp(HAIR_BACK_LONG, 0, 12);
    // Hats and gear seen from behind sit on the other side; hair and faces are replaced above.
    for (const [rows, ox, oy] of layers) {
      if (rows === HAIR_SHORT || rows === HAIR_LONG || rows === BEARD || rows === SKULL_FACE) continue;
      g.stamp(mirror(rows), ox ?? 0, oy ?? 0);
    }
    g.remap(back);
  } else if (facing === 'side') {
    g = Grid.from(BODY_SIDE, 'body');
    if (frame === 1) g.stamp(LEGS_SIDE_B, 0, 18);
    for (const [rows, ox, oy] of layers) {
      if (rows === BEARD || rows === SKULL_FACE) continue;
      const r = rows === HAIR_SHORT ? HAIR_SIDE : rows === HAIR_LONG ? HAIR_SIDE_LONG : rows;
      g.stamp(r, ox ?? 0, oy ?? 0);
    }
  } else {
    g = Grid.from(BODY, 'body');
    if (frame === 1) g.stamp(LEGS_B, 0, 18);
    for (const [rows, ox, oy] of layers) g.stamp(rows, ox ?? 0, oy ?? 0);
  }
  g.remap(slots).remap(remap);
  return g.shade(SHADE).outline('o');
}

const FACINGS = ['down', 'up', 'side'];
const walkFrames = (make) => FACINGS.flatMap((facing) => [make(0, facing), make(1, facing)]);

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
  hunter: {
    slots: { 1: 'G', 2: 'M', 3: 'h', 4: 'M', 5: 'H' },
    layers: [[HAIR_SHORT], [HUNTER_CAP], [QUIVER, 0, 12], [BOW, 0, 9]],
  },
  herder: {
    slots: { 1: 'c', 2: 'N', 3: 'h', 4: 'M', 5: 'h' },
    layers: [[HAIR_SHORT], [SHEPHERD_HAT], [['...cccccccccc...'], 0, 13], [CROOK, 0, 3]],
  },
  thief: {
    slots: { 1: 'l', 2: 'M', 3: 'L', 4: 'l', 5: 'k' },
    layers: [[HOOD], [DAGGER, 0, 12]],
    back: { k: 'L' }, // the hood covers the whole head from behind
  },
  soldier: {
    slots: { 1: 'r', 2: 'M', 3: 'X', 4: 'M', 5: 'h' },
    layers: [[HAIR_SHORT], [KETTLE_HELM], [['...x........x...'], 0, 13], [SPEAR, 0, 1]],
  },
  noble: {
    slots: { 1: 'v', 2: 'y', 3: 'V', 4: 'M', 5: 'y' },
    layers: [[HAIR_SHORT], [FEATHER_CAP], [RUFF, 0, 13]],
  },
  blacksmith: {
    slots: { 1: 'c', 2: 'M', 3: 'M', 4: 'k', 5: 'k' },
    layers: [[HAIR_SHORT], [['..rrrrrrrrrrrr..'], 0, 6], [APRON, 0, 14], [HAMMER, 0, 9]],
  },
  innkeeper: {
    slots: { 1: 'G', 2: 'M', 3: 'N', 4: 'M', 5: 'h' },
    layers: [[HAIR_SHORT], [WHITE_APRON, 0, 15], [MUG, 0, 13]],
  },
  courtesan: {
    slots: { 1: 'p', 2: 'y', 3: 'p', 4: 'P', 5: 'H' },
    layers: [[HAIR_LONG], [HAIR_FLOWER, 0, 3], [DRESS, 0, 16], [FAN, 0, 12]],
  },
  cultist: {
    slots: { 1: 'd', 2: 'D', 3: 'd', 4: 'M', 5: 'd' },
    layers: [[CULT_HOOD], [CANDLE, 0, 10]],
    remap: { k: 'D' }, // eyes glow red under the hood
  },
  scholar: {
    slots: { 1: 'B', 2: 'y', 3: 'B', 4: 'M', 5: 'x' },
    layers: [[HAIR_SHORT], [SCHOLAR_CAP], [BEARD, 0, 10], [BOOK, 0, 13]],
  },
  alchemist: {
    slots: { 1: 'G', 2: 'M', 3: 'G', 4: 'M', 5: 'O' },
    layers: [[HAIR_LONG], [GOGGLES, 0, 6], [FLASK, 0, 12]],
  },
  engineer: {
    slots: { 1: 'N', 2: 'M', 3: 'b', 4: 'M', 5: 'h' },
    layers: [[HAIR_SHORT], [ENGINEER_CAP], [RULE, 0, 7]],
  },
  consul: {
    slots: { 1: 'c', 2: 'b', 3: 'c', 4: 'N', 5: 'h' },
    layers: [[HAIR_SHORT], [LAUREL], [SASH, 0, 13], [CHARTER, 0, 13]],
  },
  pontiff: {
    slots: { 1: 'r', 2: 'y', 3: 'r', 4: 'y', 5: 'z' },
    layers: [[HAIR_SHORT], [MITRE], [BEARD, 0, 10], [STAFF_CROSS, 0, 6]],
  },
  oligarch: {
    slots: { 1: 'v', 2: 'y', 3: 'V', 4: 'M', 5: 'H' },
    layers: [[HAIR_SHORT], [TOP_HAT], [GOLD_CHAIN, 0, 13], [PURSE, 0, 13]],
  },
  general: {
    slots: { 1: 'r', 2: 'y', 3: 'X', 4: 'M', 5: 'h' },
    layers: [[HAIR_SHORT], [HELMET], [EPAULETTES, 0, 13], [SWORD]],
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

// Children: same head size as adults (that's what makes them read as small), short body, feet on the same baseline.
const CHILD = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....hhhhhh.....',
  '....hhhhhhhh....',
  '....hssssssh....',
  '....ssssssss....',
  '....sskssksS....',
  '....sskssksS....',
  '....spssssps....',
  '.....ssSSss.....',
  '......ssss......',
  '.....GGGGGG.....',
  '....sGGGGGGs....',
  '.....GGyyGG.....',
  '.....GGGGGG.....',
  '.....NN..NN.....',
  '................',
  '................',
];
const CHILD_LEGS_B = ['.....NN..GG.....', '..........NN....'];
const CHILD_BACK = ['....hhhhhhhh....', '....hhhhhhhh....', '....hhhhhhhh....', '....hhhhhhhh....', '.....hhhhhh.....', '.....ssssss.....'];
const CHILD_SIDE = [
  '.....hhhhhh.....',
  '....hhhhhhhh....',
  '....hhhhhssh....',
  '....hhhsssss....',
  '....hhssssks....',
  '....hsssssks....',
  '....sssssssp....',
  '.....sssSss.....',
  '......ssss......',
  '......GGGG......',
  '......GGGGs.....',
  '......GyyG......',
  '......GGGG......',
  '......NNN.......',
];
const CHILD_SIDE_LEGS_B = ['.....NN.NN......'];

function child(frame, facing = 'down') {
  const g = Grid.from(CHILD, 'child');
  if (facing === 'side') {
    g.stamp(Array(14).fill('________________'), 0, 8).stamp(CHILD_SIDE, 0, 8);
    if (frame === 1) g.stamp(CHILD_SIDE_LEGS_B, 0, 21);
  } else {
    if (facing === 'up') g.stamp(CHILD_BACK, 0, 10);
    if (frame === 1) g.stamp(CHILD_LEGS_B, 0, 20);
  }
  return g.shade(SHADE).outline('o');
}

export function characters() {
  return [
    ...Object.entries(JOBS).map(([name, def]) => ({
      name,
      group: 'characters',
      frames: walkFrames((frame, facing) => build({ ...def, frame, facing })),
    })),
    { name: 'child', group: 'characters', frames: walkFrames(child) },
  ];
}

// Enemy soldiers in a war: our soldier's side-on march in dark tunics and red helmets.
export function raiders() {
  const f = (frame) => build({ ...JOBS.soldier, frame, facing: FACINGS[2] }).remap({ r: 'l', u: 'L', R: 'k', X: 'R', x: 'r', z: 'u' });
  return [{ name: 'raider', group: 'monsters', frames: [f(0), f(1)] }];
}

export function bodyMonsters() {
  return Object.entries(MONSTERS_FROM_BODY).map(([name, def]) => ({
    name,
    group: 'monsters',
    frames: [build({ ...def, frame: 0 }), build({ ...def, frame: 1 })],
  }));
}
