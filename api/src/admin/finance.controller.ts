import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { RejectDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ADMIN_ROLES, PayoutStatus } from '../common/enums';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('admin/finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @ApiOperation({ summary: 'Finance overview' })
  overview() {
    return this.finance.overview();
  }

  @Get('payouts')
  @ApiOperation({ summary: 'List payouts' })
  payouts(@Query('status') status?: string) {
    return this.finance.listPayouts({ status: status as PayoutStatus });
  }

  @Post('payouts/:id/approve')
  @ApiOperation({ summary: 'Approve a requested payout' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.finance.approve(id, user);
  }

  @Post('payouts/:id/mark-paid')
  @ApiOperation({ summary: 'Mark an approved payout as paid' })
  markPaid(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.finance.markPaid(id, user);
  }

  @Post('payouts/:id/reject')
  @ApiOperation({ summary: 'Reject a payout and refund the seller balance' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.reject(id, dto.reason, user);
  }
}
