import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Notification, NotificationRead, User } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { UsersService } from '../users/users.service';
import { linkFor } from './links';
import { frenchNotice } from './localize';
import { PushService } from './push.service';
import { TranslationService } from '../translation/translation.service';
import { TeamDirectory } from '../sellers/team-directory';
import { noticeCategory } from '../users/notify-prefs';

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

/** The `role` of a saved notice for all admin roles at once (see `toAdmins`). */
export const ALL_ADMINS = 'admins';

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
    // Staff of a store hear the notices addressed to its owner that their role handles (seller team accounts).
    @Optional() private readonly team?: TeamDirectory,
    // Who has read a role-wide notice (those rows have no owner to hold a `read` flag).
    @Optional() @InjectRepository(NotificationRead) private readonly reads?: Repository<NotificationRead>,
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
    const n = await this.deliver(userId, data);
    await this.toStoreStaff(userId, data);
    return n;
  }

  /** Save, emit and push one user's copy (no staff fan-out: a staff copy is never repeated). */
  private async deliver(userId: string, data: NoticeInput): Promise<Notification> {
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

  /** A notice addressed to a store owner also goes to the staff whose role handles it (their own saved copy and push). */
  private async toStoreStaff(ownerUserId: string, data: NoticeInput): Promise<void> {
    if (!this.team) return;
    try {
      for (const id of await this.team.recipientsForNotice(ownerUserId, data.type ?? 'system')) await this.deliver(id, data);
    } catch {
      /* best-effort: the owner's own notice is already saved */
    }
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
      if (user) {
        const prefs = UsersService.parsePrefs(user.prefs);
        if (prefs.push === false) return;
        // Switched off in Settings -> Notifications: still in the bell, no push.
        const kind = noticeCategory(n.type);
        if (kind && prefs.notify[kind] === false) return;
      }
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
    // The super admin hears what every admin role hears.
    if (role.startsWith('admin_')) {
      this.emitter.toRole('admin', 'notification:new', NotificationsService.view(n, linkFor('admin', n.type, n.entityId), data.fr));
      void this.pushToRole('admin', n, data.extra, data.fr);
    }
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
      // A kind switched off in Settings -> Notifications is not pushed to staff either (the bell still has it).
      const kind = noticeCategory(n.type);
      if (kind) {
        const off = await this.users.find({ where: { role: role as User['role'], prefs: Like(`%"${kind}":false%`) }, select: ['id'] });
        for (const u of off) skipUserIds.add(u.id);
      }
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

  /**
   * Broadcast to every admin role at once. ONE saved row (role `admins`) that all of them see, each reading it on their
   * own, so the super admin does not get the same notice six times.
   */
  async toAdmins(data: NoticeInput): Promise<void> {
    const n = await this.repo.save(
      this.repo.create({ role: ALL_ADMINS, title: data.title, body: data.body, type: data.type ?? 'system', entityId: data.entityId ?? null }),
    );
    await this.keepAuthored(n, data.fr);
    this.emitter.toRoles(ADMIN_ROLES, 'notification:new', NotificationsService.view(n, linkFor('admin', n.type, n.entityId), data.fr));
    for (const role of ADMIN_ROLES) void this.pushToRole(role, n, data.extra, data.fr);
  }

  /** Which saved role rows a viewer of `role` may see: their own role's, every admin role's for the super admin. */
  private static roleRows(role: string): Record<string, unknown>[] {
    if (role === 'admin') return [{ role: Like('admin%') }];
    if (role.startsWith('admin_')) return [{ role }, { role: ALL_ADMINS }];
    return [{ role }];
  }

  /** Is a row addressed to `rowRole` one that a viewer of `viewerRole` may see (and so mark read)? */
  static canSeeRoleRow(viewerRole: string, rowRole: string | null): boolean {
    if (!rowRole) return false;
    if (viewerRole === 'admin') return rowRole.startsWith('admin');
    if (viewerRole.startsWith('admin_')) return rowRole === viewerRole || rowRole === ALL_ADMINS;
    return rowRole === viewerRole;
  }

  /** The user's own notices and their role's broadcasts, newest first, each with the page it opens and its French text. */
  async listForUser(userId: string, role: string): Promise<NoticeView[]> {
    const rows = await this.repo.find({
      where: [{ userId }, ...NotificationsService.roleRows(role)] as never,
      order: { createdAt: 'DESC' },
      take: 100,
    });
    // A role-wide row has no owner to carry `read`: this viewer's own read marks decide.
    const roleIds = rows.filter((n) => !n.userId).map((n) => n.id);
    const seen = new Set(
      this.reads && roleIds.length ? (await this.reads.find({ where: { userId, notificationId: In(roleIds) } })).map((r) => r.notificationId) : [],
    );
    // One batched lookup for the authored French of the whole page.
    const authored = this.translations ? await this.translations.rowsFor('notification', rows.map((n) => n.id)) : new Map();
    return rows.map((n) => {
      const mine = (authored.get(n.id) ?? []) as { field: string; locale: string; value: string }[];
      const title = mine.find((r) => r.field === 'title' && r.locale === 'fr')?.value;
      const body = mine.find((r) => r.field === 'body' && r.locale === 'fr')?.value;
      const view = NotificationsService.view(n, linkFor(role, n.type, n.entityId), title && body ? { title, body } : null);
      return n.userId ? view : { ...view, read: seen.has(n.id) };
    });
  }

  /**
   * Scoped to the owner so one user cannot touch another's notifications. A role-wide notice (given `role`, the
   * reader's) is marked read for this reader only.
   */
  async markRead(id: string, userId: string, role?: string): Promise<void> {
    const res = await this.repo.update({ id, userId }, { read: true });
    if (res.affected || !role || !this.reads) return;
    const row = await this.repo.findOne({ where: { id } });
    if (row && !row.userId && NotificationsService.canSeeRoleRow(role, row.role)) {
      await this.reads.createQueryBuilder().insert().values({ notificationId: id, userId }).orIgnore().execute();
    }
  }

  /** Mark every one of a user's notifications read in a single call (and, given `role`, the role-wide ones too). */
  async markAllRead(userId: string, role?: string): Promise<number> {
    const res = await this.repo.update({ userId, read: false }, { read: true });
    let count = res.affected ?? 0;
    if (role && this.reads) {
      const rows = await this.repo.find({ where: NotificationsService.roleRows(role) as never, select: ['id'], order: { createdAt: 'DESC' }, take: 300 });
      const done = new Set(
        rows.length ? (await this.reads.find({ where: { userId, notificationId: In(rows.map((r) => r.id)) } })).map((r) => r.notificationId) : [],
      );
      const fresh = rows.filter((r) => !done.has(r.id));
      if (fresh.length) {
        await this.reads.createQueryBuilder().insert().values(fresh.map((r) => ({ notificationId: r.id, userId }))).orIgnore().execute();
        count += fresh.length;
      }
    }
    return count;
  }
}
