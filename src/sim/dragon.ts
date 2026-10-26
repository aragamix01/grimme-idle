// A dragon drawn by a fat treasury. It roosts on the hills past the forest and every couple of
// weeks comes for more: the town's strongest ride out to meet it, and whatever they can't stop
// it burns and carries off. Bring it down and its hoard is theirs; hold out long enough and it
// flies off with what it took.
import { chance, int, pick, type Rng } from './rng';
import { kill, log } from './core';
import { legend } from './quests';
import { might } from './market';
import { sway } from './cult';
import { RELIC_POWER } from './dungeons';
import type { Npc, WorldState } from './types';

export const DRAGON_GOLD = 1500; // a treasury past this smells of gold for miles
const DRAGON_HP = 600;
const STRIKE_EVERY = 15;
const STAYS = 150; // days before it tires of the town and leaves with its hoard
const CHAMPIONS = 6;
const BURN = 0.15; // share of the treasury each unanswered strike carries off
const NAMES = ['อิกนิสเกล็ดชาด', 'วาร์กาเพลิงทมิฬ', 'เซราฟีนปีกทอง', 'โมรากอธผู้กลืนเมือง', 'ไฟร์ฟางเขี้ยวลาวา'];
export const DRAGON_RELIC = 'เกล็ดมังกร';

// The dragon flies in when the treasury is rich enough to draw it. False if it's already here.
export function dragonArrives(world: WorldState, rng: Rng): boolean {
  if (world.dragon || world.treasury < DRAGON_GOLD) return false;
  const name = pick(rng, NAMES);
  world.dragon = { name, hp: DRAGON_HP, maxHp: DRAGON_HP, came: world.day, nextStrike: world.day + 7, hoard: 0 };
  log(world, 'disaster', `มังกร${name}ได้กลิ่นทองในท้องพระคลัง บินมาเกาะบนเนินเขาเหนือป่าตะวันออก!`);
  sway(world, -2);
  return true;
}

// Who rides out: the strongest fighters in town, adventurers, knights, soldiers and hunters.
const fighters = (world: WorldState) =>
  world.npcs
    .filter((n) => n.alive && n.age >= 16 && n.inside === undefined && n.questId === undefined && (n.rank !== undefined || n.knight || n.job === 'soldier' || n.job === 'hunter' || n.hero))
    .sort((a, b) => might(world, b) - might(world, a))
    .slice(0, CHAMPIONS);

export function dragonDay(world: WorldState, rng: Rng): void {
  const d = world.dragon;
  if (!d || world.day < d.nextStrike) return;
  d.nextStrike = world.day + STRIKE_EVERY;
  if (world.day - d.came >= STAYS) {
    log(world, 'disaster', `มังกร${d.name}เบื่อเมืองนี้แล้ว บินจากไปพร้อมทอง ${d.hoard} เหรียญที่ปล้นไป`);
    world.dragon = undefined;
    return;
  }
  const party = fighters(world);
  let dealt = 0;
  for (const n of party) dealt += might(world, n) * (0.5 + int(rng, 0, 50) / 100);
  d.hp = Math.max(0, d.hp - Math.round(dealt));
  // The fire falls hardest while the dragon is fresh.
  const fierce = d.hp > d.maxHp / 2 ? 0.14 : 0.08;
  const fallen: Npc[] = [];
  for (const n of party) if (chance(rng, fierce * (n.blessed ? 0.5 : 1))) fallen.push(n);
  const names = party.map((n) => n.name).join(', ');
  if (d.hp <= 0) return slay(world, d, party.filter((n) => !fallen.includes(n)), fallen, names);
  log(world, 'battle', `${names} ออกไปรบกับมังกร${d.name} ฟันได้ ${Math.round(dealt)} แต้ม (เหลือ ${d.hp}/${d.maxHp})`, party[0]?.id);
  for (const n of fallen) kill(world, n, `ถูกเปลวไฟมังกร${d.name}แผดเผา`);
  // It still gets through: gold, grain and a few unlucky townsfolk.
  const took = Math.floor(world.treasury * BURN);
  world.treasury -= took;
  d.hoard += took;
  if (world.market) world.market.stock.grain = Math.floor(world.market.stock.grain * 0.85);
  const victims = world.npcs.filter((n) => n.alive && n.inside === undefined && !party.includes(n));
  const burned = int(rng, 0, 2);
  for (let i = 0; i < burned && victims.length; i++) kill(world, victims.splice(int(rng, 0, victims.length - 1), 1)[0], `ถูกไฟมังกร${d.name}เผาบ้าน`);
  log(world, 'disaster', `มังกร${d.name}พ่นไฟใส่เมือง! ยุ้งข้าวไหม้ และคาบทองจากท้องพระคลังไป ${took} เหรียญ`);
}

// Down at last. The hoard (everything it took, and its old treasure) goes to those still standing.
function slay(world: WorldState, d: NonNullable<WorldState['dragon']>, living: Npc[], fallen: Npc[], names: string): void {
  for (const n of fallen) kill(world, n, `ล้มลงในศึกสุดท้ายกับมังกร${d.name}`);
  const hoard = d.hoard + 400;
  const share = living.length ? Math.floor(hoard / living.length) : 0;
  for (const n of living) {
    n.gold += share;
    n.renown = (n.renown ?? 0) + 30;
    n.level += 1;
  }
  if (!living.length) world.treasury += hoard;
  const slayer = living.sort((a, b) => might(world, b) - might(world, a)).find((n) => !n.relic) ?? living[0];
  if (slayer && !slayer.relic) slayer.relic = DRAGON_RELIC;
  world.dragon = undefined;
  world.dragonsSlain = (world.dragonsSlain ?? 0) + 1;
  sway(world, 5);
  log(world, 'battle', `${names} สังหารมังกร${d.name}สำเร็จ! แบ่งสมบัติในรังมังกรคนละ ${share} ทอง`, slayer?.id);
  if (slayer) legend(world, `${slayer.name} สังหารมังกร${d.name} ได้${DRAGON_RELIC} (+${RELIC_POWER} พลัง)`, slayer.id);
}
