// Portents: the demon lord does not wake from nowhere. As the dread under the dungeon gathers,
// the town feels it, stage by stage: a blood moon and monsters loose at night, blackened ears
// of rice and the cult growing bolder, beasts fleeing the forest and fear in every house, and
// at the last the earth groaning over the breaking seal. Each stage is announced once; its
// troubles last while the dread stays that high.
import { pick, type Rng } from './rng';
import { clamp, log, loyaltyNudge } from './core';
import { DREAD_TO_RISE } from './demonlord';
import type { WorldState } from './types';

export const PORTENTS = [
  { at: 25, name: 'พระจันทร์สีเลือด', text: 'พระจันทร์ขึ้นเป็นสีเลือด เสียงหอนดังจากดันเจี้ยนทุกคืน เด็กๆ ฝันร้ายกันทั้งเมือง' },
  { at: 50, name: 'รวงข้าวสีดำ', text: 'ข้าวในนาออกรวงสีดำ ฝูงกาบินหนีจากเมือง ลัทธิมารเริ่มกล้าออกหน้า' },
  { at: 75, name: 'ป่าเงียบงัน', text: 'สัตว์ป่าหนีออกจากป่า ท้องฟ้ามืดลงทุกวัน ผู้คนกระซิบชื่อของบางสิ่งในความฝัน' },
  { at: 90, name: 'ผนึกแตกร้าว', text: 'แผ่นดินครางใต้ดันเจี้ยน ผนึกโบราณแตกร้าว จอมมารใกล้ตื่นเต็มที' },
] as const;

const DAY = 5; // day of the month the portents trouble the town

// The stage the dread has reached: 0 none, 1..4 the portents above.
export const portentOf = (world: WorldState) => {
  if (world.demon) return 0;
  const d = ((world.dread ?? 0) / DREAD_TO_RISE) * 100;
  return PORTENTS.filter((p) => d >= p.at).length;
};

// The harvest under blackened ears.
export const portentYield = (world: WorldState) => (portentOf(world) >= 2 ? 0.92 : 1);

export function portents(world: WorldState, rng: Rng): void {
  const stage = portentOf(world);
  const seen = world.portent ?? 0;
  if (stage > seen) log(world, 'cult', PORTENTS[stage - 1].text);
  // Once the dread ebbs well back, the next rise will be announced again.
  world.portent = stage > seen ? stage : Math.min(seen, stage + 1);
  if (!stage || world.day % 30 !== DAY) return;
  const grown = world.npcs.filter((n) => n.alive && n.age >= 16);
  // Blood moon: monsters roam at night and the dungeons swell.
  for (const d of world.dungeons) d.power += 2;
  if (stage >= 2 && world.cult) {
    // The cult walks openly: one more joins each month.
    const mark = grown.filter((n) => !n.cultist && n.morality < 20 && n.job !== 'king' && n.job !== 'priest' && !n.hero);
    if (mark.length) {
      const n = pick(rng, mark);
      n.cultist = true;
      n.morality = clamp(n.morality - 10, -100, 100);
    }
  }
  if (stage >= 3) {
    world.game = Math.max(0, (world.game ?? 0) - 2);
    for (const n of grown) loyaltyNudge(n, -1); // fear makes people turn on their rulers
  }
  if (stage >= 4) for (const d of world.dungeons) d.power += 3; // the seal cracks: the deep places boil
}
