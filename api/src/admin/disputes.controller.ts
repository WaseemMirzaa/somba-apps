import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { RejectDto, ResolveDisputeDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ADMIN_ROLES, DisputeStatus } from '../common/enums';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('admin/disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  @ApiOperation({ summary: 'List disputes' })
  list(@Query('status') status?: string) {
    return this.disputes.list({ status: status as DisputeStatus });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dispute detail' })
  get(@Param('id') id: string) {
    return this.disputes.get(id);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve a dispute' })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.disputes.resolve(id, dto, user);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a dispute' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.disputes.reject(id, dto.reason, user);
  }
}
