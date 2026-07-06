import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { UpdateOrderItemStatusDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { UserRole } from '../common/enums';

@ApiTags('seller')
@ApiBearerAuth()
@Roles(UserRole.SELLER)
@Controller('seller/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders containing this seller items' })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.orders.list(user.sellerId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order (this seller items only)' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.get(user.sellerId, id);
  }

  @Patch('items/:itemId/status')
  @ApiOperation({ summary: 'Update fulfillment status of an order item' })
  updateItemStatus(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemStatusDto,
  ) {
    return this.orders.updateItemStatus(user.sellerId, itemId, dto);
  }
}
