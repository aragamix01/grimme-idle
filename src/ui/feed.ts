import type { WorldState } from '../sim';
import { DANGER_KINDS, EVENT_ICON, el, icon } from './icons';

const year = document.getElementById('stat-year')!;
const day = document.getElementById('stat-day')!;
const faith = document.getElementById('stat-faith')!;
const feed = document.getElementById('feed')!;
let lastKey = '';

// npcId narrows the chronicle to one life; null shows the whole world.
export function renderFeed(world: WorldState, npcId: number | null): void {
  year.textContent = String(Math.floor(world.day / 365) + 1);
  day.textContent = String((world.day % 365) + 1);
  faith.textContent = world.faith.toFixed(1);
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
