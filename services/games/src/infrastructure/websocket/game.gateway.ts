import { Inject, Injectable } from "@nestjs/common";
import {
  type OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { WS_EVENTS, type WsEvent } from "@crash/contracts";
import { CurrentRoundStore } from "../../application/current-round.store";
import type { ClockPort, GameBroadcastPort } from "../../application/ports";
import { toRoundSnapshot } from "../../application/views";
import { CLOCK } from "../di-tokens";

/**
 * Push-only socket: every player action goes through REST; the gateway
 * exists so all connected clients see the same state in real time.
 * New connections immediately receive a full snapshot so a page refresh
 * lands mid-round without missing context.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: ["http://localhost:3000"] } })
export class GameGateway implements OnGatewayConnection, GameBroadcastPort {
  @WebSocketServer()
  private readonly server?: Server;

  constructor(
    private readonly store: CurrentRoundStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  handleConnection(client: Socket): void {
    const round = this.store.current;
    if (round) {
      client.emit(WS_EVENTS.ROUND_SNAPSHOT, toRoundSnapshot(round, this.clock.now()));
    }
  }

  emit(event: WsEvent, payload: object): void {
    this.server?.emit(event, payload);
  }
}
