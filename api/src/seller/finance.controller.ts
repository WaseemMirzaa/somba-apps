import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { RequestPayoutDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { UserRole } from '../common/enums';

@ApiTags('seller')
@ApiBearerAuth()
@Roles(UserRole.SELLER)
@Controller('seller/finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @ApiOperation({ summary: 'Finance summary' })
  summary(@CurrentUser() user: AuthUser) {
    return this.finance.summary(user.sellerId);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'List own payouts' })
  payouts(@CurrentUser() user: AuthUser) {
    return this.finance.listPayouts(user.sellerId);
  }

  @Post('payouts')
  @ApiOperation({ summary: 'Request a payout' })
  requestPayout(@CurrentUser() user: AuthUser, @Body() dto: RequestPayoutDto) {
    return this.finance.requestPayout(user.sellerId, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Transaction history' })
  transactions(@CurrentUser() user: AuthUser) {
    return this.finance.transactions(user.sellerId);
  }
}
