import { REGIMES, SEASON_TH, regimeOf, seasonOf, type WorldState } from '../sim';
import { DANGER_KINDS, EVENT_ICON, el, icon } from './icons';

const year = document.getElementById('stat-year')!;
const day = document.getElementById('stat-day')!;
const faith = document.getElementById('stat-faith')!;
const season = document.getElementById('stat-season')!;
const realm = document.getElementById('stat-realm')!;
const feed = document.getElementById('feed')!;
let lastKey = '';
let showAll = false; // the town's daily round, folded away until asked for

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
  const key = `${world.chronicleSeq}:${npcId}:${showAll}`;
  if (key === lastKey) return;
  lastKey = key;
  // One life's story keeps everything; the town's folds away its daily round.
  const life = npcId === null ? world.chronicle : world.chronicle.filter((e) => e.npcId === npcId);
  const fold = npcId === null && !showAll;
  const entries = fold ? life.filter((e) => !e.minor) : life;
  const rows = entries.slice(-40).reverse().map((entry) =>
    el(
      'li',
      { className: `entry${DANGER_KINDS.has(entry.kind) ? ' entry--danger' : ''}${entry.major ? ' entry--major' : ''}` },
      icon(EVENT_ICON[entry.kind]),
      el('p', {}, ...(entry.major ? [el('b', { className: 'entry__tag', textContent: 'เรื่องใหญ่' })] : []), entry.text),
      el('time', { textContent: `D${entry.day}` }),
    ),
  );
  const head: HTMLElement[] = [];
  if (npcId === null) {
    const routine = life.slice(-200).filter((e) => e.minor).length;
    const b = el('button', { type: 'button', className: 'feed-fold', textContent: showAll ? 'ซ่อนเรื่องทั่วไป (คาราวาน เควส มิตรภาพ ฯลฯ)' : `แสดงเรื่องทั่วไปที่ย่อไว้ (${routine} เรื่องล่าสุด)` });
    b.onclick = () => {
      showAll = !showAll;
      renderFeed(world, npcId);
    };
    head.push(el('li', { className: 'entry entry--fold' }, b));
  }
  feed.replaceChildren(...head, ...(rows.length ? rows : [el('li', { className: 'entry entry--empty', textContent: 'ยังไม่มีเรื่องเล่าของคนนี้' })]));
}

// A headline, announced over the map for a few seconds as it happens.
const banner = document.getElementById('headline');
let heard = -1;
let hide: ReturnType<typeof setTimeout> | undefined;
export function renderHeadline(world: WorldState): void {
  if (!banner) return;
  if (heard < 0 || heard > world.chronicleSeq) {
    heard = world.chronicleSeq; // a fresh load or another save: nothing new yet
    return;
  }
  let news: WorldState['chronicle'][number] | undefined;
  for (let i = world.chronicle.length - 1; i >= 0 && world.chronicle[i].seq > heard; i--) if (world.chronicle[i].major) news ??= world.chronicle[i];
  heard = world.chronicleSeq;
  if (!news) return;
  banner.replaceChildren(el('b', { textContent: 'เรื่องใหญ่' }), el('span', { textContent: news.text }));
  banner.hidden = false;
  banner.classList.remove('headline--in');
  void banner.offsetWidth;
  banner.classList.add('headline--in');
  clearTimeout(hide);
  hide = setTimeout(() => (banner.hidden = true), 7000);
}
