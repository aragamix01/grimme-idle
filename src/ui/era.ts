import { FAITH_PER_STAR, ERA_YEARS, PERKS, PERK_ORDER, canEndEra, eraOf, eraTitle, perkCost, perkLevel, starsFor, starsOf, type Perk, type WorldState } from '../sim';
import { el, icon } from './icons';

const open = document.getElementById('era-open') as HTMLButtonElement;
const dialog = document.getElementById('eras') as HTMLDialogElement;
const body = document.getElementById('eras-body')!;

interface Handlers {
  onEndEra: () => void;
  onPerk: (perk: Perk) => void;
}
let handlers: Handlers;
let lastKey = '';
let confirming = false;
let last: WorldState | null = null; // so the dialog fills at once, even with time stopped

export function initEra(h: Handlers): void {
  handlers = h;
  open.onclick = () => {
    confirming = false;
    lastKey = '';
    dialog.showModal();
    if (last) renderEra(last);
  };
  dialog.addEventListener('close', () => (confirming = false));
}

export function renderEra(world: WorldState): void {
  last = world;
  const ready = canEndEra(world);
  open.replaceChildren(icon('star', 16), `ยุคที่ ${eraOf(world)}`, el('b', { textContent: String(starsOf(world)) }));
  open.classList.toggle('era-open--ready', ready);
  if (!dialog.open) return;
  const key = JSON.stringify([eraOf(world), Math.floor(world.day / 30), starsOf(world), world.legacy?.perks, ready, confirming, eraTitle(world), starsFor(world)]);
  if (key === lastKey) return;
  lastKey = key;
  body.replaceChildren(current(world, ready), perks(world), past(world));
}

function current(world: WorldState, ready: boolean): HTMLElement {
  const years = Math.floor(world.day / 365);
  const btn = el(
    'button',
    { type: 'button', className: `btn ${confirming ? 'btn--danger' : 'btn--gold'}`, disabled: !ready },
    icon('star', 16),
    confirming ? 'ยืนยัน ปิดยุคนี้และเริ่มโลกใหม่' : 'ปิดยุคและรับดาวตำนาน',
  );
  btn.onclick = () => {
    if (!confirming) {
      confirming = true;
      lastKey = '';
      renderEra(world);
      return;
    }
    confirming = false;
    handlers.onEndEra();
  };
  const why = ready
    ? confirming
      ? 'เมืองและชาวเมืองทั้งหมดจะหายไป เหลือเพียงตำนาน ดาว และพรถาวร'
      : 'ยุคนี้ครบเงื่อนไขแล้ว ปิดยุคเมื่อไหร่ก็ได้ หรือเล่นต่อเพื่อสะสมดาวเพิ่ม'
    : `ปิดยุคได้เมื่อปราบจอมมารสำเร็จ ผ่านไปครบ ${ERA_YEARS} ปี หรือถูกจอมมารยึดครองนาน 2 ปี`;
  return el(
    'section',
    { className: 'era-now' },
    el('p', { className: 'era-now__title', textContent: `ยุคที่ ${eraOf(world)} · ${eraTitle(world)}` }),
    el('p', { className: 'realm-king__meta', textContent: `ผ่านมาแล้ว ${years} ปี · ปิดยุคตอนนี้จะได้ดาว ${starsFor(world)} ดวง (ศรัทธาที่เหลือทุก ${FAITH_PER_STAR} แต้มกลายเป็นดาว 1 ดวง)` }),
    btn,
    el('p', { className: 'realm-king__meta', textContent: why }),
  );
}

function perks(world: WorldState): HTMLElement {
  const stars = starsOf(world);
  return el(
    'section',
    { className: 'guild-sec' },
    el('h3', {}, 'พรถาวรของเทพ ', el('span', { className: 'era-stars' }, icon('star', 16), String(stars))),
    el(
      'ul',
      {},
      ...PERK_ORDER.map((p) => {
        const level = perkLevel(world, p);
        const max = PERKS[p].max;
        const cost = perkCost(world, p);
        const full = level >= max;
        const buy = el(
          'button',
          { type: 'button', className: 'btn btn--gold era-buy', disabled: full || stars < cost },
          ...(full ? ['เต็มแล้ว'] : [icon('star', 16), String(cost)]),
        );
        buy.onclick = () => handlers.onPerk(p);
        return el(
          'li',
          { className: 'era-perk' },
          el('div', {}, el('b', { textContent: `${PERKS[p].name} ${level}/${max}` }), el('p', { className: 'realm-king__meta', textContent: PERKS[p].text })),
          buy,
        );
      }),
    ),
  );
}

function past(world: WorldState): HTMLElement {
  const eras = [...(world.legacy?.past ?? [])].reverse();
  return el(
    'section',
    { className: 'guild-sec' },
    el('h3', { textContent: 'พงศาวดารแห่งยุคสมัย' }),
    el(
      'ul',
      {},
      ...(eras.length
        ? eras.map((r) =>
            el(
              'li',
              { className: 'legend' },
              icon('star', 16),
              el('span', {
                textContent: `ยุคที่ ${r.era} ${r.title} (${r.years} ปี)${r.heroes.length ? ` · ผู้กล้า ${r.heroes.join(', ')}` : ''}${r.king ? ` · กษัตริย์องค์สุดท้าย ${r.king}` : ''}`,
              }),
              el('time', { textContent: `+${r.stars}` }),
            ),
          )
        : [el('li', { className: 'guild-empty', textContent: 'นี่คือยุคแรกของโลก ยังไม่มียุคใดถูกจารึก' })]),
    ),
  );
}
