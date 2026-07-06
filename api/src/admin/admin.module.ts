import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Seller } from '../entities/seller.entity';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Payout } from '../entities/payout.entity';
import { Promotion } from '../entities/promotion.entity';
import { Dispute } from '../entities/dispute.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { SellersService } from './sellers.service';
import { SellersController } from './sellers.controller';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Seller,
      Category,
      Product,
      Order,
      OrderItem,
      Payout,
      Promotion,
      Dispute,
      AuditLog,
    ]),
  ],
  controllers: [
    DashboardController,
    SellersController,
    ProductsController,
    OrdersController,
    CategoriesController,
    FinanceController,
    PromotionsController,
    DisputesController,
    AuditController,
  ],
  providers: [
    AuditService,
    DashboardService,
    SellersService,
    ProductsService,
    OrdersService,
    CategoriesService,
    FinanceService,
    PromotionsService,
    DisputesService,
  ],
  exports: [AuditService],
})
export class AdminModule {}
