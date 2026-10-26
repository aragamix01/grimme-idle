import { AGES, ageOf, reformers, literacy, REGIMES, council, councilName, regimeOf, rulerLook, rulerTitle, DECREES, DECREE_ORDER, decreeActive, WORKS, WORK_ORDER, workCost, TECHS, TECH_ORDER, known, troubleChance, WAR_COST, enemyOf, ourForces, perkLevel, theirStrength, relationWord, costOf, DREAD_TO_RISE, MAX_POWER, SIEGES_TO_FALL, trainDays, bestHero, fighter, heroOf, JOB_TH, TAX_TH, TRAIT_TH, approval, balanceOf, crownPower, cultists, loyaltyOf, type Npc, type WorldState } from '../sim';
import { el, icon } from './icons';
import { localize } from './lexicon';

const view = document.getElementById('kingdom')!;

interface Handlers {
  onSelectNpc: (id: number) => void;
  onReveal: () => void;
  onHero: () => void;
  onWar: (act: 'bless' | 'storm' | 'peace') => void;
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
    world.realms?.map((r) => [r.ruler.name, Math.round(r.relation / 5), r.pact, r.army]),
    world.war,
    Math.floor(world.faith / 5),
    cultists(world).map((n) => n.id),
    Math.floor(world.faith) >= costOf(world, 'reveal'),
    Math.floor(world.faith) >= costOf(world, 'hero'),
    Math.floor(world.dread ?? 0),
    world.demon && { ...world.demon, power: Math.round(world.demon.power) },
    heroOf(world)?.level,
    world.golden,
    world.works,
    world.building,
    world.decrees,
    world.decreeAt,
    world.labour,
    world.regime,
    world.republic,
    reformers(world).length,
    world.council,
    world.techs,
    world.research,
    Math.floor((world.knowledge ?? 0) / 5),
    world.dragon && [world.dragon.hp, world.dragon.hoard, world.dragon.nextStrike],
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
    ...(world.dragon ? [dragonSection(world)] : []),
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
      ...(world.golden ? [el('span', { className: 'chip chip--gold', title: 'ยุครุ่งเรืองที่ยาวนานมักจบด้วยปัญหา: ราชสำนักโลภ โรคระบาด หรือมังกร' }, icon('star', 16), `ยุครุ่งเรือง ${world.golden} เดือน · เสี่ยงเกิดเรื่อง ${Math.round(troubleChance(world.golden) * 100)}%`)] : []),
    ),
    section(
      'ขุนนางในราชสำนัก',
      nobles.length ? nobles.map((n) => personRow(n, n.traits.includes('greedy') || n.traits.includes('vengeful') ? 'ทะเยอทะยาน' : '')) : [empty('ยังไม่มีขุนนาง')],
    ),
    councilSection(world),
    decreesSection(world),
    worksSection(world),
    researchSection(world),
    warSection(world),
    neighbours(world),
    cultSection(world),
    section('อัศวินแห่งราชบัลลังก์', knights.length ? knights.map((n) => personRow(n, JOB_TH[n.job])) : [empty('ยังไม่มีใครได้รับแต่งตั้ง นักผจญภัยแรงก์ C ขึ้นไปที่ภักดีจะได้เป็นอัศวิน')]),
    section(
      'ข่าวการเมือง',
      news.length
        ? news.map((e) => el('li', { className: 'legend' }, icon('crown', 16), el('span', { textContent: e.text }), el('time', { textContent: `D${e.day}` })))
        : [empty('ราชสำนักยังสงบ')],
    ),
  );
  localize(view, world);
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
// Who will rise with the hero: the hidden resistance and any realm that calls us friend.
function resistNote(world: WorldState): string {
  const friends = (world.realms ?? []).filter((r) => !r.fallen && (r.pact || r.relation >= 50)).map((r) => r.name);
  return `ขบวนการต่อต้านจะลุกฮือพร้อมผู้กล้าเมื่อบุกปราสาท${friends.length ? ` · ${friends.join(' และ ')}พร้อมส่งทัพมาช่วย` : ' · ยังไม่มีอาณาจักรใดสนิทพอจะส่งทัพมาช่วย'}`;
}

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
      el('div', { className: 'realm-meters' }, meter('ขบวนการต่อต้าน', Math.round(lord.resistance ?? 0), 'strong')),
      el('p', { className: 'realm-king__meta', textContent: resistNote(world) }),
    ),
  );
}

// The king's decrees: which are in force, when each was last issued.
// The nobles as the king's council: who sits, how often they have said no, and the last vote.
function councilSection(world: WorldState): HTMLElement {
  const c = world.council;
  const seats = council(world);
  const RESULT = { passed: 'ผ่าน', vetoed: 'ถูกยับยั้ง', overridden: 'กษัตริย์ใช้อำนาจข้ามสภา' } as const;
  const rows = [
    el('li', { className: 'council' }, el('b', { textContent: `สมาชิก ${seats.length} คน` }), el('p', { className: 'realm-king__meta', textContent: seats.length < 2 ? 'ขุนนางน้อยเกินกว่าจะคัดค้านกษัตริย์ได้' : 'ทุกพระราชโองการต้องผ่านมติสภา เสียงข้างมากคัดค้านได้ เว้นแต่กษัตริย์จะมีอำนาจมากพอ' })),
    el('li', { className: 'council' }, el('span', { className: 'chip' }, `ยับยั้งมาแล้ว ${c?.vetoes ?? 0} ครั้ง`), el('span', { className: 'chip' }, `ถูกใช้อำนาจข้าม ${c?.overrides ?? 0} ครั้ง`)),
  ];
  if (c?.last) rows.push(el('li', { className: 'council' }, el('p', { className: 'realm-king__meta', textContent: `มติล่าสุด D${c.last.day}: ${DECREES[c.last.decree].name} เห็นชอบ ${c.last.ayes} คัดค้าน ${c.last.nays} · ${RESULT[c.last.result]}` })));
  return section(councilName(world), rows);
}

function decreesSection(world: WorldState): HTMLElement {
  return section(
    'พระราชโองการ',
    DECREE_ORDER.map((k) => {
      const d = DECREES[k];
      const on = world.decrees?.find((x) => x.kind === k && x.until > world.day);
      const last = world.decreeAt?.[k];
      const status = on ? `มีผลอยู่ อีก ${on.until - world.day} วัน` : last !== undefined ? `ออกล่าสุดวันที่ ${last}` : 'ยังไม่เคยออก';
      const extra = k === 'labour' && world.labour ? ` · แรงงานกำลังเดินทางมาอีก ${world.labour} คน` : '';
      return el(
        'li',
        { className: `work${decreeActive(world, k) ? ' work--done' : ''} decree` },
        el('span', { className: 'decree__seal', textContent: on ? '✦' : '·' }),
        el('div', {}, el('b', { textContent: d.name }), el('p', { className: 'realm-king__meta', textContent: `${d.text} · ${status}${extra}` })),
      );
    }),
  );
}

// The scholars' questions: what has been found, what they are on now, and how close they are.
function researchSection(world: WorldState): HTMLElement {
  const have = Math.floor(world.knowledge ?? 0);
  const age = AGES[ageOf(world)];
  const found = Object.keys(world.techs ?? {}).length;
  return section('งานค้นคว้าของนักปราชญ์', [
    // The age the town's learning has brought it to, and what the next one takes.
    el(
      'li',
      { className: 'council' },
      el('span', { className: 'chip chip--gold', textContent: age.name }),
      el('p', { className: 'realm-king__meta', textContent: `${age.text}${age.next ? ` · สมัยถัดไป: ${age.next} (ตอนนี้ ${found})` : ''}` }),
    ),
    ...TECH_ORDER.map((k) => {
      const t = TECHS[k];
      const done = known(world, k);
      const status = done ? `ค้นพบแล้ว D${world.techs![k]}` : world.research === k
          ? `กำลังค้นคว้า · ความรู้ ${Math.min(have, t.cost)}/${t.cost}`
          : (t.needs ?? []).some((n) => !known(world, n))
            ? `ต้องค้นพบ${t.needs!.map((n) => TECHS[n].name).join(' ')}ก่อน · ใช้ความรู้ ${t.cost}`
            : `ยังไม่ได้ค้นคว้า · ใช้ความรู้ ${t.cost}`;
      const row = el(
        'li',
        { className: `work tech${done ? ' work--done' : ''}` },
        el('img', { src: `/assets/sprites/icons/${t.icon}.png`, alt: '', className: 'work__art tech__icon' }),
        el('div', {}, el('b', { textContent: t.name }), el('p', { className: 'realm-king__meta', textContent: `${t.text} · ${status}` })),
      );
      if (world.research === k) {
        const bar = el('i');
        bar.style.width = `${Math.min(100, (have / t.cost) * 100)}%`;
        row.querySelector('div')!.append(el('span', { className: 'tech__bar' }, bar));
      }
      return row;
    }),
  ]);
}

// What the crown has built with its gold, what is going up now, and what it might build next.
function worksSection(world: WorldState): HTMLElement {
  const job = world.building;
  return section(
    'งานก่อสร้างของราชสำนัก',
    WORK_ORDER.map((k) => {
      const w = WORKS[k];
      const done = world.works?.[k] !== undefined;
      if (k === 'monument') {
        const tier = world.monument ?? 0;
        const status = job?.kind === k ? `กำลังสร้างระดับ ${tier + 1} อีก ${Math.max(0, job.done - world.day)} วัน` : `ระดับ ${tier} · ระดับถัดไป ${workCost(world, k)} ทอง`;
        return el(
          'li',
          { className: `work${tier ? ' work--done' : ''}` },
          el('img', { src: `/assets/sprites/buildings/monument-${Math.min(3, Math.max(1, tier))}.png`, alt: '', className: 'work__art' }),
          el('div', {}, el('b', { textContent: w.name }), el('p', { className: 'realm-king__meta', textContent: `${w.text} · ${status}` })),
        );
      }
      const status = done ? 'สร้างเสร็จแล้ว' : job?.kind === k ? `กำลังสร้าง อีก ${Math.max(0, job.done - world.day)} วัน` : `ยังไม่ได้สร้าง · ${workCost(world, k)} ทอง`;
      return el(
        'li',
        { className: `work${done ? ' work--done' : ''}` },
        el('img', { src: `/assets/sprites/buildings/${w.art}.png`, alt: '', className: 'work__art' }),
        el('div', {}, el('b', { textContent: w.name }), el('p', { className: 'realm-king__meta', textContent: `${w.text} · ${status}` })),
      );
    }),
  );
}

// The dragon on the hills: how hurt it is, what it has taken, and when it comes again.
function dragonSection(world: WorldState): HTMLElement {
  const d = world.dragon!;
  const portrait = el('div', { className: 'demon-portrait dragon-portrait' });
  portrait.style.backgroundImage = 'url(/assets/sprites/monsters/dragon.png)';
  const hp = Math.round((d.hp / d.maxHp) * 100);
  return section(`มังกร${d.name}`, [
    el(
      'li',
      { className: 'realm-king' },
      portrait,
      el(
        'div',
        { className: 'realm-king__info' },
        el('p', { className: 'realm-king__meta', textContent: `เกาะอยู่บนเนินเขามาแล้ว ${world.day - d.came} วัน · ปล้นทองไปแล้ว ${d.hoard} เหรียญ` }),
        el('p', { className: 'realm-king__meta', textContent: `จะบุกเมืองอีกใน ${Math.max(0, d.nextStrike - world.day)} วัน นักรบที่เก่งที่สุด 6 คนจะออกไปสู้` }),
      ),
    ),
    el('li', { className: 'realm-meters' }, meter('พลังชีวิตมังกร', hp, hp > 50 ? 'weak' : 'strong')),
    empty('อวยพรนักรบให้แข็งแกร่งและรอดจากไฟ ผู้สังหารจะได้สมบัติในรังมังกรและเกล็ดมังกร'),
  ]);
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

// At war: who, how it goes, and the three ways the god may help.
function warSection(world: WorldState): HTMLElement {
  const w = world.war;
  const foe = enemyOf(world);
  if (!w || !foe) return el('span');
  const ours = Math.round(ourForces(world).strength);
  const theirs = Math.round(theirStrength(foe));
  const cost = (act: keyof typeof WAR_COST) => Math.max(1, Math.round(WAR_COST[act] * (1 - 0.1 * perkLevel(world, 'grace'))));
  const act = (a: keyof typeof WAR_COST, label: string, iconName: string, used: boolean) => {
    const b = el('button', { type: 'button', className: 'btn btn--gold divine', disabled: used || world.faith < cost(a) }, icon(iconName, 16), label, el('span', { className: 'divine__cost' }, icon('faith', 16), String(cost(a))));
    b.onclick = () => handlers.onWar(a);
    return b;
  };
  return section('สงคราม', [
    el(
      'li',
      { className: 'realm-war' },
      el('p', { className: 'realm-war__title', textContent: `ทำสงครามกับ${foe.name}` }),
      el('p', { className: 'realm-king__meta', textContent: `${w.attacker === 'them' ? 'ฝ่ายนั้นบุกมาก่อน' : 'กษัตริย์ของเราเป็นฝ่ายบุก'} · ตั้งแต่ D${w.since} · รบไป ${w.battles} ครั้ง` }),
      el('p', { className: 'realm-king__meta', textContent: `คะแนน ${w.score > 0 ? '+' : ''}${w.score} (ถึง ±3 สงครามจบ) · ศึกถัดไปอีก ${Math.max(0, w.nextBattle - world.day)} วัน` }),
      el('p', { className: 'realm-king__meta', textContent: `กำลังฝ่ายเรา ${ours} ต่อ ${theirs}` }),
      act('bless', 'พรแห่งสงคราม', 'bless', !!w.boost),
      act('storm', 'พายุศักดิ์สิทธิ์', 'rain', !!w.storm),
      act('peace', 'นิมิตสันติ', 'dream', false),
      el('p', { className: 'realm-king__meta', textContent: 'เทพสั่งให้เปิดหรือหยุดสงครามไม่ได้ ทำได้เพียงช่วยในศึก หรือส่งนิมิตให้ทั้งสองกษัตริย์เห็นทางสันติ' }),
    ),
  ]);
}

// The neighbouring kingdoms and how they feel about us; the world map shows where they lie.
function neighbours(world: WorldState): HTMLElement {
  const realms = world.realms ?? [];
  const s = section(
    'อาณาจักรเพื่อนบ้าน',
    realms.map((r) =>
      el(
        'li',
        { className: 'realm-person' },
        el('span', { className: 'chip', textContent: r.name }),
        el('span', { className: 'realm-person__note', textContent: `${r.ruler.name} · ทัพ ${r.army}` }),
        el('b', { className: r.relation <= -15 || r.war ? 'realm-person__loyal--low' : '', textContent: r.war ? 'สงคราม!' : r.pact ? 'พันธมิตร ✦' : relationWord(r.relation) }),
      ),
    ),
  );
  s.dataset.foreign = ''; // their kings stay kings whatever we are
  return s;
}

function personChip(n: Npc): HTMLElement {
  const b = el('button', { type: 'button', className: 'chip chip--button chip--cult', textContent: n.name });
  b.onclick = () => handlers.onSelectNpc(n.id);
  return b;
}

function kingCard(world: WorldState, k: Npc): HTMLElement {
  const portrait = el('div', { className: 'npc__portrait' });
  portrait.style.backgroundImage = `url(/assets/sprites/characters/${rulerLook(world)}.png)`;
  const name = el('button', { type: 'button', className: 'realm-king__name', textContent: `${rulerTitle(world)}${k.name}` });
  const r = world.republic;
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
      el('p', { className: 'realm-king__meta', textContent: `ระบอบ${REGIMES[regimeOf(world)].name} · ${REGIMES[regimeOf(world)].text}` }),
      ...(regimeOf(world) === 'monarchy' && literacy(world) >= 0.35
        ? [el('p', { className: 'realm-king__meta', textContent: `รู้หนังสือ ${Math.round(literacy(world) * 100)}% · ผู้เรียกร้องการปฏิรูป ${reformers(world).length} คน (อวยพรคนที่อ่านออกและจิตใจดีเพื่อเพิ่ม หรือส่งนิมิตให้ผู้ปกครอง)` })]
        : []),
      el('p', { className: 'realm-king__meta', textContent: r ? `อายุ ${k.age} ปี · ดำรงตำแหน่งตั้งแต่ D${world.crown?.since ?? 0} · เลือกตั้งครั้งหน้าอีก ${Math.max(0, r.nextVote - world.day)} วัน` : regimeOf(world) === 'monarchy'
          ? `พระชนม์ ${k.age} พรรษา · ครองราชย์ตั้งแต่ D${world.crown?.since ?? 0}`
          : `อายุ ${k.age} ปี · ปกครองตั้งแต่ D${world.crown?.since ?? 0}` }),
      ...(r?.last ? [ballot(r.last.results, r.elections, r.last.day)] : []),
      el('p', { className: 'realm-king__meta', textContent: `นิสัย: ${k.traits.map((t) => TRAIT_TH[t]).join(' · ')}` }),
      el('div', { className: 'npc__chips' }, el('span', { className: `chip${tax === 'high' ? ' chip--danger' : tax === 'low' ? ' chip--gold' : ''}`, textContent: TAX_TH[tax] })),
    ),
  );
}

// The last election's count: one bar per candidate, the winner first.
function ballot(results: { name: string; votes: number }[], round: number, day: number): HTMLElement {
  const total = results.reduce((s, c) => s + c.votes, 0) || 1;
  return el(
    'div',
    { className: 'ballot' },
    el('small', { textContent: `ผลเลือกตั้งครั้งที่ ${round} (D${day})` }),
    ...results.map((c, i) => {
      const fill = el('i');
      fill.style.width = `${(c.votes / total) * 100}%`;
      return el('div', { className: `ballot__row${i === 0 ? ' ballot__row--won' : ''}` }, el('span', { textContent: c.name }), el('span', { className: 'ballot__bar' }, fill), el('b', { textContent: String(c.votes) }));
    }),
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
