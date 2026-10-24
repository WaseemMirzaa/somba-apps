import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign, FlashSale, Product, ProductView, Seller } from '../database/entities';
import { CatalogModule } from '../catalog/catalog.module';
import { ProductsService } from './products.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, FlashSale, Seller, Campaign, ProductView]), CatalogModule],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
