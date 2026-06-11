import { io, type Socket } from "socket.io-client";
import { appConfig } from "./config";

let socket: Socket | null = null;

/**
 * Singleton socket through Kong: the /games route is stripped, so the
 * gateway sees the default /socket.io path.
 *
 * Transports are left at the default (polling first, upgrade to
 * websocket): a websocket-first client never falls back when the
 * upgrade is rejected by a proxy, it just retries the same transport
 * forever.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(appConfig.apiUrl, {
      path: "/games/socket.io",
    });
  }
  return socket;
}
