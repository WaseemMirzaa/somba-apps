import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign, FlashSale, Product, ProductView, Seller } from '../database/entities';
import { ProductsService } from './products.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, FlashSale, Seller, Campaign, ProductView])],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
