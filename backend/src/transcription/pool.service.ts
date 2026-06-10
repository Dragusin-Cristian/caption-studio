import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { TranscriberPool, defaultWorkerCount } from './transcriber-pool';

@Injectable()
export class PoolService implements OnModuleDestroy {
  private readonly pools = new Map<string, TranscriberPool>();
  readonly workerCount = defaultWorkerCount();

  async getPool(model: string): Promise<TranscriberPool> {
    let pool = this.pools.get(model);
    if (!pool) {
      pool = new TranscriberPool(model, this.workerCount);
      this.pools.set(model, pool);
      try {
        await pool.init();
      } catch (e) {
        this.pools.delete(model);
        throw e;
      }
    } else {
      await pool.readyPromise;
    }
    return pool;
  }

  async onModuleDestroy(): Promise<void> {
    const pools = Array.from(this.pools.values());
    this.pools.clear();
    await Promise.all(pools.map((p) => p.destroy().catch(() => undefined)));
  }
}
