import type { EventKind, WorldState } from '../sim';

const year = document.getElementById('stat-year')!;
const day = document.getElementById('stat-day')!;
const faith = document.getElementById('stat-faith')!;
const count = document.getElementById('log-count')!;
const feed = document.getElementById('feed')!;
let lastSeq = -1;

const ICON: Record<EventKind, string> = {
  world: 'faith',
  battle: 'sword',
  death: 'skull',
  disaster: 'skull',
  theft: 'gold',
  bless: 'bless',
  curse: 'curse',
  dream: 'dream',
};
const DANGER = new Set<EventKind>(['death', 'disaster']);

export function renderFeed(world: WorldState): void {
  year.textContent = String(Math.floor(world.day / 365) + 1);
  day.textContent = String((world.day % 365) + 1);
  faith.textContent = world.faith.toFixed(1);
  if (world.chronicleSeq === lastSeq) return;
  lastSeq = world.chronicleSeq;
  count.textContent = `${world.chronicleSeq} เรื่อง`;
  feed.replaceChildren(
    ...world.chronicle.slice(-30).reverse().map((entry) => {
      const li = document.createElement('li');
      li.className = 'entry';
      if (DANGER.has(entry.kind)) li.classList.add('entry--danger');
      const icon = document.createElement('img');
      icon.src = `/assets/sprites/icons/${ICON[entry.kind]}.png`;
      icon.alt = '';
      icon.width = icon.height = 32;
      const text = document.createElement('p');
      text.textContent = entry.text;
      const stamp = document.createElement('time');
      stamp.textContent = `D${entry.day}`;
      li.append(icon, text, stamp);
      return li;
    }),
  );
}
