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
import type { MobileMoneyEvent, WebhookRequest } from './mobile-money.provider';
import { PaymentsService } from './payments.service';

/** Method, host and path of the webhook request, for HTTP message signatures. */
function requestOf(req: Request): WebhookRequest {
  const forwarded = req.headers['x-forwarded-host'];
  const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.headers.host || '';
  return { method: req.method, authority: host, path: (req.originalUrl || req.url).split('?')[0] };
}

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
    let event: MobileMoneyEvent;
    try {
      if (!req.rawBody) throw new Error('missing body');
      event = await this.payments.verifyWebhook(req.rawBody, req.headers, requestOf(req));
    } catch (e) {
      this.logger.warn(`Rejected mobile-money webhook: ${(e as Error).message}`);
      throw new UnauthorizedException('Invalid webhook.');
    }
    const result = await this.payments.settle(event);
    if (!result) this.logger.warn(`Webhook for unknown payment reference ${event.reference}`);
    return { received: true };
  }

  /**
   * pawaPay callbacks for deposits, refunds and payouts (set this URL for all three in the pawaPay dashboard). The
   * signature is checked when signatures are on; the operation's status is then read from pawaPay itself.
   */
  @Post('pawapay')
  @HttpCode(200)
  async pawapay(@Req() req: RawBodyRequest<Request>) {
    try {
      if (!req.rawBody) throw new Error('missing body');
      const target = await this.payments.handlePawapayCallback(req.rawBody, req.headers, requestOf(req));
      return { received: true, kind: target.kind };
    } catch (e) {
      this.logger.warn(`Rejected pawaPay callback: ${(e as Error).message}`);
      throw new UnauthorizedException('Invalid callback.');
    }
  }
}
