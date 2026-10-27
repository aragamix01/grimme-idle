import * as Phaser from 'phaser';
import { REGIMES, SEASON_TH, regimeOf, seasonOf, weatherOf, type WorldState } from './sim';
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
import { initNpcCard, renderNpcCard, startDream } from './ui/npcCard';
import { renderAnnals } from './ui/annals';
import { hideCatchup, showCatchup, showOfflineReport } from './ui/offline';
import { initEra, renderEra } from './ui/era';
import { initMiracles, renderMiracles } from './ui/miracles';
import { containScroll } from './ui/contain';
import { initLife, renderLife } from './ui/life';
import { initUrgent, renderUrgent, urgentCount } from './ui/urgent';
import type { FromWorker, ToWorker } from './worker/protocol';
import { bindMapInput } from './game/mapInput';

const TICK_MS = 600; // one in-game day at 1x

const scene = new WorldScene();
const mapScene = new WorldMapScene();
const regionScene = new RegionScene();
scene.tickMs = TICK_MS;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 40 * TILE,
  height: 25 * TILE,
  pixelArt: true,
  backgroundColor: '#8fd64e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { mouse: false, touch: false, keyboard: false, gamepad: false }, // the map's taps come from mapInput
  scene: [scene, mapScene, regionScene],
});
// Taps and drags go to whichever map is up: the town, the world map, or a land up close.
game.events.once(Phaser.Core.Events.READY, () =>
  bindMapInput(game.canvas, game, () => {
    if (section !== 'world') return scene.sys.isActive() ? { scene, tap: (x, y, k, t) => scene.tap(x, y, k, t), grab: () => scene.grab(), dragBy: (dx, dy) => scene.dragBy(dx, dy) } : null;
    const up = viewing !== null ? regionScene : mapScene;
    return up.sys.isActive() ? { scene: up, tap: (x, y, k, t) => up.tap(x, y, k, t) } : null;
  }),
);

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);

let world: WorldState | null = null;
let selected: number | null = null;

// Five sections along the bottom, each with its own tabs over the sheet under the map. The world
// section swaps the town on the canvas for the world map.
type Section = 'town' | 'people' | 'power' | 'economy' | 'world';
type Sub = 'urgent' | 'all' | 'years' | 'npc' | 'people' | 'guild' | 'quests' | 'overview' | 'council' | 'law' | 'court' | 'threat' | 'market' | 'houses' | 'works' | 'research' | 'realms' | 'lands' | 'war';
const SECTIONS: Record<Section, { title: string; subs: [Sub, string][] }> = {
  town: { title: 'เมือง', subs: [['urgent', 'ด่วน'], ['all', 'พงศาวดาร'], ['years', 'รายปี'], ['npc', 'คนนี้']] },
  people: { title: 'ผู้คน', subs: [['people', 'ประชาชน'], ['guild', 'กิลด์'], ['quests', 'เควส']] },
  power: { title: 'อำนาจ', subs: [['overview', 'ภาพรวม'], ['council', 'สภา'], ['law', 'กฎหมาย'], ['court', 'ศาล'], ['threat', 'ภัย']] },
  economy: { title: 'เศรษฐกิจ', subs: [['market', 'ตลาด'], ['houses', 'บ้านการค้า'], ['works', 'ก่อสร้าง'], ['research', 'วิจัย']] },
  world: { title: 'โลก', subs: [['realms', 'อาณาจักร'], ['lands', 'ดินแดน'], ['war', 'สงคราม']] },
};
// Each tab's panel, and for panels shared by several tabs, which of its parts to show.
const PANEL: Record<Sub, [string, string?]> = {
  urgent: ['urgent'], all: ['feed'], years: ['annals'], npc: ['feed'],
  people: ['people'], guild: ['guild', 'guilds'], quests: ['guild', 'quests'],
  overview: ['kingdom', 'overview'], council: ['kingdom', 'council'], law: ['kingdom', 'law'], court: ['kingdom', 'court'], threat: ['kingdom', 'threat'],
  market: ['market', 'prices'], houses: ['market', 'houses'], works: ['kingdom', 'works'], research: ['kingdom', 'research'],
  realms: ['realms'], lands: ['lands'], war: ['kingdom', 'war'],
};
const PANELS = [...new Set(Object.values(PANEL).map(([id]) => id))];
let section: Section = 'town';
const subOf: Record<Section, Sub> = { town: 'urgent', people: 'people', power: 'overview', economy: 'market', world: 'realms' };
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
  const [panel] = PANEL[s];
  renderUrgent(world, panel === 'urgent');
  renderMapNotes(world);
  refreshTabs(world);
  if (panel === 'lands') renderLands(world);
  else if (panel === 'realms') renderRealms(world);
  else if (panel === 'annals') renderAnnals(world, (id) => select(id));
  else if (panel === 'feed') renderFeed(world, s === 'npc' ? selected : null);
  else if (panel === 'guild') renderGuild(world);
  else if (panel === 'market') renderMarket(world);
  else if (panel === 'kingdom') renderKingdom(world);
  else if (panel === 'people') renderPeople(world);
  showPart(panel, PANEL[s][1]);
}

// Panels shared by several tabs (the kingdom, the market, the guilds) show one tab's parts.
function showPart(panel: string, part: string | undefined): void {
  if (!part) return;
  for (const c of document.getElementById(panel)!.children) {
    const g = (c as HTMLElement).dataset.group;
    if (g) (c as HTMLElement).hidden = g !== part;
  }
}

// What a section's head says beside its title: the season and weather, or the regime.
function sheetChip(w: WorldState): string {
  if (section === 'town' || section === 'economy') return SEASON_TH[seasonOf(w.day)];
  if (section === 'power') return REGIMES[regimeOf(w)].name;
  return '';
}

// Tab labels that carry a count: people, guilds, quests, a war.
function tabLabel(key: Sub, label: string, w: WorldState | null): string {
  if (!w) return label;
  const n =
    key === 'people' ? w.npcs.filter((x) => x.alive).length
    : key === 'guild' ? w.guilds.length
    : key === 'quests' ? w.quests.filter((q) => ['recruiting', 'travelling', 'inside'].includes(q.stage)).length
    : key === 'war' ? (w.war ? 1 : 0)
    : key === 'urgent' ? urgentCount(w)
    : 0;
  return n ? `${label} ${n}` : label;
}
let tabsKey = '';
function refreshTabs(w: WorldState): void {
  const chip = document.getElementById('sheet-chip')!;
  const text = sheetChip(w);
  chip.hidden = !text;
  chip.textContent = text;
  const labels = SECTIONS[section].subs.map(([key, label]) => tabLabel(key, label, w));
  const key = `${section}:${labels.join('|')}`;
  if (key === tabsKey) return;
  tabsKey = key;
  subTabs.querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => (b.textContent = labels[i]));
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
  tabsKey = '';
  subTabs.replaceChildren(
    ...subs.map(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.sub = key;
      b.textContent = tabLabel(key, label, world);
      const on = key === sub();
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('aria-pressed', String(on));
      b.disabled = key === 'npc' && selected === null;
      b.onclick = () => setSub(key);
      return b;
    }),
  );
  const [shown, part] = PANEL[sub()];
  for (const id of PANELS) document.getElementById(id)!.hidden = id !== shown;
  render();
  showPart(shown, part);
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
  document.getElementById(PANEL[sub()][0])!.scrollTop = 0;
}

function select(id: number | null): void {
  if (id !== null && dreamFor) {
    dreamFor = false;
    startDream();
  }
  selected = id;
  if (id === null) delete app.dataset.card;
  else app.dataset.card = 'open';
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
initKingdom({ onSelectNpc: select, onLaw: () => setSub('law'), onReveal: () => send({ type: 'command', command: { type: 'reveal' } }),
  onHero: () => send({ type: 'command', command: { type: 'hero' } }),
  onWar: (act) => send({ type: 'command', command: { type: 'war', act } }),
});
initPeople({
  onSelectNpc: select,
  onVillager: (regionId, id) => {
    setSub('lands');
    pickRegion(regionId);
    if (world) pickVillager(world, id);
  },
});
initUrgent({
  onChoose: (key) => send({ type: 'command', command: { type: 'choose', key } }),
  onGo: (where, regionId) => {
    if (where === 'lands') {
      setSub('lands');
      if (regionId !== undefined) pickRegion(regionId);
    } else setSub(where === 'war' ? 'war' : where === 'threat' ? 'threat' : where === 'market' ? 'market' : 'overview');
  },
});
// A dream from the powers sheet waits for a tap on someone in town.
let dreamFor = false;
initMiracles({
  onMiracle: (kind) => send({ type: 'command', command: { type: 'miracle', kind } }),
  onDream: () => {
    if (section === 'world') setSection('town');
    dreamFor = true;
    if (world) renderMapNotes(world);
  },
});
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
// A tap on the dim backdrop around a dialog closes it (the life choice must be made, so not that one).
for (const id of ['miracles', 'eras', 'offline']) {
  const d = document.getElementById(id) as HTMLDialogElement;
  d.addEventListener('click', (e) => {
    const r = d.getBoundingClientRect(); // a click on the dialog's own padding also targets it
    if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close();
  });
}
// Sheets, panels and dialogs keep a finger's scroll to themselves.
for (const id of ['npc-card', 'miracles', 'eras', 'offline', ...PANELS]) containScroll(document.getElementById(id)!);
const onMap = () => section === 'world'; // the world map is up in the town's place
// Speech bubbles only over the part of the town the map shows (on phones it is cropped to a strip).
const mapBox = document.getElementById('map')!;
initBubbles((id) => {
  const p = onMap() ? null : scene.npcScreenPos(id);
  const r = mapBox.getBoundingClientRect();
  return p && p.x >= r.left && p.x <= r.right && p.y >= r.top + 8 && p.y <= r.bottom ? p : null;
});
// The menu's toggles say whether they're on.
const showState = (b: HTMLElement, on: boolean) => {
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('.map-tools__state')!.textContent = on ? 'เปิด' : 'ปิด';
};
const zoom = document.getElementById('zoom')!;
showState(zoom, false);
zoom.onclick = () => showState(zoom, scene.toggleZoom());

// Notes over the map: the season and weather over the town; our lands and any war over the world.
function renderMapNotes(w: WorldState): void {
  const note = document.getElementById('map-note')!;
  const chips = document.getElementById('map-chips')!;
  const weather = weatherOf(w);
  note.hidden = onMap();
  note.classList.toggle('map-note--ask', dreamFor);
  note.textContent = dreamFor ? 'แตะชาวเมืองที่จะส่งความฝันให้' : `${SEASON_TH[seasonOf(w.day)]} · ${weather ? WEATHER_TH[weather] : 'ฟ้าใส'}`;
  chips.hidden = !onMap();
  const ours = (w.regions ?? []).filter((r) => r.owner === 'us').length;
  const text = `ดินแดนของเรา ${ours}/${w.regions?.length ?? 0}${w.war ? '|สงคราม 1' : ''}`;
  if (chips.dataset.text !== text) {
    chips.dataset.text = text;
    chips.replaceChildren(...text.split('|').map((t, i) => Object.assign(document.createElement('span'), { textContent: t, className: i ? 'map-chip map-chip--danger' : 'map-chip' })));
  }
}
const WEATHER_TH = { rain: 'ฝนฉ่ำ', blight: 'โรคพืช', drought: 'ภัยแล้ง', deluge: 'ฝนไม่หยุด' } as const;

// The world map takes the town's place on the canvas; the town sleeps meanwhile.
function swapMap(on: boolean): void {
  zoom.hidden = on;
  document.getElementById('worldmap-tool')!.querySelector('span')!.textContent = on ? 'กลับเมือง' : 'แผนที่โลก';
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

// On phones the sheet can be pulled up over the map to read more, by its grab bar or a swipe
// on its head, and pushed back down the same way.
const grab = document.getElementById('sheet-grab')!;
function pullSheet(full: boolean): void {
  if (full) app.dataset.sheet = 'full';
  else delete app.dataset.sheet;
  grab.setAttribute('aria-expanded', String(full));
  grab.setAttribute('aria-label', full ? 'ย่อแผ่นข้อมูลลงให้เห็นแผนที่' : 'ขยายแผ่นข้อมูลขึ้นทับแผนที่');
}
grab.onclick = () => pullSheet(app.dataset.sheet !== 'full');
const sheetHead = document.getElementById('sheet-head')!;
let swipeY: number | null = null;
sheetHead.addEventListener('touchstart', (e) => (swipeY = e.touches[0].clientY), { passive: true });
sheetHead.addEventListener('touchend', (e) => {
  if (swipeY === null) return;
  const dy = e.changedTouches[0].clientY - swipeY;
  swipeY = null;
  if (Math.abs(dy) > 30) pullSheet(dy < 0);
});

// The map's settings sit behind one menu button, as a list that closes after a pick or a tap
// anywhere else.
const menu = document.getElementById('map-menu')!;
const tools = document.getElementById('map-tools')!;
function unfold(open: boolean): void {
  tools.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
}
menu.onclick = () => unfold(menu.getAttribute('aria-expanded') !== 'true');
document.getElementById('worldmap-tool')!.onclick = () => setSection(section === 'world' ? 'town' : 'world');
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
