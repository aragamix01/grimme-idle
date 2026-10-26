import { yearPage, type WorldState, type YearRecord } from '../sim';
import manifest from '../game/sprite-manifest.json';
import { DANGER_KINDS, EVENT_ICON, el, icon } from './icons';

const view = document.getElementById('annals')!;
const SPRITES = manifest as Record<string, { frameWidth: number; frameHeight: number; frames: number }>;
const SHOWN = 3; // finished years shown below the year in progress
const ART_BOX = 56;
let lastKey = '';

// The year's picture: the first frame of its sprite, scaled up whole-pixel to fit the box.
function art(path: string): HTMLElement {
  const name = path.split('/').pop()!;
  const s = SPRITES[name];
  const box = el('div', { className: 'year__art' });
  if (!s) return box;
  const k = Math.max(1, Math.floor(Math.min(ART_BOX / s.frameWidth, ART_BOX / s.frameHeight)));
  box.style.backgroundImage = `url(/assets/sprites/${path}.png)`;
  box.style.backgroundSize = `${s.frameWidth * s.frames * k}px ${s.frameHeight * k}px`;
  box.style.backgroundPosition = `${(ART_BOX - s.frameWidth * k) / 2}px ${ART_BOX - s.frameHeight * k}px`;
  return box;
}

// Twelve months as bars, low to high.
function chart(label: string, values: number[], tone: string): HTMLElement {
  const top = Math.max(1, ...values);
  const low = Math.min(...values, top);
  const bars = el('div', { className: `year__bars year__bars--${tone}` });
  for (let i = 0; i < 12; i++) {
    const v = values[i];
    const bar = el('i');
    if (v === undefined) bar.className = 'year__bar--empty';
    else bar.style.height = `${12 + ((v - low) / Math.max(1, top - low)) * 88}%`;
    if (v !== undefined) bar.title = String(v);
    bars.append(bar);
  }
  const first = values[0];
  const last = values[values.length - 1];
  const delta = first === undefined || last === undefined ? '' : `${last >= first ? '+' : ''}${last - first}`;
  return el('div', { className: 'year__chart' }, el('span', { className: 'year__chart-label', textContent: label }), bars, el('b', { textContent: last === undefined ? '–' : `${last} (${delta})` }));
}

function card(page: YearRecord, live: boolean, onNpc: (id: number) => void): HTMLElement {
  const chip = (text: string) => el('span', { className: 'chip', textContent: text });
  return el(
    'article',
    { className: `year${live ? ' year--live' : ''}` },
    el(
      'header',
      { className: 'year__head' },
      art(page.art),
      el(
        'div',
        {},
        el('p', { className: 'year__no', textContent: live ? `ปีที่ ${page.year} · ยังไม่จบปี` : `ปีที่ ${page.year}` }),
        el('h3', { className: 'year__title', textContent: page.title }),
        el('p', { className: 'realm-king__meta', textContent: page.king ? (page.ruler && page.ruler !== 'กษัตริย์' ? `สมัย${page.ruler}${page.king}` : `รัชสมัยกษัตริย์${page.king}`) : 'บัลลังก์ว่าง' }),
      ),
    ),
    el('div', { className: 'year__chips' }, chip(`เกิด ${page.born}`), chip(`ตาย ${page.died}`), chip(`ย้ายเข้า ${page.arrived}`), ...(page.left ? [chip(`ทิ้งเมือง ${page.left}`)] : [])),
    el('div', { className: 'year__charts' }, chart('ประชากร', page.pop, 'pop'), chart('ท้องพระคลัง', page.gold, 'gold')),
    el(
      'ol',
      { className: 'year__events' },
      ...(page.highlights.length
        ? page.highlights.map((h) => {
            const li = el('li', { className: DANGER_KINDS.has(h.kind) ? 'entry entry--danger' : 'entry' }, icon(EVENT_ICON[h.kind], 24), el('p', { textContent: h.text }), el('time', { textContent: `D${h.day}` }));
            if (h.npcId !== undefined) {
              li.classList.add('entry--link');
              li.onclick = () => onNpc(h.npcId!);
            }
            return li;
          })
        : [el('li', { className: 'entry entry--empty', textContent: 'ไม่มีเหตุการณ์ใหญ่ ชาวเมืองใช้ชีวิตกันอย่างสงบ' })]),
    ),
  );
}

// The year so far, then the last few years, newest first. Saves from before the annals get
// their recent years rebuilt from whatever the chronicle still remembers.
export function renderAnnals(world: WorldState, onNpc: (id: number) => void): void {
  const key = `${Math.floor(world.day / 10)}:${world.annals?.length ?? 0}:${world.chronicleSeq > 0}`;
  if (key === lastKey) return;
  lastKey = key;
  const year = Math.floor(world.day / 365) + 1;
  const start = (year - 1) * 365;
  const s = world.yearSamples ?? { pop: [], gold: [] };
  const now = yearPage(world, year, start, world.day, s.pop, s.gold);
  const pages = [...(world.annals ?? [])];
  const oldest = world.chronicle[0]?.day ?? world.day;
  for (let y = year - 1; y >= 1 && pages.length < SHOWN; y--) {
    if (pages.some((p) => p.year === y)) continue;
    if ((y - 1) * 365 < oldest - 1) break; // the chronicle no longer reaches back that far
    pages.unshift(yearPage(world, y, (y - 1) * 365, y * 365, [], []));
  }
  const past = pages.sort((a, b) => b.year - a.year).slice(0, SHOWN);
  view.replaceChildren(
    el('p', { className: 'log-note', textContent: `สรุป ${SHOWN} ปีล่าสุด · แตะเหตุการณ์เพื่อดูคนนั้น` }),
    card(now, true, onNpc),
    ...past.map((p) => card(p, false, onNpc)),
  );
}
