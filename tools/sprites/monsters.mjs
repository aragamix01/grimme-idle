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

// Fill a polygon (even-odd rule, pixel centres).
function poly(g, pts, c) {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) g.set(x, y, c);
    }
}

// A straight line of pixels.
function line(g, [x0, y0], [x1, y1], c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

// A red dragon in flight, 40x32, facing right; the bat wings beat up and down between frames.
function dragon(frame) {
  const g = new Grid(40, 32);
  const shoulder = [21, 14];
  // Wing: bones fan out from the shoulder to three tips, membrane scalloped between them.
  const tips = frame === 0 ? [[4, 1], [12, 0], [21, 1]] : [[3, 27], [10, 30], [18, 29]];
  const notch = frame === 0 ? [[8, 7], [16, 6]] : [[7, 24], [14, 25]];
  poly(g, [shoulder, tips[2], notch[1], tips[1], notch[0], tips[0], frame === 0 ? [12, 14] : [12, 17]], 'R');
  for (const t of tips) line(g, shoulder, t, 'Q');
  g.ellipse(18, 17, 9, 4.5, 'r'); // body
  g.hline(11, 20, 13, 'y').hline(13, 21, 9, 'y'); // belly
  for (let i = 0; i < 10; i++) g.rect(9 - i, 17 + Math.round(i * 0.5), 2, 2, 'r'); // tail
  poly(g, [[0, 21], [2, 18], [3, 23]], 'R'); // tail spade
  g.rect(25, 10, 4, 7, 'r'); // neck
  g.ellipse(31, 10, 5, 3.2, 'r'); // head
  g.rect(33, 10, 5, 3, 'r').hline(34, 13, 4, 'y'); // snout, jaw
  g.set(32, 8, 'y').set(33, 8, 'k'); // eye
  g.set(29, 6, 'z').set(28, 5, 'z').set(31, 6, 'z').set(31, 5, 'z'); // horns
  for (const x of [14, 21]) g.vline(x, 21, 3, 'R').set(x + 1, 23, 'z'); // claws
  for (const x of [13, 17, 21, 25]) g.set(x, 12, 'u'); // spine
  if (frame === 0) g.set(38, 11, 'O').set(39, 11, 'y').set(39, 12, 'O'); // a lick of flame
  return g.shade(SHADE).outline('o');
}

export function monsters() {
  return [
    { name: 'slime', group: 'monsters', frames: [finish(SLIME_A, 'slime'), finish(SLIME_B, 'slimeB')] },
    { name: 'bat', group: 'monsters', frames: [finish(BAT_A, 'bat'), finish(BAT_B, 'batB')] },
    { name: 'wolf', group: 'monsters', frames: [finish(WOLF_A, 'wolf'), finish(WOLF_B, 'wolfB')] },
    { name: 'demon-lord', group: 'monsters', frames: [finish(DEMON_A, 'demon'), finish(DEMON_B, 'demonB')] },
    { name: 'dragon', group: 'monsters', frames: [dragon(0), dragon(1)] },
  ];
}
