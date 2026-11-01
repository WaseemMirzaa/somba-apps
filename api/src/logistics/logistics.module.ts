import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, DeliveryTask, Hub, HubLane, Order, OrderItem, Product, Seller, TransferRun, User, WarehouseException } from '../database/entities';
import { AddressesModule } from '../addresses/addresses.module';
import { ContentModule } from '../content/content.module';
import { GeoModule } from '../geo/geo.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { HubsService } from './hubs.service';
import { LanesService } from './lanes.service';
import { LogisticsGateway } from './logistics.gateway';
import { LogisticsService } from './logistics.service';
import { RoutingService } from './routing.service';
import { RunsService } from './runs.service';
import { TransfersGateway } from './transfers.gateway';

/**
 * Area-based routing, the three-leg journey and the warehouse desk. Depends on nothing that depends on it
 * (orders, delivery, warehouse and ops import this module, never the other way round).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryTask, Order, OrderItem, Hub, User, Seller, Product, AuditLog, HubLane, TransferRun, WarehouseException]),
    ContentModule,
    NotificationsModule,
    ProductsModule,
    AddressesModule,
    GeoModule,
  ],
  providers: [RoutingService, LanesService, HubsService, LogisticsService, RunsService, LogisticsGateway, TransfersGateway],
  exports: [RoutingService, LanesService, HubsService, LogisticsService, RunsService],
})
export class LogisticsModule {}
