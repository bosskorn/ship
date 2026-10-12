import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/** RealtimeService is global; the gateway/listener are registered in AppModule (they depend on feature modules). */
@Global()
@Module({ providers: [RealtimeService], exports: [RealtimeService] })
export class RealtimeModule {}
