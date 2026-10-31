import { GOOD_TH, MILLS, goodsOf, handsOf, houses, millsOf, ownerName, seasonOf, wageOf, type Good, type Guild, type Mill, type Npc, type WorldState } from '../sim';
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
  const key = JSON.stringify([m, Math.floor(world.treasury), seasonOf(world.day), hungry.map((n) => n.id), news.map((e) => e.seq), houses(world).map((g) => [g.treasury, g.stock, g.hoarding]), world.debt, world.mills, world.mech, world.techs?.steam, world.union, world.smog, world.charter?.labour, millsOf(world).map((x) => handsOf(world, x).length)]);
  if (key === lastKey) return;
  lastKey = key;
  if (!m) {
    view.replaceChildren(empty('ตลาดยังไม่เปิด'));
    return;
  }

  const armed = world.npcs.filter((n) => n.alive && n.rank !== undefined);
  // Two tabs share the panel (data-group, shown by data-show from main.ts): the market, and the trade houses.
  const g = (group: string, node: HTMLElement) => ((node.dataset.group = group), node);
  const level = m.level ?? 1;
  const debased = (m.debase ?? 1) > 1 ? Math.round(((m.debase ?? 1) - 1) * 100) : 0;
  const tile = (label: string, value: string, note: string, bad: boolean, title = '') =>
    el('div', { className: `k-tile${bad ? ' k-tile--bad' : ''}`, title }, el('span', { textContent: label }), el('b', { textContent: value }), ...(note ? [el('small', { textContent: note })] : []));
  view.replaceChildren(
    g(
      'prices',
      el(
        'div',
        { className: 'k-tiles' },
        tile('ท้องพระคลัง', Math.floor(world.treasury).toLocaleString('en-US'), `เงินในร้าน ${Math.floor(m.till).toLocaleString('en-US')}`, false),
        tile('ระดับราคา', `×${level.toFixed(2)}`, debased ? `เหรียญลดค่า ${debased}%` : 'เทียบสมัยตั้งเมือง', level >= 1.3, 'ราคาสินค้าทั้งตลาดเทียบกับสมัยตั้งเมือง ขึ้นเมื่อเงินในมือชาวเมืองมีมากกว่าที่เคยชิน และขึ้นถาวรเมื่อทางการลดค่าเหรียญ'),
        tile('หนี้หลวง', world.debt ? String(world.debt.owed) : '0', world.debt ? 'ติดบ้านการค้าอยู่' : 'ไม่มีหนี้', !!world.debt),
      ),
    ),
    g('prices', el('ul', { className: 'goods' }, ...goodsOf(world).map((k) => goodRow(k, m.price[k], m.stock[k], m.history[k], m.alert[k])))),
    g('prices', el('p', { className: 'goods-note', textContent: 'กราฟคือราคาย้อนหลัง 6 เดือน · ลูกศรเทียบกับเดือนก่อน' })),
    g(
      'houses',
      section(
        'บ้านการค้า',
        houses(world).length ? houses(world).map((h) => houseRow(world, h)) : [empty('ยังไม่มีสมาคมพ่อค้า บ้านการค้าตั้งขึ้นเมื่อพ่อค้าที่มั่งคั่งรวมกลุ่มกัน')],
      ),
    ),
    g(
      'prices',
      section(
        'ชาวเมืองที่หิวโหย',
        hungry.length ? [el('li', { className: 'quest__party' }, ...hungry.map(npcChip))] : [empty('ทุกคนยังมีข้าวกิน')],
      ),
    ),
    ...industry(world).map((node) => g('industry', node)),
    g(
      'houses',
      section('นักผจญภัย', [
        empty(`มีอุปกรณ์แล้ว ${armed.filter((n) => n.gear).length} จาก ${armed.length} คน · อุปกรณ์ช่วยให้รอดจากดันเจี้ยนและเควส`),
      ]),
    ),
    g('houses', section(
      'ข่าวการค้า',
      news.length
        ? news.map((e) => el('li', { className: 'legend' }, icon('grain', 16), el('span', { textContent: e.text }), el('time', { textContent: `D${e.day}` })))
        : [empty('ตลาดยังสงบ')],
    )),
  );
  localize(view, world);
}

// The steam age's mills: who owns each, its hands, what it made last month; the engines on the farms.
function industry(world: WorldState): HTMLElement[] {
  if (world.techs?.steam === undefined)
    return [section('โรงงาน', [empty('ยังไม่มีโรงงาน นักปราชญ์ต้องค้นพบเครื่องจักรไอน้ำก่อน แล้วบ้านการค้าและราชสำนักจะเริ่มสร้างโรงงานบนทุ่งใต้กำแพงเมือง')])];
  const m = world.market!;
  const mills = millsOf(world);
  const hands = mills.reduce((s, x) => s + handsOf(world, x).length, 0);
  const tile = (label: string, value: string, note: string) => el('div', { className: 'k-tile' }, el('span', { textContent: label }), el('b', { textContent: value }), el('small', { textContent: note }));
  return [
    el(
      'div',
      { className: 'k-tiles' },
      tile('โรงงาน', String(mills.length), `กรรมกร ${hands} คน`),
      tile('เครื่องจักรในไร่นา', `${Math.round((world.mech ?? 0) * 100)}%`, `${Math.floor(world.machinery ?? 0)} เครื่อง · ข้าวเพิ่มสูงสุด 30%`),
      tile('เชื้อเพลิง', `${Math.floor(m.stock.coal)}`, `ถ่านหิน · ผลึกมานา ${Math.floor(m.stock.crystal)}`),
    ),
    section('โรงงานในเมือง', mills.length ? mills.map((x) => millRow(world, x)) : [empty('ยังไม่มีโรงงาน บ้านการค้าที่มีทุนพอจะสร้างเมื่อสินค้าที่ทำได้ขายมีกำไร')]),
    section('กรรมกรและควันโรงงาน', [
      empty(`ค่าแรงเดือนละ ${wageOf(world)} ทอง${world.charter?.labour === 'protected' ? ' · มีพระราชบัญญัติโรงงานคุ้มครอง (กะสั้นลง ค่าแรงเป็นธรรม)' : ' · ยังไม่มีกฎหมายคุ้มครองกรรมกร'}`),
      empty(world.union ? `${world.union.name} นำโดย${world.npcs.find((n) => n.id === world.union!.leaderId)?.name ?? '-'} · ชนะการขึ้นค่าแรงมาแล้ว ${world.union.raises} ครั้ง` : 'ยังไม่มีสหภาพ (กรรมกรรวมตัวกันเมื่อมีตั้งแต่ 6 คนขึ้นไป)'),
      empty(`ควันถ่านหิน ${Math.round((world.smog ?? 0) * 100)}%${(world.smog ?? 0) > 0.05 ? ' · ทำให้คนในเมืองป่วยง่ายขึ้น (เตาผลึกมานาไม่มีควัน)' : ''}`),
    ]),
  ];
}

function millRow(world: WorldState, mill: Mill): HTMLElement {
  const d = MILLS[mill.kind];
  const inputs = Object.entries(d.input).map(([k, n]) => `${GOOD_TH[k as Good]} ${n}`).join(' + ');
  const notes =
    world.day < mill.ready
      ? [`กำลังก่อสร้าง อีก ${mill.ready - world.day} วันเสร็จ`, `ของ${ownerName(world, mill)}`]
      : [`ของ${ownerName(world, mill)}`, `กรรมกร ${handsOf(world, mill).length} คน`, `เดือนก่อนผลิต${GOOD_TH[d.output]} ${mill.made ?? 0}`, `ต่อคน: ${inputs}${d.fuel ? ` + ถ่านหิน ${d.fuel}` : ''} → ${GOOD_TH[d.output]} ${d.makes}`];
  return el('li', { className: 'council' }, el('b', {}, icon(d.output, 20), ` ${mill.name}`), el('p', { className: 'realm-king__meta', textContent: notes.join(' · ') }));
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
  const low = stock < 5;
  return el(
    'li',
    { className: `good${alert === 1 ? ' good--dear' : alert === -1 ? ' good--cheap' : ''}${low ? ' good--short' : ''}` },
    icon(g, 28),
    el('div', { className: 'good__body' }, el('b', { className: 'good__name', textContent: GOOD_TH[g] }), el('small', { className: 'good__stock', textContent: `คลัง ${Math.floor(stock)}${low ? ' · ขาด' : ''}` })),
    spark,
    el('div', { className: 'good__price' }, el('b', { textContent: String(price) }), el('span', { className: `good__trend good__trend--${trend}`, textContent: arrow })),
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
