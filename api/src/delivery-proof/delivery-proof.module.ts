import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DeliveryProof, DeliveryTask, User } from '../database/entities';
import { OpsModule } from '../ops/ops.module';
import { UsersModule } from '../users/users.module';
import { DeliveryProofController } from './delivery-proof.controller';
import { DeliveryProofGateway } from './delivery-proof.gateway';
import { DeliveryProofService } from './delivery-proof.service';

/** Photo and signature proof of delivery: private storage, rider upload, staff read (docs/contracts/delivery-proof.md). */
@Module({
  imports: [TypeOrmModule.forFeature([DeliveryProof, DeliveryTask, User]), AuthModule, UsersModule, OpsModule],
  controllers: [DeliveryProofController],
  providers: [DeliveryProofService, DeliveryProofGateway],
  exports: [DeliveryProofService],
})
export class DeliveryProofModule {}
