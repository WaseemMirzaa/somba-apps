import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Seller } from '../entities/seller.entity';
import { Product } from '../entities/product.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Category } from '../entities/category.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Payout } from '../entities/payout.entity';
import { Promotion } from '../entities/promotion.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Seller,
      Product,
      ProductImage,
      Category,
      Order,
      OrderItem,
      Payout,
      Promotion,
    ]),
  ],
  controllers: [
    ProductsController,
    OrdersController,
    PromotionsController,
    FinanceController,
    DashboardController,
    ProfileController,
  ],
  providers: [
    ProductsService,
    OrdersService,
    PromotionsService,
    FinanceService,
    DashboardService,
    ProfileService,
  ],
})
export class SellerModule {}
