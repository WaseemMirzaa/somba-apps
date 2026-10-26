import { io, Socket } from "socket.io-client";
import type { Ack, RequestError } from "./types";
import { currentLocale, localizeApiError } from "../api-errors";

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

  /** Connect with a JWT, or anonymously (guest, read-only) when omitted.
   * Always tears down any existing socket so a guest→authenticated upgrade
   * (or account switch) re-runs the handshake with the new credentials. */
  connect(token?: string): Socket {
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = io(SOCKET_URL, {
      auth: token ? { token } : {},
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
  request<T>(event: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const s = this.socket;
      if (!s) return reject(new Error("Socket not connected."));
      s.timeout(opts.timeoutMs ?? 8000).emit(event, body ?? {}, (err: Error | null, res: Ack<T>) => {
        if (err) return reject(err);
        if (!res || res.ok === false) {
          // `raw` keeps the server's English sentence so callers can recognise a known failure (e.g. "not served")
          // whatever language the message was shown in.
          const failure = new Error(localizeApiError(res?.error ?? "Request failed.", currentLocale())) as RequestError;
          failure.raw = res?.error ?? "Request failed.";
          // The refusal's structured fields (docs/contracts/areas.md `not_served`: areaName, areaNameEn, servedCities…).
          if (res && typeof res === "object") {
            failure.ack = res as unknown as Record<string, unknown>;
            if (typeof res.code === "string") failure.code = res.code;
          }
          return reject(failure);
        }
        resolve(res.data);
      });
    });
  }
}

export const socketClient = new SocketClient();
export { SOCKET_URL };
