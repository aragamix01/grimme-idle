// The crown's building works: new buildings for the royal plots, grander versions of old ones,
// the scaffolding that stands while they go up, and the sign on an empty plot.
import { Grid } from './lib.mjs';
import { castle, church, door, flag, roof, shop, sign, wall, windowAt } from './world.mjs';

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

// The church rebuilt as a cathedral: blue roofs, a gilded spire and two side towers.
function cathedral() {
  const g = church().remap({ X: 'B', l: 'B', x: 'b' });
  for (const x of [1, 24]) {
    g.tri(x + 3.5, 10, 4, 10, 'b');
    wall(g, x, 20, 7, 12, 'plaster');
    g.rect(x + 2, 23, 3, 5, 'a').set(x + 2, 23, 'w');
    g.set(x + 3, 8, 'y').set(x + 3, 9, 'y').set(x + 2, 9, 'y').set(x + 4, 9, 'y');
  }
  g.rect(14, 0, 4, 2, 'y');
  return finish(g);
}

// The shop grown into a market hall: an orange roof, a second awning and the merchants' flag.
function marketHall() {
  const g = shop().remap({ r: 'O', R: 'Q', u: 'n' });
  for (let i = 0; i < 8; i++) g.vline(20 + i, 15, 2, i % 4 < 2 ? 'G' : 'c');
  for (const [x, y] of [[2, 28], [26, 28]]) g.rect(x, y, 4, 2, 'N').set(x + 1, y, 'r').set(x + 2, y, 'y');
  flag(g, 26, 0, 'g');
  return finish(g);
}

// The castle gilded into a palace: golden roofs and a banner on every tower.
function palace() {
  const g = castle().remap({ b: 'y', B: 'Y' });
  flag(g, 8, 0, 'p');
  flag(g, 55, 0, 'p');
  for (let x = 14; x < 50; x += 6) g.set(x, 36, 'y').set(x, 37, 'Y');
  return finish(g);
}

// A schoolhouse with a bell cupola, tall windows either side and an open book over the door.
function school() {
  const g = new Grid(32, 32);
  g.tri(15.5, 0, 4, 3, 'R');
  g.rect(13, 3, 6, 4, 'c').rect(15, 4, 2, 2, 'y'); // the bell
  roof(g, 1, 6, 30, 10, 'red');
  wall(g, 2, 16, 28, 14);
  windowAt(g, 4, 19);
  windowAt(g, 22, 19);
  door(g, 13, 22, 6, 8);
  sign(g, 12, 15, ['cccc', 'cMMc', 'cccc', 'BBBB']);
  g.hline(1, 30, 30, 'X');
  return finish(g);
}

// A slim stone clock tower with a blue spire and a big cream face, on a plaza of flagstones.
function clocktower() {
  const g = new Grid(32, 32);
  g.rect(2, 26, 28, 5, 'x');
  for (let x = 4; x < 30; x += 5) g.vline(x, 26, 5, 'X');
  g.tri(15.5, 0, 6, 7, 'b');
  g.set(15, 0, 'y').set(16, 0, 'y');
  wall(g, 10, 7, 12, 21, 'stone');
  g.disc(15.5, 12.5, 4.2, 'c');
  g.set(15, 10, 'k').set(15, 11, 'k').set(15, 12, 'k').set(16, 12, 'k').set(17, 12, 'k'); // hands at three
  for (const [x, y] of [[15, 9], [19, 12], [15, 16], [12, 12]]) g.set(x, y, 'Y');
  g.rect(13, 21, 6, 7, 'k').rect(14, 22, 4, 6, 'N');
  return finish(g);
}

// A tall timber print shop: a slate roof, a window showing the press, and a sheet of paper on the sign.
function press() {
  const g = new Grid(32, 32);
  roof(g, 2, 3, 28, 11, 'slate');
  g.rect(22, 0, 3, 5, 'X').set(23, 0, 'l'); // the chimney
  wall(g, 3, 14, 26, 16);
  for (const x of [3, 15, 28]) g.vline(x, 14, 16, 'M');
  g.hline(3, 21, 26, 'M');
  windowAt(g, 5, 16, 8, 6);
  g.rect(7, 18, 4, 2, 'X'); // the press inside
  door(g, 19, 22, 6, 8);
  sign(g, 17, 14, ['cccc', 'cXXc', 'cccc', 'cXXc']);
  for (const [x, y] of [[4, 27], [8, 28]]) g.rect(x, y, 3, 2, 'c').set(x + 1, y, 'C');
  g.hline(1, 30, 30, 'X');
  return finish(g);
}

export function works() {
  return [
    { name: 'granary', group: 'buildings', frames: [granary()] },
    { name: 'watchtower', group: 'buildings', frames: [watchtower()] },
    { name: 'yard', group: 'buildings', frames: [yard()] },
    { name: 'scaffold', group: 'buildings', frames: [scaffold()] },
    { name: 'lot', group: 'props', frames: [lot()] },
    { name: 'cathedral', group: 'buildings', frames: [cathedral()] },
    { name: 'market-hall', group: 'buildings', frames: [marketHall()] },
    { name: 'palace', group: 'buildings', frames: [palace()] },
    { name: 'school', group: 'buildings', frames: [school()] },
    { name: 'clocktower', group: 'buildings', frames: [clocktower()] },
    { name: 'press', group: 'buildings', frames: [press()] },
  ];
}

