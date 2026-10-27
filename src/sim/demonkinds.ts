// The kinds of demon lord. Which one wakes depends on what the town has become: a sick and
// crowded town draws the lord of plague, a cruel or divided one the lord of shadow, a town of
// factories the lord of iron, and anything else the lord of flame. Each one, while it walks or
// rules, strikes where its nature leads: the plague lord sends sickness, the flame lord burns
// homes and the crown's works, the shadow lord turns hearts and sends knives, and the iron lord
// strips the shop of arms and turns the factory's fires to its own forges.
import { chance, int, pick, type Rng } from './rng';
import { log, loyaltyNudge } from './core';
import { plagueStrike } from './worldevents';
import { collapse, ruinHomes } from './disasters';
import { assassination } from './crises';
import { MAX_CULTISTS } from './cult';
import { ensureMarket } from './market';
import { approval } from './politics';
import { ageOf } from './ages';
import { WORK_ORDER } from './works';
import { TOWN_SIZE } from './town';
import type { DemonKind, DemonLord, WorldState } from './types';

export const DEMON_KINDS: Record<DemonKind, { title: string; text: string; tint: number; hue: number }> = {
  plague: { title: 'แห่งโรคระบาด', text: 'ส่งไอพิษให้โรคระบาดแพร่ในเมืองและอาณาจักรรอบข้าง', tint: 0x9cff7a, hue: 90 },
  flame: { title: 'แห่งเปลวเพลิง', text: 'เผาบ้านเรือนและอาคารหลวงจนพังทลาย', tint: 0xff9a6a, hue: 0 },
  shadow: { title: 'แห่งเงามืด', text: 'กระซิบให้ผู้คนเข้าลัทธิ และส่งมือสังหารไปหาผู้ปกครอง', tint: 0xa98aff, hue: 250 },
  iron: { title: 'แห่งเหล็กกล้า', text: 'ขโมยอาวุธจากร้านค้า ทัพปีศาจถือเหล็กกล้า บุกเมืองแรงขึ้น', tint: 0xc8d2dc, hue: 180 },
};
const DAY = 11; // day of the month the lord's nature shows

// The lord's three lieutenants, by its kind.
export const GENERALS: Record<DemonKind, string[]> = {
  plague: ['ราชันย์หนอนเน่า', 'แม่มดไอพิษ', 'อัศวินโรคห่า'],
  flame: ['ยักษ์ลาวา', 'จอมเวทเถ้าถ่าน', 'มังกรเพลิงน้อย'],
  shadow: ['ภูตกระซิบ', 'ราชินีฝันร้าย', 'นักฆ่าไร้เงา'],
  iron: ['ปีศาจเตาหลอม', 'แม่ทัพเหล็กกล้า', 'ยักษ์จักรกล'],
};

// What wakes, from what the town has become.
export function kindFor(world: WorldState, rng: Rng): DemonKind {
  const recent = world.chronicle.filter((e) => e.day > world.day - 730);
  const cult = world.npcs.filter((n) => n.alive && n.cultist).length;
  const open: DemonKind[] = ['flame'];
  if (ageOf(world) >= 3 || world.works?.factory !== undefined) open.push('iron', 'iron');
  if (recent.filter((e) => e.text.includes('คร่าชีวิตไป')).length >= 2 || world.npcs.filter((n) => n.alive).length >= TOWN_SIZE - 5) open.push('plague', 'plague');
  if (cult >= 4 || approval(world) < 40) open.push('shadow', 'shadow');
  return pick(rng, open);
}

export const demonTitle = (lord: DemonLord) => `จอมมาร${lord.name}${lord.kind ? DEMON_KINDS[lord.kind].title : ''}`;

// Monthly, while it walks or rules.
export function demonNature(world: WorldState, lord: DemonLord, rng: Rng): void {
  if (world.day % 30 !== DAY || !lord.kind) return;
  const grown = world.npcs.filter((n) => n.alive && n.age >= 16 && n.inside === undefined);
  switch (lord.kind) {
    case 'plague': {
      if (!chance(rng, 0.35)) return;
      plagueStrike(world, rng, 0.4, `ไอพิษสีเขียวลอยมาจากปราสาทของ${demonTitle(lord)}`);
      const near = (world.realms ?? []).filter((r) => !r.fallen && (r.plagueUntil ?? 0) <= world.day);
      if (near.length) pick(rng, near).plagueUntil = world.day + 120;
      return;
    }
    case 'flame': {
      if (!chance(rng, 0.35)) return;
      const homes = ruinHomes(world, rng, int(rng, 1, 2));
      const standing = WORK_ORDER.filter((k) => world.works?.[k] !== undefined);
      const fell = standing.length && chance(rng, 0.25) ? collapse(world, pick(rng, standing)) : '';
      log(world, 'disaster', `ลูกไฟจากปราสาทของ${demonTitle(lord)}ตกใส่เมือง บ้านไหม้ ${homes} หลัง${fell ? ` ${fell}` : ''}`);
      return;
    }
    case 'shadow': {
      for (const n of grown) loyaltyNudge(n, -2);
      if (lord.stage !== 'risen') return; // once the town is taken its whispers are done
      const marks = grown.filter((n) => !n.cultist && !n.hero && n.job !== 'king' && n.job !== 'priest' && n.morality < 30);
      for (let i = 0; i < 2 && marks.length && grown.filter((n) => n.cultist).length < MAX_CULTISTS; i++) {
        const n = marks.splice(int(rng, 0, marks.length - 1), 1)[0];
        n.cultist = true;
        n.morality -= 15;
      }
      if (chance(rng, 0.2)) assassination(world, rng);
      return;
    }
    case 'iron': {
      const m = ensureMarket(world);
      const took = Math.min(m.stock.gear, 3);
      m.stock.gear -= took;
      if (took) log(world, 'disaster', `ปีศาจเหล็กลอบขนอาวุธ ${took} ชุดออกจากร้านค้าไปให้ทัพของ${demonTitle(lord)}`);
      return;
    }
  }
}
