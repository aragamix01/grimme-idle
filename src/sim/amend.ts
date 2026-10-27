// How the town rewrites its own constitution. Once a month someone may push for a change, and at
// most one change passes in a year: a popular, ambitious leader tries to lift the term limit or
// lengthen the term; war or the demon lord brings emergency powers, which a grasping ruler is slow
// to give back; the rich narrow the vote and the kind or the lettered widen it; a strong king
// strips the nobles of their veto, and nobles who have a weak king at their mercy force a charter
// on him; a pious ruler makes the faith the state's, a learned one separates them again.
import { chance, type Rng } from './rng';
import { known, log, loyaltyNudge, occupied } from './core';
import { amend, charterOf, landPolicyOf } from './charter';
import { approval, crownPower, loyaltyOf } from './politics';
import { king } from './society';
import { literacy, literate } from './learning';
import { guildLaw, influenceOf } from './adventurers';
import type { Npc, WorldState } from './types';

const PUSH_DAY = 23; // day of the month a change may be pushed
const GAP = 365; // days between amendments

const adults = (world: WorldState) => world.npcs.filter((n) => n.alive && n.age >= 16);
const has = (n: Npc, ...t: Npc['traits']) => t.some((x) => n.traits.includes(x));
const recent = (world: WorldState, days: number, re: RegExp) => world.chronicle.some((e) => e.day > world.day - days && re.test(e.text));

export function amendmentsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== PUSH_DAY || occupied(world)) return;
  const ruler = king(world);
  if (!ruler) return;
  const c = charterOf(world);
  const last = c.amendments.at(-1)?.day ?? c.written;
  if (world.day - last < GAP) return;
  const r = world.regime ?? 'monarchy';
  const popular = approval(world) >= 55;
  const strong = crownPower(world).total >= 75;
  const ambitious = has(ruler, 'greedy', 'vengeful');
  const crisis = !!world.war || (!!world.demon && world.demon.stage !== 'occupied');
  const title = r === 'monarchy' ? 'กษัตริย์' : 'ผู้นำ';

  // Emergency powers: taken in a crisis, given back after (by most).
  if (r !== 'junta' && crisis && !c.emergency && chance(rng, 0.3)) {
    return amend(world, { emergency: true }, `${title}${ruler.name}ประกาศภาวะฉุกเฉิน รวบอำนาจไว้ที่ตน${r === 'republic' ? 'และงดการเลือกตั้ง' : ''}จนกว่าวิกฤตจะผ่านพ้น`);
  }
  if (r !== 'junta' && !crisis && c.emergency) {
    if (ambitious && chance(rng, 0.6)) {
      // Clinging on: the readers of the town take it worst.
      for (const n of adults(world)) if (literate(n)) loyaltyNudge(n, -6);
      log(world, 'politics', `วิกฤตผ่านไปแล้ว แต่${title}${ruler.name}ยังไม่ยอมคืนอำนาจฉุกเฉิน ชาวเมืองเริ่มไม่พอใจ`, ruler.id);
      return;
    }
    return amend(world, { emergency: false }, `${title}${ruler.name}คืนอำนาจฉุกเฉิน การปกครองกลับสู่ภาวะปกติ`);
  }

  if (r === 'republic') {
    const streak = world.republic?.streak ?? 1;
    // A popular leader about to be barred tries to lift the limit; the senate may refuse.
    if (c.termLimit !== null && streak >= c.termLimit && ambitious && approval(world) >= 50 && chance(rng, 0.5)) {
      if (popular || strong) {
        for (const n of adults(world)) if (literate(n)) loyaltyNudge(n, -8);
        return amend(world, { termLimit: null }, `ยกเลิกการจำกัดวาระ ผู้นำ${ruler.name}ลงสมัครได้ไม่จำกัด (ชาวเมืองที่อ่านออกหลายคนไม่พอใจ)`);
      }
      log(world, 'politics', `ผู้นำ${ruler.name}เสนอยกเลิกการจำกัดวาระ แต่วุฒิสภาไม่ยอม`, ruler.id);
      return;
    }
    if (c.termLimit === null && streak <= 1 && !ambitious && chance(rng, 0.5)) return amend(world, { termLimit: 2 }, `ผู้นำ${ruler.name}คืนการจำกัดวาระ ผู้นำดำรงตำแหน่งได้ไม่เกิน 2 สมัย`);
    if (c.termYears < 5 && ambitious && popular && chance(rng, 0.25)) return amend(world, { termYears: 5 }, 'ขยายวาระผู้นำเป็น 5 ปี');
    if (c.termYears > 3 && !ambitious && chance(rng, 0.25)) return amend(world, { termYears: 3 }, 'ลดวาระผู้นำกลับเป็น 3 ปี');
    // Who votes: the rich close ranks, the kind and the lettered open them.
    if (c.franchise === 'all' && has(ruler, 'greedy') && chance(rng, 0.3)) {
      for (const n of adults(world)) if (n.gold < 30) loyaltyNudge(n, -8);
      return amend(world, { franchise: 'propertied' }, 'จำกัดสิทธิ์เลือกตั้งเฉพาะผู้มีทรัพย์สิน คนจนไม่พอใจ');
    }
    if (c.franchise === 'all' && literacy(world) >= 0.6 && known(world, 'printing') && !has(ruler, 'kind') && chance(rng, 0.15)) {
      return amend(world, { franchise: 'lettered' }, 'จำกัดสิทธิ์เลือกตั้งเฉพาะผู้ที่อ่านออกเขียนได้');
    }
    if (c.franchise !== 'all' && has(ruler, 'kind') && chance(rng, 0.5)) {
      for (const n of adults(world)) loyaltyNudge(n, 3);
      return amend(world, { franchise: 'all' }, 'คืนสิทธิ์เลือกตั้งให้ผู้ใหญ่ทุกคน');
    }
  }

  if (r === 'monarchy') {
    const lords = adults(world).filter((n) => n.job === 'noble');
    const sour = lords.length >= 2 && lords.reduce((s, n) => s + loyaltyOf(n), 0) / lords.length < 40;
    // A strong, grasping king strips the nobles of their veto; weak kings have it forced back on them.
    if (c.councilVeto && strong && ambitious && chance(rng, 0.3)) {
      for (const n of lords) loyaltyNudge(n, -12);
      return amend(world, { councilVeto: false }, `กษัตริย์${ruler.name}ริบอำนาจยับยั้งของสภาขุนนาง ปกครองแต่เพียงผู้เดียว`);
    }
    if ((!c.councilVeto || !c.taxCap) && crownPower(world).total < 45 && sour && chance(rng, 0.4)) {
      return amend(world, { councilVeto: true, taxCap: c.taxCap ?? 'normal' }, `เหล่าขุนนางบีบกษัตริย์${ruler.name}ให้ลงนามในกฎบัตร คืนอำนาจยับยั้งให้สภาและจำกัดภาษี`);
    }
  }

  // Church and state, in any regime but the priests' own.
  if (r !== 'theocracy') {
    // Only a town that doesn't yet read much takes a state faith; once it reads, it lets go.
    if (!c.stateFaith && has(ruler, 'kind', 'loyal') && literacy(world) < 0.5 && world.faith >= 200 && world.works?.cathedral !== undefined && chance(rng, 0.15)) {
      return amend(world, { stateFaith: true }, 'ประกาศให้ศาสนาของเทพเจ้าเป็นศาสนาประจำรัฐ');
    }
    if (c.stateFaith && literacy(world) >= 0.5 && known(world, 'printing') && chance(rng, 0.2)) {
      return amend(world, { stateFaith: false }, 'แยกศาสนาออกจากรัฐ นักปราชญ์ค้นคว้าได้อย่างเสรี');
    }
  }

  // Oversight: a scandal or a reading town sets up the auditor; a strong, grasping ruler tears it down.
  if (r !== 'junta' && r !== 'theocracy') {
    if (!c.auditor && (recent(world, 730, /ข่าวฉาวสะเทือนเมือง|ยักยอก/) || (literacy(world) >= 0.5 && has(ruler, 'kind', 'loyal'))) && (r !== 'monarchy' || !strong) && chance(rng, 0.35)) {
      return amend(world, { auditor: true }, r === 'monarchy' ? `เหล่าขุนนางบีบกษัตริย์${ruler.name}ให้ตั้งผู้ตรวจการแผ่นดินเป็นองค์กรอิสระ` : 'ตั้งองค์กรอิสระ ผู้ตรวจการแผ่นดินตรวจสอบเจ้าหน้าที่รัฐได้ทุกคนรวมถึงผู้นำ');
    }
    if (c.auditor && ambitious && strong && chance(rng, 0.25)) {
      if (r === 'republic' && !popular) {
        log(world, 'politics', `ผู้นำ${ruler.name}เสนอยุบองค์กรอิสระ แต่สภาไม่ยอม`, ruler.id);
        return;
      }
      for (const n of adults(world)) if (literate(n)) loyaltyNudge(n, -8);
      return amend(world, { auditor: false }, `${title}${ruler.name}ยุบองค์กรอิสระ ผู้ตรวจการแผ่นดินหมดอำนาจ ชาวเมืองที่อ่านออกเขียนได้ไม่พอใจ`);
    }
    // The press: free once the town prints and reads; a ruler with something to hide muzzles it.
    if (!c.freePress && known(world, 'printing') && literacy(world) >= 0.4 && !ambitious && chance(rng, 0.3)) {
      return amend(world, { freePress: true }, 'รับรองเสรีภาพสื่อ โรงพิมพ์ตีพิมพ์เรื่องของผู้มีอำนาจได้');
    }
    if (c.freePress && ambitious && (ruler.record ?? []).some((x) => x.kind === 'corruption') && strong && chance(rng, 0.3)) {
      for (const n of adults(world)) if (literate(n)) loyaltyNudge(n, -6);
      return amend(world, { freePress: false }, `${title}${ruler.name}สั่งควบคุมโรงพิมพ์ ห้ามตีพิมพ์เรื่องของผู้ปกครอง`);
    }
  }

  // The market: a hoarding scandal teaches a gentle ruler to guide it; a ruler beholden to the
  // merchants writes in free trade.
  if (c.economy !== 'guided' && recent(world, 730, /มีความผิดฐานกักตุนสินค้า/) && has(ruler, 'kind', 'loyal') && chance(rng, 0.35)) {
    return amend(world, { economy: 'guided' }, 'หลังคดีกักตุนข้าว ประกาศให้รัฐกำกับตลาด คุมราคาและเก็บภาษีศุลกากรได้');
  }
  if (c.economy !== 'free' && r !== 'junta' && (r === 'oligarchy' || world.guilds.some((g) => g.kind === 'merchants' && influenceOf(world, g) >= 50)) && !has(ruler, 'kind') && chance(rng, 0.2)) {
    for (const n of adults(world)) if (n.job === 'merchant') loyaltyNudge(n, 5);
    return amend(world, { economy: 'free' }, 'ประกาศการค้าเสรี ยกเลิกภาษีศุลกากรและการคุมราคา พ่อค้าพอใจ');
  }

  // The guilds: banned by a fearful ruler, taxed by a grasping one, freed by a kind one.
  if (guildLaw(world, ruler, strong, title, rng)) return;

  // Land: a grasping or warlike ruler writes in conquest; a gentle one writes it out again.
  const policy = landPolicyOf(c);
  if (policy !== 'conquest' && r !== 'theocracy' && has(ruler, 'greedy', 'vengeful', 'brave') && !has(ruler, 'kind') && strong && chance(rng, 0.1)) {
    for (const n of adults(world)) if (has(n, 'kind')) loyaltyNudge(n, -4);
    return amend(world, { landPolicy: 'conquest' }, `${title}${ruler.name}แก้นโยบายดินแดน ให้ยกทัพยึดดินแดนเพื่อนบ้านได้`);
  }
  if (policy === 'conquest' && r !== 'junta' && has(ruler, 'kind', 'coward') && chance(rng, 0.3)) {
    return amend(world, { landPolicy: 'settle' }, 'ยกเลิกนโยบายพิชิต ขยายแผ่นดินด้วยการบุกเบิกและซื้อขายแทน');
  }
  if (policy === 'settle' && recent(world, 730, /อาณาจักรของเราแพ้สงคราม/) && has(ruler, 'kind', 'coward') && chance(rng, 0.25)) {
    return amend(world, { landPolicy: 'peace' }, 'หลังพ่ายแพ้สงคราม ประกาศนโยบายสันติ ห้ามรบเพื่อแย่งดินแดน');
  }
  // The villages: a breakaway teaches a gentle ruler to grant them a charter; a greedy one revokes it.
  if (!c.provinces && recent(world, 1095, /ประกาศแยกตัวเป็นอิสระ|แล้วพาหมู่บ้านไปขึ้นกับ/) && has(ruler, 'kind', 'loyal') && chance(rng, 0.4)) {
    return amend(world, { provinces: true }, 'ประกาศกฎบัตรหัวเมือง หมู่บ้านเก็บส่วนแบ่งผลผลิตได้อย่างน้อยหนึ่งในสี่และเลือกผู้ใหญ่บ้านเอง');
  }
  if (c.provinces && has(ruler, 'greedy') && strong && chance(rng, 0.2)) {
    return amend(world, { provinces: false }, `${title}${ruler.name}ยกเลิกกฎบัตรหัวเมือง เรียกเก็บส่วยได้เต็มที่`);
  }
}
