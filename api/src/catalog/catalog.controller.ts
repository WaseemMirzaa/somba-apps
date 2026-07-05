import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { Public } from '../common/decorators';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Public list of active categories' })
  categories() {
    return this.catalog.listCategories();
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Public browse of live products' })
  products(
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalog.listProducts({
      categorySlug: category,
      q,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({ summary: 'Public product detail' })
  product(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }
}
