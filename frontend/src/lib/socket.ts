import { io, type Socket } from "socket.io-client";
import { appConfig } from "./config";

let socket: Socket | null = null;

/**
 * Singleton socket through Kong: the /games route is stripped, so the
 * gateway sees the default /socket.io path.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(appConfig.apiUrl, {
      path: "/games/socket.io",
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
