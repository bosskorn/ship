import { Global, Module } from '@nestjs/common';
import { AppConfig, CONFIG } from '../../config';
import { CashAdapter, MockCardAdapter, MockQrAdapter, PAYMENT_ADAPTERS, PaymentAdapter } from './payment.adapters';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_ADAPTERS,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => {
        const adapters: PaymentAdapter[] = [new CashAdapter()];
        // Mock gateways exist only outside production; real adapters get registered here.
        if (cfg.NODE_ENV !== 'production') adapters.push(new MockQrAdapter(cfg.PAYMENT_MOCK_SECRET), new MockCardAdapter());
        return adapters;
      },
    },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
