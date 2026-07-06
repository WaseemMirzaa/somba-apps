import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Address } from '../entities/address.entity';
import { Favorite } from '../entities/favorite.entity';
import { Review } from '../entities/review.entity';
import { Coupon } from '../entities/coupon.entity';
import { Product } from '../entities/product.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Dispute } from '../entities/dispute.entity';
import { CustomerController } from './customer.controller';
import { ProfileService } from './profile.service';
import { AddressesService } from './addresses.service';
import { FavoritesService } from './favorites.service';
import { OrdersService } from './orders.service';
import { ReviewsService } from './reviews.service';
import { CouponsService } from './coupons.service';
import { DisputesService } from './disputes.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Address,
      Favorite,
      Review,
      Coupon,
      Product,
      Order,
      OrderItem,
      Dispute,
    ]),
  ],
  controllers: [CustomerController],
  providers: [
    ProfileService,
    AddressesService,
    FavoritesService,
    OrdersService,
    ReviewsService,
    CouponsService,
    DisputesService,
    NotificationsService,
  ],
})
export class CustomerModule {}
