import { stricken, AGES, REGIMES, realmAge, realmRegime, GOOD_TH, TERRAIN_TH, TRADE, TRAIT_TH, plagued, realmMiracleCost, realmMiracleReady, relationWord, type Realm, type RealmMiracle, type WorldState } from '../sim';
import { el, icon } from './icons';

// While the world map is up, the side panel lists every neighbour in full, so nobody has to
// hit a tiny keep on the map; tapping a keep (or a card) just picks that realm out.
const view = document.getElementById('realms')!;

interface Handlers {
  onMiracle: (realmId: number, kind: RealmMiracle) => void;
  onPick: (realmId: number) => void;
}
let handlers: Handlers;
let lastKey = '';
let picked: number | null = null;

export function initRealms(h: Handlers): void {
  handlers = h;
}

// The god's hand on a neighbour: a blessing they credit to our gods, or blight on their fields.
function miracles(world: WorldState, r: Realm): HTMLElement {
  const ready = realmMiracleReady(world, r);
  const btn = (kind: RealmMiracle, label: string, iconName: string) => {
    const cost = realmMiracleCost(world, kind);
    const b = el('button', { type: 'button', className: 'chip chip--button', disabled: !ready || world.faith < cost }, icon(iconName, 16), `${label} ${cost}`);
    b.onclick = (e) => {
      e.stopPropagation();
      handlers.onMiracle(r.id, kind);
    };
    return b;
  };
  return el('div', { className: 'realm-card__acts' }, btn('bless', 'บันดาลพร', 'bless'), btn('blight', 'บันดาลโรคพืช', 'blight'));
}

function card(world: WorldState, r: Realm): HTMLElement {
  const box = el(
    'article',
    { className: `realm-card${r.id === picked ? ' realm-card--picked' : ''}` },
    el('div', { className: 'realm-card__head' }, el('b', { textContent: r.name }), el('span', { className: 'chip', textContent: r.war ? 'สงคราม!' : r.pact ? 'พันธมิตร' : relationWord(r.relation) })),
    el('p', { className: 'realm-king__meta', textContent: `ดินแดน${TERRAIN_TH[r.terrain]} · ประชากร ${r.people}` }),
    el('p', { className: 'realm-king__meta', textContent: `${REGIMES[realmRegime(r)].name} · ${AGES[realmAge(r)].name}` }),
    el('p', { className: 'realm-king__meta', textContent: `${REGIMES[realmRegime(r)].ruler} ${r.ruler.name} (${r.ruler.age} ${realmRegime(r) === 'monarchy' ? 'พรรษา' : 'ปี'}) · ${r.ruler.traits.map((t) => TRAIT_TH[t]).join(' · ')}` }),
    el('p', { className: 'realm-king__meta', textContent: `กองทัพ ${r.army} · ท้องพระคลัง ${r.gold}` }),
    el('p', { className: 'realm-king__meta', textContent: `ขาย${GOOD_TH[TRADE[r.terrain].sells]} · ต้องการ${GOOD_TH[TRADE[r.terrain].wants]} · คาราวานไปแล้ว ${r.trades ?? 0} ครั้ง` }),
    ...(r.war ? [el('p', { className: 'realm-card__rel realm-card__rel--bad', textContent: 'กำลังทำสงครามกับเรา!' })] : []),
    ...(r.fallen ? [el('p', { className: 'realm-card__rel realm-card__rel--bad', textContent: 'ถูกจอมมารยึดครอง รอผู้กล้ามาปลดปล่อย' })] : []),
    ...(stricken(world, r) && !r.fallen ? [el('p', { className: 'realm-card__rel realm-card__rel--bad', textContent: `${({ drought: 'ภัยแล้ง', flood: 'น้ำท่วม', quake: 'แผ่นดินไหว' } as const)[r.disaster!.kind]} อีก ${r.disaster!.until - world.day} วันจะฟื้นตัว (บันดาลพรช่วยได้)` })] : []),
    ...(plagued(world, r) ? [el('p', { className: 'realm-card__rel realm-card__rel--bad', textContent: `โรคระบาดอีก ${r.plagueUntil! - world.day} วัน คาราวานเสี่ยงติดเชื้อ` })] : []),
    ...(r.fallen ? [] : [miracles(world, r)]),
    ...(r.pact || r.wed ? [el('p', { className: 'realm-king__meta', textContent: [r.pact ? 'พันธมิตรตามสนธิสัญญา' : '', r.wed ? `${r.wed}อภิเษกกับราชวงศ์นี้` : ''].filter(Boolean).join(' · ') })] : []),
    el('p', { className: `realm-card__rel${r.relation <= -15 ? ' realm-card__rel--bad' : r.relation >= 15 ? ' realm-card__rel--good' : ''}`, textContent: `ท่าทีต่อเรา: ${relationWord(r.relation)} (${r.relation > 0 ? '+' : ''}${r.relation})` }),
  );
  box.dataset.realm = String(r.id);
  box.onclick = () => handlers.onPick(r.id);
  return box;
}

export function renderRealms(world: WorldState): void {
  const realms = world.realms ?? [];
  const key = JSON.stringify([realms, Math.floor(world.faith), world.day, picked]);
  if (key === lastKey) return;
  lastKey = key;
  view.replaceChildren(
    el('p', { className: 'log-note', textContent: 'อาณาจักรเพื่อนบ้านทั้งหมด แตะปราสาทบนแผนที่หรือการ์ดเพื่อเลือก' }),
    ...realms.map((r) => card(world, r)),
  );
}

// Pick a realm out (from the map or the list) and bring its card into view.
export function pickRealm(world: WorldState, id: number | null): void {
  picked = id;
  lastKey = '';
  renderRealms(world);
  // At once, not smoothly: a page still gliding swallows the next tap on the map.
  if (id !== null) view.querySelector(`[data-realm="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}
