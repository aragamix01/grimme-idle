import type { ChronicleEntry, Command, EventKind, Legend, WorldState } from '../sim';

export type ToWorker =
  | { type: 'start'; tickMs: number; whole?: boolean; industry?: boolean } // whole: a new world starts as a town founded whole, not a camp (the dev server's ?start=town, for the e2e tests)
  | { type: 'command'; command: Command }
  | { type: 'speed'; tickMs: number } // 0 pauses
  | { type: 'save' }
  | { type: 'reset' }
  | { type: 'newEra' };

export interface OfflineReport {
  days: number;
  counts: Partial<Record<EventKind, number>>;
  highlights: ChronicleEntry[];
  legends: Legend[]; // the great deeds of the years away, oldest first
}

export type FromWorker =
  | { type: 'state'; world: WorldState }
  | { type: 'offline'; report: OfflineReport }
  | { type: 'catchup'; done: number; total: number } // progress through a long offline catch-up
  | { type: 'era' };
