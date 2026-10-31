// One town run headless for the balance check: create a world, tick it for some years, and tally
// what happened, from the chronicle and from monthly samples. Bundled and run by run.mjs.
import { foundWorld, tick } from '../../src/sim/world';
import { rankOf } from '../../src/sim/growth';
import { ageOf } from '../../src/sim/ages';
import type { WorldState } from '../../src/sim/types';
import { creedCounts } from '../../src/sim/religion';

// Chronicle lines worth counting, by what they say.
const EVENTS: Record<string, RegExp> = {
  famine: /ข้าวหมดตลาด/,
  movement: /รวมตัวกันตั้ง|คนตั้ง(กลุ่ม|ขบวนการ|สหภาพ)/,
  march: /เดินขบวนไปหน้าวัง/,
  riot: /ก่อจลาจล!/,
  revolution: /บุกวัง หมายโค่น/,
  overthrown: /นำ.+โค่นกษัตริย์|ตั้งสภาประชาชน/,
  conceded: /ยอมตามข้อเรียกร้องของ/,
  crackdown: /สั่งทหารสลาย/,
  refused: /ไม่ยอมทำร้ายประชาชน/,
  ailing: /ประชวรหนัก ราชสำนัก/,
  mad: /เริ่มเสียสติ/,
  setAside: /ไม่อาจปกครองได้อีกต่อไป/,
  abdicated: /สละราชสมบัติให้/,
  regency: /เป็นผู้สำเร็จราชการแทน/,
  regentSeized: /^ผู้สำเร็จราชการ.+ไม่ยอมคืนอำนาจ/,
  succession: /^ศึกชิงบัลลังก์!/,
  selfCoup: /ประกาศภาวะฉุกเฉินและงดการเลือกตั้งไม่มีกำหนด/,
  rigged: /สั่งยัดหีบบัตรเลือกตั้ง/,
  counterCoup: /นำทหารยึดกองบัญชาการซ้อน/,
  promised: /ให้สัญญาว่าจะคืนอำนาจ/,
  handedBack: /รักษาสัญญา คืนอำนาจ/,
  putOff: /เลื่อนการเลือกตั้งออกไปอีก/,
  purged: /สั่งกวาดล้างผู้เห็นต่าง/,
  zealots: /ผู้คลั่งศาสนารุมทำร้าย/,
  ousted: /สภาพ่อค้าลงมติปลดประธาน/,
  party: /ก่อตั้งพรรค/,
  partyVote: /การเลือกตั้งทั่วไปครั้งที่/,
  coalition: /รัฐบาลผสม/,
  noConfidence: /ยื่นญัตติไม่ไว้วางใจ/,
  govFell: /รัฐบาลแพ้มติ/,
  crossed: /ข่าวลือว่ารับเงิน/,
  partySplit: /พาสมาชิก \d+ คนแยกจาก/,
  sweep: /ใช้เสียงข้างมากเด็ดขาดแก้รัฐธรรมนูญ/,
  brokePromise: /ผิดสัญญาที่หาเสียงไว้/,
  runoff: /เข้ารอบสอง/,
  constitutional: /พระราชทานรัฐธรรมนูญ|ยอมให้มีรัฐสภาจากการเลือกตั้ง/,
  commune: /สาธารณรัฐประชาชนถือกำเนิด|สถาปนาสาธารณรัฐประชาชน/,
  fiveYear: /แผนพัฒนาห้าปี/,
  peoplesEnemy: /ศัตรูของประชาชน/,
  fled: /ลักลอบหนีออกนอกเมือง/,
  thaw: /ปฏิรูปเปิดตลาด/,
  starvedOut: /ทิ้งเมืองไปเพราะความหิวโหย/,
  affair: /^(ข่าวฉาวหัวหน้าพรรค|ฝ่ายค้านเรียกร้องให้ยุบสภา|ศาสนจักรขอที่ดินสร้างวัด|นิกายขอสร้างโบสถ์ของตัวเอง|บ้านการค้าขอสิทธิ์ผูกขาด|บ้านการค้าใกล้ล้มละลาย|ทูตขอสู่ขอเชื่อมไมตรี|เจ้าชายต่างแดนขอลี้ภัย|ทูตชวนร่วมทัพ|ผู้ใหญ่บ้านขอปกครองตนเอง|โจรป่าขู่หมู่บ้าน|นักผจญภัยดังขอยศขุนนาง): .+เลือก「/,
  goldRush: /ร่อนพบเกล็ดทองคำ/,
  comet: /ดาวหางหางยาวสีเพลิง/,
  kidnap: /ถูกชุมโจรลักพาตัว/,
  pestilence: /กาฬโรคระบาดไปทั่วแผ่นดิน/,
  raid: /กองโจรม้าของ.+บุกปล้นชายแดน/,
  mill: /ลงทุนสร้าง(โรง)/,
  millBroke: /จ่ายค่าแรงไม่ไหว/,
  regime: /ร่างรัฐธรรมนูญฉบับใหม่/, // every change of government writes a new charter
  election: /การเลือกตั้งครั้งที่/,
  disaster: /แผ่นดินไหวครั้งใหญ่|น้ำท่วมใหญ่!|ภัยแล้งแผ่ไป|ฝนตกไม่หยุดทั้งวัน/,
  exodus: /เก็บข้าวของที่เหลือแล้วทิ้งเมือง/,
  plague: /คร่าชีวิตไป \d+ คน/,
  crisis: /ข่าวฉาวสะเทือนเมือง|นัดหยุดงาน|ลอบสังหาร|ทะเลาะกับ.+อย่างรุนแรง/,
  demon: /ตื่นจากนิทราใต้/,
  plagueLord: /แห่งโรคระบาดตื่นจาก/,
  flameLord: /แห่งเปลวเพลิงตื่นจาก/,
  shadowLord: /แห่งเงามืดตื่นจาก/,
  ironLord: /แห่งเหล็กกล้าตื่นจาก/,
  occupied: /เมืองแตก!/,
  slain: /ปราบจอมมาร.+ได้สำเร็จ/,
  general: /ขุนพลของจอมมาร.+ได้แล้ว!/,
  hero: /ให้ตื่นขึ้นเป็นผู้กล้า/,
  portent: /พระจันทร์ขึ้นเป็นสีเลือด|ข้าวในนาออกรวงสีดำ|สัตว์ป่าหนีออกจากป่า|ผนึกโบราณแตกร้าว/,
  discovery: /นักปราชญ์ค้นพบ/,
  murder: /ถูกฆาตกรรมอย่างเลือดเย็น/,
  convicted: /มีความผิดฐาน/,
  bribe: /จ่ายใต้โต๊ะ/,
  hanged: /ตัดสินประหารชีวิต/,
  settled: /ทางการส่งชาวบ้านไปบุกเบิก/,
  bought: /ยอมขาย.+ให้เรา/,
  ceded: /ทูตของเราเจรจากับ/,
  conquered: /ให้เราตามสัญญาสงบศึก/,
  landLost: /ยึด.+ไปจากเรา|จำต้องขาย/,
  moved: /ย้ายออกจากเมืองไปบุกเบิก/,
  plea: /ร้องขอความช่วยเหลือ/,
  seceded: /ประกาศแยกตัวเป็นอิสระ/,
  defected: /แล้วพาหมู่บ้านไปขึ้นกับ/,
  rejoined: /กลับมาขึ้นกับเมืองหลวง/,
  cameHome: /กลับมาขึ้นกับเมืองหลวงของเรา/,
  audited: /ผู้ตรวจการแผ่นดิน.+(พบหลักฐาน|พบว่า|เปิดโปง|ยื่นถอดถอน)/,
  impeached: /ยื่นถอดถอนผู้นำ/,
  auditorSet: /ตั้งองค์กรอิสระ|ตั้งผู้ตรวจการแผ่นดินเป็นองค์กรอิสระ/,
  auditorGone: /ยุบองค์กรอิสระ/,
  colonize: /พระราชโองการล่าอาณานิคม/,
  expand: /พระราชโองการขยายแผ่นดิน/,
  tribute: /พระราชโองการเกณฑ์ส่วยหัวเมือง/,
  relief: /พระราชโองการลดส่วยหัวเมือง/,
  garrison: /พระราชโองการส่งทหารรักษาหัวเมือง/,
  conquestLaw: /แก้นโยบายดินแดน/,
  provinces: /ประกาศกฎบัตรหัวเมือง/,
  landQuest: /ประกาศจ้างนักผจญภัยแรงก์ .+: (กวาดล้าง|ช่วย)/,
  lairCleared: /สิ้นซาก ดินแดนพร้อม|^กองทัพ.+กวาดล้าง/,
  robbed: /ไม่มีใครคุ้มกัน ถูกโจรดักปล้น/,
  heresy: /ถูกไต่สวนข้อหานอกรีต|ว่าใช้เวทมนตร์นอกรีต/,
  lobbied: /ล็อบบี้สภา/,
  endorsed: /ประกาศหนุน.+ในการเลือกตั้ง/,
  coupFoiled: /การยึดอำนาจของ.+ล้มเหลว/,
  guildBanned: /สั่งยุบกิลด์ทั้งหมด/,
  guildTaxed: /เก็บภาษีกิลด์/,
  guildLeft: /สมาชิก \d+ คนพากันย้ายไป/,
  mercs: /เป็นทหารรับจ้างในสงคราม/,
  heroExiled: /ระแวงชื่อเสียง/,
  hoard: /กักตุนข้าวไว้ในโกดัง/,
  hoardJailed: /มีความผิดฐานกักตุนสินค้า/,
  loan: /กู้เงิน \d+ ทองจาก/,
  repudiated: /ประกาศไม่ใช้หนี้/,
  debased: /พระราชโองการลดค่าเหรียญ/,
  pricier: /ข้าวของแพงขึ้นทั้งตลาด/,
  cold: /ต้องทนหนาวตลอดฤดู/,
  shipped: /ส่ง.+ไปขายที่/,
  tariff: /พระราชโองการภาษีศุลกากร/,
  embargo: /พระราชโองการห้ามค้ากับแคว้นศัตรู/,
  ceiling: /พระราชโองการคุมราคาข้าว/,
  treaty: /ลงนามสนธิสัญญาการค้า/,
  smuggled: /สินค้าเถื่อน/,
  freeTrade: /ประกาศการค้าเสรี/,
  guided: /ประกาศให้รัฐกำกับตลาด/,
  strike: /นัดหยุดงาน|หยุดงานประท้วง/,
  happening: /เลือก「/, // a happening decided
  homeBuilt: /จ้างช่างสร้างบ้านหลังใหม่/,
  homeRaised: /จ้างช่างต่อเติมบ้าน/,
  homelessLeft: /จึงทิ้งเมืองไปหาที่อยู่ใหม่/,
  founded: /สร้างเสร็จแล้ว! /,
  rankUp: /เติบโตขึ้นแล้ว!/,
};

export interface TownReport {
  seed: number;
  years: number;
  ms: number;
  pop: number;
  rank: number; // camp, village, town, city at the end
  rankYears: number[]; // the year each rank was first reached
  hunger: number; // hungry townsfolk summed over the monthly samples
  treasury: number;
  richest: number;
  monument: number;
  age: number;
  ageYears: number[]; // the year each age was reached
  techs: number;
  lands: number; // regions we hold, our own country included
  level: number; // the price level at the end
  villagers: number; // folk living out on our lands
  faith: number;
  believers: number; // share of grown townsfolk who keep the god's faith at the end
  piety: number; // their average piety
  weddings: number; // church weddings in the last year
  knowledge: number;
  regime: string;
  leaders: number; // different people who held power
  jobs: Record<string, number>; // grown townsfolk by trade at the end
  events: Record<string, number>;
}

export function runTown(seed: number, years: number): TownReport {
  const t0 = Date.now();
  const w: WorldState = foundWorld(seed); // as a new game starts: a pioneers' camp
  const events: Record<string, number> = Object.fromEntries(Object.keys(EVENTS).map((k) => [k, 0]));
  const ageYears: number[] = [0];
  const rankYears: number[] = [0];
  const leaders = new Set<number>();
  let reignFrom = 0;
  let longestReign = 0;
  let ruler = w.kingId;
  let hunger = 0;
  let seq = w.chronicleSeq;
  for (let d = 1; d <= years * 365; d++) {
    tick(w);
    if (w.kingId !== undefined) leaders.add(w.kingId);
    if (w.kingId !== ruler) {
      longestReign = Math.max(longestReign, d - reignFrom);
      reignFrom = d;
      ruler = w.kingId;
    }
    if (d % 30 === 0) hunger += w.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2).length;
    const a = ageOf(w);
    while (ageYears.length <= a) ageYears.push(Math.round(d / 365));
    if (d % 30 === 0) {
      const r = rankOf(w);
      while (rankYears.length <= r) rankYears.push(Math.round(d / 365));
    }
    for (const e of w.chronicle) {
      if (e.seq <= seq) continue;
      for (const [k, re] of Object.entries(EVENTS)) if (re.test(e.text)) events[k]++;
    }
    seq = w.chronicleSeq;
  }
  const alive = w.npcs.filter((n) => n.alive);
  const creeds = creedCounts(w);
  return {
    seed,
    years,
    ms: Date.now() - t0,
    pop: alive.length,
    rank: rankOf(w),
    rankYears,
    hunger,
    treasury: Math.round(w.treasury / (w.market?.level ?? 1)), // in today's coin's worth at the founding's prices
    richest: Math.round(Math.max(0, ...alive.map((n) => n.gold)) / (w.market?.level ?? 1)),
    monument: w.monument ?? 0,
    age: ageOf(w),
    ageYears,
    techs: Object.keys(w.techs ?? {}).length,
    lands: (w.regions ?? []).filter((r) => r.owner === 'us').length,
    level: Math.round((w.market?.level ?? 1) * 100) / 100,
    villagers: (w.villagers ?? []).filter((n) => n.alive && w.regions?.find((r) => r.id === n.regionId)?.owner === 'us').length,
    faith: Math.round(w.faith),
    believers: Math.round((creeds.god / Math.max(1, creeds.god + creeds.spirits + creeds.none)) * 100),
    piety: creeds.piety,
    weddings: w.religion?.weddings ?? 0,
    knowledge: Math.round(w.knowledge ?? 0),
    regime: `${w.regime ?? 'monarchy'}${w.charter?.parliament && (w.regime ?? 'monarchy') === 'monarchy' ? '+สภา' : ''}`,
    parties: (w.parties ?? []).map((p) => `${p.ideology}${p.seats ? `:${p.seats}` : ''}`).join(','),
    leaders: leaders.size,
    longestReign: Math.round((Math.max(longestReign, years * 365 - reignFrom) / 365) * 10) / 10,
    jobs: alive.filter((n) => n.age >= 16).reduce((m, n) => ((m[n.job] = (m[n.job] ?? 0) + 1), m), {} as Record<string, number>),
    events,
  };
}
