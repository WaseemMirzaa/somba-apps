import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address, AuditLog, GeoArea, Hub, HubCoverage, Order, Seller, User } from '../database/entities';
import { CoverageService } from './coverage.service';
import { GeoGateway } from './geo.gateway';
import { GeoService } from './geo.service';

/**
 * The delivery geography and warehouse coverage. Depends on nothing but the entities and the socket emitter:
 * logistics, addresses, sellers and orders import this module, never the other way round.
 */
@Module({
  imports: [TypeOrmModule.forFeature([GeoArea, HubCoverage, Hub, Address, Seller, Order, User, AuditLog])],
  providers: [GeoService, CoverageService, GeoGateway],
  exports: [GeoService, CoverageService],
})
export class GeoModule {}
