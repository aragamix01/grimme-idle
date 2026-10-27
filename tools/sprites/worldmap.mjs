// The world map's own pieces: terrain the town map lacks, realm castles and our walled town.
import { Grid } from './lib.mjs';
import { SHADE } from './palette.mjs';

const done = (g) => g.shade(SHADE).outline('o');

function mountain() {
  const g = new Grid(16, 16);
  g.tri(8, 1, 7, 14, 'x');
  g.tri(8, 1, 3, 5, 'z');
  g.vline(8, 3, 12, 'X');
  g.tri(12, 7, 3, 8, 'X');
  return done(g);
}

function sand(seed) {
  const g = new Grid(16, 16, 't');
  const dots = [[3, 4], [11, 2], [7, 9], [13, 12], [2, 13], [9, 14]];
  dots.forEach(([x, y], i) => (i + seed) % 2 === 0 && g.set(x, y, 'T').set(x + 1, y, 'n'));
  g.hline(1, 7 + seed, 5, 'T');
  return g;
}

// A neighbour's keep: stone towers; the flag is drawn apart so it can be tinted per realm.
function castle() {
  const g = new Grid(24, 24);
  g.rect(3, 9, 18, 13, 'x');
  for (const x of [2, 15]) {
    g.rect(x, 5, 7, 17, 'x');
    for (let i = x; i < x + 7; i += 2) g.set(i, 4, 'x');
    g.rect(x + 2, 9, 3, 4, 'k');
  }
  g.rect(9, 14, 6, 8, 'k').ellipse(12, 14, 3, 2, 'k');
  for (let y = 11; y < 22; y += 3) g.hline(3, y, 18, 'X');
  g.vline(12, 0, 9, 'M');
  return done(g);
}

function flag() {
  const g = new Grid(8, 6);
  g.rect(0, 0, 7, 5, 'w');
  g.set(6, 4, '.').set(5, 4, 'c');
  return g.outline('o');
}

// Home on the map: a ring wall around red and blue roofs with the castle peeking over.
function town() {
  const g = new Grid(32, 24);
  g.rect(2, 6, 28, 16, 'x');
  g.rect(4, 8, 24, 12, 'g');
  for (let x = 2; x < 30; x += 3) g.set(x, 5, 'x');
  g.rect(6, 9, 6, 3, 'r').rect(6, 12, 6, 3, 'c');
  g.rect(19, 9, 6, 3, 'b').rect(19, 12, 6, 3, 'c');
  g.rect(12, 14, 8, 3, 'O').rect(12, 17, 8, 3, 'c');
  g.rect(13, 1, 6, 8, 'x').tri(16, 0, 3, 3, 'b');
  g.rect(14, 19, 4, 3, 'k');
  for (let y = 9; y < 22; y += 4) g.hline(2, y, 2, 'X').hline(28, y, 2, 'X');
  g.set(16, 0, 'y');
  return done(g);
}

// A region's own map: the works raised on its land.
// A mine's mouth in a rock face, with a cart on its rails.
function mine() {
  const g = new Grid(16, 16);
  g.tri(8, 1, 7, 12, 'x');
  g.ellipse(8, 10, 3, 3, 'k').rect(5, 10, 7, 3, 'k');
  g.vline(4, 8, 5, 'N').vline(12, 8, 5, 'N').hline(4, 7, 9, 'N');
  g.hline(1, 14, 14, 'M');
  g.rect(10, 11, 5, 3, 'X').set(11, 11, 'y').set(13, 11, 'y');
  return done(g);
}

// Cut logs stacked beside a stump and its axe.
function logs() {
  const g = new Grid(16, 12);
  for (const [x, y] of [[1, 7], [6, 7], [3.5, 3]]) {
    const cx = Math.round(x);
    g.rect(cx, y, 9, 4, 'N').ellipse(cx, y + 1, 1, 1, 'n').set(cx, y + 1, 'T');
  }
  g.rect(13, 6, 3, 5, 'M').vline(14, 2, 4, 'h').rect(13, 1, 2, 2, 'x');
  return done(g);
}

// A fishing boat with its sail up.
function boat() {
  const g = new Grid(16, 14);
  g.rect(2, 10, 13, 3, 'N').hline(3, 13, 11, 'M');
  g.vline(8, 1, 9, 'M');
  g.tri(5, 2, 3, 7, 'c');
  g.rect(9, 3, 4, 5, 'w');
  return done(g);
}

// A settler's hut with a thatch roof.
function hut() {
  const g = new Grid(16, 16);
  g.rect(3, 8, 10, 7, 'n');
  g.tri(8, 2, 7, 7, 'y');
  g.hline(1, 8, 14, 'Y');
  g.rect(7, 11, 3, 4, 'M').rect(4, 10, 2, 2, 'i');
  return done(g);
}

export function worldmap() {
  return [
    { name: 'wm-mountain', group: 'worldmap', frames: [mountain()] },
    { name: 'wm-sand', group: 'worldmap', frames: [sand(0), sand(1)] },
    { name: 'wm-castle', group: 'worldmap', frames: [castle()] },
    { name: 'wm-flag', group: 'worldmap', frames: [flag()] },
    { name: 'wm-town', group: 'worldmap', frames: [town()] },
    { name: 'rm-mine', group: 'worldmap', frames: [mine()] },
    { name: 'rm-logs', group: 'worldmap', frames: [logs()] },
    { name: 'rm-boat', group: 'worldmap', frames: [boat()] },
    { name: 'rm-hut', group: 'worldmap', frames: [hut()] },
  ];
}
