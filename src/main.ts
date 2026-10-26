import * as Phaser from 'phaser';
import type { WorldState } from './sim';
import { TILE, WorldScene } from './game/scenes/WorldScene';
import { WorldMapScene } from './game/scenes/WorldMapScene';
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
import type { FromWorker, ToWorker } from './worker/protocol';

const TICK_MS = 600; // one in-game day at 1x

const scene = new WorldScene();
const mapScene = new WorldMapScene();
scene.tickMs = TICK_MS;
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 40 * TILE,
  height: 25 * TILE,
  pixelArt: true,
  backgroundColor: '#8fd64e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene, mapScene],
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
let filterToNpc = false;
let showYears = false; // the chronicle tab shows the yearly annals instead of the feed
type Tab = 'log' | 'guild' | 'market' | 'kingdom' | 'people';
let tab: Tab = 'log';

// A finger resting on a button must not have the button rebuilt under it, or the tap is lost:
// while a press is held in the panels, only the header counters update.
let pressing = false;
let stale = false;
addEventListener('pointerdown', (e) => (pressing = !!(e.target as Element).closest?.('#side, dialog')), true);
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
  renderNpcCard(world, selected);
  if (onMap) renderRealms(world);
  else if (tab === 'log' && showYears) renderAnnals(world, (id) => select(id));
  else if (tab === 'log') renderFeed(world, filterToNpc ? selected : null);
  else if (tab === 'guild') renderGuild(world);
  else if (tab === 'market') renderMarket(world);
  else if (tab === 'kingdom') renderKingdom(world);
  else renderPeople(world);
}

function setTab(next: Tab): void {
  tab = next;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#side-tabs button')) {
    const on = b.dataset.tab === next;
    b.setAttribute('aria-selected', String(on));
    b.setAttribute('aria-pressed', String(on));
  }
  document.getElementById('feed')!.hidden = next !== 'log' || showYears;
  document.getElementById('annals')!.hidden = next !== 'log' || !showYears;
  document.getElementById('log-tools')!.hidden = next !== 'log';
  document.getElementById('guild')!.hidden = next !== 'guild';
  document.getElementById('market')!.hidden = next !== 'market';
  document.getElementById('kingdom')!.hidden = next !== 'kingdom';
  document.getElementById('people')!.hidden = next !== 'people';
  render();
}

function select(id: number | null): void {
  selected = id;
  scene.select(id);
  const npcTab = document.querySelector<HTMLButtonElement>('[data-filter="npc"]')!;
  npcTab.disabled = id === null;
  if (id === null && filterToNpc) setFilter('all');
  render();
}

function setFilter(mode: 'all' | 'npc' | 'years'): void {
  filterToNpc = mode === 'npc';
  showYears = mode === 'years';
  for (const b of document.querySelectorAll<HTMLButtonElement>('#log-filter button')) b.setAttribute('aria-pressed', String(b.dataset.filter === mode));
  document.getElementById('feed')!.hidden = tab !== 'log' || showYears;
  document.getElementById('annals')!.hidden = tab !== 'log' || !showYears;
  render();
}

scene.onSelect = select;
scene.onGuild = () => setTab('guild');
initGuild({ onDivineQuest: () => send({ type: 'command', command: { type: 'divineQuest' } }), onSelectNpc: select });
for (const b of document.querySelectorAll<HTMLButtonElement>('#side-tabs button')) {
  b.onclick = () => setTab(b.dataset.tab as Tab);
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
initNpcCard({ onCommand: (command) => send({ type: 'command', command }), onClose: () => select(null), onSelect: select });
document.getElementById('npc-card')!.addEventListener('rerender', () => world && renderNpcCard(world, selected, true));
// Sheets and dialogs keep a finger's scroll to themselves.
for (const id of ['npc-card', 'miracles', 'eras', 'offline']) containScroll(document.getElementById(id)!);
let onMap = false; // the world map is up in the town's place
initBubbles((id) => (onMap ? null : scene.npcScreenPos(id)));
const zoom = document.getElementById('zoom')!;
zoom.onclick = () => zoom.setAttribute('aria-pressed', String(scene.toggleZoom()));

// The world map takes the town's place on the canvas; the town sleeps meanwhile, and the side
// panel trades its tabs for the list of neighbouring realms.
const mapBtn = document.getElementById('worldmap')!;
mapBtn.onclick = () => {
  onMap = !onMap;
  mapBtn.setAttribute('aria-pressed', String(onMap));
  zoom.hidden = onMap;
  document.getElementById('side-tabs')!.hidden = onMap;
  document.getElementById('realms')!.hidden = !onMap;
  for (const id of ['feed', 'log-tools', 'guild', 'market', 'kingdom', 'people']) document.getElementById(id)!.hidden = true;
  if (!onMap) setTab(tab);
  else if (world) {
    pickRealm(world, null);
    mapScene.pick(null);
  }
  const game = scene.game;
  if (onMap) {
    // A town still loading would ignore the sleep, so wait for it to finish starting.
    if (scene.sys.settings.status < Phaser.Scenes.RUNNING) scene.events.once('create', () => onMap && game.scene.sleep('world'));
    else game.scene.sleep('world');
    game.scene.run('worldmap');
  } else {
    game.scene.sleep('worldmap');
    game.scene.wake('world');
  }
};
const pick = (id: number) => {
  mapScene.pick(id);
  if (world) pickRealm(world, id);
};
mapScene.onRealm = (realm) => realm && pick(realm.id); // a tap on open ground keeps the pick
initRealms({ onMiracle: (realmId, kind) => send({ type: 'command', command: { type: 'realm', realmId, kind } }), onPick: pick });

// Sound waits for the first tap (browsers allow audio only after a gesture); buttons blip.
const sound = document.getElementById('sound')!;
const showSound = () => {
  sound.setAttribute('aria-pressed', String(soundOn()));
  sound.querySelector('img')!.src = `/assets/sprites/icons/${soundOn() ? 'sound' : 'mute'}.png`;
};
showSound();
sound.onclick = () => {
  setSound(!soundOn());
  showSound();
};
addEventListener('pointerdown', () => startSound(), { once: true });
addEventListener('click', (e) => (e.target as Element).closest?.('button') && click(), true);

for (const b of document.querySelectorAll<HTMLButtonElement>('#log-filter button')) {
  b.onclick = () => setFilter(b.dataset.filter as 'all' | 'npc' | 'years');
}

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
  pushBubbles(world, selected);
  updateMood(world);
  playEvents(world);
  render();
};

// Save when the tab is hidden or closed so offline progress starts from the latest moment.
document.addEventListener('visibilitychange', () => document.hidden && send({ type: 'save' }));
addEventListener('pagehide', () => send({ type: 'save' }));

send({ type: 'start', tickMs: TICK_MS });

if (import.meta.env.DEV) Object.assign(window, { __grimm: { scene, send, select, worker } });
