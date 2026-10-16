import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlashSale, Product } from '../database/entities';
import { ProductsService } from './products.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, FlashSale])],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
