import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Thin emitter facade so business services don't depend on the gateway class. */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toOrder(orderId: string, event: string, payload: unknown) {
    this.server?.to(`order:${orderId}`).emit(event, payload);
  }

  /** Emit once per socket even if it is in several of the rooms. */
  toRooms(rooms: string[], event: string, payload: unknown) {
    if (rooms.length) this.server?.to(rooms).emit(event, payload);
  }

  toOps(event: string, payload: unknown) {
    this.server?.to('ops').emit(event, payload);
  }
}
