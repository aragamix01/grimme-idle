import * as Phaser from 'phaser';
import type { WorldState } from './sim';
import { TILE, WorldScene } from './game/scenes/WorldScene';
import { WorldMapScene } from './game/scenes/WorldMapScene';
import { RegionScene } from './game/scenes/RegionScene';
import { initLands, pickLand, pickVillager, renderLands, viewLand } from './ui/lands';
import { initRealms, pickRealm, renderRealms } from './ui/realm';
import { initBubbles, pushBubbles } from './ui/bubbles';
import { click, playEvents, setSound, soundOn, start as startSound, updateMood } from './audio/sound';
import { renderFeed, renderStats } from './ui/feed';
import { initGuild, renderGuild } from './ui/guild';
import { initMarket, renderMarket } from './ui/market';
import { initKingdom, renderKingdom } from './ui/kingdom';
import { initPeople, renderPeople } from './ui/people';
import { initNpcCard, renderNpcCard } from './ui/npcCard';
import { renderAnnals } from './ui/annals';
import { hideCatchup, showCatchup, showOfflineReport } from './ui/offline';
import { initEra, renderEra } from './ui/era';
import { initMiracles, renderMiracles } from './ui/miracles';
import { containScroll } from './ui/contain';
import { initLife, renderLife } from './ui/life';
import type { FromWorker, ToWorker } from './worker/protocol';

const TICK_MS = 600; // one in-game day at 1x

const scene = new WorldScene();
const mapScene = new WorldMapScene();
const regionScene = new RegionScene();
scene.tickMs = TICK_MS;
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 40 * TILE,
  height: 25 * TILE,
  pixelArt: true,
  backgroundColor: '#8fd64e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene, mapScene, regionScene],
});
// Phaser keeps the canvas's place on the page and only rechecks it every half second. The map
// stays pinned while the page scrolls under it, so a tap just after a scroll landed hundreds of
// pixels off (or on nothing): refresh the place on every scroll, and again as a finger lands.
const freshBounds = () => scene.game?.scale.updateBounds();
addEventListener('scroll', freshBounds, { passive: true });
for (const type of ['pointerdown', 'touchstart', 'mousedown']) addEventListener(type, freshBounds, { capture: true, passive: true });

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);

let world: WorldState | null = null;
let selected: number | null = null;

// Five sections along the bottom, each with its own tabs over the sheet under the map. The world
// section swaps the town on the canvas for the world map.
type Section = 'town' | 'people' | 'power' | 'economy' | 'world';
type Sub = 'all' | 'years' | 'npc' | 'people' | 'guild' | 'kingdom' | 'market' | 'realms' | 'lands';
const SECTIONS: Record<Section, { title: string; subs: [Sub, string][] }> = {
  town: { title: 'เมือง', subs: [['all', 'พงศาวดาร'], ['years', 'รายปี'], ['npc', 'คนนี้']] },
  people: { title: 'ผู้คน', subs: [['people', 'ประชาชน'], ['guild', 'กิลด์และเควส']] },
  power: { title: 'อำนาจ', subs: [['kingdom', 'อาณาจักร']] },
  economy: { title: 'เศรษฐกิจ', subs: [['market', 'ตลาดและการค้า']] },
  world: { title: 'โลก', subs: [['realms', 'อาณาจักร'], ['lands', 'ดินแดน']] },
};
const PANEL: Record<Sub, string> = { all: 'feed', years: 'annals', npc: 'feed', people: 'people', guild: 'guild', kingdom: 'kingdom', market: 'market', realms: 'realms', lands: 'lands' };
let section: Section = 'town';
const subOf: Record<Section, Sub> = { town: 'all', people: 'people', power: 'kingdom', economy: 'market', world: 'realms' };
const sub = () => subOf[section];
const app = document.getElementById('app')!;
const subTabs = document.getElementById('sub-tabs')!;

// A finger resting on a button must not have the button rebuilt under it, or the tap is lost:
// while a press is held in the panels, only the header counters update.
let pressing = false;
let stale = false;
addEventListener('pointerdown', (e) => (pressing = !!(e.target as Element).closest?.('#side, #nav, dialog')), true);
const release = () => {
  if (!pressing) return;
  setTimeout(() => {
    pressing = false;
    if (stale) {
      stale = false;
      render();
    }
  }, 250);
};
addEventListener('pointerup', release, true);
addEventListener('pointercancel', release, true);

function render(): void {
  if (!world) return;
  if (pressing) {
    stale = true;
    renderStats(world);
    return;
  }
  renderStats(world);
  renderEra(world);
  renderMiracles(world);
  renderLife(world);
  followLife(world);
  renderNpcCard(world, selected);
  const s = sub();
  if (s === 'lands') renderLands(world);
  else if (s === 'realms') renderRealms(world);
  else if (s === 'years') renderAnnals(world, (id) => select(id));
  else if (s === 'all' || s === 'npc') renderFeed(world, s === 'npc' ? selected : null);
  else if (s === 'guild') renderGuild(world);
  else if (s === 'market') renderMarket(world);
  else if (s === 'kingdom') renderKingdom(world);
  else renderPeople(world);
}

// The section's tabs, its one visible panel, and the nav button that shows where we are.
function showSection(): void {
  const { title, subs } = SECTIONS[section];
  app.dataset.section = section;
  document.getElementById('sheet-title')!.textContent = title;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#nav [data-section]')) {
    if (b.dataset.section === section) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  subTabs.hidden = subs.length < 2;
  subTabs.replaceChildren(
    ...subs.map(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.sub = key;
      b.textContent = label;
      const on = key === sub();
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('aria-pressed', String(on));
      b.disabled = key === 'npc' && selected === null;
      b.onclick = () => setSub(key);
      return b;
    }),
  );
  const shown = PANEL[sub()];
  for (const id of new Set(Object.values(PANEL))) document.getElementById(id)!.hidden = id !== shown;
  render();
}

function setSub(next: Sub): void {
  const owner = (Object.keys(SECTIONS) as Section[]).find((k) => SECTIONS[k].subs.some(([key]) => key === next))!;
  subOf[owner] = next;
  if (owner !== section) setSection(owner);
  else showSection();
}

function setSection(next: Section): void {
  const wasMap = section === 'world';
  section = next;
  if (wasMap !== (next === 'world')) swapMap(next === 'world');
  showSection();
  document.getElementById(PANEL[sub()])!.scrollTop = 0;
}

function select(id: number | null): void {
  selected = id;
  scene.select(id);
  if (id === null && subOf.town === 'npc') subOf.town = 'all';
  showSection();
}

scene.onSelect = select;
scene.onGuild = () => setSub('guild');
initGuild({ onDivineQuest: () => send({ type: 'command', command: { type: 'divineQuest' } }), onSelectNpc: select });
for (const b of document.querySelectorAll<HTMLButtonElement>('#nav [data-section]')) {
  b.onclick = () => setSection(b.dataset.section as Section);
}
initMarket({ onSelectNpc: select });
initKingdom({ onSelectNpc: select, onReveal: () => send({ type: 'command', command: { type: 'reveal' } }),
  onHero: () => send({ type: 'command', command: { type: 'hero' } }),
  onWar: (act) => send({ type: 'command', command: { type: 'war', act } }),
});
initPeople({ onSelectNpc: select });
initMiracles((kind) => send({ type: 'command', command: { type: 'miracle', kind } }));
initEra({
  onEndEra: () => send({ type: 'newEra' }),
  onPerk: (perk) => send({ type: 'command', command: { type: 'perk', perk } }),
});
// Born into the town: the camera finds the new life and stays with it.
let lifeId: number | undefined;
function followLife(w: WorldState): void {
  const id = w.avatar?.id;
  if (id === lifeId) return;
  lifeId = id;
  if (id === undefined) return;
  select(id);
  if (zoom.getAttribute('aria-pressed') !== 'true') showState(zoom, scene.toggleZoom());
}
initLife({
  onBorn: () => send({ type: 'command', command: { type: 'incarnate' } }),
  onAscend: () => send({ type: 'command', command: { type: 'ascend' } }),
  onChoose: (key) => send({ type: 'command', command: { type: 'choose', key } }),
});
initNpcCard({ onCommand: (command) => send({ type: 'command', command }), onClose: () => select(null), onSelect: select });
document.getElementById('npc-card')!.addEventListener('rerender', () => world && renderNpcCard(world, selected, true));
// Sheets, panels and dialogs keep a finger's scroll to themselves.
for (const id of ['npc-card', 'miracles', 'eras', 'offline', ...new Set(Object.values(PANEL))]) containScroll(document.getElementById(id)!);
const onMap = () => section === 'world'; // the world map is up in the town's place
initBubbles((id) => (onMap() ? null : scene.npcScreenPos(id)));
// The menu's toggles say whether they're on.
const showState = (b: HTMLElement, on: boolean) => {
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('.map-tools__state')!.textContent = on ? 'เปิด' : 'ปิด';
};
const zoom = document.getElementById('zoom')!;
showState(zoom, false);
zoom.onclick = () => showState(zoom, scene.toggleZoom());

// The world map takes the town's place on the canvas; the town sleeps meanwhile.
function swapMap(on: boolean): void {
  zoom.hidden = on;
  if (on && world) {
    pickRealm(world, null);
    mapScene.pick(null);
  }
  const game = scene.game;
  if (on) {
    // A town still loading would ignore the sleep, so wait for it to finish starting.
    if (scene.sys.settings.status < Phaser.Scenes.RUNNING) scene.events.once('create', () => onMap() && game.scene.sleep('world'));
    else game.scene.sleep('world');
    game.scene.run('worldmap');
  } else {
    if (viewing !== null) look(null);
    game.scene.sleep('worldmap');
    game.scene.wake('world');
  }
}
// A region up close takes the world map's place; back again from its card.
let viewing: number | null = null;
function look(id: number | null): void {
  const game = scene.game;
  if (id !== null) {
    regionScene.show(id);
    if (viewing === null) {
      game.scene.sleep('worldmap');
      game.scene.run('region');
    }
  } else if (viewing !== null) {
    game.scene.sleep('region');
    game.scene.wake('worldmap');
  }
  viewing = id;
  if (world) viewLand(world, id);
}
const pickRegion = (id: number) => {
  mapScene.pickLand(id);
  if (sub() !== 'lands') setSub('lands');
  if (world) pickLand(world, id);
};
mapScene.onRegion = (region) => pickRegion(region.id);
regionScene.onVillager = (id) => {
  if (sub() !== 'lands') setSub('lands');
  if (world) pickVillager(world, id);
};
initLands({ onPick: pickRegion, onView: look });
const pick = (id: number) => {
  mapScene.pick(id);
  if (world) pickRealm(world, id);
};
mapScene.onRealm = (realm) => {
  if (!realm) return; // a tap on open ground keeps the pick
  if (sub() !== 'realms') setSub('realms');
  pick(realm.id);
};
initRealms({ onMiracle: (realmId, kind) => send({ type: 'command', command: { type: 'realm', realmId, kind } }), onPick: pick });

// The map's settings sit behind one menu button, as a list that closes after a pick or a tap
// anywhere else.
const menu = document.getElementById('map-menu')!;
const tools = document.getElementById('map-tools')!;
function unfold(open: boolean): void {
  tools.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
}
menu.onclick = () => unfold(menu.getAttribute('aria-expanded') !== 'true');
tools.addEventListener('click', (e) => (e.target as Element).closest('button') && unfold(false));
addEventListener('pointerdown', (e) => !tools.hidden && !(e.target as Element).closest?.('#map-tools, #map-menu') && unfold(false), true);

// Sound waits for the first tap (browsers allow audio only after a gesture); buttons blip.
const sound = document.getElementById('sound')!;
const showSound = () => {
  showState(sound, soundOn());
  sound.querySelector('img')!.src = `/assets/sprites/icons/${soundOn() ? 'sound' : 'mute'}.png`;
};
showSound();
sound.onclick = () => {
  setSound(!soundOn());
  showSound();
};
addEventListener('pointerdown', () => startSound(), { once: true });

// Day and night can be held at noon: at 3x the sky flickers. The choice is remembered.
const dayNight = document.getElementById('daynight')!;
const DAYNIGHT_KEY = 'grimm-daynight';
const showDayNight = () => {
  showState(dayNight, scene.dayNight);
  dayNight.querySelector('img')!.src = `/assets/sprites/icons/${scene.dayNight ? 'daynight' : 'sun'}.png`;
  dayNight.title = scene.dayNight ? 'กลางวันกลางคืนหมุนเวียน (แตะเพื่อให้เป็นกลางวันตลอด)' : 'กลางวันตลอด (แตะเพื่อเปิดกลางวันกลางคืน)';
};
try {
  scene.dayNight = localStorage.getItem(DAYNIGHT_KEY) !== 'off';
} catch {
  // storage blocked: keep the default
}
showDayNight();
dayNight.onclick = () => {
  scene.dayNight = !scene.dayNight;
  try {
    localStorage.setItem(DAYNIGHT_KEY, scene.dayNight ? 'on' : 'off');
  } catch {
    // storage blocked: the choice lasts this visit
  }
  showDayNight();
};
addEventListener('click', (e) => (e.target as Element).closest?.('button') && click(), true);

const SPEEDS: Record<string, number> = { 0: 0, 1: TICK_MS, 3: TICK_MS / 3 };
for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) {
  b.onclick = () => {
    const ms = SPEEDS[b.dataset.speed!];
    scene.tickMs = ms || TICK_MS;
    send({ type: 'speed', tickMs: ms });
    for (const o of document.querySelectorAll('#speed button')) o.setAttribute('aria-pressed', String(o === b));
  };
}

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === 'era') {
    location.reload();
    return;
  }
  if (msg.type === 'offline') {
    showOfflineReport(msg.report);
    return;
  }
  if (msg.type === 'catchup') {
    showCatchup(msg.done, msg.total);
    return;
  }
  hideCatchup();
  world = msg.world;
  scene.setWorld(world);
  mapScene.setWorld(world);
  regionScene.setWorld(world);
  pushBubbles(world, selected);
  updateMood(world);
  playEvents(world);
  render();
};

// Save when the tab is hidden or closed so offline progress starts from the latest moment.
document.addEventListener('visibilitychange', () => document.hidden && send({ type: 'save' }));
addEventListener('pagehide', () => send({ type: 'save' }));

send({ type: 'start', tickMs: TICK_MS });

showSection();

if (import.meta.env.DEV) Object.assign(window, { __grimm: { scene, mapScene, send, select, worker } });
