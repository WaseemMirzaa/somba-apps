import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceToken, Notification, User } from '../database/entities';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, DeviceToken, User]),
    RealtimeCoreModule,
  ],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
