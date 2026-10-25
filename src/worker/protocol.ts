import type { ChronicleEntry, Command, EventKind, WorldState } from '../sim';

export type ToWorker =
  | { type: 'start'; tickMs: number }
  | { type: 'command'; command: Command }
  | { type: 'speed'; tickMs: number } // 0 pauses
  | { type: 'save' }
  | { type: 'reset' }
  | { type: 'newEra' };

export interface OfflineReport {
  days: number;
  counts: Partial<Record<EventKind, number>>;
  highlights: ChronicleEntry[];
}

export type FromWorker = { type: 'state'; world: WorldState } | { type: 'offline'; report: OfflineReport } | { type: 'era' };
