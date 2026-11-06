import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../database/entities';
import { GeoModule } from '../geo/geo.module';
import { FraudSignalsModule } from '../ops/fraud-signals.module';
import { AddressesService } from './addresses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Address]), GeoModule, FraudSignalsModule],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
