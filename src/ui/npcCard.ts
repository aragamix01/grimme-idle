import { COMMAND_COST, JOB_TH, TRAIT_TH, type Command, type Job, type Npc, type WorldState } from '../sim';
import { el, icon, iconUrl } from './icons';

const card = document.getElementById('npc-card')!;
const hint = document.getElementById('npc-hint')!;
const JOBS = Object.keys(JOB_TH) as Job[];

interface Handlers {
  onCommand: (cmd: Command) => void;
  onClose: () => void;
}

let handlers: Handlers;
let lastKey = '';
let choosingDream = false;

export function initNpcCard(h: Handlers): void {
  handlers = h;
}

export function renderNpcCard(world: WorldState, npcId: number | null, force = false): void {
  const npc = npcId === null ? undefined : world.npcs.find((n) => n.id === npcId);
  card.hidden = !npc;
  hint.hidden = !!npc;
  if (!npc) {
    choosingDream = false;
    lastKey = '';
    return;
  }
  // Rebuild only when something visible changed, so buttons don't lose focus every tick.
  const { x: _x, y: _y, ...shown } = npc; // position changes every tick but isn't on the card
  const key = JSON.stringify([shown, Math.floor(world.faith), choosingDream]);
  if (!force && key === lastKey) return;
  lastKey = key;
  card.replaceChildren(header(npc), stats(npc), powers(npc, world.faith));
}

function header(npc: Npc): HTMLElement {
  const portrait = el('div', { className: 'npc__portrait' });
  portrait.style.backgroundImage = `url(/assets/sprites/characters/${npc.job}.png)`;
  const chips = el(
    'div',
    { className: 'npc__chips' },
    el('span', { className: 'chip', textContent: JOB_TH[npc.job] }),
    el('span', { className: 'chip', textContent: `LV ${npc.level}` }),
    el('span', { className: 'chip', textContent: `${npc.age} ปี` }),
    ...(npc.blessed ? [el('span', { className: 'chip chip--gold', textContent: 'ได้รับพร' })] : []),
    ...(!npc.alive ? [el('span', { className: 'chip chip--danger', textContent: 'จากไปแล้ว' })] : []),
  );
  const close = el('button', { type: 'button', className: 'npc__close', textContent: '×', title: 'ปิด' });
  close.setAttribute('aria-label', 'ปิดข้อมูลชาวเมือง');
  close.onclick = () => handlers.onClose();
  return el(
    'div',
    { className: 'npc__head' },
    portrait,
    el(
      'div',
      { className: 'npc__id' },
      el('h3', { className: 'npc__name', textContent: npc.name }),
      chips,
      el('p', { className: 'npc__traits', textContent: `นิสัย: ${npc.traits.map((t) => TRAIT_TH[t]).join(' · ')}` }),
    ),
    close,
  );
}

function stats(npc: Npc): HTMLElement {
  const marker = el('span', { className: 'moral__marker' });
  marker.style.left = `${(npc.morality + 100) / 2}%`;
  const sign = npc.morality > 0 ? '+' : '';
  return el(
    'div',
    { className: 'npc__stats' },
    el('div', { className: 'npc__stat' }, icon('gold', 16), el('span', { textContent: 'ทอง' }), el('b', { textContent: String(npc.gold) })),
    el(
      'div',
      { className: 'npc__stat npc__stat--moral' },
      el('span', { textContent: 'ศีล' }),
      el('div', { className: 'moral' }, marker),
      el('b', { textContent: `${sign}${npc.morality}` }),
    ),
  );
}

function powerButton(name: string, label: string, cost: number, enabled: boolean, onClick: () => void): HTMLElement {
  const btn = el(
    'button',
    { type: 'button', className: 'power', disabled: !enabled },
    el('img', { src: iconUrl(name), alt: '', width: 32, height: 32 }),
    el('span', { className: 'power__name', textContent: label }),
    el('span', { className: 'power__cost' }, icon('faith', 16), String(cost)),
  );
  btn.onclick = onClick;
  return btn;
}

function powers(npc: Npc, faith: number): HTMLElement {
  const can = (cost: number) => npc.alive && faith >= cost;
  const row = el(
    'div',
    { className: 'powers' },
    powerButton('bless', 'ให้พร', COMMAND_COST.bless, can(COMMAND_COST.bless) && !npc.blessed, () =>
      handlers.onCommand({ type: 'bless', npcId: npc.id }),
    ),
    powerButton('curse', 'สาปแช่ง', COMMAND_COST.curse, can(COMMAND_COST.curse), () =>
      handlers.onCommand({ type: 'curse', npcId: npc.id }),
    ),
    powerButton('dream', 'ส่งความฝัน', COMMAND_COST.dream, can(COMMAND_COST.dream), () => {
      choosingDream = !choosingDream;
      lastKey = '';
      card.dispatchEvent(new Event('rerender'));
    }),
  );
  const wrap = el('div', { className: 'npc__powers' }, el('h4', { textContent: 'พลังเทพ' }), row);
  if (choosingDream && can(COMMAND_COST.dream)) {
    const jobs = JOBS.filter((j) => j !== npc.job).map((job) => {
      const b = el('button', { type: 'button', className: 'chip chip--button', textContent: JOB_TH[job] });
      b.onclick = () => {
        choosingDream = false;
        handlers.onCommand({ type: 'dream', npcId: npc.id, job });
      };
      return b;
    });
    wrap.append(el('div', { className: 'dream-pick' }, el('span', { textContent: 'ให้ฝันว่าเป็น' }), ...jobs));
  }
  return wrap;
}
