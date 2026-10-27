import { EDGE_TH, LAND_TH, MAX_LEVEL, USES, USE_TH, bestUse, devCost, levelOf, ourLands, priceOf, yieldOf, type Region, type WorldState } from '../sim';
import { el } from './icons';

// The lands tab on the world map: what we hold and what it yields, the region picked on the
// map in full (its kind, its owner, the edge it gives, each use and its level), and a way in
// to see the region up close.
const view = document.getElementById('lands')!;

interface Handlers {
  onPick: (regionId: number) => void;
  onView: (regionId: number | null) => void; // null: back to the world map
}
let handlers: Handlers;
let lastKey = '';
let picked: number | null = null;
let viewing: number | null = null;

export function initLands(h: Handlers): void {
  handlers = h;
}

const ownerName = (world: WorldState, r: Region) =>
  r.owner === 'us' ? 'อาณาจักรของเรา' : r.owner === undefined ? 'ดินแดนไร้เจ้าของ' : (world.realms?.find((x) => x.id === r.owner)?.name ?? 'แคว้นที่ล่มสลาย');

const yieldText = (y: ReturnType<typeof yieldOf>) =>
  [y.grain && `ข้าว ${y.grain}`, y.meat && `เนื้อ ${y.meat}`, y.wool && `ขนแกะ ${y.wool}`, y.gold && `ทอง ${y.gold}`].filter(Boolean).join(' · ') || 'ยังไม่มีผลผลิต';

// A use's level as filled and empty pips.
const pips = (l: number) => '■'.repeat(l) + '□'.repeat(MAX_LEVEL - l);

function card(world: WorldState, r: Region, full: boolean): HTMLElement {
  const uses = USES[r.kind].map((u) =>
    el(
      'li',
      { className: 'land-use' },
      el('span', { textContent: `${USE_TH[u]}${u === bestUse(r) ? ' ★' : ''}` }),
      el('span', { className: 'land-use__pips', textContent: pips(levelOf(r, u)) }),
      el('span', { className: 'land-use__next', textContent: levelOf(r, u) >= MAX_LEVEL ? 'เต็มแล้ว' : `ขั้นต่อไป ${devCost(r, u)} ทอง` }),
    ),
  );
  const box = el(
    'article',
    { className: `realm-card${r.id === picked ? ' realm-card--picked' : ''}` },
    el('div', { className: 'realm-card__head' }, el('b', { textContent: r.name }), el('span', { className: 'chip', textContent: LAND_TH[r.kind] })),
    el('p', { className: 'realm-king__meta', textContent: `เจ้าของ: ${ownerName(world, r)}${r.seat ? ' (แดนหลวง)' : ''}` }),
    ...(full
      ? [
          el('p', { className: 'realm-king__meta', textContent: `บัฟ: ${EDGE_TH[r.kind]}` }),
          ...(r.seat ? [] : [el('ul', { className: 'land-uses' }, ...uses)]),
          ...(r.seat ? [] : [el('p', { className: 'realm-king__meta', textContent: `ผลผลิตต่อเดือน: ${yieldText(yieldOf(r))}` })]),
          ...(r.seat ? [] : [el('p', { className: 'realm-king__meta', textContent: `มูลค่าที่ดิน ${priceOf(r)} ทอง` })]),
        ]
      : [el('p', { className: 'realm-king__meta', textContent: USES[r.kind].map((u) => `${USE_TH[u]} ${pips(levelOf(r, u))}`).join(' · ') })]),
  );
  if (full) {
    const look = el('button', { type: 'button', className: 'btn', textContent: viewing === r.id ? 'กลับแผนที่โลก' : 'ดูพื้นที่' });
    look.onclick = (e) => {
      e.stopPropagation();
      handlers.onView(viewing === r.id ? null : r.id);
    };
    box.append(look);
  }
  box.onclick = () => handlers.onPick(r.id);
  return box;
}

export function renderLands(world: WorldState): void {
  const regions = world.regions ?? [];
  const key = JSON.stringify([regions, world.realms?.map((r) => r.name), picked, viewing]);
  if (key === lastKey) return;
  lastKey = key;
  const ours = ourLands(world).filter((r) => !r.seat);
  const total = ours.map(yieldOf).reduce((s, y) => ({ grain: s.grain + y.grain, meat: s.meat + y.meat, wool: s.wool + y.wool, gold: s.gold + y.gold }), { grain: 0, meat: 0, wool: 0, gold: 0 });
  const pick = regions.find((r) => r.id === picked);
  view.replaceChildren(
    el('p', { className: 'log-note', textContent: 'แตะพื้นที่บนแผนที่เพื่อดูรายละเอียด ทางการจะบุกเบิก ซื้อ เจรจา หรือรบเพื่อขยายดินแดนเอง' }),
    ...(pick ? [card(world, pick, true)] : []),
    el('h4', { textContent: `ดินแดนของเรา ${ours.length} เขต` }),
    el('p', { className: 'realm-king__meta', textContent: `ผลผลิตรวมต่อเดือน: ${yieldText(total)}` }),
    ...ours.filter((r) => r.id !== picked).map((r) => card(world, r, false)),
  );
}

export function pickLand(world: WorldState, id: number | null): void {
  picked = id;
  lastKey = '';
  renderLands(world);
}

export function viewLand(world: WorldState, id: number | null): void {
  viewing = id;
  lastKey = '';
  renderLands(world);
}
