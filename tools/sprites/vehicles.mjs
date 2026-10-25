// Things that roll: the merchants' covered wagon, drawn by a donkey, facing right.
import { Grid } from './lib.mjs';
import { SHADE } from './palette.mjs';

// Two frames: the wheel spokes turn and the donkey's legs swap.
function caravan(frame) {
  const g = new Grid(44, 26);
  // canvas cover over hoops
  g.ellipse(14, 12, 12, 10, 'c');
  g.rect(2, 12, 25, 3, 'c');
  for (const x of [6, 14, 22]) g.vline(x, 3, 12, 'C');
  g.hline(3, 14, 23, 'C');
  // goods peeking out the back: grain sacks
  g.rect(1, 10, 3, 4, 'y').set(1, 10, 'Y').set(2, 13, 'Y');
  // wooden bed
  g.rect(1, 15, 27, 5, 'N');
  g.hline(1, 15, 27, 'n');
  g.hline(1, 17, 27, 'M');
  for (const x of [5, 12, 19, 26]) g.vline(x, 16, 4, 'M');
  // wheels
  for (const cx of [7, 21]) {
    g.disc(cx, 21, 4.5, 'M');
    g.disc(cx, 21, 3.4, 'n');
    g.disc(cx, 21, 2.4, '.');
    if (frame === 0) g.vline(cx, 18, 7, 'M').hline(cx - 3, 21, 7, 'M');
    else for (let d = -2; d <= 2; d++) g.set(cx + d, 21 + d, 'M').set(cx + d, 21 - d, 'M');
    g.set(cx, 21, 'k');
  }
  // shafts to the harness
  g.hline(27, 16, 6, 'M');
  // donkey
  g.ellipse(36, 15, 5.5, 3.5, 'L');
  g.hline(32, 13, 8, 'L');
  g.ellipse(41, 10, 2.5, 3, 'L'); // head, raised
  g.rect(39, 11, 3, 4, 'L'); // neck
  g.rect(42, 10, 2, 2, 'L').set(43, 11, 'l'); // muzzle
  g.set(41, 9, 'k'); // eye
  g.vline(39, 5, 3, 'L').vline(40, 5, 3, 'l'); // ears
  g.hline(33, 14, 6, 'x'); // harness strap
  g.set(31, 15, 'l').set(30, 16, 'l'); // tail
  const legs = frame === 0 ? [33, 35, 38, 40] : [32, 35, 37, 40];
  legs.forEach((x, i) => g.vline(x + (frame && i % 2 ? 1 : 0), 18, 4, 'l'));
  return g.shade(SHADE).outline('o');
}

export function vehicles() {
  return [{ name: 'caravan', group: 'vehicles', frames: [caravan(0), caravan(1)] }];
}
