import { Global, Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { SurgeService } from './surge.service';

@Global()
@Module({ providers: [PricingService, SurgeService], exports: [PricingService, SurgeService] })
export class PricingModule {}
