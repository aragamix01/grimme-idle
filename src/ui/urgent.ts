import { approval, weatherOf, type WorldState } from '../sim';
import { DANGER_KINDS, EVENT_ICON, el, icon } from './icons';
import { localize } from './lexicon';

// เรื่องด่วน: what wants the god's eye right now (a choice in the life below, a war, a village
// asking for help, the dark gathering) as cards with a way straight to it, then the latest of
// the chronicle. The same cards, smaller, sit in the nav rail on wide screens.

export type Go = 'war' | 'threat' | 'lands' | 'market' | 'overview';
interface Handlers {
  onChoose: (key: string) => void;
  onGo: (where: Go, regionId?: number) => void;
}
interface Item {
  key: string;
  tone: 'danger' | 'plain';
  icon: string;
  title: string;
  text: string;
  acts: { label: string; gold?: boolean; run: () => void }[];
}

const panel = document.getElementById('urgent')!;
const rail = document.getElementById('rail-urgent')!;
const badge = document.getElementById('urgent-badge')!;
let handlers: Handlers;
let lastKey = '';

export function initUrgent(h: Handlers): void {
  handlers = h;
}

function items(world: WorldState): Item[] {
  const out: Item[] = [];
  const day = world.day;
  const c = world.choice;
  if (c)
    out.push({
      key: `choice:${c.day}`,
      tone: 'plain',
      icon: 'heart',
      title: 'ชีวิตของคุณ · ทางเลือก',
      text: c.text,
      acts: c.options.map((o, i) => ({ label: o.label, gold: i === 0, run: () => handlers.onChoose(o.key) })),
    });
  const war = world.war;
  const foe = war && world.realms?.find((r) => r.id === war.realmId);
  if (war && foe)
    out.push({
      key: `war:${war.realmId}`,
      tone: 'danger',
      icon: 'sword',
      title: `สงคราม! ${foe.name}`,
      text: `${war.attacker === 'them' ? 'ฝ่ายนั้นบุกก่อน' : 'เราเป็นฝ่ายบุก'} · ศึกถัดไปอีก ${Math.max(0, war.nextBattle - day)} วัน · ชนะ ${war.score >= 0 ? `+${war.score}` : war.score}`,
      acts: [{ label: 'ไปดู', run: () => handlers.onGo('war') }],
    });
  if (world.demon)
    out.push({
      key: 'demon',
      tone: 'danger',
      icon: 'skull',
      title: world.demon.stage === 'occupied' ? `${world.demon.name}ยึดเมืองไว้` : `${world.demon.name}ตื่นขึ้นแล้ว`,
      text: world.demon.stage === 'occupied' ? 'ชาวเมืองรอวันลุกขึ้นต่อต้าน' : `บุกเมืองแล้ว ${world.demon.sieges} ครั้ง · ต้องมีผู้กล้าไปปราบ`,
      acts: [{ label: 'ไปดู', run: () => handlers.onGo('threat') }],
    });
  if (world.dragon)
    out.push({
      key: 'dragon',
      tone: 'danger',
      icon: 'skull',
      title: `มังกร${world.dragon.name}เฝ้าเมือง`,
      text: `จะพ่นไฟใส่เมืองอีก ${Math.max(0, world.dragon.nextStrike - day)} วัน`,
      acts: [{ label: 'ไปดู', run: () => handlers.onGo('threat') }],
    });
  for (const r of world.regions ?? []) {
    const v = r.village;
    if (v?.plea && v.plea.until > day)
      out.push({
        key: `plea:${r.id}:${v.plea.until}`,
        tone: 'plain',
        icon: 'grain',
        title: `${r.name}ขอความช่วยเหลือ`,
        text: `${v.plea.text}${v.plea.gold ? ` · ขอ ${v.plea.gold} ทอง` : ''}`,
        acts: [{ label: 'หมู่บ้าน', run: () => handlers.onGo('lands', r.id) }],
      });
    else if (v && !v.free && r.owner === 'us' && v.loyalty < 30)
      out.push({
        key: `leave:${r.id}`,
        tone: 'plain',
        icon: 'banner',
        title: `${r.name}คิดแยกตัว`,
        text: `ภักดีต่อเมืองเหลือ ${Math.round(v.loyalty)}`,
        acts: [{ label: 'หมู่บ้าน', run: () => handlers.onGo('lands', r.id) }],
      });
  }
  const hungry = world.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2).length;
  if (hungry >= 3)
    out.push({ key: 'hunger', tone: 'plain', icon: 'grain', title: `ชาวเมืองหิวโหย ${hungry} คน`, text: 'ข้าวในตลาดไม่พอหรือแพงเกินไป', acts: [{ label: 'ตลาด', run: () => handlers.onGo('market') }] });
  const people = approval(world);
  if (people < 30)
    out.push({ key: 'unrest', tone: 'plain', icon: 'crown', title: 'ประชาชนไม่พอใจ', text: `ความพอใจ ${Math.round(people)} · อาจเกิดการลุกฮือ`, acts: [{ label: 'อำนาจ', run: () => handlers.onGo('overview') }] });
  const weather = weatherOf(world);
  if (weather === 'blight' || weather === 'drought' || weather === 'deluge')
    out.push({
      key: `weather:${weather}`,
      tone: 'plain',
      icon: weather === 'blight' ? 'blight' : weather === 'drought' ? 'sun' : 'rain',
      title: { blight: 'โรคพืชระบาด', drought: 'ภัยแล้ง', deluge: 'ฝนตกไม่หยุด' }[weather],
      text: `ทุ่งนาเสียหายอีก ${world.weather!.until - day} วัน`,
      acts: [{ label: 'ตลาด', run: () => handlers.onGo('market') }],
    });
  return out;
}

export const urgentCount = (world: WorldState) => items(world).length;

export function renderUrgent(world: WorldState, full: boolean): void {
  const list = items(world);
  const recent = world.chronicle.slice(-6).reverse();
  const key = JSON.stringify([full, list.map((i) => [i.key, i.title, i.text]), recent.map((e) => e.seq)]);
  badge.hidden = !list.length;
  badge.textContent = String(list.length);
  if (key === lastKey) return;
  lastKey = key;
  rail.replaceChildren(
    ...(list.length
      ? list.map((i) => {
          const b = el('button', { type: 'button', className: `rail-card${i.tone === 'danger' ? ' rail-card--danger' : ''}` }, el('b', { textContent: i.title }), el('span', { textContent: i.text }));
          b.onclick = () => i.acts[0]?.run();
          return b;
        })
      : [el('p', { className: 'rail-empty', textContent: 'ยังไม่มีเรื่องด่วน' })]),
  );
  if (full)
    panel.replaceChildren(
      ...(list.length ? list.map(card) : [el('p', { className: 'urgent-empty', textContent: 'ยังไม่มีเรื่องด่วน โลกยังสงบดี' })]),
      el('h3', { className: 'urgent-recent', textContent: 'ล่าสุด' }),
      el(
        'ol',
        { className: 'urgent-log' },
        ...recent.map((e) => el('li', { className: DANGER_KINDS.has(e.kind) ? 'urgent-log__row urgent-log__row--danger' : 'urgent-log__row' }, icon(EVENT_ICON[e.kind], 20), el('span', { textContent: e.text }), el('time', { textContent: `D${e.day}` }))),
      ),
    );
  localize(panel, world);
  localize(rail, world);
}

function card(i: Item): HTMLElement {
  const acts = i.acts.map((a) => {
    const b = el('button', { type: 'button', className: `btn${a.gold ? ' btn--gold' : ''}`, textContent: a.label });
    b.onclick = a.run;
    return b;
  });
  // A single way in sits beside the text; a choice puts its options in a row underneath.
  const wide = acts.length > 1 || i.key.startsWith('choice');
  return el(
    'article',
    { className: `urgent-card${i.tone === 'danger' ? ' urgent-card--danger' : ''}${wide ? ' urgent-card--choice' : ''}` },
    icon(i.icon, 32),
    el('div', { className: 'urgent-card__body' }, el('b', { textContent: i.title }), el('p', { textContent: i.text })),
    ...(wide ? [el('div', { className: 'urgent-card__acts' }, ...acts)] : acts),
  );
}
