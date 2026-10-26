// The annals: at the turn of each year the chronicle's year is boiled down to a page, so the
// player can see what the last few years were about at a glance. The chronicle itself only keeps
// its latest few hundred entries; the annals keep the shape of each year long after.
import { RULER_TH } from './lexicon';
import { rulerLook } from './government';
import type { ChronicleEntry, WorldState, YearRecord } from './types';

const KEPT = 10; // years of annals the save keeps
const HIGHLIGHTS = 5;

// How much an entry matters to the year's story, and the theme it gives the year.
const WEIGHTS: [RegExp, number, string?][] = [
  [/สาธารณรัฐถือกำเนิด|ตั้งคณะทหาร|ปกครองเมืองในนามของเทพเจ้า|รวมกันขึ้นปกครองเมือง|สละราชสมบัติ|ล้มการปกครองเดิม/, 11, 'regime'],
  [/ก้าวเข้าสู่สมัย/, 10, 'age'],
  [/ลุกฮือ/, 9, 'revolt'],
  [/ปราบจอมมาร.+ได้สำเร็จ/, 12, 'hero'],
  [/ยึดครองอาณาจักร|เมืองแตก/, 12, 'demon'],
  [/จอมมาร.+ตื่นจากนิทรา/, 11, 'demon'],
  [/สังหารมังกร/, 11, 'dragon'],
  [/มังกร.+บินมาเกาะ/, 10, 'dragon'],
  [/ประกาศสงคราม|ยกทัพ|บุกประตูเมือง/, 9, 'war'],
  [/สงครามจบลง/, 9, 'war'],
  [/ขึ้นครองบัลลังก์|ขึ้นปกครองเป็น/, 9, 'crown'],
  [/สิ้นพระชนม์|ปลงพระชนม์|ชิงบัลลังก์|ชิงอำนาจ/, 9, 'crown'],
  [/การเลือกตั้งครั้งที่/, 7, 'election'],
  [/นักปราชญ์ค้นพบ/, 7, 'discovery'],
  [/โรคระบาด/, 8, 'plague'],
  [/มอนสเตอร์ล้นออกจาก/, 7, 'stampede'],
  [/สร้างเสร็จ/, 7, 'works'],
  [/ข้าวหมดตลาด|ทิ้งเมืองไปเพราะความหิวโหย/, 6, 'famine'],
  [/ค้นพบ/, 6],
  [/ตื่นขึ้นเป็นผู้กล้า/, 8, 'hero'],
  [/ปราบ.+แห่ง/, 6],
  [/ออกพระราชโองการ/, 5],
  [/อภิเษก|พันธมิตร/, 5],
  [/ลัทธิ/, 4],
  [/เลื่อนเป็นนักผจญภัยแรงก์ [AS]|ขึ้นสู่แรงก์ [AS]/, 4],
  [/โรคระบาดในคอกสัตว์/, 4],
];

// The year's name and picture, from its most telling theme.
const THEMES: Record<string, { title: string; art: string }> = {
  hero: { title: 'ปีแห่งผู้กล้า', art: 'characters/hero' },
  demon: { title: 'ปีแห่งจอมมาร', art: 'monsters/demon-lord' },
  dragon: { title: 'ปีแห่งมังกร', art: 'monsters/dragon' },
  war: { title: 'ปีแห่งสงคราม', art: 'monsters/raider' },
  crown: { title: 'ปีผลัดแผ่นดิน', art: 'characters/king' },
  plague: { title: 'ปีแห่งโรคระบาด', art: 'icons/plague' },
  stampede: { title: 'ปีมอนสเตอร์บุกเมือง', art: 'monsters/goblin' },
  famine: { title: 'ปีข้าวยากหมากแพง', art: 'icons/grain' },
  works: { title: 'ปีแห่งการก่อสร้าง', art: 'buildings/scaffold' },
  golden: { title: 'ปีทองแห่งความรุ่งเรือง', art: 'icons/gold' },
  regime: { title: 'ปีเปลี่ยนการปกครอง', art: 'icons/banner' },
  revolt: { title: 'ปีแห่งการลุกฮือ', art: 'icons/sword' },
  age: { title: 'ปีก้าวสู่สมัยใหม่', art: 'buildings/clocktower' },
  discovery: { title: 'ปีแห่งการค้นพบ', art: 'icons/book' },
  election: { title: 'ปีเลือกตั้ง', art: 'characters/consul' },
  calm: { title: 'ปีสงบสุข', art: 'characters/farmer' },
};
const THEME_ORDER = ['hero', 'demon', 'dragon', 'war', 'regime', 'revolt', 'crown', 'age', 'plague', 'stampede', 'famine', 'discovery', 'election', 'works'];

// Our own town's news first: quest reports and single deaths are the chronicle's daily bread, and
// a neighbour's troubles only matter to us when it's our war.
function weigh(world: WorldState, e: ChronicleEntry): [RegExp, number, string?] | undefined {
  if (/เควส|ออกเดินทาง/.test(e.text)) return undefined;
  if (e.kind === 'death' && !/กษัตริย์|ผู้นำสภา|มหานักบวช|ประธานสมาคม|จอมทัพ|ผู้กล้า|มังกร|จอมมาร/.test(e.text)) return undefined;
  const w = WEIGHTS.find(([re]) => re.test(e.text));
  if (!w || w[2] === 'war' || w[2] === 'hero') return w;
  const abroad = (world.realms ?? []).some((r) => e.text.includes(r.name));
  return abroad ? [w[0], 3] : w;
}

// A year's page, from the chronicle entries between two days. Also used live for the year so far.
export function yearPage(world: WorldState, year: number, from: number, to: number, pop: number[], gold: number[]): YearRecord {
  const entries = world.chronicle.filter((e) => e.day > from && e.day <= to);
  const count = (re: RegExp) => entries.filter((e) => re.test(e.text)).length;
  const scored = entries
    .map((e) => ({ e, w: weigh(world, e) }))
    .filter((x) => x.w)
    .sort((a, b) => b.w![1] - a.w![1] || b.e.seq - a.e.seq);
  const seen = new Set<string>();
  const highlights: YearRecord['highlights'] = [];
  for (const { e } of scored) {
    const gist = e.text.slice(0, 14); // the same news told twice (raid after raid) shows once
    if (seen.has(gist)) continue;
    seen.add(gist);
    highlights.push({ day: e.day, kind: e.kind, text: e.text, npcId: e.npcId });
    if (highlights.length >= HIGHLIGHTS) break;
  }
  highlights.sort((a, b) => a.day - b.day);
  const themes = new Set(scored.map((x) => x.w![2]).filter(Boolean));
  const theme = THEME_ORDER.find((t) => themes.has(t)) ?? ((world.golden ?? 0) >= 6 ? 'golden' : 'calm');
  const king = world.npcs.find((n) => n.id === world.kingId);
  return {
    year,
    title: THEMES[theme].title,
    art: theme === 'crown' ? `characters/${rulerLook(world)}` : THEMES[theme].art, // the new ruler, as the regime dresses them
    pop,
    gold,
    born: count(/ต้อนรับลูกคนใหม่/),
    died: entries.filter((e) => e.kind === 'death').length,
    arrived: count(/มาถึงเมือง/),
    left: count(/ทิ้งเมือง/),
    king: king?.alive && king.job === 'king' ? king.name : undefined,
    ruler: RULER_TH[world.regime ?? 'monarchy'],
    highlights,
  };
}

// Once a month sample the town; at each year's end write its page.
export function annalsDay(world: WorldState): void {
  if (world.day % 30 === 0) {
    const s = (world.yearSamples ??= { pop: [], gold: [] });
    s.pop.push(world.npcs.filter((n) => n.alive).length);
    s.gold.push(Math.round(world.treasury));
  }
  if (world.day % 365 !== 0) return;
  const s = world.yearSamples ?? { pop: [], gold: [] };
  const page = yearPage(world, world.day / 365, world.day - 365, world.day, s.pop, s.gold);
  world.annals = [...(world.annals ?? []), page].slice(-KEPT);
  world.yearSamples = { pop: [], gold: [] };
}
