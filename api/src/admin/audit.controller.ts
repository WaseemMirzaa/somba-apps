import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators';
import { ADMIN_ROLES } from '../common/enums';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List recent audit logs' })
  list(@Query('entity') entity?: string, @Query('limit') limit?: string) {
    return this.audit.list({
      entity,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
