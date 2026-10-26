import { MIRACLES, MIRACLE_ORDER, miracleCost, miracleReady, miracleWait, weatherOf, type MiracleKind, type WorldState } from '../sim';
import { el, icon } from './icons';

const open = document.getElementById('miracle-open') as HTMLButtonElement;
const dialog = document.getElementById('miracles') as HTMLDialogElement;
const body = document.getElementById('miracles-body')!;

let onMiracle: (kind: MiracleKind) => void;
let lastKey = '';
let last: WorldState | null = null; // so the dialog fills at once, even with time stopped

export function initMiracles(handler: (kind: MiracleKind) => void): void {
  onMiracle = handler;
  open.onclick = () => {
    lastKey = '';
    dialog.showModal();
    if (last) renderMiracles(last);
  };
}

const WEATHER_TH = { rain: 'ฝนฉ่ำ', blight: 'โรคพืช', drought: 'ภัยแล้ง', deluge: 'ฝนตกไม่หยุด' } as const;

export function renderMiracles(world: WorldState): void {
  last = world;
  if (!dialog.open) return;
  const weather = weatherOf(world);
  const key = JSON.stringify([Math.floor(world.faith), weather, world.weather?.until, world.miracleAt, !!world.cult, world.legacy?.perks.grace]);
  if (key === lastKey) return;
  lastKey = key;
  const left = weather ? world.weather!.until - world.day : 0;
  body.replaceChildren(
    el('p', {
      className: 'realm-king__meta',
      textContent: weather ? `${WEATHER_TH[weather]}ยังปกคลุมทุ่งนาอีก ${left} วัน${weather === 'drought' ? ' (ฝนฉ่ำของเทพเจ้าช่วยยุติได้)' : ''}` : 'บันดาลสิ่งต่างๆ ให้เกิดกับทั้งโลก แต่ละอย่างต้องรอ 30 วันก่อนใช้ซ้ำ',
    }),
    group(world, 'พรแห่งแสง', false),
    group(world, 'ภัยแห่งความมืด', true),
  );
}

function group(world: WorldState, title: string, dark: boolean): HTMLElement {
  return el(
    'section',
    { className: 'guild-sec' },
    el('h3', { textContent: title }),
    el(
      'div',
      { className: 'miracle-grid' },
      ...MIRACLE_ORDER.filter((k) => MIRACLES[k].dark === dark).map((k) => card(world, k)),
    ),
  );
}

function card(world: WorldState, k: MiracleKind): HTMLElement {
  const m = MIRACLES[k];
  const cost = miracleCost(world, k);
  const wait = miracleWait(world, k);
  const blocked = k === 'cult' && !!world.cult;
  const btn = el(
    'button',
    { type: 'button', className: `miracle${m.dark ? ' miracle--dark' : ''}`, disabled: !miracleReady(world, k) || world.faith < cost || blocked },
    icon(m.icon, 24),
    el('b', { textContent: m.name }),
    el('span', { className: 'miracle__text', textContent: blocked ? 'มีลัทธิมารอยู่ในเมืองแล้ว' : m.text }),
    el('span', { className: 'miracle__cost' }, ...(wait ? [`อีก ${wait} วัน`] : [icon('faith', 16), String(cost)])),
  );
  btn.onclick = () => onMiracle(k);
  return btn;
}
