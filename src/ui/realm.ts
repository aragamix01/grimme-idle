import { GOOD_TH, TERRAIN_TH, TRADE, TRAIT_TH, relationWord, type Realm, type WorldState } from '../sim';
import { el } from './icons';

const card = document.getElementById('realm-card')!;

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
    ...(r.pact || r.wed ? [el('p', { className: 'realm-king__meta', textContent: [r.pact ? 'พันธมิตรตามสนธิสัญญา' : '', r.wed ? `${r.wed}อภิเษกกับราชวงศ์นี้` : ''].filter(Boolean).join(' · ') })] : []),
    el('p', { className: `realm-card__rel${r.relation <= -15 ? ' realm-card__rel--bad' : r.relation >= 15 ? ' realm-card__rel--good' : ''}`, textContent: `ท่าทีต่อเรา: ${relationWord(r.relation)} (${r.relation > 0 ? '+' : ''}${r.relation})` }),
  );
}
