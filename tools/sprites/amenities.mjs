// The town's public places (amenities.ts): the grand square and its fountain, the bathhouse, the
// theatre, and the parks with their lawns, gravel walks, flower beds and benches.
import { Grid, rng } from './lib.mjs';
import { cobbles, door, flag, roof, wall, windowAt } from './world.mjs';

const finish = (g) => g.outline('o');

// A round stone basin, a pillar in the middle and water arcing from its top.
function fountain() {
  const g = new Grid(32, 32);
  g.ellipse(16, 23, 15, 8, 'x');
  g.ellipse(16, 23, 12, 6, 'a');
  for (const [x, y] of [[9, 22], [20, 25], [14, 26]]) g.hline(x, y, 3, 'A');
  g.hline(4, 28, 24, 'X');
  g.rect(14, 9, 4, 14, 'z').vline(17, 9, 14, 'x');
  g.ellipse(16, 9, 5, 2, 'x').hline(12, 9, 9, 'z');
  // the spray
  g.set(16, 2, 'i').set(15, 3, 'i').set(17, 3, 'i').set(16, 4, 'w');
  for (let k = 0; k < 6; k++) g.set(13 - k, 5 + k * 2, 'i').set(19 + k, 5 + k * 2, 'i');
  g.set(16, 6, 'a').set(16, 7, 'w');
  return finish(g);
}

// For the works list: cobbles round a little fountain, with planters at the corners.
function plaza() {
  const g = new Grid(32, 32);
  for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) g.layer(cobbles(x + y + 11), x, y);
  g.ellipse(16, 18, 8, 5, 'x').ellipse(16, 18, 6, 3, 'a');
  g.rect(15, 9, 2, 9, 'z').set(16, 7, 'i').set(14, 8, 'i').set(18, 8, 'i');
  for (const [x, y] of [[1, 1], [26, 1], [1, 26], [26, 26]]) g.rect(x, y, 5, 5, 'N').rect(x + 1, y, 3, 2, 'G').set(x + 2, y, 'r');
  return finish(g);
}

// The bathhouse: stone halls under a blue dome, steam drifting from the vents.
function bathhouse() {
  const g = new Grid(48, 32);
  // steam
  for (const [x, y] of [[8, 1], [11, 3], [38, 0], [40, 3]]) g.ellipse(x, y + 2, 3, 2, 'z');
  // dome over the middle hall
  g.ellipse(24, 12, 11, 8, 'b').rect(13, 12, 22, 2, 'b');
  g.ellipse(21, 9, 4, 3, 'i');
  g.rect(23, 2, 2, 3, 'y');
  // the halls
  wall(g, 2, 13, 44, 18, 'stone');
  roof(g, 2, 8, 12, 6, 'slate');
  roof(g, 34, 8, 12, 6, 'slate');
  g.hline(2, 13, 44, 'X');
  // arched windows and a columned door
  for (const x of [5, 39]) windowAt(g, x, 17, 5, 6);
  for (const x of [14, 18, 29, 33]) g.rect(x, 15, 2, 15, 'z').set(x + 1, 15, 'x');
  door(g, 21, 20, 7, 10);
  g.rect(20, 15, 9, 2, 'x').hline(20, 15, 9, 'z');
  g.hline(2, 31, 44, 'X');
  return finish(g);
}

// The theatre: a columned front under a red pediment, banners of the masks either side.
function theatre() {
  const g = new Grid(48, 40);
  g.tri(23.5, 2, 23, 10, 'r');
  g.hline(0, 12, 48, 'R');
  g.ellipse(24, 8, 3, 3, 'y'); // the gilded mask in the pediment
  g.set(23, 7, 'k').set(25, 7, 'k').hline(23, 9, 3, 'k');
  wall(g, 2, 13, 44, 26);
  g.rect(2, 13, 44, 3, 'C');
  for (const x of [4, 12, 34, 42]) g.rect(x, 16, 3, 22, 'z').vline(x + 2, 16, 22, 'x');
  door(g, 19, 24, 10, 14);
  g.rect(18, 22, 12, 2, 'R');
  // banners: one gold (comedy), one violet (tragedy)
  g.rect(8, 18, 3, 9, 'y').set(9, 21, 'k').set(9, 24, 'Y');
  g.rect(37, 18, 3, 9, 'v').set(38, 21, 'k').set(38, 24, 'V');
  flag(g, 2, 0, 'r');
  flag(g, 44, 0, 'y');
  g.hline(0, 39, 48, 'X');
  return finish(g);
}

// Park ground: a mown lawn in stripes...
function lawn(seed) {
  const r = rng(seed);
  const g = new Grid(16, 16, 'g');
  for (let y = 0; y < 16; y += 4) g.hline(0, y, 16, 'j').hline(0, y + 1, 16, 'j');
  for (let i = 0; i < 3; i++) g.set(Math.floor(r() * 16), Math.floor(r() * 16), 'G');
  return g;
}
// ...a gravel walk across it (frame 0 across, frame 1 down)...
function walk(down) {
  const g = lawn(down ? 41 : 42);
  for (let k = 0; k < 16; k++) for (let j = 5; j < 11; j++) (down ? g.set(j, k, 't') : g.set(k, j, 't'));
  for (let k = 0; k < 16; k += 3) (down ? g.set(6 + (k % 4), k, 'T') : g.set(k, 6 + (k % 4), 'T'));
  return g;
}
// ...and the flower bed in the middle.
function bed() {
  const g = lawn(43);
  g.ellipse(8, 8, 7, 6, 'N');
  g.ellipse(8, 8, 6, 5, 'G');
  const r = rng(44);
  for (let i = 0; i < 16; i++) {
    const x = 3 + Math.floor(r() * 10);
    const y = 4 + Math.floor(r() * 8);
    g.set(x, y, ['r', 'y', 'p', 'w', 'i'][i % 5]);
  }
  return g;
}

// A wooden bench.
function bench() {
  const g = new Grid(16, 16);
  g.rect(2, 6, 12, 2, 'N').hline(2, 6, 12, 'n'); // back
  g.rect(2, 9, 12, 2, 'N').hline(2, 9, 12, 'n'); // seat
  for (const x of [3, 12]) g.vline(x, 8, 7, 'M');
  return finish(g);
}

// For the works list: a corner of lawn, a walk, a tree and a bench.
function park() {
  const g = new Grid(32, 32);
  g.layer(lawn(45), 0, 0).layer(lawn(46), 16, 0).layer(walk(false), 0, 16).layer(bed(), 16, 16);
  g.ellipse(9, 8, 7, 6, 'G').ellipse(7, 6, 3, 2, 'j').rect(8, 13, 2, 4, 'N');
  g.layer(bench(), 16, 0);
  return finish(g);
}

export function amenities() {
  return [
    { name: 'fountain', group: 'buildings', frames: [fountain()] },
    { name: 'plaza', group: 'buildings', frames: [plaza()] },
    { name: 'bathhouse', group: 'buildings', frames: [bathhouse()] },
    { name: 'theatre', group: 'buildings', frames: [theatre()] },
    { name: 'park', group: 'buildings', frames: [park()] },
    { name: 'park-lawn', group: 'tiles', frames: [lawn(47), lawn(48)] },
    { name: 'park-walk', group: 'tiles', frames: [walk(false), walk(true)] },
    { name: 'park-bed', group: 'tiles', frames: [bed()] },
    { name: 'bench', group: 'props', frames: [bench()] },
  ];
}
