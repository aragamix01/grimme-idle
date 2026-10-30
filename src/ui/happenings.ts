import { MOD_TH, activeMods, type Happening, type WorldState } from '../sim';
import { el, icon } from './icons';
import { localize } from './lexicon';

// เหตุการณ์: the town's book of happenings, newest first. Each shows what came up, who decided,
// every option with the one taken marked, why they took it, and what came of it; then the
// effects still in force.

const view = document.getElementById('happenings')!;
const BAD = new Set(['sickness', 'crime', 'fire']); // more of these is worse
let lastKey = '';

function entry(world: WorldState, h: Happening, onNpc: (id: number) => void, pending: boolean): HTMLElement {
  const who = el('button', { type: 'button', className: 'link happening__who', textContent: h.who });
  if (h.chooserId !== undefined) who.onclick = () => onNpc(h.chooserId!);
  const options = el(
    'ul',
    { className: 'happening__options' },
    ...h.options.map((o) => {
      const mark = o.key === h.chosen ? '✔ ' : '';
      const li = el('li', { className: `happening__option${o.key === h.chosen ? ' happening__option--chosen' : ''}`, textContent: `${mark}${o.label}` });
      if (o.key === h.whisper) li.append(el('span', { className: 'chip happening__whisper', textContent: 'เทพกระซิบ' }));
      return li;
    }),
  );
  return el(
    'article',
    { className: `happening${pending ? ' happening--pending' : ''}` },
    el('header', { className: 'happening__head' }, icon('book', 24), el('b', { textContent: h.title }), el('time', { textContent: `D${h.day}` })),
    el('p', { className: 'happening__text', textContent: h.text }),
    el('p', { className: 'happening__meta' }, 'ผู้ตัดสิน: ', who, pending ? ` · อีก ${Math.max(0, h.until - world.day)} วัน` : ''),
    options,
    ...(h.reason ? [el('p', { className: 'happening__reason', textContent: h.reason })] : []),
    ...(h.outcome ? [el('p', { className: 'happening__outcome', textContent: h.outcome })] : []),
  );
}

export function renderHappenings(world: WorldState, onNpc: (id: number) => void): void {
  const book = world.happenings ?? [];
  const mods = activeMods(world);
  const key = JSON.stringify([world.happening?.day, world.happening?.whisper, world.happening && world.happening.until - world.day, book.length, book[book.length - 1]?.day, mods.map((m) => m.until)]);
  if (key === lastKey) return;
  lastKey = key;
  const parts: HTMLElement[] = [];
  if (world.happening) parts.push(entry(world, world.happening, onNpc, true));
  if (mods.length)
    parts.push(
      el(
        'section',
        { className: 'happening-mods' },
        el('h3', { textContent: 'ผลที่ยังอยู่' }),
        ...mods.map((m) =>
          el('p', { className: 'happening-mods__row' }, el('span', { textContent: m.why }), el('b', { className: m.value > 0 === !BAD.has(m.key) ? 'up' : 'down', textContent: `${MOD_TH[m.key]} ${m.value > 0 ? '+' : ''}${m.key === 'piety' ? m.value : `${Math.round(m.value * 100)}%`}` }), el('time', { textContent: `อีก ${m.until - world.day} วัน` })),
        ),
      ),
    );
  for (const h of [...book].reverse()) parts.push(entry(world, h, onNpc, false));
  if (!parts.length) parts.push(el('p', { className: 'log-note', textContent: 'ยังไม่มีเหตุการณ์ใดให้ชาวเมืองต้องตัดสินใจ' }));
  view.replaceChildren(...parts);
  localize(view, world);
}
