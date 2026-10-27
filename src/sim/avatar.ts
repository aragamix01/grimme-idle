// Living a life: the god sets its powers aside and is born into the town as one of its people,
// or takes up the life of someone already there. The town goes on as ever, but at the turns of
// that life (a calling at sixteen, a proposal, a whisper from the cult, a disaster's choice to
// stay or go, the prophecy's call) the choice is the player's, and time waits for it. When the
// life ends, the god may go on as one of their children, start again as a newborn, or return
// to the heavens. While the player lives below, no miracle, blessing or curse can be worked.
import { pick, type Rng } from './rng';
import { log } from './core';
import { bornTo, wed } from './life';
import { getTie, setTie } from './ties';
import { expose } from './cult';
import { answerProphecy } from './demonlord';
import { jobName } from './ages';
import { literate } from './learning';
import type { Choice, Job, Npc, WorldState } from './types';

export const isAvatar = (world: WorldState, n: Npc | undefined) => !!n && world.avatar?.id === n.id;
export const avatarOf = (world: WorldState) => world.npcs.find((n) => n.id === world.avatar?.id);
const byId = (world: WorldState, id?: number) => world.npcs.find((n) => n.id === id);

// Put a choice to the player. Only one at a time; a choice already waiting keeps its place.
export function offer(world: WorldState, choice: Omit<Choice, 'day'>): boolean {
  if (world.choice) return false;
  world.choice = { ...choice, day: world.day };
  return true;
}

// Take up a life: someone in town, or a baby born today to a couple of the town.
export function incarnate(world: WorldState, rng: Rng, npcId?: number): boolean {
  let n = npcId === undefined ? undefined : world.npcs.find((x) => x.id === npcId && x.alive && x.inside === undefined);
  if (npcId !== undefined && !n) return false;
  if (!n) {
    const couples = world.npcs.filter((a) => a.alive && a.age <= 45 && a.age >= 18 && byId(world, a.spouseId)?.alive && a.id < (a.spouseId ?? 0));
    const a = couples.length ? pick(rng, couples) : undefined;
    if (!a) return false;
    n = bornTo(world, a, byId(world, a.spouseId)!, rng);
    world.npcs.push(n);
    log(world, 'bless', `${a.name}และ${byId(world, a.spouseId)!.name}ให้กำเนิดลูกชื่อ${n.name} ดวงตาของทารกเปล่งประกายแปลกประหลาด`, n.id);
  } else log(world, 'bless', `เทพเจ้าลงมาใช้ชีวิตเป็น${n.name}`, n.id);
  world.avatar = { id: n.id, since: world.day, lives: (world.avatar?.lives ?? 0) + 1 };
  world.choice = undefined;
  return true;
}

export function ascend(world: WorldState): void {
  const n = avatarOf(world);
  if (n?.alive) log(world, 'bless', `เทพเจ้าละจากร่างของ${n.name} กลับคืนสู่สรวงสวรรค์`, n.id);
  world.avatar = undefined;
  world.choice = undefined;
}

// The calling at sixteen: what the town would have chosen, the parents' trades, and the usual roads.
export function offerCalling(world: WorldState, n: Npc): void {
  const parents = (n.parentIds ?? []).map((id) => byId(world, id)).filter((p): p is Npc => !!p);
  const jobs: Job[] = [n.job, ...parents.map((p) => p.job), 'farmer', 'swordsman', 'mage', 'merchant', 'soldier', ...(literate(n) ? (['scholar', 'priest'] as Job[]) : [])];
  const open = [...new Set(jobs)].filter((j) => j !== 'king' && j !== 'noble').slice(0, 7);
  offer(world, {
    kind: 'job',
    text: `${n.name}อายุ 16 ปีแล้ว จะเลือกเป็นอะไร?`,
    options: open.map((j) => ({ key: j, label: jobName(world, j) })),
    fallback: n.job,
  });
}

function setCalling(world: WorldState, n: Npc, job: Job): void {
  if (n.job === job) return;
  n.job = job;
  if (job === 'swordsman' || job === 'mage') {
    n.rank = 0;
    n.renown = 0;
  } else n.rank = n.renown = undefined;
  n.plan = undefined;
  log(world, 'world', `${n.name}ตัดสินใจเป็น${jobName(world, job)}`, n.id);
}

// The player's answer (or, in the days away, the fallback).
export function choose(world: WorldState, key: string, rng: Rng): void {
  const c = world.choice;
  if (!c) return;
  const k = c.options.some((o) => o.key === key) ? key : c.fallback;
  world.choice = undefined;
  const n = avatarOf(world);
  switch (c.kind) {
    case 'job':
      if (n?.alive) setCalling(world, n, k as Job);
      return;
    case 'marry': {
      const other = byId(world, c.other);
      if (!n?.alive || !other?.alive || byId(world, other.spouseId)?.alive || byId(world, n.spouseId)?.alive) return; // one of them has wed since
      if (k === 'yes') return wed(world, n, other);
      setTie(world, n.id, other.id, Math.min(getTie(world, n.id, other.id), 20));
      if (world.avatar) (world.avatar.refused ??= {})[other.id] = world.day + 2 * 365;
      log(world, 'bond', `${n.name}ปฏิเสธคำขอแต่งงานของ${other.name}`, n.id);
      return;
    }
    case 'cult': {
      const whisperer = byId(world, c.other);
      if (!n?.alive) return;
      if (k === 'join') {
        n.cultist = true;
        n.morality = Math.max(-100, n.morality - 10);
        log(world, 'cult', `${n.name}แอบเข้าร่วม${world.cult?.name ?? 'ลัทธิมาร'}`, n.id);
      } else if (k === 'report' && whisperer?.alive && whisperer.cultist) {
        expose(world, whisperer, `ถูก${n.name}แจ้งความกับทางการ`);
        n.morality = Math.min(100, n.morality + 5);
      }
      return;
    }
    case 'exodus':
      if (k !== 'leave' || !n?.alive) return;
      for (const m of [n, byId(world, n.spouseId)]) {
        if (!m?.alive) continue;
        m.alive = false;
        m.left = true;
        m.plan = undefined;
      }
      log(world, 'world', `${n.name}เก็บข้าวของแล้วย้ายออกจากเมืองไปตั้งตัวใหม่`, n.id);
      return;
    case 'hero':
      return answerProphecy(world, k === 'accept');
    case 'rebirth':
      if (k === 'ascend') return ascend(world);
      if (k === 'newborn') {
        if (!incarnate(world, rng)) ascend(world);
        return;
      }
      if (!incarnate(world, rng, Number(k.slice(5)))) ascend(world);
      return;
  }
}

// Each day: a life that has ended asks where the god goes next.
export function avatarDay(world: WorldState): void {
  if (!world.avatar || world.choice) return;
  const n = avatarOf(world);
  if (n?.alive) return;
  const heirs = world.npcs.filter((c) => c.alive && c.parentIds?.includes(world.avatar!.id)).slice(0, 3);
  offer(world, {
    kind: 'rebirth',
    text: `ชีวิตของ${n?.name ?? 'คุณ'}จบลงแล้ว จะทำอย่างไรต่อ?`,
    options: [...heirs.map((c) => ({ key: `heir:${c.id}`, label: `ใช้ชีวิตต่อเป็นลูก ${c.name}` })), { key: 'newborn', label: 'เกิดใหม่เป็นทารก' }, { key: 'ascend', label: 'กลับคืนสู่สรวงสวรรค์' }],
    fallback: heirs.length ? `heir:${heirs[0].id}` : 'ascend',
  });
}
