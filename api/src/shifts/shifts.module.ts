import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiderShift, User } from '../database/entities';
import { ShiftGateway } from './shift.gateway';
import { ShiftService } from './shift.service';

/** Rider shifts and attendance (clock in/out, breaks, the staff read). The Socket.IO events live in {@link ShiftGateway}. */
@Module({
  imports: [TypeOrmModule.forFeature([RiderShift, User])],
  providers: [ShiftService, ShiftGateway],
  exports: [ShiftService],
})
export class ShiftsModule {}
