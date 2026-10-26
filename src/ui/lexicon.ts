// Rewords a rendered panel for the town's regime (see sim/lexicon.ts). Anything marked
// data-foreign (the neighbouring kingdoms) keeps its kings, and chronicle lines (.legend) keep
// the words of the day they were written.
import { say, type WorldState } from '../sim';

export function localize(root: HTMLElement, world: WorldState): void {
  if (!world.regime || world.regime === 'monarchy') return;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n instanceof HTMLElement && (n.dataset.foreign !== undefined || n.classList.contains('legend')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = say(world, n.textContent ?? '');
      if (text !== n.textContent) n.textContent = text;
    } else if (n instanceof HTMLElement && n.title) n.title = say(world, n.title);
  }
}
