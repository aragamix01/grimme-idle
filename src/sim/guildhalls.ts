// The adventurers' guilds as houses with a name to keep: a standing that grows with their deeds
// (wood, iron, silver, gold), halls they build out of their own coffers (an infirmary stocked with
// potions, an armoury), rivals they outdo when one of theirs brings down a boss, and the renowned
// they lure from one another with gold.
import { chance, pick, type Rng } from './rng';
import { log } from './core';
import { addTie, getTie } from './ties';
import { ensureMarket, levelOf } from './market';
import type { Guild, GuildHall, Npc, WorldState } from './types';

export const GUILD_TIERS = [
  { name: 'ไม้', from: 0 },
  { name: 'เหล็ก', from: 40 },
  { name: 'เงิน', from: 120 },
  { name: 'ทอง', from: 300 },
] as const;
export const HALLS: Record<GuildHall, { th: string; cost: number; text: string }> = {
  infirmary: { th: 'ห้องพยาบาล', cost: 250, text: 'สมาชิกที่ล้มในเควสรอดง่ายขึ้น' },
  armoury: { th: 'คลังอาวุธ', cost: 300, text: 'สมาชิกออกรบด้วยอาวุธที่ดีกว่า' },
};
const HALL_ORDER: readonly GuildHall[] = ['infirmary', 'armoury'];
const HALLS_DAY = 21; // day of the month the guild masters meet
const LURE = 60; // gold a guild offers a renowned member of another to come over (at founding prices)
const LURE_ODDS = 0.25;
const OUTDONE = 5; // renown the other guilds lose when one of them brings a boss down

export const tierOf = (g: Guild) => GUILD_TIERS.reduce((t, x, i) => (g.renown >= x.from ? i : t), 0);
export const guildOf = (world: WorldState, n: Npc) => world.guilds.find((g) => g.id === n.guildId && g.kind === 'adventurers');
const adventurers = (world: WorldState) => world.guilds.filter((g) => g.kind === 'adventurers');
const hasHall = (g: Guild | undefined, h: GuildHall) => !!g?.halls?.includes(h);

// How much better a party fights for its guild: its standing, and its armoury.
export function guildEdge(world: WorldState, party: Npc[]): number {
  const g = party[0] && guildOf(world, party[0]);
  if (!g) return 1;
  return 1 + 0.05 * tierOf(g) + (hasHall(g, 'armoury') ? 0.08 : 0);
}
// A guild's infirmary: the share of a failed quest's danger its members still face.
export const nursed = (world: WorldState, party: Npc[]) => (party[0] && hasHall(guildOf(world, party[0]), 'infirmary') ? 0.85 : 1);

// A boss brought down by a guild's party: the others lose face.
export function outdo(world: WorldState, party: Npc[], boss: string): void {
  const g = party[0] && guildOf(world, party[0]);
  if (!g) return;
  const rivals = adventurers(world).filter((r) => r !== g);
  for (const r of rivals) r.renown = Math.max(0, r.renown - OUTDONE);
  if (rivals.length) log(world, 'guild', `${g.name}ชิงปราบ${boss}ได้ก่อน กิลด์อื่นเสียหน้า`, party[0].id);
}

// Monthly: halls built out of a guild's coffers, and a renowned member lured from a rival.
export function guildHallsDay(world: WorldState, rng: Rng): void {
  if (world.day % 30 !== HALLS_DAY) return;
  const lvl = levelOf(world);
  const guilds = adventurers(world);
  for (const g of guilds) {
    const next = HALL_ORDER.find((h) => !hasHall(g, h));
    if (!next) continue;
    const cost = Math.round(HALLS[next].cost * lvl);
    if (g.treasury < cost + 100 * lvl) continue;
    g.treasury -= cost;
    ensureMarket(world).till += cost; // the builders and the timber merchants are paid
    (g.halls ??= []).push(next);
    log(world, 'guild', `${g.name}สร้าง${HALLS[next].th}ในหอกิลด์ ${HALLS[next].text}`);
  }
  if (guilds.length < 2 || !chance(rng, LURE_ODDS)) return;
  // The top guild woos a renowned member of a rival who has little love for their own master.
  const top = [...guilds].sort((a, b) => b.renown - a.renown)[0];
  const price = Math.round(LURE * lvl);
  if (top.treasury < price) return;
  const lured = world.npcs.filter((n) => n.alive && n.guildId !== undefined && n.guildId !== top.id && guilds.some((g) => g.id === n.guildId) && (n.rank ?? 0) >= 2 && n.questId === undefined && n.id !== guilds.find((g) => g.id === n.guildId)?.leaderId && getTie(world, n.id, guilds.find((g) => g.id === n.guildId)!.leaderId) < 10);
  if (!lured.length) return;
  const n = pick(rng, lured);
  const from = guilds.find((g) => g.id === n.guildId)!;
  const master = world.npcs.find((x) => x.id === from.leaderId);
  n.guildId = top.id;
  top.treasury -= price;
  n.gold += price;
  if (master?.alive) addTie(world, master, n, -20);
  log(world, 'guild', `${top.name}ทุ่ม ${price} ทองดึง${n.name}มาจาก${from.name}`, n.id);
}
