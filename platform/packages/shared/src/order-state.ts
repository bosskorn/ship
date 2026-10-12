import { ActorType, OrderStatus } from './enums';

/**
 * Order state machine. The server is the only component allowed to apply
 * transitions; clients send *intents* (accept, arrive, pickup, deliver...)
 * which the server validates against this table.
 */
type Transition = { to: OrderStatus; actors: ActorType[] };

const S = OrderStatus;
const A = ActorType;

export const ORDER_TRANSITIONS: Record<OrderStatus, Transition[]> = {
  DRAFT: [
    { to: S.QUOTED, actors: [A.SYSTEM] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.SYSTEM] },
  ],
  QUOTED: [
    { to: S.PAYMENT_PENDING, actors: [A.SYSTEM] },
    { to: S.SCHEDULED, actors: [A.SYSTEM] },
    { to: S.SEARCHING_DRIVER, actors: [A.SYSTEM] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.SYSTEM, A.OPS] },
  ],
  PAYMENT_PENDING: [
    { to: S.SEARCHING_DRIVER, actors: [A.SYSTEM] },
    { to: S.SCHEDULED, actors: [A.SYSTEM] },
    { to: S.FAILED, actors: [A.SYSTEM] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.SYSTEM, A.OPS] },
  ],
  SCHEDULED: [
    { to: S.SEARCHING_DRIVER, actors: [A.SYSTEM, A.OPS] },
    { to: S.DRIVER_ASSIGNED, actors: [A.OPS] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.OPS, A.SYSTEM] },
  ],
  SEARCHING_DRIVER: [
    { to: S.DRIVER_ASSIGNED, actors: [A.DRIVER, A.OPS, A.SYSTEM] },
    { to: S.NO_DRIVER, actors: [A.SYSTEM] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.OPS, A.SYSTEM] },
  ],
  NO_DRIVER: [
    { to: S.SEARCHING_DRIVER, actors: [A.OPS, A.SYSTEM, A.CUSTOMER] },
    { to: S.DRIVER_ASSIGNED, actors: [A.OPS] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.OPS, A.SYSTEM] },
  ],
  DRIVER_ASSIGNED: [
    { to: S.GOING_TO_PICKUP, actors: [A.DRIVER, A.SYSTEM] },
    { to: S.SEARCHING_DRIVER, actors: [A.DRIVER, A.OPS] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.OPS] },
  ],
  GOING_TO_PICKUP: [
    { to: S.ARRIVED_PICKUP, actors: [A.DRIVER, A.OPS] },
    { to: S.SEARCHING_DRIVER, actors: [A.DRIVER, A.OPS] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.OPS] },
  ],
  ARRIVED_PICKUP: [
    { to: S.PICKED_UP, actors: [A.DRIVER, A.OPS] },
    { to: S.SEARCHING_DRIVER, actors: [A.DRIVER, A.OPS] },
    { to: S.CANCELLED, actors: [A.CUSTOMER, A.OPS] },
  ],
  PICKED_UP: [
    { to: S.IN_TRANSIT, actors: [A.DRIVER, A.SYSTEM, A.OPS] },
    { to: S.RETURNING, actors: [A.OPS] },
  ],
  IN_TRANSIT: [
    { to: S.ARRIVED_DESTINATION, actors: [A.DRIVER, A.OPS] },
    { to: S.RETURNING, actors: [A.DRIVER, A.OPS] },
    { to: S.FAILED, actors: [A.OPS] },
  ],
  ARRIVED_DESTINATION: [
    { to: S.DELIVERED, actors: [A.DRIVER, A.OPS] },
    // multi-stop: after completing a non-final stop, continue to the next one
    { to: S.IN_TRANSIT, actors: [A.DRIVER, A.SYSTEM, A.OPS] },
    { to: S.RETURNING, actors: [A.DRIVER, A.OPS] },
    { to: S.FAILED, actors: [A.OPS] },
  ],
  RETURNING: [
    { to: S.RETURNED, actors: [A.DRIVER, A.OPS] },
    { to: S.FAILED, actors: [A.OPS] },
  ],
  DELIVERED: [],
  CANCELLED: [],
  FAILED: [],
  RETURNED: [],
};

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  S.DELIVERED,
  S.CANCELLED,
  S.FAILED,
  S.RETURNED,
];

/** Statuses during which a driver is attached and working the order. */
export const ACTIVE_DRIVER_STATUSES: OrderStatus[] = [
  S.DRIVER_ASSIGNED,
  S.GOING_TO_PICKUP,
  S.ARRIVED_PICKUP,
  S.PICKED_UP,
  S.IN_TRANSIT,
  S.ARRIVED_DESTINATION,
  S.RETURNING,
];

/** Customer may cancel without ops involvement only before pickup. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = [
  S.DRAFT,
  S.QUOTED,
  S.PAYMENT_PENDING,
  S.SCHEDULED,
  S.SEARCHING_DRIVER,
  S.NO_DRIVER,
  S.DRIVER_ASSIGNED,
  S.GOING_TO_PICKUP,
  S.ARRIVED_PICKUP,
];

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): boolean {
  return ORDER_TRANSITIONS[from]?.some((t) => t.to === to && t.actors.includes(actor)) ?? false;
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
    public readonly actor: ActorType,
  ) {
    super(`Transition ${from} -> ${to} is not allowed for ${actor}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): void {
  if (!canTransition(from, to, actor)) throw new InvalidTransitionError(from, to, actor);
}
