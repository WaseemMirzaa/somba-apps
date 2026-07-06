import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SellersService } from './sellers.service';
import { RejectDto, UpdateSellerDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ADMIN_ROLES, SellerStatus } from '../common/enums';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('admin/sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Get()
  @ApiOperation({ summary: 'List sellers with product/order counts' })
  list(@Query('status') status?: string, @Query('q') q?: string) {
    return this.sellers.list({ status: status as SellerStatus, q });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Seller detail with counts and recent products' })
  get(@Param('id') id: string) {
    return this.sellers.get(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a seller (status: active)' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sellers.approve(id, user);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a seller' })
  suspend(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sellers.suspend(id, user);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a seller with a reason' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sellers.reject(id, dto.reason, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update commission/badge/status' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSellerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sellers.update(id, dto, user);
  }
}
