import * as Phaser from 'phaser';
import { AGE_SUFFIX, ADULT_AGE, USES, ageOf, chiefOf, folkOf, levelOf, type LandUse, type Npc, type Region, type WorldState } from '../../sim';
import { createRng, next } from '../../sim/rng';
import { TILE } from './WorldScene';
import { OUR_COLOR } from './WorldMapScene';

const FLAG: Record<string, number> = { r: 0xe8503a, b: 0x4a86e0, y: 0xffd23f, g: 0x56a832, a: 0x7fd8f8, v: 0x9a66e0 };
// A region up close is a small stretch of country, seen at the town's close-up zoom.
const RW = 20;
const RH = 13;
const ROAD = 6;
const SEA = 9; // first row of the sea on a shore
type Zone = { x0: number; y0: number; x1: number; y1: number };
// The village sits on the road in the middle; the land's uses take the country around it,
// its best use the broad stretch below the road.
const ZONES: Zone[] = [
  { x0: 1, y0: 8, x1: 18, y1: 12 },
  { x0: 0, y0: 0, x1: 6, y1: 5 },
  { x0: 13, y0: 0, x1: 19, y1: 5 },
];
const VILLAGE: Zone = { x0: 7, y0: 1, x1: 12, y1: 5 };

// Someone of the village out on the land: walking to a spot in their work's stretch, then on to the next.
interface Walker {
  id: number;
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  zone: Zone;
  tx: number;
  ty: number;
  wait: number;
  pick: () => { x: number; y: number }; // the next spot in its stretch
  beast?: boolean; // a monster: one walk cycle, no facings
}

// One region up close: its kind of land, what its owner has raised on it, and its village:
// the houses on the road, the works the villagers built, and the villagers themselves at their
// work, the headman by his house with what is on his mind. Laid out from the region's id, so it
// looks the same every visit; redrawn when its works or its people change.
export class RegionScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private regionId: number | null = null;
  private key = '';
  private drawn: Phaser.GameObjects.GameObject[] = []; // loose, not in a container, so the props sort by depth
  private walkers: Walker[] = [];
  private thought: Phaser.GameObjects.Text | null = null;
  private rand = () => Math.random();
  private steam = false; // the steam age: winding towers over the mines, coal by the track
  private landKind: Region['kind'] | undefined;
  onVillager: (id: number) => void = () => {};

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

  create(): void {
    this.cameras.main.setZoom(2).setBounds(0, 0, RW * TILE, RH * TILE).centerOn((RW * TILE) / 2, (RH * TILE) / 2);
  }

  // A tap (from the page's pointer events, see mapInput.ts) on a villager, or within a
  // fingertip of one, picks them. k is screen pixels per world pixel.
  tap(x: number, y: number, k: number, touch: boolean): void {
    let best: number | null = null;
    let bestD = (touch ? 20 : 10) / k;
    for (const { id, sprite: s } of this.walkers) {
      const dx = Math.max(0, Math.abs(x - s.x) - s.displayWidth / 4);
      const dy = Math.max(0, s.y - s.displayHeight * 0.8 - y, y - s.y);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best !== null) this.onVillager(best);
  }

  update(_t: number, dt: number): void {
    const w = this.world;
    const r = w?.regions?.find((x) => x.id === this.regionId);
    if (!w || !r || !this.textures.exists('rm-hut')) return; // the town scene loads every texture; wait for the last ones
    const folk = folkOf(w, r);
    const key = JSON.stringify([r.id, r.owner, r.dev, r.village?.works, r.village?.chiefId, folk.map((n) => n.id), ageOf(w), w.techs?.steam !== undefined, Math.ceil((r.danger ?? 0) / 20)]);
    if (key !== this.key) {
      this.key = key;
      for (const o of this.drawn) o.destroy();
      this.drawn = [];
      this.walkers = [];
      this.build(w, r, folk);
    }
    this.thought?.setText(r.village?.thought ?? '').setVisible(!!r.village?.thought);
    for (const k of this.walkers) this.walk(k, dt);
  }

  private put<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.drawn.push(o);
    return o;
  }

  // A prop standing on tile (x, y), sorted by its feet.
  private prop(x: number, y: number, key: string, frame?: number): Phaser.GameObjects.Image {
    return this.put(this.add.image(x * TILE + TILE / 2, (y + 1) * TILE, key, frame).setOrigin(0.5, 1).setDepth((y + 1) * TILE));
  }

  private build(w: WorldState, r: Region, folk: Npc[]): void {
    this.steam = w.techs?.steam !== undefined;
    this.landKind = r.kind;
    const rng = createRng(r.id * 7919 + 13);
    this.rand = () => next(rng);
    const taken = new Set<number>();
    const at = (x: number, y: number) => y * RW + x;
    const shore = r.kind === 'shore';
    const sea = (x: number, y: number) => shore && y >= SEA + Math.round(Math.sin(x / 2.5) * 0.8);

    // The ground and the road across it.
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < RW; x++) {
        const px = x * TILE;
        const py = y * TILE;
        if (sea(x, y)) {
          this.put(this.add.sprite(px, py, 'water').setOrigin(0).play('water-flow'));
          taken.add(at(x, y));
        } else if (y === ROAD) {
          this.put(this.add.image(px, py, 'path', (x * 7 + y) % 2).setOrigin(0));
          taken.add(at(x, y));
        } else if (r.kind === 'dunes' || (shore && y >= SEA - 1)) this.put(this.add.image(px, py, 'wm-sand', (x + y) % 2).setOrigin(0));
        else this.put(this.add.image(px, py, 'grass', (x * 3 + y * 5) % 3).setOrigin(0));
      }

    const uses = USES[r.kind];
    const zoneOf = new Map<LandUse, Zone>();
    if (r.seat) this.seat(w, r, taken);
    else {
      uses.forEach((u, i) => zoneOf.set(u, ZONES[i]));
      for (const u of uses) this.work(u, levelOf(r, u), zoneOf.get(u)!, taken, sea);
      this.village(w, r, folk, taken);
    }

    // What the land is like where nothing has been raised.
    const wild = { plain: 0.05, hills: 0.12, woods: 0.4, shore: 0.04, dunes: 0.04, peaks: 0.18 }[r.kind];
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < RW; x++) {
        if (taken.has(at(x, y)) || y === ROAD - 1 || this.rand() > wild) continue;
        const p = r.kind === 'peaks' || r.kind === 'hills' ? (this.rand() < 0.6 ? 'wm-mountain' : 'rock') : r.kind === 'dunes' ? 'rock' : this.rand() < 0.8 ? 'tree' : 'bush';
        this.prop(x, y, p);
      }

    // The villagers at their work: hands spread over the uses that are worked, children by the houses.
    const worked = uses.filter((u) => levelOf(r, u) > 0);
    let i = 0;
    const chief = chiefOf(w, r);
    for (const n of folk) {
      if (n.id === chief?.id) continue;
      const zone = n.age < ADULT_AGE || !worked.length ? VILLAGE : zoneOf.get(worked[i++ % worked.length])!;
      this.walker(w, n, n.age < ADULT_AGE ? 'child' : n.job, zone, sea);
    }
    if (chief) {
      const s = this.walker(w, chief, 'noble', { x0: 9, y0: 5, x1: 11, y1: 5 }, sea);
      this.thought = this.put(
        this.add
          .text(0, 0, '', { fontFamily: 'Mitr', fontSize: '6px', color: '#3b2416', backgroundColor: '#fff4d6', padding: { x: 3, y: 2 }, wordWrap: { width: 110 }, resolution: 6 })
          .setOrigin(0.5, 1)
          .setDepth(20_002),
      );
      this.events.off('postupdate');
      this.events.on('postupdate', () => this.thought?.setPosition(Math.max(58, Math.min(RW * TILE - 58, s.x)), s.y - 26));
    } else this.thought = null;

    // A lair: its monsters prowl the whole stretch until a party clears them out.
    const beasts = Math.ceil((r.danger ?? 0) / 15);
    const kind = { plain: 'wolf', shore: 'raider', hills: 'goblin', woods: 'wolf', dunes: 'skeleton', peaks: 'goblin' }[r.kind];
    for (let b = 0; b < beasts; b++) this.beast(kind, sea);

    // Its name, and whose it is.
    const owner = r.owner === 'us' ? 'ของเรา' : r.village?.free ? 'หมู่บ้านอิสระ' : r.danger ? `รังมอนสเตอร์ · อันตราย ${r.danger}` : r.owner === undefined ? 'ไร้เจ้าของ' : (w.realms?.find((x) => x.id === r.owner)?.name ?? '');
    this.put(this.add.text(3, 2, `${r.name} · ${owner}`, { fontFamily: 'Mitr', fontSize: '7px', color: '#fff4d6', stroke: '#3b2416', strokeThickness: 2, resolution: 6 }).setDepth(20_001));
    if (r.owner !== undefined) {
      const realm = typeof r.owner === 'number' ? w.realms?.find((x) => x.id === r.owner) : undefined;
      const c = r.owner === 'us' ? OUR_COLOR : (FLAG[realm?.color ?? ''] ?? 0xffffff);
      this.put(this.add.rectangle(0, 0, RW * TILE, RH * TILE).setOrigin(0).setStrokeStyle(4, c, 0.8).setDepth(20_000));
    }
  }

  // A seat is the town or keep itself, standing over its own country.
  private seat(w: WorldState, r: Region, taken: Set<number>): void {
    const realm = typeof r.owner === 'number' ? w.realms?.find((x) => x.id === r.owner) : undefined;
    const cx = (RW / 2) * TILE;
    this.put(this.add.image(cx, ROAD * TILE, realm ? 'castle' : 'church').setOrigin(0.5, 1).setDepth(ROAD * TILE));
    if (realm) this.put(this.add.image(cx + 20, ROAD * TILE - 56, 'wm-flag').setOrigin(0).setScale(2).setTint(FLAG[realm.color] ?? 0xffffff).setDepth(ROAD * TILE + 1));
    for (let x = 6; x <= 13; x++) for (let y = 0; y < ROAD; y++) taken.add(y * RW + x);
  }

  // The village on the road: a house for every few of its people, the headman's under a banner,
  // and the works they built for themselves.
  private village(w: WorldState, r: Region, folk: Npc[], taken: Set<number>): void {
    const v = r.village;
    for (let y = VILLAGE.y0; y <= VILLAGE.y1; y++) for (let x = VILLAGE.x0; x <= VILLAGE.x1; x++) taken.add(y * RW + x);
    if (!folk.length) {
      if (r.owner !== undefined) this.prop(9, ROAD - 1, 'rm-hut');
      return;
    }
    const age = AGE_SUFFIX[ageOf(w)];
    const look = (k: string) => (this.textures.exists(k + age) ? k + age : k);
    const houses = Math.min(4, Math.ceil(folk.length / 4));
    // Two houses either side of the headman's, along the road.
    const spots = [7, 11, 13, 5].slice(0, houses);
    spots.forEach((x, i) => this.house(x, ROAD - 1, look(i % 2 ? 'house-blue' : 'house')));
    if (chiefOf(w, r)) {
      this.house(9, ROAD - 1, look('house-red'));
      const tint = r.owner === 'us' ? OUR_COLOR : v?.free ? 0xfff4d6 : (FLAG[w.realms?.find((x) => x.id === r.owner)?.color ?? ''] ?? 0xffffff);
      this.put(this.add.image(9 * TILE + 26, (ROAD - 2) * TILE - 8, 'wm-flag').setOrigin(0, 1).setScale(1.5).setTint(tint).setDepth(ROAD * TILE + 2));
    }
    const works = v?.works ?? [];
    const SPOT: Record<string, [number, number, string]> = {
      granary: [7, 2, 'granary'],
      shrine: [10, 2, 'statue'],
      market: [12, 2, 'shop'],
      well: [9, ROAD + 1, 'trough'],
    };
    for (const k of works) {
      if (k === 'palisade') continue;
      const [x, y, key] = SPOT[k];
      this.put(this.add.image(x * TILE, (y + 1) * TILE, key).setOrigin(0.5, 1).setDepth((y + 1) * TILE));
    }
    // A palisade across the road either side of the houses, a gate where the road runs through.
    if (works.includes('palisade'))
      for (const x of [5, 14]) for (let y = ROAD - 2; y <= ROAD + 1; y++) if (y !== ROAD) this.prop(x + (x < 9 ? -1 : 1), y, 'fence');
  }

  private house(x: number, y: number, key: string): void {
    this.put(this.add.image((x + 1) * TILE, (y + 1) * TILE, key).setOrigin(0.5, 1).setDepth((y + 1) * TILE));
  }

  // One use, worked to its level, filling more of its stretch with each level. Level 0 leaves the land wild.
  private work(u: LandUse, level: number, z: Zone, taken: Set<number>, sea: (x: number, y: number) => boolean): void {
    const at = (x: number, y: number) => y * RW + x;
    const claim = (x: number, y: number) => taken.add(at(x, y));
    for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) if (u !== 'fishery' || !sea(x, y)) claim(x, y);
    if (!level) {
      for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) if (!sea(x, y)) taken.delete(at(x, y)); // the sea stays sea
      return;
    }
    const share = level / 3; // how much of the stretch is worked
    const w = z.x1 - z.x0 + 1;
    switch (u) {
      case 'farm': {
        // Rows of crops, more of them each level, a haystack at the end of each.
        const cols = Math.max(3, Math.round(w * share));
        for (let y = z.y0; y <= z.y1; y++) {
          for (let x = z.x0; x < z.x0 + cols; x++) if (!sea(x, y)) this.put(this.add.image(x * TILE, y * TILE, 'crops', (x + y) % 2).setOrigin(0).setDepth(1));
          if (y % 2 === 0 && z.x0 + cols <= z.x1 && !sea(z.x0 + cols, y)) this.prop(z.x0 + cols, y, 'haystack');
        }
        return;
      }
      case 'pasture': {
        // A fenced field, wider each level, with its beasts.
        const x1 = Math.min(z.x1, z.x0 + Math.max(3, Math.round((w - 1) * share)));
        for (let x = z.x0; x <= x1; x++) for (const y of [z.y0, z.y1]) this.prop(x, y, 'fence');
        for (let y = z.y0 + 1; y < z.y1; y++) for (const x of [z.x0, x1]) this.prop(x, y, 'fence');
        this.prop(z.x0 + 1, z.y0 + 1, 'trough');
        const beasts = ['cow', 'sheep', 'sheep', 'pig', 'chicken'];
        for (let i = 0; i < level * 3; i++) {
          const x = z.x0 + 1 + Math.floor(this.rand() * (x1 - z.x0 - 1));
          const y = z.y0 + 1 + Math.floor(this.rand() * (z.y1 - z.y0 - 1));
          const b = beasts[i % beasts.length];
          this.put(this.add.sprite(x * TILE + TILE / 2, (y + 1) * TILE, b).setOrigin(0.5, 1).setDepth((y + 1) * TILE + 1).play(`${b}-walk`).setFlipX(this.rand() < 0.5));
        }
        return;
      }
      case 'mine': {
        // A rock face along the back of the stretch, a mouth in it for each level, a track and spoil heaps.
        for (let x = z.x0; x <= z.x1; x++) this.prop(x, z.y0, 'wm-mountain');
        for (let i = 0; i < level; i++) {
          const x = z.x0 + 1 + Math.round(i * ((w - 3) / 2));
          this.prop(x, z.y0 + 1, 'rm-mine');
          for (let y = z.y0 + 2; y <= z.y1; y++) this.put(this.add.image(x * TILE, y * TILE, 'path', 1).setOrigin(0).setDepth(1));
          // In the steam age a winding tower stands over the shaft and the coal is heaped by the track.
          const coal = this.steam && this.landKind !== 'dunes';
          if (this.steam) this.prop(x - 1, z.y0 + 2, 'rm-headframe');
          this.prop(x + 1, z.y0 + 2, coal ? 'rm-coal' : 'rock');
          this.prop(x + 1, z.y1, coal ? 'rm-coal' : 'rock');
        }
        return;
      }
      case 'lumber': {
        // Woods, with a clearing cut deeper each level and the logs stacked in it.
        const cut = Math.round(w * share);
        for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) if (x >= z.x0 + cut && this.rand() < 0.75) this.prop(x, y, 'tree');
        for (let i = 0; i < level * 2; i++) this.prop(z.x0 + (i % Math.max(1, cut)), z.y0 + 1 + (i % 3), 'rm-logs');
        for (let i = 0; i < level * 2; i++) this.prop(z.x0 + ((i * 3 + 1) % Math.max(1, cut)), z.y1 - (i % 2), 'bush');
        return;
      }
      case 'fishery': {
        // A pier out from the beach, boats off it, more of both each level.
        for (let p = 0; p < level; p++) {
          const x = 3 + p * 6;
          for (let y = SEA - 1; y <= SEA + 2; y++) this.put(this.add.image(x * TILE, y * TILE, 'path', 0).setOrigin(0).setDepth(2));
          for (let b = 0; b < 2; b++) this.put(this.add.image((x + 2 + b * 2) * TILE, (SEA + 2 + b) * TILE, 'rm-boat').setOrigin(0.5, 1).setDepth((SEA + 2 + b) * TILE));
        }
        return;
      }
    }
  }

  // A villager in the scene, wandering their stretch of the land; tap them to see who they are.
  private walker(w: WorldState, n: Npc, job: string, zone: Zone, sea: (x: number, y: number) => boolean): Phaser.GameObjects.Sprite {
    const age = AGE_SUFFIX[ageOf(w)];
    const key = this.textures.exists(job + age) ? job + age : this.textures.exists(job) ? job : 'farmer';
    const spot = () => {
      for (let i = 0; i < 8; i++) {
        const x = zone.x0 + Math.floor(this.rand() * (zone.x1 - zone.x0 + 1));
        const y = zone.y0 + Math.floor(this.rand() * (zone.y1 - zone.y0 + 1));
        if (!sea(x, y)) return { x: x * TILE + TILE / 2, y: (y + 1) * TILE - 2 };
      }
      return { x: 10 * TILE, y: ROAD * TILE };
    };
    const s0 = spot();
    const sprite = this.put(this.add.sprite(s0.x, s0.y, key).setOrigin(0.5, 1).play(`${key}-down`).setDepth(s0.y + 2));
    const t = spot();
    this.walkers.push({ id: n.id, sprite, key, zone, tx: t.x, ty: t.y, wait: this.rand() * 2000, pick: spot });
    return sprite;
  }

  // A monster of the lair, wandering anywhere on the land.
  private beast(key: string, sea: (x: number, y: number) => boolean): void {
    if (!this.textures.exists(key)) return;
    const all: Zone = { x0: 0, y0: 0, x1: RW - 1, y1: RH - 1 };
    const spot = () => {
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(this.rand() * RW);
        const y = Math.floor(this.rand() * RH);
        if (!sea(x, y)) return { x: x * TILE + TILE / 2, y: (y + 1) * TILE - 2 };
      }
      return { x: 10 * TILE, y: ROAD * TILE };
    };
    const s0 = spot();
    const sprite = this.put(this.add.sprite(s0.x, s0.y, key).setOrigin(0.5, 1).play(`${key}-walk`).setDepth(s0.y + 2));
    const t = spot();
    this.walkers.push({ id: -1, sprite, key, zone: all, tx: t.x, ty: t.y, wait: this.rand() * 1500, pick: spot, beast: true });
  }

  private walk(k: Walker, dt: number): void {
    const s = k.sprite;
    if (k.wait > 0) {
      k.wait -= dt;
      if (k.wait <= 0 && !k.beast) s.play(`${k.key}-down`, true).anims.pause();
      return;
    }
    const dx = k.tx - s.x;
    const dy = k.ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      k.wait = 1500 + this.rand() * 3500; // stops to work a while
      const t = k.pick();
      k.tx = t.x;
      k.ty = t.y;
      return;
    }
    const step = Math.min(d, dt * 0.012);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    s.setDepth(s.y + 2);
    if (k.beast) return void s.setFlipX(dx < 0);
    const face = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'up' : 'down';
    s.setFlipX(face === 'side' && dx < 0);
    if (s.anims.currentAnim?.key !== `${k.key}-${face}` || !s.anims.isPlaying) s.play(`${k.key}-${face}`, true);
  }
}
