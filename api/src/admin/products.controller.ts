import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { RejectDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ADMIN_ROLES, ProductStatus } from '../common/enums';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('admin/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Moderation queue: list products' })
  list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('sellerId') sellerId?: string,
  ) {
    return this.products.list({ status: status as ProductStatus, q, sellerId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Product detail' })
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve product (status: live)' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.products.approve(id, user);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject product with a reason' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.products.reject(id, dto.reason, user);
  }
}
