import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FraudSignal, Order } from '../database/entities';
import { FraudSignalsService } from './fraud-signals.service';

/** The recorder of fraud signals. Its own small module so the address and push services can use it without importing Ops. */
@Module({
  imports: [TypeOrmModule.forFeature([FraudSignal, Order])],
  providers: [FraudSignalsService],
  exports: [FraudSignalsService],
})
export class FraudSignalsModule {}
