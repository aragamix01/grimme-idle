// Affairs of state: happenings that grow out of the town's powers rather than its fields: a
// party leader caught with a trade house's gold, an opposition calling for the house to be
// dissolved, the church wanting land, a sect wanting a chapel, a trade house wanting a monopoly
// or on the brink of ruin, a neighbour's envoy seeking a royal match or a partner in war, an
// exiled prince at the gate, a headman wanting home rule, bandits over a village, a famous
// adventurer asking for a title. They join DEFS in happenings.ts and are decided the same way.
import { chance, pick } from './rng';
import { addMod, clamp, isAdventurer, kill, legend, loyaltyNudge } from './core';
import { king, leaveTrade, payrollReserve } from './society';
import { approval, ensureCrown } from './politics';
import { ensureMarket, levelOf } from './market';
import { governor, hasParliament, inGovernment, partiesOf, partyMembers } from './parties';
import { headOf, recant, sectMembers, sectOf } from './church';
import { houses } from './tradehouses';
import { chiefOf } from './villages';
import { rankOf, TOWN_RANK } from './growth';
import { conquestWar } from './war';
import type { Def } from './happenings';
import type { Good, Guild, Happening, Npc, Party, Realm, WorldState } from './types';

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
const nudgeRealm = (r: Realm, by: number) => (r.relation = clamp(r.relation + by, -100, 100));
const standing = (w: WorldState) => (w.realms ?? []).filter((r) => !r.fallen);
const realmOf = (w: WorldState, h: Happening) => standing(w).find((r) => r.id === h.ctx);
const houseOf = (w: WorldState, h: Happening) => houses(w).find((g) => g.id === h.ctx);
const partyOfCtx = (w: WorldState, h: Happening) => partiesOf(w).find((p) => p.id === h.ctx);
const regionOf = (w: WorldState, h: Happening) => (w.regions ?? []).find((r) => r.id === h.ctx);
const ourVillages = (w: WorldState) => (w.regions ?? []).filter((r) => r.owner === 'us' && r.village && !r.village.free);
const houseMembers = (w: WorldState, g: Guild) => w.npcs.filter((n) => n.alive && n.guildId === g.id);
const leaderOf = (w: WorldState, id: number) => byId(w, id);
const nextVoteOf = (w: WorldState) => (w.regime === 'republic' ? w.republic?.nextVote : w.parliament?.nextVote) ?? w.day;

// The biggest party in government with a living head: the one the papers go after.
const scandalParty = (w: WorldState) => partiesOf(w).filter((p) => inGovernment(w, p) && leaderOf(w, p.leaderId)).sort((a, b) => b.seats - a.seats)[0];

// A grown, unwed child of the ruler, still at home.
const royalChild = (w: WorldState) => {
  const k = king(w);
  if (!k) return undefined;
  return w.npcs.find((n) => n.alive && n.inside === undefined && n.parentIds?.includes(k.id) && n.age >= 16 && n.age <= 35 && n.job !== 'king' && !w.npcs.some((s) => s.alive && s.id === n.spouseId));
};

// A house closes: its warehouse goes to the market stalls, its people back to their own trades.
function closeHouse(w: WorldState, g: Guild): void {
  const m = ensureMarket(w);
  for (const [good, q] of Object.entries(g.stock ?? {}) as [Good, number][]) m.stock[good] += Math.floor(q);
  for (const n of houseMembers(w, g)) n.guildId = undefined;
  w.guilds = w.guilds.filter((x) => x !== g);
}

// Who leads a party once its head steps down: the member the rest look up to most.
function stepDown(w: WorldState, p: Party, n: Npc): Npc | undefined {
  const heir = partyMembers(w, p)
    .filter((m) => m !== n)
    .sort((a, b) => b.level - a.level || b.gold - a.gold)[0];
  if (heir) p.leaderId = heir.id;
  return heir;
}

export const AFFAIRS = {
  scandal: {
    title: 'ข่าวฉาวหัวหน้าพรรค',
    mtth: 540,
    gap: 720,
    can: (w) => hasParliament(w) && houses(w).length > 0 && partiesOf(w).some((p) => inGovernment(w, p) && !!leaderOf(w, p.leaderId)),
    decider: (w) => {
      const p = scandalParty(w);
      return p && leaderOf(w, p.leaderId);
    },
    ctx: (w) => scandalParty(w)?.id,
    text: (w, h) => {
      const p = partyOfCtx(w, h);
      const g = houses(w)[0];
      return `มีคนแฉว่าหัวหน้า${p?.name ?? 'พรรครัฐบาล'}รับเงินใต้โต๊ะจาก${g?.name ?? 'บ้านการค้า'} หนังสือพิมพ์และตลาดลือกันทั้งเมือง`;
    },
    options: [
      {
        key: 'resign',
        label: 'ลาออกจากหัวหน้าพรรค',
        likes: { kind: 2, loyal: 1.5, coward: 1.5, greedy: 0.4 },
        act: (w, _rng, h, d) => {
          const p = partyOfCtx(w, h);
          const heir = p && stepDown(w, p, d);
          nudgeAll(adults(w), 1);
          return `${d.name}ลาออก${heir ? ` ${heir.name}ขึ้นเป็นหัวหน้าพรรคแทน` : ''} ชาวเมืองชมว่ายังมีคนรู้จักละอาย`;
        },
      },
      {
        key: 'deny',
        label: 'ปฏิเสธทุกข้อกล่าวหา',
        likes: { greedy: 2, vengeful: 1.5, brave: 1.3 },
        act: (w, _rng, h) => {
          const p = partyOfCtx(w, h);
          if (p) p.broke = w.day; // the voters will remember it at the next election
          ensureCrown(w).unrest += 2;
          return 'หัวหน้าพรรคยืนกรานว่าบริสุทธิ์ แต่ไม่มีใครเชื่อ คะแนนนิยมของพรรครัฐบาลตกฮวบ';
        },
      },
      {
        key: 'hush',
        label: 'ใช้เงินพรรคปิดข่าว',
        likes: { greedy: 2.5, coward: 1.3, kind: 0.5 },
        can: (w, h) => (partyOfCtx(w, h)?.treasury ?? 0) >= 60 * lvl(w),
        act: (w, rng, h) => {
          const p = partyOfCtx(w, h);
          if (!p) return GONE;
          const paid = Math.round(60 * lvl(w));
          p.treasury -= paid;
          ensureMarket(w).till += paid;
          if (!chance(rng, 0.35)) return `พรรคจ่าย ${paid} ทองให้คนที่รู้เรื่องเงียบ ข่าวค่อยๆ เงียบหายไป`;
          p.broke = w.day;
          ensureCrown(w).unrest += 4;
          return `พรรคจ่าย ${paid} ทองปิดปาก แต่คนรับเงินเอาไปเล่าต่อ ข่าวฉาวซ้อนข่าวฉาว ชาวเมืองโกรธหนักกว่าเดิม`;
        },
      },
    ],
  },
  dissolution: {
    title: 'ฝ่ายค้านเรียกร้องให้ยุบสภา',
    mtth: 540,
    gap: 720,
    can: (w) => hasParliament(w) && !!w.parliament && partiesOf(w).length >= 2 && nextVoteOf(w) - w.day > 365 && approval(w) < 45,
    decider: (w) => governor(w),
    text: (w) => `ผู้คนไม่พอใจรัฐบาล (ความพอใจ ${Math.round(approval(w))}) ฝ่ายค้านเดินสายปราศรัยเรียกร้องให้ยุบสภาและคืนอำนาจให้ประชาชนเลือกใหม่`,
    options: [
      {
        key: 'dissolve',
        label: 'ยุบสภา เลือกตั้งใหม่',
        likes: { kind: 1.5, loyal: 1.5, brave: 1.3, greedy: 0.6 },
        act: (w) => {
          if (w.regime === 'republic' && w.republic) w.republic.nextVote = w.day;
          else if (w.parliament) w.parliament.nextVote = w.day;
          nudgeAll(adults(w), 2);
          return 'รัฐบาลยุบสภา ประกาศเลือกตั้งทั่วไปภายในเดือนนี้ ชาวเมืองกลับมามีความหวัง';
        },
      },
      {
        key: 'stay',
        label: 'อยู่จนครบวาระ',
        likes: { greedy: 2, vengeful: 1.5, coward: 1.3 },
        act: (w) => {
          ensureCrown(w).unrest += 3;
          nudgeAll(adults(w).filter((n) => n.partyId !== undefined && !inGovernment(w, partiesOf(w).find((p) => p.id === n.partyId)!)), -6);
          return 'รัฐบาลไม่ยอมยุบสภา ฝ่ายค้านประกาศจะพาคนลงถนน';
        },
      },
    ],
  },
  templeland: {
    title: 'ศาสนจักรขอที่ดินสร้างวัด',
    mtth: 540,
    gap: 1080,
    can: (w) => !!headOf(w) && !!ruler(w) && headOf(w) !== ruler(w) && (w.religion?.church?.purse ?? 0) >= 60 * lvl(w),
    decider: ruler,
    text: (w) => `มหาเถระ${headOf(w)?.name ?? ''}ขอที่ดินหลวงริมเมืองสร้างวัดหลังใหม่ ขุนนางเจ้าของที่ดินข้างเคียงไม่เห็นด้วย`,
    options: [
      {
        key: 'grant',
        label: 'ยกที่ดินให้',
        likes: { kind: 1.5, loyal: 2, greedy: 0.5 },
        act: (w) => {
          addMod(w, 'piety', 5, 720, 'วัดใหม่บนที่ดินหลวง');
          nudgeAll(ofJob(w, 'priest'), 8);
          nudgeAll(ofJob(w, 'noble'), -6);
          return 'วัดใหม่ขึ้นบนที่ดินหลวง ผู้ศรัทธาไปทำบุญกันคึกคัก ขุนนางบ่นว่าเสียที่ดินดีไป';
        },
      },
      {
        key: 'lease',
        label: 'ให้เช่าที่ดิน เก็บค่าเช่าเข้าคลัง',
        likes: { greedy: 3, kind: 0.7 },
        act: (w) => {
          const c = w.religion!.church!;
          const rent = Math.min(c.purse, Math.round(40 * lvl(w)));
          c.purse -= rent;
          w.treasury += rent;
          const head = headOf(w);
          if (head) loyaltyNudge(head, -6);
          return `ศาสนจักรจ่ายค่าเช่า ${rent} ทองเข้าคลังหลวง มหาเถระสร้างวัดได้แต่ไม่พอใจ`;
        },
      },
      {
        key: 'refuse',
        label: 'ปฏิเสธ',
        likes: { vengeful: 1.8, brave: 1.2, kind: 0.6, loyal: 0.7 },
        act: (w) => {
          addMod(w, 'piety', -3, 360, 'ผู้ปกครองไม่ให้ที่สร้างวัด');
          const head = headOf(w);
          if (head) loyaltyNudge(head, -12);
          nudgeAll(ofJob(w, 'noble'), 4);
          return 'ผู้ปกครองไม่ยอมยกที่ดินให้ มหาเถระเทศนาเรื่องผู้ปกครองตระหนี่ทุกวันพระ';
        },
      },
    ],
  },
  chapel: {
    title: 'นิกายขอสร้างโบสถ์ของตัวเอง',
    mtth: 360,
    gap: 720,
    can: (w) => !!sectOf(w) && sectMembers(w).length >= 4 && !!ruler(w),
    decider: ruler,
    text: (w) => `สาวก${sectOf(w)!.name} ${sectMembers(w).length} คนยื่นฎีกาขอสร้างโบสถ์ของตัวเอง ไม่ต้องไปฟังเทศน์ของศาสนจักรเดิมอีก`,
    options: [
      {
        key: 'allow',
        label: 'อนุญาต เก็บค่าธรรมเนียม',
        likes: { kind: 2.5, greedy: 1.3, vengeful: 0.4 },
        act: (w) => {
          const ms = sectMembers(w);
          const fee = Math.round(ms.length * 4 * lvl(w));
          w.treasury += fee;
          nudgeAll(ms, 8);
          const head = headOf(w);
          if (head) loyaltyNudge(head, -10);
          return `โบสถ์ของนิกายสร้างขึ้นริมตลาด คลังได้ค่าธรรมเนียม ${fee} ทอง มหาเถระประณามว่าผู้ปกครองเปิดประตูให้คนนอกรีต`;
        },
      },
      {
        key: 'forbid',
        label: 'ห้ามสร้าง',
        likes: { loyal: 1.6, coward: 1.3 },
        act: (w) => {
          nudgeAll(sectMembers(w), -10);
          ensureCrown(w).unrest += 1;
          return 'สาวกนิกายต้องแอบประชุมกันตามบ้าน ความขุ่นเคืองสะสมขึ้นเงียบๆ';
        },
      },
      {
        key: 'trial',
        label: 'ส่งแกนนำขึ้นศาลนอกรีต',
        likes: { vengeful: 3, loyal: 1.2, kind: 0.3 },
        act: (w, rng) => {
          const ms = sectMembers(w);
          let turned = 0;
          for (const n of ms.slice(0, 3)) if (recant(w, n, rng)) turned++;
          nudgeAll(sectMembers(w), -15);
          ensureCrown(w).unrest += 2;
          return `ศาลนอกรีตไต่สวนสาวกนิกาย ${turned} คนยอมกลับใจ ที่เหลือยิ่งแน่วแน่และเกลียดผู้ปกครอง`;
        },
      },
    ],
  },
  monopoly: {
    title: 'บ้านการค้าขอสิทธิ์ผูกขาด',
    mtth: 540,
    gap: 720,
    can: (w) => !!ruler(w) && houses(w).some((g) => g.treasury >= 150 * lvl(w)),
    decider: ruler,
    ctx: (w) => houses(w).filter((g) => g.treasury >= 150 * lvl(w)).sort((a, b) => b.treasury - a.treasury)[0]?.id,
    text: (w, h) => `${houseOf(w, h)?.name ?? 'บ้านการค้า'}เสนอเงินก้อนใหญ่แลกกับสิทธิ์ผูกขาดการค้ากับต่างแดนแต่เพียงผู้เดียว พ่อค้ารายย่อยกลัวจะหมดทางทำกิน`,
    options: [
      {
        key: 'sell',
        label: 'ขายสิทธิ์ผูกขาด',
        likes: { greedy: 3, kind: 0.5 },
        act: (w, _rng, h) => {
          const g = houseOf(w, h);
          if (!g) return GONE;
          const fee = Math.floor(g.treasury * 0.4);
          g.treasury -= fee;
          w.treasury += fee;
          nudgeAll(ofJob(w, 'merchant').filter((n) => n.guildId !== g.id), -10);
          addMod(w, 'crime', 0.05, 360, 'ของเถื่อนเลี่ยงการผูกขาด');
          return `${g.name}จ่าย ${fee} ทองเข้าคลังหลวง พ่อค้ารายย่อยโกรธแค้น ของเถื่อนเริ่มเข้าเมืองทางหลัง`;
        },
      },
      {
        key: 'refuse',
        label: 'ปฏิเสธ ให้แข่งขันกันอย่างเสรี',
        likes: { kind: 1.6, loyal: 1.3, brave: 1.1 },
        act: (w, _rng, h) => {
          const g = houseOf(w, h);
          if (!g) return GONE;
          const head = byId(w, g.leaderId);
          if (head) loyaltyNudge(head, -10);
          nudgeAll(ofJob(w, 'merchant').filter((n) => n.guildId !== g.id), 4);
          return `ตลาดยังเปิดให้ทุกคน หัวหน้า${g.name}กลับไปอย่างไม่พอใจ`;
        },
      },
    ],
  },
  failing: {
    title: 'บ้านการค้าใกล้ล้มละลาย',
    mtth: 240,
    gap: 720,
    can: (w) => !!ruler(w) && houses(w).some((g) => g.treasury < 15 * lvl(w) && w.day - g.founded > 365 && houseMembers(w, g).length >= 2),
    decider: ruler,
    ctx: (w) => houses(w).find((g) => g.treasury < 15 * lvl(w) && w.day - g.founded > 365 && houseMembers(w, g).length >= 2)?.id,
    text: (w, h) => `${houseOf(w, h)?.name ?? 'บ้านการค้า'}ขาดทุนหนักจนเงินในคลังแทบไม่เหลือ หัวหน้าบ้านมาขอให้ราชสำนักช่วย ไม่อย่างนั้นคนงานทั้งบ้านจะตกงาน`,
    options: [
      {
        key: 'bail',
        label: 'ใช้เงินหลวงอุ้ม',
        likes: { kind: 2, loyal: 1.5, greedy: 0.5 },
        can: (w) => spare(w) >= 100 * lvl(w),
        act: (w, _rng, h) => {
          const g = houseOf(w, h);
          if (!g) return GONE;
          const aid = Math.round(100 * lvl(w));
          w.treasury -= aid;
          g.treasury += aid;
          nudgeAll(houseMembers(w, g), 8);
          nudgeAll(ofJob(w, 'farmer'), -2);
          return `คลังหลวงจ่าย ${aid} ทองพยุง${g.name}ไว้ ชาวนาบ่นว่าภาษีของตนไปอุ้มคนรวย`;
        },
      },
      {
        key: 'fall',
        label: 'ปล่อยให้ล้ม',
        likes: { brave: 1.5, greedy: 1.5, vengeful: 1.2 },
        act: (w, _rng, h) => {
          const g = houseOf(w, h);
          if (!g) return GONE;
          const ms = houseMembers(w, g);
          nudgeAll(ms, -8);
          closeHouse(w, g);
          return `${g.name}ปิดกิจการ สินค้าในโกดังเทขายในตลาด คนงาน ${ms.length} คนกลับไปค้าขายเอง`;
        },
      },
      {
        key: 'seize',
        label: 'ยึดเป็นของหลวง',
        likes: { vengeful: 2, greedy: 2, kind: 0.5 },
        act: (w, _rng, h) => {
          const g = houseOf(w, h);
          if (!g) return GONE;
          const ms = houseMembers(w, g);
          w.treasury += Math.max(0, Math.floor(g.treasury));
          nudgeAll(ms, -15);
          nudgeAll(ofJob(w, 'merchant'), -4);
          closeHouse(w, g);
          return `ราชสำนักยึด${g.name}พร้อมโกดังสินค้า พ่อค้าทั้งเมืองหวาดหวั่นว่าบ้านตนจะเป็นรายต่อไป`;
        },
      },
    ],
  },
  match: {
    title: 'ทูตขอสู่ขอเชื่อมไมตรี',
    mtth: 540,
    gap: 1080,
    can: (w) => !!royalChild(w) && standing(w).some((r) => !r.war && !r.wed && r.relation >= 15),
    decider: (w) => king(w),
    ctx: (w, rng) => {
      const rs = standing(w).filter((r) => !r.war && !r.wed && r.relation >= 15);
      return rs.length ? pick(rng, rs).id : undefined;
    },
    text: (w, h) => {
      const r = realmOf(w, h);
      return `ทูตจาก${r?.name ?? 'แคว้นข้างเคียง'}นำเครื่องบรรณาการมาสู่ขอ${royalChild(w)?.name ?? 'บุตรของผู้ปกครอง'}ไปอภิเษกกับราชวงศ์ของ${r?.ruler.name ?? 'ตน'}`;
    },
    options: [
      {
        key: 'wed',
        label: 'ยกบุตรให้อภิเษก',
        likes: { loyal: 2, kind: 1.5, coward: 1.4, vengeful: 0.6 },
        act: (w, _rng, h) => wed(w, h, 0),
      },
      {
        key: 'dowry',
        label: 'ยอม แต่เรียกสินสอดสูง',
        likes: { greedy: 3, kind: 0.6 },
        act: (w, rng, h) => {
          const r = realmOf(w, h);
          if (!r || chance(rng, 0.45)) {
            if (r) nudgeRealm(r, -10);
            return `${r?.name ?? 'ฝ่ายนั้น'}เห็นว่าเรียกมากเกินไปจึงถอนคำสู่ขอ ทูตกลับไปอย่างเสียหน้า`;
          }
          return wed(w, h, Math.round(80 * lvl(w)));
        },
      },
      {
        key: 'refuse',
        label: 'ปฏิเสธ',
        likes: { vengeful: 2, brave: 1.2, kind: 0.7 },
        act: (w, _rng, h) => {
          const r = realmOf(w, h);
          if (r) nudgeRealm(r, -15);
          return `ทูตกลับไปมือเปล่า ${r?.ruler.name ?? 'ฝ่ายนั้น'}ถือว่าเป็นการดูหมิ่น`;
        },
      },
    ],
  },
  exile: {
    title: 'เจ้าชายต่างแดนขอลี้ภัย',
    mtth: 720,
    gap: 1080,
    can: (w) => rankOf(w) >= 1 && !!ruler(w) && standing(w).some((r) => !r.war),
    decider: ruler,
    ctx: (w, rng) => {
      const rs = standing(w).filter((r) => !r.war);
      return rs.length ? pick(rng, rs).id : undefined;
    },
    text: (w, h) => `เจ้าชายแห่ง${realmOf(w, h)?.name ?? 'แคว้นข้างเคียง'}หนีการชิงบัลลังก์ของลุงมาขอที่พักพิง ${realmOf(w, h)?.ruler.name ?? 'ผู้ปกครองที่นั่น'}ส่งคนมาขอตัวกลับ`,
    options: [
      {
        key: 'shelter',
        label: 'ให้ที่พักพิง',
        likes: { kind: 2.5, brave: 1.5, coward: 0.4 },
        act: (w, rng, h) => {
          const r = realmOf(w, h);
          if (!r) return GONE;
          nudgeRealm(r, -18);
          w.treasury -= Math.min(Math.max(0, spare(w)), Math.round(20 * lvl(w)));
          nudgeAll(adults(w).filter((n) => n.traits.includes('kind')), 3);
          if (!chance(rng, 0.3)) return `เจ้าชายได้ที่พักในเมือง ${r.name}ไม่พอใจอย่างยิ่ง`;
          nudgeRealm(r, 55); // the prince's party won the court back, and remembers its friends
          legend(w, `เจ้าชายที่เราให้ที่พักพิงได้ขึ้นครองบัลลังก์${r.name}`);
          return `ไม่กี่เดือนต่อมาฝ่ายของเจ้าชายชนะในราชสำนัก${r.name} เจ้าชายกลับไปครองบัลลังก์และไม่ลืมบุญคุณเมืองของเรา`;
        },
      },
      {
        key: 'return',
        label: 'ส่งตัวกลับ รับรางวัล',
        likes: { coward: 2, greedy: 2, kind: 0.3 },
        act: (w, _rng, h) => {
          const r = realmOf(w, h);
          if (!r) return GONE;
          const prize = Math.round(30 * lvl(w));
          nudgeRealm(r, 15);
          w.treasury += prize;
          nudgeAll(adults(w).filter((n) => n.traits.includes('kind')), -5);
          return `เจ้าชายถูกส่งตัวกลับไปให้ลุงของตน ${r.name}ส่งรางวัล ${prize} ทอง คนใจดีในเมืองสลดใจ`;
        },
      },
    ],
  },
  warpact: {
    title: 'ทูตชวนร่วมทัพ',
    mtth: 540,
    gap: 1080,
    can: (w) => rankOf(w) >= TOWN_RANK && !w.war && !!king(w) && !!allyAndFoe(w),
    decider: (w) => king(w),
    ctx: (w) => allyAndFoe(w)?.[0].id,
    text: (w, h) => {
      const r = realmOf(w, h);
      const foe = r && foeOf(w, r);
      return `${r?.ruler.name ?? 'พันธมิตร'}แห่ง${r?.name ?? ''}ส่งทูตมาชวนยกทัพไปตี${foe?.name ?? 'ศัตรูร่วม'} สัญญาว่าจะแบ่งชัยชนะให้`;
    },
    options: [
      {
        key: 'join',
        label: 'ร่วมทัพ',
        likes: { brave: 2.5, vengeful: 2, greedy: 1.3, coward: 0.3, kind: 0.5 },
        can: (w, h) => {
          const r = realmOf(w, h);
          return !!r && !!foeOf(w, r);
        },
        act: (w, _rng, h) => {
          const r = realmOf(w, h);
          if (!r) return GONE;
          const foe = foeOf(w, r)!;
          nudgeRealm(r, 15);
          conquestWar(w, foe);
          if (w.war) w.war.boost = 1.4; // the allied host rides with ours in the first clash
          return `ทัพของเราและ${r.name}ยกไปตี${foe.name}พร้อมกัน`;
        },
      },
      {
        key: 'supply',
        label: 'ส่งเสบียงช่วยแต่ไม่ส่งทหาร',
        likes: { loyal: 2, kind: 1.2, greedy: 0.6 },
        can: (w) => spare(w) >= 60 * lvl(w),
        act: (w, _rng, h) => {
          const r = realmOf(w, h);
          if (!r) return GONE;
          const foe = foeOf(w, r);
          w.treasury -= Math.round(60 * lvl(w));
          nudgeRealm(r, 8);
          if (foe) nudgeRealm(foe, -10);
          return `เกวียนเสบียงมุ่งหน้าไป${r.name} ${foe ? `${foe.name}รู้ข่าวและไม่พอใจ` : ''}`;
        },
      },
      {
        key: 'neutral',
        label: 'วางตัวเป็นกลาง',
        likes: { coward: 2, kind: 1.5 },
        act: (w, _rng, h) => {
          const r = realmOf(w, h);
          if (!r) return GONE;
          nudgeRealm(r, -10);
          return `${r.name}ผิดหวังที่เราไม่ยอมช่วย`;
        },
      },
    ],
  },
  homerule: {
    title: 'ผู้ใหญ่บ้านขอปกครองตนเอง',
    mtth: 360,
    gap: 720,
    can: (w) => !!ruler(w) && ourVillages(w).some((r) => r.village!.loyalty < 55 && !!chiefOf(w, r)),
    decider: ruler,
    ctx: (w) => ourVillages(w).filter((r) => r.village!.loyalty < 55 && chiefOf(w, r)).sort((a, b) => a.village!.loyalty - b.village!.loyalty)[0]?.id,
    text: (w, h) => {
      const r = regionOf(w, h);
      return `ผู้ใหญ่บ้าน${r ? chiefOf(w, r)?.name ?? '' : ''}แห่ง${r?.name ?? 'หมู่บ้าน'}เดินทางมาขอให้ชาวบ้านได้เลือกกฎของตัวเองและเก็บผลผลิตไว้ใช้มากขึ้น`;
    },
    options: [
      {
        key: 'grant',
        label: 'ให้ปกครองตนเองภายใต้ธงของเรา',
        likes: { kind: 2.5, loyal: 1.2, vengeful: 0.5 },
        act: (w, _rng, h) => {
          const v = regionOf(w, h)?.village;
          if (!v) return GONE;
          v.loyalty = clamp(v.loyalty + 25, 0, 100);
          v.grudge = 0;
          v.purse += Math.round(15 * lvl(w));
          return 'หมู่บ้านได้ดูแลตัวเอง ชาวบ้านจงรักภักดีขึ้นมาก';
        },
      },
      {
        key: 'refuse',
        label: 'ปฏิเสธ',
        likes: { vengeful: 1.5, greedy: 1.5, brave: 1.1 },
        act: (w, _rng, h) => {
          const v = regionOf(w, h)?.village;
          if (!v) return GONE;
          v.loyalty = clamp(v.loyalty - 15, 0, 100);
          v.grudge = (v.grudge ?? 0) + 1;
          return 'ผู้ใหญ่บ้านกลับไปมือเปล่า ชาวบ้านเริ่มพูดกันเรื่องแยกตัว';
        },
      },
      {
        key: 'garrison',
        label: 'ส่งทหารไปประจำ',
        likes: { brave: 2, vengeful: 1.8, kind: 0.5 },
        can: (w) => ofJob(w, 'soldier').length >= 2 && spare(w) >= 20 * lvl(w),
        act: (w, _rng, h) => {
          const v = regionOf(w, h)?.village;
          if (!v) return GONE;
          w.treasury -= Math.round(20 * lvl(w));
          v.garrison = Math.max(v.garrison ?? 0, w.day + 180);
          v.loyalty = clamp(v.loyalty - 5, 0, 100);
          return 'ทหารไปตั้งค่ายกลางหมู่บ้านครึ่งปี ไม่มีใครกล้าพูดเรื่องแยกตัวอีก แต่ก็ไม่มีใครรักราชสำนักขึ้น';
        },
      },
    ],
  },
  bandits: {
    title: 'โจรป่าขู่หมู่บ้าน',
    mtth: 540,
    gap: 540,
    can: (w) => rankOf(w) >= 1 && !!ruler(w) && ourVillages(w).length > 0,
    decider: ruler,
    ctx: (w, rng) => {
      const vs = ourVillages(w);
      return vs.length ? pick(rng, vs).id : undefined;
    },
    text: (w, h) => `ชุมโจรตั้งค่ายในป่าใกล้${regionOf(w, h)?.name ?? 'หมู่บ้าน'} ส่งคนมาบอกว่าถ้าไม่จ่ายส่วยจะเผายุ้งข้าว`,
    options: [
      {
        key: 'soldiers',
        label: 'ส่งทหารไปปราบ',
        likes: { brave: 2.5, vengeful: 1.5, coward: 0.4 },
        can: (w) => ofJob(w, 'soldier').length >= 1,
        act: (w, rng, h) => {
          const r = regionOf(w, h);
          if (!r) return GONE;
          const v = r.village!;
          const troop = ofJob(w, 'soldier');
          if (chance(rng, Math.min(0.9, 0.45 + troop.length * 0.08))) {
            v.loyalty = clamp(v.loyalty + 10, 0, 100);
            return `ทหาร ${troop.length} นายตีค่ายโจรแตก ชาวบ้าน${r.name}โห่ร้องต้อนรับ`;
          }
          const fallen = pick(rng, troop);
          kill(w, fallen, `ถูกโจรป่าซุ่มโจมตีใกล้${r.name}`);
          v.purse = Math.floor(v.purse / 2);
          return `ทหารถูกซุ่มโจมตี ${fallen.name}เสียชีวิต โจรปล้นหมู่บ้านไปครึ่งหนึ่ง`;
        },
      },
      {
        key: 'hire',
        label: 'จ้างนักผจญภัย',
        likes: { kind: 1.3, coward: 1.5, greedy: 0.7 },
        can: (w) => adults(w).some(isAdventurer) && spare(w) >= 40 * lvl(w),
        act: (w, _rng, h) => {
          const r = regionOf(w, h);
          if (!r) return GONE;
          const fee = Math.round(40 * lvl(w));
          const best = adults(w).filter(isAdventurer).sort((a, b) => b.level - a.level)[0];
          w.treasury -= fee;
          best.gold += fee;
          best.renown = (best.renown ?? 0) + 2;
          r.village!.loyalty = clamp(r.village!.loyalty + 6, 0, 100);
          return `${best.name}รับค่าจ้าง ${fee} ทอง นำพวกไล่โจรออกจากป่าได้สำเร็จ`;
        },
      },
      {
        key: 'pay',
        label: 'ให้หมู่บ้านจ่ายส่วย',
        likes: { coward: 2.5, greedy: 1.5, brave: 0.3 },
        act: (w, _rng, h) => {
          const v = regionOf(w, h)?.village;
          if (!v) return GONE;
          v.purse = Math.floor(v.purse / 2);
          v.loyalty = clamp(v.loyalty - 12, 0, 100);
          v.grudge = (v.grudge ?? 0) + 1;
          addMod(w, 'crime', 0.05, 180, 'โจรป่าได้ใจ');
          return 'ชาวบ้านต้องเอาเงินกองกลางไปจ่ายโจร พวกเขาถามว่าราชสำนักมีไว้ทำไม';
        },
      },
    ],
  },
  knighthood: {
    title: 'นักผจญภัยดังขอยศขุนนาง',
    mtth: 540,
    gap: 1080,
    can: (w) => rankOf(w) >= TOWN_RANK && !!king(w) && adults(w).some((n) => isAdventurer(n) && (n.rank ?? 0) >= 4),
    decider: (w) => king(w),
    ctx: (w) => adults(w).filter((n) => isAdventurer(n) && (n.rank ?? 0) >= 4).sort((a, b) => (b.renown ?? 0) - (a.renown ?? 0))[0]?.id,
    text: (w, h) => `${byId(w, h.ctx)?.name ?? 'นักผจญภัยชื่อดัง'}ผู้ปราบมอนสเตอร์มานับไม่ถ้วน ทูลขอยศขุนนางและที่ดินเป็นของตัวเอง ขุนนางเก่ามองว่าเป็นแค่คนเร่ร่อนถือดาบ`,
    options: [
      {
        key: 'knight',
        label: 'แต่งตั้งเป็นขุนนาง',
        likes: { brave: 2, kind: 1.5, loyal: 1.2 },
        act: (w, _rng, h) => {
          const n = byId(w, h.ctx);
          if (!n) return GONE;
          if (n.questId !== undefined || n.inside !== undefined) return `${n.name}ออกไปทำเควสเสียก่อน ราชโองการแต่งตั้งต้องรอจนกว่าจะกลับมาทูลขอใหม่`; // out on a quest by the time the word came
          leaveTrade(n);
          n.job = 'noble';
          n.plan = undefined;
          loyaltyNudge(n, 20);
          nudgeAll(ofJob(w, 'noble').filter((x) => x !== n), -5);
          nudgeAll(adults(w).filter(isAdventurer), 5);
          legend(w, `${n.name} นักผจญภัยได้รับแต่งตั้งเป็นขุนนาง`, n.id);
          return `${n.name}แขวนดาบ รับยศขุนนาง นักผจญภัยรุ่นใหม่ฝันจะเป็นอย่างเขา ขุนนางเก่าเบ้ปาก`;
        },
      },
      {
        key: 'reward',
        label: 'ประทานรางวัลแทน',
        likes: { coward: 1.5, kind: 1.2, loyal: 1.3, greedy: 0.6 },
        can: (w) => spare(w) >= 50 * lvl(w),
        act: (w, _rng, h) => {
          const n = byId(w, h.ctx);
          if (!n) return GONE;
          const gift = Math.round(50 * lvl(w));
          w.treasury -= gift;
          n.gold += gift;
          loyaltyNudge(n, 6);
          return `${n.name}ได้รางวัล ${gift} ทองแทนยศ รับไว้แต่ผิดหวังเล็กน้อย`;
        },
      },
      {
        key: 'refuse',
        label: 'ปฏิเสธ',
        likes: { vengeful: 1.5, greedy: 2, kind: 0.5 },
        act: (w, rng, h) => {
          const n = byId(w, h.ctx);
          if (!n) return GONE;
          loyaltyNudge(n, -15);
          nudgeAll(adults(w).filter(isAdventurer), -5);
          if (!chance(rng, 0.3)) return `${n.name}กลับไปที่กิลด์อย่างขุ่นเคือง`;
          n.alive = false;
          n.left = true;
          n.plan = undefined;
          return `${n.name}เก็บข้าวของออกจากเมือง ไปรับใช้แคว้นอื่นที่เห็นค่าตน`;
        },
      },
    ],
  },
} satisfies Record<string, Def>;

// A realm that likes us and a realm we both dislike: the makings of an alliance in arms.
function foeOf(w: WorldState, ally: Realm): Realm | undefined {
  return standing(w)
    .filter((r) => r !== ally && !r.war && !r.pact && r.relation < 0 && (r.truceUntil ?? 0) <= w.day)
    .sort((a, b) => a.relation - b.relation)[0];
}
function allyAndFoe(w: WorldState): [Realm, Realm] | undefined {
  for (const r of standing(w)) {
    if (r.war || r.relation < 25) continue;
    const foe = foeOf(w, r);
    if (foe) return [r, foe];
  }
  return undefined;
}

// The royal child rides off to the other court, and the two houses are bound.
function wed(w: WorldState, h: Happening, dowry: number): string {
  const r = realmOf(w, h);
  const child = royalChild(w);
  if (!r || !child) return 'งานอภิเษกล่มไปเพราะเจ้าบ่าวเจ้าสาวไม่อยู่แล้ว';
  r.wed = child.name;
  nudgeRealm(r, 25);
  if (r.relation >= 50 && !r.pact) r.pact = 'alliance';
  w.treasury += dowry;
  child.alive = false;
  child.left = true;
  child.plan = undefined;
  legend(w, `${child.name} อภิเษกสมรสเชื่อมสัมพันธ์กับ${r.name}`, child.id);
  return `${child.name}เดินทางไปอภิเษกกับราชวงศ์แห่ง${r.name}${dowry ? ` ได้สินสอด ${dowry} ทอง` : ''}${r.pact ? ' สองแคว้นผูกเป็นพันธมิตร' : ''}`;
}

export type AffairKind = keyof typeof AFFAIRS;
