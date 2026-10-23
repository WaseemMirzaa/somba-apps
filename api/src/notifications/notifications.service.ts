import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Notification, User } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { UsersService } from '../users/users.service';
import { linkFor } from './links';
import { PushService } from './push.service';

export interface NoticeInput {
  title: string;
  body: string;
  type?: string;
  entityId?: string;
  /** Extra string fields for the push payload (e.g. a rider task's orderId and view). */
  extra?: Record<string, string>;
}

/** Role notices that also go to phones (everything else reaches staff on the web only). */
const MOBILE_ROLE_TYPES = new Set(['marketing', 'task']);

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
    private readonly push: PushService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Persist + push a notification to a single user. */
  async toUser(userId: string, data: NoticeInput): Promise<Notification> {
    const n = await this.repo.save(
      this.repo.create({
        userId,
        title: data.title,
        body: data.body,
        type: data.type ?? 'system',
        entityId: data.entityId ?? null,
      }),
    );
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'role', 'prefs'] }).catch(() => null);
    const link = linkFor(user?.role, n.type, n.entityId);
    // The live copy carries the page it opens (the bell and desktop alerts follow it).
    this.emitter.toUser(userId, 'notification:new', { ...n, link });
    // Also reach the user when the app is closed. Fire-and-forget: push is
    // best-effort and must never slow down or fail the triggering action.
    void this.pushToUser(userId, n, link, user, data.extra);
    return n;
  }

  /** FCM to the user's devices, unless they turned push off in Settings. */
  private async pushToUser(
    userId: string,
    n: Notification,
    link: string,
    user: Pick<User, 'prefs'> | null,
    extra?: Record<string, string>,
  ): Promise<void> {
    try {
      if (user && UsersService.parsePrefs(user.prefs).push === false) return;
      await this.push.sendToUser(userId, {
        title: n.title,
        body: n.body,
        link,
        data: { type: n.type, entityId: n.entityId ?? '', notificationId: n.id, ...(extra ?? {}) },
      });
    } catch {
      /* push is best-effort */
    }
  }

  /** Persist + push a broadcast to a whole role room. */
  async toRole(role: string, data: NoticeInput): Promise<Notification> {
    const n = await this.repo.save(
      this.repo.create({
        role,
        title: data.title,
        body: data.body,
        type: data.type ?? 'system',
        entityId: data.entityId ?? null,
      }),
    );
    this.emitter.toRole(role, 'notification:new', { ...n, link: linkFor(role, n.type, n.entityId) });
    void this.pushToRole(role, n, data.extra);
    return n;
  }

  /**
   * Role pushes: staff get every alert on the web portals they turned alerts on for; phones only get marketing
   * broadcasts and rider task alerts, so nobody is buzzed for every order. Users who turned push off are skipped.
   */
  private async pushToRole(role: string, n: Notification, extra?: Record<string, string>): Promise<void> {
    try {
      const optedOut = await this.users.find({ where: { role: role as User['role'], prefs: Like('%"push":false%') }, select: ['id'] });
      const skipUserIds = new Set(optedOut.map((u) => u.id));
      const payload = {
        title: n.title,
        body: n.body,
        link: linkFor(role, n.type, n.entityId),
        data: { type: n.type, entityId: n.entityId ?? '', notificationId: n.id, ...(extra ?? {}) },
      };
      await this.push.sendToRole(role, payload, {
        apps: MOBILE_ROLE_TYPES.has(n.type) ? undefined : ['web'],
        skipUserIds,
      });
    } catch {
      /* push is best-effort */
    }
  }

  /** The same notice to several users (one saved row each), e.g. the riders of a warehouse. */
  async toUsers(userIds: string[], data: NoticeInput): Promise<void> {
    for (const id of new Set(userIds)) await this.toUser(id, data);
  }

  /** "Send a test push" from Settings: a notice to the caller, plus how many devices it can reach. */
  async test(user: { id: string }): Promise<{ pushEnabled: boolean; devices: number }> {
    await this.toUser(user.id, {
      title: 'Test notification',
      body: 'Notifications reach this account. If push is set up, your devices show this too.',
      type: 'system',
    });
    return { pushEnabled: this.push.enabled, devices: await this.push.countForUser(user.id) };
  }

  /** Broadcast to every admin sub-role at once. */
  async toAdmins(data: NoticeInput): Promise<void> {
    for (const role of ADMIN_ROLES) await this.toRole(role, data);
  }

  /** The user's own notices and their role's broadcasts, newest first, each with the page it opens. */
  async listForUser(userId: string, role: string): Promise<(Notification & { link: string })[]> {
    const rows = await this.repo.find({
      where: [{ userId }, { role }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((n) => ({ ...n, link: linkFor(role, n.type, n.entityId) }));
  }

  /** Scoped to the owner so one user cannot touch another's notifications. */
  async markRead(id: string, userId: string): Promise<void> {
    await this.repo.update({ id, userId }, { read: true });
  }

  /** Mark every one of a user's notifications read in a single call. */
  async markAllRead(userId: string): Promise<number> {
    const res = await this.repo.update({ userId, read: false }, { read: true });
    return res.affected ?? 0;
  }
}
