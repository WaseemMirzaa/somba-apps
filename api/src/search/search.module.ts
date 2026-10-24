import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { SearchGateway } from './search.gateway';

@Module({
  imports: [ProductsModule],
  providers: [SearchGateway],
})
export class SearchModule {}
