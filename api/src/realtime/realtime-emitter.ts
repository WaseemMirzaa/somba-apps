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

  toUser(userId: string, event: string, payload: unknown): void {
    this.emit(RealtimeEmitter.userRoom(userId), event, payload);
  }

  toRole(role: string, event: string, payload: unknown): void {
    this.emit(RealtimeEmitter.roleRoom(role), event, payload);
  }

  /** Fan out to several role rooms at once (e.g. all admin sub-roles). */
  toRoles(roles: string[], event: string, payload: unknown): void {
    for (const role of roles) this.toRole(role, event, payload);
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`No socket server yet; dropped ${event} → ${room}`);
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
