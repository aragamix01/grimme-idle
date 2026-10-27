import * as Phaser from 'phaser';
import { USES, levelOf, type LandUse, type Region, type WorldState } from '../../sim';
import { createRng, next } from '../../sim/rng';
import { MAP_H, MAP_W } from '../../sim/town';
import { TILE } from './WorldScene';
import { OUR_COLOR } from './WorldMapScene';

const FLAG: Record<string, number> = { r: 0xe8503a, b: 0x4a86e0, y: 0xffd23f, g: 0x56a832, a: 0x7fd8f8, v: 0x9a66e0 };

// One region up close, in broad strokes: its kind of land, and what its owner has raised on
// it. Each use gets its own stretch of the map (fields, a fenced pasture, mines in the rock,
// a logging camp, boats off the shore) and grows with its level; settlers' huts line the road.
// Laid out from the region's id, so it looks the same every visit; redrawn when its works change.
export class RegionScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private regionId: number | null = null;
  private key = '';
  private drawn: Phaser.GameObjects.GameObject[] = []; // loose, not in a container, so the props sort by depth

  constructor() {
    super({ key: 'region', active: false });
  }

  setWorld(world: WorldState): void {
    this.world = world;
  }

  show(id: number): void {
    this.regionId = id;
    this.key = '';
  }

  update(): void {
    const r = this.world?.regions?.find((x) => x.id === this.regionId);
    if (!r || !this.textures.exists('rm-hut')) return; // the town scene loads every texture; wait for the last ones
    const key = JSON.stringify([r.id, r.owner, r.dev]);
    if (key === this.key) return;
    this.key = key;
    for (const o of this.drawn) o.destroy();
    this.drawn = [];
    this.build(this.world!, r);
  }

  private put(o: Phaser.GameObjects.GameObject): void {
    this.drawn.push(o);
  }

  private build(w: WorldState, r: Region): void {
    const rng = createRng(r.id * 7919 + 13);
    const rand = () => next(rng);
    const taken = new Set<number>();
    const at = (x: number, y: number) => y * MAP_W + x;
    const shore = r.kind === 'shore';
    const sea = (x: number, y: number) => shore && y >= MAP_H - 6 + Math.round(Math.sin(x / 3) * 1.2);
    const ROAD = 12;

    // The ground and the road across it.
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const px = x * TILE;
        const py = y * TILE;
        if (sea(x, y)) {
          this.put(this.add.sprite(px, py, 'water').setOrigin(0).play('water-flow'));
          taken.add(at(x, y));
        } else if (y === ROAD) {
          this.put(this.add.image(px, py, 'path', (x * 7 + y) % 2).setOrigin(0));
          taken.add(at(x, y));
        } else if (r.kind === 'dunes') this.put(this.add.image(px, py, 'wm-sand', (x + y) % 2).setOrigin(0));
        else this.put(this.add.image(px, py, 'grass', (x * 3 + y * 5) % 3).setOrigin(0));
      }

    // Each use takes a stretch of the land; a seat is the town or keep itself.
    const zones = [
      { x0: 2, x1: 12 },
      { x0: 14, x1: 25 },
      { x0: 27, x1: 37 },
    ];
    if (r.seat) {
      const realm = typeof r.owner === 'number' ? w.realms?.find((x) => x.id === r.owner) : undefined;
      const cx = (MAP_W / 2) * TILE;
      this.put(this.add.image(cx, ROAD * TILE, realm ? 'wm-castle' : 'wm-town').setOrigin(0.5, 1).setScale(3));
      if (realm) this.put(this.add.image(cx + 12, ROAD * TILE - 72, 'wm-flag').setOrigin(0).setScale(3).setTint(FLAG[realm.color] ?? 0xffffff));
      for (let x = 17; x <= 23; x++) for (let y = ROAD - 5; y <= ROAD; y++) taken.add(at(x, y));
    } else {
      USES[r.kind].forEach((u, i) => this.work(u, levelOf(r, u), zones[i % zones.length], taken, rand));
      // Settlers' huts along the road, one for each level worked.
      const huts = Object.values(r.dev ?? {}).reduce((s, l) => s + l, 0) + (r.owner !== undefined ? 1 : 0);
      for (let i = 0; i < huts; i++) {
        const x = 4 + ((i * 11) % 33);
        const y = ROAD - 1;
        if (taken.has(at(x, y))) continue;
        taken.add(at(x, y));
        this.put(this.add.image(x * TILE + TILE / 2, (y + 1) * TILE, 'rm-hut').setOrigin(0.5, 1).setDepth((y + 1) * TILE));
      }
    }

    // What the land is like where nothing has been raised.
    const wild = { plain: 0.04, hills: 0.1, woods: 0.35, shore: 0.05, dunes: 0.03, peaks: 0.12 }[r.kind];
    for (let y = 1; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (taken.has(at(x, y)) || rand() > wild) continue;
        const prop = r.kind === 'peaks' || r.kind === 'hills' ? (rand() < 0.6 ? 'wm-mountain' : 'rock') : r.kind === 'dunes' ? 'rock' : rand() < 0.8 ? 'tree' : 'bush';
        this.put(this.add.image(x * TILE, (y + 1) * TILE, prop).setOrigin(0, 1).setDepth((y + 1) * TILE));
      }

    // Its name, and whose it is.
    const owner = r.owner === 'us' ? 'ของเรา' : r.owner === undefined ? 'ไร้เจ้าของ' : (w.realms?.find((x) => x.id === r.owner)?.name ?? '');
    this.put(
      this.add
        .text(8, 6, `${r.name} · ${owner}`, { fontFamily: 'Mitr', fontSize: '12px', color: '#fff4d6', stroke: '#3b2416', strokeThickness: 3, resolution: 3 })
        .setDepth(20_001),
    );

    // The owner's banner over the land.
    if (r.owner !== undefined) {
      const realm = typeof r.owner === 'number' ? w.realms?.find((x) => x.id === r.owner) : undefined;
      const c = r.owner === 'us' ? OUR_COLOR : (FLAG[realm?.color ?? ''] ?? 0xffffff);
      this.put(this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE).setOrigin(0).setStrokeStyle(6, c, 0.8).setDepth(20_000));
    }
  }

  // One use, worked to its level, inside its stretch of the map. Level 0 leaves the land wild.
  private work(u: LandUse, level: number, z: { x0: number; x1: number }, taken: Set<number>, rand: () => number): void {
    if (!level) return;
    const at = (x: number, y: number) => y * MAP_W + x;
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && !taken.has(at(x, y));
    const claim = (x: number, y: number) => taken.add(at(x, y));
    const prop = (x: number, y: number, key: string, frame?: number) => {
      claim(x, y);
      this.put(this.add.image(x * TILE + TILE / 2, (y + 1) * TILE, key, frame).setOrigin(0.5, 1).setDepth((y + 1) * TILE));
    };
    switch (u) {
      case 'farm': {
        // A block of crop rows for each level, a haystack at the end of each row.
        const blocks = [[2, 3, 4], [6, 7, 8], [14, 15, 16]];
        for (const y of blocks.slice(0, level).flat()) {
          for (let x = z.x0; x <= z.x1 - 1; x++) {
            if (!free(x, y)) continue;
            claim(x, y);
            this.put(this.add.image(x * TILE, y * TILE, 'crops', (x + y) % 2).setOrigin(0));
          }
          if (free(z.x1, y)) prop(z.x1, y, 'haystack');
        }
        return;
      }
      case 'pasture': {
        // A fenced field, wider each level, with beasts in it.
        const x0 = z.x0;
        const x1 = Math.min(z.x1, z.x0 + 3 + level * 2);
        const y0 = 14;
        const y1 = 14 + 2 + level;
        for (let x = x0; x <= x1; x++)
          for (const y of [y0, y1]) if (free(x, y)) prop(x, y, 'fence');
        for (let y = y0 + 1; y < y1; y++) for (const x of [x0, x1]) if (free(x, y)) prop(x, y, 'fence');
        for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) claim(x, y);
        for (let i = 0; i < level * 2; i++) {
          const x = x0 + 1 + Math.floor(rand() * (x1 - x0 - 1));
          const y = y0 + 1 + (i % Math.max(1, y1 - y0 - 1));
          const beast = i % 2 ? 'sheep' : 'cow';
          this.put(this.add.sprite(x * TILE + TILE / 2, (y + 1) * TILE, beast).setOrigin(0.5, 1).setDepth((y + 1) * TILE + 1).play(`${beast}-walk`).setFlipX(rand() < 0.5));
        }
        return;
      }
      case 'mine': {
        // A mouth in the rock for each level, spoil heaps around them.
        for (let i = 0; i < level; i++) {
          const x = z.x0 + 1 + i * 3;
          const y = 5 + (i % 2) * 2;
          if (free(x, y)) prop(x, y, 'rm-mine');
          if (free(x + 1, y + 1)) prop(x + 1, y + 1, 'rock');
        }
        for (let i = 0; i < 3 + level; i++) {
          const x = z.x0 + Math.floor(rand() * (z.x1 - z.x0));
          const y = 2 + Math.floor(rand() * 3);
          if (free(x, y)) prop(x, y, 'wm-mountain');
        }
        return;
      }
      case 'lumber': {
        // Woods with a clearing cut into them, log piles in the clearing.
        for (let i = 0; i < level * 2; i++) {
          const x = z.x0 + 1 + (i % 4) * 2;
          const y = 15 + Math.floor(i / 4) * 2;
          if (free(x, y)) prop(x, y, 'rm-logs');
        }
        for (let y = 2; y <= 9; y++) for (let x = z.x0; x <= z.x1; x++) if (free(x, y) && rand() < 0.5) prop(x, y, 'tree');
        return;
      }
      case 'fishery': {
        // Boats off the shore, more each level.
        for (let i = 0; i < level * 2; i++) {
          const x = z.x0 + 1 + i * 2;
          this.put(this.add.image(x * TILE + TILE / 2, (MAP_H - 2 - (i % 2)) * TILE, 'rm-boat').setOrigin(0.5, 1).setDepth(MAP_H * TILE));
        }
        return;
      }
    }
  }
}
