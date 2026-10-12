import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { loadConfig } from './config';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/errors';
import { HttpMetricsInterceptor } from './common/http-metrics.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { CoreModule } from './modules/core.module';
import { EarningsModule } from './modules/earnings/earnings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RiskModule } from './modules/risk/risk.module';
import { RoutingModule } from './modules/routing/routing.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ZonesModule } from './modules/zones/zones.module';

const cfg = loadConfig();

/** Pretty logs only in local development and only if the dev dependency is installed. */
function prettyTransport() {
  if (cfg.NODE_ENV !== 'development') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { singleLine: true } };
  } catch {
    return undefined;
  }
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: cfg.LOG_LEVEL,
        genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
        redact: ['req.headers.authorization', 'req.body.code', 'req.body.password', 'req.body.refreshToken', 'req.body.otp'],
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/metrics' },
        transport: prettyTransport(),
      },
    }),
    EventEmitterModule.forRoot(),
    CommonModule,
    SettingsModule,
    ZonesModule,
    RoutingModule,
    PricingModule,
    NotificationsModule,
    RiskModule,
    RealtimeModule,
    PaymentsModule,
    TrackingModule,
    EarningsModule,
    UploadsModule,
    AuthModule,
    CoreModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
