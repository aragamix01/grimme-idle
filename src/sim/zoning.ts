// The town plan (ผังเมือง): once the settlement is a town, whoever governs it sets aside the ground
// round it in zones, block by block (CELL x CELL tiles): trade round the square, homes about it, the
// works on one side away from the homes (downwind, toward the railway), green ground kept open for
// parks, and the farms beyond. The plan follows the platform the town is governed by (rulingIdeology):
// a free-trade government widens the market streets, labour gives the works and the parks more room,
// the faithful keep gardens by the church, the old order its parks by the castle. A new government of
// another mind draws a new plan, but not more than once in REDRAW days.
//
// The plan does not forbid anything but building on green ground: whoever picks a spot (landplan.ts
// findSpot) does better in its own zone and worse out of it. Mills inside the works zone keep their
// smoke off the homes (industry.ts smog). What already stands where the plan says otherwise is left
// standing (offPlan): the plan and the town do not always agree.
import { log } from './core';
import { MAP_H, MAP_W, ROCK, WATER, tileHash, type Spot } from './terrain';
import { wildsOf } from './wilds';
import { TOWN_RANK, rankOf } from './growth';
import { lotXY, townLayout } from './town';
import { QUARTER_R, heartOf, landFree, plotDoor } from './landplan';
import { IDEOLOGY_TH, governor, hasParliament, rulingIdeology } from './parties';
import type { Ideology, WorldState } from './types';
import { CELL, ZH, ZW } from './zones';
export * from './zones';

const PLAN_DAY = 25; // day of the month the government looks at its plan
const REDRAW = 5 * 360; // days a plan stands before a government of another mind redraws it
const HOME_R = 21; // how far out the homes go, as tiles from the square
const WORKS_IN = 11; // the works zone starts this far out...
const WORKS_OUT = 28; // ...and ends here
const FARM_OUT = 40;

// What each platform makes of the town.
export const PLAN: Record<Ideology, { trade: number; arc: number; greens: number; near?: 'castle' | 'church'; text: string }> = {
  trade: { trade: 9, arc: 50, greens: 2, text: 'ถนนการค้ากว้างรอบลานกลาง ให้ตลาดเติบโต' },
  labour: { trade: 6, arc: 80, greens: 4, text: 'เขตโรงงานกว้าง สวนสาธารณะมากให้คนทำงานได้พักผ่อน' },
  nation: { trade: 6, arc: 60, greens: 2, text: 'เขตโรงงานผลิตอาวุธ ถนนตรงไว้เดินทัพ' },
  faith: { trade: 6, arc: 40, greens: 3, near: 'church', text: 'สวนรอบโบสถ์ โรงงานอยู่ไกลแค่มุมเดียว' },
  old: { trade: 7, arc: 40, greens: 3, near: 'castle', text: 'สวนของผู้ดีใกล้ปราสาท โรงงานอยู่ไกลแค่มุมเดียว' },
};

// The plan a government of this mind draws for the town as it stands.
export function drawPlan(world: WorldState, ideo: Ideology): string {
  const t = wildsOf(world);
  const s = t.site;
  const p = PLAN[ideo];
  const dist = (q: Spot) => Math.hypot(q.x - s.x, (q.y - s.y) * 1.2);
  const half = (p.arc / 2) * (Math.PI / 180);
  const inWedge = (a: number, q: Spot) => {
    const d = Math.abs(Math.atan2(q.y - s.y, q.x - s.x) - a);
    return Math.min(d, Math.PI * 2 - d) <= half;
  };
  // The works go where the fewest homes are, toward the railway and the mills already standing.
  const homes = (world.homes ?? []).map((h) => ({ x: lotXY(h.lot).x + 1, y: lotXY(h.lot).y + 1 }));
  const mills = (world.mills ?? []).map((m) => lotXY(m.plot));
  const station = plotDoor(world, 'station');
  let side = 0;
  let best = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    let score = tileHash(world.seed, k, 7, 55) * 2;
    for (const h of homes) if (dist(h) >= 8 && inWedge(a, h)) score += 3;
    for (const m of mills) if (inWedge(a, m)) score -= 6;
    if (station && inWedge(a, station)) score -= 8;
    // Not into the river or the rocks.
    for (const r of [14, 20, 26]) {
      const x = Math.round(s.x + Math.cos(a) * r);
      const y = Math.round(s.y + Math.sin(a) * r * 0.8);
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) score += 4;
      else if (t.cover[y * MAP_W + x] === WATER || t.cover[y * MAP_W + x] === ROCK) score += 2;
    }
    if (score < best) {
      best = score;
      side = a;
    }
  }
  const hearts = (world.districts ?? []).map(heartOf);
  const fields = (world.parcels ?? []).filter((q) => q.kind === 'field' || q.kind === 'pasture').map((q) => ({ x: q.x + (q.w >> 1), y: q.y + (q.h >> 1) }));
  const cells: string[] = [];
  for (let cy = 0; cy < ZH; cy++)
    for (let cx = 0; cx < ZW; cx++) {
      const c = { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
      let wild = 0;
      for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) if (t.cover[y * MAP_W + x] === WATER || t.cover[y * MAP_W + x] === ROCK) wild++;
      const d = dist(c);
      const tilled = fields.some((f) => Math.floor(f.x / CELL) === cx && Math.floor(f.y / CELL) === cy);
      let z = '.';
      if (wild >= (CELL * CELL) / 2) z = '.';
      else if (d <= p.trade) z = 't';
      else if (d >= WORKS_IN && d <= WORKS_OUT && inWedge(side, c)) z = 'w';
      else if (hearts.some((h) => Math.hypot(h.x - c.x, h.y - c.y) <= QUARTER_R)) z = 'h';
      else if (tilled && d > p.trade + 4) z = 'f';
      else if (d <= HOME_R) z = 'h';
      else if (d <= FARM_OUT) z = 'f';
      cells.push(z);
    }
  // Green ground: under the parks and the grand square, then more, spread among the homes.
  const cellOf = (q: Spot) => Math.floor(q.y / CELL) * ZW + Math.floor(q.x / CELL);
  const greens: number[] = [];
  const keep = (i: number) => {
    cells[i] = 'g';
    greens.push(i);
  };
  for (const lot of world.parks ?? []) keep(cellOf({ x: lotXY(lot).x + 1, y: lotXY(lot).y + 1 }));
  const sq = world.plots?.plaza;
  if (sq) keep(cellOf({ x: sq.x + 1, y: sq.y + 1 }));
  const near = p.near ? plotDoor(world, p.near) : undefined;
  // Green ground goes only where a park still fits (3x3 of open ground, mostly clear about it), and
  // among those, the emptiest.
  const free = landFree(world);
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && free(y * MAP_W + x);
  const ground = townLayout(world).ground;
  const passable = (x: number, y: number) => open(x, y) || (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && ['road', 'paved', 'trail'].includes(ground[y * MAP_W + x]));
  const fits = (i: number) => {
    const bx = (i % ZW) * CELL;
    const by = Math.floor(i / ZW) * CELL;
    for (let y0 = by - 1; y0 <= by + 2; y0++)
      for (let x0 = bx - 1; x0 <= bx + 2; x0++) {
        let ok = true;
        for (let y = y0; y < y0 + 3 && ok; y++) for (let x = x0; x < x0 + 3; x++) if (!open(x, y)) ok = false;
        if (!ok) continue;
        let round = 0; // the ring round it: open ground or a street, nothing built
        for (let y = y0 - 1; y <= y0 + 3; y++) for (let x = x0 - 1; x <= x0 + 3; x++) if ((y === y0 - 1 || y === y0 + 3 || x === x0 - 1 || x === x0 + 3) && passable(x, y)) round++;
        if (round === 16) return true;
      }
    return false;
  };
  const built = (i: number) => {
    let n = 0;
    for (let y = Math.floor(i / ZW) * CELL; y < (Math.floor(i / ZW) + 1) * CELL; y++) for (let x = (i % ZW) * CELL; x < ((i % ZW) + 1) * CELL; x++) n += open(x, y) ? 0 : 1;
    return n;
  };
  for (let n = 0; n < p.greens; n++) {
    let pick = -1;
    let score = Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 'h') continue;
      const c = { x: (i % ZW) * CELL + CELL / 2, y: Math.floor(i / ZW) * CELL + CELL / 2 };
      const d = dist(c);
      if (d < 5 || d > 17 || !fits(i)) continue;
      const apart = greens.length ? Math.min(...greens.map((g) => Math.hypot((g % ZW) - (i % ZW), Math.floor(g / ZW) - Math.floor(i / ZW)))) : 4;
      let sc = -Math.min(apart, 5) * 2 + built(i) + tileHash(world.seed, i, n, 56);
      if (near && n === 0) sc += Math.hypot(c.x - near.x, c.y - near.y) * 0.8;
      if (sc < score) {
        score = sc;
        pick = i;
      }
    }
    if (pick < 0) break;
    keep(pick);
  }
  return cells.join('');
}

// Monthly: a town without a plan gets one; a government of another mind redraws it, now and then.
export function zoningDay(world: WorldState): void {
  if (world.day % 30 !== PLAN_DAY) return;
  if (rankOf(world) < TOWN_RANK) return;
  const head = governor(world);
  if (!head) return;
  const ideo = rulingIdeology(world) ?? 'old';
  const z = world.zoning;
  if (z && (z.by === ideo || world.day - z.since < REDRAW)) return;
  world.zoning = { cells: drawPlan(world, ideo), since: world.day, by: ideo };
  world.buildRev = (world.buildRev ?? 0) + 1;
  const who = hasParliament(world) ? 'รัฐบาลเสนอและสภาลงมติรับ' : `${head.name}ประกาศใช้`;
  const what = z ? `ผังเมืองฉบับใหม่ตามนโยบาย${IDEOLOGY_TH[ideo].name}` : 'ผังเมืองฉบับแรก';
  log(world, 'politics', `${who}${what}: ${PLAN[ideo].text} ที่ดินแต่ละส่วนถูกกันไว้ให้บ้าน ร้านค้า โรงงาน สวน และนา`, head.id);
}

