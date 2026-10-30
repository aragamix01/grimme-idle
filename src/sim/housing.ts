// Homes and how many the town can house. For now the town is built for TOWN_SIZE.
import { TOWN_SIZE } from './town';
import type { WorldState } from './types';

export const capacity = (_world: WorldState) => TOWN_SIZE;
