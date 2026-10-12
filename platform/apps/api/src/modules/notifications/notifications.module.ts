import { Global, Module } from '@nestjs/common';
import { AppConfig, CONFIG } from '../../config';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';
import { ExpoPushSender, LogPushSender, LogSmsSender, PUSH_SENDER, SMS_SENDER } from './providers';

@Global()
@Module({
  providers: [
    {
      provide: PUSH_SENDER,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => (cfg.PUSH_PROVIDER === 'expo' ? new ExpoPushSender(cfg.EXPO_ACCESS_TOKEN) : new LogPushSender()),
    },
    { provide: SMS_SENDER, useFactory: () => new LogSmsSender() },
    NotificationsService,
    NotificationsListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
