import * as Phaser from 'phaser';
import { HOME, type Realm, type WorldState } from '../../sim';
import { createRng, next } from '../../sim/rng';
import { MAP_H, MAP_W } from '../../sim/town';
import { TILE } from './WorldScene';

// Banner colours, matching the palette characters realms are given.
const FLAG: Record<string, number> = { r: 0xe8503a, b: 0x4a86e0, y: 0xffd23f, g: 0x56a832, a: 0x7fd8f8, v: 0x9a66e0 };

type Ground = 'grass' | 'water' | 'sand' | 'road';

// The continent around the town: our walls in the middle, the neighbours' keeps in the
// corners, each set in its own country (mountains, coast, desert or deep forest), with
// roads running home. Laid out from the world's seed, so it never changes within an era.
export class WorldMapScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private built = false;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private lastKey = '';
  onRealm: (realm: Realm | null) => void = () => {};

  constructor() {
    super({ key: 'worldmap', active: false });
  }

  setWorld(world: WorldState): void {
    this.world = world;
  }

  create(): void {
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const r = this.world?.realms?.find((x) => Math.abs(p.worldX - (x.x * TILE + TILE / 2)) < 22 && Math.abs(p.worldY - x.y * TILE) < 24);
      this.onRealm(r ?? null);
    });
  }

  update(): void {
    const w = this.world;
    if (!w?.realms) return;
    // The town scene loads every texture; wait for the last ones before laying the map out.
    if (!this.built && !this.textures.exists('wm-town')) return;
    if (!this.built) this.build(w);
    // Relations and rulers change slowly; refresh the labels when they do.
    const key = JSON.stringify(w.realms.map((r) => [r.ruler.name, Math.round(r.relation / 10)]));
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const r of w.realms) this.labels.get(r.id)?.setText(r.name).setColor(r.relation <= -15 ? '#ffb0b0' : r.relation >= 15 ? '#d8ffb0' : '#fff4d6');
  }

  private build(w: WorldState): void {
    this.built = true;
    const rng = createRng(w.seed ^ 0x5eed);
    const rand = () => next(rng);
    const realms = w.realms!;
    const ground: Ground[] = new Array(MAP_W * MAP_H).fill('grass');
    const props: (string | null)[] = new Array(MAP_W * MAP_H).fill(null);
    const at = (x: number, y: number) => y * MAP_W + x;
    const near = (x: number, y: number, r: { x: number; y: number }) => Math.hypot(x - r.x, (y - r.y) * 1.3);

    // A ragged sea all around the continent.
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
        if (edge === 0 || (edge === 1 && rand() < 0.55)) ground[at(x, y)] = 'water';
      }
    // Each realm's own country.
    for (const r of realms)
      for (let y = 1; y < MAP_H - 1; y++)
        for (let x = 1; x < MAP_W - 1; x++) {
          const d = near(x, y, r);
          if (d > 6 || d < 1.5) continue;
          const i = at(x, y);
          const roll = rand();
          if (r.terrain === 'coast' && d > 3.5 && roll < 0.6) ground[i] = 'water';
          else if (r.terrain === 'desert' && roll < 0.85) ground[i] = 'sand';
          else if (r.terrain === 'mountain' && roll < 0.35) props[i] = 'wm-mountain';
          else if (r.terrain === 'forest' && roll < 0.5) props[i] = 'tree';
        }
    // Scattered woods and hills elsewhere.
    for (let i = 0; i < ground.length; i++) {
      if (ground[i] !== 'grass' || props[i]) continue;
      const x = i % MAP_W;
      const y = Math.floor(i / MAP_W);
      if (near(x, y, HOME) < 4 || realms.some((r) => near(x, y, r) < 2)) continue;
      const roll = rand();
      if (roll < 0.08) props[i] = 'tree';
      else if (roll < 0.1) props[i] = 'wm-mountain';
    }
    // Roads home from every keep: across, then up or down.
    for (const r of realms) {
      const road = (x: number, y: number) => {
        ground[at(x, y)] = 'road';
        props[at(x, y)] = null;
      };
      for (let x = Math.min(r.x, HOME.x); x <= Math.max(r.x, HOME.x); x++) road(x, r.y + 1);
      for (let y = Math.min(r.y + 1, HOME.y + 1); y <= Math.max(r.y + 1, HOME.y + 1); y++) road(HOME.x, y);
    }

    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const g = ground[at(x, y)];
        const px = x * TILE;
        const py = y * TILE;
        if (g === 'water') this.add.sprite(px, py, 'water').setOrigin(0).play('water-flow');
        else if (g === 'sand') this.add.image(px, py, 'wm-sand', (x + y) % 2).setOrigin(0);
        else if (g === 'road') this.add.image(px, py, 'path', (x * 7 + y) % 2).setOrigin(0);
        else this.add.image(px, py, 'grass', (x * 3 + y * 5) % 3).setOrigin(0);
        const p = props[at(x, y)];
        if (p) this.add.image(px, py + TILE, p).setOrigin(0, 1).setDepth(py + TILE);
      }

    const home = this.add.image(HOME.x * TILE + TILE / 2, HOME.y * TILE + TILE, 'wm-town').setOrigin(0.5, 1).setDepth(10_000);
    this.label(home.x, home.y + 2, 'เมืองของเรา');
    for (const r of realms) {
      const cx = r.x * TILE + TILE / 2;
      const cy = r.y * TILE + TILE;
      this.add.image(cx, cy, 'wm-castle').setOrigin(0.5, 1).setDepth(10_000);
      this.add.image(cx + 4, cy - 24, 'wm-flag').setOrigin(0, 0).setTint(FLAG[r.color] ?? 0xffffff).setDepth(10_001);
      this.labels.set(r.id, this.label(cx, cy + 2, r.name));
    }
  }

  private label(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: 'Mitr', fontSize: '10px', color: '#fff4d6', stroke: '#3b2416', strokeThickness: 3, resolution: 3 })
      .setOrigin(0.5, 0)
      .setDepth(10_002);
  }
}
