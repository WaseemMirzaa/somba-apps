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
import { ADMIN_ROLES } from '../common/enums';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('admin/promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @ApiOperation({ summary: 'List platform-wide promotions' })
  list() {
    return this.promotions.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a platform-wide flash sale' })
  create(@Body() dto: CreatePromotionDto, @CurrentUser() user: AuthUser) {
    return this.promotions.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a promotion' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.promotions.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a promotion' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.promotions.remove(id, user);
  }
}
