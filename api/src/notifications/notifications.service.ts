import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

export const ADMIN_ROLES = [
  'admin',
  'admin_operations',
  'admin_finance',
  'admin_support',
  'admin_marketing',
  'admin_moderation',
];

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** Persist + push a notification to a single user. */
  async toUser(
    userId: string,
    data: { title: string; body: string; type?: string; entityId?: string },
  ): Promise<Notification> {
    const n = await this.repo.save(
      this.repo.create({
        userId,
        title: data.title,
        body: data.body,
        type: data.type ?? 'system',
        entityId: data.entityId ?? null,
      }),
    );
    this.emitter.toUser(userId, 'notification:new', n);
    return n;
  }

  /** Persist + push a broadcast to a whole role room. */
  async toRole(
    role: string,
    data: { title: string; body: string; type?: string; entityId?: string },
  ): Promise<Notification> {
    const n = await this.repo.save(
      this.repo.create({
        role,
        title: data.title,
        body: data.body,
        type: data.type ?? 'system',
        entityId: data.entityId ?? null,
      }),
    );
    this.emitter.toRole(role, 'notification:new', n);
    return n;
  }

  /** Broadcast to every admin sub-role at once. */
  async toAdmins(data: {
    title: string;
    body: string;
    type?: string;
    entityId?: string;
  }): Promise<void> {
    for (const role of ADMIN_ROLES) await this.toRole(role, data);
  }

  async listForUser(userId: string, role: string): Promise<Notification[]> {
    return this.repo.find({
      where: [{ userId }, { role }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async markRead(id: string): Promise<void> {
    await this.repo.update({ id }, { read: true });
  }

  /** Mark every one of a user's notifications read in a single call. */
  async markAllRead(userId: string): Promise<number> {
    const res = await this.repo.update({ userId, read: false }, { read: true });
    return res.affected ?? 0;
  }
}
