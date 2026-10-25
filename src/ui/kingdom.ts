import { JOB_TH, TAX_TH, TRAIT_TH, approval, crownPower, loyaltyOf, type Npc, type WorldState } from '../sim';
import { el, icon } from './icons';

const view = document.getElementById('kingdom')!;

interface Handlers {
  onSelectNpc: (id: number) => void;
}
let handlers: Handlers;
let lastKey = '';

export function initKingdom(h: Handlers): void {
  handlers = h;
}

export function renderKingdom(world: WorldState): void {
  const king = world.npcs.find((n) => n.id === world.kingId && n.alive);
  const power = crownPower(world);
  const people = Math.round(approval(world));
  const alive = world.npcs.filter((n) => n.alive && n.age >= 16);
  const nobles = alive.filter((n) => n.job === 'noble');
  const knights = alive.filter((n) => n.knight);
  const soldiers = alive.filter((n) => n.job === 'soldier');
  const news = world.chronicle.filter((e) => e.kind === 'politics').slice(-8).reverse();
  const key = JSON.stringify([
    king?.id,
    king?.age,
    power.total,
    people,
    world.crown,
    Math.floor(world.treasury / 10),
    nobles.map((n) => [n.id, Math.round(loyaltyOf(n))]),
    knights.map((n) => n.id),
    soldiers.length,
    news.map((e) => e.seq),
  ]);
  if (key === lastKey) return;
  lastKey = key;

  const avg = (list: Npc[]) => (list.length ? Math.round(list.reduce((s, n) => s + loyaltyOf(n), 0) / list.length) : 0);
  view.replaceChildren(
    king ? kingCard(world, king) : el('p', { className: 'guild-empty', textContent: 'บัลลังก์ว่างอยู่' }),
    el(
      'div',
      { className: 'realm-meters' },
      meter('อำนาจราชบัลลังก์', power.total, power.total < 45 ? 'weak' : 'strong'),
      meter('ความพอใจของประชาชน', people, people < 30 ? 'weak' : 'strong'),
    ),
    el(
      'div',
      { className: 'market-head' },
      el('span', { className: 'chip' }, icon('sword', 16), `ทหาร ${soldiers.length} นาย · ภักดี ${avg(soldiers)}`),
      el('span', { className: 'chip' }, icon('crown', 16), `อัศวิน ${knights.length}`),
      el('span', { className: 'chip' }, icon('gold', 16), `ท้องพระคลัง ${Math.floor(world.treasury)}`),
    ),
    section(
      'ขุนนางในราชสำนัก',
      nobles.length ? nobles.map((n) => personRow(n, n.traits.includes('greedy') || n.traits.includes('vengeful') ? 'ทะเยอทะยาน' : '')) : [empty('ยังไม่มีขุนนาง')],
    ),
    section('อัศวินแห่งราชบัลลังก์', knights.length ? knights.map((n) => personRow(n, JOB_TH[n.job])) : [empty('ยังไม่มีใครได้รับแต่งตั้ง นักผจญภัยแรงก์ C ขึ้นไปที่ภักดีจะได้เป็นอัศวิน')]),
    section(
      'ข่าวการเมือง',
      news.length
        ? news.map((e) => el('li', { className: 'legend' }, icon('crown', 16), el('span', { textContent: e.text }), el('time', { textContent: `D${e.day}` })))
        : [empty('ราชสำนักยังสงบ')],
    ),
  );
}

function kingCard(world: WorldState, k: Npc): HTMLElement {
  const portrait = el('div', { className: 'npc__portrait' });
  portrait.style.backgroundImage = 'url(/assets/sprites/characters/king.png)';
  const name = el('button', { type: 'button', className: 'realm-king__name', textContent: `กษัตริย์${k.name}` });
  name.onclick = () => handlers.onSelectNpc(k.id);
  const tax = world.crown?.tax ?? 'normal';
  return el(
    'div',
    { className: 'realm-king' },
    portrait,
    el(
      'div',
      { className: 'realm-king__body' },
      name,
      el('p', { className: 'realm-king__meta', textContent: `พระชนม์ ${k.age} พรรษา · ครองราชย์ตั้งแต่ D${world.crown?.since ?? 0}` }),
      el('p', { className: 'realm-king__meta', textContent: `นิสัย: ${k.traits.map((t) => TRAIT_TH[t]).join(' · ')}` }),
      el('div', { className: 'npc__chips' }, el('span', { className: `chip${tax === 'high' ? ' chip--danger' : tax === 'low' ? ' chip--gold' : ''}`, textContent: TAX_TH[tax] })),
    ),
  );
}

function meter(label: string, value: number, tone: 'weak' | 'strong'): HTMLElement {
  const fill = el('span', { className: `realm-meter__fill realm-meter__fill--${tone}` });
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  return el(
    'div',
    { className: 'realm-meter' },
    el('span', { className: 'realm-meter__label', textContent: label }),
    el('span', { className: 'realm-meter__track' }, fill),
    el('b', { textContent: String(value) }),
  );
}

function personRow(n: Npc, note: string): HTMLElement {
  const b = el('button', { type: 'button', className: 'chip chip--button', textContent: n.name });
  b.onclick = () => handlers.onSelectNpc(n.id);
  const loyal = Math.round(loyaltyOf(n));
  return el(
    'li',
    { className: 'realm-person' },
    b,
    el('span', { className: 'realm-person__note', textContent: note }),
    el('b', { className: loyal < 30 ? 'realm-person__loyal--low' : '', textContent: `ภักดี ${loyal}` }),
  );
}

function section(title: string, rows: HTMLElement[]): HTMLElement {
  return el('section', { className: 'guild-sec' }, el('h3', { textContent: title }), el('ul', {}, ...rows));
}

const empty = (text: string) => el('li', { className: 'guild-empty', textContent: text });
