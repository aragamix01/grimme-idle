// Icons (16x16), UI 9-slice frames, sparkle and the pixel logotype.
import { Grid } from './lib.mjs';
import { SHADE } from './palette.mjs';

const icon = (rows, name) => Grid.from(rows, name).shade(SHADE).outline('o');

const ICONS = {
  demon: [
    '................',
    '..D..........D..',
    '..DD........DD..',
    '...DD.dddd.DD...',
    '....DdddddddD...',
    '...dddddddddd...',
    '...ddDDddDDdd...',
    '...ddDwddDwdd...',
    '...dddddddddd...',
    '....ddddddddd...',
    '....dd.zz.zdd...',
    '.....dddddd.....',
    '......dddd......',
    '................',
    '................',
    '................',
  ],
  hero: [
    '................',
    '.......zz.......',
    '......zxxz......',
    '..y...zxxz...y..',
    '..yy..zxxz..yy..',
    '...yy.zxxz.yy...',
    '....y.zxxz.y....',
    '......zxxz......',
    '......zxxz......',
    '....yyyyyyyy....',
    '....YYYYYYYY....',
    '.......MM.......',
    '.......MM.......',
    '......yYYy......',
    '................',
    '................',
  ],
  cult: [
    '................',
    '.......dd.......',
    '......dDDd......',
    '.....dD..Dd.....',
    '.....d....d.....',
    '....dD.DD.Dd....',
    '....d.DwwD.d....',
    '...dD.DwDD.Dd...',
    '...d..DDDD..d...',
    '..dD...DD...Dd..',
    '..d..........d..',
    '.dDdddddddddddd.',
    '.dDDDDDDDDDDDDd.',
    '................',
    '................',
    '................',
  ],
  grain: [
    '................',
    '....y..y..y.....',
    '...yYy.yy.yYy...',
    '...yy.yYy..yy...',
    '....yy.yy.yy....',
    '....yYyyYyYy....',
    '.....yyyYyy.....',
    '......yYyy......',
    '......NNNN......',
    '......MMMM......',
    '......yYyy......',
    '.....yYyyYy.....',
    '....yYy..yYy....',
    '...yYy....yYy...',
    '................',
    '................',
  ],
  loot: [
    '................',
    '.......vv.......',
    '......vwvv......',
    '.....vwvvVv.....',
    '.....vvvvVv.....',
    '....vvvvvVVv....',
    '....vwvvvVVv....',
    '....vvvvvVVv....',
    '.....vvvVVv.....',
    '.....vvvVVv.....',
    '......vVVv......',
    '...z...vv...z...',
    '..zz........zz..',
    '..zzz......zzz..',
    '...zz......zz...',
    '................',
  ],
  gear: [
    '................',
    '..xxxxxxxxxxxx..',
    '..xbbbbbbbbbbx..',
    '..xbibbyybbbbx..',
    '..xbibbyybbbbx..',
    '..xbbyyyyyybbx..',
    '..xbbyyyyyybbx..',
    '..xbbbbyybbbbx..',
    '..xbbbbyybbbbx..',
    '...xbbbyybbbx...',
    '...xbbbbbbbbx...',
    '....xbbbbbbx....',
    '.....xbbbbx.....',
    '......xbbx......',
    '.......xx.......',
    '................',
  ],
  gold: [
    '................',
    '................',
    '.....yyyyyy.....',
    '....yyyyyyyy....',
    '...yywyyyyyyy...',
    '...ywyyYYyyyy...',
    '...yyyYyyYyyy...',
    '...yyyyYYyyyy...',
    '...yyyyyyYyyy...',
    '...yyyYyyYyyy...',
    '...yyyyYYyyyy...',
    '....yyyyyyyy....',
    '.....yyyyyy.....',
    '................',
    '................',
    '................',
  ],
  faith: [
    '................',
    '.......y........',
    '.......y........',
    '......yyy.......',
    '......ywy.......',
    '.yy..yywyy..yy..',
    '..yyyywwwyyyy...',
    '....ywwwwwy.....',
    '..yyyywwwyyyy...',
    '.yy..yywyy..yy..',
    '......ywy.......',
    '......yyy.......',
    '.......y........',
    '.......y........',
    '................',
    '................',
  ],
  bless: [
    '................',
    '.....yyyyyy.....',
    '....y......y....',
    '.....yyyyyy.....',
    '................',
    '.w....pppp....w.',
    '.ww..pppppp..ww.',
    '.www.pwpppp.www.',
    '.wwwwppppppwwww.',
    '..wwwppppppwww..',
    '...ww.pppp.ww...',
    '......pppp......',
    '.......pp.......',
    '................',
    '................',
    '................',
  ],
  curse: [
    '................',
    '................',
    '...ggg....ggg...',
    '..gwwkg..gwwkg..',
    '..gwkkg..gwkkg..',
    '..gggggggggggg..',
    '.gggggggggggggg.',
    '.gpgggggggggpgg.',
    '.gggggggggggggg.',
    '.gRRRRRRRRRRRRg.',
    '..gggggggggggg..',
    '...gggggggggg...',
    '..gg........gg..',
    '................',
    '................',
    '................',
  ],
  dream: [
    '................',
    '..........v.....',
    '.....yyy..vvv...',
    '....yyy....v....',
    '...yyy......vv..',
    '...yyy.....vv...',
    '..yyyy.....vvv..',
    '..yyyy..........',
    '..yyyyy.........',
    '...yyyyy....yy..',
    '...yyyyyyyyyyy..',
    '....yyyyyyyyy...',
    '......yyyyy.....',
    '................',
    '................',
    '................',
  ],
  sword: [
    '................',
    '............zz..',
    '...........zzx..',
    '..........zzx...',
    '.........zzx....',
    '........zzx.....',
    '.......zzx......',
    '......zzx.......',
    '..y..zzx........',
    '...yyzx.........',
    '....yy..........',
    '...MyYy.........',
    '..MM..y.........',
    '.MM.............',
    '................',
    '................',
  ],
  staff: [
    '................',
    '...........aa...',
    '..........awaa..',
    '..........aaaa..',
    '...........aa...',
    '..........NN....',
    '.........NN.....',
    '........NN......',
    '.......NN.......',
    '......NN........',
    '.....NN.........',
    '....NN..........',
    '...NN...........',
    '................',
    '................',
    '................',
  ],
  heart: [
    '................',
    '................',
    '...rrr....rrr...',
    '..rrwrr..rrrrr..',
    '..rwrrrrrrrrrr..',
    '..rrrrrrrrrrrr..',
    '..rrrrrrrrrrrr..',
    '...rrrrrrrrrr...',
    '....rrrrrrrr....',
    '.....rrrrrr.....',
    '......rrrr......',
    '.......rr.......',
    '................',
    '................',
    '................',
    '................',
  ],
  skull: [
    '................',
    '................',
    '.....zzzzzz.....',
    '....zzzzzzzz....',
    '...zzzzzzzzzz...',
    '...zzzzzzzzzz...',
    '...zkkzzzzkkz...',
    '...zkkzzzzkkz...',
    '...zzzzkkzzzz...',
    '....zzzzzzzz....',
    '.....zkzkzk.....',
    '.....zzzzzz.....',
    '................',
    '................',
    '................',
    '................',
  ],
  quest: [
    '................',
    '..cccccccccc....',
    '..cCCCCCCCCcc...',
    '..cccccccccc....',
    '...cMMMMMMc.....',
    '...cccccccc.....',
    '...cMMMMMc......',
    '...cccccccc.....',
    '...cMMMMMMc.....',
    '...cccccccc.....',
    '..cccccccccc....',
    '..cCCCCCCCCcc...',
    '..ccccccccccrr..',
    '............r...',
    '................',
    '................',
  ],
  banner: [
    '................',
    '..M.............',
    '..MbbbbbbbbbB...',
    '..MbbbbbbbbbB...',
    '..MbbbyyybbbB...',
    '..MbbyyyyybbB...',
    '..MbbbyyybbbB...',
    '..MbbbbybbbbB...',
    '..MbbbbbbbbbB...',
    '..MbbbB.bbbbB...',
    '..MbbB...bbbB...',
    '..MbB.....bbB...',
    '..M.............',
    '..M.............',
    '.MMM............',
    '................',
  ],
  crown: [
    '................',
    '................',
    '................',
    '..y....yy....y..',
    '..yy...yy...yy..',
    '..yyy.yyyy.yyy..',
    '..yyyyyyyyyyyy..',
    '..yryyybyyyyry..',
    '..yyyyyyyyyyyy..',
    '..YYYYYYYYYYYY..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

// ---------- UI frames ----------
function woodPanel() {
  const g = new Grid(24, 24, 'M');
  g.rect(2, 2, 20, 20, 'N').rect(3, 3, 18, 18, 'n');
  for (let y = 7; y < 21; y += 4) g.hline(3, y, 18, 'N');
  g.hline(3, 3, 18, 'c');
  for (const [x, y] of [[3, 4], [19, 4], [3, 19], [19, 19]]) g.rect(x, y, 2, 2, 'y').set(x + 1, y + 1, 'Y');
  return roundFrame(g);
}

function paperPanel() {
  const g = new Grid(24, 24, 'c');
  g.rect(1, 1, 22, 22, 'C').rect(2, 2, 20, 20, 'c');
  return roundFrame(g);
}

function button(pressed) {
  const g = new Grid(24, 16);
  const top = pressed ? 2 : 0;
  g.rect(0, top, 24, 16 - top, 'M');
  g.rect(1, top + 1, 22, 12 - top, 'n');
  g.hline(1, top + 1, 22, 'c');
  g.rect(1, 13, 22, 2, pressed ? 'n' : 'N');
  if (pressed) g.hline(1, 14, 22, 'N');
  return roundFrame(g, top);
}

function bubble() {
  return roundFrame(new Grid(16, 16, 'w'));
}

const BUBBLE_TAIL = ['owwwwwo', '.owwwo.', '..owo..', '...o...'];

// Square sprite -> 1px brown border with clipped corners.
function roundFrame(g, top = 0) {
  for (let x = 0; x < g.w; x++) g.set(x, top, 'o').set(x, g.h - 1, 'o');
  for (let y = top; y < g.h; y++) g.set(0, y, 'o').set(g.w - 1, y, 'o');
  for (const [x, y] of [[0, top], [g.w - 1, top], [0, g.h - 1], [g.w - 1, g.h - 1]]) g.set(x, y, '.');
  g.set(1, top + 1, 'o').set(g.w - 2, top + 1, 'o').set(1, g.h - 2, 'o').set(g.w - 2, g.h - 2, 'o');
  return g;
}

function sparkle(size) {
  const g = new Grid(11, 11);
  const c = 5;
  g.vline(c, c - size, size * 2 + 1, 'y').hline(c - size, c, size * 2 + 1, 'y');
  if (size > 1) g.rect(c - 1, c - 1, 3, 3, 'y');
  g.set(c, c, 'w');
  if (size > 2) g.set(c - 1, c - 1, 'w').set(c + 1, c - 1, 'y');
  return g.outline('o');
}

// ---------- logotype ----------
const GLYPHS = {
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.####.'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  M: ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##'],
  D: ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '######'],
  E: ['######', '##....', '##....', '#####.', '##....', '##....', '######'],
};

function word(text, scale, bands, gap = 2) {
  const widths = [...text].map((ch) => GLYPHS[ch][0].length);
  const w = (widths.reduce((a, b) => a + b, 0) + (text.length - 1) * gap) * scale;
  const g = new Grid(w, 7 * scale);
  let x = 0;
  [...text].forEach((ch, i) => {
    GLYPHS[ch].forEach((row, j) =>
      [...row].forEach((p, k) => {
        if (p !== '#') return;
        const c = bands[Math.min(bands.length - 1, Math.floor((j * bands.length) / 7))];
        g.rect(x + k * scale, j * scale, scale, scale, c);
      }),
    );
    x += (widths[i] + gap) * scale;
  });
  return g;
}

function logo() {
  const top = word('GRIMM', 3, ['c', 'y', 'y', 'y', 'O', 'O', 'Q']);
  const bottom = word('IDLE', 3, ['c', 'j', 'g', 'g', 'G', 'G', 'F']);
  const g = new Grid(top.w + 20, top.h + bottom.h + 16);
  g.layer(top, 5, 5);
  g.layer(bottom, 5 + 30, 5 + top.h + 6);
  // Sticker outline: a thin dark line everywhere (counters too), then thick cream + brown outside only.
  g.outline('F', true);
  g.outline('F', true, true).outline('c', true, true).outline('c', true, true).outline('o', true, true);
  g.layer(sparkle(3), top.w - 2, 0);
  return g;
}

export function icons() {
  return Object.entries(ICONS).map(([name, rows]) => ({ name, group: 'icons', frames: [icon(rows, name)] }));
}

export function uiParts() {
  return [
    { name: 'panel-wood', group: 'ui', frames: [woodPanel()], slice: 8 },
    { name: 'panel-paper', group: 'ui', frames: [paperPanel()], slice: 6 },
    { name: 'button', group: 'ui', frames: [button(false), button(true)], slice: 6 },
    { name: 'bubble', group: 'ui', frames: [bubble()], slice: 4 },
    { name: 'bubble-tail', group: 'ui', frames: [Grid.from(BUBBLE_TAIL, 'tail')] },
    { name: 'sparkle', group: 'ui', frames: [sparkle(1), sparkle(2), sparkle(3), sparkle(4)] },
    { name: 'logo', group: 'logo', frames: [logo()] },
  ];
}
