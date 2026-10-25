import { costOf, DREAD_TO_RISE, MAX_POWER, SIEGES_TO_FALL, trainDays, bestHero, fighter, heroOf, JOB_TH, TAX_TH, TRAIT_TH, approval, balanceOf, crownPower, cultists, loyaltyOf, type Npc, type WorldState } from '../sim';
import { el, icon } from './icons';

const view = document.getElementById('kingdom')!;

interface Handlers {
  onSelectNpc: (id: number) => void;
  onReveal: () => void;
  onHero: () => void;
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
    Math.round(balanceOf(world)),
    world.cult,
    cultists(world).map((n) => n.id),
    Math.floor(world.faith) >= costOf(world, 'reveal'),
    Math.floor(world.faith) >= costOf(world, 'hero'),
    Math.floor(world.dread ?? 0),
    world.demon && { ...world.demon, power: Math.round(world.demon.power) },
    heroOf(world)?.level,
    bestHero(world)?.id,
  ]);
  if (key === lastKey) return;
  lastKey = key;

  const avg = (list: Npc[]) => (list.length ? Math.round(list.reduce((s, n) => s + loyaltyOf(n), 0) / list.length) : 0);
  view.replaceChildren(
    balanceMeter(world),
    world.demon?.stage === 'occupied'
      ? occupiedCard(world)
      : king
        ? kingCard(world, king)
        : el('p', { className: 'guild-empty', textContent: 'บัลลังก์ว่างอยู่' }),
    demonSection(world),
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
    cultSection(world),
    section('อัศวินแห่งราชบัลลังก์', knights.length ? knights.map((n) => personRow(n, JOB_TH[n.job])) : [empty('ยังไม่มีใครได้รับแต่งตั้ง นักผจญภัยแรงก์ C ขึ้นไปที่ภักดีจะได้เป็นอัศวิน')]),
    section(
      'ข่าวการเมือง',
      news.length
        ? news.map((e) => el('li', { className: 'legend' }, icon('crown', 16), el('span', { textContent: e.text }), el('time', { textContent: `D${e.day}` })))
        : [empty('ราชสำนักยังสงบ')],
    ),
  );
}

// Light against dark: a marker on a demon-to-gold bar, with a word for where the world stands.
function balanceMeter(world: WorldState): HTMLElement {
  const b = Math.round(balanceOf(world));
  const marker = el('span', { className: 'moral__marker' });
  marker.style.left = `${(b + 100) / 2}%`;
  const word = b <= -50 ? 'มืดมิด' : b <= -20 ? 'เงามืดคืบคลาน' : b < 15 ? 'สมดุล' : b < 35 ? 'สว่างไสว' : 'ยุคแห่งแสง';
  return el(
    'div',
    { className: 'realm-balance' },
    el('span', { textContent: 'สมดุลโลก' }),
    el('div', { className: 'moral' }, marker),
    el('b', { textContent: `${b > 0 ? '+' : ''}${b}` }),
    el('small', { textContent: word }),
  );
}

// Under occupation the throne card gives way to the demon's rule.
function occupiedCard(world: WorldState): HTMLElement {
  const lord = world.demon!;
  const gov = world.npcs.find((n) => n.id === lord.governorId && n.alive);
  const portrait = el('div', { className: 'demon-portrait' });
  portrait.style.backgroundImage = 'url(/assets/sprites/monsters/demon-lord.png)';
  return el(
    'div',
    { className: 'realm-occupied' },
    portrait,
    el(
      'div',
      { className: 'realm-king__body' },
      el('p', { className: 'realm-occupied__title', textContent: `ถูกจอมมาร${lord.name}ยึดครอง` }),
      el('p', { className: 'realm-king__meta', textContent: `ตั้งแต่ D${lord.fell ?? lord.risen} · ไม่มีกษัตริย์ ไม่มีกองทัพ ส่วยครึ่งท้องพระคลังทุกเดือน` }),
      ...(gov ? [el('div', { className: 'quest__party' }, el('span', { className: 'realm-king__meta', textContent: 'ผู้สำเร็จราชการ' }), personChip(gov))] : []),
      el('p', { className: 'realm-king__meta', textContent: 'มีเพียงผู้กล้าที่ปราบจอมมารได้เท่านั้นที่จะคืนอิสรภาพให้เมือง' }),
    ),
  );
}

// Before it wakes: how near the dread is. After: the lord, the town's hold, and the hero.
function demonSection(world: WorldState): HTMLElement {
  const lord = world.demon;
  if (!lord) {
    const dread = Math.round(((world.dread ?? 0) / DREAD_TO_RISE) * 100);
    const slain = world.demonsSlain ?? 0;
    return section('จอมมาร', [
      el('li', { className: 'realm-meters' }, meter('ลางร้าย', dread, dread >= 50 ? 'weak' : 'strong')),
      empty(`${dread ? 'ความมืดและพิธีของลัทธิปลุกจอมมารใต้ดันเจี้ยน ถ้าลางร้ายเต็มจอมมารจะตื่นขึ้น' : 'จอมมารยังหลับใหลอยู่ใต้ดันเจี้ยน'}${slain ? ` · ปราบจอมมารมาแล้ว ${slain} ตน` : ''}`),
    ]);
  }
  const portrait = el('div', { className: 'demon-portrait' });
  portrait.style.backgroundImage = 'url(/assets/sprites/monsters/demon-lord.png)';
  const power = Math.round(lord.power);
  const hold = lord.stage === 'risen' ? `เมืองต้านทัพปีศาจได้อีก ${SIEGES_TO_FALL - lord.sieges} ครั้ง` : 'ยึดครองเมืองอยู่';
  return section('จอมมาร', [
    el(
      'li',
      { className: 'realm-demon' },
      el(
        'div',
        { className: 'realm-demon__head' },
        portrait,
        el(
          'div',
          {},
          el('p', { className: 'realm-demon__name', textContent: `จอมมาร${lord.name}` }),
          el('p', { className: 'realm-king__meta', textContent: `ตื่นเมื่อ D${lord.risen} · ${hold}` }),
        ),
      ),
      meter('พลังจอมมาร', Math.round((power / MAX_POWER) * 100), 'weak'),
      heroBlock(world),
    ),
  ]);
}

function heroBlock(world: WorldState): HTMLElement {
  const lord = world.demon!;
  const hero = heroOf(world);
  if (!hero) {
    const cost = costOf(world, 'hero');
    const pick = bestHero(world);
    const btn = el('button', { type: 'button', className: 'btn btn--gold divine', disabled: world.faith < cost || !pick }, icon('awaken', 16), 'ปลุกผู้กล้า', el('span', { className: 'divine__cost' }, icon('faith', 16), String(cost)));
    btn.onclick = () => handlers.onHero();
    return el(
      'div',
      { className: 'realm-cult' },
      btn,
      el('p', { className: 'realm-king__meta', textContent: pick ? `เทพเจ้าจะเลือก ${pick.name} (${JOB_TH[pick.job]} LV ${pick.level}) หรือเลือกเองจากการ์ดชาวเมือง` : 'ไม่มีใครพร้อมรับพลังผู้กล้า' }),
    );
  }
  const q = lord.hero!;
  const portrait = el('div', { className: 'npc__portrait' });
  portrait.style.backgroundImage = 'url(/assets/sprites/characters/hero.png)';
  const name = el('button', { type: 'button', className: 'realm-king__name', textContent: `ผู้กล้า${hero.name}` });
  name.onclick = () => handlers.onSelectNpc(hero.id);
  const doing = q.stage === 'training' ? `ฝึกฝนวิชา ${Math.min(trainDays(world), world.day - q.since)}/${trainDays(world)} วัน` : hero.inside !== undefined ? 'บุกเข้าปราสาทจอมมาร!' : 'เดินทัพไปปราสาทจอมมาร';
  const party = q.companions.map((id) => world.npcs.find((n) => n.id === id && n.alive)).filter((n): n is Npc => !!n);
  const might = fighter(hero, world) * 2 + party.reduce((s, n) => s + fighter(n, world), 0);
  return el(
    'div',
    { className: 'realm-hero' },
    portrait,
    el(
      'div',
      { className: 'realm-king__body' },
      name,
      el('p', { className: 'realm-king__meta', textContent: `LV ${hero.level} · ${doing} · พลัง ${Math.round(might)} ต่อ ${Math.round(lord.power * 2.5)}` }),
      ...(party.length ? [el('div', { className: 'quest__party' }, el('span', { className: 'realm-king__meta', textContent: 'สหาย' }), ...party.map(personChipPlain))] : []),
    ),
  );
}

function personChipPlain(n: Npc): HTMLElement {
  const b = el('button', { type: 'button', className: 'chip chip--button', textContent: n.name });
  b.onclick = () => handlers.onSelectNpc(n.id);
  return b;
}

// The god sees what the town can't: the cult and every one of its members.
function cultSection(world: WorldState): HTMLElement {
  const members = cultists(world);
  const cost = costOf(world, 'reveal');
  const btn = el('button', { type: 'button', className: 'btn btn--gold divine', disabled: world.faith < cost || !members.length }, icon('cult', 16), 'ส่งนิมิตเปิดโปงสาวก', el('span', { className: 'divine__cost' }, icon('faith', 16), String(cost)));
  btn.onclick = () => handlers.onReveal();
  if (!world.cult || !members.length) return section('ลัทธิมาร', [empty('ยังไม่มีลัทธิมารในเมือง แต่ถ้าคนใจดำมีมากขึ้น อาจมีใครก่อตั้งขึ้นอย่างลับๆ')]);
  const leader = world.npcs.find((n) => n.id === world.cult!.leaderId);
  return section('ลัทธิมาร', [
    el(
      'li',
      { className: 'realm-cult' },
      el('p', { className: 'realm-cult__name' }, icon('cult', 16), world.cult.name),
      el('p', { className: 'realm-king__meta', textContent: `ก่อตั้ง D${world.cult.founded} · สาวก ${members.length} คน · ประกอบพิธีแล้ว ${world.cult.rituals} ครั้ง` }),
      el('div', { className: 'quest__party' }, ...(leader ? [el('span', { className: 'realm-king__meta', textContent: 'ผู้นำ' }), personChip(leader)] : []), ...members.filter((n) => n !== leader).map(personChip)),
      btn,
      el('p', { className: 'realm-king__meta', textContent: 'ชาวเมืองไม่รู้ว่าใครเป็นสาวก มีแต่เทพเจ้าที่มองเห็น' }),
    ),
  ]);
}

function personChip(n: Npc): HTMLElement {
  const b = el('button', { type: 'button', className: 'chip chip--button chip--cult', textContent: n.name });
  b.onclick = () => handlers.onSelectNpc(n.id);
  return b;
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
