import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivateFile, RiderDocument, RiderVehicle, User } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpsModule } from '../ops/ops.module';
import { RiderComplianceGateway } from './rider-compliance.gateway';
import { RiderComplianceService } from './rider-compliance.service';

/**
 * Rider vehicle and compliance documents. `PrivateFilesService` comes from the global SellerPlatformModule (the scans live in
 * the private upload store); `RealtimeEmitter` from the global RealtimeCoreModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RiderVehicle, RiderDocument, User, PrivateFile]), OpsModule, NotificationsModule],
  providers: [RiderComplianceService, RiderComplianceGateway],
  exports: [RiderComplianceService],
})
export class RiderComplianceModule {}
