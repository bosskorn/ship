import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { locationPingSchema, WsEvent } from '@ship/shared';
import type { Server, Socket } from 'socket.io';
import type { AuthUser } from '../../common/auth';
import { TokenService } from '../../common/token.service';
import { OrderAccessService } from '../orders/order-access.service';
import { TrackingService } from '../tracking/tracking.service';
import { RealtimeService } from './realtime.service';

type AuthedSocket = Socket & { data: { user: AuthUser } };

@WebSocketGateway({ cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger('Realtime');

  constructor(
    private readonly tokens: TokenService,
    private readonly realtime: RealtimeService,
    private readonly access: OrderAccessService,
    private readonly tracking: TrackingService,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
    // Authenticate during the handshake so unauthenticated sockets never join rooms.
    server.use(async (socket, next) => {
      try {
        const token = (socket.handshake.auth?.token as string) || socket.handshake.headers.authorization?.replace(/^Bearer /, '');
        if (!token) return next(new Error('UNAUTHENTICATED'));
        socket.data.user = await this.tokens.verifyAccess(token);
        next();
      } catch {
        next(new Error('UNAUTHENTICATED'));
      }
    });
  }

  async handleConnection(socket: AuthedSocket) {
    const user = socket.data.user;
    if (!user) return socket.disconnect(true);
    await socket.join(`user:${user.id}`);
    if (user.role === 'OPS' || user.role === 'ADMIN') await socket.join('ops');
  }

  @SubscribeMessage(WsEvent.SUBSCRIBE_ORDER)
  async subscribeOrder(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { orderId: string }) {
    if (!body?.orderId || !(await this.access.canView(socket.data.user, body.orderId))) return { ok: false };
    await socket.join(`order:${body.orderId}`);
    return { ok: true };
  }

  @SubscribeMessage(WsEvent.UNSUBSCRIBE_ORDER)
  async unsubscribeOrder(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { orderId: string }) {
    await socket.leave(`order:${body?.orderId}`);
    return { ok: true };
  }

  /** Foreground GPS over the socket; background GPS uses the batched REST endpoint. */
  @SubscribeMessage(WsEvent.LOCATION_PING)
  async locationPing(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: unknown) {
    if (socket.data.user.role !== 'DRIVER') return { ok: false };
    const parsed = locationPingSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'INVALID_PING' };
    try {
      await this.tracking.ingest(socket.data.user.id, [parsed.data]);
      return { ok: true };
    } catch (e) {
      this.logger.warn(`ping rejected: ${(e as Error).message}`);
      return { ok: false };
    }
  }
}
