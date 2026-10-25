// Dungeon kinds beyond the plain cave, and the boss that rules each one.
// Dungeons are 48x32 mounds with a door at the bottom middle, like the cave in world.mjs;
// bosses are 32x32 with two frames (a breath or a bob), drawn bigger than their kin.
import { Grid } from './lib.mjs';
import { SHADE } from './palette.mjs';
import { WOLF_A, WOLF_B } from './monsters.mjs';

const done = (g) => g.shade(SHADE).outline('o');

// Wolf den: a rocky hollow under a dead tree, bones at the mouth, eyes in the dark.
function den() {
  const g = new Grid(48, 32);
  g.ellipse(24, 22, 22, 14, 'X');
  g.ellipse(14, 16, 8, 6, 'x');
  g.ellipse(34, 18, 9, 6, 'x');
  g.rect(0, 30, 48, 2, '.');
  // dead tree leaning over the hollow
  g.vline(38, 2, 14, 'M').vline(39, 4, 12, 'H');
  g.hline(32, 5, 7, 'M').hline(39, 3, 5, 'M').set(31, 4, 'M').set(44, 2, 'M');
  // the hollow and its eyes
  g.ellipse(24, 26, 8, 7, 'k');
  g.rect(16, 30, 16, 2, '.');
  g.set(21, 25, 'D').set(23, 25, 'D').set(26, 27, 'y').set(28, 27, 'y');
  // bones
  g.hline(9, 28, 5, 'z').set(8, 27, 'z').set(14, 29, 'z');
  g.hline(34, 29, 5, 'z').set(39, 28, 'z').disc(36, 27, 1.2, 'z');
  return done(g);
}

// Goblin fort: a palisade of sharpened logs, a crooked gate and a ragged banner.
function fort() {
  const g = new Grid(48, 32);
  g.rect(2, 12, 44, 18, 'N');
  for (let x = 2; x < 46; x += 4) {
    g.rect(x, 12, 3, 18, 'N').vline(x, 12, 18, 'n').vline(x + 2, 12, 18, 'M');
    g.tri(x + 1, 8, 1, 4, 'N');
  }
  g.hline(2, 18, 44, 'M').hline(2, 25, 44, 'M'); // lashings
  // gate
  g.rect(17, 16, 14, 14, 'k');
  for (let x = 18; x < 31; x += 3) g.vline(x, 17, 13, 'H');
  g.hline(17, 21, 14, 'M');
  g.rect(0, 30, 48, 2, '.');
  // skull totem and banner
  g.vline(8, 2, 10, 'M').rect(9, 2, 6, 4, 'g').set(14, 5, '.').set(11, 3, 'k');
  g.stamp(['.zzz.', 'zkzkz', '.zzz.'], 22, 10);
  g.vline(40, 0, 12, 'M').rect(41, 0, 5, 4, 'R').set(45, 3, '.');
  return done(g);
}

// Crypt: a squat stone mausoleum with a pillared porch, a cracked door and a green glow.
function crypt() {
  const g = new Grid(48, 32);
  g.tri(24, 2, 18, 9, 'x');
  g.hline(5, 10, 38, 'X');
  g.rect(6, 11, 36, 19, 'x');
  for (let y = 13; y < 30; y += 3) g.hline(6, y, 36, 'X');
  for (const x of [9, 36]) g.rect(x, 11, 3, 19, 'z').vline(x + 2, 11, 19, 'x');
  g.rect(17, 16, 14, 14, 'k');
  g.ellipse(24, 16, 7, 3, 'k');
  g.vline(24, 16, 14, 'l');
  g.ellipse(24, 27, 5, 2, 'G');
  g.set(22, 22, 'j').set(26, 24, 'j');
  g.disc(24, 6, 2, 'X').vline(24, 4, 5, 'l').hline(22, 6, 5, 'l'); // carved ankh
  g.rect(0, 30, 48, 2, '.');
  // graves around
  for (const x of [1, 44]) g.rect(x, 22, 3, 6, 'X').set(x + 1, 21, 'X');
  return done(g);
}

// ---------- bosses ----------

const bob = (g) => g.clone().shift(0, 1);

function kingSlime(squash) {
  const g = new Grid(32, 32);
  if (squash) g.ellipse(16, 22, 15, 9, 'p');
  else g.ellipse(16, 20, 13, 11, 'p');
  g.ellipse(10, squash ? 18 : 15, 3, 2, 'w');
  const ey = squash ? 21 : 19;
  g.rect(10, ey, 2, 3, 'k').rect(20, ey, 2, 3, 'k');
  g.hline(13, ey + 4, 6, 'P');
  // crown
  const cy = squash ? 9 : 5;
  g.rect(10, cy + 3, 12, 3, 'y');
  for (const x of [10, 15, 20]) g.tri(x + 1, cy, 1, 3, 'y');
  g.set(16, cy + 4, 'r').set(12, cy + 4, 'b').set(20, cy + 4, 'b');
  return done(g);
}

// The blood-moon wolf: the pack wolf drawn at double size, dark-furred and red-eyed.
function bloodWolf(rows) {
  const src = Grid.from(rows, 'wolf').remap({ L: 'l', k: 'D', c: 'L', w: 'z' });
  const g = new Grid(48, 32);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.get(x, y);
    if (c === '.') continue;
    g.rect(x * 2, y * 2, 2, 2, c);
  }
  return done(g);
}

function goblinChief() {
  const g = new Grid(32, 32);
  g.ellipse(16, 22, 9, 8, 'g'); // belly
  g.rect(9, 27, 5, 4, 'G').rect(18, 27, 5, 4, 'G'); // legs
  g.ellipse(16, 12, 7, 6, 'g'); // head
  g.tri(8, 2, 2, 7, 'z').tri(24, 2, 2, 7, 'z'); // horns
  g.rect(9, 6, 14, 4, 'X'); // helmet band
  g.rect(12, 11, 2, 2, 'D').rect(18, 11, 2, 2, 'D');
  g.hline(13, 15, 6, 'k').set(14, 16, 'z').set(18, 16, 'z');
  g.ellipse(16, 22, 6, 3, 'N'); // belt
  // axe
  g.vline(27, 8, 20, 'M');
  g.ellipse(29, 10, 3, 4, 'x');
  g.rect(25, 18, 3, 3, 'g'); // fist
  return done(g);
}

function lich() {
  const g = new Grid(32, 32);
  g.tri(15, 9, 10, 22, 'V'); // robe
  g.hline(5, 30, 21, 'V');
  g.vline(15, 14, 16, 'v');
  g.disc(15, 8, 5, 'z'); // skull
  g.rect(12, 7, 2, 2, 'k').rect(17, 7, 2, 2, 'k');
  g.set(12, 7, 'j').set(18, 7, 'j');
  g.hline(13, 11, 5, 'x');
  g.tri(15, 0, 6, 4, 'V'); // hood point
  // staff with a green orb
  g.vline(27, 6, 25, 'M');
  g.disc(27, 5, 2.5, 'G').set(26, 4, 'j');
  g.rect(22, 16, 4, 2, 'z'); // bony hand
  return done(g);
}

export function dungeonKinds() {
  return [
    { name: 'dungeon-den', group: 'buildings', frames: [den()] },
    { name: 'dungeon-fort', group: 'buildings', frames: [fort()] },
    { name: 'dungeon-crypt', group: 'buildings', frames: [crypt()] },
  ];
}

export function bosses() {
  const chief = goblinChief();
  const l = lich();
  return [
    { name: 'boss-cave', group: 'monsters', frames: [kingSlime(false), kingSlime(true)] },
    { name: 'boss-den', group: 'monsters', frames: [bloodWolf(WOLF_A), bloodWolf(WOLF_B)] },
    { name: 'boss-fort', group: 'monsters', frames: [chief, bob(chief)] },
    { name: 'boss-crypt', group: 'monsters', frames: [l, bob(l)] },
  ];
}
