// The town's words for power follow its regime. The game is written as if a king rules; under
// a republic, a theocracy, the merchants or the army the court's vocabulary is swapped for that
// regime's own: who rules, the treasury, the court, decrees, the knights, the army.
import type { Regime, WorldState } from './types';

export const RULER_TH: Record<Regime, string> = { monarchy: 'กษัตริย์', republic: 'ผู้นำสภา', theocracy: 'มหานักบวช', oligarchy: 'ประธานสมาคมการค้า', junta: 'จอมทัพ', commune: 'เลขาธิการพรรค' };
export const COUNCIL_TH: Record<Regime, string> = { monarchy: 'สภาขุนนาง', republic: 'รัฐสภา', theocracy: 'สภาสงฆ์', oligarchy: 'สภาพ่อค้า', junta: 'สภาขุนศึก', commune: 'กรมการเมือง' };

interface Words {
  treasury: string;
  court: string;
  decree: string;
  throne: string;
  knightsOf: string; // อัศวินแห่ง…
  army: string;
  own: string; // what replaces หลวง ("royal") on the town's buildings
  cheer: string; // what the crowd shouts
  dynasty: string; // the ruling class, as the people tab groups them
}

const WORDS: Record<Exclude<Regime, 'monarchy'>, Words> = {
  republic: { treasury: 'คลังเมือง', court: 'สภาเมือง', decree: 'กฤษฎีกา', throne: 'ตำแหน่งผู้นำ', knightsOf: 'สาธารณรัฐ', army: 'กองทัพสาธารณรัฐ', own: 'ประจำเมือง', cheer: 'สาธารณรัฐจงเจริญ!', dynasty: 'ผู้นำและขุนนางเก่า' },
  theocracy: { treasury: 'คลังศาสนจักร', court: 'ศาสนจักร', decree: 'พระบัญชาศาสนจักร', throne: 'บัลลังก์ศักดิ์สิทธิ์', knightsOf: 'ศาสนจักร', army: 'กองทัพศักดิ์สิทธิ์', own: 'ของศาสนจักร', cheer: 'สาธุ! เทพเจ้าคุ้มครอง!', dynasty: 'มหานักบวชและขุนนาง' },
  oligarchy: { treasury: 'คลังสมาคม', court: 'สมาคมการค้า', decree: 'มติสมาคม', throne: 'ตำแหน่งประธาน', knightsOf: 'สมาคม', army: 'กองทหารรับจ้าง', own: 'ของสมาคม', cheer: 'ขอให้ค้าขายร่ำรวย!', dynasty: 'ประธานและผู้มีอันจะกิน' },
  commune: { treasury: 'คลังประชาชน', court: 'คณะกรรมการกลางพรรค', decree: 'มติพรรค', throne: 'ตำแหน่งเลขาธิการ', knightsOf: 'ประชาชน', army: 'กองทัพประชาชน', own: 'ของประชาชน', cheer: 'ประชาชนจงเจริญ!', dynasty: 'เลขาธิการและแกนนำพรรค' },
  junta: { treasury: 'คลังกองทัพ', court: 'กองบัญชาการ', decree: 'คำสั่งคณะทหาร', throne: 'อำนาจปกครอง', knightsOf: 'คณะทหาร', army: 'กองทัพ', own: 'ของกองทัพ', cheer: 'จอมทัพจงเจริญ!', dynasty: 'จอมทัพและขุนนาง' },
};

// Phrase swaps, longest first so a short word never breaks up a longer phrase.
function phrases(r: Exclude<Regime, 'monarchy'>): [string, string][] {
  const w = WORDS[r];
  return [
    ['อัศวินแห่งราชบัลลังก์', `อัศวินแห่ง${w.knightsOf}`],
    ['อำนาจราชบัลลังก์', `อำนาจ${RULER_TH[r]}`],
    ['ทรงใช้พระราชอำนาจ', 'ใช้อำนาจ'],
    ['ราชวงศ์และขุนนาง', w.dynasty],
    ['บัลลังก์ว่างอยู่', `${w.throne}ว่างอยู่`],
    ['ขึ้นครองบัลลังก์', 'ขึ้นปกครอง'],
    ['ชิงบัลลังก์', 'ชิงอำนาจ'],
    ['ราชบัลลังก์', w.throne],
    ['ท้องพระคลัง', w.treasury],
    ['ราชสำนัก', w.court],
    ['พระราชโองการ', w.decree],
    ['พระราชทาน', 'มอบ'],
    ['ทรงพระเจริญ!', w.cheer],
    ['ข้าวราคาหลวง', 'ข้าวราคาถูก'],
    ['กองทัพหลวง', w.army],
    ['โรงเรียนหลวง', `โรงเรียน${w.own}`],
    ['ยุ้งฉางหลวง', `ยุ้งฉาง${w.own}`],
    ['ปลงพระชนม์', 'สังหาร'],
    ['สิ้นพระชนม์กะทันหัน', 'เสียชีวิตกะทันหัน'],
    ['ทูลกษัตริย์', 'แจ้งกษัตริย์'],
    ['ครองราชย์มาแล้ว', 'ปกครองมาแล้ว'],
    ['สภาขุนนาง', COUNCIL_TH[r]],
  ];
}

const TITLE = 'กษัตริย์';

// Rewrite text for the town's regime. In the chronicle (`strict`) only "king" followed by one of
// the town's own people becomes the ruler's title, so neighbours' kings stay kings; on the
// town's own panels every "king" means the town's ruler.
export function say(world: WorldState, text: string, strict = false): string {
  const r = world.regime;
  if (!r || r === 'monarchy') return text;
  for (const [from, to] of phrases(r)) text = text.replaceAll(from, to);
  if (!text.includes(TITLE)) return text;
  if (!strict) return text.replaceAll(TITLE, RULER_TH[r]);
  const names = world.npcs.map((n) => n.name);
  return text.replace(/กษัตริย์/g, (m, at: number) => (names.some((name) => text.startsWith(name, at + m.length)) ? RULER_TH[r] : m));
}
