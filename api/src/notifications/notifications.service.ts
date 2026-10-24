import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Notification, User } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { UsersService } from '../users/users.service';
import { linkFor } from './links';
import { frenchNotice } from './localize';
import { PushService } from './push.service';
import { TranslationService } from '../translation/translation.service';

export interface NoticeInput {
  title: string;
  body: string;
  type?: string;
  entityId?: string;
  /** Extra string fields for the push payload (e.g. a rider task's orderId and view). */
  extra?: Record<string, string>;
  /** An authored French version (e.g. a marketing broadcast). Wins over the built-in patterns. */
  fr?: { title: string; body: string };
}

/** A notification as clients receive it: the stored row, the page it opens and its French text (null if unknown). */
export type NoticeView = Notification & { link: string; titleFr: string | null; bodyFr: string | null };

type Authored = { title: string; body: string } | null | undefined;

/** The French text rides along in the push `data` so an app showing a foreground banner can pick the device language. */
const FR_DATA_MAX = 180;
function frData(fr: { title: string; body: string } | null): Record<string, string> {
  if (!fr) return {};
  return { titleFr: fr.title.slice(0, FR_DATA_MAX), bodyFr: fr.body.slice(0, FR_DATA_MAX) };
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
    private readonly translations?: TranslationService,
  ) {}

  /** An authored French version is data like any other translation: rows keyed by the notification id. */
  private async keepAuthored(n: Notification, fr: Authored): Promise<void> {
    if (!fr || !this.translations) return;
    await this.translations.saveAuthor('notification', n.id, [
      { field: 'title', locale: 'fr', value: fr.title },
      { field: 'body', locale: 'fr', value: fr.body },
    ]);
  }

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
    await this.keepAuthored(n, data.fr);
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'role', 'prefs', 'locale'] }).catch(() => null);
    const link = linkFor(user?.role, n.type, n.entityId);
    // The live copy carries the page it opens (the bell and desktop alerts follow it) and the French text.
    this.emitter.toUser(userId, 'notification:new', NotificationsService.view(n, link, data.fr));
    // Also reach the user when the app is closed. Fire-and-forget: push is
    // best-effort and must never slow down or fail the triggering action.
    void this.pushToUser(userId, n, link, user, data.extra, data.fr);
    return n;
  }

  /** The stored row plus the page it opens and its French text, as sockets and the list deliver it. */
  private static view(n: Notification, link: string, authored?: Authored): NoticeView {
    const fr = NotificationsService.french(n, authored);
    return { ...n, link, titleFr: fr?.title ?? null, bodyFr: fr?.body ?? null };
  }

  /** What its sender authored wins over the built-in patterns. */
  private static french(n: Pick<Notification, 'title' | 'body'>, authored?: Authored) {
    return frenchNotice({ title: n.title, body: n.body, titleFr: authored?.title, bodyFr: authored?.body });
  }

  /** FCM to the user's devices, in their language, unless they turned push off in Settings. */
  private async pushToUser(
    userId: string,
    n: Notification,
    link: string,
    user: Pick<User, 'prefs' | 'locale'> | null,
    extra?: Record<string, string>,
    authored?: Authored,
  ): Promise<void> {
    try {
      if (user && UsersService.parsePrefs(user.prefs).push === false) return;
      const fr = NotificationsService.french(n, authored);
      const text = (user?.locale === 'fr' && fr) || n;
      await this.push.sendToUser(userId, {
        title: text.title,
        body: text.body,
        link,
        data: { type: n.type, entityId: n.entityId ?? '', notificationId: n.id, ...(extra ?? {}), ...frData(fr) },
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
    await this.keepAuthored(n, data.fr);
    this.emitter.toRole(role, 'notification:new', NotificationsService.view(n, linkFor(role, n.type, n.entityId), data.fr));
    void this.pushToRole(role, n, data.extra, data.fr);
    return n;
  }

  /**
   * Role pushes: staff get every alert on the web portals they turned alerts on for; phones only get marketing
   * broadcasts and rider task alerts, so nobody is buzzed for every order. Users who turned push off are skipped.
   * The French text goes along, so each device is served in its owner's language.
   */
  private async pushToRole(role: string, n: Notification, extra?: Record<string, string>, authored?: Authored): Promise<void> {
    try {
      const optedOut = await this.users.find({ where: { role: role as User['role'], prefs: Like('%"push":false%') }, select: ['id'] });
      const skipUserIds = new Set(optedOut.map((u) => u.id));
      const fr = NotificationsService.french(n, authored);
      const payload = {
        title: n.title,
        body: n.body,
        ...(fr ? { fr } : {}),
        link: linkFor(role, n.type, n.entityId),
        data: { type: n.type, entityId: n.entityId ?? '', notificationId: n.id, ...(extra ?? {}), ...frData(fr) },
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

  /** The user's own notices and their role's broadcasts, newest first, each with the page it opens and its French text. */
  async listForUser(userId: string, role: string): Promise<NoticeView[]> {
    const rows = await this.repo.find({
      where: [{ userId }, { role }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    // One batched lookup for the authored French of the whole page.
    const authored = this.translations ? await this.translations.rowsFor('notification', rows.map((n) => n.id)) : new Map();
    return rows.map((n) => {
      const mine = (authored.get(n.id) ?? []) as { field: string; locale: string; value: string }[];
      const title = mine.find((r) => r.field === 'title' && r.locale === 'fr')?.value;
      const body = mine.find((r) => r.field === 'body' && r.locale === 'fr')?.value;
      return NotificationsService.view(n, linkFor(role, n.type, n.entityId), title && body ? { title, body } : null);
    });
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
