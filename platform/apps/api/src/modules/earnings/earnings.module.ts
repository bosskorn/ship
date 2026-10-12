import { Global, Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';

@Global()
@Module({ providers: [EarningsService], exports: [EarningsService] })
export class EarningsModule {}
