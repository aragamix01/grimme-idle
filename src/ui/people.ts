import { ADULT_AGE, ELDER_AGE, JOB_TH, RANKS, TRAIT_TH, loyaltyOf, type Job, type Npc, type WorldState } from '../sim';
import { el } from './icons';

const view = document.getElementById('people')!;

interface Handlers {
  onSelectNpc: (id: number) => void;
}
let handlers: Handlers;
let lastKey = '';
const open = new Set<string>(); // which job sections the player has expanded

export function initPeople(h: Handlers): void {
  handlers = h;
}

// Jobs grouped into the town's classes, in the order the tab lists them.
const CLASSES: { name: string; color: string; jobs: Job[] }[] = [
  { name: 'ราชวงศ์และขุนนาง', color: '#9a66e0', jobs: ['king', 'noble'] },
  { name: 'ทหาร', color: '#e8503a', jobs: ['soldier'] },
  { name: 'นักผจญภัย', color: '#4a86e0', jobs: ['swordsman', 'mage'] },
  { name: 'พ่อค้าและช่าง', color: '#f5902e', jobs: ['merchant', 'blacksmith'] },
  { name: 'ชาวนา', color: '#56a832', jobs: ['farmer'] },
  { name: 'งานบริการและศาสนา', color: '#f582b8', jobs: ['innkeeper', 'courtesan', 'priest'] },
  { name: 'นอกกฎหมาย', color: '#463c56', jobs: ['thief'] },
];

const wealth = (gold: number) => (gold < 15 ? 'ยากจน' : gold < 60 ? 'พอกินพอใช้' : gold < 150 ? 'มีอันจะกิน' : 'มั่งคั่ง');
const mood = (loyal: number) => (loyal < 30 ? 'ไม่พอใจ' : loyal < 45 ? 'ระแวง' : loyal < 65 ? 'ปกติ' : 'จงรักภักดี');
const avg = (list: Npc[], f: (n: Npc) => number) => (list.length ? list.reduce((s, n) => s + f(n), 0) / list.length : 0);

export function renderPeople(world: WorldState): void {
  const living = world.npcs.filter((n) => n.alive);
  const adults = living.filter((n) => n.age >= ADULT_AGE);
  const key = JSON.stringify([
    Math.floor(world.day / 5),
    living.length,
    adults.map((n) => n.job).join(),
    [...open],
  ]);
  if (key === lastKey) return;
  lastKey = key;

  view.replaceChildren(overview(world, living, adults), classBar(adults), ...CLASSES.flatMap((c) => c.jobs).map((job) => jobSection(world, job, adults.filter((n) => n.job === job))), childrenSection(living));
}

function overview(world: WorldState, living: Npc[], adults: Npc[]): HTMLElement {
  const children = living.filter((n) => n.age < ADULT_AGE);
  const elders = adults.filter((n) => n.age >= ELDER_AGE);
  const hungry = living.filter((n) => (n.hunger ?? 0) >= 2);
  const couples = adults.filter((n) => n.spouseId !== undefined && living.some((o) => o.id === n.spouseId)).length / 2;
  const year = world.chronicle.filter((e) => e.day > world.day - 365);
  const born = year.filter((e) => e.text.includes('ต้อนรับลูกคนใหม่')).length;
  const died = year.filter((e) => e.kind === 'death').length;
  const richest = adults.slice().sort((a, b) => b.gold - a.gold)[0];
  const tile = (label: string, value: string | number, tone = '') => el('div', { className: `people-tile${tone}` }, el('span', { textContent: label }), el('b', { textContent: String(value) }));
  return el(
    'div',
    { className: 'people-overview' },
    el(
      'div',
      { className: 'people-tiles' },
      tile('ประชากร', living.length),
      tile('ผู้ใหญ่', adults.length),
      tile('เด็ก', children.length),
      tile('ผู้อาวุโส', elders.length),
      tile('ครอบครัว', Math.floor(couples)),
      tile('หิวโหย', hungry.length, hungry.length ? ' people-tile--bad' : ''),
    ),
    el(
      'p',
      { className: 'people-note' },
      `ฐานะเฉลี่ย: ${wealth(avg(adults, (n) => n.gold))} (${Math.round(avg(adults, (n) => n.gold))} ทอง) · ใจต่อราชบัลลังก์: ${mood(avg(adults, loyaltyOf))} · ศีลเฉลี่ย ${Math.round(avg(adults, (n) => n.morality))}`,
    ),
    el('p', { className: 'people-note' }, `ปีที่ผ่านมา: เกิดใหม่ราว ${born} คน · เสียชีวิต ${died} คน${richest ? ` · คนรวยที่สุด ` : ''}`, ...(richest ? [chip(richest), ` ${richest.gold} ทอง`] : [])),
  );
}

// One bar split by class, so the shape of the town reads at a glance.
function classBar(adults: Npc[]): HTMLElement {
  const bar = el('div', { className: 'people-bar' });
  const legend = el('ul', { className: 'people-legend' });
  for (const c of CLASSES) {
    const count = adults.filter((n) => c.jobs.includes(n.job)).length;
    if (!count) continue;
    const seg = el('span', { title: `${c.name} ${count} คน` });
    seg.style.flex = String(count);
    seg.style.background = c.color;
    bar.append(seg);
    const dot = el('i');
    dot.style.background = c.color;
    legend.append(el('li', {}, dot, `${c.name} ${count}`));
  }
  return el('section', { className: 'guild-sec' }, el('h3', { textContent: 'ชนชั้นในอาณาจักร' }), bar, legend);
}

function jobSection(world: WorldState, job: Job, members: Npc[]): HTMLElement {
  const portrait = el('span', { className: 'people-job__face' });
  portrait.style.backgroundImage = `url(/assets/sprites/characters/${job}.png)`;
  const gold = avg(members, (n) => n.gold);
  const loyal = avg(members, loyaltyOf);
  const details = el('details', { className: 'people-job', open: open.has(job) });
  details.addEventListener('toggle', () => (details.open ? open.add(job) : open.delete(job)));
  const summary = el(
    'summary',
    {},
    portrait,
    el('span', { className: 'people-job__name' }, el('b', { textContent: JOB_TH[job] }), el('small', { textContent: members.length ? `${wealth(gold)} · ${mood(loyal)}` : 'ยังไม่มีใครทำ' })),
    el('span', { className: 'people-job__count', textContent: String(members.length) }),
  );
  if (!members.length) {
    details.append(summary);
    return details;
  }
  const facts = [`ทองเฉลี่ย ${Math.round(gold)}`, `ภักดีเฉลี่ย ${Math.round(loyal)}`, ...specifics(world, job, members)];
  const shown = members.slice().sort((a, b) => b.gold - a.gold);
  details.append(
    summary,
    el('ul', { className: 'people-facts' }, ...facts.map((f) => el('li', { textContent: f }))),
    el('div', { className: 'people-crew' }, ...shown.slice(0, 24).map(chip), ...(shown.length > 24 ? [el('span', { textContent: `+${shown.length - 24}` })] : [])),
  );
  return details;
}

// What's worth knowing about each trade, from the systems it touches.
function specifics(world: WorldState, job: Job, members: Npc[]): string[] {
  const m = world.market;
  const recent = (re: RegExp) => world.chronicle.filter((e) => e.day > world.day - 365 && re.test(e.text)).length;
  const working = members.filter((n) => n.plan?.kind === 'work' && n.x === n.plan.x && n.y === n.plan.y).length;
  switch (job) {
    case 'king': {
      const k = members[0];
      return [`ครองราชย์มาแล้ว ${Math.floor((world.day - (world.crown?.since ?? world.day)) / 365)} ปี`, `นิสัย: ${k.traits.map((t) => TRAIT_TH[t]).join(' · ')}`];
    }
    case 'noble':
      return [`ทะเยอทะยาน ${members.filter((n) => n.traits.includes('greedy') || n.traits.includes('vengeful')).length} คน`, `เก็บค่าเช่านาจากชาวนา ${world.npcs.filter((n) => n.alive && n.job === 'farmer').length} คน`];
    case 'soldier':
      return [
        `มีอาวุธ ${members.filter((n) => n.gear).length} จาก ${members.length} นาย`,
        `ค้างเงินเดือน ${members.filter((n) => (n.unpaid ?? 0) > 0).length} นาย`,
        `ยืนยามอยู่ตอนนี้ ${working} นาย`,
        `จับโจรได้ปีนี้ ${recent(/^ทหาร.+จับ/)} ครั้ง`,
      ];
    case 'swordsman':
    case 'mage': {
      const ranks = RANKS.map((r, i) => [r, members.filter((n) => (n.rank ?? 0) === i).length] as const).filter(([, c]) => c);
      return [
        `แรงก์: ${ranks.map(([r, c]) => `${r}×${c}`).join(' ')}`,
        `อัศวิน ${members.filter((n) => n.knight).length} · มีอุปกรณ์ ${members.filter((n) => n.gear).length}`,
        `กำลังทำเควส ${members.filter((n) => n.questId !== undefined).length} · อยู่ในดันเจี้ยน ${members.filter((n) => n.inside !== undefined).length}`,
        `อยู่กิลด์ ${members.filter((n) => n.guildId !== undefined).length} คน`,
      ];
    }
    case 'farmer':
      return [`ทำนาอยู่ตอนนี้ ${working} คน`, ...(m ? [`ข้าวในคลัง ${Math.floor(m.stock.grain)} กระสอบ · ราคา ${m.price.grain} ทอง`] : [])];
    case 'merchant':
      return [`เฝ้าร้านอยู่ ${working} คน`, ...(m ? [`เงินในร้าน ${Math.floor(m.till)} ทอง`] : []), `อยู่สมาคมการค้า ${members.filter((n) => n.guildId !== undefined).length} คน`];
    case 'blacksmith':
      return [`ตีเหล็กอยู่ ${working} คน`, ...(m ? [`ของจากดันเจี้ยน ${m.stock.loot} · อาวุธในร้าน ${m.stock.gear} ชุด (${m.price.gear} ทอง)`] : [])];
    case 'innkeeper':
      return [`เปิดร้านอยู่ ${working} คน`, ...(world.crown?.lastFestival !== undefined ? [`เทศกาลล่าสุด D${world.crown.lastFestival}`] : [])];
    case 'courtesan':
      return [`รับแขกอยู่ ${working} คน`, `แฉแผนกบฏมาแล้ว ${world.chronicle.filter((e) => e.text.startsWith('นางคณิกา')).length} ครั้ง (ในบันทึก)`];
    case 'priest':
      return [`สวดภาวนาอยู่ ${working} คน`, `ศรัทธาสะสม ${Math.floor(world.faith)}`];
    case 'thief':
      return [
        `อยู่สมาคมเงา ${members.filter((n) => n.guildId !== undefined).length} คน`,
        `ถูกตั้งค่าหัว ${world.quests.filter((q) => q.kind === 'bounty' && ['recruiting', 'travelling', 'inside'].includes(q.stage)).length} คน`,
        `ลักขโมยปีนี้ ${recent(/ขโมยทอง/)} ครั้ง`,
      ];
    default:
      return [];
  }
}

function childrenSection(living: Npc[]): HTMLElement {
  const kids = living.filter((n) => n.age < ADULT_AGE).sort((a, b) => b.age - a.age);
  const portrait = el('span', { className: 'people-job__face' });
  portrait.style.backgroundImage = 'url(/assets/sprites/characters/child.png)';
  const details = el('details', { className: 'people-job', open: open.has('child') });
  details.addEventListener('toggle', () => (details.open ? open.add('child') : open.delete('child')));
  details.append(
    el(
      'summary',
      {},
      portrait,
      el('span', { className: 'people-job__name' }, el('b', { textContent: 'เด็ก' }), el('small', { textContent: `ใกล้เป็นผู้ใหญ่ ${kids.filter((n) => n.age >= ADULT_AGE - 2).length} คน` })),
      el('span', { className: 'people-job__count', textContent: String(kids.length) }),
    ),
    el('div', { className: 'people-crew' }, ...kids.slice(0, 24).map(chip)),
  );
  return details;
}

function chip(n: Npc): HTMLElement {
  const b = el('button', { type: 'button', className: 'chip chip--button', textContent: n.name });
  if ((n.hunger ?? 0) >= 2) b.classList.add('chip--hungry');
  b.onclick = () => handlers.onSelectNpc(n.id);
  return b;
}

