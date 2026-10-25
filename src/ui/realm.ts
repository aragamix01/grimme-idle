import { GOOD_TH, TERRAIN_TH, TRADE, TRAIT_TH, plagued, realmMiracleCost, realmMiracleReady, relationWord, type Realm, type RealmMiracle, type WorldState } from '../sim';
import { el, icon } from './icons';

const card = document.getElementById('realm-card')!;
let onMiracle: (realmId: number, kind: RealmMiracle) => void = () => {};

export function initRealmCard(handler: typeof onMiracle): void {
  onMiracle = handler;
}

// The god's hand on a neighbour: a blessing they credit to our gods, or blight on their fields.
function miracles(world: WorldState, r: Realm): HTMLElement {
  const ready = realmMiracleReady(world, r);
  const btn = (kind: RealmMiracle, label: string, iconName: string) => {
    const cost = realmMiracleCost(world, kind);
    const b = el('button', { type: 'button', className: 'chip chip--button', disabled: !ready || world.faith < cost }, icon(iconName, 16), `${label} ${cost}`);
    b.onclick = () => onMiracle(r.id, kind);
    return b;
  };
  return el('div', { className: 'realm-card__acts' }, btn('bless', 'บันดาลพร', 'bless'), btn('blight', 'บันดาลโรคพืช', 'blight'));
}

// A neighbour's details, shown over the world map when their keep is tapped.
export function renderRealmCard(realm: Realm | null, world: WorldState | null): void {
  const r = realm && world?.realms?.find((x) => x.id === realm.id);
  card.hidden = !r;
  if (!r) return;
  const close = el('button', { type: 'button', className: 'npc__bar-close', textContent: '×', title: 'ปิด' });
  close.onclick = () => (card.hidden = true);
  card.replaceChildren(
    el('div', { className: 'realm-card__head' }, el('b', { textContent: r.name }), close),
    el('p', { className: 'realm-king__meta', textContent: `ดินแดน${TERRAIN_TH[r.terrain]} · ประชากร ${r.people}` }),
    el('p', { className: 'realm-king__meta', textContent: `ผู้ปกครอง ${r.ruler.name} (${r.ruler.age} พรรษา) · ${r.ruler.traits.map((t) => TRAIT_TH[t]).join(' · ')}` }),
    el('p', { className: 'realm-king__meta', textContent: `กองทัพ ${r.army} · ท้องพระคลัง ${r.gold}` }),
    el('p', { className: 'realm-king__meta', textContent: `ขาย${GOOD_TH[TRADE[r.terrain].sells]} · ต้องการ${GOOD_TH[TRADE[r.terrain].wants]} · คาราวานไปแล้ว ${r.trades ?? 0} ครั้ง` }),
    ...(r.war ? [el('p', { className: 'realm-card__rel realm-card__rel--bad', textContent: 'กำลังทำสงครามกับเรา!' })] : []),
    ...(r.fallen ? [el('p', { className: 'realm-card__rel realm-card__rel--bad', textContent: 'ถูกจอมมารยึดครอง รอผู้กล้ามาปลดปล่อย' })] : []),
    ...(plagued(world!, r) ? [el('p', { className: 'realm-card__rel realm-card__rel--bad', textContent: `โรคระบาดอีก ${r.plagueUntil! - world!.day} วัน คาราวานเสี่ยงติดเชื้อ` })] : []),
    ...(r.fallen ? [] : [miracles(world!, r)]),
    ...(r.pact || r.wed ? [el('p', { className: 'realm-king__meta', textContent: [r.pact ? 'พันธมิตรตามสนธิสัญญา' : '', r.wed ? `${r.wed}อภิเษกกับราชวงศ์นี้` : ''].filter(Boolean).join(' · ') })] : []),
    el('p', { className: `realm-card__rel${r.relation <= -15 ? ' realm-card__rel--bad' : r.relation >= 15 ? ' realm-card__rel--good' : ''}`, textContent: `ท่าทีต่อเรา: ${relationWord(r.relation)} (${r.relation > 0 ? '+' : ''}${r.relation})` }),
  );
}
