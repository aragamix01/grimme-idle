import { AMBITION_COST, PLACES_SCHOOL, literate, rulerLook, rulerTitle, ADULT_AGE, costOf, cursed, canAwaken, worthy, COMMON_JOBS, ELDER_AGE, jobName, TRAIT_TH, rankName, tieLabel, topTies, type Command, type DreamKind, type Job, type Npc, type WorldState } from '../sim';
import { el, icon, iconUrl } from './icons';
import { localize } from './lexicon';

const card = document.getElementById('npc-card')!;
const hint = document.getElementById('npc-hint')!;
const JOBS = COMMON_JOBS; // the king and nobles are made, not dreamt

interface Handlers {
  onCommand: (cmd: Command) => void;
  onClose: () => void;
  onSelect: (id: number) => void;
}

let handlers: Handlers;
let lastKey = '';
let shownId: number | null = null;
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
  const ties = topTies(world, npc.id);
  const guild = world.guilds.find((g) => g.id === npc.guildId);
  const fam = family(world, npc);
  const key = JSON.stringify([shown, doing, Math.floor(world.faith), choosingDream, cursed(world, npc), Math.floor(world.day / 10), canAwaken(world), ties, guild?.name, guild?.leaderId, fam.map((f) => [f.role, f.npc.id, f.npc.alive])]);
  if (!force && key === lastKey) return;
  lastKey = key;
  const membership = guild && { name: guild.name, leads: guild.leaderId === npc.id };
  // On phones the card is a scrolling sheet: keep the reader's place across rebuilds, start at the top for someone new.
  const scroll = shownId === npc.id ? card.scrollTop : 0;
  shownId = npc.id;
  card.replaceChildren(bar(npc), header(npc, doing, world, membership), stats(npc), familyBlock(fam), relations(world, ties), powers(npc, world, canAwaken(world)));
  localize(card, world);
  card.scrollTop = scroll;
}

// A slim bar that stays at the top of the phone sheet, so it can always be closed.
function bar(npc: Npc): HTMLElement {
  const close = el('button', { type: 'button', className: 'npc__bar-close', textContent: '×', title: 'ปิด' });
  close.setAttribute('aria-label', 'ปิดข้อมูลชาวเมือง');
  close.onclick = () => handlers.onClose();
  return el('div', { className: 'npc__bar' }, el('b', { textContent: npc.name }), close);
}

const WORK_TH: Partial<Record<Job, string>> = {
  farmer: 'ทำนาอยู่ที่ทุ่ง',
  herder: 'ต้อนฝูงสัตว์อยู่ที่ทุ่งหญ้า',
  hunter: 'ออกล่ากวางในป่า',
  merchant: 'เฝ้าร้านค้า',
  blacksmith: 'ตีเหล็กอยู่ที่โรงตีเหล็ก',
  innkeeper: 'ขายเบียร์อยู่ที่โรงเตี๊ยม',
  courtesan: 'รับแขกอยู่ที่หอนางโลม',
  priest: 'สวดภาวนาอยู่ที่โบสถ์',
  scholar: 'ค้นคว้าตำราอยู่',
  alchemist: 'ปรุงยาอยู่หลังร้านค้า',
  engineer: 'คุมงานก่อสร้าง',
  builder: 'สร้างบ้านที่พังขึ้นใหม่',
  doctor: 'ตรวจรักษาผู้ป่วย',
  watchman: 'ลาดตระเวนจับคนร้าย',
  judge: 'พิจารณาคดี',
  lawyer: 'ว่าความให้จำเลย',
  soldier: 'ยืนยามเฝ้าเมือง',
};

// Letters: a grown-up reads or not; a child shows how far their lessons have come.
function schooled(npc: Npc): string {
  if (npc.age >= ADULT_AGE) return literate(npc) ? ' · อ่านออกเขียนได้' : '';
  return npc.schooling ? ` · เรียนมา ${Math.floor(npc.schooling)} วัน` : '';
}

// What the NPC is up to, in words the player can follow on the map.
function activity(world: WorldState, npc: Npc): string {
  if (!npc.alive) return npc.left ? 'ย้ายออกจากเมืองไปแล้ว' : 'จากไปแล้ว';
  if (npc.age < ADULT_AGE) {
    if (npc.plan?.x === PLACES_SCHOOL.x && npc.plan?.y === PLACES_SCHOOL.y) return 'เรียนหนังสืออยู่ที่โรงเรียน';
    const parent = world.npcs.find((n) => n.id === npc.plan?.target);
    return parent ? `เดินตาม${parent.name}` : 'วิ่งเล่นอยู่ในเมือง';
  }
  const dungeon = (id?: number) => world.dungeons.find((d) => d.id === id)?.name ?? 'ดันเจี้ยน';
  const quest = world.quests.find((q) => q.id === npc.questId);
  if (quest) {
    if (quest.clientId === npc.id) return quest.stage === 'recruiting' ? 'รอนักผจญภัยมาคุ้มกัน' : 'เดินทางพร้อมผู้คุ้มกัน';
    if (quest.stage === 'recruiting') return `รอเพื่อนร่วมทีมที่กิลด์ (${quest.title})`;
    if (quest.stage === 'travelling') return `เดินทางไปทำเควส: ${quest.title}`;
    return `กำลังทำเควส: ${quest.title}`;
  }
  if (npc.plan?.kind === 'crusade') return npc.inside !== undefined ? `บุกเข้าปราสาทจอมมาร${world.demon ? world.demon.name : ''}` : 'เดินทัพไปปราสาทจอมมาร';
  if (npc.inside !== undefined && npc.trip !== undefined) return `เดินทางกับกองคาราวาน อีกราว ${npc.trip} วันจะกลับ`;
  if (npc.inside !== undefined) return `กำลังสำรวจ${dungeon(npc.inside)}`;
  const p = npc.plan;
  switch (p?.kind) {
    case 'adventure':
      return `กำลังเดินทางไป${dungeon(p.target)}`;
    case 'work':
      return WORK_TH[npc.job] ?? 'ทำงานอยู่';
    case 'steal':
      return `กำลังสะกดรอยตาม${world.npcs.find((n) => n.id === p.target)?.name ?? 'ใครบางคน'}`;
    case 'flee':
      return 'กำลังหลบหนี';
    case 'return':
      return 'กำลังกลับกิลด์';
    case 'arrive':
      return 'เพิ่งมาถึงเมือง';
    case 'buy':
      return 'ไปซื้ออาวุธที่ร้านค้า';
    case 'ritual':
      return 'แอบไปร่วมพิธีมืดที่ดันเจี้ยน';
    case 'caravan':
      return 'นำกองคาราวานไปที่ประตูเมืองฝั่งตะวันตก';
    case 'haul':
      return 'นำกองคาราวานกลับเข้าเมือง';
    default:
      return 'พักผ่อนอยู่ในเมือง';
  }
}

interface Kin {
  role: string;
  npc: Npc;
}

function family(world: WorldState, npc: Npc): Kin[] {
  const out: Kin[] = [];
  const find = (id?: number) => world.npcs.find((n) => n.id === id);
  const spouse = find(npc.spouseId);
  if (spouse) out.push({ role: 'คู่ชีวิต', npc: spouse });
  for (const id of npc.parentIds ?? []) {
    const p = find(id);
    if (p) out.push({ role: 'พ่อแม่', npc: p });
  }
  for (const c of world.npcs) if (c.parentIds?.includes(npc.id)) out.push({ role: 'ลูก', npc: c });
  return out;
}

function familyBlock(kin: Kin[]): HTMLElement {
  if (!kin.length) return el('div');
  const rows = kin.map(({ role, npc }) => {
    const name = el('button', { type: 'button', className: 'rel__name', textContent: npc.name });
    if (!npc.alive) name.classList.add('rel__name--dead');
    name.onclick = () => handlers.onSelect(npc.id);
    const note = npc.alive ? `${npc.age} ปี` : 'ล่วงลับ';
    return el('li', { className: 'rel' }, name, el('span', { className: 'rel__label', textContent: role }), el('span', { className: 'rel__label', textContent: note }));
  });
  return el('div', { className: 'npc__rels' }, el('h4', { textContent: 'ครอบครัว' }), el('ul', {}, ...rows));
}

function relations(world: WorldState, ties: { id: number; value: number }[]): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const { id, value } of ties) {
    const other = world.npcs.find((n) => n.id === id);
    if (!other) continue;
    const name = el('button', { type: 'button', className: 'rel__name', textContent: other.name });
    if (!other.alive) name.classList.add('rel__name--dead');
    name.onclick = () => handlers.onSelect(other.id);
    const sign = value > 0 ? '+' : '';
    rows.push(el('li', { className: value < 0 ? 'rel rel--bad' : 'rel' }, name, el('span', { className: 'rel__label', textContent: tieLabel(value) }), el('b', { textContent: `${sign}${value}` })));
  }
  const body = rows.length ? el('ul', {}, ...rows) : el('p', { className: 'npc__traits', textContent: 'ยังไม่สนิทกับใคร' });
  return el('div', { className: 'npc__rels' }, el('h4', { textContent: 'ความสัมพันธ์' }), body);
}

function header(npc: Npc, doing: string, world: WorldState, guild?: { name: string; leads: boolean }): HTMLElement {
  const day = world.day;
  const portrait = el('div', { className: 'npc__portrait' });
  const look = npc.age < ADULT_AGE ? 'child' : npc.hero && npc.job !== 'king' ? 'hero' : npc.job === 'king' ? rulerLook(world) : npc.job;
  portrait.style.backgroundImage = `url(/assets/sprites/characters/${look}.png)`;
  const chips = el(
    'div',
    { className: 'npc__chips' },
    el('span', { className: 'chip', textContent: npc.age < ADULT_AGE ? 'เด็ก' : npc.job === 'king' ? rulerTitle(world) : jobName(world, npc.job) }),
    ...(npc.age >= ADULT_AGE ? [el('span', { className: 'chip', textContent: `LV ${npc.level}` })] : []),
    ...(npc.rank !== undefined ? [el('span', { className: 'chip chip--rank', textContent: `แรงก์ ${rankName(npc.rank)}` })] : []),
    ...(guild ? [el('span', { className: 'chip chip--guild', textContent: guild.leads ? `หัวหน้า${guild.name}` : guild.name })] : []),
    el('span', { className: 'chip', textContent: npc.age >= ELDER_AGE ? `ผู้อาวุโส ${npc.age} ปี` : `${npc.age} ปี` }),
    ...(npc.retired ? [el('span', { className: 'chip', textContent: 'เกษียณแล้ว' })] : []),
    ...(npc.blessed ? [el('span', { className: 'chip chip--gold', textContent: npc.blessUntil ? `ได้รับพร (${Math.max(0, npc.blessUntil - day)} วัน)` : 'ได้รับพร' })] : []),
    ...(npc.alive && (npc.cursedUntil ?? 0) > day ? [el('span', { className: 'chip chip--curse', textContent: `ต้องสาป (${npc.cursedUntil! - day} วัน)` })] : []),
    ...(npc.relic ? [el('span', { className: 'chip chip--gold', textContent: npc.relic })] : []),
    ...(npc.hero ? [el('span', { className: 'chip chip--hero', textContent: 'ผู้กล้า' })] : []),
    ...(npc.knight ? [el('span', { className: 'chip chip--gold', textContent: 'อัศวิน' })] : []),
    ...(npc.cultist ? [el('span', { className: 'chip chip--cult', textContent: 'สาวกลัทธิมาร' })] : []),
    ...(npc.gear ? [el('span', { className: 'chip', textContent: `อุปกรณ์ +${npc.gear}` })] : []),
    ...(npc.alive && (npc.hunger ?? 0) >= 2 ? [el('span', { className: 'chip chip--danger', textContent: 'หิวโหย' })] : []),
    ...(!npc.alive ? [el('span', { className: 'chip chip--danger', textContent: npc.left ? 'ย้ายออกไปแล้ว' : 'จากไปแล้ว' })] : []),
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
      el('p', { className: 'npc__traits', textContent: `นิสัย: ${npc.traits.map((t) => TRAIT_TH[t]).join(' · ')}${schooled(npc)}` }),
      el('p', { className: 'npc__doing', textContent: doing }),
    ),
    close,
  );
}

// Loyalty to the throne as a plain gold bar: 0 ready to revolt, 100 would die for the king.
function loyaltyStat(npc: Npc): HTMLElement {
  const value = Math.round(npc.loyalty ?? 50);
  const fill = el('span', { className: `realm-meter__fill realm-meter__fill--${value < 30 ? 'weak' : 'strong'}` });
  fill.style.width = `${value}%`;
  return el(
    'div',
    { className: 'npc__stat npc__stat--moral' },
    el('span', { textContent: 'ภักดี' }),
    el('span', { className: 'realm-meter__track' }, fill),
    el('b', { textContent: String(value) }),
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
    ...(npc.age >= ADULT_AGE && npc.job !== 'king' ? [loyaltyStat(npc)] : []),
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

function powers(npc: Npc, world: WorldState, heroCall: boolean): HTMLElement {
  const can = (cost: number) => npc.alive && world.faith >= cost;
  const COMMAND_COST = { bless: costOf(world, 'bless'), curse: costOf(world, 'curse'), dream: costOf(world, 'dream'), hero: costOf(world, 'hero') };
  const grown = npc.age >= ADULT_AGE;
  const row = el(
    'div',
    { className: 'powers' },
    powerButton('bless', 'ให้พร', COMMAND_COST.bless, can(COMMAND_COST.bless) && !npc.blessed, () =>
      handlers.onCommand({ type: 'bless', npcId: npc.id }),
    ),
    powerButton('curse', 'สาปแช่ง', COMMAND_COST.curse, can(COMMAND_COST.curse), () =>
      handlers.onCommand({ type: 'curse', npcId: npc.id }),
    ),
    powerButton('dream', 'ส่งความฝัน', COMMAND_COST.dream, can(COMMAND_COST.dream) && grown, () => {
      choosingDream = !choosingDream;
      lastKey = '';
      card.dispatchEvent(new Event('rerender'));
    }),
  );
  const wrap = el('div', { className: 'npc__powers' }, el('h4', { textContent: 'พลังเทพ' }), row);
  // While the demon lord walks and no hero stands against it, the god may choose this one.
  if (heroCall && worthy(npc)) {
    const cost = COMMAND_COST.hero;
    const b = el('button', { type: 'button', className: 'btn btn--gold divine', disabled: !can(cost) }, icon('awaken', 16), `ปลุก${npc.name}เป็นผู้กล้า`, el('span', { className: 'divine__cost' }, icon('faith', 16), String(cost)));
    b.onclick = () => handlers.onCommand({ type: 'hero', npcId: npc.id });
    wrap.append(b);
  }
  if (choosingDream && can(COMMAND_COST.dream)) {
    // Dreams that change a heart, then dreams of a new calling.
    const kinds: [DreamKind, string][] = [['repent', 'กลับใจ'], ['love', 'ฝันถึงรัก'], ['nightmare', 'ฝันร้าย'], ...(npc.rank !== undefined ? [['vision', 'นิมิตแห่งดาบ'] as [DreamKind, string]] : npc.job === 'scholar' ? [['vision', 'นิมิตแห่งปัญญา'] as [DreamKind, string]] : npc.job === 'king' ? [['vision', 'นิมิตแห่งการปฏิรูป'] as [DreamKind, string]] : [])];
    // The dream of power, for anyone but the ruler, and dearer.
    if (npc.age >= ADULT_AGE && world.npcs.some((n) => n.alive && n.id === world.kingId) && npc.id !== world.kingId && world.demon?.stage !== 'occupied' && can(AMBITION_COST)) kinds.push(['ambition', `ฝันถึงอำนาจ (${AMBITION_COST})`]);
    const hearts = kinds.map(([kind, label]) => {
      const b = el('button', { type: 'button', className: 'chip chip--button', textContent: label });
      b.onclick = () => {
        choosingDream = false;
        handlers.onCommand({ type: 'dream', npcId: npc.id, kind });
      };
      return b;
    });
    wrap.append(el('div', { className: 'dream-kinds' }, el('span', { textContent: 'ให้ฝัน' }), ...hearts));
    const jobs = JOBS.filter((j) => j !== npc.job).map((job) => {
      const b = el('button', { type: 'button', className: 'chip chip--button', textContent: jobName(world, job) });
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
