import { miracleBlocked, MIRACLES, MIRACLE_ORDER, miracleCost, miracleWait, weatherOf, type MiracleKind, type WorldState } from '../sim';
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
  const key = JSON.stringify([!!world.avatar, Math.floor(world.faith), weather, world.weather?.until, world.miracleAt, world.miracleRush, world.day, !!world.cult, world.legacy?.perks.grace, !!world.aegis, world.demon?.stage, world.chronicleSeq]);
  if (key === lastKey) return;
  lastKey = key;
  const left = weather ? world.weather!.until - world.day : 0;
  body.replaceChildren(
    el('p', {
      className: 'realm-king__meta',
      textContent: world.avatar ? 'ระหว่างที่ลงไปใช้ชีวิตในเมือง ใช้ปาฏิหาริย์ไม่ได้ กลับเป็นเทพก่อน' : weather ? `${WEATHER_TH[weather]}ยังปกคลุมทุ่งนาอีก ${left} วัน${weather === 'drought' ? ' (ฝนฉ่ำของเทพเจ้าช่วยยุติได้)' : ''}` : 'บันดาลสิ่งต่างๆ ให้เกิดกับทั้งโลก ใช้ซ้ำภายใน 30 วันได้แต่ราคาเพิ่มเป็นเท่าตัวทุกครั้ง',
    }),
    group(world, 'พรแห่งแสง', false, false),
    group(world, 'ปาฏิหาริย์ใหญ่แห่งแสง', false, true),
    group(world, 'ภัยแห่งความมืด', true, false),
    group(world, 'หายนะใหญ่', true, true),
  );
}

function group(world: WorldState, title: string, dark: boolean, big: boolean): HTMLElement {
  const kinds = MIRACLE_ORDER.filter((k) => MIRACLES[k].dark === dark && !!MIRACLES[k].big === big);
  if (!kinds.length) return el('div');
  return el(
    'section',
    { className: 'guild-sec' },
    el('h3', { textContent: title }),
    el(
      'div',
      { className: 'miracle-grid' },
      ...kinds.map((k) => card(world, k)),
    ),
  );
}

function card(world: WorldState, k: MiracleKind): HTMLElement {
  const m = MIRACLES[k];
  const cost = miracleCost(world, k);
  const wait = miracleWait(world, k);
  const blocked = miracleBlocked(world, k);
  const btn = el(
    'button',
    { type: 'button', className: `miracle${m.dark ? ' miracle--dark' : ''}`, disabled: world.faith < cost || !!blocked || !!world.avatar },
    icon(m.icon, 24),
    el('b', { textContent: m.name }),
    el('span', { className: 'miracle__text', textContent: blocked ?? m.text }),
    el('span', { className: 'miracle__cost' }, icon('faith', 16), String(cost), ...(wait ? [` (เร่ง อีก ${wait} วันราคาปกติ)`] : [])),
  );
  btn.onclick = () => onMiracle(k);
  return btn;
}
