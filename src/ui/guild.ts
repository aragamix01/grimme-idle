import { COMMAND_COST, JOB_TH, RANKS, type Npc, type Quest, type WorldState } from '../sim';
import { el, icon } from './icons';

const view = document.getElementById('guild')!;

const KIND_TH: Record<Quest['kind'], string> = { hunt: 'ปราบมอนสเตอร์', explore: 'สำรวจ', escort: 'คุ้มกัน' };
const RESULT_TH: Partial<Record<Quest['stage'], string>> = { done: 'สำเร็จ', failed: 'ล้มเหลว', expired: 'ไม่มีคนรับ' };

interface Handlers {
  onDivineQuest: () => void;
  onSelectNpc: (id: number) => void;
}
let handlers: Handlers;
let lastKey = '';

export function initGuild(h: Handlers): void {
  handlers = h;
}

export function renderGuild(world: WorldState): void {
  const adventurers = world.npcs
    .filter((n) => n.alive && n.rank !== undefined)
    .sort((a, b) => (b.renown ?? 0) - (a.renown ?? 0) || b.level - a.level)
    .slice(0, 8);
  const key = JSON.stringify([world.quests, world.legends.length, Math.floor(world.faith), adventurers.map((a) => [a.id, a.rank, a.renown])]);
  if (key === lastKey) return;
  lastKey = key;

  const active = world.quests.filter((q) => ['recruiting', 'travelling', 'inside'].includes(q.stage));
  const finished = world.quests.filter((q) => !active.includes(q)).slice().reverse();
  const byId = new Map(world.npcs.map((n) => [n.id, n]));

  view.replaceChildren(
    divineBar(world),
    section('เควสบนกระดาน', active.length ? active.map((q) => questCard(q, byId)) : [empty('ยังไม่มีเควสใหม่ กิลด์จะประกาศเร็วๆ นี้')]),
    section('ผลล่าสุด', finished.length ? finished.map((q) => resultRow(q, byId)) : [empty('ยังไม่มีเควสที่จบ')]),
    section('นักผจญภัย', adventurers.length ? adventurers.map(adventurerRow) : [empty('กิลด์ยังไม่มีสมาชิก')]),
    section(
      'หอเกียรติยศ',
      world.legends.length
        ? world.legends.slice().reverse().map((l) => el('li', { className: 'legend' }, icon('crown', 16), el('span', { textContent: l.text }), el('time', { textContent: `D${l.day}` })))
        : [empty('ยังไม่มีตำนาน')],
    ),
  );
}

function divineBar(world: WorldState): HTMLElement {
  const cost = COMMAND_COST.divineQuest;
  const btn = el(
    'button',
    { type: 'button', className: 'btn btn--gold divine', disabled: world.faith < cost },
    icon('quest', 16),
    'ประทานเควสศักดิ์สิทธิ์',
    el('span', { className: 'divine__cost' }, icon('faith', 16), String(cost)),
  );
  btn.onclick = () => handlers.onDivineQuest();
  return el('div', { className: 'divine-bar' }, btn, el('p', { textContent: 'เควสปราบดันเจี้ยนที่อันตรายที่สุด จ่ายรางวัลและชื่อเสียงสองเท่า' }));
}

function section(title: string, rows: HTMLElement[]): HTMLElement {
  return el('section', { className: 'guild-sec' }, el('h3', { textContent: title }), el('ul', {}, ...rows));
}

const empty = (text: string) => el('li', { className: 'guild-empty', textContent: text });

export function rankBadge(rank = 0): HTMLElement {
  const r = RANKS[rank] ?? 'F';
  return el('span', { className: `rank rank--${r}`, textContent: r, title: `แรงก์ ${r}` });
}

function npcChip(n: Npc | undefined): HTMLElement {
  if (!n) return el('span', { className: 'chip', textContent: '—' });
  const b = el('button', { type: 'button', className: 'chip chip--button', textContent: n.name });
  if (!n.alive) b.classList.add('chip--dead');
  b.onclick = () => handlers.onSelectNpc(n.id);
  return b;
}

function stageText(q: Quest): string {
  if (q.stage === 'recruiting') return `รับสมัคร ${q.partyIds.length}/${q.minParty} คน · ประกาศเมื่อ D${q.postedDay}`;
  if (q.stage === 'travelling') return 'ปาร์ตี้กำลังเดินทาง';
  const where = q.kind === 'escort' ? 'อยู่ระหว่างทาง' : 'อยู่ในดันเจี้ยน';
  return `${where} อีกราว ${q.daysLeft ?? 0} วัน`;
}

function questCard(q: Quest, byId: Map<number, Npc>): HTMLElement {
  const party = q.partyIds.map((id) => npcChip(byId.get(id)));
  const client = q.clientId !== undefined ? byId.get(q.clientId) : undefined;
  return el(
    'li',
    { className: q.divine ? 'quest quest--divine' : 'quest' },
    rankBadge(q.rank),
    el(
      'div',
      { className: 'quest__body' },
      el('p', { className: 'quest__title', textContent: q.title }),
      el(
        'p',
        { className: 'quest__meta' },
        `${KIND_TH[q.kind]}${q.divine ? ' · ศักดิ์สิทธิ์' : ''} · `,
        icon('gold', 16),
        ` ${q.reward}`,
      ),
      el('p', { className: 'quest__stage', textContent: stageText(q) }),
      party.length || client
        ? el('div', { className: 'quest__party' }, ...party, ...(client ? [el('span', { className: 'quest__client', textContent: 'ผู้ว่าจ้าง' }), npcChip(client)] : []))
        : el('div'),
    ),
  );
}

function resultRow(q: Quest, byId: Map<number, Npc>): HTMLElement {
  const leader = byId.get(q.partyIds[0]);
  return el(
    'li',
    { className: `result result--${q.stage}` },
    rankBadge(q.rank),
    el('span', { className: 'result__title', textContent: q.title }),
    el('span', { className: 'result__who', textContent: leader ? `ปาร์ตี้ของ${leader.name}` : '' }),
    el('span', { className: 'result__stage', textContent: RESULT_TH[q.stage] ?? '' }),
  );
}

function adventurerRow(n: Npc): HTMLElement {
  const row = el(
    'li',
    { className: 'adv' },
    rankBadge(n.rank),
    el('button', { type: 'button', className: 'adv__name', textContent: n.name }),
    el('span', { className: 'adv__job', textContent: `${JOB_TH[n.job]} · LV ${n.level}` }),
    el('span', { className: 'adv__renown', textContent: `${n.renown ?? 0}` }),
  );
  (row.querySelector('.adv__name') as HTMLButtonElement).onclick = () => handlers.onSelectNpc(n.id);
  return row;
}
