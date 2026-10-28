import { CREED_TH, HOLY_EVERY, creedCounts, daysToHoly, isHolyDay, jobName, pietyOf, prayers, religionOf, type Creed, type Npc, type WorldState } from '../sim';
import { el, icon } from './icons';
import { localize } from './lexicon';

// ศาสนา: what the townsfolk believe, how devout they are, the holy day, the year's rites, and
// the priests who keep it all going. The god's faith flows from the believers' prayers.

const view = document.getElementById('faith')!;
interface Handlers {
  onSelectNpc: (id: number) => void;
}
let handlers: Handlers;
let lastKey = '';

export function initFaith(h: Handlers): void {
  handlers = h;
}

const CREEDS: Creed[] = ['god', 'spirits', 'none'];

export function renderFaith(world: WorldState): void {
  const c = creedCounts(world);
  const rel = religionOf(world);
  const priests = world.npcs.filter((n) => n.alive && n.age >= 16 && n.job === 'priest');
  const devout = world.npcs.filter((n) => n.alive && n.age >= 16 && n.creed === 'god' && n.job !== 'priest').sort((a, b) => pietyOf(b) - pietyOf(a)).slice(0, 5);
  const daily = Math.round(prayers(world) * 100) / 100;
  const key = JSON.stringify([c, rel, daily, priests.map((n) => [n.id, Math.round(pietyOf(n))]), devout.map((n) => [n.id, Math.round(pietyOf(n))]), daysToHoly(world), Math.floor(world.alms ?? 0)]);
  if (key === lastKey) return;
  lastKey = key;
  const total = c.god + c.spirits + c.none || 1;
  const share = Math.round((c.god / total) * 100);
  view.replaceChildren(
    tiles(share, c.piety, daily),
    holyDay(world),
    creeds(c, total),
    rites(world),
    section('นักบวช', priests.length ? priests.map((n) => personRow(n, jobName(world, n.job))) : [empty('เมืองไม่มีนักบวช ไม่มีใครประกอบพิธี และคนที่ไม่เชื่อจะไม่มีใครมาชักชวน')], `${priests.length} คน`),
    section('ผู้ศรัทธาแรงกล้า', devout.length ? devout.map((n) => personRow(n, jobName(world, n.job))) : [empty('ยังไม่มีใครนับถือเทพเจ้า')]),
    el('p', { className: 'log-note', textContent: 'ศรัทธาของเทพเจ้ามาจากคำภาวนาของผู้ที่นับถือ ยิ่งศรัทธาแรงยิ่งได้มาก นักบวช มหาวิหาร และพรของเทพทำให้คนศรัทธามากขึ้น ส่วนการรู้หนังสือ ยุคเครื่องจักร และคำสาปทำให้ศรัทธาเสื่อม' }),
  );
  localize(view, world);
}

function tiles(share: number, piety: number, daily: number): HTMLElement {
  const tile = (label: string, value: string, note: string, pct: number, bad: boolean) => {
    const bar = el('span', { className: 'k-tile__bar' });
    bar.style.background = `linear-gradient(90deg, var(--gold) 0 ${pct}%, var(--paper-edge) ${pct}% 100%)`;
    return el('div', { className: `k-tile${bad ? ' k-tile--bad' : ''}` }, el('span', { textContent: label }), el('b', { textContent: value }), el('small', { textContent: note }), bar);
  };
  return el(
    'div',
    { className: 'k-tiles' },
    tile('นับถือเทพเจ้า', `${share}%`, 'ของชาวเมือง', share, share < 40),
    tile('ศรัทธาเฉลี่ย', String(piety), 'จาก 100', piety, piety < 30),
    tile('คำภาวนา', `+${daily}`, 'ศรัทธาต่อวัน', Math.min(100, daily * 300), daily < 0.05),
  );
}

// Every seventh day the devout go to the church.
function holyDay(world: WorldState): HTMLElement {
  const rel = religionOf(world);
  const text = isHolyDay(world)
    ? `วันนี้วันพระ ผู้ศรัทธาเดินไปโบสถ์ ${rel.worshippers ?? 0} คน`
    : `วันพระถัดไปอีก ${daysToHoly(world)} วัน${rel.worshippers ? ` · ครั้งก่อนมาโบสถ์ ${rel.worshippers} คน` : ''}`;
  return el(
    'section',
    { className: 'k-block faith-holy' },
    el('h3', { textContent: `วันพระ (ทุก ${HOLY_EVERY} วัน)` }),
    el('p', { className: 'realm-king__meta' }, icon('faith', 16), text),
  );
}

// Who believes in what, in town and out in the villages.
function creeds(c: ReturnType<typeof creedCounts>, total: number): HTMLElement {
  const villages = c.villages.god + c.villages.spirits + c.villages.none;
  return el(
    'section',
    { className: 'k-block' },
    el('h3', { textContent: 'ความเชื่อของชาวเมือง' }),
    el(
      'div',
      { className: 'ballot' },
      ...CREEDS.map((k) => {
        const fill = el('i');
        fill.style.width = `${(c[k] / total) * 100}%`;
        const row = el('div', { className: `ballot__row${k === 'god' ? ' ballot__row--won' : ''}` }, el('span', { textContent: CREED_TH[k] }), el('span', { className: 'ballot__bar' }, fill), el('b', { textContent: String(c[k]) }));
        row.dataset.creed = k;
        return row;
      }),
      ...(villages ? [el('small', { textContent: `หมู่บ้านในดินแดนของเรา ${villages} คน: ${CREEDS.filter((k) => c.villages[k]).map((k) => `${CREED_TH[k]} ${c.villages[k]}`).join(' · ')}` })] : []),
    ),
  );
}

// This year's rites, and the church's larder for the hungry.
function rites(world: WorldState): HTMLElement {
  const rel = religionOf(world);
  return el(
    'section',
    { className: 'k-block' },
    el('h3', { textContent: 'พิธีกรรมปีนี้' }),
    el(
      'div',
      { className: 'k-clauses' },
      el('span', { textContent: `แต่งงานที่โบสถ์ ${rel.weddings}` }),
      el('span', { textContent: `ตั้งชื่อเด็ก ${rel.namings}` }),
      el('span', { textContent: `งานศพ ${rel.funerals}` }),
      el('span', { textContent: `ทำบุญวันพระ ${rel.offerings} ทอง` }),
      el('span', { textContent: `โรงทานของโบสถ์ ${Math.floor(world.alms ?? 0)} ทอง` }),
    ),
  );
}

function personRow(n: Npc, note: string): HTMLElement {
  const b = el('button', { type: 'button', className: 'chip chip--button', textContent: n.name });
  b.onclick = () => handlers.onSelectNpc(n.id);
  return el('li', { className: 'realm-person' }, b, el('span', { className: 'realm-person__note', textContent: note }), el('b', { textContent: `ศรัทธา ${Math.round(pietyOf(n))}` }));
}

function section(title: string, rows: HTMLElement[], hint = ''): HTMLElement {
  return el('section', { className: 'guild-sec' }, el('h3', {}, title, ...(hint ? [el('small', { className: 'fold__hint', textContent: hint })] : [])), el('ul', {}, ...rows));
}

const empty = (text: string) => el('li', { className: 'guild-empty', textContent: text });
