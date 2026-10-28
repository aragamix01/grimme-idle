import { avatarOf, type WorldState } from '../sim';
import { el, icon } from './icons';

// The life the player is living: the button in the god-powers sheet that sends the god down (or calls it back),
// and the dialog that puts each turn of that life to the player. The town waits while it's open.
const lifeBtn = document.getElementById('life-open') as HTMLButtonElement;
const dialog = document.getElementById('choice') as HTMLDialogElement;
const text = document.getElementById('choice-text')!;
const options = document.getElementById('choice-options')!;

interface Handlers {
  onBorn: () => void; // a newborn
  onAscend: () => void;
  onChoose: (key: string) => void;
}
let handlers: Handlers;
let shown = ''; // the choice the dialog is showing

export function initLife(h: Handlers): void {
  handlers = h;
  lifeBtn.onclick = () => (lifeBtn.dataset.living ? handlers.onAscend() : handlers.onBorn());
  dialog.addEventListener('cancel', (e) => e.preventDefault()); // a choice must be made
}

export function renderLife(world: WorldState): void {
  const me = avatarOf(world);
  const living = !!world.avatar;
  lifeBtn.dataset.living = living ? '1' : '';
  const face = `${living}:${me?.name}`;
  if (lifeBtn.dataset.face !== face) {
    lifeBtn.dataset.face = face;
    lifeBtn.replaceChildren(icon(living ? 'faith' : 'awaken', 32), el('span', {}, el('b', { textContent: living ? 'กลับเป็นเทพ' : 'ลงไปเกิด' }), el('small', { textContent: living ? `ตอนนี้คือ${me?.name ?? ''}` : 'เกิดเป็นทารกในเมือง' })));
  }
  lifeBtn.title = living ? `ตอนนี้คุณคือ${me?.name ?? ''}` : 'เกิดเป็นทารกในเมือง ใช้ชีวิตและตัดสินใจเอง ระหว่างนั้นใช้พลังเทพไม่ได้';
  const c = world.choice;
  const key = c ? `${c.day}:${c.kind}:${c.text}` : '';
  if (key === shown) return;
  shown = key;
  if (!c) {
    if (dialog.open) dialog.close();
    return;
  }
  text.textContent = c.text;
  options.replaceChildren(
    ...c.options.map((o) => {
      const b = el('button', { type: 'button', className: 'btn', textContent: o.label });
      b.onclick = () => {
        dialog.close();
        handlers.onChoose(o.key);
      };
      return b;
    }),
  );
  if (!dialog.open) dialog.showModal();
}
