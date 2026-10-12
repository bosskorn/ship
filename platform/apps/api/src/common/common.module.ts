import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfig } from '../config';
import { AuditService } from './audit.service';
import { AuthGuard } from './auth';
import { FieldCipher } from './crypto';
import { DbService } from './db.service';
import { MetricsService } from './metrics.service';
import { QueueService } from './queue.service';
import { RedisService } from './redis.service';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    { provide: FieldCipher, useFactory: () => new FieldCipher(loadConfig().DATA_ENCRYPTION_KEY) },
    DbService,
    RedisService,
    TokenService,
    AuthGuard,
    AuditService,
    MetricsService,
    QueueService,
  ],
  exports: [CONFIG, FieldCipher, DbService, RedisService, TokenService, AuthGuard, AuditService, MetricsService, QueueService],
})
export class CommonModule {}
