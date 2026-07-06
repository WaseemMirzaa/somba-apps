import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { UserRole } from '../common/enums';

@ApiTags('seller')
@ApiBearerAuth()
@Roles(UserRole.SELLER)
@Controller('seller/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List own products' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.products.list(user.sellerId, { status, q });
  }

  @Post()
  @ApiOperation({ summary: 'Create a product (draft)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.sellerId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get own product' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.get(user.sellerId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update own product' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.sellerId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete own product' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.remove(user.sellerId, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit product for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.submit(user.sellerId, id);
  }
}
