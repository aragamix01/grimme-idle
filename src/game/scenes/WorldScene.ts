import * as Phaser from 'phaser';
import { portentOf, ADULT_AGE, WORKS, WORK_ORDER, statueHero, weatherOf, flooded, ruined, type DungeonKind, type Npc, type WorldState, rulerLook, ageOf, AGE_SUFFIX } from '../../sim';
import { places } from '../../sim/places';
import { MAP_H, MAP_W, ON_WALL, dungeonDoor, footprint, lotXY, railway, ringMask, townLayout, type Placed } from '../../sim/town';
import { entryOf, siteOf } from '../../sim/landplan';
import { WATER, TREE, homeKind, terrainOf, type HomeKind } from '../../sim/terrain';
import { cropOf } from '../../sim/farms';
import { wildsOf } from '../../sim/wilds';
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
const PER_PEN = 6; // beasts drawn in one pasture
const HERD_MIX = ['cow', 'sheep', 'chicken', 'sheep', 'pig', 'chicken', 'cow', 'sheep'];
const MAX_DEER = 6;
export type ZoomStep = 'town' | 'close' | 'country';
// How each crop looks on its field (sprites in tools/sprites/world.mjs).
const CROP_ART: Record<string, string> = { grain: 'crops', flax: 'flax', vines: 'vines', herbs: 'herbs', fallow: 'fallow' };
// The share of trees that are pines, by the lie of the home country.
const PINE_SHARE: Record<HomeKind, number> = { plain: 0.1, woods: 0.35, hills: 0.6, shore: 0.2 };
const MAX_ZOOM = 3; // closest a pinch goes
const ZOOMS = [1, 2, 0] as const; // the zoom button's steps: the town, a close-up, the whole country (0: fit the map's width)
const BEAST_SPEED = 10; // pixels a second
const FLEE_AT = 40; // pixels: how close a hunter gets before a deer bolts

interface Beast {
  sprite: Phaser.GameObjects.Sprite;
  to: { x: number; y: number } | null; // where it is ambling, or null while it grazes
  wait: number; // ms left grazing before it wanders on
  area: 'pasture' | 'forest';
  pen?: number; // which of the common pastures it grazes in
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
  landMap = false; // the land plan coloured over the town (the map menu's ผังที่ดิน)
  private landLayer: Phaser.GameObjects.Graphics | null = null;
  onSelect: (id: number | null) => void = () => {};
  onGuild: () => void = () => {};
  private guildBounds: Phaser.Geom.Rectangle | null = null;
  private sky!: Phaser.GameObjects.Rectangle;
  private glow!: Phaser.GameObjects.Graphics;
  private clock = -1; // eased copy of world.day, so the sky turns smoothly between ticks
  private seenSeq = -1; // last chronicle entry the scene has reacted to
  private drag: { sx: number; sy: number } | null = null;
  private pinch: { z: number; x: number; y: number } | null = null; // zoom and ground under the fingers when a pinch began
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private blight!: Phaser.GameObjects.Graphics;
  private blightColor = -1;
  private zoomStep = 0; // index into ZOOMS
  private seed = -1; // the world the camera was last centred for
  private raining = false;
  private storm = false; // the long rains: a darker sky
  private flood!: Phaser.GameObjects.Container;
  private floodTiles: { x: number; y: number }[] = [];
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
    // Drawn over the fields wherever they are (buildTown fills both in).
    this.blight = this.add.graphics().setDepth(1).setVisible(false);
    // Floodwater over the low ground by the water, the crops showing faintly through.
    this.flood = this.add.container(0, 0).setDepth(2).setVisible(false).setAlpha(0.8);

    // Gold ring under the selected NPC's feet.
    this.selectRing = this.add.graphics().setVisible(false);
    this.selectRing.lineStyle(2, 0x3b2416).strokeEllipse(0, 0, 18, 8);
    this.selectRing.lineStyle(1, 0xffd23f).strokeEllipse(0, 0, 16, 6);

    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
  }

  // Taps and drags reach the scenes from the page's own pointer events (see mapInput.ts).
  // The country is bigger than the screen at any zoom but the widest, so a drag always pans the map
  // from where the camera was when the finger landed.
  grab(): void {
    const cam = this.cameras.main;
    this.drag = { sx: cam.scrollX, sy: cam.scrollY };
  }

  dragBy(dx: number, dy: number): void {
    const cam = this.cameras.main;
    if (!this.drag) return;
    cam.stopFollow();
    cam.setScroll(this.drag.sx - dx / cam.zoom, this.drag.sy - dy / cam.zoom);
  }

  // Two fingers pinching (or a wheel on a desktop): the zoom follows the spread of the fingers,
  // anywhere between the whole country and 3x, and the ground that was under their midpoint
  // stays under it, so the map can be pinched and panned at once. sx, sy are game pixels on the
  // canvas; spread is the fingers' distance now over their distance when the pinch began.
  pinchStart(sx: number, sy: number): void {
    const cam = this.cameras.main;
    cam.stopFollow();
    this.pinch = { z: cam.zoom, ...this.groundAt(sx, sy) };
  }

  pinchTo(sx: number, sy: number, spread: number): void {
    const cam = this.cameras.main;
    if (!this.pinch) return;
    const fit = this.scale.gameSize.width / (MAP_W * TILE);
    const z = Phaser.Math.Clamp(this.pinch.z * spread, fit, MAX_ZOOM);
    cam.setZoom(z);
    // Phaser zooms about the camera's middle: put the held ground back under the fingers.
    const hw = cam.width / 2;
    const hh = cam.height / 2;
    cam.setScroll(this.pinch.x - hw - (sx - hw) / z, this.pinch.y - hh - (sy - hh) / z);
    // The zoom button names the step nearest the pinch.
    this.zoomStep = z <= fit * 1.1 ? 2 : z < 1.5 ? 0 : 1;
  }

  pinchEnd(): void {
    this.pinch = null;
  }

  private groundAt(sx: number, sy: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const hw = cam.width / 2;
    const hh = cam.height / 2;
    return { x: cam.scrollX + hw + (sx - hw) / cam.zoom, y: cam.scrollY + hh + (sy - hh) / cam.zoom };
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

  // Step through the zooms: the town, a 2x close-up centred on whoever is selected (and following
  // them), the whole country, and back. True while the view is anything but the plain town view.
  // The zoom button's next step; returns the step it is on now.
  toggleZoom(): ZoomStep {
    const cam = this.cameras.main;
    this.zoomStep = (this.zoomStep + 1) % ZOOMS.length;
    const z = ZOOMS[this.zoomStep];
    cam.stopFollow();
    if (z === 0) {
      cam.setZoom(this.scale.gameSize.width / (MAP_W * TILE)).centerOn((MAP_W * TILE) / 2, (MAP_H * TILE) / 2);
      return 'country';
    }
    cam.setZoom(z);
    const s = this.selectedId === null ? undefined : this.npcSprites.get(this.selectedId);
    if (z > 1 && s?.visible) cam.startFollow(s, true, 0.15, 0.15, 0, 10);
    else this.centreOnTown();
    return z === 1 ? 'town' : 'close';
  }
  get zoomed(): ZoomStep {
    const z = ZOOMS[this.zoomStep];
    return z === 0 ? 'country' : z === 1 ? 'town' : 'close';
  }

  // The camera on the town square, where every game opens.
  private centreOnTown(): void {
    if (!this.world) return;
    const s = terrainOf(this.world.seed).site;
    this.cameras.main.centerOn(s.x * TILE + TILE / 2, s.y * TILE);
  }

  // Up on the hills in the woods past the town, where the dragon circles.
  private roost(): { x: number; y: number } {
    const s = this.world ? terrainOf(this.world.seed).site : { x: MAP_W / 2, y: MAP_H / 2 };
    return { x: Phaser.Math.Clamp(s.x + 14, 2, MAP_W - 3) * TILE, y: Phaser.Math.Clamp(s.y - 10, 2, MAP_H - 3) * TILE };
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
      const r = this.roost();
      this.dragon.setPosition(r.x + Math.cos(t) * 28, r.y + Math.sin(t) * 10).setFlipX(Math.sin(t) > 0);
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
      (w.mills ?? []).map((m) => `${m.plot}:${m.kind}:${w.day >= m.ready}`).join(','), // mills going up and opening
      w.techs?.steam !== undefined,
      Math.round((w.smog ?? 0) * 4), // how thick the smoke rises
      !!w.power && w.techs?.tram !== undefined, // the trams run while the power station does
      w.techs?.electricity !== undefined, // the power station's plot is marked out
    ].join('|');
    if (w.seed !== this.seed) {
      // A new world (a new era, a new game): the camera finds its town.
      this.seed = w.seed;
      this.centreOnTown();
    }
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
    // Six beasts to a pasture at most, so a big herd does not pile up over the fences.
    this.syncBeasts(this.herd, Math.min(w.herd ?? 0, PER_PEN * Math.max(1, this.pens().length)), 'pasture');
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
    const color = weather === 'drought' ? 0xd9a441 : 0x6b4a1c;
    if (color !== this.blightColor) {
      this.blightColor = color;
      this.blight.clear().fillStyle(color, weather === 'drought' ? 0.4 : 0.5);
      for (const p of w.parcels ?? []) if (p.kind === 'field') this.blight.fillRect(p.x * TILE, p.y * TILE, p.w * TILE, p.h * TILE);
    }
    const wetNow = flooded(w);
    if (wetNow && !this.flood.length) for (const { x, y } of this.floodTiles) this.flood.add(this.add.sprite(x * TILE, y * TILE, 'water').setOrigin(0).play('water-flow'));
    else if (!wetNow && this.flood.length) this.flood.removeAll(true);
    this.flood.setVisible(wetNow);
    this.raining = wet;
    this.storm = weather === 'deluge';
  }

  // The dragon arrives over the hills, and on its death (or leaving) falls or flies away.
  private syncDragon(w: WorldState): void {
    if (w.dragon && !this.dragon) {
      const r = this.roost();
      const d = this.add.sprite(r.x, r.y, 'dragon').setScale(1.5).setDepth(19_998).play('dragon-walk');
      this.dragon = d;
      if (this.seenSeq >= 0) {
        // In from off the screen's edge.
        this.swooping = true;
        d.setPosition(r.x + 360, r.y - 200);
        this.tweens.add({ targets: d, x: r.x, y: r.y, duration: 2200, ease: 'Sine.out', onComplete: () => (this.swooping = false) });
      }
    } else if (!w.dragon && this.dragon) {
      const d = this.dragon;
      this.dragon = null;
      this.swooping = false;
      const slain = w.chronicle.slice(-8).some((e) => e.text.includes('สังหารมังกร'));
      this.tweens.add(
        slain
          ? { targets: d, y: d.y + 60, angle: 80, alpha: 0, duration: 1600, ease: 'Quad.in', onComplete: () => d.destroy() }
          : { targets: d, x: d.x + 400, y: d.y - 240, duration: 2000, ease: 'Sine.in', onComplete: () => d.destroy() },
      );
    }
  }

  // A raid: it dives over the town trailing fire, shakes the walls, and climbs back to its roost.
  private dragonRaid(): void {
    const d = this.dragon;
    if (!d) return;
    this.swooping = true;
    const s = terrainOf(this.world!.seed).site;
    const over = { x: s.x * TILE, y: (s.y - 2) * TILE };
    const r = this.roost();
    d.setFlipX(true);
    this.tweens.chain({
      targets: d,
      tweens: [
        { x: over.x, y: over.y, duration: 1100, ease: 'Quad.in' },
        { x: over.x - 11 * TILE, y: over.y - 4 * TILE, duration: 900, ease: 'Linear', onStart: () => this.burn(over) },
        { x: r.x, y: r.y, duration: 1600, ease: 'Sine.inOut', onStart: () => d.setFlipX(false) },
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
  private beastSpot(area: Beast['area'], pen = 0): { x: number; y: number } {
    const box = this.beastBox(area, pen);
    const w = this.world;
    const town = w ? townLayout(w) : null;
    const cover = w ? wildsOf(w).cover : null;
    for (let tries = 0; tries < 40; tries++) {
      const tx = Phaser.Math.Between(box.x0, box.x1);
      const ty = Phaser.Math.Between(box.y0, box.y1);
      const i = ty * MAP_W + tx;
      if (town && (!town.cost[i] || town.ground[i] !== 'grass')) continue;
      // Deer keep to the edge of the trees.
      if (area === 'forest' && cover && ![i - 1, i + 1, i - MAP_W, i + MAP_W].some((j) => cover[j] === TREE)) continue;
      return { x: tx * TILE + Phaser.Math.Between(2, 14), y: ty * TILE + Phaser.Math.Between(8, 15) };
    }
    return { x: box.x0 * TILE + 8, y: box.y0 * TILE + 12 };
  }

  // The common pastures the herd grazes (not one a noble has fenced for himself).
  private pens(): NonNullable<WorldState['parcels']> {
    const ps = (this.world?.parcels ?? []).filter((q) => q.kind === 'pasture');
    const common = ps.filter((q) => q.ownerId === undefined);
    return common.length ? common : ps;
  }

  // Where each kind of beast roams: inside its pasture's fence, or the woods around the town.
  private beastBox(area: Beast['area'], pen = 0): { x0: number; y0: number; x1: number; y1: number } {
    const w = this.world;
    const s = w ? terrainOf(w.seed).site : { x: MAP_W >> 1, y: MAP_H >> 1 };
    const pens = this.pens();
    const p = area === 'pasture' && pens.length ? pens[pen % pens.length] : undefined;
    if (p) return { x0: p.x + 1, y0: p.y + 1, x1: p.x + p.w - 2, y1: p.y + p.h - 2 };
    const r = area === 'pasture' ? 4 : 20;
    return { x0: Math.max(1, s.x - r), y0: Math.max(1, s.y - r), x1: Math.min(MAP_W - 2, s.x + r), y1: Math.min(MAP_H - 2, s.y + r) };
  }

  // As many beasts on the map as the sim counts: newborns trot in, the slaughtered (or the
  // wolves' share) fade away.
  private syncBeasts(list: Beast[], want: number, area: Beast['area']): void {
    while (list.length < want) {
      const kind = area === 'forest' ? 'deer' : HERD_MIX[list.length % HERD_MIX.length];
      const pen = area === 'pasture' ? list.length % Math.max(1, this.pens().length) : 0; // spread over the pastures
      const at = this.beastSpot(area, pen);
      const sprite = this.add.sprite(at.x, at.y, kind).setOrigin(0.5, 1).setDepth(at.y).play(`${kind}-walk`);
      sprite.anims.pause();
      if (this.seenSeq >= 0) {
        sprite.setAlpha(0);
        this.tweens.add({ targets: sprite, alpha: 1, duration: 600 });
      }
      list.push({ sprite, to: null, wait: Phaser.Math.Between(500, 6000), area, pen });
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
        const box = this.beastBox('forest');
        b.to = {
          x: Phaser.Math.Clamp(s.x + away.x, box.x0 * TILE, (box.x1 + 1) * TILE - 4),
          y: Phaser.Math.Clamp(s.y + away.y, box.y0 * TILE + 12, (box.y1 + 1) * TILE - 2),
        };
        b.fleeing = true;
        s.setFlipX(b.to.x < s.x);
        s.anims.resume();
        s.anims.timeScale = 2.5;
      }
      if (!b.to) {
        if ((b.wait -= delta) > 0) continue;
        const next = this.beastSpot(b.area, b.pen);
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
    const t = wildsOf(w);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // The ground is painted once into a single texture: the country is too big for a sprite a tile.
    // Only the water moves, so it stays as sprites.
    const rt = this.add.renderTexture(0, 0, MAP_W * TILE, MAP_H * TILE).setOrigin(0).setDepth(-1);
    const flat = { originX: 0, originY: 0 };
    // What each field tile is sown with, so the cash crops and the resting fields show.
    const sown = new Map<number, string>();
    for (const p of w.parcels ?? [])
      if (p.kind === 'field') for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) sown.set(y * MAP_W + x, CROP_ART[cropOf(p)]);
    const near = (x: number, y: number, c: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => t.cover[(y + dy) * MAP_W + x + dx] === c);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const g = town.ground[y * MAP_W + x];
        const px = x * TILE;
        const py = y * TILE;
        if (g === 'water') this.add.sprite(px, py, 'water').setOrigin(0).setDepth(-1).play('water-flow');
        else if (g === 'road') rt.stamp('path', Math.floor(rand() * 2), px, py, flat);
        else if (g === 'crops') {
          const art = sown.get(y * MAP_W + x) ?? 'crops';
          rt.stamp(art, art === 'crops' ? ((x + Math.floor(y / 2)) % 5 === 0 ? 1 : 0) : (x + y) % 2, px, py, flat);
        }
        else if (g === 'trail' || g === 'paved' || g === 'ash') rt.stamp(g, Math.floor(rand() * 2), px, py, flat);
        else if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1 && near(x, y, WATER) && rand() < 0.35) rt.stamp('reeds', Math.floor(rand() * 2), px, py, flat);
        else if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1 && near(x, y, TREE) && rand() < 0.07) rt.stamp('mushrooms', Math.floor(rand() * 2), px, py, flat);
        else if (rand() < 0.06) rt.stamp('flowers', undefined, px, py, flat);
        else rt.stamp('grass', Math.floor(rand() * 3), px, py, flat);
      }
    rt.render();
    // The wild country nobody can stand beside (trees deep in the woods, scrub, rocks) never needs
    // to pass in front of anyone, so it is painted once too, just above the ground. Only the trees
    // at the edge of open ground stay sprites, to stand in front of whoever walks behind them.
    const wild = this.add.renderTexture(0, 0, MAP_W * TILE, MAP_H * TILE).setOrigin(0).setDepth(-0.5);
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && town.cost[y * MAP_W + x] > 0;
    const baked = new Set<Placed>();
    const kind = homeKind(w.seed);
    const homes = (w.homes ?? []).map((h) => lotXY(h.lot));
    for (const p of town.props) {
      const deep = p.key === 'tree' && !open(p.x - 1, p.y) && !open(p.x + 1, p.y) && !open(p.x, p.y - 1) && !open(p.x, p.y + 1);
      if (!deep && p.key !== 'bush' && p.key !== 'rock') continue;
      wild.stamp(p.key === 'tree' ? this.treeArt(w, p.x, p.y, kind, homes) : p.key, undefined, p.x * TILE, (p.y + 1) * TILE, { originX: 0, originY: 1 });
      baked.add(p);
    }
    wild.render();
    // Floodwater over the low ground along the water near town, and over the fields: laid out
    // when the waters rise (syncWeather), not kept animating unseen.
    this.flood.removeAll(true);
    this.floodTiles = [];
    for (let y = Math.max(0, t.site.y - 22); y < Math.min(MAP_H, t.site.y + 22); y++)
      for (let x = Math.max(0, t.site.x - 30); x < Math.min(MAP_W, t.site.x + 30); x++) {
        const i = y * MAP_W + x;
        const low = t.cover[i] !== WATER && t.wet[i] <= 2 && town.cost[i] > 0;
        if (low || town.ground[i] === 'crops') this.floodTiles.push({ x, y });
      }
    this.blightColor = -1; // the fields may have moved: draw the blight afresh
    // The crown's works: upgraded buildings swap their art, new ones stand where the crown put them.
    const upgrade: Record<string, string> = {};
    const rising = w.building && WORKS[w.building.kind].replaces; // a building under scaffolding
    for (const k of WORK_ORDER) if (w.works?.[k] !== undefined && WORKS[k].replaces) upgrade[WORKS[k].replaces!] = WORKS[k].art;
    for (const kind of WORK_ORDER) {
      const plot = WORKS[kind].plot && w.plots?.[kind];
      if (!plot) continue;
      if (w.building?.kind === kind) this.placeProp({ key: 'scaffold', x: plot.x, y: plot.y, anchor: 'top' });
      else if (w.works?.[kind] !== undefined) this.placeProp({ key: kind === 'monument' ? `monument-${Math.min(3, w.monument ?? 1)}` : kind, x: plot.x, y: plot.y, anchor: 'top' });
    }
    // Homes going up stand in scaffolding until they are done.
    const goingUp = new Set((w.homes ?? []).filter((h) => (h.until ?? 0) > w.day).map((h) => `${lotXY(h.lot).x},${lotXY(h.lot).y}`));
    for (const p of town.props) {
      if (baked.has(p)) continue;
      const home = /^(house|townhouse|hut)/.test(p.key);
      const shell = home && (ruined(w, p.x, p.y) ? 'rubble' : goingUp.has(`${p.x},${p.y}`) ? 'scaffold' : undefined);
      if (p.key === 'tree') {
        this.placeProp({ ...p, key: this.treeArt(w, p.x, p.y, kind, homes) });
        continue;
      }
      const img = this.placeProp(upgrade[p.key] ? { ...p, key: upgrade[p.key] } : home ? { ...p, key: shell || (p.key === 'hut' ? p.key : this.aged(p.key)) } : { ...p, key: this.aged(p.key) });
      if (p.key === 'lamp') this.glow.fillStyle(0xffd27a, 0.28).fillCircle(img.x + 8, img.y - 18, 14).fillStyle(0xfff2b0, 1).fillRect(img.x + 6, img.y - 21, 4, 4);
      if (p.key === 'elamp') this.glow.fillStyle(0xeaf6ff, 0.32).fillCircle(img.x + 12, img.y - 14, 20).fillStyle(0xffffff, 1).fillRect(img.x + 10, img.y - 17, 4, 4); // electric light: whiter and wider
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
    const k = w.raising && w.raising.kind !== 'walls' ? w.raising.kind : undefined;
    const at = k && w.plots?.[k];
    if (k && at) {
      if (k === 'castle') {
        const s = this.add.image(at.x * TILE + 32, at.y * TILE + 56, 'scaffold').setOrigin(0.5, 1);
        s.setDepth(s.y + 1);
      } else this.placeProp({ key: 'scaffold', x: at.x, y: at.y, anchor: 'top' });
    }
    // The shanty's shacks (brick tenements in the industrial age).
    for (const s of w.shacks ?? []) this.placeProp({ key: this.aged('shack'), ...lotXY(s), anchor: 'bottom' });
    this.buildMills(w);
    // Before there is a church or a market on the square, the camp gathers round a fire there.
    const sq = places(w).square;
    if (!founded(w, 'church') && !founded(w, 'shop')) this.placeProp({ key: 'campfire', x: sq.x, y: sq.y, anchor: 'bottom' });
    // A hero of a past era stands in stone in the square.
    if (statueHero(w)) {
      const st = this.add.image(sq.x * TILE + TILE / 2, (sq.y + 1) * TILE, 'statue').setOrigin(0.5, 1);
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
    this.drawLandMap();
    this.townBuilt = true;
  }

  // Which tree stands on a tile: pines on the hills and in the woods, birches here and there,
  // fruit trees by the homes, broad oaks everywhere else. Fixed by the tile, so a redraw keeps them.
  private treeArt(w: WorldState, x: number, y: number, kind: HomeKind, homes: { x: number; y: number }[]): string {
    const h = (((x * 73856093) ^ (y * 19349663) ^ w.seed) >>> 0) % 1000 / 1000;
    if (h < 0.45 && homes.some((p) => Math.abs(p.x - x) <= 4 && Math.abs(p.y - y) <= 4)) return 'fruit-tree';
    const pines = PINE_SHARE[kind];
    if (h < pines) return 'pine';
    if (h < pines + 0.15) return 'birch';
    return 'tree';
  }

  // Turns the land plan on or off; returns whether it is on.
  setLandMap(on: boolean): boolean {
    this.landMap = on;
    this.drawLandMap();
    return on;
  }

  // Who holds which ground: each family's fields in its own colour (the crown's and the unclaimed
  // pale), the common grazing green, a noble's enclosed pasture violet, homes orange, the public
  // buildings and the crown's works gold, the town line red.
  private drawLandMap(): void {
    if (this.landLayer?.active) this.landLayer.destroy();
    this.landLayer = null;
    const w = this.world;
    if (!this.landMap || !w) return;
    const g = this.add.graphics().setDepth(MAP_H * TILE + 50);
    const box = (x: number, y: number, wd: number, h: number, color: number, alpha = 0.45) => {
      g.fillStyle(color, alpha).fillRect(x * TILE, y * TILE, wd * TILE, h * TILE);
      g.lineStyle(2, color, 0.95).strokeRect(x * TILE + 1, y * TILE + 1, wd * TILE - 2, h * TILE - 2);
    };
    const FAMILY = [0xe8503a, 0x4a86e0, 0xf582b8, 0x9a66e0, 0x7fd8f8, 0xc47a32, 0xffd23f, 0x56a832];
    for (const p of w.parcels ?? []) {
      if (p.kind === 'pasture') box(p.x, p.y, p.w, p.h, p.ownerId === undefined ? 0x56a832 : 0x9a66e0);
      else box(p.x, p.y, p.w, p.h, p.ownerId === undefined ? 0xfff4d6 : FAMILY[p.ownerId % FAMILY.length]);
    }
    for (const h of w.homes ?? []) {
      const at = lotXY(h.lot);
      box(at.x, at.y, 2, 2, 0xf5902e, 0.35);
    }
    for (const [k, p] of Object.entries(w.plots ?? {})) if (p) box(p.x, p.y, footprint(k).w, footprint(k).h, 0xffd23f, 0.4);
    if (w.ring && (w.founded === undefined || w.founded.walls !== undefined || w.founded.palisade !== undefined)) {
      const m = ringMask(w.ring);
      g.fillStyle(0xe8503a, 0.55);
      for (let i = 0; i < m.length; i++) if (m[i] === ON_WALL) g.fillRect((i % MAP_W) * TILE, Math.floor(i / MAP_W) * TILE, TILE, TILE);
    }
    this.landLayer = g;
  }

  // The mills on the old pasture, scaffolded while they go up; coal smoke from a working mill's
  // chimney (thicker the more coal the town burns), violet sparks over a crystal furnace; and the
  // train that runs along the railway to the station and back.
  private buildMills(w: WorldState): void {
    const smog = w.smog ?? 0;
    for (const m of w.mills ?? []) {
      const p = lotXY(m.plot);
      if (w.day < m.ready) {
        this.placeProp({ key: 'scaffold', x: p.x, y: p.y, anchor: 'top' });
        continue;
      }
      const img = this.placeProp({ key: `mill-${m.kind}`, x: p.x, y: p.y + 1, anchor: 'bottom' });
      const chimney = m.kind === 'cannery' ? 6 : m.kind === 'textile' ? 43 : 44;
      const working = (m.made ?? 0) > 0;
      if (!working) continue;
      const coal = smog > 0.02 && m.kind !== 'engines'; // the engine works' crystal furnace throws sparks, not soot
      this.add
        .particles(img.x + chimney, img.y - 40, coal ? 'smoke' : 'spark', {
          speedY: { min: -14, max: -8 },
          speedX: { min: 2, max: 8 },
          scale: { start: coal ? 0.8 : 1, end: coal ? 2.2 : 0.2 },
          alpha: { start: coal ? 0.75 : 1, end: 0 },
          lifespan: coal ? 3200 : 1400,
          frequency: coal ? Math.round(900 - 600 * smog) : 500,
        })
        .setDepth(img.depth + 1);
    }
    // A tram runs the main street, from the road in to the square, while the power station has fuel.
    if (w.power && w.techs?.tram !== undefined) {
      const from = entryOf(w);
      const to = siteOf(w);
      const tram = this.add.image(from.x * TILE, (from.y + 1) * TILE - 1, 'tram').setOrigin(0.5, 1).setDepth((from.y + 1) * TILE + 2);
      this.tweens.add({ targets: tram, x: to.x * TILE, y: (to.y + 1) * TILE - 1, duration: 16000, ease: 'Sine.easeInOut', yoyo: true, hold: 3000, repeat: -1, repeatDelay: 3000 });
    }
    const rail = railway(w);
    if (!rail) return;
    const edge = rail.to > rail.from ? MAP_W * TILE + 48 : -48;
    const train = this.add.image(edge, (rail.y + 1) * TILE - 2, 'train').setOrigin(0.5, 1).setDepth((rail.y + 1) * TILE + 1);
    const stop = rail.from * TILE;
    const west = rail.to < rail.from; // the art faces west; a train in from the west is turned round
    train.setFlipX(west);
    this.tweens.add({ targets: train, x: stop, duration: 9000, ease: 'Sine.easeOut', yoyo: true, hold: 4000, repeatDelay: 14000, repeat: -1, onYoyo: () => train.setFlipX(!west), onRepeat: () => train.setFlipX(west) });
  }

  // The art for this age, if there is any: houses and clothes change, the rest stays.
  private aged(key: string): string {
    const k = key + AGE_SUFFIX[this.world ? ageOf(this.world) : 1];
    return this.textures.exists(k) ? k : key;
  }

  private placeProp(p: Placed): Phaser.GameObjects.Image {
    // Flat tiles (the side walls) lie under everyone; anything standing sorts by its base.
    if (p.key === 'wall-top' || p.key === 'rail') return this.add.image(p.x * TILE, p.y * TILE, p.key).setOrigin(0).setDepth(0);
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
    // The mills' coal smoke browns the day.
    const gloom = Math.max(this.storm ? 0.3 : this.raining ? 0.18 : 0, (w.smog ?? 0) * 0.22);
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

  // An enemy army storms in along the road.
  private raid(w: WorldState): void {
    this.charge(w, places(w).gate, new Array(12).fill('raider'));
  }

  // A crowd runs from `door` along the roads and scatters about town before melting away.
  private charge(w: WorldState, door: { x: number; y: number }, monsters: string[]): void {
    this.cameras.main.shake(500, 0.004);
    const rng = createRng(w.day);
    monsters.forEach((key, i) => {
      const pos = { ...door };
      const s = places(w).square;
      const goal = snap(w, { x: s.x - 9 + ((i * 7) % 18), y: s.y - 6 + ((i * 5) % 12) });
      const steps: { x: number; y: number }[] = [];
      for (let n = 0; n < 120 && (pos.x !== goal.x || pos.y !== goal.y); n++) {
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
