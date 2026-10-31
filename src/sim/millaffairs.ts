// The steam age's troubles, as happenings decided like any other (they join DEFS in
// happenings.ts): a fire in a mill, the union calling the hands out on strike, a factory act put
// before the government, a mine caving in out on the lands, and a fallen noble house selling its
// manor to a mill owner.
import { chance, int, pick, type Rng } from './rng';
import { clamp, kill, legend, log, loyaltyNudge } from './core';
import { king, payrollReserve } from './society';
import { ensureCrown } from './politics';
import { amend } from './charter';
import { levelOf } from './market';
import { governor } from './parties';
import { houses } from './tradehouses';
import { handsOf, millsOf, ownerName, protectedLabour, wageOf, workers } from './industry';
import { folkOf } from './villages';
import type { Def } from './happenings';
import type { Happening, Mill, Npc, WorldState } from './types';

// What a matter comes to when what it was about is gone by the time it is decided (a house
// closed, a realm fallen, the adventurer dead in the dungeon).
const GONE = 'เรื่องนี้จบไปเองก่อนจะได้ตัดสิน เพราะสิ่งที่เป็นต้นเรื่องไม่อยู่แล้ว';
const adults = (w: WorldState) => w.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);
const ofJob = (w: WorldState, job: Npc['job']) => adults(w).filter((n) => n.job === job);
const ruler = (w: WorldState) => king(w) ?? ofJob(w, 'noble').sort((a, b) => b.age - a.age)[0];
const byId = (w: WorldState, id?: number) => (id === undefined ? undefined : w.npcs.find((n) => n.id === id && n.alive));
const nudgeAll = (ns: Npc[], by: number) => ns.forEach((n) => loyaltyNudge(n, by));
const lvl = (w: WorldState) => levelOf(w);
const spare = (w: WorldState) => w.treasury - payrollReserve(w);
const running = (w: WorldState) => millsOf(w).filter((m) => w.day >= m.ready);
const millOf = (w: WorldState, h: Happening) => millsOf(w).find((m) => m.id === h.ctx);
// Who answers for a mill: the head of the house that owns it, or the ruler for the crown's.
const ownerHead = (w: WorldState, m: Mill) => (m.owner === 'crown' ? ruler(w) : byId(w, w.guilds.find((g) => g.id === m.owner)?.leaderId) ?? ruler(w));
const bigOwner = (w: WorldState) => {
  const counts = new Map<Mill['owner'], number>();
  for (const m of running(w)) counts.set(m.owner, (counts.get(m.owner) ?? 0) + handsOf(w, m).length);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const mineRegions = (w: WorldState) => (w.regions ?? []).filter((r) => r.owner === 'us' && (r.dev?.mine ?? 0) >= 1 && folkOf(w, r).length > 0);

export const MILL_AFFAIRS = {
  millfire: {
    title: 'ไฟไหม้โรงงาน',
    mtth: 720,
    gap: 720,
    can: (w) => running(w).some((m) => handsOf(w, m).length >= 2),
    sooner: (w) => (protectedLabour(w) ? 0.5 : 1.2), // the factory acts brought fire doors and fewer dropped lamps
    decider: (w) => {
      const m = running(w).find((x) => handsOf(w, x).length >= 2);
      return m && ownerHead(w, m);
    },
    ctx: (w) => running(w).find((x) => handsOf(w, x).length >= 2)?.id,
    text: (w, h) => {
      const m = millOf(w, h);
      return `ไฟลุกจากเตาใน${m?.name ?? 'โรงงาน'}ของ${m ? ownerName(w, m) : ''} ลามไปทั้งโรงก่อนดับได้ กรรมกรติดอยู่ข้างใน ชาวเมืองถามว่าใครต้องรับผิดชอบ`;
    },
    options: [
      {
        key: 'rebuild',
        label: 'สร้างใหม่พร้อมประตูหนีไฟ และจ่ายเงินให้ครอบครัวผู้ตาย',
        likes: { kind: 2.5, loyal: 1.3, greedy: 0.4 },
        act: (w, rng, h) => burn(w, rng, h, 'rebuild'),
      },
      {
        key: 'blame',
        label: 'โทษว่ากรรมกรประมาท',
        likes: { greedy: 2.5, vengeful: 1.5, kind: 0.3 },
        act: (w, rng, h) => burn(w, rng, h, 'blame'),
      },
    ],
  },
  millstrike: {
    title: 'กรรมกรนัดหยุดงาน',
    mtth: 360,
    gap: 540,
    can: (w) => !!w.union && workers(w).length >= 6 && levelOf(w) >= 1.1 && !!bigOwner(w),
    sooner: (w) => (levelOf(w) >= 1.4 ? 2 : 1) * (protectedLabour(w) ? 0.5 : 1), // wages that buy less and less
    decider: (w) => {
      const o = bigOwner(w);
      const m = running(w).find((x) => x.owner === o);
      return m && ownerHead(w, m);
    },
    text: (w) => `${w.union!.name}นำกรรมกร ${workers(w).length} คนหยุดเครื่องจักร เรียกร้องค่าแรงเพิ่มจากเดือนละ ${wageOf(w)} ทอง เพราะข้าวของแพงขึ้นทุกเดือน`,
    options: [
      {
        key: 'raise',
        label: 'ขึ้นค่าแรงให้',
        likes: { kind: 2.5, coward: 1.5, greedy: 0.4 },
        act: (w) => {
          w.union!.raises++;
          nudgeAll(workers(w), 8);
          return `โรงงานยอมขึ้นค่าแรงเป็นเดือนละ ${wageOf(w)} ทอง กรรมกรกลับเข้ากะ สหภาพได้ใจ`;
        },
      },
      {
        key: 'lockout',
        label: 'ปิดโรงงาน ไล่คนงานที่หยุดงานออก',
        likes: { greedy: 2.5, vengeful: 1.8, kind: 0.3 },
        act: (w) => {
          const hands = workers(w);
          const fired = hands.filter((_, i) => i % 2 === 0);
          for (const n of fired) Object.assign(n, { job: 'farmer', millId: undefined, plan: undefined });
          nudgeAll(hands, -12);
          ensureCrown(w).unrest += 3;
          return `เจ้าของโรงงานปิดประตูเหล็ก ไล่กรรมกร ${fired.length} คนกลับไปทำนา ที่เหลือกลับเข้ากะอย่างแค้นเคือง`;
        },
      },
      {
        key: 'troops',
        label: 'ขอให้ทหารมาสลายการชุมนุม',
        likes: { vengeful: 2.5, brave: 1.3, kind: 0.2, coward: 0.6 },
        can: (w) => ofJob(w, 'soldier').length >= 2,
        act: (w, rng) => {
          const hands = workers(w);
          const leader = byId(w, w.union?.leaderId);
          let dead = 0;
          for (const n of hands) if (chance(rng, 0.12) && n !== leader) {
            kill(w, n, 'ถูกทหารยิงระหว่างการนัดหยุดงาน');
            dead++;
          }
          if (leader) leader.jailedUntil = w.day + 180;
          nudgeAll(adults(w).filter((n) => n.job === 'worker' || n.job === 'farmer'), -8);
          ensureCrown(w).unrest += 4 + dead * 2;
          if (dead) legend(w, `การนัดหยุดงานนองเลือดที่โรงงาน`);
          return `ทหารบุกสลายการชุมนุม${dead ? ` กรรมกรตาย ${dead} คน` : ''}${leader ? ` ${leader.name}ผู้นำสหภาพถูกจับขังคุก` : ''} เครื่องจักรกลับมาเดิน แต่ทั้งเมืองโกรธแค้น`;
        },
      },
    ],
  },
  factoryact: {
    title: 'ร่างพระราชบัญญัติโรงงาน',
    mtth: 540,
    gap: 1080,
    can: (w) => !protectedLabour(w) && workers(w).length >= 8 && !!governor(w),
    sooner: (w) => (w.union ? 1.5 : 1),
    decider: (w) => governor(w),
    text: (w) => `${w.union ? `${w.union.name}และ` : ''}นักบวชบางรูปยื่นร่างกฎหมายโรงงาน ให้ทำงานวันละไม่เกินสิบชั่วโมง มีประตูหนีไฟ และค่าแรงที่พอเลี้ยงครอบครัว เจ้าของโรงงานคัดค้านว่าจะขาดทุน`,
    options: [
      {
        key: 'pass',
        label: 'ประกาศใช้',
        likes: { kind: 3, loyal: 1.2, greedy: 0.4 },
        act: (w) => {
          amend(w, { labour: 'protected' }, 'พระราชบัญญัติโรงงาน: กะสั้นลง ค่าแรงเป็นธรรม และโรงงานต้องมีประตูหนีไฟ');
          nudgeAll(workers(w), 12);
          for (const g of houses(w)) {
            const head = byId(w, g.leaderId);
            if (head) loyaltyNudge(head, -8);
          }
          legend(w, 'พระราชบัญญัติโรงงานฉบับแรก');
          return `กรรมกรได้ค่าแรงเดือนละ ${wageOf(w)} ทองและกะที่สั้นลง เจ้าของโรงงานบ่นว่ากำไรหาย`;
        },
      },
      {
        key: 'shelve',
        label: 'ตีตกร่าง',
        likes: { greedy: 2.5, vengeful: 1.3, kind: 0.4 },
        act: (w) => {
          nudgeAll(workers(w), -8);
          ensureCrown(w).unrest += 2;
          return 'ร่างกฎหมายถูกตีตก เจ้าของโรงงานเลี้ยงฉลอง กรรมกรพูดกันว่าต้องเลือกตั้งพรรคของตัวเองเข้าไป';
        },
      },
    ],
  },
  minecollapse: {
    title: 'เหมืองถล่ม',
    mtth: 900,
    gap: 1080,
    can: (w) => millsOf(w).length > 0 && mineRegions(w).length > 0 && !!ruler(w),
    decider: ruler,
    ctx: (w, rng) => {
      const rs = mineRegions(w);
      return rs.length ? pick(rng, rs).id : undefined;
    },
    text: (w, h) => `อุโมงค์ในเหมืองที่${w.regions?.find((r) => r.id === h.ctx)?.name ?? 'ชายแดน'}ถล่มลงมา คนงานเหมืองติดอยู่ข้างใต้ ชาวบ้านมาขอความช่วยเหลือจากเมือง`,
    options: [
      {
        key: 'rescue',
        label: 'ส่งคนไปขุดช่วย',
        likes: { kind: 2.5, brave: 2, coward: 0.5 },
        can: (w) => spare(w) >= 40 * lvl(w),
        act: (w, rng, h) => {
          const r = w.regions!.find((x) => x.id === h.ctx);
          if (!r) return GONE;
          w.treasury -= Math.round(40 * lvl(w));
          if (r.village) r.village.loyalty = clamp(r.village.loyalty + 15, 0, 100);
          const lost = chance(rng, 0.6) ? 0 : 1;
          if (lost) dieUnder(w, r, 1);
          return lost ? `หน่วยกู้ภัยขุดอยู่สามวันสามคืน ช่วยออกมาได้เกือบหมด เสียชีวิตหนึ่งคน ชาวบ้านซาบซึ้งน้ำใจของเมือง` : 'หน่วยกู้ภัยขุดอยู่สามวันสามคืน ช่วยคนงานออกมาได้ครบทุกคน ชาวบ้านร้องไห้ด้วยความดีใจ';
        },
      },
      {
        key: 'seal',
        label: 'ปิดเหมือง ขุดใหม่ที่อื่น',
        likes: { greedy: 2, coward: 2, kind: 0.3 },
        act: (w, rng, h) => {
          const r = w.regions!.find((x) => x.id === h.ctx);
          if (!r) return GONE;
          const lost = dieUnder(w, r, int(rng, 1, 3));
          if (r.dev?.mine) r.dev.mine = Math.max(0, r.dev.mine - 1);
          if (r.village) r.village.loyalty = clamp(r.village.loyalty - 20, 0, 100);
          return `ทางการสั่งปิดปากอุโมงค์ คนงาน ${lost} คนไม่ได้กลับขึ้นมา ชาวบ้าน${r.name}จะไม่ลืมเรื่องนี้`;
        },
      },
    ],
  },
  estatesale: {
    title: 'ขุนนางตกยากขายคฤหาสน์',
    mtth: 540,
    gap: 1080,
    can: (w) => millsOf(w).length > 0 && ofJob(w, 'noble').some((n) => n.gold < 40 * lvl(w)) && houses(w).some((g) => g.treasury >= 300 * lvl(w)),
    decider: (w) => ofJob(w, 'noble').filter((n) => n.gold < 40 * lvl(w)).sort((a, b) => a.gold - b.gold)[0],
    text: (w, h) => {
      const g = houses(w).sort((a, b) => b.treasury - a.treasury)[0];
      return `ตระกูลของ${byId(w, h.chooserId)?.name ?? 'ขุนนาง'}ไม่มีเงินซ่อมคฤหาสน์มาหลายปี หัวหน้า${g?.name ?? 'บ้านการค้า'}เสนอซื้อด้วยทองก้อนโต`;
    },
    options: [
      {
        key: 'sell',
        label: 'ขายให้นายทุน',
        likes: { greedy: 2.5, coward: 1.5, loyal: 0.6 },
        act: (w, _rng, h) => {
          const noble = byId(w, h.chooserId)!;
          const g = houses(w).sort((a, b) => b.treasury - a.treasury)[0];
          const price = Math.round(Math.min(g.treasury * 0.4, 400 * lvl(w)));
          g.treasury -= price;
          noble.gold += price;
          const head = byId(w, g.leaderId);
          if (head) loyaltyNudge(head, 8);
          nudgeAll(ofJob(w, 'noble').filter((n) => n !== noble), -5);
          log(w, 'trade', `${g.name}ซื้อคฤหาสน์ของตระกูล${noble.name}`, noble.id);
          return `${noble.name}ได้ทอง ${price} เหรียญ คฤหาสน์เก่ากลายเป็นบ้านของนายทุน ขุนนางที่เหลือรู้สึกว่าโลกของตนกำลังจะหมดไป`;
        },
      },
      {
        key: 'keep',
        label: 'ยอมจนแต่ไม่ยอมขายเกียรติ',
        likes: { loyal: 2, brave: 1.5, vengeful: 1.2, greedy: 0.4 },
        act: (w, _rng, h) => {
          const noble = byId(w, h.chooserId)!;
          loyaltyNudge(noble, -5);
          nudgeAll(ofJob(w, 'noble'), 3);
          return `${noble.name}ไล่นายทุนกลับไป หลังคาคฤหาสน์ยังรั่ว แต่ขุนนางด้วยกันยกย่องในศักดิ์ศรี`;
        },
      },
    ],
  },
} satisfies Record<string, Def>;

// A fire in a mill: lives lost, the mill shut for two months, and the reckoning after.
function burn(w: WorldState, rng: Rng, h: Happening, how: 'rebuild' | 'blame'): string {
  const m = millOf(w, h);
  if (!m) return 'ไฟสงบลงก่อนลามไปไกล';
  const hands = handsOf(w, m);
  let dead = 0;
  for (const n of hands) if (chance(rng, 0.25) && dead < 2) {
    kill(w, n, `เสียชีวิตในเหตุไฟไหม้${m.name}`);
    dead++;
  }
  m.ready = w.day + 60;
  if (how === 'rebuild') {
    const cost = Math.round(60 * lvl(w));
    if (m.owner === 'crown') w.treasury -= cost;
    else {
      const g = w.guilds.find((x) => x.id === m.owner);
      if (g) g.treasury -= cost;
    }
    nudgeAll(workers(w), 4);
    return `${m.name}ปิดซ่อมสองเดือน${dead ? ` มีผู้เสียชีวิต ${dead} คน ` : ' '}เจ้าของจ่ายเงินชดเชยและติดประตูหนีไฟ กรรมกรเห็นว่าเจ้าของยังมีหัวใจ`;
  }
  nudgeAll(workers(w), -10);
  ensureCrown(w).unrest += 2 + dead;
  return `${m.name}ปิดซ่อมสองเดือน${dead ? ` มีผู้เสียชีวิต ${dead} คน ` : ' '}เจ้าของประกาศว่ากรรมกรทำตะเกียงล้มเอง ครอบครัวผู้ตายไม่ได้อะไรเลย กรรมกรทั้งเมืองเดือดดาล`;
}

// Villagers lost under the mountain.
function dieUnder(w: WorldState, r: NonNullable<WorldState['regions']>[number], n: number): number {
  let lost = 0;
  for (const v of folkOf(w, r)) {
    if (lost >= n) break;
    v.alive = false;
    lost++;
  }
  if (lost) log(w, 'death', `คนงานเหมือง ${lost} คนเสียชีวิตใต้อุโมงค์ที่${r.name}`);
  return lost;
}

