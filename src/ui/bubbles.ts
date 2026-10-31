import { ADULT_AGE, CAUSE_TH, cursed, say as reword, seasonOf, weatherOf, type EventKind, type Job, type Npc, type Regime, type WorldState } from '../sim';

// Short reactions that pop over an NPC's head when something happens to them.
const LINES: Partial<Record<EventKind, string[]>> = {
  battle: ['ชนะแล้ว!', 'เลเวลอัป!', 'ได้ของแล้ว!', 'แค่นี้เองเหรอ!'],
  theft: ['หึหึ…', 'ได้ทองมาแล้ว'],
  bless: ['อบอุ่นจัง…', 'ขอบคุณเทพเจ้า!', 'รู้สึกมีพลัง!'],
  curse: ['อ๊บ!?', 'ทำไมเป็นกบ!', 'ตัวเย็นวาบ…'],
  dream: ['ฝันประหลาด…', 'ฝันอะไรเนี่ย', 'ตื่นแล้ว… ใจเต้นแรง'],
  quest: ['ออกผจญภัยกัน!', 'เควสนี้ข้าขอ!', 'กลับมาแล้ว!'],
  rank: ['เลื่อนแรงก์แล้ว!', 'ข้าเก่งขึ้นอีกขั้น!'],
  bond: ['เพื่อนกันนะ!', 'ดีใจที่ได้รู้จัก!'],
  trade: ['ขายดีจัง!', 'กลับมาพร้อมของแล้ว!', 'ไปค้าขายกัน!'],
  politics: ['ทรงพระเจริญ!', 'ข้าจะรับใช้อาณาจักร', 'ไม่ไหวแล้ว!'],
  cult: ['…', 'ท่านจอมมาร…', 'ความมืดจงเจริญ'],
  guild: ['ยินดีต้อนรับสู่กิลด์!', 'กิลด์ของเราต้องยิ่งใหญ่!'],
};

// What people say about their work as they go about it.
const WORK: Partial<Record<Job, string[]>> = {
  farmer: ['ปลูกข้าวกันเถอะ', 'ข้าวงามดีนะปีนี้', 'ปวดหลังจัง…'],
  alchemist: ['ใส่ผงนี่อีกนิด...', 'ระวัง! ร้อนนะ', 'ยาสูตรนี้ต้องได้ผล'],
  engineer: ['ตรงนี้ต้องเสริมคาน', 'วัดอีกรอบดีกว่า', 'แบบแปลนเสร็จแล้ว'],
  builder: ['ยกคานขึ้นไป!', 'อีกนิดเดียวก็เสร็จ', 'บ้านหลังนี้ต้องแข็งแรงกว่าเดิม'],
  doctor: ['หายใจลึกๆ นะ', 'กินยาวันละสามเวลา', 'ล้างมือก่อนกินข้าว!'],
  watchman: ['หยุดนะ!', 'คืนนี้เงียบดี', 'มีอะไรผิดปกติไหม'],
  judge: ['ความยุติธรรมต้องมาก่อน', 'คดีนี้ซับซ้อนนัก', 'ศาลขอพักการพิจารณา'],
  lawyer: ['ลูกความของข้าบริสุทธิ์!', 'คัดค้าน!', 'หลักฐานไม่พอนะท่าน'],
  scholar: ['ตำราเล่มนี้ยังอ่านไม่จบ', 'ทำไมดาวถึงเคลื่อนนะ', 'จดไว้ก่อนเดี๋ยวลืม'],
  herder: ['มอ~ มาเร็วๆ', 'นับแกะได้กี่ตัวแล้วนะ', 'ไปกินหญ้าตรงโน้นกัน'],
  hunter: ['ชู่ว… มีกวาง', 'ลูกศรดอกนี้ต้องโดน', 'รอยเท้าสดๆ เลย'],
  merchant: ['ของดีราคาถูกจ้า!', 'แวะดูก่อนได้นะ', 'กำไรนิดหน่อยก็ยังดี'],
  blacksmith: ['เคร้ง! เคร้ง!', 'ดาบเล่มนี้คมกริบ', 'ร้อนจริงๆ'],
  innkeeper: ['เบียร์สดๆ จ้า!', 'ห้องว่างยังมีนะ', 'วันนี้ลูกค้าเยอะ'],
  courtesan: ['แวะมาสิจ๊ะ~', 'คืนนี้ว่างไหม~'],
  priest: ['ขอพรจงสถิต', 'เทพเจ้าทรงเห็นทุกสิ่ง', 'มาสวดภาวนากัน'],
  soldier: ['ไม่มีอะไรผิดปกติ', 'เฝ้ายามต่อไป', 'ใครน่าสงสัยบ้างนะ'],
  noble: ['ชาวบ้านพวกนี้…', 'ภาษีเดือนนี้เท่าไหร่นะ', 'ชาสักถ้วยไหม'],
  king: ['ข้าคือราชา', 'อาณาจักรของข้างดงาม', 'ทหารของข้าอยู่ไหน'],
  thief: ['กระเป๋าใครหนักๆ นะ…', 'อย่ามองข้าแบบนั้น', 'วันนี้ว่างงาน…'],
  swordsman: ['วันนี้ไปล่ามอนดีไหม', 'ดาบข้าคันมือแล้ว', 'อยากได้เควสแรงก์สูง'],
  mage: ['ร่ายเวทใหม่ได้แล้ว', 'มานาเต็มแล้ว', 'อ่านคัมภีร์ต่อดีกว่า'],
};
// When the event's own words say how it went, the line follows them.
const BY_WORD: [string, string][] = [
  ['แต่งงาน', 'รักนะ!'],
  ['จับ', 'โดนจับซะแล้ว!'],
  ['ศัตรู', 'ไม่ถูกชะตาเลย!'],
  ['ล้มเหลว', 'ไม่น่าเลย…'],
  ['หนีทัพ', 'ไม่ทนแล้ว!'],
];
const KIDS = ['เล่นซ่อนแอบกัน!', 'แม่จ๋า~', 'โตขึ้นจะเป็นผู้กล้า!', 'จับไม่ได้หรอก!'];
const IDLE = ['อากาศดีจัง', 'เบื่อจัง~', 'วันนี้กินอะไรดี', 'ฮัมเพลงไปเรื่อย~', 'ง่วงจัง…'];

const LIFETIME_MS = 2800;
// Kept sparse so the map stays calm: a few at a time, never two popping at once.
const MAX_BUBBLES = 3;
const GAP_MS = 900; // least time between two new bubbles
const CHATTER = 0.25; // chance each day that someone on screen says something

interface Bubble {
  el: HTMLElement;
  npcId: number;
  until: number;
}

const layer = document.getElementById('bubbles')!;
let bubbles: Bubble[] = [];
let lastSeq = -1;
let lastDay = -1;
let lastSaid = 0;
let locate: (id: number) => { x: number; y: number } | null = () => null;

export function initBubbles(locator: typeof locate): void {
  locate = locator;
  requestAnimationFrame(frame);
}

export function pushBubbles(world: WorldState, selected: number | null = null): void {
  // Skip the backlog on first load (and after offline catch-up): only react to live events.
  if (lastSeq < 0) {
    lastSeq = world.chronicleSeq;
    lastDay = world.day;
    return;
  }
  for (const e of world.chronicle) {
    if (e.seq <= lastSeq || e.npcId === undefined) continue;
    const lines = LINES[e.kind];
    if (!lines) continue;
    const word = BY_WORD.find(([w]) => e.text.includes(w));
    say(e.npcId, reword(world, word ? word[1] : lines[e.seq % lines.length]));
  }
  lastSeq = world.chronicleSeq;
  // Ambient chatter once per new day, so pausing doesn't flood the screen.
  if (world.day !== lastDay) {
    lastDay = world.day;
    const sel = selected === null ? undefined : world.npcs.find((n) => n.id === selected && n.alive);
    if (sel && Math.random() < 0.2) chatter(world, sel);
    if (bubbles.length < 2 && Math.random() < CHATTER) {
      const near = world.npcs.filter((n) => n.alive && n.inside === undefined && locate(n.id));
      if (near.length) chatter(world, near[Math.floor(Math.random() * near.length)]);
    }
  }
}

function chatter(world: WorldState, n: Npc): void {
  const line = lineFor(world, n);
  if (line) say(n.id, reword(world, line));
}

// What a ruler says outside a monarchy.
const RULER_LINES: Record<Exclude<Regime, 'monarchy'>, string[]> = {
  republic: ['ข้ารับใช้ประชาชน', 'อย่าลืมไปเลือกตั้งนะ', 'สภาต้องฟังเสียงทุกคน'],
  theocracy: ['เทพเจ้าทรงนำทางเรา', 'จงสวดภาวนาทุกเช้า', 'ศรัทธาคือกฎหมาย'],
  oligarchy: ['ทองคือพลัง', 'การค้าต้องไม่หยุด', 'กำไรปีนี้สวยมาก'],
  junta: ['ระเบียบต้องมาก่อน!', 'ทหาร ตรงไป!', 'ห้ามใครขัดคำสั่ง'],
};

const any = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

// What this person would say right now, from the most pressing thing on their mind down.
function lineFor(world: WorldState, n: Npc): string | undefined {
  if (n.age < ADULT_AGE) return any(KIDS);
  const p = n.plan?.kind;
  if (p === 'protest' && world.movement) return any([`${CAUSE_TH[world.movement.cause].demand}!`, 'ประชาชนต้องมีเสียง!', 'ไม่ฟังเรา เราไม่กลับ!', 'สู้ ๆ พี่น้อง!']);
  if (p === 'pray') return any(['วันนี้วันพระ ไปโบสถ์กัน', 'ขอเทพเจ้าคุ้มครอง', 'ทำบุญสักหน่อย']);
  if (p === 'ritual') return any(['(กระซิบ) ไปที่ดันเจี้ยน…', 'อย่าให้ใครเห็น…']);
  if (p === 'steal') return any(['เป้าหมายอยู่ตรงนั้น…', 'ค่อยๆ ย่องไป…']);
  if (p === 'flee') return any(['หนีเร็ว!', 'ไม่ได้ทำอะไรนะ!']);
  if (p === 'caravan') return any(['ออกเดินทางค้าขาย!', 'ระวังโจรป่าด้วยนะ']);
  if (p === 'haul') return any(['กลับบ้านแล้ว!', 'เกวียนเต็มเลย']);
  if (p === 'crusade') return any(['จอมมาร รอข้าก่อน!', 'เพื่อทุกคน!']);
  if (p === 'adventure') return any(['ไปดันเจี้ยนกัน!', 'ขอให้ได้ของดี']);
  if (p === 'buy') return any(['ซื้อดาบใหม่ดีกว่า', 'เกราะนี่ดีนะ']);
  if ((n.hunger ?? 0) >= 2) return any(['หิวจัง…', 'ไม่มีอะไรกินเลย', 'ข้าวแพงเกินไปแล้ว']);
  if (cursed(world, n)) return any(['อ๊บ… ตัวยังเย็นอยู่เลย', 'ใครสาปข้านะ…']);
  if (n.hero) return any(['ข้าจะปกป้องทุกคน!', 'ต้องเก่งขึ้นอีก!']);
  const r = Math.random();
  if (world.demon?.stage === 'occupied' && r < 0.5) return any(['เมื่อไหร่ผู้กล้าจะมา…', 'ส่วยอีกแล้วเหรอ', 'อย่าให้ปีศาจได้ยินนะ']);
  if (world.demon && r < 0.3) return any(['ได้ยินว่าจอมมารตื่นแล้ว…', 'ปราสาทนั่นน่ากลัวจัง']);
  const weather = weatherOf(world);
  if (weather === 'rain' && r < 0.4) return any(['ฝนดีจัง ข้าวงามแน่', 'เปียกหมดเลย!', 'ขอบคุณสำหรับฝน']);
  if (weather === 'blight' && r < 0.4) return any(['ข้าวเน่าหมดแล้ว…', 'ปีนี้จะอดตายไหม']);
  if (weather === 'drought' && r < 0.4) return any(['ร้อนจะตายอยู่แล้ว', 'บ่อน้ำแห้งหมดแล้ว…', 'ขอฝนสักหยดเถอะ']);
  if (weather === 'deluge' && r < 0.4) return any(['ฝนไม่หยุดเลย…', 'บ้านรั่วหมดแล้ว', 'ข้าวขึ้นราหมดแล้ว']);
  if (world.ruins?.length && r < 0.15) return any(['บ้านฉันพังหมดแล้ว…', 'ต้องสร้างใหม่ทั้งหมด', 'ไม่มีที่ซุกหัวนอน']);
  if (n.cultist && r < 0.15) return '(กระซิบ) คืนนี้ที่ดันเจี้ยน…';
  if ((n.loyalty ?? 50) < 30 && n.job !== 'king' && r < 0.4) return any(['ภาษีแพงจัง', 'กษัตริย์ไม่เคยสนเราเลย', 'สักวันจะลุกฮือ!']);
  if (seasonOf(world.day) === 'winter' && r < 0.2) return any(['หนาวจัง…', 'อยากนั่งข้างเตาผิง']);
  const friend = friendNear(world, n);
  if (friend && r < 0.25) return `สวัสดี ${friend.name}!`;
  if (n.job === 'king' && world.regime && world.regime !== 'monarchy') return any(RULER_LINES[world.regime]);
  if (p === 'work' && WORK[n.job]) return any(WORK[n.job]!);
  return any(r < 0.5 && WORK[n.job] ? WORK[n.job]! : IDLE);
}

// A friend standing next to them, to wave at.
function friendNear(world: WorldState, n: Npc): Npc | undefined {
  return world.npcs.find((o) => {
    if (o === n || !o.alive || o.inside !== undefined || Math.abs(o.x - n.x) + Math.abs(o.y - n.y) > 2) return false;
    const key = n.id < o.id ? `${n.id}-${o.id}` : `${o.id}-${n.id}`;
    return (world.ties[key] ?? 0) >= 15;
  });
}

function say(npcId: number, text: string): void {
  if (!locate(npcId)) return; // off screen or out of sight: nobody to hear it
  // Busy screen, someone just spoke, or another bubble already sits right there: let this one pass.
  const now = performance.now();
  const at = locate(npcId)!;
  const crowded = bubbles.some((o) => {
    if (o.npcId === npcId) return false;
    const p = locate(o.npcId);
    return !!p && Math.abs(p.x - at.x) < 90 && Math.abs(p.y - at.y) < 30;
  });
  if (crowded) return;
  if (now - lastSaid < GAP_MS || bubbles.filter((b) => b.npcId !== npcId).length >= MAX_BUBBLES) return;
  lastSaid = now;
  const old = bubbles.find((b) => b.npcId === npcId);
  if (old) {
    old.el.remove();
    bubbles = bubbles.filter((b) => b !== old);
  }
  const node = document.createElement('span');
  node.className = 'bubble';
  node.textContent = text;
  layer.append(node);
  bubbles.push({ el: node, npcId, until: performance.now() + LIFETIME_MS });
}

function frame(now: number): void {
  bubbles = bubbles.filter((b) => {
    const pos = locate(b.npcId);
    if (!pos || now > b.until) {
      b.el.remove();
      return false;
    }
    b.el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px) translate(-50%, calc(-100% - 10px))`;
    b.el.style.visibility = 'visible';
    return true;
  });
  requestAnimationFrame(frame);
}
