// Bootstrap script that wrote the first version of the Grimm Idle design system under ./project.
// The live system has moved on (flat SignPanel, StatTile); do not re-run it over the artifact.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'project');
const write = (p, text) => {
  mkdirSync(dirname(join(out, p)), { recursive: true });
  writeFileSync(join(out, p), text);
};

// Uploaded 4x PNGs: group -> name -> [blob id, bytes]
const ASSETS = {
  Logo: { 'logo.png': ['486c3c562fcba9504b015b2396c8e3af', 5404] },
  Characters: {
    'swordsman.png': ['bba60a62f44ccf5c3cbf2de9ee3b4229', 439],
    'mage.png': ['61ff7e95d96d0f8377c071896b5480a3', 460],
    'merchant.png': ['fafbe3a391d954ab8755e101b29df45d', 426],
    'farmer.png': ['0325cca56aad3533db9f02b6acfc65fe', 431],
    'thief.png': ['c8987813abcdb14372e246d5a00efff3', 404],
    'priest.png': ['26d0b32ecd7d9ce075d97313b7d8e666', 476],
    'king.png': ['1b205d84680dfdf1a9e448c78ac91d01', 473],
    'hero.png': ['d60f0bf52ab1a61d1f7a4713cc7293b2', 456],
  },
  Monsters: {
    'slime.png': ['2e79ccf794cdd47d7035553711917c39', 248],
    'bat.png': ['1604257367eaea22225df64fe9ef05ad', 261],
    'goblin.png': ['448b5eea460e208621a955fc7e0fb02e', 395],
    'skeleton.png': ['1a7fbb9638c3207fa806e28be3f64793', 377],
    'wolf.png': ['e39569b3682b27ebe7f6adfcbe91c550', 417],
    'demon-lord.png': ['15c2c3041d758d3d12173884a507ff54', 827],
  },
  Buildings: {
    'house.png': ['3cde2a43dfa9341d9dd0c5472141d3fd', 707],
    'shop.png': ['8d1f68fd01fb167ae440ab32c6e31c3d', 699],
    'inn.png': ['dc5b4f2c2a40b328d79fc1d95845ec5f', 939],
    'guild.png': ['d9a6a8c2e3cfda738e2f3e4ed438067d', 1212],
    'church.png': ['5fa49c3b88141747c00a89291cd52a10', 935],
    'castle.png': ['4caaf11e044feddcabdf164084425a19', 2700],
    'dungeon.png': ['0bd7e4866b3f8bf4660831bd46643f71', 886],
  },
  Tiles: {
    'grass.png': ['9c7fd1b7d28b110be668d96a0c6c53d6', 266],
    'path.png': ['57eac896379e0138218e2f1bf5b60a91', 261],
    'water.png': ['6ad1da3840c4f808d5f103cfd3bef724', 246],
    'flowers.png': ['a638c2d314c9f7c49721c6a41417a440', 326],
    'stone-wall.png': ['d9d23938dc8a79659497a08920503311', 274],
  },
  Props: {
    'tree.png': ['d628ab7cfd9b743ace99b5b99ab88800', 322],
    'bush.png': ['ffdbeebc00502ca59359d3a2bae6b516', 242],
    'fence.png': ['de5572d1aeda86a88460fc27529bfb03', 247],
    'rock.png': ['40d65c873e7f4b2305564899a8720ffd', 227],
  },
  Icons: {
    'faith.png': ['d860e0803ed0106c9289c6d7cde6f7a0', 301],
    'bless.png': ['27f480db8ac6f0fe13bdb48e2cc624ce', 314],
    'curse.png': ['759fda9575d7ee988a83d41c5bf61bf4', 287],
    'dream.png': ['6a41f34381d0aabd8741ee0c995ee6ce', 295],
    'gold.png': ['67f9fcc5c267ed25992a76f863738229', 245],
    'quest.png': ['7982f285d32328df0793f1d3f2a28e58', 283],
    'sword.png': ['cfc0fd90277b17e2b35c471831f8ab1a', 300],
    'staff.png': ['d530489ff0af528c4464acaef19790bd', 248],
    'heart.png': ['dde476a9f94ee23aaaef79bacd166354', 248],
    'skull.png': ['496f5669c2b133810d67cfb171fa5a92', 247],
    'crown.png': ['d127202402f3413d0d37e045d30933fd', 234],
  },
  UI: {
    'panel-wood.png': ['4ba2ccf4285a90427aa606e016c5c1ec', 392],
    'panel-paper.png': ['6901ce371ad1e653008bf49af7378683', 306],
    'button.png': ['93f4fbaf400e515e5becc538c766cfe5', 251],
    'bubble.png': ['7f130d3325355a7dd8a7cf11ccbaea17', 190],
    'bubble-tail.png': ['cd0e748a0eea7a4502eced05e536a846', 113],
    'sparkle.png': ['2c1ea7388103521e36fb321a935d1f6f', 147],
  },
};
const blob = (group, name) => `/_blob/${ASSETS[group][`${name}.png`][0]}`;

// ---------- tokens ----------
const c = (name, value, usage) => ({ name, value, usage });
const tokens = {
  name: 'Grimm Idle',
  version: 1,
  color: {
    themes: [{ id: 'day', name: 'Day' }],
    tokens: [
      c('meadow', '#8fd64e', 'Map ground and the backdrop behind sprite sheets. Never put text directly on it.'),
      c('meadow-deep', '#2f6e28', 'App backdrop around the map and panels; the logo\'s inner outline. Paper text on it reads 5.6:1.'),
      c('leaf', '#56a832', 'Foliage mid-tone; success state fills, always paired with the heart icon or a word.'),
      c('paper', '#fff4d6', 'Paper panels, chronicle entries, speech bubbles, NPC cards. Ground for body text.'),
      c('paper-edge', '#ecd3a0', 'Inner bevel on paper and dividers on paper.'),
      c('wood-light', '#f2b85c', 'Wood button face and sign highlights. Ink text on it reads 8.1:1.'),
      c('wood', '#c47a32', 'Wood sign planks. Text on wood is paper with a 2px outline shadow, 18px or larger (3.1:1 alone).'),
      c('wood-dark', '#7a4420', 'Wood sign frame; secondary text on paper (7.2:1).'),
      c('outline', '#3b2416', 'Every sprite outline and every UI border, 1 art pixel. Never pure black.'),
      c('ink', '{outline}', 'Body text on paper (13:1), wood-light (8.1:1) and gold (10:1).'),
      c('ink-muted', '{wood-dark}', 'Day stamps, captions and secondary text on paper.'),
      c('gold', '#ffd23f', 'Faith, blessings, sparkles and the selected state. Ink text on it.'),
      c('gold-deep', '#d8961c', 'Shaded side of gold; faith bar track edge.'),
      c('fairy', '#f582b8', 'Charm magic, fairy effects, slimes. Decorative only, never text.'),
      c('spell', '#9a66e0', 'Mage spells and the dream power. Paper text on it reads 3.5:1, so 19px bold or larger.'),
      c('demon', '#5a2a66', 'Evil, curses and the demon lord; the low end of the morality bar. Paper text on it reads 9.7:1.'),
      c('danger', '#d03a4e', 'Deaths and stampedes. Always with the skull icon; paper text on it reads 5.9:1.'),
      c('water', '#7fd8f8', 'Ponds and rivers; window glass.'),
      c('sky-deep', '#3a92d8', 'Deep water and blue roofs.'),
      c('stone', '#b4c0cc', 'Castle, guild and wall stone; steel weapons.'),
      c('focus', '#2e56a0', 'Keyboard focus ring: 3px solid outside the element. 6.5:1 on paper, 4:1 on meadow.'),
    ],
  },
  type: {
    families: {
      body: '"Mitr", system-ui, sans-serif',
      pixel: '"Pixelify Sans", "Mitr", monospace',
    },
    groups: [
      {
        name: 'Pixel',
        family: 'pixel',
        styles: [
          { name: 'display', fontSize: '36px', lineHeight: '40px', fontWeight: 700, sample: 'GRIMM IDLE', usage: 'Screen titles in Latin. Thai titles use title.' },
          { name: 'numeral', fontSize: '16px', lineHeight: '20px', fontWeight: 500, sample: 'D128 · 42.5', usage: 'Counters, days, faith and gold amounts.' },
          { name: 'label', fontSize: '12px', lineHeight: '16px', fontWeight: 500, letterSpacing: '0.04em', sample: 'LV 12', usage: 'Chips and tiny Latin labels.' },
        ],
      },
      {
        name: 'Thai text',
        family: 'body',
        styles: [
          { name: 'title', fontSize: '22px', lineHeight: '32px', fontWeight: 600, sample: 'กิลด์นักผจญภัย', usage: 'Panel titles on signs and paper.' },
          { name: 'heading', fontSize: '17px', lineHeight: '26px', fontWeight: 600, sample: 'เซร่า · นักดาบ', usage: 'NPC names and section heads.' },
          { name: 'body', fontSize: '15px', lineHeight: '24px', fontWeight: 400, sample: 'เซร่าพิชิตถ้ำหนามหลับใหล ขึ้นเลเวล 3', usage: 'Chronicle entries and all running text.' },
          { name: 'small', fontSize: '13px', lineHeight: '20px', fontWeight: 400, sample: 'ราคา 5 ศรัทธา', usage: 'Captions, costs, hints.' },
        ],
      },
    ],
  },
  spacing: {
    note: 'Everything sits on the art pixel: sprites render at 3x, so 1 art pixel = 3px and one map tile = 48px.',
    tokens: [
      c('px', '3px', 'One art pixel: borders on sprites, button press depth.'),
      c('space-1', '6px', 'Gap between icon and label.'),
      c('space-2', '12px', 'Padding inside chips and chronicle entries; gap between list items.'),
      c('space-3', '18px', 'Paper panel inner padding.'),
      c('space-4', '24px', 'Wood sign border and padding.'),
      c('space-5', '36px', 'Gap between panels.'),
      c('tile', '48px', 'One map tile at 3x; portrait column width.'),
    ],
  },
  radius: {
    note: 'Pixel UI has no CSS rounding: corners are clipped in the sprites themselves.',
    tokens: [
      c('radius-none', '0px', 'Every panel, button, bar and card. Rounded corners come from the 9-slice sprites.'),
    ],
  },
  shadow: {
    tokens: [
      c('shadow-drop', '3px 3px 0 rgba(59, 36, 22, 0.35)', 'Hard drop shadow under floating paper and bubbles. Never blurred.'),
      c('shadow-bevel', 'inset 0 3px 0 #ffffff80, inset 0 -3px 0 #ecd3a0', 'Paper surfaces drawn in CSS instead of the sprite.'),
    ],
  },
  border: {
    tokens: [
      c('border-ui', '2px', 'Outline on CSS-drawn chips, entries and bars.'),
      c('border-art', '3px', 'One art pixel, for CSS outlines next to sprites.'),
    ],
  },
  scale: {
    tokens: [c('art-scale', '3', 'Integer upscale for every sprite in the UI. Never scale by a fraction.')],
  },
};
write('tokens.json', JSON.stringify(tokens, null, 2));

// ---------- bundle.css ----------
const css = `@import url("https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&family=Pixelify+Sans:wght@500;700&display=swap");

/* Grimm Idle UI kit. Frames are 9-sliced from the 4x sprite uploads and shown at 3x. */
.gi, .gi * { box-sizing: border-box; }
.gi { font-family: var(--font-body); color: var(--ink); font-size: 15px; line-height: 24px; }
.gi img, .gi-sprite { image-rendering: pixelated; }
.gi :focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }

.gi-sign {
  border: var(--space-4) solid transparent;
  border-image: url("${blob('UI', 'panel-wood')}") 32 fill / var(--space-4);
  padding: var(--space-1);
  color: var(--paper);
}
.gi-sign__title { margin: 0 0 var(--space-2); font-size: 22px; line-height: 32px; font-weight: 600; text-shadow: 2px 2px 0 var(--outline), -1px -1px 0 var(--outline), 1px -1px 0 var(--outline), -1px 1px 0 var(--outline); }

.gi-paper {
  border: var(--space-3) solid transparent;
  border-image: url("${blob('UI', 'panel-paper')}") 24 fill / var(--space-3);
  color: var(--ink);
}

.gi-button {
  display: inline-flex; align-items: center; gap: var(--space-1);
  font: 600 15px/24px var(--font-body); color: var(--ink);
  background: none; cursor: pointer;
  border: 18px solid transparent;
  border-image: url("${blob('UI', 'button')}") 24 fill / 18px;
  padding: 0 var(--space-1) var(--px);
  margin: calc(-1 * var(--space-1)) 0;
}
.gi-button:active, .gi-button[aria-pressed="true"] { transform: translateY(var(--px)); filter: brightness(0.94); }
.gi-button:disabled { filter: grayscale(0.7) opacity(0.6); cursor: not-allowed; }
.gi-button img { width: 24px; height: 24px; }

.gi-bubble {
  position: relative; display: inline-block;
  border: 12px solid transparent;
  border-image: url("${blob('UI', 'bubble')}") 16 fill / 12px;
  padding: 0 var(--px);
  font-size: 13px; line-height: 20px;
  filter: drop-shadow(3px 3px 0 rgba(59, 36, 22, 0.35));
}
.gi-bubble::after {
  content: ""; position: absolute; left: 50%; bottom: -21px; transform: translateX(-50%);
  width: 21px; height: 12px;
  background: url("${blob('UI', 'bubble-tail')}") center / 21px 12px no-repeat; image-rendering: pixelated;
}

.gi-entry {
  display: flex; gap: var(--space-2); align-items: flex-start;
  background: var(--paper); border: var(--border-ui) solid var(--outline);
  box-shadow: var(--shadow-bevel), var(--shadow-drop);
  padding: var(--space-1) var(--space-2);
}
.gi-entry img { width: 24px; height: 24px; flex: none; margin-top: 0; }
.gi-entry__day { font: 500 13px/24px var(--font-pixel); color: var(--ink-muted); flex: none; min-width: 3.5em; }
.gi-entry__text { min-width: 0; }
.gi-entry--danger .gi-entry__day { color: var(--danger); }

.gi-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font: 500 12px/16px var(--font-pixel); letter-spacing: 0.04em;
  padding: 2px var(--space-1); background: var(--wood-light);
  border: var(--border-ui) solid var(--outline); color: var(--ink);
}
.gi-chip--gold { background: var(--gold); }
.gi-chip--spell { background: var(--spell); color: var(--paper); }

.gi-bar { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-1); align-items: center; font: 500 13px/16px var(--font-pixel); }
.gi-bar__track { position: relative; height: 12px; background: var(--paper-edge); border: var(--border-ui) solid var(--outline); box-shadow: inset 0 3px 0 rgba(59, 36, 22, 0.2); }
.gi-bar__fill { position: absolute; inset: 0 auto 0 0; background: var(--gold); box-shadow: inset 0 3px 0 #fff6, inset 0 -3px 0 var(--gold-deep); }
.gi-bar--morality .gi-bar__track { background: linear-gradient(90deg, var(--demon) 0 50%, var(--gold) 50% 100%); }
.gi-bar--morality .gi-bar__fill { display: none; }
.gi-bar__marker { position: absolute; top: -6px; width: 6px; height: 20px; margin-left: -3px; background: var(--paper); border: var(--border-ui) solid var(--outline); }

.gi-npc { display: grid; grid-template-columns: var(--tile) 1fr; gap: var(--space-2); align-items: start; }
.gi-npc__portrait { width: var(--tile); height: 72px; background: var(--meadow); border: var(--border-ui) solid var(--outline); display: grid; place-items: end center; overflow: hidden; }
.gi-npc__portrait img { width: 48px; height: 72px; }
.gi-npc__name { margin: 0; font-size: 17px; line-height: 26px; font-weight: 600; }
.gi-npc__meta { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 var(--space-1); }
.gi-npc__stats { display: grid; gap: var(--space-1); }

.gi-power { display: inline-grid; justify-items: center; gap: 2px; }
.gi-power .gi-button { flex-direction: column; gap: 0; padding-inline: var(--space-2); }
.gi-power__name { font-size: 13px; line-height: 18px; }
.gi-power__cost { font: 500 12px/16px var(--font-pixel); color: var(--ink-muted); display: inline-flex; align-items: center; gap: 2px; }
.gi-power__cost img { width: 16px; height: 16px; }
`;
write('components/bundle.css', css);

// ---------- components ----------
const preview = (group, height, body, subtitle) => `<!-- @dsCard group="${group}" height=${height}${subtitle ? ` subtitle="${subtitle}"` : ''} -->
<!doctype html>
<html lang="th">
<head><meta charset="utf-8"><title>preview</title>
<style>html,body{margin:0}body{background:var(--meadow-deep);padding:16px}</style>
</head>
<body>
<div class="gi">
${body}
</div>
</body>
</html>
`;

const COMPONENTS = {
  SignPanel: {
    readme: `# SignPanel

The wood signboard that frames every top-level panel: the chronicle, the guild board, the god powers.

- Markup: \`<section class="gi gi-sign"><h2 class="gi-sign__title">…</h2>…</section>\`. The consumer provides the title and the children.
- The frame is the \`panel-wood\` sprite 9-sliced at 3x; it grows to any size. Keep the inside to paper panels, entries and buttons.
- Title text is \`paper\` with an \`outline\` shadow, set in \`title\`. Never put body text straight on wood: wrap it in a PaperCard.
- Do not nest a sign inside a sign.`,
    preview: preview('Containers', 200, `<section class="gi-sign" style="max-width:360px">
  <h2 class="gi-sign__title">กระดานกิลด์</h2>
  <div class="gi-paper">เควสใหม่: ปราบสไลม์ 5 ตัวที่ทุ่งตะวันออก</div>
</section>`),
  },
  PaperCard: {
    readme: `# PaperCard

Cream paper panel for reading: NPC details, quest text, tooltips.

- Markup: \`<div class="gi gi-paper">…</div>\`; the consumer provides the content.
- Text on paper is \`ink\` for body and \`ink-muted\` for secondary lines; both pass AA.
- Sits on \`meadow-deep\` or inside a SignPanel. Use \`shadow-drop\` only when it floats over the map.`,
    preview: preview('Containers', 150, `<div class="gi-paper" style="max-width:320px">
  <strong>ถ้ำหนามหลับใหล</strong><br>
  <span style="color:var(--ink-muted)">พลังดันเจี้ยน 42 · ใกล้ล้นออกมาแล้ว</span>
</div>`),
  },
  WoodButton: {
    readme: `# WoodButton

The only button style: a raised wood plank that sinks one art pixel when pressed.

- Markup: \`<button class="gi-button">…</button>\`, optionally with a 24px icon \`<img>\` first. Label in Thai, a verb: "ให้พร", "สาปแช่ง".
- Pressed and toggled-on (\`aria-pressed="true"\`) move down \`px\`; disabled greys out and keeps its label.
- Focus shows the \`focus\` ring. Do not recolour the plank for emphasis; use a gold chip next to it instead.`,
    preview: preview('Actions', 96, `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
  <button class="gi-button"><img src="${blob('Icons', 'bless')}" alt="">ให้พร</button>
  <button class="gi-button" aria-pressed="true">กดค้าง</button>
  <button class="gi-button" disabled>ศรัทธาไม่พอ</button>
</div>`),
  },
  PowerButton: {
    readme: `# PowerButton

A god power on the power bar: icon, Thai name and its faith cost.

- Markup: \`.gi-power\` wrapping a \`.gi-button\` (icon + \`.gi-power__name\`) and a \`.gi-power__cost\` line with the faith icon.
- The consumer provides the icon (from Icons), the name and the cost. Disable the button when faith is short; keep the cost visible.
- Powers so far: ให้พร (bless, 5), สาปแช่ง (curse, 5), ส่งความฝัน (dream, 3).`,
    preview: preview('Actions', 130, `<div style="display:flex;gap:20px;flex-wrap:wrap">
  <div class="gi-power"><button class="gi-button"><img src="${blob('Icons', 'bless')}" alt=""><span class="gi-power__name">ให้พร</span></button><span class="gi-power__cost"><img src="${blob('Icons', 'faith')}" alt="">5</span></div>
  <div class="gi-power"><button class="gi-button"><img src="${blob('Icons', 'curse')}" alt=""><span class="gi-power__name">สาปแช่ง</span></button><span class="gi-power__cost"><img src="${blob('Icons', 'faith')}" alt="">5</span></div>
  <div class="gi-power"><button class="gi-button" disabled><img src="${blob('Icons', 'dream')}" alt=""><span class="gi-power__name">ส่งความฝัน</span></button><span class="gi-power__cost"><img src="${blob('Icons', 'faith')}" alt="">3</span></div>
</div>`),
  },
  ChronicleEntry: {
    readme: `# ChronicleEntry

One line of the world chronicle, newest first.

- Markup: \`<li class="gi-entry"><img …><span class="gi-entry__day">D128</span><span class="gi-entry__text">…</span></li>\`.
- The consumer provides the day number, the sentence and an icon that says what kind of event it is: sword (battle), skull (death), bless/curse (god power), quest, crown (politics).
- Deaths and disasters add \`gi-entry--danger\`, which turns the day stamp \`danger\`; the skull icon carries the meaning, not the colour.
- Write entries as one plain Thai sentence: who, did what, where. Names stay in their own script.`,
    preview: preview('Chronicle', 200, `<ol style="list-style:none;margin:0;padding:0;display:grid;gap:8px;max-width:380px">
  <li class="gi-entry"><img src="${blob('Icons', 'sword')}" alt=""><span class="gi-entry__day">D128</span><span class="gi-entry__text">เซร่าพิชิตถ้ำหนามหลับใหล ขึ้นเลเวล 3</span></li>
  <li class="gi-entry"><img src="${blob('Icons', 'bless')}" alt=""><span class="gi-entry__day">D127</span><span class="gi-entry__text">แสงศักดิ์สิทธิ์โอบล้อมคอริน</span></li>
  <li class="gi-entry gi-entry--danger"><img src="${blob('Icons', 'skull')}" alt=""><span class="gi-entry__day">D120</span><span class="gi-entry__text">เนลล์หายไปในหอคอยไร้บันได</span></li>
</ol>`),
  },
  SpeechBubble: {
    readme: `# SpeechBubble

A short line floating over an NPC on the map: a reaction, not a story.

- Markup: \`<span class="gi gi-bubble">…</span>\`; the tail points down at the speaker's head.
- Four Thai words at most ("ได้ของแล้ว!", "ช่วยด้วย!"). Longer text belongs in the chronicle.
- Shows for about two seconds, then fades; never more than three on screen.`,
    preview: preview('Map overlays', 96, `<div style="display:flex;gap:24px;padding-top:4px">
  <span class="gi-bubble">ได้ของแล้ว!</span>
  <span class="gi-bubble">ช่วยด้วย!</span>
</div>`),
  },
  StatBar: {
    readme: `# StatBar

A pixel meter for faith, HP and morality.

- Markup: \`.gi-bar\` grid with an icon or label, a \`.gi-bar__track\` holding \`.gi-bar__fill\` (width as a percentage), and the number in \`numeral\`.
- \`gi-bar--morality\` is a two-sided track, \`demon\` on the left and \`gold\` on the right, with a \`.gi-bar__marker\` at \`left: <(morality + 100) / 2>%\`. Show the number too: the two halves differ in lightness, but the number is the truth.
- The consumer provides the value and the label. Keep bars full width of their container.`,
    preview: preview('Status', 120, `<div style="display:grid;gap:12px;max-width:320px;background:var(--paper);padding:12px;border:2px solid var(--outline)">
  <div class="gi-bar"><img src="${blob('Icons', 'faith')}" alt="ศรัทธา" style="width:24px;height:24px"><div class="gi-bar__track"><div class="gi-bar__fill" style="width:64%"></div></div><span>32/50</span></div>
  <div class="gi-bar gi-bar--morality"><span>ศีล</span><div class="gi-bar__track"><div class="gi-bar__marker" style="left:70%"></div></div><span>+40</span></div>
</div>`),
  },
  NpcCard: {
    readme: `# NpcCard

The life story panel when a player clicks an NPC.

- Markup: \`.gi-npc\` inside a PaperCard: a \`.gi-npc__portrait\` with the job sprite, then name, chips (job, level, traits) and StatBars.
- The consumer provides the sprite, name, job, level, traits, gold and morality.
- Portrait sprites show at 3x on \`meadow\`. Blessed NPCs get a gold chip "ได้รับพร".`,
    preview: preview('Status', 170, `<div class="gi-paper" style="max-width:360px">
  <div class="gi-npc">
    <div class="gi-npc__portrait"><img src="${blob('Characters', 'swordsman')}" alt=""></div>
    <div>
      <h3 class="gi-npc__name">เซร่า</h3>
      <div class="gi-npc__meta"><span class="gi-chip">นักดาบ</span><span class="gi-chip">LV 3</span><span class="gi-chip gi-chip--gold">ได้รับพร</span></div>
      <div class="gi-npc__stats">
        <div class="gi-bar"><img src="${blob('Icons', 'gold')}" alt="ทอง" style="width:24px;height:24px"><div class="gi-bar__track"><div class="gi-bar__fill" style="width:40%"></div></div><span>48</span></div>
        <div class="gi-bar gi-bar--morality"><span>ศีล</span><div class="gi-bar__track"><div class="gi-bar__marker" style="left:62%"></div></div><span>+24</span></div>
      </div>
    </div>
  </div>
</div>`),
  },
};
for (const [name, def] of Object.entries(COMPONENTS)) {
  write(`components/${name}/README.md`, def.readme + '\n');
  write(`components/${name}/preview.html`, def.preview);
}

// ---------- asset group notes ----------
const GROUP_NOTES = {
  Logo: 'The Grimm Idle logotype: yellow-orange GRIMM over green IDLE, cream sticker outline, one sparkle. Shown here at 4x; in the game at 2x or 3x on meadow-deep or wood. Never redraw, stretch or recolour it.',
  Characters: '16x24 chibi townsfolk, one per job, front-facing. Game sheets carry 2 walk frames side by side; shown here at 4x. Built from one body template so heads, outlines and shading match.',
  Monsters: 'Dungeon residents. Slime and bat are 16x16, wolf 24x16, goblin and skeleton 16x24 on the townsfolk template, the demon lord 32x32. Each has 2 animation frames in the game sheet.',
  Buildings: 'Town buildings in the 3/4 top-down view: roof seen from above, front wall below. House, shop 32x32; inn 40x36; guild 48x40; church 32x48; castle 64x56; dungeon mouth 48x32.',
  Tiles: '16x16 ground tiles that repeat seamlessly. Grass has 3 variants, path 2, water 2 animation frames.',
  Props: 'Scenery placed on top of tiles and depth-sorted by their bottom edge: tree (16x24), bush, fence, rock.',
  Icons: '16x16 icons with the same brown outline as the sprites. Shown at 24px (1.5x is not allowed: use 16, 32 or 48px in the game; 24px is fine in CSS UI where the 4x upload is downscaled).',
  UI: '9-slice frames for the UI kit: panel-wood (slice 8), panel-paper (6), button (6), bubble (4), plus bubble-tail and the 4-frame sparkle. Multiply the slice by 4 when using these 4x uploads.',
};
const assetGroups = {};
for (const [group, files] of Object.entries(ASSETS)) {
  write(`assets/${group}/README.md`, `# ${group}\n\n${GROUP_NOTES[group]}\n`);
  assetGroups[group] = {
    name: group,
    tile: { Logo: 'l', Buildings: 'm', Characters: 's', Monsters: 's' }[group] ?? 'xs',
    order: Object.keys(files),
    files: Object.fromEntries(Object.entries(files).map(([n, [id, size]]) => [n, { name: n, blob: id, size, type: 'image/png' }])),
  };
}

// ---------- README ----------
write('README.md', `โลกนิทานพิกเซลที่เดินไปเอง: เมืองยามกลางวัน สีสด ตัวละครตัวจิ๋ว ป้ายไม้ และกระดาษสีครีม ทุกอย่างในเกมต้องดูเหมือนหลุดมาจากหนังสือนิทานที่วาดด้วยพิกเซล

## เสียงและถ้อยคำ

- เขียนภาษาไทยแบบเล่านิทาน: ประโยคเดียวจบ ใคร ทำอะไร ที่ไหน — "เซร่าพิชิตถ้ำหนามหลับใหล ขึ้นเลเวล 3"
- ชื่อตัวละครและสถานที่คงตามต้นฉบับ (Sera → เซร่า, Gingerbread Ruins → ซากปราสาทขนมปังขิง) แต่ละชื่อใช้แบบเดียวทั้งเกม
- ปุ่มใช้คำกริยาสั้น: "ให้พร", "สาปแช่ง", "ส่งความฝัน" ไม่มีอีโมจิ ไม่ใช้ "!" ยกเว้นใน SpeechBubble
- ตัวเลข วัน เลเวล ใช้เลขอารบิกในฟอนต์ \`numeral\`: "D128", "LV 3"

## สี

- พื้นแผนที่คือ \`meadow\` พื้นรอบแผนที่และแผงคือ \`meadow-deep\` ห้ามวางตัวหนังสือบน \`meadow\` ตรงๆ
- อ่านทุกอย่างบน \`paper\` ด้วย \`ink\` (13:1) และข้อความรองด้วย \`ink-muted\`
- \`wood\` มีไว้เป็นกรอบป้ายเท่านั้น ข้อความบนไม้ต้องเป็น \`paper\` ที่มีเงา \`outline\` ขนาด 18px ขึ้นไป
- \`gold\` แปลว่าศรัทธาและพร \`demon\` แปลว่าความชั่วและคำสาป สองสีนี้ต่างกันด้วยความสว่าง จึงใช้คู่กันบนแถบศีลธรรมได้
- \`danger\` ต้องมาคู่กับไอคอนหัวกะโหลกเสมอ ห้ามใช้สีอย่างเดียวบอกความตาย
- เส้นขอบทุกเส้นเป็น \`outline\` (น้ำตาลเข้ม) ไม่ใช้ดำสนิท
- Keyboard focus คือเส้น \`focus\` หนา 3px ห่างออกมา 3px

## ตัวอักษร

- ภาษาไทยทั้งหมดใช้ Mitr (\`body\`) ผ่าน \`title\`, \`heading\`, \`body\`, \`small\`
- ตัวเลขและป้ายภาษาอังกฤษใช้ Pixelify Sans (\`pixel\`) ผ่าน \`numeral\`, \`label\`, \`display\`
- Pixelify Sans ไม่มีอักษรไทย ห้ามตั้งข้อความไทยด้วย \`pixel\`
- โหลดทั้งสองฟอนต์จาก Google Fonts: \`Mitr:wght@400;500;600\` และ \`Pixelify+Sans:wght@500;700\`

## พิกเซลและเลย์เอาต์

- Sprite ทุกชิ้นขยายเป็นจำนวนเต็มเท่า (\`art-scale\` = 3 ใน UI) และใส่ \`image-rendering: pixelated\` เสมอ
- ระยะทั้งหมดเป็นพหุคูณของ 1 art pixel (\`px\` = 3px): \`space-1\` 6, \`space-2\` 12, \`space-3\` 18, \`space-4\` 24, \`space-5\` 36, \`tile\` 48
- ไม่มีมุมโค้งแบบ CSS (\`radius-none\`) มุมโค้งมาจาก sprite 9-slice เท่านั้น
- เงาเป็นเงาแข็งไม่เบลอ (\`shadow-drop\`) หรือขอบนูนแบบพิกเซล (\`shadow-bevel\`)
- โครงหน้าจอ: แผนที่อยู่ซ้าย แผงป้ายไม้อยู่ขวา (พงศาวดาร, ข้อมูล NPC) แถบพลังเทพอยู่ล่าง

## การวาด asset

- มุมกล้อง 3/4 top-down: เห็นหลังคาจากด้านบนและผนังด้านหน้า
- Tile 16×16, ตัวละคร chibi 16×24 หัวโตเท่าตัว, ตึก 2×2 ถึง 4×4 tile
- เส้นขอบ 1px สี \`outline\` รอบ silhouette ด้านนอก, แสงจากซ้ายบน, เงาด้านขวาและล่าง 1 เฉด
- ใช้สีจากพาเลตเท่านั้น ห้าม gradient ห้าม anti-alias
- Sprite ทุกชิ้นสร้างจากโค้ด (\`tools/sprites\` ใน repo เกม) แก้ที่นั่นแล้ว build ใหม่ ไม่แก้ PNG ด้วยมือ

## ไอคอน

- ไอคอน 16×16 วาดชุดเดียวกับ sprite ไม่ใช้ icon font หรืออีโมจิ
- ความหมาย: faith = ศรัทธา, bless = ให้พร, curse = สาปแช่ง (คำสาปกบ), dream = ส่งความฝัน, gold = ทอง, quest = เควส, sword = การต่อสู้, staff = เวทมนตร์, heart = ชีวิต/สำเร็จ, skull = ความตาย, crown = การเมือง
`);

// ---------- cover ----------
write('components/Cover/preview.html', `<!-- @dsCard height=300 -->
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Grimm Idle</title>
<style>
  html, body { margin:0; height:100%; }
  body { background:var(--paper); color:var(--ink); font-family:var(--font-body); overflow:hidden; }
  .cover { position:relative; height:300px; overflow:hidden; }
  .art { position:absolute; top:0; left:480px; width:480px; height:300px; }
  .art svg { display:block; width:480px; height:300px; shape-rendering:crispEdges; }
  .meadow { fill:var(--meadow); }
  .deep { fill:var(--meadow-deep); }
  .wood { fill:var(--wood); }
  .gold { fill:var(--gold); }
  .demon { fill:var(--demon); }
  .edge { fill:var(--paper-edge); }
  .words { position:absolute; left:36px; bottom:36px; max-width:440px; }
  .name { margin:0; font-family:var(--font-pixel); font-weight:700; font-size:104px; line-height:.95; color:var(--ink); }
  .tag { margin:12px 0 0 4px; font-size:14px; line-height:20px; color:var(--ink-muted); }
</style>
</head>
<body>
<div class="cover">
<div class="art" aria-hidden="true">
<svg viewBox="0 0 480 300" width="480" height="300">
<!--
  blocks      meadow 192x300 slab bleeding top and bottom (the map, largest) · meadow-deep 96x204 · wood 120x144 · gold 72x72 · demon 48x96 bleeding right (the one villain) — about 40% of 960x300
  arrangement one tall meadow slab with satellites stepped down and right, square corners (radius-none), 12px gutters
  pattern     pixel staircase: blocks' top-right corners eroded into 12px steps, and loose 12px pixels drifting off them, from "everything sits on the art pixel" and the 3/4 tile view
  scales      sides in tile (48) and space-2 (12) multiples; gutters space-2; step and pixel size space-2; corners radius-none
-->
<rect class="meadow" x="0" y="0" width="192" height="300"/>
<rect class="edge" x="180" y="0" width="12" height="12"/>
<rect class="edge" x="168" y="0" width="12" height="12"/>
<rect class="edge" x="180" y="12" width="12" height="12"/>
<rect class="deep" x="204" y="96" width="96" height="204"/>
<rect class="edge" x="288" y="96" width="12" height="12"/>
<rect class="deep" x="204" y="72" width="12" height="12"/>
<rect class="deep" x="228" y="48" width="12" height="12"/>
<rect class="wood" x="312" y="156" width="120" height="144"/>
<rect class="edge" x="420" y="156" width="12" height="12"/>
<rect class="edge" x="408" y="156" width="12" height="12"/>
<rect class="edge" x="420" y="168" width="12" height="12"/>
<rect class="wood" x="324" y="132" width="12" height="12"/>
<rect class="gold" x="312" y="48" width="72" height="72"/>
<rect class="edge" x="372" y="48" width="12" height="12"/>
<rect class="gold" x="396" y="24" width="12" height="12"/>
<rect class="gold" x="420" y="72" width="12" height="12"/>
<rect class="demon" x="444" y="204" width="48" height="96"/>
<rect class="demon" x="456" y="180" width="12" height="12"/>
</svg>
</div>
<div class="words">
<h1 class="name">Grimm<br>Idle</h1>
<p class="tag">โลกนิทานพิกเซลที่เดินไปเอง</p>
</div>
</div>
</body>
</html>
`);

// ---------- index (written last by the publish call) ----------
const now = new Date().toISOString();
write('design-system.json', JSON.stringify({
  v: 3,
  layout: 'files',
  createdOnFiles: { v: 1, at: now },
  title: 'Grimm Idle',
  namespace: 'GrimmIdle',
  libraries: [],
  sections: {},
  groups: Object.keys(ASSETS),
  assetGroups,
  blobs: {},
  docs: { sections: [] },
  lastChange: { by: 'Claude', at: now, via: 'Claude Code', note: 'First system: palette, Thai type, pixel UI kit, 48 sprites' },
}, null, 2));

console.log('written');
