import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartLine } from '../database/entities/cart-line.entity';
import { CartGateway } from './cart.gateway';
import { CartService } from './cart.service';

@Module({
  imports: [TypeOrmModule.forFeature([CartLine])],
  providers: [CartService, CartGateway],
  exports: [CartService],
})
export class CartModule {}
