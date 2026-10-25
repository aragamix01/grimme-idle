import type { EventKind } from '../sim';

export const iconUrl = (name: string) => `/assets/sprites/icons/${name}.png`;

export const EVENT_ICON: Record<EventKind, string> = {
  world: 'faith',
  battle: 'sword',
  death: 'skull',
  disaster: 'skull',
  theft: 'gold',
  bless: 'bless',
  curse: 'curse',
  dream: 'dream',
  quest: 'quest',
  rank: 'crown',
  bond: 'heart',
  guild: 'banner',
  trade: 'grain',
  politics: 'crown',
};

export const EVENT_LABEL: Record<EventKind, string> = {
  world: 'เหตุการณ์โลก',
  battle: 'ชัยชนะ',
  death: 'ความตาย',
  disaster: 'ภัยพิบัติ',
  theft: 'การขโมย',
  bless: 'พร',
  curse: 'คำสาป',
  dream: 'ความฝัน',
  quest: 'เควส',
  rank: 'เลื่อนแรงก์',
  bond: 'ความสัมพันธ์',
  guild: 'กิลด์',
  trade: 'การค้า',
  politics: 'การเมือง',
};

export const DANGER_KINDS = new Set<EventKind>(['death', 'disaster']);

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function icon(name: string, size = 32): HTMLImageElement {
  return el('img', { src: iconUrl(name), alt: '', width: size, height: size });
}
