import { influenceOf, say, DUNGEON_KINDS, costOf, jobName, RANKS, type Dungeon, type Guild, type Npc, type Quest, type WorldState } from '../sim';
import { el, icon } from './icons';

const view = document.getElementById('guild')!;

const KIND_TH: Record<Quest['kind'], string> = { hunt: 'ปราบมอนสเตอร์', explore: 'สำรวจ', escort: 'คุ้มกัน', pest: 'ไล่สัตว์ร้าย', bounty: 'ล่าค่าหัว', land: 'งานหัวเมือง' };
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
  const members = (g: Guild) => world.npcs.filter((n) => n.alive && n.guildId === g.id);
  const key = JSON.stringify([
    world.quests,
    world.legends.length,
    Math.floor(world.faith),
    adventurers.map((a) => [a.id, a.rank, a.renown, a.guildId]),
    world.guilds.map((g) => [g, members(g).length]),
    world.dungeons.map((d) => [d.id, Math.floor(d.power / 5), d.boss?.hp, d.boss?.slainDay, d.calmUntil]),
    Math.floor(world.day / 10),
  ]);
  if (key === lastKey) return;
  lastKey = key;

  const active = world.quests.filter((q) => ['recruiting', 'travelling', 'inside'].includes(q.stage));
  const finished = world.quests.filter((q) => !active.includes(q)).slice().reverse();
  const byId = new Map(world.npcs.map((n) => [n.id, n]));

  view.replaceChildren(
    divineBar(world),
    section('ดันเจี้ยน', world.dungeons.map((d) => dungeonCard(world, d))),
    section('เควสบนกระดาน', active.length ? active.map((q) => questCard(world, q, byId)) : [empty('ยังไม่มีใครประกาศจ้าง')]),
    section(
      'กิลด์ในเมือง',
      world.guilds.length
        ? world.guilds.map((g) => guildCard(g, members(g), byId, influenceOf(world, g)))
        : [empty('ยังไม่มีใครก่อตั้งกิลด์ นักผจญภัยที่มีประสบการณ์ พ่อค้าที่ร่ำรวย หรือโจรใจดำ อาจตั้งขึ้นเองเมื่อมีทองพอ')],
    ),
    section('ผลล่าสุด', finished.length ? finished.map((q) => resultRow(q, byId)) : [empty('ยังไม่มีเควสที่จบ')]),
    section('นักผจญภัย', adventurers.length ? adventurers.map((n) => adventurerRow(world, n)) : [empty('ยังไม่มีนักผจญภัยในเมือง')]),
    section(
      'หอเกียรติยศ',
      world.legends.length
        ? world.legends.slice().reverse().map((l) => el('li', { className: 'legend' }, icon('crown', 16), el('span', { textContent: l.text }), el('time', { textContent: `D${l.day}` })))
        : [empty('ยังไม่มีตำนาน')],
    ),
  );
}

function divineBar(world: WorldState): HTMLElement {
  const cost = costOf(world, 'divineQuest');
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

// One dungeon: its kind and danger, how close it is to spilling over, and its boss.
function dungeonCard(world: WorldState, d: Dungeon): HTMLElement {
  const kind = DUNGEON_KINDS[d.kind ?? 'cave'];
  const art = el('img', { src: `/assets/sprites/buildings/${d.kind && d.kind !== 'cave' ? `dungeon-${d.kind}` : 'dungeon'}.png`, alt: '', className: 'lair__art' });
  const fill = el('span', { className: `realm-meter__fill realm-meter__fill--${d.power >= 70 ? 'weak' : 'strong'}` });
  fill.style.width = `${Math.min(100, d.power)}%`;
  const b = d.boss;
  const calmLeft = (d.calmUntil ?? 0) - world.day;
  const bossLine = !b
    ? ''
    : b.slainDay !== undefined
      ? `บอส${b.name}ถูกปราบแล้ว${calmLeft > 0 ? ` · สงบอีก ${calmLeft} วัน` : ' · บางสิ่งกำลังจะขึ้นมาแทน'}`
      : `บอส ${b.name} · พลังชีวิต ${b.hp}/${b.maxHp}`;
  return el(
    'li',
    { className: 'lair' },
    art,
    el(
      'div',
      { className: 'realm-king__body' },
      el('b', { textContent: d.name }),
      el('p', { className: 'realm-king__meta', textContent: `${kind.th} · ความอันตราย ${'★'.repeat(Math.round(kind.tier * 1.5))}` }),
      el('div', { className: 'realm-meter' }, el('span', { className: 'realm-meter__label', textContent: 'มอนสเตอร์สะสม' }), el('span', { className: 'realm-meter__track' }, fill), el('b', { textContent: String(Math.round(d.power)) })),
      el('p', { className: 'realm-king__meta', textContent: bossLine }),
    ),
  );
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

function patronText(world: WorldState, q: Quest, byId: Map<number, Npc>): string {
  if (q.divine) return 'เทพเจ้า';
  if (q.crown) return say(world, 'ราชสำนัก');
  const g = world.guilds.find((x) => x.id === q.patronGuildId);
  if (g) return g.name;
  const p = q.patronId !== undefined ? byId.get(q.patronId) : undefined;
  return p ? `${p.name} (${jobName(world, p.job)})` : 'ไม่ทราบ';
}

function questCard(world: WorldState, q: Quest, byId: Map<number, Npc>): HTMLElement {
  const claimedBy = world.guilds.find((g) => g.id === q.guildId);
  const patron = `ผู้ว่าจ้าง: ${patronText(world, q, byId)}${claimedBy ? ` · ${claimedBy.name}รับงาน` : ''}`;
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
      el('p', { className: 'quest__patron', textContent: patron }),
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

function guildCard(g: Guild, members: Npc[], byId: Map<number, Npc>, influence: number): HTMLElement {
  const leader = byId.get(g.leaderId);
  const others = members.filter((m) => m.id !== g.leaderId);
  const kind = { adventurers: 'กิลด์นักผจญภัย', merchants: 'สมาคมการค้า (พ่อค้า ชาวนา และช่างฝีมือ)', thieves: 'สมาคมโจร' }[g.kind];
  const fame = g.kind === 'adventurers' ? ` · ชื่อเสียง ${g.renown}` : '';
  return el(
    'li',
    { className: `guild-card guild-card--${g.kind}` },
    el('img', { src: '/assets/sprites/icons/banner.png', alt: '', width: 32, height: 32 }),
    el(
      'div',
      { className: 'guild-card__body' },
      el('p', { className: 'guild-card__name', textContent: g.name }),
      el('p', { className: 'guild-card__meta', textContent: `${kind} · ก่อตั้ง D${g.founded} · สมาชิก ${members.length} คน${fame} · อิทธิพล ${influence}${influence >= 25 ? ' (มีเสียงในสภา)' : ''}` }),
      el('div', { className: 'quest__party' }, el('span', { className: 'quest__client', textContent: 'หัวหน้า' }), npcChip(leader), ...others.map((m) => npcChip(m))),
    ),
  );
}

function adventurerRow(world: WorldState, n: Npc): HTMLElement {
  const guild = world.guilds.find((g) => g.id === n.guildId);
  const row = el(
    'li',
    { className: 'adv' },
    rankBadge(n.rank),
    el('button', { type: 'button', className: 'adv__name', textContent: n.name }),
    el('span', { className: 'adv__job', textContent: `${jobName(world, n.job)} · LV ${n.level}${guild ? ` · ${guild.name}` : ''}` }),
    el('span', { className: 'adv__renown', textContent: `${n.renown ?? 0}` }),
  );
  (row.querySelector('.adv__name') as HTMLButtonElement).onclick = () => handlers.onSelectNpc(n.id);
  return row;
}
