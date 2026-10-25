// Keep a finger's scroll inside a sheet or dialog. Browsers hand a scroll that reaches the
// end of a box (or starts on a box with nothing to scroll) on to the page beneath, and the
// page's momentum then swallows the next tap, so buttons seem dead until it settles.
export function containScroll(el: HTMLElement): void {
  el.style.overscrollBehavior = 'contain';
  let lastY = 0;
  el.addEventListener('touchstart', (e) => (lastY = e.touches[0].clientY), { passive: true });
  el.addEventListener(
    'touchmove',
    (e) => {
      const y = e.touches[0].clientY;
      const down = y > lastY; // finger moving down: content scrolls toward the top
      lastY = y;
      // Find the box this touch would scroll: the nearest scrollable ancestor up to el.
      let box: HTMLElement | null = e.target as HTMLElement;
      while (box && box !== el && box.scrollHeight <= box.clientHeight) box = box.parentElement;
      const target = box ?? el;
      const atTop = target.scrollTop <= 0;
      const atEnd = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
      if (target.scrollHeight <= target.clientHeight || (down && atTop) || (!down && atEnd)) e.preventDefault();
    },
    { passive: false },
  );
}
