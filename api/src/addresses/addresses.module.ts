import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../database/entities';
import { GeoModule } from '../geo/geo.module';
import { AddressesService } from './addresses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Address]), GeoModule],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
