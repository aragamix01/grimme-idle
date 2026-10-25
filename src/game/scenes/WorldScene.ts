import * as Phaser from 'phaser';
import type { Npc, WorldState } from '../../sim';
import manifest from '../sprite-manifest.json';

export const TILE = 16;
const MAP_W = 40;
const MAP_H = 25;

interface SpriteEntry {
  file: string;
  group: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
}
const SPRITES = manifest as Record<string, SpriteEntry>;

// Hand-placed town on the west side; the dungeon sits in the eastern forest (set by the sim).
const TOWN: [key: string, tx: number, ty: number][] = [
  ['castle', 1, 0],
  ['guild', 6, 1],
  ['inn', 10, 1],
  ['church', 14, 0],
  ['house', 2, 6],
  ['shop', 5, 6],
  ['house', 8, 6],
  ['house', 11, 6],
];

export class WorldScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private npcSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private blessMarks = new Map<number, Phaser.GameObjects.Sprite>();
  private dungeonPlaced = false;
  private lastDay = -1;
  tickMs = 500;

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
    this.buildGround();
    for (const [key, tx, ty] of TOWN) this.placeProp(key, tx, ty);
  }

  setWorld(world: WorldState): void {
    this.world = world;
  }

  update(): void {
    const w = this.world;
    if (!w || w.day === this.lastDay) return;
    this.lastDay = w.day;
    if (!this.dungeonPlaced) this.placeDungeons(w);
    for (const npc of w.npcs) this.syncNpc(npc);
  }

  private buildGround(): void {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const onPath = y === 5 || y === 10 || (x === 18 && y >= 5);
        const inPond = x >= 2 && x <= 6 && y >= 14 && y <= 17;
        if (inPond) this.add.sprite(x * TILE, y * TILE, 'water').setOrigin(0).play('water-flow');
        else if (onPath) this.add.image(x * TILE, y * TILE, 'path', Math.floor(rand() * 2)).setOrigin(0);
        else if (rand() < 0.06) this.add.image(x * TILE, y * TILE, 'flowers').setOrigin(0);
        else this.add.image(x * TILE, y * TILE, 'grass', Math.floor(rand() * 3)).setOrigin(0);
      }
    // Forest along the north and east edges, leaving the town and paths open.
    for (let i = 0; i < 70; i++) {
      const x = 20 + Math.floor(rand() * 20);
      const y = Math.floor(rand() * MAP_H);
      if (y === 10) continue;
      this.placeProp(rand() < 0.8 ? 'tree' : 'bush', x, y);
    }
    for (let x = 0; x < 18; x += 1) if (x % 4 !== 2) this.placeProp('fence', x, 11);
    this.placeProp('rock', 7, 16);
  }

  private placeProp(key: string, tx: number, ty: number): Phaser.GameObjects.Image {
    const img = this.add.image(tx * TILE, ty * TILE, key).setOrigin(0);
    img.setDepth(img.y + img.height);
    return img;
  }

  private placeDungeons(w: WorldState): void {
    for (const d of w.dungeons) {
      const img = this.add.image(d.x * TILE + TILE, (d.y + 2) * TILE, 'dungeon').setOrigin(0.5, 1);
      img.setDepth(img.y);
      // A couple of residents loiter at the entrance.
      this.add.sprite(img.x - 28, img.y + 8, 'slime').setOrigin(0.5, 1).setDepth(img.y + 8).play('slime-walk');
      this.add.sprite(img.x + 24, img.y - 30, 'bat').setOrigin(0.5, 1).setDepth(img.y + 40).play('bat-walk');
    }
    this.dungeonPlaced = true;
  }

  private syncNpc(npc: Npc): void {
    let sprite = this.npcSprites.get(npc.id);
    const px = npc.x * TILE + TILE / 2;
    const py = npc.y * TILE + TILE;
    if (!sprite) {
      sprite = this.add.sprite(px, py, npc.job).setOrigin(0.5, 1).play(`${npc.job}-walk`);
      sprite.anims.setProgress(Math.random());
      this.npcSprites.set(npc.id, sprite);
    }
    if (!npc.alive) {
      sprite.setVisible(false);
      this.blessMarks.get(npc.id)?.setVisible(false);
      return;
    }
    if (sprite.texture.key !== npc.job) sprite.setTexture(npc.job).play(`${npc.job}-walk`);
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
