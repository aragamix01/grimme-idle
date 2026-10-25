import * as Phaser from 'phaser';
import { ADULT_AGE, type Npc, type WorldState } from '../../sim';
import { MAP_H, MAP_W, townLayout, type Placed } from '../../sim/town';
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
      if (s.frames > 1 && (s.group === 'characters' || s.group === 'monsters')) {
        this.anims.create({ key: `${key}-walk`, frames: this.anims.generateFrameNumbers(key, {}), frameRate: 5, repeat: -1 });
      }
    }
    this.anims.create({ key: 'water-flow', frames: this.anims.generateFrameNumbers('water', {}), frameRate: 2, repeat: -1 });
    this.anims.create({ key: 'sparkle-twinkle', frames: this.anims.generateFrameNumbers('sparkle', {}), frameRate: 8, repeat: -1, yoyo: true });
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

  update(): void {
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

  private syncNpc(npc: Npc): void {
    const look = npc.age < ADULT_AGE ? 'child' : npc.job; // children share one sprite until they pick a calling
    let sprite = this.npcSprites.get(npc.id);
    const px = npc.x * TILE + TILE / 2;
    const py = npc.y * TILE + TILE;
    if (!sprite) {
      sprite = this.add.sprite(px, py, look).setOrigin(0.5, 1).play(`${look}-walk`);
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
    if (sprite.texture.key !== look) sprite.setTexture(look).play(`${look}-walk`);
    if (px !== sprite.x) sprite.setFlipX(px < sprite.x);
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
