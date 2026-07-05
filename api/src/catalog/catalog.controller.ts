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
  @ApiOperation({ summary: 'Public list of active categories (with product counts)' })
  categories() {
    return this.catalog.listCategories();
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Public browse of live products' })
  products(
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('seller') seller?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalog.listProducts({
      categorySlug: category,
      q,
      sellerSlug: seller,
      sort,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Public()
  @Get('deals')
  @ApiOperation({ summary: 'Public list of discounted products' })
  deals(@Query('limit') limit?: string) {
    return this.catalog.listDeals(limit ? parseInt(limit, 10) : undefined);
  }

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'Best-selling products (home rail)' })
  featured(@Query('limit') limit?: string) {
    return this.catalog.listFeatured(limit ? parseInt(limit, 10) : undefined);
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({ summary: 'Public product detail' })
  product(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }

  @Public()
  @Get('products/:id/related')
  @ApiOperation({ summary: 'Related products in the same category' })
  related(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.catalog.relatedProducts(id, limit ? parseInt(limit, 10) : undefined);
  }

  @Public()
  @Get('products/:id/reviews')
  @ApiOperation({ summary: 'Published reviews for a product' })
  reviews(@Param('id') id: string) {
    return this.catalog.productReviews(id);
  }

  @Public()
  @Get('stores')
  @ApiOperation({ summary: 'Active seller directory' })
  stores() {
    return this.catalog.listStores();
  }

  @Public()
  @Get('stores/:slug')
  @ApiOperation({ summary: 'A single store and its products' })
  store(@Param('slug') slug: string) {
    return this.catalog.getStore(slug);
  }
}
