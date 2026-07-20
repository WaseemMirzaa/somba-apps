import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast, User } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

@Injectable()
export class BroadcastsService {
  constructor(
    @InjectRepository(Broadcast) private readonly repo: Repository<Broadcast>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(): Promise<Broadcast[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  /** Send a marketing broadcast to an audience role (or all customers). */
  async send(
    sentBy: string,
    data: { title: string; body: string; audience?: string },
  ): Promise<Broadcast> {
    const audience = data.audience ?? 'customer';
    const recipients =
      audience === 'all'
        ? await this.users.count()
        : await this.users.count({
            where: { role: audience as never },
          });
    const broadcast = await this.repo.save(
      this.repo.create({
        title: data.title,
        body: data.body,
        audience,
        sentBy,
        recipients,
      }),
    );
    // Push a notification into the audience room.
    await this.notifications.toRole(audience === 'all' ? 'customer' : audience, {
      title: data.title,
      body: data.body,
      type: 'marketing',
    });
    this.emitter.toRoles(ADMIN_ROLES, 'broadcast:created', broadcast);
    return broadcast;
  }
}
