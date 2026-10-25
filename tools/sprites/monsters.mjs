import { Grid } from './lib.mjs';
import { SHADE } from './palette.mjs';

const finish = (rows, name) => Grid.from(rows, name).shade(SHADE).outline('o');

const SLIME_A = [
  '................',
  '................',
  '................',
  '................',
  '......pppp......',
  '....pppppppp....',
  '...pwwppppppp...',
  '..ppwppppppppp..',
  '..pppppppppppp..',
  '.pppkppppppkppp.',
  '.pppkppppppkppp.',
  '.ppppppPPpppppp.',
  '.pppppppppppppp.',
  '..pppppppppppp..',
  '................',
  '................',
];

const SLIME_B = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....pppppp.....',
  '...pwwppppppp...',
  '..ppwppppppppp..',
  '.pppppppppppppp.',
  '.pppkppppppkppp.',
  'ppppkppppppkpppp',
  'pppppppPPppppppp',
  'pppppppppppppppp',
  '.pppppppppppppp.',
  '................',
  '................',
];

const BAT_A = [
  '................',
  '................',
  '.v............v.',
  '.vv..........vv.',
  '.vvv..vvvv..vvv.',
  '.vvvvvvvvvvvvvv.',
  '..vvvvrvvrvvvv..',
  '...vvvvvvvvvv...',
  '.....vwvvwv.....',
  '......vvvv......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const BAT_B = [
  '................',
  '................',
  '................',
  '................',
  '......v..v......',
  '.....vvvvvv.....',
  '..vvvvrvvrvvvv..',
  '.vvvvvvvvvvvvvv.',
  '.vvv.vwvvwv.vvv.',
  '.vv...vvvv...vv.',
  '.v............v.',
  '................',
  '................',
  '................',
  '................',
  '................',
];

export const WOLF_A = [
  '........................',
  '........................',
  '........................',
  '....L.L.................',
  '....LLLL.............LL.',
  '...LLkLLL...........LLL.',
  '.LLLLLLLLLLLLLLLLLLLLL..',
  '.kLLLLLLLLLLLLLLLLLLLL..',
  '..wLLLcLLLLLLLLLLLLLLLL.',
  '...LLccccccccccLLLLLL...',
  '....LLL.......LLLL......',
  '....LL.L......LL.L......',
  '....LL.L......LL.L......',
  '...kk.kk.....kk.kk......',
  '........................',
  '........................',
];

export const WOLF_B = [
  ...WOLF_A.slice(0, 10),
  '....LLL.......LLLL......',
  '...LL...L....LL...L.....',
  '..LL.....L..LL.....L....',
  '..kk.....kk.kk.....kk...',
  '........................',
  '........................',
];

// Demon lord, 32x32: horned, cloaked, the one boss the world can spawn.
const DEMON_A = [
  '................................',
  '....z......................z....',
  '....zz....................zz....',
  '....zx....................xz....',
  '.....zx..................xz.....',
  '.....zxx....dddddddd....xxz.....',
  '......zxxddddddddddddddxxz......',
  '.......xddddddddddddddddx.......',
  '........dddddddddddddddd........',
  '.......dddDDDddddddDDDddd.......',
  '.......ddDDyDDddddDDyDDdd.......',
  '.......dddDDDddddddDDDddd.......',
  '.......dddddddddddddddddd.......',
  '........ddddwdwwdwdddddd........',
  '.........dddddddddddddd.........',
  '......yyyyyyyyyyyyyyyyyyyy......',
  '....ddddyDDDDDDDDDDDDDDyddddd...',
  '...dddddyDDDDDDDDDDDDDDydddddd..',
  '..ddddddyDDDDDyyDDDDDDDyddddddd.',
  '..ddddddyDDDDDyyDDDDDDDyddddddd.',
  '..ddddddyDDDDDDDDDDDDDDyddddddd.',
  '..dddddddyyyyyyyyyyyyyyddddddd..',
  '..dddddddDDDDDDDDDDDDDDddddddd..',
  '..ddddddDDDDDDDDDDDDDDDDdddddd..',
  '...dddddDDDDDDDDDDDDDDDDddddd...',
  '...ddddDDDDDDDDDDDDDDDDDDdddd...',
  '...ddddDDDDDDDDDDDDDDDDDDdddd...',
  '....dddDDDDDDDDDDDDDDDDDDddd....',
  '....dddDDDDDDdddddDDDDDDDddd....',
  '.....ddd...kkkk..kkkk....dd.....',
  '................................',
  '................................',
];

// Cape billows out one pixel on the second frame.
const DEMON_B = DEMON_A.map((row, y) => (y >= 16 && y <= 28 ? '.' + row.slice(0, -2) + row.at(-2) : row));

export function monsters() {
  return [
    { name: 'slime', group: 'monsters', frames: [finish(SLIME_A, 'slime'), finish(SLIME_B, 'slimeB')] },
    { name: 'bat', group: 'monsters', frames: [finish(BAT_A, 'bat'), finish(BAT_B, 'batB')] },
    { name: 'wolf', group: 'monsters', frames: [finish(WOLF_A, 'wolf'), finish(WOLF_B, 'wolfB')] },
    { name: 'demon-lord', group: 'monsters', frames: [finish(DEMON_A, 'demon'), finish(DEMON_B, 'demonB')] },
  ];
}
