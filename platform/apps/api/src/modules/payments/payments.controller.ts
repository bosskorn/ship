import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Gateway callbacks. Each adapter verifies its own signature. */
  @Post('webhooks/:provider')
  @HttpCode(200)
  webhook(@Param('provider') provider: string, @Headers() headers: Record<string, string>, @Body() body: unknown) {
    return this.payments.handleWebhook(provider, headers, body);
  }
}
