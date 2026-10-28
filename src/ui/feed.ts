import { REGIMES, SEASON_TH, regimeOf, seasonOf, type WorldState } from '../sim';
import { DANGER_KINDS, EVENT_ICON, el, icon } from './icons';

const year = document.getElementById('stat-year')!;
const day = document.getElementById('stat-day')!;
const faith = document.getElementById('stat-faith')!;
const season = document.getElementById('stat-season')!;
const realm = document.getElementById('stat-realm')!;
const feed = document.getElementById('feed')!;
let lastKey = '';

// The header counters, kept current whichever tab is open. Wide screens also show the season,
// the regime and the head count.
export function renderStats(world: WorldState): void {
  year.textContent = String(Math.floor(world.day / 365) + 1);
  day.textContent = String((world.day % 365) + 1);
  faith.textContent = world.faith < 100 ? world.faith.toFixed(1) : String(Math.floor(world.faith));
  season.textContent = ` · ${SEASON_TH[seasonOf(world.day)]}`;
  realm.textContent = `${REGIMES[regimeOf(world)].name} · ประชากร ${world.npcs.filter((n) => n.alive).length}`;
}

// npcId narrows the chronicle to one life; null shows the whole world.
export function renderFeed(world: WorldState, npcId: number | null): void {
  const key = `${world.chronicleSeq}:${npcId}`;
  if (key === lastKey) return;
  lastKey = key;
  const entries = npcId === null ? world.chronicle : world.chronicle.filter((e) => e.npcId === npcId);
  const rows = entries.slice(-40).reverse().map((entry) =>
    el(
      'li',
      { className: DANGER_KINDS.has(entry.kind) ? 'entry entry--danger' : 'entry' },
      icon(EVENT_ICON[entry.kind]),
      el('p', { textContent: entry.text }),
      el('time', { textContent: `D${entry.day}` }),
    ),
  );
  feed.replaceChildren(...(rows.length ? rows : [el('li', { className: 'entry entry--empty', textContent: 'ยังไม่มีเรื่องเล่าของคนนี้' })]));
}
