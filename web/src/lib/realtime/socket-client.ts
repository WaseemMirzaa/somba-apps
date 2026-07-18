import { io, Socket } from "socket.io-client";
import type { Ack } from "./types";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

/**
 * Singleton Socket.IO client. ONE connection per browser tab carries every
 * read/write (via `request`) and every live update (via `on`). We never poll
 * the REST API for data.
 */
class SocketClient {
  private socket: Socket | null = null;

  connect(token: string): Socket {
    if (this.socket?.connected) return this.socket;
    this.socket?.close();
    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    return this.socket;
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }

  get current(): Socket | null {
    return this.socket;
  }

  /** Request→ack helper: emits and resolves the server's `{ok,data}` reply. */
  request<T>(event: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const s = this.socket;
      if (!s) return reject(new Error("Socket not connected."));
      s.timeout(8000).emit(event, body ?? {}, (err: Error | null, res: Ack<T>) => {
        if (err) return reject(err);
        if (!res || res.ok === false) {
          return reject(new Error(res?.error ?? "Request failed."));
        }
        resolve(res.data);
      });
    });
  }
}

export const socketClient = new SocketClient();
export { SOCKET_URL };
