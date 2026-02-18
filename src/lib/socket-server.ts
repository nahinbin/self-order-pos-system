import type { Server } from "socket.io";

declare global {
  // eslint-disable-next-line no-var
  var __socket_io: Server | undefined;
}

/** Get Socket.io server instance (set by custom server.js). */
export function getIO(): Server | null {
  if (typeof globalThis !== "undefined" && (globalThis as unknown as { __socket_io?: Server }).__socket_io) {
    return (globalThis as unknown as { __socket_io: Server }).__socket_io;
  }
  if (typeof global !== "undefined" && (global as unknown as { __socket_io?: Server }).__socket_io) {
    return (global as unknown as { __socket_io: Server }).__socket_io;
  }
  return null;
}

/** Emit new order to cashier dashboard for a restaurant. */
export function emitNewOrder(restaurantId: number, order: unknown): void {
  const io = getIO();
  io?.to(`restaurant:${restaurantId}`).emit("order:new", order);
}

/** Emit updated order (status/timing/payment changes) to dashboards/clients. */
export function emitOrderUpdated(restaurantId: number, order: unknown): void {
  const io = getIO();
  io?.to(`restaurant:${restaurantId}`).emit("order:update", order);
}
