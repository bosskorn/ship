import { io, Socket } from 'socket.io-client';
import { API_URL, getSession, onSession } from './api';

let socket: Socket | null = null;

/** One shared socket for the dashboard; reconnects with the current token. */
export function opsSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: getSession()?.accessToken }),
  });
  onSession((s) => {
    if (!s) {
      socket?.disconnect();
      socket = null;
    }
  });
  return socket;
}
