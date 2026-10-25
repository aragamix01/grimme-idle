// Beasts of the pasture and the forest, facing right; two frames each, the legs swapping.
import { Grid } from './lib.mjs';
import { SHADE } from './palette.mjs';

const finish = (g) => g.shade(SHADE).outline('o');

// Four legs as pairs: front and back, the pairs stepping apart on the second frame.
function legs(g, xs, y, h, c, frame) {
  xs.forEach((x, i) => g.vline(x + (frame && i % 2 ? 1 : 0) - (frame && !(i % 2) ? 1 : 0), y, h, c));
}

function cow(frame) {
  const g = new Grid(22, 16);
  g.ellipse(9.5, 8.5, 8, 4.5, 'w');
  g.rect(3, 6, 4, 3, 'k').rect(10, 5, 3, 2, 'k').rect(12, 9, 3, 2, 'k'); // patches
  g.ellipse(17.5, 6.5, 3, 3, 'w'); // head
  g.rect(18, 7, 4, 3, 'p').set(20, 8, 'P'); // muzzle
  g.set(17, 5, 'k'); // eye
  g.set(16, 2, 'c').set(17, 3, 'c').set(19, 3, 'c').set(20, 2, 'c'); // horns
  g.set(15, 4, 'k'); // ear
  g.vline(1, 6, 4, 'w').set(0, 10, 'k'); // tail
  g.rect(8, 12, 3, 1, 'p'); // udder
  legs(g, [4, 6, 13, 15], 12, 3, 'w', frame);
  for (const x of [4, 6, 13, 15]) g.set(x + (frame ? (x % 2 ? 1 : -1) : 0), 14, 'k');
  return finish(g);
}

function sheep(frame) {
  const g = new Grid(16, 13);
  for (const [x, y] of [[4, 5], [7, 4], [10, 5], [5, 7], [9, 7], [3, 7], [11, 7]]) g.disc(x, y, 2.6, 'c');
  g.ellipse(7.5, 6.5, 5.5, 3, 'c');
  g.ellipse(13, 5, 2.2, 2.4, 'l'); // dark face
  g.set(13, 4, 'w').set(11, 3, 'l'); // eye, ear
  legs(g, [4, 5, 9, 10], 9, 3, 'l', frame);
  return finish(g);
}

function pig(frame) {
  const g = new Grid(16, 12);
  g.ellipse(7, 6, 6, 3.6, 'p');
  g.ellipse(12.5, 5.5, 2.5, 2.5, 'p');
  g.rect(14, 5, 2, 2, 'P'); // snout
  g.set(12, 4, 'k').set(11, 2, 'P'); // eye, ear
  g.set(0, 4, 'P').set(1, 5, 'P'); // curly tail
  legs(g, [3, 5, 9, 11], 9, 2, 'P', frame);
  return finish(g);
}

function chicken(frame) {
  const g = new Grid(10, 10);
  g.ellipse(4.5, 5.5, 3.6, 2.6, 'w');
  g.disc(7, 3, 1.8, 'w');
  g.set(7, 0, 'r').set(6, 1, 'r').set(8, 1, 'r'); // comb
  g.set(9, 3, 'y').set(7, 2, 'k').set(8, 4, 'r'); // beak, eye, wattle
  g.rect(0, 3, 2, 2, 'w'); // tail
  g.set(3, 5, 'c').set(4, 6, 'c'); // wing
  if (frame) g.vline(3, 8, 2, 'Y').vline(6, 8, 1, 'Y');
  else g.vline(3, 8, 1, 'Y').vline(5, 8, 2, 'Y');
  return finish(g);
}

function deer(frame) {
  const g = new Grid(22, 18);
  g.ellipse(9.5, 10, 7, 3.6, 'N');
  g.hline(5, 12, 9, 'n'); // pale belly
  for (const [x, y] of [[7, 8], [10, 7], [12, 9], [9, 10]]) g.set(x, y, 'w'); // spots
  g.rect(14, 5, 3, 5, 'N'); // neck
  g.ellipse(17, 5, 2.6, 2.2, 'N'); // head
  g.rect(18, 5, 3, 2, 'N').set(20, 5, 'k'); // snout, nose
  g.set(17, 4, 'k').set(15, 3, 'n'); // eye, ear
  for (const [x, y] of [[16, 2], [16, 1], [15, 0], [17, 0], [18, 2], [18, 1], [19, 0]]) g.set(x, y, 'M'); // antlers
  g.set(2, 8, 'w').set(2, 9, 'n'); // tail
  legs(g, [5, 7, 12, 14], 13, 4, 'M', frame);
  return finish(g);
}

// The herders' barn: red planks, a white-crossed door, a hay loft.
function barn() {
  const g = new Grid(32, 32);
  g.tri(16, 3, 15, 10, 'R'); // roof
  g.hline(1, 12, 30, 'M');
  g.rect(3, 13, 26, 17, 'r');
  for (let x = 5; x < 29; x += 3) g.vline(x, 14, 16, 'R'); // planks
  g.rect(13, 6, 6, 5, 'M').rect(14, 7, 4, 4, 'y').set(15, 7, 'Y'); // loft with hay
  g.rect(10, 18, 12, 12, 'c'); // door frame
  g.rect(11, 19, 10, 11, 'R');
  for (let i = 0; i < 10; i++) g.set(11 + i, 19 + i, 'c').set(20 - i, 19 + i, 'c');
  g.hline(2, 30, 28, 'M');
  return finish(g);
}

function haystack() {
  const g = new Grid(14, 12);
  g.ellipse(7, 7, 6.5, 5, 'y');
  for (const [x, y] of [[4, 5], [8, 4], [10, 7], [5, 8], [7, 9]]) g.set(x, y, 'Y');
  g.hline(1, 11, 12, 'Y');
  return finish(g);
}

function trough() {
  const g = new Grid(16, 8);
  g.rect(1, 2, 14, 4, 'N');
  g.hline(2, 2, 12, 'a');
  g.hline(1, 1, 14, 'n');
  g.vline(2, 6, 2, 'M').vline(13, 6, 2, 'M');
  return finish(g);
}

export const PASTURE_BEASTS = ['cow', 'sheep', 'pig', 'chicken'];

export function animals() {
  return [
    { name: 'cow', group: 'animals', frames: [cow(0), cow(1)] },
    { name: 'sheep', group: 'animals', frames: [sheep(0), sheep(1)] },
    { name: 'pig', group: 'animals', frames: [pig(0), pig(1)] },
    { name: 'chicken', group: 'animals', frames: [chicken(0), chicken(1)] },
    { name: 'deer', group: 'animals', frames: [deer(0), deer(1)] },
    { name: 'barn', group: 'buildings', frames: [barn()] },
    { name: 'haystack', group: 'props', frames: [haystack()] },
    { name: 'trough', group: 'props', frames: [trough()] },
  ];
}
