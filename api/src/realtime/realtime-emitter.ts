import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Thin indirection so domain services can push real-time events WITHOUT
 * importing the gateway (which would create a circular dependency). The
 * gateway registers its Socket.IO server here in `afterInit`.
 *
 * Room convention:
 *   user:{userId}  — a single connected account
 *   role:{role}    — every connected account with that role (dashboards)
 */
@Injectable()
export class RealtimeEmitter {
  private readonly logger = new Logger(RealtimeEmitter.name);
  private server: Server | null = null;

  register(server: Server): void {
    this.server = server;
  }

  static userRoom(userId: string): string {
    return `user:${userId}`;
  }

  static roleRoom(role: string): string {
    return `role:${role}`;
  }

  private readonly userViews = new Map<string, (userId: string, payload: unknown) => unknown | Promise<unknown>>();
  private readonly userQueue = new Map<string, Promise<void>>();

  /**
   * Some events are shown differently to the single account they are addressed to (an order tells its
   * customer who the rider is, and nobody else). The owner registers that view once; it runs on every
   * `toUser` of the event. A view that needs I/O may return a promise: events to that account are then
   * delivered in order, and a failing view falls back to the plain payload.
   */
  registerUserView(events: string[], fn: (userId: string, payload: unknown) => unknown | Promise<unknown>): void {
    for (const e of events) this.userViews.set(e, fn);
  }

  toUser(userId: string, event: string, payload: unknown): void {
    const room = RealtimeEmitter.userRoom(userId);
    const view = this.userViews.get(event);
    if (!view) return this.emit(room, event, payload);
    const key = `${room}|${event}`;
    const waiting = this.userQueue.get(key);
    let out: unknown;
    try {
      out = view(userId, payload);
    } catch {
      out = payload;
    }
    if (!waiting && !(out instanceof Promise)) return this.emit(room, event, out);
    const tail: Promise<void> = (waiting ?? Promise.resolve())
      .then(() => out)
      .catch(() => payload)
      .then((p) => this.emit(room, event, p))
      .finally(() => {
        if (this.userQueue.get(key) === tail) this.userQueue.delete(key);
      });
    this.userQueue.set(key, tail);
  }

  private readonly fanouts = new Map<string, (payload: unknown) => void | Promise<void>>();

  /**
   * Some events must also reach individual accounts that no role room covers
   * (a seller only hears about orders and listings that are THEIRS). The owner
   * of that rule registers it here once; it runs whenever the event is sent to
   * a role room, so every existing emit site benefits without changes.
   */
  registerFanout(events: string[], fn: (event: string, payload: unknown) => void | Promise<void>): void {
    for (const e of events) this.fanouts.set(e, (payload) => fn(e, payload));
  }

  private fanout(event: string, payload: unknown): void {
    const fn = this.fanouts.get(event);
    if (!fn) return;
    Promise.resolve(fn(payload)).catch((e) => this.logger.warn(`fanout ${event} failed: ${(e as Error).message}`));
  }

  toRole(role: string, event: string, payload: unknown): void {
    this.emit(RealtimeEmitter.roleRoom(role), event, payload);
    this.fanout(event, payload);
  }

  /** Fan out to several role rooms at once (e.g. all admin sub-roles). */
  toRoles(roles: string[], event: string, payload: unknown): void {
    for (const role of roles) this.emit(RealtimeEmitter.roleRoom(role), event, payload);
    this.fanout(event, payload);
  }

  /** Room of the riders based at a warehouse; `null` = riders not tied to any warehouse. */
  static riderHubRoom(hubId: string | null): string {
    return hubId ? `riders:hub:${hubId}` : 'riders:nohub';
  }

  /**
   * Riders who may take a task of this warehouse: its own riders plus riders not tied to a warehouse. A task with
   * no warehouse goes to every rider. Each rider socket joins exactly one of these rooms on connect.
   */
  toRiders(hubId: string | null, event: string, payload: unknown): void {
    if (!hubId) return this.emit(RealtimeEmitter.roleRoom('rider'), event, payload);
    this.emit(RealtimeEmitter.riderHubRoom(hubId), event, payload);
    this.emit(RealtimeEmitter.riderHubRoom(null), event, payload);
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`No socket server yet; dropped ${event} → ${room}`);
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
