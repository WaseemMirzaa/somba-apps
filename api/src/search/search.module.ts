import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../database/entities';
import { SearchGateway } from './search.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  providers: [SearchGateway],
})
export class SearchModule {}
