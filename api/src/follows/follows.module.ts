import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, Product, Seller, StoreFollow } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { FollowsGateway } from './follows.gateway';
import { FollowsService } from './follows.service';

/** Following stores: the follow list, the toggle, and the new-product notice to followers. */
@Module({
  imports: [TypeOrmModule.forFeature([StoreFollow, Seller, Product, Notification]), NotificationsModule, ProductsModule],
  providers: [FollowsService, FollowsGateway],
  exports: [FollowsService],
})
export class FollowsModule {}
