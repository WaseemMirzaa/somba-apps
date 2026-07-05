import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import { Seller } from '../entities/seller.entity';
import { Review } from '../entities/review.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Product, Seller, Review])],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
