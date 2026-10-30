import * as Phaser from 'phaser';
import { portentOf, ADULT_AGE, WORKS, WORK_ORDER, statueHero, weatherOf, flooded, ruined, type DungeonKind, type Npc, type WorldState, rulerLook, ageOf, AGE_SUFFIX } from '../../sim';
import { FIELDS, FOREST, PASTURE, PLACES } from '../../sim/places';
import { BUILDINGS, LOTS, SHACK_SPOTS, MAP_H, MAP_W, PLOTS, dungeonDoor, townLayout, type Placed } from '../../sim/town';
import { founded } from '../../sim/growth';
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
// Each kind of dungeon: its sprite, the two residents loitering at its door, and what pours out in a stampede.
const LAIRS: Record<DungeonKind, { sprite: string; residents: [string, string]; horde: string[] }> = {
  cave: { sprite: 'dungeon', residents: ['slime', 'bat'], horde: ['slime', 'bat', 'slime', 'slime', 'bat', 'slime', 'bat', 'slime', 'slime', 'bat'] },
  den: { sprite: 'dungeon-den', residents: ['wolf', 'bat'], horde: ['wolf', 'wolf', 'bat', 'wolf', 'wolf', 'wolf', 'bat', 'wolf', 'wolf', 'wolf'] },
  fort: { sprite: 'dungeon-fort', residents: ['goblin', 'goblin'], horde: ['goblin', 'goblin', 'goblin', 'wolf', 'goblin', 'goblin', 'goblin', 'wolf', 'goblin', 'goblin'] },
  crypt: { sprite: 'dungeon-crypt', residents: ['skeleton', 'bat'], horde: ['skeleton', 'bat', 'skeleton', 'skeleton', 'bat', 'skeleton', 'skeleton', 'bat', 'skeleton', 'skeleton'] },
};

// The pasture's mix of beasts, in the order they join the herd; deer roam the forest.
const HERD_MIX = ['cow', 'sheep', 'chicken', 'sheep', 'pig', 'chicken', 'cow', 'sheep'];
const MAX_DEER = 6;
const DRAGON_ROOST = { x: 34 * TILE, y: 2 * TILE }; // above the hills past the eastern forest
const BEAST_SPEED = 10; // pixels a second
const FLEE_AT = 40; // pixels: how close a hunter gets before a deer bolts

interface Beast {
  sprite: Phaser.GameObjects.Sprite;
  to: { x: number; y: number } | null; // where it is ambling, or null while it grazes
  wait: number; // ms left grazing before it wanders on
  area: 'pasture' | 'forest';
  fleeing?: boolean; // a deer bounding away from a hunter
}

export class WorldScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private npcSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private blessMarks = new Map<number, Phaser.GameObjects.Sprite>();
  private wagons = new Map<number, { sprite: Phaser.GameObjects.Sprite; trail: { x: number; y: number }[] }>();
  private selectRing!: Phaser.GameObjects.Graphics;
  private selectedId: number | null = null;
  private townBuilt = false;
  private townKey = ''; // dungeons and their living bosses: the town is rebuilt when this changes
  private townObjs: Phaser.GameObjects.GameObject[] = [];
  private lastKey = '';
  tickMs = 500;
  dayNight = true; // false holds the sky at noon (the player's choice: fast speeds flicker)
  onSelect: (id: number | null) => void = () => {};
  onGuild: () => void = () => {};
  private guildBounds: Phaser.Geom.Rectangle | null = null;
  private sky!: Phaser.GameObjects.Rectangle;
  private glow!: Phaser.GameObjects.Graphics;
  private clock = -1; // eased copy of world.day, so the sky turns smoothly between ticks
  private seenSeq = -1; // last chronicle entry the scene has reacted to
  private drag: { sx: number; sy: number } | null = null;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private blight!: Phaser.GameObjects.Rectangle;
  private raining = false;
  private storm = false; // the long rains: a darker sky
  private flood!: Phaser.GameObjects.Container;
  private keep: Phaser.GameObjects.Image | null = null; // the demon lord's castle, while it stands
  private herd: Beast[] = [];
  private dragon: Phaser.GameObjects.Sprite | null = null;
  private swooping = false; // the dragon is mid-raid, so it stops circling its roost
  private deer: Beast[] = [];

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
      } else if (s.frames > 1 && (s.group === 'monsters' || s.group === 'vehicles' || s.group === 'animals')) {
        this.anims.create({ key: `${key}-walk`, frames: this.anims.generateFrameNumbers(key, {}), frameRate: 5, repeat: -1 });
      }
    }
    this.anims.create({ key: 'water-flow', frames: this.anims.generateFrameNumbers('water', {}), frameRate: 2, repeat: -1 });
    this.anims.create({ key: 'sparkle-twinkle', frames: this.anims.generateFrameNumbers('sparkle', {}), frameRate: 8, repeat: -1, yoyo: true });
    // The sky: a tint over the whole map, and lit windows that shine through it.
    this.sky = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, NIGHT.color).setOrigin(0).setDepth(20_000).setAlpha(0);
    this.glow = this.add.graphics().setDepth(20_001).setAlpha(0);
    // Miracle weather: rain falling over the whole map, blight browning the fields.
    this.add.graphics().fillStyle(0x2e56a0).fillRect(0, 0, 2, 7).fillStyle(0xd8ecff).fillRect(0, 0, 1, 6).generateTexture('raindrop', 2, 7).destroy();
    this.rain = this.add
      .particles(0, -8, 'raindrop', { x: { min: 0, max: MAP_W * TILE }, speedY: { min: 240, max: 300 }, speedX: -40, lifespan: 1400, quantity: 6, frequency: 30, alpha: 0.85, emitting: false })
      .setDepth(19_999);
    const fx = FIELDS.x0 * TILE;
    const fy = FIELDS.y0 * TILE;
    this.blight = this.add
      .rectangle(fx, fy, (FIELDS.x1 - FIELDS.x0 + 1) * TILE, (FIELDS.y1 - FIELDS.y0 + 1) * TILE, 0x6b4a1c, 0.5)
      .setOrigin(0)
      .setDepth(1)
      .setVisible(false);
    // Floodwater over the low ground south of the walls, the crops showing faintly through.
    this.flood = this.add.container(0, 0).setDepth(2).setVisible(false).setAlpha(0.8);
    for (let y = FIELDS.y0 - 1; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) this.flood.add(this.add.sprite(x * TILE, y * TILE, 'water').setOrigin(0).play('water-flow'));

    // Gold ring under the selected NPC's feet.
    this.selectRing = this.add.graphics().setVisible(false);
    this.selectRing.lineStyle(2, 0x3b2416).strokeEllipse(0, 0, 18, 8);
    this.selectRing.lineStyle(1, 0xffd23f).strokeEllipse(0, 0, 16, 6);

    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
  }

  // Taps and drags reach the scenes from the page's own pointer events (see mapInput.ts).
  // Zoomed in, a drag pans the map from where the camera was when the finger landed.
  grab(): void {
    const cam = this.cameras.main;
    this.drag = { sx: cam.scrollX, sy: cam.scrollY };
  }

  dragBy(dx: number, dy: number): void {
    const cam = this.cameras.main;
    if (!this.drag || cam.zoom <= 1) return;
    cam.stopFollow();
    cam.setScroll(this.drag.sx - dx / cam.zoom, this.drag.sy - dy / cam.zoom);
  }

  // A tap picks the living NPC nearest the finger: a tap anywhere on a body is a hit, and a
  // miss by up to a fingertip's width (measured on screen, so it holds at any zoom) still counts.
  // Empty ground clears the selection. k is screen pixels per world pixel.
  tap(x: number, y: number, k: number, touch: boolean): void {
    let best: number | null = null;
    let bestD = (touch ? 28 : 16) / k;
    let bestC = Infinity; // among bodies hit, the one whose middle is closest
    for (const [id, s] of this.npcSprites) {
      if (!s.visible) continue;
      const half = s.displayWidth / 4; // the figure, not its empty frame
      const dx = Math.max(0, Math.abs(x - s.x) - half);
      const dy = Math.max(0, s.y - s.displayHeight * 0.8 - y, y - s.y);
      const d = Math.hypot(dx, dy);
      const c = Math.hypot(x - s.x, y - (s.y - s.displayHeight / 2));
      if (d < bestD || (d === bestD && c < bestC)) {
        bestD = d;
        bestC = c;
        best = id;
      }
    }
    if (best === null && this.guildBounds?.contains(x, y)) return this.onGuild();
    this.select(best);
    this.onSelect(best);
  }

  // Toggle a 2x close-up, centred on whoever is selected (and following them) or on the town.
  toggleZoom(): boolean {
    const cam = this.cameras.main;
    if (cam.zoom > 1) {
      cam.stopFollow();
      cam.setZoom(1).centerOn((MAP_W * TILE) / 2, (MAP_H * TILE) / 2);
      return false;
    }
    cam.setZoom(2);
    const s = this.selectedId === null ? undefined : this.npcSprites.get(this.selectedId);
    if (s?.visible) cam.startFollow(s, true, 0.15, 0.15, 0, 10);
    else cam.centerOn(13 * TILE, 10 * TILE);
    return true;
  }

  setWorld(world: WorldState): void {
    this.world = world;
  }

  select(id: number | null): void {
    this.selectedId = id;
    this.selectRing?.setVisible(id !== null);
    // Zoomed in, the camera keeps the selected NPC in view.
    const cam = this.cameras?.main;
    const s = id === null ? undefined : this.npcSprites.get(id);
    if (cam && cam.zoom > 1 && s) cam.startFollow(s, true, 0.15, 0.15, 0, 10);
  }

  // Client-space position of an NPC's head, for DOM overlays such as speech bubbles.
  npcScreenPos(id: number): { x: number; y: number } | null {
    const s = this.npcSprites.get(id);
    if (!s || !s.visible || this.sys.isSleeping()) return null;
    const rect = this.game.canvas.getBoundingClientRect();
    if (!rect.width) return null; // not laid out yet
    const cam = this.cameras.main;
    const v = cam.worldView;
    if (s.x < v.x || s.x > v.right || s.y < v.y || s.y - s.height > v.bottom) return null; // scrolled out of the close-up
    const k = (rect.width / this.scale.gameSize.width) * cam.zoom;
    return { x: rect.left + (s.x - v.x) * k, y: rect.top + (s.y - s.height - v.y) * k };
  }

  update(_time: number, delta: number): void {
    this.turnSky(delta);
    this.amble(delta);
    // The dragon wheels slowly above its roost on the hills past the forest.
    if (this.dragon && !this.swooping) {
      const t = this.time.now / 2600;
      this.dragon.setPosition(DRAGON_ROOST.x + Math.cos(t) * 28, DRAGON_ROOST.y + Math.sin(t) * 10).setFlipX(Math.sin(t) > 0);
    }
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
    const townKey = [
      w.dungeons.map((d) => `${d.id}:${d.boss && d.boss.slainDay === undefined ? 1 : 0}`).join(','),
      Object.keys(w.works ?? {}).join(','),
      w.building?.kind,
      ageOf(w), // a new age rebuilds the houses
      (w.ruins ?? []).map((r) => `${r.x}.${r.y}`).join(','), // homes brought down or rebuilt
      w.buildRev ?? 0, // a home started, finished or built up
      (w.shacks ?? []).join(','), // the shanty, drawn apart from the layout
    ].join('|');
    if (!this.townBuilt || townKey !== this.townKey) {
      // A dungeon found or a boss fallen: clear the old town and lay it out again.
      for (const o of this.townObjs) o.destroy();
      this.glow.clear();
      this.townKey = townKey;
      const before = new Set(this.children.list);
      this.buildTown(w);
      this.townObjs = this.children.list.filter((o) => !before.has(o));
    }
    this.syncKeep(w);
    this.syncWeather(w);
    this.syncDragon(w);
    this.syncBeasts(this.herd, w.herd ?? 0, 'pasture');
    this.syncBeasts(this.deer, Math.min(MAX_DEER, Math.ceil((w.game ?? 0) / 3)), 'forest');
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

  private syncWeather(w: WorldState): void {
    const weather = weatherOf(w);
    const wet = weather === 'rain' || weather === 'deluge';
    if (wet !== this.rain.emitting) {
      if (wet) this.rain.start();
      else this.rain.stop();
    }
    // Blight browns the fields; drought bleaches them.
    this.blight.setVisible(weather === 'blight' || weather === 'drought');
    if (weather === 'drought') this.blight.setFillStyle(0xd9a441, 0.4);
    else this.blight.setFillStyle(0x6b4a1c, 0.5);
    this.flood.setVisible(flooded(w));
    this.raining = wet;
    this.storm = weather === 'deluge';
  }

  // The dragon arrives over the hills, and on its death (or leaving) falls or flies away.
  private syncDragon(w: WorldState): void {
    if (w.dragon && !this.dragon) {
      const d = this.add.sprite(DRAGON_ROOST.x, DRAGON_ROOST.y, 'dragon').setScale(1.5).setDepth(19_998).play('dragon-walk');
      this.dragon = d;
      if (this.seenSeq >= 0) {
        // In from off the map's edge.
        this.swooping = true;
        d.setPosition(MAP_W * TILE + 40, -30);
        this.tweens.add({ targets: d, x: DRAGON_ROOST.x, y: DRAGON_ROOST.y, duration: 2200, ease: 'Sine.out', onComplete: () => (this.swooping = false) });
      }
    } else if (!w.dragon && this.dragon) {
      const d = this.dragon;
      this.dragon = null;
      this.swooping = false;
      const slain = w.chronicle.slice(-8).some((e) => e.text.includes('สังหารมังกร'));
      this.tweens.add(
        slain
          ? { targets: d, y: d.y + 60, angle: 80, alpha: 0, duration: 1600, ease: 'Quad.in', onComplete: () => d.destroy() }
          : { targets: d, x: MAP_W * TILE + 60, y: -40, duration: 2000, ease: 'Sine.in', onComplete: () => d.destroy() },
      );
    }
  }

  // A raid: it dives over the town trailing fire, shakes the walls, and climbs back to its roost.
  private dragonRaid(): void {
    const d = this.dragon;
    if (!d) return;
    this.swooping = true;
    const over = { x: 13 * TILE, y: 8 * TILE };
    d.setFlipX(true);
    this.tweens.chain({
      targets: d,
      tweens: [
        { x: over.x, y: over.y, duration: 1100, ease: 'Quad.in' },
        { x: 2 * TILE, y: 4 * TILE, duration: 900, ease: 'Linear', onStart: () => this.burn(over) },
        { x: DRAGON_ROOST.x, y: DRAGON_ROOST.y, duration: 1600, ease: 'Sine.inOut', onStart: () => d.setFlipX(false) },
      ],
      onComplete: () => (this.swooping = false),
    });
  }

  private burn(at: { x: number; y: number }): void {
    this.cameras.main.shake(700, 0.008);
    this.cameras.main.flash(300, 255, 140, 40);
    for (let i = 0; i < 10; i++) {
      const f = this.add.circle(at.x + Phaser.Math.Between(-70, 50), at.y + Phaser.Math.Between(-20, 50), Phaser.Math.Between(3, 6), i % 2 ? 0xf5902e : 0xffd23f).setDepth(19_997);
      this.tweens.add({ targets: f, y: f.y - 20, alpha: 0, scale: 0.3, duration: 900 + i * 60, onComplete: () => f.destroy() });
    }
  }

  // A random open tile in the pasture or the forest, as a pixel spot a beast can stand on.
  private beastSpot(area: Beast['area']): { x: number; y: number } {
    const box = area === 'pasture' ? PASTURE : FOREST;
    const town = this.world ? townLayout(this.world) : null;
    for (let tries = 0; tries < 30; tries++) {
      const tx = Phaser.Math.Between(box.x0, box.x1);
      const ty = Phaser.Math.Between(box.y0, box.y1);
      const i = ty * MAP_W + tx;
      if (town && (!town.cost[i] || town.ground[i] === 'road')) continue;
      return { x: tx * TILE + Phaser.Math.Between(2, 14), y: ty * TILE + Phaser.Math.Between(8, 15) };
    }
    return { x: box.x0 * TILE + 8, y: box.y0 * TILE + 12 };
  }

  // As many beasts on the map as the sim counts: newborns trot in, the slaughtered (or the
  // wolves' share) fade away.
  private syncBeasts(list: Beast[], want: number, area: Beast['area']): void {
    while (list.length < want) {
      const kind = area === 'forest' ? 'deer' : HERD_MIX[list.length % HERD_MIX.length];
      const at = this.beastSpot(area);
      const sprite = this.add.sprite(at.x, at.y, kind).setOrigin(0.5, 1).setDepth(at.y).play(`${kind}-walk`);
      sprite.anims.pause();
      if (this.seenSeq >= 0) {
        sprite.setAlpha(0);
        this.tweens.add({ targets: sprite, alpha: 1, duration: 600 });
      }
      list.push({ sprite, to: null, wait: Phaser.Math.Between(500, 6000), area });
    }
    while (list.length > want) {
      const b = list.pop()!;
      this.tweens.add({ targets: b.sprite, alpha: 0, duration: 600, onComplete: () => b.sprite.destroy() });
    }
  }

  // Beasts graze a while, then amble somewhere nearby, every frame and between ticks alike.
  // Deer bolt from a hunter who comes too close.
  private amble(delta: number): void {
    const hunters = this.world ? this.world.npcs.filter((n) => n.alive && n.job === 'hunter').map((n) => this.npcSprites.get(n.id)).filter((s) => s?.visible) : [];
    for (const b of [...this.herd, ...this.deer]) {
      const s = b.sprite;
      const near = b.area === 'forest' ? hunters.find((h) => Phaser.Math.Distance.Between(h!.x, h!.y, s.x, s.y) < FLEE_AT) : undefined;
      if (near && !b.fleeing) {
        const away = new Phaser.Math.Vector2(s.x - near.x, s.y - near.y).normalize().scale(FLEE_AT * 1.5);
        b.to = {
          x: Phaser.Math.Clamp(s.x + away.x, FOREST.x0 * TILE, (FOREST.x1 + 1) * TILE - 4),
          y: Phaser.Math.Clamp(s.y + away.y, FOREST.y0 * TILE + 12, (FOREST.y1 + 1) * TILE - 2),
        };
        b.fleeing = true;
        s.setFlipX(b.to.x < s.x);
        s.anims.resume();
        s.anims.timeScale = 2.5;
      }
      if (!b.to) {
        if ((b.wait -= delta) > 0) continue;
        const next = this.beastSpot(b.area);
        // Short hops: pick a spot within a few tiles rather than across the whole field.
        const dx = Phaser.Math.Clamp(next.x - s.x, -48, 48);
        const dy = Phaser.Math.Clamp(next.y - s.y, -24, 24);
        b.to = { x: s.x + dx, y: s.y + dy };
        s.setFlipX(dx < 0);
        s.anims.resume();
        continue;
      }
      const dist = Phaser.Math.Distance.Between(s.x, s.y, b.to.x, b.to.y);
      const step = (BEAST_SPEED * (b.fleeing ? 5 : b.area === 'forest' ? 1.6 : 1) * delta) / 1000;
      if (dist <= step) {
        s.setPosition(b.to.x, b.to.y);
        b.to = null;
        b.fleeing = false;
        s.anims.timeScale = 1;
        b.wait = Phaser.Math.Between(2000, 9000);
        s.anims.pause();
      } else s.setPosition(s.x + ((b.to.x - s.x) / dist) * step, s.y + ((b.to.y - s.y) / dist) * step);
      s.setDepth(s.y);
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
    const town = townLayout(w);
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
    // The crown's works: upgraded buildings swap their art, new ones stand on the royal plots.
    const upgrade: Record<string, string> = {};
    const rising = w.building && WORKS[w.building.kind].replaces; // a building under scaffolding
    for (const k of WORK_ORDER) if (w.works?.[k] !== undefined && WORKS[k].replaces) upgrade[WORKS[k].replaces!] = WORKS[k].art;
    for (const [kind, plot] of Object.entries(PLOTS) as [keyof typeof PLOTS, { x: number; y: number }][]) {
      if (w.building?.kind === kind) this.placeProp({ key: 'scaffold', x: plot.x, y: plot.y, anchor: 'top' });
      else if (w.works?.[kind] !== undefined) this.placeProp({ key: kind === 'monument' ? `monument-${Math.min(3, w.monument ?? 1)}` : kind, x: plot.x, y: plot.y, anchor: 'top' });
      else if (w.building?.kind === kind) this.placeProp({ key: 'scaffold', x: plot.x, y: plot.y, anchor: 'top' });
      else this.placeProp({ key: 'lot', x: plot.x, y: plot.y, anchor: 'bottom' });
    }
    // Homes going up stand in scaffolding until they are done.
    const goingUp = new Set((w.homes ?? []).filter((h) => (h.until ?? 0) > w.day).map((h) => `${LOTS[h.lot].x},${LOTS[h.lot].y}`));
    for (const p of town.props) {
      const home = /^(house|townhouse|hut)/.test(p.key);
      const shell = home && (ruined(w, p.x, p.y) ? 'rubble' : goingUp.has(`${p.x},${p.y}`) ? 'scaffold' : undefined);
      const img = this.placeProp(upgrade[p.key] ? { ...p, key: upgrade[p.key] } : home ? { ...p, key: shell || (p.key === 'hut' ? p.key : this.aged(p.key)) } : p);
      if (p.key === rising && p.anchor === 'top') {
        const b = img.getBounds();
        const s = this.add.image(b.centerX, b.bottom, 'scaffold').setOrigin(0.5, 1);
        s.setDepth(img.depth + 1);
      }
      if (p.key === 'guild') this.guildBounds = img.getBounds();
      for (const [x, y, ww, h] of shell ? [] : (WINDOWS[p.key] ?? [])) {
        this.glow.fillStyle(0xffb347, 0.35).fillRect(img.x + x - 1, img.y + y - 1, ww + 2, h + 2);
        this.glow.fillStyle(0xffe27a, 1).fillRect(img.x + x, img.y + y, ww, h);
      }
    }
    // A building the town is founding stands in scaffolding on its plot (the castle over the old hall).
    const raising = w.raising && w.raising.kind !== 'walls' ? BUILDINGS.find(([k]) => k === w.raising!.kind) : undefined;
    if (raising) {
      const [k, tx, ty] = raising;
      if (k === 'castle') {
        const s = this.add.image(tx * TILE + 32, ty * TILE + 56, 'scaffold').setOrigin(0.5, 1);
        s.setDepth(s.y + 1);
      } else this.placeProp({ key: 'scaffold', x: tx, y: ty, anchor: 'top' });
    }
    // The shanty's shacks.
    for (const s of w.shacks ?? []) this.placeProp({ key: 'shack', x: SHACK_SPOTS[s].x, y: SHACK_SPOTS[s].y, anchor: 'bottom' });
    // Before there is a church or a market on the square, the camp gathers round a fire there.
    if (!founded(w, 'church') && !founded(w, 'shop')) this.placeProp({ key: 'campfire', x: PLACES.square.x, y: PLACES.square.y, anchor: 'bottom' });
    // A hero of a past era stands in stone in the square.
    if (statueHero(w)) {
      const st = this.add.image(PLACES.square.x * TILE + TILE / 2, (PLACES.square.y + 1) * TILE, 'statue').setOrigin(0.5, 1);
      st.setDepth(st.y);
    }
    for (const d of w.dungeons) {
      const lair = LAIRS[d.kind ?? 'cave'];
      const img = this.add.image(d.x * TILE + TILE, (d.y + 2) * TILE, lair.sprite).setOrigin(0.5, 1);
      img.setDepth(img.y);
      // A couple of residents loiter at the entrance.
      const [a, b] = lair.residents;
      this.add.sprite(img.x - 28, img.y + 8, a).setOrigin(0.5, 1).setDepth(img.y + 8).play(`${a}-walk`);
      this.add.sprite(img.x + 24, img.y - (b === 'bat' ? 30 : -6), b).setOrigin(0.5, 1).setDepth(img.y + 40).play(`${b}-walk`);
      // The boss sits by its door while it lives.
      if (d.boss && d.boss.slainDay === undefined) {
        const boss = `boss-${d.kind ?? 'cave'}`;
        this.add.sprite(img.x + 30, img.y + 4, boss).setOrigin(0.5, 1).setDepth(img.y + 4).play(`${boss}-walk`);
      }
    }
    this.townBuilt = true;
  }

  // The art for this age, if there is any: houses and clothes change, the rest stays.
  private aged(key: string): string {
    const k = key + AGE_SUFFIX[this.world ? ageOf(this.world) : 1];
    return this.textures.exists(k) ? k : key;
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
    const night = this.dayNight ? Phaser.Math.Clamp((dark - 0.3) / 0.5, 0, 1) : 0;
    const sky = Phaser.Display.Color.Interpolate.ColorWithColor(DUSK, NIGHT, 100, Math.round(night * 100));
    // A dark world stains the sky blood red, even at noon.
    // The demon lord's shadow darkens it further, most of all over an occupied town.
    const dread = w.demon ? (w.demon.stage === 'occupied' ? 1 : 0.6) : portentOf(w) * 0.12; // the portents redden it first
    const evil = Math.max(dread, Phaser.Math.Clamp((-(w.balance ?? 0) - 20) / 40, 0, 1));
    const tint = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(Phaser.Display.Color.GetColor(sky.r, sky.g, sky.b)), BLOOD, 100, Math.round(evil * 60));
    // Rain greys the day a little.
    const gloom = this.storm ? 0.3 : this.raining ? 0.18 : 0;
    this.sky.setFillStyle(Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b)).setAlpha(Math.max(night * NIGHT_ALPHA, evil * (w.demon?.stage === 'occupied' ? 0.32 : 0.22), gloom));
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
      if (e.kind === 'battle' && e.text.includes('บุกประตูเมือง')) this.raid(w);
      if (e.kind === 'disaster' && e.text.includes('พ่นไฟใส่เมือง')) this.dragonRaid();
      if (e.kind === 'disaster' && e.text.includes('แผ่นดินไหว')) this.cameras.main.shake(1800, 0.012);
    }
    this.seenSeq = w.chronicleSeq;
  }

  // Monsters pour out of the dungeon, run the forest trail and through the east gate,
  // and scatter about town before melting away.
  private stampede(w: WorldState, d: WorldState['dungeons'][number], host = false): void {
    // The demon lord's own host comes led by the lord himself.
    const horde = LAIRS[d.kind ?? 'cave'].horde;
    this.charge(w, dungeonDoor(d), host ? ['demon-lord', ...STAMPEDE_MONSTERS, 'skeleton', 'goblin'] : horde);
  }

  // An enemy army storms in through the west gate.
  private raid(w: WorldState): void {
    this.charge(w, { x: 0, y: 9 }, new Array(12).fill('raider'));
  }

  // A crowd runs from `door` along the roads and scatters about town before melting away.
  private charge(w: WorldState, door: { x: number; y: number }, monsters: string[]): void {
    this.cameras.main.shake(500, 0.004);
    const rng = createRng(w.day);
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

  // A merchant on caravan duty leads the wagon; it rolls two tiles behind along the same path.
  private syncWagon(npc: Npc, px: number, py: number): void {
    const hauling = npc.alive && npc.inside === undefined && (npc.plan?.kind === 'caravan' || npc.plan?.kind === 'haul');
    let w = this.wagons.get(npc.id);
    if (!hauling) {
      if (w) {
        const s = w.sprite;
        this.tweens.add({ targets: s, alpha: 0, duration: 400, onComplete: () => s.destroy() });
        this.wagons.delete(npc.id);
      }
      return;
    }
    if (!w) {
      w = { sprite: this.add.sprite(px, py, 'caravan').setOrigin(0.5, 1).play('caravan-walk'), trail: [{ x: px, y: py }] };
      this.wagons.set(npc.id, w);
    }
    const last = w.trail[w.trail.length - 1];
    if (last.x !== px || last.y !== py) w.trail.push({ x: px, y: py });
    if (w.trail.length > 3) w.trail.shift();
    const at = w.trail[0];
    const ahead = w.trail[1] ?? { x: px, y: py };
    const s = w.sprite;
    if (ahead.x !== at.x) s.setFlipX(ahead.x < at.x);
    if (at.x === s.x && at.y === s.y) s.anims.pause();
    else s.anims.resume();
    this.tweens.add({ targets: s, x: at.x, y: at.y, duration: this.tickMs * 0.9, onUpdate: () => s.setDepth(s.y) });
  }

  private syncNpc(npc: Npc): void {
    // Children share one sprite until they pick a calling; cultists don their robes for the walk to a ritual.
    const look: string = npc.age < ADULT_AGE ? 'child' : npc.plan?.kind === 'ritual' ? 'cultist' : npc.hero && npc.job !== 'king' ? 'hero' : npc.job === 'king' ? rulerLook(this.world!) : npc.job;
    const dressed = look === 'child' ? look : this.aged(look);
    let sprite = this.npcSprites.get(npc.id);
    const px = npc.x * TILE + TILE / 2;
    const py = npc.y * TILE + TILE;
    if (!sprite) {
      sprite = this.add.sprite(px, py, dressed).setOrigin(0.5, 1).play(`${dressed}-down`);
      sprite.anims.setProgress(Math.random());
      this.npcSprites.set(npc.id, sprite);
    }
    this.syncWagon(npc, px, py);
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
    sprite.play(`${dressed}-${facing}`, sprite.texture.key === dressed);
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
