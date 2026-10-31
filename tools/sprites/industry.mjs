// The steam age on the map: the mills on the old pasture, smoke and crystal sparks over them,
// gas lamps along the streets, the railway and its train, the old trades' buildings in brick
// (the forge become a machine shop, the inn a hotel, the shop an emporium, the pleasure house a
// cabaret), and the shanty's shacks become brick tenements.
import { Grid } from './lib.mjs';
import { brick, door, roof, sign, wall } from './world.mjs';

const finish = (g) => g.outline('o');

// A brick mill on a 3x2 plot, a chimney climbing above it (48x40).
function millShell(chimneyX = 40) {
  const g = new Grid(48, 40);
  g.rect(chimneyX, 0, 5, 20, 'R').hline(chimneyX - 1, 0, 7, 'X').hline(chimneyX, 4, 5, 'r');
  for (let y = 7; y < 20; y += 4) g.hline(chimneyX, y, 5, 'r'); // banding
  return g;
}
const sawRoof = (g, x0, teeth, y = 14) => {
  for (let i = 0; i < teeth; i++) {
    const x = x0 + i * 6;
    for (let j = 0; j < 6; j++) g.vline(x + j, y - j, j + 1, j === 5 ? 'a' : 'X');
  }
};

// The weaving mill: a long saw-tooth shed of glass and slate, bolts of blue cloth at its door.
function textileMill() {
  const g = millShell(41);
  sawRoof(g, 1, 6, 16);
  g.hline(1, 17, 46, 'l');
  brick(g, 2, 18, 44, 20);
  for (const x of [4, 12, 30, 38]) g.rect(x, 21, 5, 6, 'M').rect(x + 1, 22, 3, 4, 'y');
  door(g, 20, 27, 8, 11);
  for (const [x, y] of [[4, 32], [8, 33], [36, 32]]) g.rect(x, y, 4, 4, 'b').hline(x, y, 4, 'i');
  g.hline(2, 38, 44, 'X');
  return finish(g);
}

// The steelworks: a black iron shed and two squat blast furnaces glowing at the mouth, coal heaped by.
function steelMill() {
  const g = millShell(42);
  roof(g, 1, 12, 30, 8, 'slate');
  wall(g, 2, 20, 28, 18, 'stone');
  g.rect(6, 24, 8, 14, 'k').rect(8, 30, 4, 8, 'O').rect(9, 32, 2, 5, 'y'); // the furnace mouth
  door(g, 18, 27, 8, 11);
  for (const x of [32, 38]) {
    g.rect(x, 14, 7, 24, 'X').hline(x, 14, 7, 'l').rect(x + 2, 30, 3, 5, 'r').set(x + 3, 31, 'y'); // a furnace tower
  }
  g.disc(41, 37, 3, 'k').disc(36, 38, 2, 'k').set(40, 35, 'X'); // the coal heap
  g.hline(2, 38, 40, 'X');
  return finish(g);
}

// The arcane engine works: brick under a copper roof, a great mana crystal on its spire
// humming violet, a gear wheel over the door.
function engineMill() {
  const g = millShell(42);
  g.tri(20.5, 0, 4, 10, 'a').tri(20.5, 2, 2, 6, 'v').set(20, 2, 'w'); // the crystal
  g.vline(20, 10, 4, 'X').vline(21, 10, 4, 'X');
  roof(g, 1, 14, 38, 8, 'blue');
  brick(g, 2, 22, 36, 16);
  for (const x of [5, 30]) g.rect(x, 25, 5, 6, 'M').rect(x + 1, 26, 3, 4, 'v');
  g.disc(20, 26, 4, 'x').disc(20, 26, 2, 'X').set(20, 26, 'v'); // the gear
  door(g, 16, 31, 8, 7);
  g.hline(2, 38, 44, 'X');
  return finish(g);
}

// The cannery: whitewashed brick, a painted tin over the door, crates of tins stacked outside.
function cannery() {
  const g = millShell(4);
  roof(g, 10, 12, 37, 10, 'red');
  g.rect(12, 22, 33, 16, 'c').vline(12, 22, 16, 'M').vline(44, 22, 16, 'M');
  for (let y = 25; y < 38; y += 3) g.hline(12, y, 33, 'C');
  for (const x of [15, 37]) g.rect(x, 25, 5, 5, 'M').rect(x + 1, 26, 3, 3, 'a');
  door(g, 25, 29, 8, 9);
  g.rect(25, 22, 8, 6, 'r').rect(26, 23, 6, 4, 'y').hline(26, 25, 6, 'R'); // the painted tin
  for (const [x, y] of [[1, 33], [5, 34], [3, 30]]) g.rect(x, y, 4, 4, 'N').hline(x, y, 4, 'n').set(x + 1, y + 2, 'x');
  g.hline(2, 38, 44, 'X');
  return finish(g);
}

// A puff of coal smoke, and a spark from a crystal furnace (particles).
function smoke() {
  const g = new Grid(8, 8);
  g.disc(3.5, 3.5, 3.5, 'x').disc(2.5, 2.5, 1.5, 'z');
  return g;
}
function spark() {
  const g = new Grid(6, 6);
  g.vline(2, 0, 6, 'v').hline(0, 2, 6, 'v').set(2, 2, 'w').set(3, 2, 'p');
  return g;
}

// A gas lamp on an iron post.
function lamp() {
  const g = new Grid(16, 24);
  g.vline(7, 8, 16, 'X').vline(8, 8, 16, 'k');
  g.hline(5, 23, 6, 'X');
  g.rect(5, 2, 6, 6, 'X').rect(6, 3, 4, 4, 'y').set(6, 3, 'w');
  g.hline(5, 1, 6, 'k').set(7, 0, 'k').set(8, 0, 'k');
  return finish(g);
}

// A length of railway: sleepers across, two rails along (a flat ground tile).
function rail() {
  const g = new Grid(16, 16);
  for (let x = 1; x < 16; x += 4) g.rect(x, 4, 2, 9, 'N').vline(x, 4, 9, 'M');
  g.hline(0, 6, 16, 'X').hline(0, 5, 16, 'z');
  g.hline(0, 11, 16, 'X').hline(0, 10, 16, 'z');
  return g;
}

// A little steam engine and its tender, side on.
function train() {
  const g = new Grid(48, 20);
  g.rect(4, 2, 3, 6, 'k').hline(3, 2, 5, 'X'); // funnel
  g.rect(2, 8, 22, 7, 'k').hline(2, 8, 22, 'X').rect(2, 9, 2, 4, 'y'); // boiler and lamp
  g.rect(24, 3, 10, 12, 'r').rect(26, 5, 6, 4, 'a').hline(23, 3, 12, 'R'); // cab
  g.rect(36, 7, 11, 8, 'M').rect(37, 6, 9, 3, 'k'); // tender with its coal
  for (const x of [6, 13, 20, 28, 39, 44]) g.disc(x, 16, 2.5, 'X').set(x, 16, 'z');
  g.hline(0, 19, 48, 'X');
  return finish(g);
}

// The forge become a machine shop: brick, a big roller door, a gear on the sign.
function forgeAge3() {
  const g = new Grid(32, 32);
  g.rect(24, 1, 4, 8, 'R').hline(23, 1, 6, 'X');
  roof(g, 1, 5, 30, 12, 'slate');
  brick(g, 3, 17, 26, 13);
  g.rect(5, 19, 13, 11, 'X');
  for (let y = 20; y < 30; y += 2) g.hline(5, y, 13, 'x'); // roller door
  g.rect(21, 23, 6, 7, 'M').rect(22, 24, 4, 3, 'a');
  sign(g, 21, 14, ['.x..', 'xXx.', '.x..', '....']);
  g.hline(3, 30, 26, 'X');
  return finish(g);
}

// The inn become a hotel: three floors of brick and sash windows, a gilt name board.
function innAge3() {
  const g = new Grid(40, 36);
  roof(g, 1, 2, 38, 9, 'slate');
  brick(g, 3, 11, 34, 23);
  g.rect(8, 12, 24, 4, 'M').hline(9, 13, 22, 'y').hline(9, 14, 22, 'Y'); // the name board
  for (const x of [6, 14, 22, 30]) for (const y of [17, 24]) g.rect(x, y, 4, 5, 'M').rect(x + 1, y + 1, 2, 3, 'a').set(x + 1, y + 1, 'w');
  door(g, 16, 28, 8, 6);
  g.hline(3, 34, 34, 'X');
  return finish(g);
}

// The shop become an emporium: a wide plate-glass front under a striped awning.
function shopAge3() {
  const g = new Grid(32, 32);
  roof(g, 1, 3, 30, 10, 'slate');
  brick(g, 3, 13, 26, 17);
  for (let i = 0; i < 26; i++) g.vline(3 + i, 15, 3, i % 4 < 2 ? 'G' : 'c');
  g.hline(3, 18, 26, 'F');
  g.rect(5, 19, 12, 9, 'a').vline(11, 19, 9, 'M').set(6, 20, 'w').set(12, 20, 'w');
  g.set(7, 26, 'y').set(9, 26, 'r').set(13, 26, 'b').set(15, 26, 'p');
  door(g, 20, 20, 6, 10);
  g.hline(3, 30, 26, 'X');
  return finish(g);
}

// The pleasure house become a cabaret: a marquee of little bulbs over the door.
function brothelAge3() {
  const g = new Grid(32, 40);
  roof(g, 1, 3, 30, 11, 'pink');
  brick(g, 3, 14, 26, 24);
  for (const x of [5, 21]) g.rect(x, 17, 6, 6, 'M').rect(x + 1, 18, 4, 4, 'p');
  g.rect(6, 24, 20, 4, 'P').hline(6, 24, 20, 'k');
  for (let x = 7; x < 26; x += 2) g.set(x, 24, 'y'); // the marquee bulbs
  g.hline(8, 26, 16, 'w');
  door(g, 13, 29, 6, 9);
  g.hline(3, 38, 26, 'X');
  return finish(g);
}

// A shack rebuilt as a narrow brick tenement for the mills' hands.
function tenement() {
  const g = new Grid(16, 24);
  g.rect(10, 0, 3, 4, 'R');
  roof(g, 1, 3, 14, 5, 'slate');
  brick(g, 2, 8, 12, 15);
  for (const y of [10, 15]) g.rect(4, y, 3, 3, 'a').rect(9, y, 3, 3, 'a');
  g.rect(6, 19, 4, 4, 'M');
  return finish(g);
}

// Out on the lands: a steam winding tower over a mine shaft, and a heap of coal by it.
function headframe() {
  const g = new Grid(16, 32);
  g.vline(3, 6, 24, 'M').vline(12, 6, 24, 'M').vline(4, 6, 24, 'N').vline(11, 6, 24, 'N');
  for (let y = 10; y < 30; y += 6) g.hline(3, y, 10, 'M');
  g.disc(7.5, 4.5, 4, 'X').disc(7.5, 4.5, 2, 'x').set(7, 4, 'k');
  g.rect(1, 26, 14, 6, 'R').hline(1, 26, 14, 'r').rect(6, 28, 4, 4, 'k');
  return finish(g);
}
function coalHeap() {
  const g = new Grid(16, 16);
  g.tri(7.5, 6, 7, 9, 'k').set(6, 9, 'X').set(9, 11, 'X').set(4, 13, 'X').set(11, 13, 'X');
  return finish(g);
}

// The age of electricity: the crystal power station, an electric street lamp, a tram, and the
// icons for its discoveries and its appliances.
function powerplant() {
  const g = new Grid(32, 32);
  g.rect(3, 4, 6, 14, 'X').hline(2, 4, 8, 'k'); // a stack
  g.tri(22.5, 1, 4, 9, 'a').tri(22.5, 3, 2, 5, 'v').set(22, 3, 'w'); // the crystal in its coil
  for (let y = 10; y < 16; y += 2) g.hline(19, y, 8, 'Y');
  roof(g, 1, 14, 30, 6, 'slate');
  brick(g, 2, 20, 28, 10);
  g.rect(5, 22, 6, 5, 'M').rect(6, 23, 4, 3, 'y');
  door(g, 15, 22, 6, 8);
  g.set(25, 22, 'y').set(26, 23, 'y').set(25, 24, 'y').set(26, 25, 'y'); // a lightning sign
  g.hline(2, 30, 28, 'X');
  return finish(g);
}
function elamp() {
  const g = new Grid(16, 24);
  g.vline(7, 6, 18, 'X').vline(8, 6, 18, 'k');
  g.hline(5, 23, 6, 'X');
  g.hline(7, 4, 6, 'X').vline(12, 4, 3, 'X');
  g.disc(12, 8, 2, 'w').set(12, 8, 'c');
  return finish(g);
}
function tram() {
  const g = new Grid(32, 20);
  g.vline(16, 0, 5, 'X').hline(12, 0, 9, 'X'); // the pole to the wire
  g.rect(1, 5, 30, 11, 'G').hline(1, 5, 30, 'F').hline(1, 12, 30, 'c');
  for (const x of [3, 9, 15, 21, 26]) g.rect(x, 7, 4, 4, 'a').set(x, 7, 'w');
  for (const x of [6, 25]) g.disc(x, 17, 2, 'X');
  g.hline(0, 19, 32, 'X');
  return finish(g);
}
const icon16 = (draw) => {
  const g = new Grid(16, 16);
  draw(g);
  return finish(g);
};
const electricityIcon = () => icon16((g) => g.tri(7.5, 1, 4, 13, 'a').tri(7.5, 4, 2, 7, 'v').set(7, 4, 'w').hline(3, 14, 10, 'Y'));
const telegraphIcon = () => icon16((g) => { g.vline(7, 1, 14, 'M').hline(2, 3, 12, 'M'); g.set(2, 2, 'x').set(13, 2, 'x'); g.hline(0, 6, 16, 'k'); g.rect(3, 11, 9, 4, 'N').set(6, 10, 'X'); });
const lightbulbIcon = () => icon16((g) => { g.disc(7.5, 6, 5, 'y').disc(6, 4.5, 1.5, 'w'); g.rect(5, 11, 6, 3, 'x').hline(5, 12, 6, 'X').hline(6, 14, 4, 'X'); });
const tramIcon = () => icon16((g) => { g.rect(1, 5, 14, 7, 'G').hline(1, 5, 14, 'F'); for (const x of [3, 7, 11]) g.rect(x, 7, 2, 2, 'a'); g.vline(8, 1, 4, 'X'); g.disc(4, 13, 1.5, 'X').disc(11, 13, 1.5, 'X'); });
const applianceIcon = () => icon16((g) => { g.rect(2, 4, 12, 9, 'x').rect(3, 5, 10, 7, 'z'); g.disc(7.5, 8.5, 2.5, 'v').set(7, 8, 'w'); g.hline(4, 13, 8, 'X').set(4, 14, 'X').set(11, 14, 'X'); g.vline(13, 1, 3, 'X'); });

export function industry() {
  return [
    { name: 'mill-textile', group: 'buildings', frames: [textileMill()] },
    { name: 'mill-steel', group: 'buildings', frames: [steelMill()] },
    { name: 'mill-engines', group: 'buildings', frames: [engineMill()] },
    { name: 'mill-cannery', group: 'buildings', frames: [cannery()] },
    { name: 'forge-age3', group: 'buildings', frames: [forgeAge3()] },
    { name: 'inn-age3', group: 'buildings', frames: [innAge3()] },
    { name: 'shop-age3', group: 'buildings', frames: [shopAge3()] },
    { name: 'brothel-age3', group: 'buildings', frames: [brothelAge3()] },
    { name: 'shack-age3', group: 'props', frames: [tenement()] },
    { name: 'lamp', group: 'props', frames: [lamp()] },
    { name: 'rail', group: 'tiles', frames: [rail()] },
    { name: 'train', group: 'props', frames: [train()] },
    { name: 'smoke', group: 'props', frames: [smoke()] },
    { name: 'spark', group: 'props', frames: [spark()] },
    { name: 'rm-headframe', group: 'worldmap', frames: [headframe()] },
    { name: 'powerplant', group: 'buildings', frames: [powerplant()] },
    { name: 'elamp', group: 'props', frames: [elamp()] },
    { name: 'tram', group: 'props', frames: [tram()] },
    { name: 'electricity', group: 'icons', frames: [electricityIcon()] },
    { name: 'telegraph', group: 'icons', frames: [telegraphIcon()] },
    { name: 'lightbulb', group: 'icons', frames: [lightbulbIcon()] },
    { name: 'tram-icon', group: 'icons', frames: [tramIcon()] },
    { name: 'appliance', group: 'icons', frames: [applianceIcon()] },
    { name: 'rm-coal', group: 'worldmap', frames: [coalHeap()] },
  ];
}
