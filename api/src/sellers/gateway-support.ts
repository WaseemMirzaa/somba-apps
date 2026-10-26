import type { Socket } from 'socket.io';

/** The account RealtimeGateway puts on a socket when it authenticates the handshake. */
export interface SocketUser {
  id: string;
  role: string;
  name: string;
}
export type AuthedSocket = Socket & { data: { user?: SocketUser } };

export const ok = <T>(data: T) => ({ ok: true as const, data });
export const fail = (error: string) => ({ ok: false as const, error });

/** A signed-in account (guests are refused). */
export function requireUser(client: AuthedSocket): SocketUser {
  const u = client.data?.user;
  if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
  return u;
}
