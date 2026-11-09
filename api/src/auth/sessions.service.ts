import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { AuditLog, RefreshToken, User } from '../database/entities';
import { AUDIT_ROLES } from '../common/role-groups';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

/**
 * How long a refresh token that was just used is still accepted (audit A-09). Inside this window the same token is
 * answered with the token that replaced it, so two quick refreshes from one app (a page reload, two tabs, a retry after
 * a lost response) never sign the person out. After it, presenting the token again is a reuse: someone else holds a
 * copy, and every session of the account is ended.
 */
export const REFRESH_REUSE_GRACE_MS = 20_000;

/** Used and revoked rows are kept this long for reuse detection, then pruned (an older reuse is simply refused). */
const KEEP_USED_MS = 7 * 24 * 3600_000;

/** How many replacements a reuse inside the grace window may follow to reach the live token (two tabs, a few retries). */
const MAX_CHAIN = 10;

/** What a refresh with a tracked token (one that carries a `jti`) is answered with. */
export type RotationOutcome =
  /** The token was current: mint a new one in this family (see {@link SessionsService.claim}). */
  | { kind: 'current'; row: RefreshToken }
  /** The token was used moments ago: hand out the token that is live now in its family, with this id and expiry. */
  | { kind: 'grace'; live: RefreshToken }
  /** Unknown, revoked, or used outside the grace window. `reuse` means the account's sessions were just ended. */
  | { kind: 'refused'; reuse: boolean };

/**
 * Everything that ends sessions, in one place (audit A-02, A-09).
 *
 * `revoke(userId)` bumps the account's `tokenVersion` (every access and refresh token issued before stops working, on
 * REST, on the socket handshake and at the socket's next re-authentication), marks the stored refresh tokens revoked and
 * closes every open socket of the account at once, through the Socket.IO server the realtime gateway registered on the
 * {@link RealtimeEmitter} (with the Redis adapter this reaches the sockets on every API instance; without it, the one
 * process). Callers that already bumped `tokenVersion` in their own save use {@link endSessions}.
 *
 * It also keeps the refresh-token records used for rotation: every refresh replaces the token, and a token presented
 * again after {@link REFRESH_REUSE_GRACE_MS} ends every session of the account and is written to the audit log.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    @Optional() private readonly emitter?: RealtimeEmitter,
  ) {}

  /** Sign the account out everywhere: new `tokenVersion`, stored refresh tokens revoked, open sockets closed. */
  async revoke(userId: string, opts: { exceptSocketId?: string } = {}): Promise<void> {
    await this.users.increment({ id: userId }, 'tokenVersion', 1);
    await this.endSessions(userId, opts);
  }

  /**
   * For callers that bumped `tokenVersion` themselves (in the same save as the new password, the suspension…): revoke the
   * stored refresh tokens and close the open sockets, except `exceptSocketId` (the device that made the change and got
   * fresh tokens back).
   */
  async endSessions(userId: string, opts: { exceptSocketId?: string } = {}): Promise<void> {
    await this.tokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    this.emitter?.disconnectUser(userId, opts.exceptSocketId);
  }

  // ---- refresh-token rotation ---------------------------------------------------------------------------------------

  /** A new id for a refresh token (its `jti`), and a new family for a fresh sign-in. */
  newId(): string {
    return randomUUID();
  }

  /** Remember a refresh token that was just signed. Old rows of the account are pruned on the way. */
  async record(row: { id: string; userId: string; familyId: string; expiresAt: Date }): Promise<void> {
    await this.prune(row.userId);
    await this.tokens.insert({ ...row, usedAt: null, replacedById: null, revokedAt: null });
  }

  /** Forget a token that was minted but lost the race to replace its parent (see {@link claim}). */
  async discard(id: string): Promise<void> {
    await this.tokens.delete({ id });
  }

  /**
   * Mark `id` used and replaced by `successorId`, only if nobody did so first. Exactly one of several concurrent
   * refreshes with the same token wins; the others are then answered from the grace window.
   */
  async claim(id: string, successorId: string): Promise<boolean> {
    const res = await this.tokens.update({ id, usedAt: IsNull(), revokedAt: IsNull() }, { usedAt: new Date(), replacedById: successorId });
    return (res.affected ?? 0) > 0;
  }

  /** What to do with a refresh token carrying `jti`, presented for `user`. A detected reuse has already ended every session. */
  async inspect(user: User, jti: string, now = Date.now()): Promise<RotationOutcome> {
    const row = await this.tokens.findOne({ where: { id: jti } });
    if (!row || row.userId !== user.id || row.revokedAt) return { kind: 'refused', reuse: false };
    if (!row.usedAt) return { kind: 'current', row };
    if (now - new Date(row.usedAt).getTime() <= REFRESH_REUSE_GRACE_MS) {
      const live = await this.liveDescendant(row);
      if (live) return { kind: 'grace', live };
    }
    await this.reuseDetected(user, row);
    return { kind: 'refused', reuse: true };
  }

  /** The token that is current now in the chain that replaced `row` (the next one, or later when it was refreshed again). */
  private async liveDescendant(row: RefreshToken): Promise<RefreshToken | null> {
    let cur: RefreshToken | null = row;
    for (let i = 0; i < MAX_CHAIN && cur?.replacedById; i++) {
      cur = await this.tokens.findOne({ where: { id: cur.replacedById } });
      if (!cur || cur.revokedAt) return null;
      if (!cur.usedAt) return cur;
    }
    return null;
  }

  /** A refresh token came back after it was replaced: someone else has a copy. End every session and leave a trace. */
  private async reuseDetected(user: User, row: RefreshToken): Promise<void> {
    this.logger.warn(`refresh token reuse for user ${user.id} (family ${row.familyId}): all sessions revoked`);
    await this.revoke(user.id);
    const log = await this.audit.save(
      this.audit.create({
        actor: user.name,
        role: user.role,
        action: 'session.refresh_reuse',
        entity: 'user',
        entityId: user.id,
        detail: `A refresh token used at ${new Date(row.usedAt as Date).toISOString()} was presented again; every session of the account was signed out.`,
      }),
    );
    this.emitter?.toRoles(AUDIT_ROLES, 'audit:created', log);
  }

  /** Rows nobody can use any more: expired, or used / revoked longer ago than {@link KEEP_USED_MS}. */
  private async prune(userId: string): Promise<void> {
    const now = new Date();
    const old = new Date(now.getTime() - KEEP_USED_MS);
    const dead = await this.tokens.find({ where: [
      { userId, expiresAt: LessThan(now) },
      { userId, usedAt: LessThan(old) },
      { userId, revokedAt: LessThan(old) },
    ], select: { id: true }, take: 500 });
    if (dead.length) await this.tokens.delete({ id: In(dead.map((d) => d.id)) });
  }
}
