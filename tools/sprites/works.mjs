// The crown's building works: new buildings for the royal plots, grander versions of old ones,
// the scaffolding that stands while they go up, and the sign on an empty plot.
import { Grid } from './lib.mjs';
import { door, roof, sign, wall } from './world.mjs';

const finish = (g) => g.outline('o');

// A round stone silo with a conical roof beside a small barn, sacks stacked at the door.
function granary() {
  const g = new Grid(32, 32);
  g.tri(9.5, 1, 8, 9, 'O');
  g.hline(2, 10, 16, 'Q');
  wall(g, 3, 11, 14, 19, 'stone');
  g.rect(8, 15, 4, 4, 'k').rect(9, 16, 2, 2, 'y'); // hatch, grain glinting
  roof(g, 15, 10, 16, 9, 'orange');
  wall(g, 17, 19, 13, 11);
  door(g, 20, 22, 6, 8);
  for (const [x, y] of [[1, 26], [4, 27], [27, 26]]) g.rect(x, y, 3, 3, 'C').set(x + 1, y, 'c').set(x + 1, y + 1, 'Y');
  g.hline(1, 30, 30, 'X');
  return finish(g);
}

// The gate tower rebuilt taller, a wooden archers' gallery and the crown's red banner on top.
function watchtower() {
  const g = new Grid(16, 40);
  g.vline(8, 0, 6, 'M').rect(9, 0, 5, 3, 'r').set(13, 2, '.');
  g.tri(7.5, 4, 8, 7, 'r');
  g.hline(0, 10, 16, 'R');
  g.rect(0, 11, 16, 5, 'N'); // gallery
  for (const x of [1, 5, 9, 13]) g.vline(x, 11, 5, 'M');
  g.set(3, 12, 'k').set(11, 12, 'k'); // archers' loops
  g.hline(0, 16, 16, 'M');
  wall(g, 1, 17, 14, 22, 'stone');
  g.rect(6, 21, 4, 6, 'k').set(6, 21, 'X').set(9, 21, 'X');
  g.hline(1, 39, 14, 'l');
  return finish(g);
}

// A sanded yard behind a rail fence: straw dummies, a weapon rack and a target.
function yard() {
  const g = new Grid(32, 32);
  g.rect(1, 6, 30, 24, 't');
  for (let i = 0; i < 14; i++) g.set(3 + i * 2, 8 + ((i * 5) % 20), 'T');
  // rail fence round three sides
  g.hline(0, 5, 32, 'N').hline(0, 30, 32, 'N');
  g.vline(0, 5, 26, 'N').vline(31, 5, 26, 'N');
  for (const x of [0, 8, 16, 24, 31]) g.vline(x, 3, 4, 'M').vline(x, 28, 3, 'M');
  // two dummies
  for (const x of [7, 15]) {
    g.vline(x + 1, 11, 12, 'M');
    g.hline(x - 2, 14, 7, 'M');
    g.ellipse(x + 1.5, 16, 3, 4, 'y');
    g.disc(x + 1.5, 10, 2.2, 'n').set(x + 1, 10, 'k');
  }
  // target on a stand
  g.disc(25, 13, 4, 'w').disc(25, 13, 3, 'r').disc(25, 13, 1.6, 'w').set(25, 13, 'r');
  g.vline(25, 17, 6, 'M');
  // weapon rack
  g.hline(19, 25, 10, 'M');
  for (const x of [20, 23, 26]) g.vline(x, 21, 5, 'z').set(x, 20, 'x');
  return finish(g);
}

// Poles and planks over a site while the work goes up.
function scaffold() {
  const g = new Grid(32, 32);
  for (const x of [2, 15, 29]) g.vline(x, 4, 27, 'N');
  for (const y of [8, 17, 26]) g.hline(1, y, 30, 'n').hline(1, y + 1, 30, 'M');
  for (let i = 0; i < 9; i++) g.set(3 + i, 17 - i, 'M').set(16 + i, 26 - i, 'M');
  g.rect(20, 27, 6, 3, 'x').hline(20, 27, 6, 'z'); // stone blocks waiting
  g.rect(5, 28, 7, 2, 'N'); // a stack of planks
  return finish(g);
}

// A signpost on an empty royal plot, the crown painted on the board.
function lot() {
  const g = new Grid(16, 16);
  g.vline(7, 6, 10, 'M');
  sign(g, 4, 2, ['y.y.', 'yyyy', 'yyyy', '....']);
  g.set(3, 15, 'G').set(10, 14, 'G').set(12, 15, 'G');
  return finish(g);
}

export function works() {
  return [
    { name: 'granary', group: 'buildings', frames: [granary()] },
    { name: 'watchtower', group: 'buildings', frames: [watchtower()] },
    { name: 'yard', group: 'buildings', frames: [yard()] },
    { name: 'scaffold', group: 'buildings', frames: [scaffold()] },
    { name: 'lot', group: 'props', frames: [lot()] },
  ];
}

