import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

/**
 * Inbound mobile-money confirmations. Authenticity is the provider's signature
 * over the RAW body — never a session. Always answers 200 for a verified call
 * (even for an unknown reference) so the aggregator doesn't retry forever.
 */
@Controller('api/v1/payments/webhook')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  constructor(private readonly payments: PaymentsService) {}

  @Post('mobile-money')
  @HttpCode(200)
  async mobileMoney(@Req() req: RawBodyRequest<Request>) {
    let event;
    try {
      if (!req.rawBody) throw new Error('missing body');
      event = this.payments.verifyWebhook(req.rawBody, req.headers);
    } catch (e) {
      this.logger.warn(`Rejected mobile-money webhook: ${(e as Error).message}`);
      throw new UnauthorizedException('Invalid webhook.');
    }
    const result = await this.payments.settle(event);
    if (!result) this.logger.warn(`Webhook for unknown payment reference ${event.reference}`);
    return { received: true };
  }
}
