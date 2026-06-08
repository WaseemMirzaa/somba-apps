import { Controller, Get, Param, Query } from '@nestjs/common';
import { products, orders, sellers, adminStats } from './mock-data';

@Controller('api/v1')
export class MockController {
  @Get('health')
  health() {
    return { status: 'ok', mode: 'mock', timestamp: new Date().toISOString() };
  }

  @Get('products')
  getProducts(@Query('category') category?: string) {
    if (category) {
      return products.filter((p) => p.category.toLowerCase() === category.toLowerCase());
    }
    return products;
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return products.find((p) => p.id === +id) ?? { error: 'Product not found' };
  }

  @Get('orders')
  getOrders() {
    return orders;
  }

  @Get('sellers')
  getSellers(@Query('status') status?: string) {
    if (status) return sellers.filter((s) => s.status === status);
    return sellers;
  }

  @Get('admin/stats')
  getAdminStats() {
    return adminStats;
  }

  @Get('categories')
  getCategories() {
    return [
      { id: 1, name: 'Electronics', nameFr: 'Électronique' },
      { id: 2, name: 'Fashion', nameFr: 'Mode' },
      { id: 3, name: 'Home & Living', nameFr: 'Maison' },
      { id: 4, name: 'Beauty', nameFr: 'Beauté' },
    ];
  }
}
