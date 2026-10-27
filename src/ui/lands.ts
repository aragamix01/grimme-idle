import { LAIR_TH, DECREES, decreeActive, garrisoned, EDGE_TH, LAND_TH, MAX_LEVEL, TRAIT_TH, USES, USE_TH, VILLAGER_TH, WORK_TH, bestUse, chiefOf, devCost, folkOf, jobName, keepOf, labour, levelOf, needOf, ourLands, priceOf, villagers, workersOf, yieldOf, type Npc, type Region, type WorldState } from '../sim';
import { el, icon } from './icons';

// The lands tab on the world map: what we hold and what it yields, the region picked on the
// map in full (its kind, its owner, the edge it gives, each use and its level, its village and
// headman), a way in to see the region up close, and whichever villager was tapped there.
const view = document.getElementById('lands')!;

interface Handlers {
  onPick: (regionId: number) => void;
  onView: (regionId: number | null) => void; // null: back to the world map
}
let handlers: Handlers;
let lastKey = '';
let picked: number | null = null;
let viewing: number | null = null;
let villager: number | null = null;

export function initLands(h: Handlers): void {
  handlers = h;
}

const ownerName = (world: WorldState, r: Region) =>
  r.owner === 'us' ? 'อาณาจักรของเรา' : r.owner === undefined ? 'ดินแดนไร้เจ้าของ' : (world.realms?.find((x) => x.id === r.owner)?.name ?? 'แคว้นที่ล่มสลาย');

const yieldText = (y: ReturnType<typeof yieldOf>) =>
  [y.grain && `ข้าว ${y.grain}`, y.meat && `เนื้อ ${y.meat}`, y.wool && `ขนแกะ ${y.wool}`, y.timber && `ไม้ ${y.timber}`, y.ore && `แร่ ${y.ore}`, y.gold && `ทอง ${y.gold}`].filter(Boolean).join(' · ') || 'ยังไม่มีผลผลิต';

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
          ...(r.danger ? [el('p', { className: 'realm-king__meta land-plea', textContent: `${LAIR_TH(r)} · อันตราย ${r.danger} · ต้องให้นักผจญภัยกวาดล้างก่อนจึงบุกเบิกได้` })] : []),
          ...(r.seat ? [] : village(world, r)),
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

// The village on a land: its hands against the work, its headman and his mind, what it asks and has built.
function village(world: WorldState, r: Region): HTMLElement[] {
  const folk = folkOf(world, r);
  const v = r.village;
  if (!folk.length) return [el('p', { className: 'realm-king__meta', textContent: isOursOrFree(r) ? 'ยังไม่มีคนอยู่ ทางการจะส่งครอบครัวจากเมืองไปบุกเบิก' : 'ไม่มีหมู่บ้าน' })];
  const chief = chiefOf(world, r);
  // The village at a glance: its people, its hands against the work, and its loyalty, as tiles.
  const tile = (label: string, value: string, bad = false, fill?: number) => {
    const t = el('div', { className: `k-tile${bad ? ' k-tile--bad' : ''}` }, el('span', { textContent: label }), el('b', { textContent: value }));
    if (fill !== undefined) {
      const bar = el('span', { className: 'k-tile__bar' });
      bar.style.background = `linear-gradient(90deg, ${bad ? 'var(--danger)' : 'var(--meadow-deep)'} 0 ${fill}%, var(--paper-edge) ${fill}% 100%)`;
      t.append(bar);
    }
    return t;
  };
  const label = r.owner === 'us' ? 'ภักดี' : v?.free ? 'อยากกลับมา' : 'พอใจเจ้าของ';
  const out: HTMLElement[] = [
    el(
      'div',
      { className: 'k-tiles' },
      tile('ชาวบ้าน', String(folk.length)),
      r.owner === 'us' ? tile('คนงาน', `${workersOf(world, r).length}/${needOf(r)}`, labour(world, r) < 0.5) : tile('สิ่งก่อสร้าง', String(v?.works?.length ?? 0)),
      ...(v ? [tile(label, String(Math.round(v.loyalty)), v.loyalty < 30, Math.round(v.loyalty))] : []),
    ),
  ];
  if (r.owner === 'us') out.push(el('p', { className: 'realm-king__meta', textContent: `ทำงานได้ ${Math.round(labour(world, r) * 100)}% · ส่งส่วยให้เมืองหลวง ${Math.round((1 - keepOf(world, r)) * 100)}%` }));
  if (chief) out.push(el('p', { className: 'land-chief' }, icon('crown', 16), el('span', {}, 'ผู้ใหญ่บ้าน ', el('b', { textContent: chief.name }), ` (${chief.age} ปี)`), el('span', { className: 'chip', textContent: chief.traits.map((t) => TRAIT_TH[t]).join(' · ') })));
  if (v) {
    if (v.thought) out.push(el('p', { className: 'land-thought', textContent: `“${v.thought}”` }));
    if (v.plea) out.push(el('p', { className: 'realm-king__meta land-plea', textContent: `คำร้อง: ${v.plea.text}` }));
    // What the law is doing to them right now.
    const laws = r.owner === 'us' ? (['colonize', 'tribute', 'relief', 'expand'] as const).filter((d) => decreeActive(world, d)).map((d) => DECREES[d].name) : [];
    if (r.owner === 'us' && garrisoned(world, r)) laws.push(`มีทหารประจำการอีก ${v.garrison! - world.day} วัน`);
    if (laws.length) out.push(el('p', { className: 'realm-king__meta land-law', textContent: `ใต้คำสั่ง: ${laws.join(' · ')}` }));
    out.push(el('p', { className: 'realm-king__meta', textContent: `สิ่งก่อสร้าง: ${(v.works ?? []).map((w) => WORK_TH[w]).join(' · ') || 'ยังไม่มี'} · กองกลาง ${v.purse} ทอง` }));
  }
  const list = el('div', { className: 'land-folk' });
  for (const n of [...folk].sort((a, b) => (b.id === chief?.id ? 1 : 0) - (a.id === chief?.id ? 1 : 0) || b.age - a.age)) {
    const b = el('button', { type: 'button', className: `chip${n.id === villager ? ' chip--on' : ''}`, textContent: n.name });
    b.onclick = (e) => {
      e.stopPropagation();
      pickVillager(world, n.id);
    };
    list.append(b);
  }
  out.push(list);
  const who = folk.find((n) => n.id === villager);
  if (who) out.push(person(world, r, who));
  return out;
}
const isOursOrFree = (r: Region) => r.owner === 'us' || !!r.village?.free;

// A villager in brief: who they are, what they do, and their family on the land.
function person(world: WorldState, r: Region, n: Npc): HTMLElement {
  const all = villagers(world);
  const spouse = all.find((o) => o.id === n.spouseId && o.alive);
  const kids = all.filter((o) => o.alive && o.parentIds?.includes(n.id));
  const role = n.id === r.village?.chiefId ? 'ผู้ใหญ่บ้าน' : n.age < 16 ? 'เด็ก' : (VILLAGER_TH[n.job] ?? jobName(world, n.job));
  return el(
    'div',
    { className: 'land-person' },
    el('b', { textContent: `${n.name} · ${role}` }),
    el('p', { className: 'realm-king__meta', textContent: `อายุ ${n.age} ปี · นิสัย ${n.traits.map((t) => TRAIT_TH[t]).join(' · ')} · ทอง ${n.gold}` }),
    el('p', { className: 'realm-king__meta', textContent: [spouse && `คู่ครอง: ${spouse.name}`, kids.length && `ลูก: ${kids.map((k) => k.name).join(', ')}`].filter(Boolean).join(' · ') || 'ยังไม่มีครอบครัว' }),
  );
}

export function renderLands(world: WorldState): void {
  const regions = world.regions ?? [];
  const pickedRegion = regions.find((r) => r.id === picked);
  const folk = pickedRegion ? folkOf(world, pickedRegion).map((n) => [n.id, n.age, n.gold, n.spouseId, n.job]) : [];
  const key = JSON.stringify([regions, world.realms?.map((r) => r.name), picked, viewing, villager, folk]);
  if (key === lastKey) return;
  lastKey = key;
  const ours = ourLands(world).filter((r) => !r.seat);
  const total = ours.map(yieldOf).reduce((s, y) => ({ grain: s.grain + y.grain, meat: s.meat + y.meat, wool: s.wool + y.wool, gold: s.gold + y.gold, timber: s.timber + y.timber, ore: s.ore + y.ore }), { grain: 0, meat: 0, wool: 0, gold: 0, timber: 0, ore: 0 });
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

export function pickVillager(world: WorldState, id: number | null): void {
  villager = id;
  lastKey = '';
  renderLands(world);
}

export function viewLand(world: WorldState, id: number | null): void {
  viewing = id;
  lastKey = '';
  renderLands(world);
}
