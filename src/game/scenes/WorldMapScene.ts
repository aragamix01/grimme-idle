import * as Phaser from 'phaser';
import { HOME, partition, regionAt, type Realm, type Region, type WorldState } from '../../sim';
import { createRng, next } from '../../sim/rng';
import { MAP_H, MAP_W } from '../../sim/town';
import { TILE } from './WorldScene';

// Banner colours, matching the palette characters realms are given.
const FLAG: Record<string, number> = { r: 0xe8503a, b: 0x4a86e0, y: 0xffd23f, g: 0x56a832, a: 0x7fd8f8, v: 0x9a66e0 };
export const OUR_COLOR = 0xf582b8; // our own lands, in fairy pink

type Ground = 'grass' | 'water' | 'sand' | 'road';

// The continent around the town: our walls in the middle, the neighbours' keeps in the
// corners, each set in its own country (mountains, coast, desert or deep forest), with
// roads running home. Laid out from the world's seed, so it never changes within an era.
export class WorldMapScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private built = false;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private keeps = new Map<number, { castle: Phaser.GameObjects.Image; flag: Phaser.GameObjects.Image; sick: Phaser.GameObjects.Image; ruin: Phaser.GameObjects.Image }>();
  private lastKey = '';
  private wagon: Phaser.GameObjects.Sprite | null = null;
  private swords: Phaser.GameObjects.Image | null = null;
  private ring: Phaser.GameObjects.Graphics | null = null;
  private picked: number | null = null;
  private ground: Ground[] = [];
  private lands: Phaser.GameObjects.Graphics | null = null;
  private landRing: Phaser.GameObjects.Graphics | null = null;
  private landKey = '';
  private pickedLand: number | null = null;
  private landLabels: Phaser.GameObjects.Text[] = [];
  private lairs: Phaser.GameObjects.Image[] = [];
  onRealm: (realm: Realm | null) => void = () => {};
  onRegion: (region: Region) => void = () => {};

  // A gold outline around the region picked from the map or the side panel.
  pickLand(id: number | null): void {
    this.pickedLand = id;
    this.drawLandRing();
  }

  // A gold ring under the keep picked from the map or the side panel.
  pick(id: number | null): void {
    this.picked = id;
    const r = this.world?.realms?.find((x) => x.id === id);
    if (!this.ring || !r) return void this.ring?.setVisible(false);
    this.ring.setVisible(true).setPosition(r.x * TILE + TILE / 2, (r.y + 1) * TILE);
  }

  constructor() {
    super({ key: 'worldmap', active: false });
  }

  setWorld(world: WorldState): void {
    this.world = world;
  }

  create(): void {
    // A tap picks the nearest keep within reach; reach is measured on screen, wider for a fingertip.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const k = this.game.canvas.getBoundingClientRect().width / this.scale.gameSize.width;
      const reach = Math.max(22, (p.wasTouch ? 36 : 24) / k);
      let best: Realm | null = null;
      let bestD = reach;
      for (const r of this.world?.realms ?? []) {
        const d = Math.hypot(p.worldX - (r.x * TILE + TILE / 2), p.worldY - (r.y * TILE + 4));
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      if (best || !this.world?.regions) return this.onRealm(best);
      // Open ground: the region under the finger.
      const x = Math.floor(p.worldX / TILE);
      const y = Math.floor(p.worldY / TILE);
      if (this.ground[y * MAP_W + x] === 'water') return;
      const region = regionAt(this.world, x, y);
      if (region) this.onRegion(region);
    });
  }

  update(): void {
    const w = this.world;
    if (!w?.realms) return;
    // The town scene loads every texture; wait for the last ones before laying the map out.
    if (!this.built && !this.textures.exists('wm-town')) return;
    if (!this.built) {
      this.build(w);
      this.ring = this.add.graphics().setDepth(9_999);
      this.ring.lineStyle(3, 0x3b2416).strokeEllipse(0, 0, 34, 14);
      this.ring.lineStyle(2, 0xffd23f).strokeEllipse(0, 0, 32, 12);
      this.pick(this.picked);
    }
    this.moveWagon(w);
    this.drawLands(w);
    // Crossed swords halfway to the realm we are at war with.
    const foe = w.war && w.realms.find((r) => r.id === w.war!.realmId);
    this.swords ??= this.add.image(0, 0, 'sword').setDepth(10_004).setScale(1.5);
    this.swords.setVisible(!!foe);
    if (foe) this.swords.setPosition(((foe.x + HOME.x) / 2) * TILE + TILE / 2, ((foe.y + HOME.y) / 2) * TILE + TILE / 2).setAngle(Math.sin(this.time.now / 150) * 12);
    // Relations and rulers change slowly; refresh the labels when they do.
    const key = JSON.stringify(w.realms.map((r) => [r.ruler.name, Math.round(r.relation / 10), !!r.fallen, (r.plagueUntil ?? 0) > w.day, (r.disaster?.until ?? 0) > w.day]));
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const r of w.realms) {
      this.labels.get(r.id)?.setText(r.fallen ? `${r.name} (จอมมาร)` : r.name).setColor(r.fallen ? '#d8b0ff' : r.relation <= -15 ? '#ffb0b0' : r.relation >= 15 ? '#d8ffb0' : '#fff4d6');
      // A fallen realm's keep goes dark under a black flag; a plague-struck one shows the sickness.
      const k = this.keeps.get(r.id);
      if (!k) continue;
      k.castle.setTint(r.fallen ? 0x6a4a7a : 0xffffff);
      k.flag.setTint(r.fallen ? 0x2a1a2e : (FLAG[r.color] ?? 0xffffff));
      k.sick.setVisible((r.plagueUntil ?? 0) > w.day && !r.fallen);
      k.ruin.setVisible((r.disaster?.until ?? 0) > w.day && !r.fallen);
    }
  }

  private build(w: WorldState): void {
    this.built = true;
    const rng = createRng(w.seed ^ 0x5eed);
    const rand = () => next(rng);
    const realms = w.realms!;
    const ground: Ground[] = new Array(MAP_W * MAP_H).fill('grass');
    this.ground = ground;
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
    // The open country looks like the land it is: woods, hills, peaks, dunes.
    const kinds = new Map((w.regions ?? []).map((r) => [r.id, r]));
    const grid = w.regions?.length ? partition(w).grid : [];
    for (let i = 0; i < ground.length; i++) {
      if (ground[i] !== 'grass' || props[i]) continue;
      const x = i % MAP_W;
      const y = Math.floor(i / MAP_W);
      if (near(x, y, HOME) < 4 || realms.some((r) => near(x, y, r) < 2)) continue;
      const region = kinds.get(grid[i]);
      const kind = region && !region.seat ? region.kind : 'plain';
      const roll = rand();
      if (kind === 'dunes') ground[i] = roll < 0.85 ? 'sand' : 'grass';
      else if (roll < { plain: 0.06, shore: 0.05, woods: 0.45, hills: 0.08, peaks: 0.05, dunes: 0 }[kind]) props[i] = 'tree';
      else if (roll < { plain: 0.08, shore: 0.06, woods: 0.47, hills: 0.22, peaks: 0.4, dunes: 0 }[kind]) props[i] = 'wm-mountain';
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
      const castle = this.add.image(cx, cy, 'wm-castle').setOrigin(0.5, 1).setDepth(10_000);
      const flag = this.add.image(cx + 4, cy - 24, 'wm-flag').setOrigin(0, 0).setTint(FLAG[r.color] ?? 0xffffff).setDepth(10_001);
      const sick = this.add.image(cx - 14, cy - 22, 'plague').setDepth(10_001).setVisible(false);
      const ruin = this.add.image(cx + 14, cy - 2, 'rubble').setOrigin(0.5, 1).setScale(0.5).setDepth(10_001).setVisible(false);
      this.keeps.set(r.id, { castle, flag, sick, ruin });
      this.labels.set(r.id, this.label(cx, cy + 2, r.name));
    }
  }

  // Out along the road to the partner's keep, then back again, by how much of the trip is left.
  private moveWagon(w: WorldState): void {
    const c = w.market?.caravan;
    const lead = c && w.npcs.find((n) => n.id === c.merchantId);
    const r = c && w.realms?.find((x) => x.id === c.realmId);
    if (!c || !r || !lead || lead.trip === undefined || !c.days) {
      this.wagon?.setVisible(false);
      return;
    }
    const p = 1 - lead.trip / c.days; // 0 leaving .. 1 home again
    const f = p < 0.5 ? p * 2 : (1 - p) * 2; // how far out along the road
    const pts = [
      { x: HOME.x, y: HOME.y + 1 },
      { x: HOME.x, y: r.y + 1 },
      { x: r.x, y: r.y + 1 },
    ];
    const legs = [Math.abs(pts[1].y - pts[0].y), Math.abs(pts[2].x - pts[1].x)];
    let d = f * (legs[0] + legs[1]);
    const pos = d <= legs[0] ? { x: pts[0].x, y: pts[0].y + Math.sign(pts[1].y - pts[0].y) * d } : { x: pts[1].x + Math.sign(pts[2].x - pts[1].x) * (d -= legs[0]), y: pts[1].y };
    this.wagon ??= this.add.sprite(0, 0, 'caravan').setOrigin(0.5, 1).setScale(0.6).setDepth(10_003).play('caravan-walk');
    const outbound = p < 0.5;
    this.wagon
      .setVisible(true)
      .setPosition(pos.x * TILE + TILE / 2, pos.y * TILE + TILE)
      .setFlipX(outbound ? r.x < HOME.x : r.x > HOME.x);
  }

  // The lands: each owner's regions washed in its colour, thin lines between regions and
  // a dark one where two owners meet. Redrawn only when land changes hands.
  private drawLands(w: WorldState): void {
    const regions = w.regions;
    if (!regions?.length) return;
    const key = JSON.stringify([regions.map((r) => [r.id, r.owner, !!r.danger]), w.realms?.map((r) => !!r.fallen)]);
    if (key === this.landKey) return;
    this.landKey = key;
    const { grid } = partition(w);
    const byId = new Map(regions.map((r) => [r.id, r]));
    const colorOf = (r: Region | undefined) => {
      if (!r || r.owner === undefined) return null;
      if (r.owner === 'us') return OUR_COLOR;
      const realm = w.realms?.find((x) => x.id === r.owner);
      return realm?.fallen ? 0x2a1a2e : (FLAG[realm?.color ?? ''] ?? 0xffffff);
    };
    const g = (this.lands ??= this.add.graphics().setDepth(1));
    g.clear();
    const land = (i: number) => this.ground[i] !== 'water';
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        if (!land(i)) continue;
        const c = colorOf(byId.get(grid[i]));
        if (c !== null) g.fillStyle(c, 0.26).fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const j = (y + dy) * MAP_W + x + dx;
          if (x + dx >= MAP_W || y + dy >= MAP_H || grid[i] === grid[j] || !land(i) || !land(j)) continue;
          const a = byId.get(grid[i]);
          const b = byId.get(grid[j]);
          const rival = a?.owner !== b?.owner;
          g.lineStyle(rival ? 2 : 1, 0x3b2416, rival ? 0.75 : 0.3);
          const px = (x + dx) * TILE;
          const py = (y + dy) * TILE;
          if (dx) g.lineBetween(px, y * TILE, px, (y + 1) * TILE);
          else g.lineBetween(x * TILE, py, (x + 1) * TILE, py);
        }
      }
    // Open and worked country carries its name; the seats are named by their keeps.
    for (const t of this.landLabels) t.destroy();
    this.landLabels = regions
      .filter((r) => !r.seat)
      .map((r) => this.label(r.x * TILE + TILE / 2, r.y * TILE + 4, r.name).setFontSize(8).setAlpha(0.85).setDepth(9_000));
    // A skull over every monster lair still standing in the open country.
    for (const s of this.lairs) s.destroy();
    this.lairs = regions.filter((r) => (r.danger ?? 0) > 0).map((r) => this.add.image(r.x * TILE + TILE / 2, r.y * TILE - 4, 'skull').setDepth(9_001).setAlpha(0.9));
    this.drawLandRing();
  }

  private drawLandRing(): void {
    const w = this.world;
    const ring = (this.landRing ??= this.add.graphics().setDepth(9_998));
    ring.clear();
    if (!w?.regions || this.pickedLand === null) return;
    const { grid } = partition(w);
    const id = this.pickedLand;
    ring.lineStyle(2, 0xffd23f, 1);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (grid[y * MAP_W + x] !== id) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (x === MAP_W - 1 || grid[y * MAP_W + x + 1] !== id) ring.lineBetween(px + TILE, py, px + TILE, py + TILE);
        if (x === 0 || grid[y * MAP_W + x - 1] !== id) ring.lineBetween(px, py, px, py + TILE);
        if (y === MAP_H - 1 || grid[(y + 1) * MAP_W + x] !== id) ring.lineBetween(px, py + TILE, px + TILE, py + TILE);
        if (y === 0 || grid[(y - 1) * MAP_W + x] !== id) ring.lineBetween(px, py, px + TILE, py);
      }
  }

  private label(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: 'Mitr', fontSize: '10px', color: '#fff4d6', stroke: '#3b2416', strokeThickness: 3, resolution: 3 })
      .setOrigin(0.5, 0)
      .setDepth(10_002);
  }
}
