import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { RedisService } from '../../common/redis.service';

/** Socket.IO over Redis pub/sub so multiple API pods share rooms. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(private readonly appCtx: INestApplicationContext) {
    super(appCtx);
  }

  connect() {
    const redis = this.appCtx.get(RedisService);
    this.adapterConstructor = createAdapter(redis.duplicate(), redis.duplicate());
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
