import { costOf, miracleBlocked, MIRACLES, MIRACLE_ORDER, miracleCost, miracleWait, weatherOf, type MiracleKind, type WorldState } from '../sim';
import { el, icon } from './icons';

// The god-powers sheet: a dream for one person and a life below at the top, then the miracles as
// tiles. A tap on a tile shows what it does and what it costs, and only the button there works
// it, so nothing is cast by a stray tap.

const open = document.getElementById('miracle-open') as HTMLButtonElement;
const dialog = document.getElementById('miracles') as HTMLDialogElement;
const body = document.getElementById('miracles-body')!;
const faith = document.getElementById('powers-faith')!;
const dreamCost = document.getElementById('dream-cost')!;
const dreamBtn = document.getElementById('dream-open') as HTMLButtonElement;

interface Handlers {
  onMiracle: (kind: MiracleKind) => void;
  onDream: () => void; // close the sheet and wait for a tap on someone
}
let handlers: Handlers;
let lastKey = '';
let chosen: MiracleKind | null = null;
let last: WorldState | null = null; // so the dialog fills at once, even with time stopped

export function initMiracles(h: Handlers): void {
  handlers = h;
  open.onclick = () => {
    lastKey = '';
    chosen = null;
    dialog.showModal();
    if (last) renderMiracles(last);
  };
  dreamBtn.onclick = () => {
    dialog.close();
    handlers.onDream();
  };
}

const WEATHER_TH = { rain: 'ฝนฉ่ำ', blight: 'โรคพืช', drought: 'ภัยแล้ง', deluge: 'ฝนตกไม่หยุด' } as const;

export function renderMiracles(world: WorldState): void {
  last = world;
  if (!dialog.open) return;
  faith.textContent = world.faith < 100 ? world.faith.toFixed(1) : String(Math.floor(world.faith));
  const dream = costOf(world, 'dream');
  dreamCost.textContent = `แตะคนบนแผนที่ · ${dream} ศรัทธา`;
  dreamBtn.disabled = !!world.avatar || world.faith < dream;
  const weather = weatherOf(world);
  const key = JSON.stringify([chosen, !!world.avatar, Math.floor(world.faith), weather, world.weather?.until, world.miracleAt, world.miracleRush, world.day, !!world.cult, world.legacy?.perks.grace, !!world.aegis, world.demon?.stage, world.chronicleSeq]);
  if (key === lastKey) return;
  lastKey = key;
  const left = weather ? world.weather!.until - world.day : 0;
  body.replaceChildren(
    el('p', {
      className: 'powers-note',
      textContent: world.avatar ? 'ระหว่างที่ลงไปใช้ชีวิตในเมือง ใช้ปาฏิหาริย์ไม่ได้ กลับเป็นเทพก่อน' : weather ? `${WEATHER_TH[weather]}ยังปกคลุมทุ่งนาอีก ${left} วัน${weather === 'drought' ? ' (ฝนฉ่ำช่วยยุติได้)' : ''}` : 'แตะปาฏิหาริย์เพื่อดูผล · ใช้ซ้ำภายใน 30 วันราคาเพิ่มเป็นเท่าตัว',
    }),
    group(world, 'พรของเทพ', false, false),
    group(world, 'ลงทัณฑ์', true, false),
    group(world, 'ปาฏิหาริย์ใหญ่แห่งแสง', false, true),
    group(world, 'หายนะใหญ่', true, true),
  );
}

function group(world: WorldState, title: string, dark: boolean, big: boolean): HTMLElement {
  const kinds = MIRACLE_ORDER.filter((k) => MIRACLES[k].dark === dark && !!MIRACLES[k].big === big);
  if (!kinds.length) return el('div');
  const shown = chosen && kinds.includes(chosen) ? chosen : null;
  return el(
    'section',
    { className: 'powers-group' },
    el('h3', { textContent: title }),
    el('div', { className: 'miracle-grid' }, ...kinds.map((k) => tile(world, k))),
    ...(shown ? [detail(world, shown)] : []),
  );
}

const usable = (world: WorldState, k: MiracleKind) => world.faith >= miracleCost(world, k) && !miracleBlocked(world, k) && !world.avatar;

function tile(world: WorldState, k: MiracleKind): HTMLElement {
  const m = MIRACLES[k];
  const b = el(
    'button',
    { type: 'button', className: `miracle${m.dark ? ' miracle--dark' : ''}${usable(world, k) ? '' : ' miracle--off'}${chosen === k ? ' miracle--on' : ''}` },
    icon(m.icon, 32),
    el('span', { className: 'miracle__name', textContent: m.name }),
    el('span', { className: 'miracle__cost' }, icon('faith', 12), String(miracleCost(world, k))),
  );
  b.setAttribute('aria-pressed', String(chosen === k));
  b.onclick = () => {
    chosen = chosen === k ? null : k;
    lastKey = '';
    renderMiracles(world);
  };
  return b;
}

// What the picked miracle does, why it can't be worked now if it can't, and the button that works it.
function detail(world: WorldState, k: MiracleKind): HTMLElement {
  const m = MIRACLES[k];
  const cost = miracleCost(world, k);
  const wait = miracleWait(world, k);
  const blocked = miracleBlocked(world, k);
  const go = el('button', { type: 'button', className: `btn ${m.dark ? 'btn--dark' : 'btn--gold'} miracle-go`, disabled: !usable(world, k) }, `บันดาล${m.name}`, el('span', { className: 'divine__cost' }, icon('faith', 16), String(cost)));
  go.onclick = () => {
    chosen = null;
    lastKey = '';
    handlers.onMiracle(k);
  };
  return el(
    'div',
    { className: `miracle-detail${m.dark ? ' miracle-detail--dark' : ''}` },
    el('p', {}, el('b', { textContent: m.name }), ` · ${blocked ?? m.text}`),
    ...(wait ? [el('p', { className: 'miracle-detail__wait', textContent: `เพิ่งใช้ไป ราคาจะกลับเป็นปกติในอีก ${wait} วัน` })] : []),
    ...(world.faith < cost && !blocked ? [el('p', { className: 'miracle-detail__wait', textContent: `ศรัทธายังขาดอีก ${Math.ceil(cost - world.faith)}` })] : []),
    go,
  );
}
