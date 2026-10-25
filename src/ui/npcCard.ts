import { COMMAND_COST, JOB_TH, TRAIT_TH, rankName, type Command, type Job, type Npc, type WorldState } from '../sim';
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
  // Position and plan coordinates change every tick but aren't on the card.
  const { x: _x, y: _y, plan: _plan, ...shown } = npc;
  const doing = activity(world, npc);
  const key = JSON.stringify([shown, doing, Math.floor(world.faith), choosingDream]);
  if (!force && key === lastKey) return;
  lastKey = key;
  card.replaceChildren(header(npc, doing), stats(npc), powers(npc, world.faith));
}

// What the NPC is up to, in words the player can follow on the map.
function activity(world: WorldState, npc: Npc): string {
  if (!npc.alive) return 'จากไปแล้ว';
  const dungeon = (id?: number) => world.dungeons.find((d) => d.id === id)?.name ?? 'ดันเจี้ยน';
  const quest = world.quests.find((q) => q.id === npc.questId);
  if (quest) {
    if (quest.clientId === npc.id) return quest.stage === 'recruiting' ? 'รอนักผจญภัยมาคุ้มกัน' : 'เดินทางพร้อมผู้คุ้มกัน';
    if (quest.stage === 'recruiting') return `รอเพื่อนร่วมทีมที่กิลด์ (${quest.title})`;
    if (quest.stage === 'travelling') return `เดินทางไปทำเควส: ${quest.title}`;
    return `กำลังทำเควส: ${quest.title}`;
  }
  if (npc.inside !== undefined) return `กำลังสำรวจ${dungeon(npc.inside)}`;
  const p = npc.plan;
  switch (p?.kind) {
    case 'adventure':
      return `กำลังเดินทางไป${dungeon(p.target)}`;
    case 'work':
      return npc.job === 'farmer' ? 'ทำนาอยู่ที่ทุ่ง' : 'เฝ้าร้านค้า';
    case 'steal':
      return `กำลังสะกดรอยตาม${world.npcs.find((n) => n.id === p.target)?.name ?? 'ใครบางคน'}`;
    case 'flee':
      return 'กำลังหลบหนี';
    case 'return':
      return 'กำลังกลับกิลด์';
    case 'arrive':
      return 'เพิ่งมาถึงเมือง';
    default:
      return 'พักผ่อนอยู่ในเมือง';
  }
}

function header(npc: Npc, doing: string): HTMLElement {
  const portrait = el('div', { className: 'npc__portrait' });
  portrait.style.backgroundImage = `url(/assets/sprites/characters/${npc.job}.png)`;
  const chips = el(
    'div',
    { className: 'npc__chips' },
    el('span', { className: 'chip', textContent: JOB_TH[npc.job] }),
    el('span', { className: 'chip', textContent: `LV ${npc.level}` }),
    ...(npc.rank !== undefined ? [el('span', { className: 'chip chip--rank', textContent: `แรงก์ ${rankName(npc.rank)}` })] : []),
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
      el('p', { className: 'npc__doing', textContent: doing }),
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
