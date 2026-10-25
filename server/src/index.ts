import { DurableObject } from 'cloudflare:workers';
import { createWorld, tick, type WorldState } from '../../src/sim';

interface Env {
  WORLD: DurableObjectNamespace<World>;
}

// Wake once a minute and catch up in one batch instead of ticking every second,
// to stay inside the free-plan request and duration limits.
const ALARM_MS = 60_000;
const DAYS_PER_ALARM = 60;

export class World extends DurableObject<Env> {
  async getState(): Promise<WorldState> {
    let world = await this.ctx.storage.get<WorldState>('world');
    if (!world) {
      world = createWorld(Date.now() >>> 0);
      await this.ctx.storage.put('world', world);
      await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    }
    return world;
  }

  async alarm(): Promise<void> {
    const world = await this.getState();
    for (let i = 0; i < DAYS_PER_ALARM; i++) tick(world);
    await this.ctx.storage.put('world', world);
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
  }
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const stub = env.WORLD.get(env.WORLD.idFromName('world-1'));
    return Response.json(await stub.getState());
  },
} satisfies ExportedHandler<Env>;
