import type { EventKind } from '../sim';
import type { OfflineReport } from '../worker/protocol';
import { DANGER_KINDS, EVENT_ICON, EVENT_LABEL, el, icon } from './icons';

const MIN_DAYS = 20; // a quick reload shouldn't interrupt with a summary

const dialog = document.getElementById('offline') as HTMLDialogElement;
const daysEl = document.getElementById('offline-days')!;
const countsEl = document.getElementById('offline-counts')!;
const listEl = document.getElementById('offline-highlights')!;

export function showOfflineReport(report: OfflineReport): void {
  if (report.days < MIN_DAYS) return;
  const years = Math.floor(report.days / 365);
  daysEl.textContent = years > 0 ? `โลกเดินไป ${report.days} วัน (ราว ${years} ปี)` : `โลกเดินไป ${report.days} วัน`;
  countsEl.replaceChildren(
    ...(Object.entries(report.counts) as [EventKind, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => el('li', {}, icon(EVENT_ICON[kind], 16), `${EVENT_LABEL[kind]} ${n}`)),
  );
  listEl.replaceChildren(
    ...report.highlights.map((e) =>
      el(
        'li',
        { className: DANGER_KINDS.has(e.kind) ? 'entry entry--danger' : 'entry' },
        icon(EVENT_ICON[e.kind]),
        el('p', { textContent: e.text }),
        el('time', { textContent: `D${e.day}` }),
      ),
    ),
  );
  dialog.showModal();
}
