import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { UserRole } from '../common/enums';

@ApiTags('seller')
@ApiBearerAuth()
@Roles(UserRole.SELLER)
@Controller('seller/promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @ApiOperation({ summary: 'List own promotions' })
  list(@CurrentUser() user: AuthUser) {
    return this.promotions.list(user.sellerId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a promotion' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePromotionDto) {
    return this.promotions.create(user.sellerId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get own promotion' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.promotions.get(user.sellerId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update own promotion' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotions.update(user.sellerId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete own promotion' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.promotions.remove(user.sellerId, id);
  }
}
