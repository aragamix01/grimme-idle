// Renders every sprite to public/assets/sprites (1x, for the game) and
// design/assets (4x, for the design system), plus a manifest and a contact sheet.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid, sheet, toPng } from './lib.mjs';
import { PALETTE } from './palette.mjs';
import { bodyMonsters, characters } from './chars.mjs';
import { monsters } from './monsters.mjs';
import { buildings, tiles } from './world.mjs';
import { icons, uiParts } from './ui.mjs';
import { vehicles } from './vehicles.mjs';
import { bosses, dungeonKinds } from './dungeons.mjs';
import { worldmap } from './worldmap.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gameDir = join(root, 'public', 'assets', 'sprites');
const designDir = join(root, 'design', 'assets');
const DESIGN_SCALE = 4;

const assets = [...characters(), ...bodyMonsters(), ...monsters(), ...bosses(), ...vehicles(), ...tiles(), ...buildings(), ...dungeonKinds(), ...worldmap(), ...icons(), ...uiParts()];

rmSync(gameDir, { recursive: true, force: true });
rmSync(designDir, { recursive: true, force: true });

// Names key the manifest and the scene's textures, so two assets may never share one.
const dupes = assets.map((a) => a.name).filter((n, i, all) => all.indexOf(n) !== i);
if (dupes.length) throw new Error(`duplicate sprite names: ${dupes.join(", ")}`);

const manifest = {};
for (const a of assets) {
  const s = sheet(a.frames);
  const file = `${a.group}/${a.name}.png`;
  mkdirSync(join(gameDir, a.group), { recursive: true });
  mkdirSync(join(designDir, a.group), { recursive: true });
  writeFileSync(join(gameDir, file), toPng(s, PALETTE, 1));
  // Design system shows one frame per asset, upscaled so <img> stays crisp.
  writeFileSync(join(designDir, file), toPng(a.frames[0], PALETTE, DESIGN_SCALE));
  manifest[a.name] = {
    file: `assets/sprites/${file}`,
    group: a.group,
    frameWidth: a.frames[0].w,
    frameHeight: a.frames[0].h,
    frames: a.frames.length,
    ...(a.slice ? { slice: a.slice } : {}),
  };
}
writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(root, 'src', 'game', 'sprite-manifest.json'), JSON.stringify(manifest, null, 2));

// Contact sheet for eyeballing the set on grass, at 3x.
const groups = [...new Set(assets.map((a) => a.group))];
const html = `<!doctype html><meta charset="utf-8"><title>Sprite sheet</title>
<style>
body{margin:0;padding:16px;background:#8fd64e;font:12px system-ui;color:#3b2416}
h2{margin:16px 0 8px;font-size:14px}
.row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}
figure{margin:0;text-align:center}
img{image-rendering:pixelated;display:block;margin:0 auto 4px}
</style>
${groups
  .map(
    (g) => `<h2>${g}</h2><div class="row">${assets
      .filter((a) => a.group === g)
      .map((a) => {
        const s = sheet(a.frames);
        return `<figure><img src="assets/sprites/${a.group}/${a.name}.png" width="${s.w * 3}" height="${s.h * 3}"><figcaption>${a.name}</figcaption></figure>`;
      })
      .join('')}</div>`,
  )
  .join('')}`;
writeFileSync(join(root, 'public', 'sprite-sheet.html'), html);

// Same contact sheet as one PNG (shelf-packed on grass) for quick review without a browser.
const SHEET_W = 320;
const placed = [];
let cx = 4, cy = 4, rowH = 0;
for (const a of assets) {
  const s = sheet(a.frames);
  if (cx + s.w > SHEET_W) {
    cx = 4;
    cy += rowH + 6;
    rowH = 0;
  }
  placed.push([s, cx, cy]);
  cx += s.w + 6;
  rowH = Math.max(rowH, s.h);
}
const contact = new Grid(SHEET_W, cy + rowH + 4, 'g');
for (const [s, x, y] of placed) contact.layer(s, x, y);
writeFileSync(join(root, 'design', 'contact-sheet.png'), toPng(contact, PALETTE, 3));

console.log(`${assets.length} sprites written`);
