import * as Phaser from 'phaser';
import { ADULT_AGE, type Npc, type WorldState } from '../../sim';
import { MAP_H, MAP_W, dungeonDoor, townLayout, type Placed } from '../../sim/town';
import { snap, walk } from '../../sim/nav';
import { createRng } from '../../sim/rng';
import manifest from '../sprite-manifest.json';

export const TILE = 16;

interface SpriteEntry {
  file: string;
  group: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
}
const SPRITES = manifest as Record<string, SpriteEntry>;

// Character sheets hold two walk frames per facing: down, up, side (facing right).
const FACINGS = ['down', 'up', 'side'] as const;

// A slow ambient day: one turn of the sky every CYCLE_DAYS in-game days.
const CYCLE_DAYS = 16;
const NIGHT_ALPHA = 0.5;
const DUSK = Phaser.Display.Color.ValueToColor(0xff8a3d);
const NIGHT = Phaser.Display.Color.ValueToColor(0x1a2466);
const BLOOD = Phaser.Display.Color.ValueToColor(0x5a1030); // the sky when the world tips toward darkness

// Window glass inside each building's art (x, y, w, h in sprite pixels), lit after dark.
const WINDOWS: Record<string, [number, number, number, number][]> = {
  house: [[6, 21, 4, 3], [22, 21, 4, 3]],
  shop: [[5, 22, 12, 4]],
  inn: [[7, 21, 4, 2], [29, 21, 4, 2], [7, 28, 4, 3], [29, 28, 4, 3]],
  guild: [[8, 26, 4, 3], [36, 26, 4, 3]],
  church: [[14, 35, 4, 3], [6, 36, 2, 4], [24, 36, 2, 4]],
  castle: [[7, 23, 3, 4], [54, 23, 3, 4], [30, 23, 4, 5]],
};
WINDOWS.barracks = [[7, 21, 4, 3], [37, 21, 4, 3]];
WINDOWS.brothel = [[6, 19, 4, 3], [22, 19, 4, 3], [6, 29, 3, 3], [13, 20, 6, 4]];
WINDOWS.manor = [6, 14, 28, 36].flatMap((x) => [[x + 1, 22, 4, 3], [x + 1, 31, 4, 3]] as [number, number, number, number][]);
WINDOWS.forge = [[6, 25, 5, 4]];
WINDOWS['house-red'] = WINDOWS['house-blue'] = WINDOWS.house;

const STAMPEDE_MONSTERS = ['slime', 'goblin', 'skeleton', 'wolf', 'bat', 'goblin', 'slime', 'wolf', 'skeleton', 'bat'];

export class WorldScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private npcSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private blessMarks = new Map<number, Phaser.GameObjects.Sprite>();
  private selectRing!: Phaser.GameObjects.Graphics;
  private selectedId: number | null = null;
  private townBuilt = false;
  private lastKey = '';
  tickMs = 500;
  onSelect: (id: number | null) => void = () => {};
  onGuild: () => void = () => {};
  private guildBounds: Phaser.Geom.Rectangle | null = null;
  private sky!: Phaser.GameObjects.Rectangle;
  private glow!: Phaser.GameObjects.Graphics;
  private clock = -1; // eased copy of world.day, so the sky turns smoothly between ticks
  private seenSeq = -1; // last chronicle entry the scene has reacted to
  private keep: Phaser.GameObjects.Image | null = null; // the demon lord's castle, while it stands

  constructor() {
    super('world');
  }

  preload(): void {
    for (const [key, s] of Object.entries(SPRITES)) {
      if (s.frames > 1) this.load.spritesheet(key, s.file, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
      else this.load.image(key, s.file);
    }
  }

  create(): void {
    for (const [key, s] of Object.entries(SPRITES)) {
      if (s.group === 'characters' && s.frames === 6) {
        FACINGS.forEach((f, i) =>
          this.anims.create({ key: `${key}-${f}`, frames: this.anims.generateFrameNumbers(key, { start: i * 2, end: i * 2 + 1 }), frameRate: 5, repeat: -1 }),
        );
      } else if (s.frames > 1 && s.group === 'monsters') {
        this.anims.create({ key: `${key}-walk`, frames: this.anims.generateFrameNumbers(key, {}), frameRate: 5, repeat: -1 });
      }
    }
    this.anims.create({ key: 'water-flow', frames: this.anims.generateFrameNumbers('water', {}), frameRate: 2, repeat: -1 });
    this.anims.create({ key: 'sparkle-twinkle', frames: this.anims.generateFrameNumbers('sparkle', {}), frameRate: 8, repeat: -1, yoyo: true });
    // The sky: a tint over the whole map, and lit windows that shine through it.
    this.sky = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, NIGHT.color).setOrigin(0).setDepth(20_000).setAlpha(0);
    this.glow = this.add.graphics().setDepth(20_001).setAlpha(0);

    // Gold ring under the selected NPC's feet.
    this.selectRing = this.add.graphics().setVisible(false);
    this.selectRing.lineStyle(2, 0x3b2416).strokeEllipse(0, 0, 18, 8);
    this.selectRing.lineStyle(1, 0xffd23f).strokeEllipse(0, 0, 16, 6);

    // Click picks the nearest living NPC within reach; empty ground clears the selection.
    // Reach is at least 24 screen pixels so tiny sprites on a phone are still tappable.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const k = this.game.canvas.getBoundingClientRect().width / this.scale.gameSize.width;
      let best: number | null = null;
      let bestD = Math.max(14, 24 / k);
      for (const [id, s] of this.npcSprites) {
        if (!s.visible) continue;
        const d = Phaser.Math.Distance.Between(p.worldX, p.worldY, s.x, s.y - 10);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      if (best === null && this.guildBounds?.contains(p.worldX, p.worldY)) return this.onGuild();
      this.select(best);
      this.onSelect(best);
    });
  }

  setWorld(world: WorldState): void {
    this.world = world;
  }

  select(id: number | null): void {
    this.selectedId = id;
    this.selectRing?.setVisible(id !== null);
  }

  // Client-space position of an NPC's head, for DOM overlays such as speech bubbles.
  npcScreenPos(id: number): { x: number; y: number } | null {
    const s = this.npcSprites.get(id);
    if (!s || !s.visible) return null;
    const rect = this.game.canvas.getBoundingClientRect();
    if (!rect.width) return null; // not laid out yet
    const k = rect.width / this.scale.gameSize.width;
    return { x: rect.left + s.x * k, y: rect.top + (s.y - s.height) * k };
  }

  update(_time: number, delta: number): void {
    this.turnSky(delta);
    if (this.selectedId !== null) {
      const s = this.npcSprites.get(this.selectedId);
      if (s?.visible) this.selectRing.setPosition(s.x, s.y - 1).setDepth(s.depth - 1);
      else this.selectRing.setVisible(false);
    }
    const w = this.world;
    // Powers used while paused change the world without advancing the day, so key on both.
    const key = w ? `${w.day}:${w.chronicleSeq}` : '';
    if (!w || key === this.lastKey) return;
    this.lastKey = key;
    if (!this.townBuilt) this.buildTown(w);
    this.syncKeep(w);
    this.watchChronicle(w);
    for (const npc of w.npcs) this.syncNpc(npc);
    // The sim prunes long-dead NPCs; drop their sprites too.
    if (this.npcSprites.size > w.npcs.length) {
      const ids = new Set(w.npcs.map((n) => n.id));
      for (const [id, s] of this.npcSprites) {
        if (ids.has(id)) continue;
        s.destroy();
        this.blessMarks.get(id)?.destroy();
        this.npcSprites.delete(id);
        this.blessMarks.delete(id);
      }
    }
  }

  // The keep rises behind the dungeon when the demon lord wakes and crumbles when it falls.
  private syncKeep(w: WorldState): void {
    const d = w.dungeons[0];
    if (w.demon && !this.keep && d) {
      const k = this.add.image(d.x * TILE + TILE, (d.y + 2) * TILE - 18, 'demon-castle').setOrigin(0.5, 1);
      k.setDepth(k.y - 20);
      this.keep = k;
      if (this.seenSeq >= 0) {
        k.setAlpha(0).setScale(1, 0.2);
        this.tweens.add({ targets: k, alpha: 1, scaleY: 1, duration: 1500, ease: 'Back.out' });
        this.cameras.main.shake(800, 0.006);
      }
    } else if (!w.demon && this.keep) {
      const k = this.keep;
      this.keep = null;
      this.cameras.main.shake(600, 0.005);
      this.tweens.add({ targets: k, alpha: 0, scaleY: 0.1, duration: 1200, ease: 'Quad.in', onComplete: () => k.destroy() });
    }
  }

  // The town comes from the same layout the sim walks on, built once the world
  // (and so where its dungeons are) is known.
  private buildTown(w: WorldState): void {
    const town = townLayout(w.dungeons);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const g = town.ground[y * MAP_W + x];
        const px = x * TILE;
        const py = y * TILE;
        if (g === 'water') this.add.sprite(px, py, 'water').setOrigin(0).play('water-flow');
        else if (g === 'road') this.add.image(px, py, 'path', Math.floor(rand() * 2)).setOrigin(0);
        else if (g === 'crops') this.add.image(px, py, 'crops', (x + Math.floor(y / 2)) % 5 === 0 ? 1 : 0).setOrigin(0);
        else if (rand() < 0.06) this.add.image(px, py, 'flowers').setOrigin(0);
        else this.add.image(px, py, 'grass', Math.floor(rand() * 3)).setOrigin(0);
      }
    for (const p of town.props) {
      const img = this.placeProp(p);
      if (p.key === 'guild') this.guildBounds = img.getBounds();
      for (const [x, y, ww, h] of WINDOWS[p.key] ?? []) {
        this.glow.fillStyle(0xffb347, 0.35).fillRect(img.x + x - 1, img.y + y - 1, ww + 2, h + 2);
        this.glow.fillStyle(0xffe27a, 1).fillRect(img.x + x, img.y + y, ww, h);
      }
    }
    for (const d of w.dungeons) {
      const img = this.add.image(d.x * TILE + TILE, (d.y + 2) * TILE, 'dungeon').setOrigin(0.5, 1);
      img.setDepth(img.y);
      // A couple of residents loiter at the entrance.
      this.add.sprite(img.x - 28, img.y + 8, 'slime').setOrigin(0.5, 1).setDepth(img.y + 8).play('slime-walk');
      this.add.sprite(img.x + 24, img.y - 30, 'bat').setOrigin(0.5, 1).setDepth(img.y + 40).play('bat-walk');
    }
    this.townBuilt = true;
  }

  private placeProp(p: Placed): Phaser.GameObjects.Image {
    // Flat tiles (the side walls) lie under everyone; anything standing sorts by its base.
    if (p.key === 'wall-top') return this.add.image(p.x * TILE, p.y * TILE, p.key).setOrigin(0).setDepth(0);
    const img =
      p.anchor === 'top'
        ? this.add.image(p.x * TILE, p.y * TILE, p.key).setOrigin(0)
        : this.add.image(p.x * TILE, (p.y + 1) * TILE, p.key).setOrigin(0, 1);
    img.setDepth(img.getBounds().bottom);
    return img;
  }

  // Dusk shades orange into night blue; noon is clear.
  private turnSky(delta: number): void {
    const w = this.world;
    if (!w) return;
    if (this.clock < 0) this.clock = w.day;
    this.clock += (w.day - this.clock) * Math.min(1, delta / this.tickMs);
    const t = (this.clock % CYCLE_DAYS) / CYCLE_DAYS; // 0 noon, 0.5 midnight
    const dark = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    const night = Phaser.Math.Clamp((dark - 0.3) / 0.5, 0, 1);
    const sky = Phaser.Display.Color.Interpolate.ColorWithColor(DUSK, NIGHT, 100, Math.round(night * 100));
    // A dark world stains the sky blood red, even at noon.
    // The demon lord's shadow darkens it further, most of all over an occupied town.
    const dread = w.demon ? (w.demon.stage === 'occupied' ? 1 : 0.6) : 0;
    const evil = Math.max(dread, Phaser.Math.Clamp((-(w.balance ?? 0) - 20) / 40, 0, 1));
    const tint = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(Phaser.Display.Color.GetColor(sky.r, sky.g, sky.b)), BLOOD, 100, Math.round(evil * 60));
    this.sky.setFillStyle(Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b)).setAlpha(Math.max(night * NIGHT_ALPHA, evil * (w.demon?.stage === 'occupied' ? 0.32 : 0.22)));
    this.glow.setAlpha(Phaser.Math.Clamp((night - 0.4) / 0.4, 0, 1));
  }

  // React to fresh chronicle entries that have something to show on the map.
  private watchChronicle(w: WorldState): void {
    if (this.seenSeq < 0) this.seenSeq = w.chronicleSeq; // don't replay history on load
    for (const e of w.chronicle) {
      if (e.seq <= this.seenSeq) continue;
      if (e.kind === 'disaster') {
        const d = w.dungeons.find((x) => e.text.includes(x.name));
        if (d) this.stampede(w, d, e.text.includes('จอมมาร'));
      }
    }
    this.seenSeq = w.chronicleSeq;
  }

  // Monsters pour out of the dungeon, run the forest trail and through the east gate,
  // and scatter about town before melting away.
  private stampede(w: WorldState, d: WorldState['dungeons'][number], host = false): void {
    this.cameras.main.shake(500, 0.004);
    const rng = createRng(w.day);
    const door = dungeonDoor(d);
    // The demon lord's own host comes led by the lord himself.
    const monsters = host ? ['demon-lord', ...STAMPEDE_MONSTERS, 'skeleton', 'goblin'] : STAMPEDE_MONSTERS;
    monsters.forEach((key, i) => {
      const pos = { ...door };
      const goal = snap(w, { x: 3 + ((i * 7) % 22), y: 3 + ((i * 5) % 13) });
      const steps: { x: number; y: number }[] = [];
      for (let n = 0; n < 90 && (pos.x !== goal.x || pos.y !== goal.y); n++) {
        if (!walk(w, pos, goal, rng)) break;
        steps.push({ ...pos });
      }
      const at = (s: { x: number; y: number }) => ({ x: s.x * TILE + TILE / 2, y: s.y * TILE + TILE });
      const start = at(door);
      const m = this.add.sprite(start.x, start.y, key).setOrigin(0.5, 1).setAlpha(0).play(`${key}-walk`);
      const tileMs = key === 'wolf' || key === 'bat' ? 90 : 140;
      let prev = start;
      this.tweens.chain({
        targets: m,
        delay: i * 220,
        tweens: [
          { alpha: 1, duration: 150 },
          ...steps.map((s) => {
            const p = at(s);
            const from = prev;
            prev = p;
            return {
              x: p.x,
              y: p.y,
              duration: tileMs,
              onStart: () => m.setFlipX(p.x < from.x),
              onUpdate: () => m.setDepth(m.y + (key === 'bat' ? 40 : 0)),
            };
          }),
          { y: '-=4', duration: 120, yoyo: true, repeat: 5 },
          { alpha: 0, duration: 800 },
        ],
        onComplete: () => m.destroy(),
      });
    });
  }

  private syncNpc(npc: Npc): void {
    // Children share one sprite until they pick a calling; cultists don their robes for the walk to a ritual.
    const look = npc.age < ADULT_AGE ? 'child' : npc.plan?.kind === 'ritual' ? 'cultist' : npc.hero && npc.job !== 'king' ? 'hero' : npc.job;
    let sprite = this.npcSprites.get(npc.id);
    const px = npc.x * TILE + TILE / 2;
    const py = npc.y * TILE + TILE;
    if (!sprite) {
      sprite = this.add.sprite(px, py, look).setOrigin(0.5, 1).play(`${look}-down`);
      sprite.anims.setProgress(Math.random());
      this.npcSprites.set(npc.id, sprite);
    }
    // Dead, or deep inside a dungeon: off the map until they walk back out.
    if (!npc.alive || npc.inside !== undefined) {
      sprite.setVisible(false).setPosition(px, py);
      this.blessMarks.get(npc.id)?.setVisible(false);
      return;
    }
    sprite.setVisible(true);
    // Face the way they're walking; standing still, face the viewer.
    const dx = px - sprite.x;
    const dy = py - sprite.y;
    const facing = Math.abs(dx) >= Math.abs(dy) && dx !== 0 ? 'side' : dy < 0 ? 'up' : 'down';
    sprite.setFlipX(facing === 'side' && dx < 0);
    sprite.play(`${look}-${facing}`, sprite.texture.key === look);
    this.tweens.add({
      targets: sprite,
      x: px,
      y: py,
      duration: this.tickMs * 0.9,
      onUpdate: () => sprite!.setDepth(sprite!.y),
    });

    let mark = this.blessMarks.get(npc.id);
    if (npc.blessed && !mark) {
      mark = this.add.sprite(px, py - 26, 'sparkle').play('sparkle-twinkle');
      this.blessMarks.set(npc.id, mark);
    }
    if (mark) {
      mark.setVisible(npc.blessed);
      this.tweens.add({ targets: mark, x: px + 6, y: py - 24, duration: this.tickMs * 0.9 });
      mark.setDepth(10_000);
    }
  }
}
