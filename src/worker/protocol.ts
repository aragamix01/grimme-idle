import type { Command, WorldState } from '../sim';

export type ToWorker =
  | { type: 'start'; seed: number; tickMs: number }
  | { type: 'command'; command: Command }
  | { type: 'speed'; tickMs: number };

export type FromWorker = { type: 'state'; world: WorldState };
