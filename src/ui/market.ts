import { GOODS, GOOD_TH, SEASON_TH, houses, seasonOf, type Good, type Guild, type Npc, type WorldState } from '../sim';
import { el, icon } from './icons';
import { localize } from './lexicon';

const view = document.getElementById('market')!;

interface Handlers {
  onSelectNpc: (id: number) => void;
}
let handlers: Handlers;
let lastKey = '';

export function initMarket(h: Handlers): void {
  handlers = h;
}

export function renderMarket(world: WorldState): void {
  const m = world.market;
  const hungry = world.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2);
  const news = world.chronicle.filter((e) => e.kind === 'trade').slice(-6).reverse();
  const key = JSON.stringify([m, Math.floor(world.treasury), seasonOf(world.day), hungry.map((n) => n.id), news.map((e) => e.seq), houses(world).map((g) => [g.treasury, g.stock, g.hoarding]), world.debt]);
  if (key === lastKey) return;
  lastKey = key;
  if (!m) {
    view.replaceChildren(empty('ตลาดยังไม่เปิด'));
    return;
  }

  const armed = world.npcs.filter((n) => n.alive && n.rank !== undefined);
  view.replaceChildren(
    el(
      'div',
      { className: 'market-head' },
      el('span', { className: 'chip chip--gold', textContent: SEASON_TH[seasonOf(world.day)] }),
      el('span', { className: 'chip' }, icon('gold', 16), `ท้องพระคลัง ${Math.floor(world.treasury)}`),
      el('span', { className: 'chip' }, icon('gold', 16), `เงินในร้าน ${Math.floor(m.till)}`),
      el('span', { className: `chip${(m.level ?? 1) >= 1.3 ? ' chip--danger' : ''}`, title: 'ราคาสินค้าทั้งตลาดเทียบกับสมัยตั้งเมือง ขึ้นเมื่อเงินในมือชาวเมืองมีมากกว่าที่เคยชิน และขึ้นถาวรเมื่อทางการลดค่าเหรียญ' }, `ระดับราคา ×${(m.level ?? 1).toFixed(2)}${(m.debase ?? 1) > 1 ? ` · เหรียญถูกลดค่า ${Math.round(((m.debase ?? 1) - 1) * 100)}%` : ''}`),
      ...(world.debt ? [el('span', { className: 'chip chip--danger' }, icon('gold', 16), `หนี้หลวง ${world.debt.owed} ทอง`)] : []),
    ),
    section('ราคาวันนี้', GOODS.map((g) => goodRow(g, m.price[g], m.stock[g], m.history[g], m.alert[g]))),
    section(
      'บ้านการค้า',
      houses(world).length ? houses(world).map((g) => houseRow(world, g)) : [empty('ยังไม่มีสมาคมพ่อค้า บ้านการค้าตั้งขึ้นเมื่อพ่อค้าที่มั่งคั่งรวมกลุ่มกัน')],
    ),
    section(
      'ชาวเมืองที่หิวโหย',
      hungry.length ? [el('li', { className: 'quest__party' }, ...hungry.map(npcChip))] : [empty('ทุกคนยังมีข้าวกิน')],
    ),
    section('นักผจญภัย', [
      empty(`มีอุปกรณ์แล้ว ${armed.filter((n) => n.gear).length} จาก ${armed.length} คน · อุปกรณ์ช่วยให้รอดจากดันเจี้ยนและเควส`),
    ]),
    section(
      'ข่าวการค้า',
      news.length
        ? news.map((e) => el('li', { className: 'legend' }, icon('grain', 16), el('span', { textContent: e.text }), el('time', { textContent: `D${e.day}` })))
        : [empty('ตลาดยังสงบ')],
    ),
  );
  localize(view, world);
}

// A trade house: its coffers, what sits in its warehouse, and whether it is hoarding or owed by the crown.
function houseRow(world: WorldState, g: Guild): HTMLElement {
  const held = (Object.entries(g.stock ?? {}) as [Good, number][]).filter(([, n]) => n >= 1);
  const notes = [
    `คลังกิลด์ ${Math.floor(g.treasury)} ทอง`,
    held.length ? `โกดัง: ${held.map(([k, n]) => `${GOOD_TH[k]} ${Math.floor(n)}`).join(' · ')}` : 'โกดังว่าง',
    world.debt?.guildId === g.id ? `ทางการติดหนี้ ${world.debt.owed} ทอง` : '',
    g.hoarding !== undefined ? 'ลือกันว่ากำลังกักตุนข้าว' : '',
  ].filter(Boolean);
  return el('li', { className: 'council' }, el('b', { textContent: g.name }), el('p', { className: 'realm-king__meta', textContent: notes.join(' · ') }));
}

function goodRow(g: Good, price: number, stock: number, history: number[], alert: number): HTMLElement {
  const before = history.length > 6 ? history[history.length - 7] : history[0];
  const trend = before === undefined || before === price ? 'flat' : price > before ? 'up' : 'down';
  const arrow = { up: '▲', down: '▼', flat: '–' }[trend];
  const top = Math.max(1, ...history);
  const spark = el('div', { className: 'spark', title: 'ราคาย้อนหลัง 6 เดือน' }, ...history.map((p) => {
    const bar = el('i');
    bar.style.height = `${Math.max(8, (p / top) * 100)}%`;
    return bar;
  }));
  return el(
    'li',
    { className: `good${alert === 1 ? ' good--dear' : alert === -1 ? ' good--cheap' : ''}` },
    icon(g, 32),
    el(
      'div',
      { className: 'good__body' },
      el('p', { className: 'good__name', textContent: GOOD_TH[g] }),
      spark,
      el('p', { className: 'good__stock', textContent: `ในคลัง ${Math.floor(stock)}` }),
    ),
    el(
      'div',
      { className: 'good__price' },
      el('b', {}, icon('gold', 16), String(price)),
      el('span', { className: `good__trend good__trend--${trend}`, textContent: arrow }),
    ),
  );
}

function section(title: string, rows: HTMLElement[]): HTMLElement {
  return el('section', { className: 'guild-sec' }, el('h3', { textContent: title }), el('ul', {}, ...rows));
}

const empty = (text: string) => el('li', { className: 'guild-empty', textContent: text });

function npcChip(n: Npc): HTMLElement {
  const b = el('button', { type: 'button', className: 'chip chip--button', textContent: n.name });
  b.onclick = () => handlers.onSelectNpc(n.id);
  return b;
}
