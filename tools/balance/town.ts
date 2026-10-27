// One town run headless for the balance check: create a world, tick it for some years, and tally
// what happened, from the chronicle and from monthly samples. Bundled and run by run.mjs.
import { createWorld, tick } from '../../src/sim/world';
import { ageOf } from '../../src/sim/ages';
import type { WorldState } from '../../src/sim/types';

// Chronicle lines worth counting, by what they say.
const EVENTS: Record<string, RegExp> = {
  famine: /ข้าวหมดตลาด/,
  starvedOut: /ทิ้งเมืองไปเพราะความหิวโหย/,
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
};

export interface TownReport {
  seed: number;
  years: number;
  ms: number;
  pop: number;
  hunger: number; // hungry townsfolk summed over the monthly samples
  treasury: number;
  richest: number;
  monument: number;
  age: number;
  ageYears: number[]; // the year each age was reached
  techs: number;
  lands: number; // regions we hold, our own country included
  villagers: number; // folk living out on our lands
  faith: number;
  knowledge: number;
  regime: string;
  leaders: number; // different people who held power
  jobs: Record<string, number>; // grown townsfolk by trade at the end
  events: Record<string, number>;
}

export function runTown(seed: number, years: number): TownReport {
  const t0 = Date.now();
  const w: WorldState = createWorld(seed);
  const events: Record<string, number> = Object.fromEntries(Object.keys(EVENTS).map((k) => [k, 0]));
  const ageYears: number[] = [0];
  const leaders = new Set<number>();
  let hunger = 0;
  let seq = w.chronicleSeq;
  for (let d = 1; d <= years * 365; d++) {
    tick(w);
    if (w.kingId !== undefined) leaders.add(w.kingId);
    if (d % 30 === 0) hunger += w.npcs.filter((n) => n.alive && (n.hunger ?? 0) >= 2).length;
    const a = ageOf(w);
    while (ageYears.length <= a) ageYears.push(Math.round(d / 365));
    for (const e of w.chronicle) {
      if (e.seq <= seq) continue;
      for (const [k, re] of Object.entries(EVENTS)) if (re.test(e.text)) events[k]++;
    }
    seq = w.chronicleSeq;
  }
  const alive = w.npcs.filter((n) => n.alive);
  return {
    seed,
    years,
    ms: Date.now() - t0,
    pop: alive.length,
    hunger,
    treasury: Math.round(w.treasury),
    richest: Math.round(Math.max(0, ...alive.map((n) => n.gold))),
    monument: w.monument ?? 0,
    age: ageOf(w),
    ageYears,
    techs: Object.keys(w.techs ?? {}).length,
    lands: (w.regions ?? []).filter((r) => r.owner === 'us').length,
    villagers: (w.villagers ?? []).filter((n) => n.alive && w.regions?.find((r) => r.id === n.regionId)?.owner === 'us').length,
    faith: Math.round(w.faith),
    knowledge: Math.round(w.knowledge ?? 0),
    regime: w.regime ?? 'monarchy',
    leaders: leaders.size,
    jobs: alive.filter((n) => n.age >= 16).reduce((m, n) => ((m[n.job] = (m[n.job] ?? 0) + 1), m), {} as Record<string, number>),
    events,
  };
}
