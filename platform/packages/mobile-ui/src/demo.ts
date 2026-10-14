/**
 * Demo mode: an in-app stand-in for the backend so the apps can be explored without a server.
 * It answers the same HTTP routes and emits the same socket events, and plays out realistic
 * scenarios (driver found → driving → delivered; job offers for drivers). Data lives in memory
 * and resets when the app restarts. Never used when a real session exists.
 */
import {
  EarningsSummary,
  haversineMeters,
  JobOfferPayload,
  LatLng,
  OrderStatus,
  OrderView,
  QuoteOption,
  TimelineEvent,
  VEHICLE_TYPES,
  VehicleType,
  WsEvent,
} from '@ship/shared';

type Handler = (payload: any) => void;

/** Minimal Socket.IO look-alike: the apps only use on/off/emit/disconnect. */
export class DemoSocket {
  private handlers = new Map<string, Set<Handler>>();
  connected = true;
  on(event: string, h: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(h);
    return this;
  }
  off(event: string, h?: Handler) {
    if (h) this.handlers.get(event)?.delete(h);
    else this.handlers.delete(event);
    return this;
  }
  /** Client → server messages (subscribe, pings) need no handling; acks resolve immediately. */
  emit(_event: string, _payload?: unknown, ack?: (r: unknown) => void) {
    ack?.({ ok: true });
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  /** Server → client push. */
  push(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}

const RATES: Record<VehicleType, { base: number; perKm: number; min: number; stop: number; speed: number }> = {
  MOTORCYCLE: { base: 3000, perKm: 650, min: 4500, stop: 1500, speed: 7.5 },
  CAR: { base: 6000, perKm: 900, min: 9000, stop: 2500, speed: 6.1 },
  PICKUP: { base: 15000, perKm: 1400, min: 25000, stop: 4000, speed: 5.8 },
  VAN: { base: 20000, perKm: 1600, min: 30000, stop: 5000, speed: 5.6 },
};
const GP_BP = 800;
const DEMO_OTP = ['4826', '7351', '1964', '5208'];
const BKK_START: LatLng = { lat: 13.8285, lng: 100.5725 };

const uid = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const roundBaht = (s: number) => Math.ceil(s / 100) * 100;
const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });

class DemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface DemoOrder {
  view: OrderView;
  timeline: TimelineEvent[];
  driverPos: LatLng | null;
  eta: number | null;
  payment: { method: string; status: string; amount: string; client_data: Record<string, unknown> };
  timers: ReturnType<typeof setTimeout>[];
}

const DEMO_DRIVER = {
  id: 'demo-driver-1',
  name: 'สมชาย ใ.',
  phoneMasked: '+66•••••5678',
  phone: '0812345678',
  rating: 4.9,
  vehicle: { type: 'MOTORCYCLE' as VehicleType, plateNumber: '1กข 2468', plateProvince: 'กรุงเทพมหานคร', brand: 'Honda', model: 'Wave 110i', color: 'แดง' },
};

/** Sample places the demo uses for offers and history. */
const PLACES: { name: string; loc: LatLng }[] = [
  { name: 'เซ็นทรัล ลาดพร้าว ถ.พหลโยธิน เขตจตุจักร', loc: { lat: 13.8167, lng: 100.5615 } },
  { name: 'สยามพารากอน ถ.พระราม 1 เขตปทุมวัน', loc: { lat: 13.7466, lng: 100.5347 } },
  { name: 'ไบเทค บางนา ถ.บางนา-ตราด เขตบางนา', loc: { lat: 13.6681, lng: 100.6045 } },
  { name: 'ตลาดนัดจตุจักร ถ.กำแพงเพชร 2', loc: { lat: 13.7999, lng: 100.5503 } },
  { name: 'อาคารสาทรสแควร์ ถ.สาทรเหนือ', loc: { lat: 13.7233, lng: 100.5291 } },
  { name: 'แฟชั่นไอส์แลนด์ ถ.รามอินทรา', loc: { lat: 13.8253, lng: 100.6792 } },
];

export class DemoBackend {
  readonly socket = new DemoSocket();
  private orders = new Map<string, DemoOrder>();
  private quotes = new Map<string, { option: QuoteOption; req: any }>();
  private addresses: any[] = [];
  private notifications: any[] = [];
  private seq = 41;
  // driver side
  private presence: 'OFFLINE' | 'ONLINE' | 'BUSY' = 'OFFLINE';
  private driverPos: LatLng = BKK_START;
  private offer: JobOfferPayload | null = null;
  private offerTimer: ReturnType<typeof setTimeout> | null = null;
  private job: any = null;
  private earnings: any[] = [];
  private history: any[] = [];
  private onlineSince: number | null = null;
  private onlineAccum = 0;

  constructor(readonly role: 'CUSTOMER' | 'DRIVER') {
    if (role === 'CUSTOMER') this.seedCustomer();
    else this.seedDriver();
  }

  user() {
    return this.role === 'CUSTOMER'
      ? { id: 'demo-customer', role: 'CUSTOMER' as const, phone: '+66890000000', displayName: 'ผู้ใช้ทดลอง' }
      : { id: 'demo-driver-1', role: 'DRIVER' as const, phone: '+66812345678', displayName: 'สมชาย ใจดี' };
  }

  // ------------------------------------------------------------------ router

  async handle(method: string, rawPath: string, body: any): Promise<any> {
    await new Promise<void>((r) => setTimeout(r, 150)); // feel like a network
    const [path, qs] = rawPath.split('?');
    const query = new URLSearchParams(qs ?? '');
    const p = path.split('/').filter(Boolean);
    const M = method.toUpperCase();

    // shared
    if (path === '/auth/me') return { id: this.user().id, role: this.role, phone: this.user().phone, display_name: this.user().displayName, status: 'ACTIVE' };
    if (path === '/auth/logout' || path === '/auth/push-token') return {};
    if (path === '/me/notifications') return this.notifications.slice().reverse();

    if (this.role === 'CUSTOMER') {
      if (path === '/zones/lookup') return { serviceable: true, open: true, zone: { id: 'z', code: 'BKK', name: 'กรุงเทพฯ (โหมดสาธิต)', vehicleTypes: VEHICLE_TYPES } };
      if (path === '/me/recent-locations') return PLACES.slice(0, 3).map((x) => ({ address: x.name, lat: x.loc.lat, lng: x.loc.lng, contact_name: 'ผู้ติดต่อ', contact_phone: '0811111111' }));
      if (path === '/me/addresses' && M === 'GET') return this.addresses;
      if (path === '/me/addresses' && M === 'POST') {
        const a = { id: uid(), label: null, address: body.address, contact_name: body.contactName, contact_phone: body.contactPhone, lat: body.location.lat, lng: body.location.lng };
        this.addresses.push(a);
        return { id: a.id };
      }
      if (p[0] === 'me' && p[1] === 'addresses' && M === 'DELETE') {
        this.addresses = this.addresses.filter((a) => a.id !== p[2]);
        return {};
      }
      if (path === '/me/profile') return { ok: true };
      if (path === '/quotes') return this.quote(body);
      if (path === '/orders' && M === 'POST') return this.createOrder(body);
      if (path === '/orders' && M === 'GET') return this.listOrders(query.get('status'), Number(query.get('limit') ?? 20));
      if (p[0] === 'orders' && p[1]) {
        const o = this.orders.get(p[1]);
        if (!o) throw new DemoError(404, 'NOT_FOUND', 'ไม่พบออเดอร์');
        if (!p[2]) return o.view;
        if (p[2] === 'timeline') return o.timeline;
        if (p[2] === 'tracking') return { orderId: o.view.id, status: o.view.status, driverLocation: o.driverPos ? { ...o.driverPos, heading: null, ts: Date.now() } : null, etaSeconds: o.eta };
        if (p[2] === 'payment') return o.payment;
        if (p[2] === 'cancel') return this.cancelOrder(o);
        if (p[2] === 'rate') {
          o.view.rating = { score: body.score, comment: body.comment ?? null };
          return { ok: true };
        }
      }
    } else {
      if (path === '/driver/me') return this.driverMe();
      if (path === '/driver/presence') return this.setPresence(!!body.online, body.location);
      if (path === '/driver/location') {
        const last = body.pings?.[body.pings.length - 1];
        if (last) this.driverPos = { lat: last.lat, lng: last.lng };
        return { accepted: body.pings?.length ?? 0 };
      }
      if (path === '/driver/offers') return this.offer ? [this.offer] : [];
      if (p[1] === 'offers' && p[3] === 'accept') return this.acceptOffer(p[2]);
      if (p[1] === 'offers' && p[3] === 'decline') {
        this.offer = null;
        this.scheduleOffer(8000);
        return { ok: true };
      }
      if (path === '/driver/orders/active') return this.job;
      if (path === '/driver/orders/history') return this.history.slice().reverse();
      if (path === '/driver/earnings') return this.earningsSummary((query.get('period') as any) ?? 'today');
      if (path === '/driver/earnings/items') return this.earnings.slice().reverse();
      if (p[1] === 'orders' && this.job && p[2] === this.job.id) return this.driverStep(p.slice(3), body);
      if (['/driver/profile', '/driver/vehicles', '/driver/documents', '/driver/kyc/submit'].includes(path)) return { ok: true };
    }
    throw new DemoError(404, 'NOT_FOUND', 'ฟังก์ชันนี้ยังไม่มีในโหมดสาธิต');
  }

  // ------------------------------------------------------------------ customer

  private seedCustomer() {
    const mk = (i: number, from: number, to: number, price: number, daysAgo: number) => {
      const id = uid();
      const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      const view: OrderView = {
        id,
        orderNo: `SH2610${String(10 + i).padStart(2, '0')}0000${i}`,
        status: 'DELIVERED',
        vehicleType: 'MOTORCYCLE',
        paymentMethod: 'CASH',
        price,
        breakdown: this.breakdown(price, 0),
        distanceM: Math.round(haversineMeters(PLACES[from].loc, PLACES[to].loc) * 1.3),
        durationS: 1800,
        createdAt: created,
        updatedAt: created,
        stops: [this.stop(id, 0, 'PICKUP', PLACES[from], 'COMPLETED'), this.stop(id, 1, 'DROPOFF', PLACES[to], 'COMPLETED')],
        driver: { ...DEMO_DRIVER, phone: undefined },
        parcel: { category: 'DOCUMENT', weightKg: 1 },
        rating: { score: 5, comment: 'รวดเร็วมาก' },
      };
      this.orders.set(id, { view, timeline: [], driverPos: null, eta: null, payment: { method: 'CASH', status: 'CAPTURED', amount: (price / 100).toFixed(2), client_data: {} }, timers: [] });
    };
    mk(1, 0, 1, 9900, 3);
    mk(2, 3, 4, 11500, 1);
    this.addresses.push({ id: uid(), label: 'ออฟฟิศ', address: PLACES[4].name, contact_name: 'แผนกจัดซื้อ', contact_phone: '0822222222', lat: PLACES[4].loc.lat, lng: PLACES[4].loc.lng, building: 'สาทรสแควร์', floor: '21', room: null, note: null });
    this.notify('ยินดีต้อนรับสู่โหมดสาธิต', 'ลองสร้างงานส่ง แล้วดูคนขับรับงานและวิ่งบนแผนที่แบบจำลอง');
  }

  private stop(orderId: string, seq: number, type: 'PICKUP' | 'DROPOFF', place: { name: string; loc: LatLng }, status = 'PENDING', extra: any = {}) {
    return {
      id: `${orderId}-s${seq}`,
      seq,
      type,
      status,
      address: place.name,
      contactName: extra.contactName ?? (type === 'PICKUP' ? 'ผู้ส่ง' : 'ผู้รับ'),
      contactPhone: extra.contactPhone ?? '0811111111',
      building: extra.building ?? null,
      floor: extra.floor ?? null,
      room: extra.room ?? null,
      note: extra.note ?? null,
      location: place.loc,
      otp: status === 'COMPLETED' ? null : DEMO_OTP[seq % DEMO_OTP.length],
      arrivedAt: null,
      completedAt: status === 'COMPLETED' ? iso(-60_000) : null,
    };
  }

  private breakdown(total: number, discount: number) {
    const base = 3000;
    return {
      baseFare: base,
      distanceFee: total + discount - base,
      vehicleFee: 0,
      additionalStopsFee: 0,
      specialServicesFee: 0,
      tollParking: 0,
      demandAdjustment: 0,
      trafficAdjustment: 0,
      minimumFareTopUp: 0,
      serviceFee: 0,
      subtotal: total + discount,
      promotionDiscount: discount,
      total,
    };
  }

  private quote(req: any) {
    const points: LatLng[] = [req.pickup.location, ...req.dropoffs.map((d: any) => d.location)];
    let meters = 0;
    for (let i = 1; i < points.length; i++) meters += haversineMeters(points[i - 1], points[i]) * 1.3;
    meters = Math.max(1500, Math.round(meters));
    const types: VehicleType[] = req.vehicleType ? [req.vehicleType] : VEHICLE_TYPES;
    const options = types.map((v): QuoteOption => {
      const r = RATES[v];
      let subtotal = r.base + Math.round((r.perKm * meters) / 1000) + Math.max(0, req.dropoffs.length - 1) * r.stop;
      subtotal = roundBaht(Math.max(subtotal, r.min));
      const discount = req.promoCode?.toUpperCase() === 'WELCOME20' ? 2000 : 0;
      const total = subtotal - discount;
      const tooHeavy = req.parcel.weightKg * (req.parcel.quantity ?? 1) > ({ MOTORCYCLE: 20, CAR: 100, PICKUP: 1000, VAN: 1100 } as const)[v];
      const option: QuoteOption = {
        quoteId: uid(),
        vehicleType: v,
        available: !tooHeavy,
        unavailableReason: tooHeavy ? 'PARCEL_TOO_HEAVY' : undefined,
        price: total,
        breakdown: { ...this.breakdown(total, discount), baseFare: r.base, distanceFee: subtotal - r.base },
        distanceM: meters,
        durationS: Math.round(meters / r.speed),
        driverEtaS: 240 + Math.round(Math.random() * 240),
        expiresAt: iso(5 * 60_000),
        surgeMilli: 1000,
      };
      this.quotes.set(option.quoteId, { option, req });
      return option;
    });
    return { zone: { id: 'z', code: 'BKK', name: 'กรุงเทพฯ (โหมดสาธิต)' }, options };
  }

  private createOrder(body: any) {
    const q = this.quotes.get(body.quoteId);
    if (!q) throw new DemoError(409, 'QUOTE_EXPIRED', 'ราคาหมดอายุ กรุณาขอราคาใหม่');
    const id = uid();
    const req = q.req;
    const toPlace = (s: any) => ({ name: s.address, loc: s.location });
    const view: OrderView = {
      id,
      orderNo: `SH2610${String(this.seq++).padStart(6, '0')}`,
      status: req.scheduledAt ? 'SCHEDULED' : 'SEARCHING_DRIVER',
      vehicleType: q.option.vehicleType,
      paymentMethod: body.paymentMethod,
      price: q.option.price,
      breakdown: q.option.breakdown,
      distanceM: q.option.distanceM,
      durationS: q.option.durationS,
      createdAt: iso(),
      updatedAt: iso(),
      stops: [this.stop(id, 0, 'PICKUP', toPlace(req.pickup), 'PENDING', req.pickup), ...req.dropoffs.map((d: any, i: number) => this.stop(id, i + 1, 'DROPOFF', toPlace(d), 'PENDING', d))],
      driver: null,
      parcel: req.parcel,
      rating: null,
    };
    const o: DemoOrder = {
      view,
      timeline: [],
      driverPos: null,
      eta: null,
      payment: { method: body.paymentMethod, status: body.paymentMethod === 'CARD' ? 'AUTHORIZED' : 'PENDING', amount: (q.option.price / 100).toFixed(2), client_data: {} },
      timers: [],
    };
    this.orders.set(id, o);
    this.event(o, 'ORDER_CREATED', null);
    this.event(o, 'STATUS_CHANGED', view.status);
    if (!req.scheduledAt) this.playDelivery(o);
    return { orderId: id, orderNo: view.orderNo, status: view.status, payment: { status: o.payment.status, clientData: {} } };
  }

  /** Scripted delivery: found in ~5 s, ~25 s to pickup, ~40 s to each drop-off. */
  private playDelivery(o: DemoOrder) {
    const v = o.view;
    const pickup = v.stops[0].location;
    let t = 5000;
    const at = (ms: number, fn: () => void) => o.timers.push(setTimeout(fn, ms));
    at(t, () => {
      v.driver = { ...DEMO_DRIVER, vehicle: { ...DEMO_DRIVER.vehicle, type: v.vehicleType } };
      o.driverPos = { lat: pickup.lat + 0.012, lng: pickup.lng + 0.01 };
      this.setStatus(o, 'DRIVER_ASSIGNED');
      this.setStatus(o, 'GOING_TO_PICKUP');
      this.notify('ได้คนขับแล้ว', `คนขับกำลังไปรับสินค้า ออเดอร์ ${v.orderNo}`, v.id);
    });
    t = this.animate(o, at, t + 1000, () => o.driverPos!, pickup, 25_000);
    at(t, () => {
      v.stops[0].status = 'ARRIVED';
      this.setStatus(o, 'ARRIVED_PICKUP');
      this.notify('คนขับถึงจุดรับแล้ว', `กรุณาเตรียมสินค้า ออเดอร์ ${v.orderNo}`, v.id);
    });
    t += 8000;
    at(t, () => {
      v.stops[0].status = 'COMPLETED';
      v.stops[0].completedAt = iso();
      v.stops[0].otp = null;
      this.setStatus(o, 'PICKED_UP');
      this.setStatus(o, 'IN_TRANSIT');
      if (o.payment.method === 'CASH') o.payment.status = 'CAPTURED';
      this.notify('รับสินค้าแล้ว', `กำลังนำส่ง ออเดอร์ ${v.orderNo}`, v.id);
    });
    let from = pickup;
    v.stops.slice(1).forEach((s, i, arr) => {
      const start = from;
      t = this.animate(o, at, t + 1000, () => start, s.location, 40_000);
      from = s.location;
      at(t, () => {
        s.status = 'ARRIVED';
        this.setStatus(o, 'ARRIVED_DESTINATION');
      });
      t += 6000;
      at(t, () => {
        s.status = 'COMPLETED';
        s.completedAt = iso();
        s.otp = null;
        if (i < arr.length - 1) this.setStatus(o, 'IN_TRANSIT');
        else {
          o.payment.status = 'CAPTURED';
          this.setStatus(o, 'DELIVERED');
          if (v.driver) v.driver = { ...v.driver, phone: undefined };
          this.notify('ส่งสำเร็จ', `ออเดอร์ ${v.orderNo} ส่งถึงผู้รับเรียบร้อย`, v.id);
        }
      });
    });
  }

  /** Move the driver marker in steps, emitting driver:location; returns the end time. */
  private animate(o: DemoOrder, at: (ms: number, fn: () => void) => void, start: number, fromFn: () => LatLng, to: LatLng, duration: number) {
    const steps = Math.round(duration / 2000);
    for (let i = 1; i <= steps; i++) {
      at(start + i * 2000, () => {
        const from = fromFn();
        o.driverPos = lerp(from, to, i / steps);
        o.eta = Math.round(((steps - i) * 2000 * 12) / 1000); // narrated ETA, ~12× real time
        this.socket.push(WsEvent.DRIVER_LOCATION, { orderId: o.view.id, driverId: DEMO_DRIVER.id, ...o.driverPos, heading: null, ts: Date.now(), etaSeconds: o.eta });
      });
    }
    return start + steps * 2000;
  }

  private setStatus(o: DemoOrder, status: OrderStatus) {
    o.view.status = status;
    o.view.updatedAt = iso();
    this.event(o, 'STATUS_CHANGED', status);
    this.socket.push(WsEvent.ORDER_UPDATED, { orderId: o.view.id, status, at: iso(), driver: o.view.driver });
  }

  private event(o: DemoOrder, type: string, to: OrderStatus | null) {
    o.timeline.push({ id: String(o.timeline.length + 1), at: iso(), type, fromStatus: null, toStatus: to, actorType: 'SYSTEM', actorId: null, data: {} });
  }

  private cancelOrder(o: DemoOrder) {
    if (['PICKED_UP', 'IN_TRANSIT', 'ARRIVED_DESTINATION', 'DELIVERED'].includes(o.view.status)) {
      throw new DemoError(409, 'CANNOT_CANCEL', 'ไม่สามารถยกเลิกได้หลังรับสินค้าแล้ว');
    }
    o.timers.forEach(clearTimeout);
    o.timers = [];
    o.driverPos = null;
    o.payment.status = 'CANCELLED';
    this.setStatus(o, 'CANCELLED');
    this.notify('ออเดอร์ถูกยกเลิก', `ออเดอร์ ${o.view.orderNo}`, o.view.id);
    return { orderId: o.view.id, status: 'CANCELLED' };
  }

  private listOrders(status: string | null, limit: number) {
    const done = ['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'];
    return [...this.orders.values()]
      .map((o) => o.view)
      .filter((v) => !status || (status === 'active' ? !done.includes(v.status) : done.includes(v.status)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((v) => ({
        id: v.id,
        orderNo: v.orderNo,
        status: v.status,
        vehicleType: v.vehicleType,
        price: v.price,
        createdAt: v.createdAt,
        scheduledAt: null,
        pickup: v.stops[0].address,
        dropoff: v.stops[v.stops.length - 1].address,
        dropoffCount: v.stops.length - 1,
      }));
  }

  private notify(title: string, body: string, orderId?: string) {
    this.notifications.push({ id: uid(), event: 'DEMO', title, body, data: orderId ? { orderId } : {}, created_at: iso() });
  }

  // ------------------------------------------------------------------ driver

  private seedDriver() {
    const add = (hoursAgo: number, gross: number, from: number, to: number) => {
      const gp = Math.round((gross * GP_BP) / 10_000);
      const id = uid();
      const orderNo = `SH2610${String(this.seq++).padStart(6, '0')}`;
      const at = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
      this.earnings.push({ id, type: 'TRIP', orderId: id, orderNo, grossFare: gross, commission: gp, commissionRateBp: GP_BP, bonus: 0, tip: 0, adjustment: 0, net: gross - gp, cashCollected: 0, deadMileageM: 1400, loadedMileageM: 9000, earnedAt: at, note: null });
      this.history.push({ id, order_no: orderNo, status: 'DELIVERED', vehicle_type: 'MOTORCYCLE', driver_net: ((gross - gp) / 100).toFixed(2), delivered_at: at, created_at: at, pickup: PLACES[from].name, dropoff: PLACES[to].name });
    };
    add(30, 9900, 0, 1);
    add(26, 12800, 2, 3);
    add(3, 8600, 3, 0);
    add(1.5, 11000, 4, 5);
    this.onlineAccum = 3.2 * 3600;
    this.notify('บัญชีได้รับการอนุมัติแล้ว', 'โหมดสาธิต: กดออนไลน์ แล้วรอรับงานจำลอง');
  }

  private driverMe() {
    return {
      id: DEMO_DRIVER.id,
      first_name: 'สมชาย',
      last_name: 'ใจดี',
      phone: '+66812345678',
      kyc_status: 'APPROVED',
      kyc_note: null,
      tier: 'STANDARD',
      presence: this.presence,
      rating: 4.9,
      acceptanceRate: 0.92,
      offers_received: 52,
      offers_accepted: 48,
      trips_completed: 47,
      trips_cancelled: 1,
      has_national_id: true,
      has_bank_account: true,
      vehicles: [{ id: 'v1', type: 'MOTORCYCLE', plate_number: '1กข 2468', plate_province: 'กรุงเทพมหานคร', brand: 'Honda', model: 'Wave 110i', color: 'แดง', status: 'APPROVED' }],
      documents: ['SELFIE', 'NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION'].map((kind) => ({ kind, status: 'APPROVED' })),
      missingDocuments: [],
    };
  }

  private setPresence(online: boolean, location?: LatLng) {
    if (location) this.driverPos = location;
    if (online) {
      if (this.presence === 'OFFLINE') {
        this.presence = this.job ? 'BUSY' : 'ONLINE';
        this.onlineSince = Date.now();
        if (!this.job) this.scheduleOffer(5000);
      }
    } else {
      if (this.presence === 'BUSY') throw new DemoError(409, 'HAS_ACTIVE_JOB', 'ไม่สามารถออฟไลน์ระหว่างมีงาน');
      this.presence = 'OFFLINE';
      if (this.onlineSince) this.onlineAccum += (Date.now() - this.onlineSince) / 1000;
      this.onlineSince = null;
      this.offer = null;
      if (this.offerTimer) clearTimeout(this.offerTimer);
    }
    return { presence: this.presence };
  }

  private scheduleOffer(ms: number) {
    if (this.offerTimer) clearTimeout(this.offerTimer);
    this.offerTimer = setTimeout(() => {
      if (this.presence !== 'ONLINE' || this.job) return;
      const from = PLACES[Math.floor(Math.random() * PLACES.length)];
      let to = PLACES[Math.floor(Math.random() * PLACES.length)];
      if (to === from) to = PLACES[(PLACES.indexOf(from) + 2) % PLACES.length];
      const pickupLoc = { lat: this.driverPos.lat + 0.008, lng: this.driverPos.lng - 0.006 };
      const dist = Math.round(haversineMeters(pickupLoc, to.loc) * 1.3);
      const gross = roundBaht(3000 + (650 * dist) / 1000);
      const gp = Math.round((gross * GP_BP) / 10_000);
      const bonus = Math.random() < 0.3 ? 1500 : 0;
      this.offer = {
        offerId: uid(),
        orderId: uid(),
        orderNo: `SH2610${String(this.seq++).padStart(6, '0')}`,
        expiresAt: iso(25_000),
        vehicleType: 'MOTORCYCLE',
        pickup: { address: from.name, district: from.name.split(' ')[0], location: pickupLoc },
        dropoffs: [{ address: to.name, district: to.name.split(' ')[0], location: to.loc }],
        stopCount: 1,
        distanceToPickupM: Math.round(haversineMeters(this.driverPos, pickupLoc) * 1.3),
        deliveryDistanceM: dist,
        estimatedDurationS: Math.round(dist / 7.5) + 300,
        grossFare: gross,
        commission: gp,
        commissionRateBp: GP_BP,
        bonus,
        netEarnings: gross - gp + bonus,
        cashToCollect: Math.random() < 0.5 ? gross : 0,
        parcelSummary: 'SMALL_BOX 2 กก.',
      };
      this.socket.push(WsEvent.OFFER_NEW, this.offer);
      // unanswered offers expire and a new one comes a bit later
      this.offerTimer = setTimeout(() => {
        if (this.offer) {
          this.socket.push(WsEvent.OFFER_REVOKED, { offerId: this.offer.offerId, orderId: this.offer.orderId, reason: 'EXPIRED' });
          this.offer = null;
          this.scheduleOffer(10_000);
        }
      }, 26_000);
    }, ms);
  }

  private acceptOffer(offerId: string) {
    const f = this.offer;
    if (!f || f.offerId !== offerId) throw new DemoError(409, 'OFFER_EXPIRED', 'หมดเวลารับงาน');
    if (this.offerTimer) clearTimeout(this.offerTimer);
    this.offer = null;
    this.presence = 'BUSY';
    const id = f.orderId;
    this.job = {
      id,
      orderNo: f.orderNo,
      status: 'GOING_TO_PICKUP',
      vehicleType: f.vehicleType,
      paymentMethod: f.cashToCollect ? 'CASH' : 'CARD',
      price: f.grossFare,
      distanceM: f.deliveryDistanceM,
      durationS: f.estimatedDurationS,
      stops: [
        { ...this.stop(id, 0, 'PICKUP', { name: f.pickup.address, loc: f.pickup.location }, 'PENDING', { contactName: 'คุณสมศรี', contactPhone: '0811111111', building: 'อาคาร A', floor: '3', note: 'รอที่ประตู 2' }), otp: null },
        { ...this.stop(id, 1, 'DROPOFF', { name: f.dropoffs[0].address, loc: f.dropoffs[0].location }, 'PENDING', { contactName: 'คุณวิชัย', contactPhone: '0822222222' }), otp: null },
      ],
      driver: null,
      parcel: { category: 'SMALL_BOX', weightKg: 2 },
      earnings: { gross: f.grossFare, commission: f.commission, bonus: f.bonus, net: f.netEarnings },
      cash: f.cashToCollect ? { amount: f.cashToCollect, collectAt: 'PICKUP' } : null,
      _offer: f,
    };
    return { orderId: id, status: 'GOING_TO_PICKUP' };
  }

  private requireCode(body: any, photoOk: boolean) {
    const ok = (body.otp && String(body.otp).length >= 4) || body.qrPayload || (photoOk && body.photoKeys?.length);
    if (!ok) throw new DemoError(422, 'POD_REQUIRED', 'โหมดสาธิต: กรอกรหัส 4 หลักใดก็ได้ หรือถ่ายรูป');
  }

  private driverStep(rest: string[], body: any) {
    const j = this.job;
    const push = () => this.socket.push(WsEvent.ORDER_UPDATED, { orderId: j.id, status: j.status, at: iso() });
    if (rest[0] === 'arrive-pickup') {
      j.status = 'ARRIVED_PICKUP';
      j.stops[0].status = 'ARRIVED';
    } else if (rest[0] === 'pickup') {
      this.requireCode(body, true);
      j.stops[0].status = 'COMPLETED';
      j.stops[0].completedAt = iso();
      j.status = 'IN_TRANSIT';
    } else if (rest[0] === 'stops' && rest[2] === 'arrive') {
      j.status = 'ARRIVED_DESTINATION';
      j.stops[1].status = 'ARRIVED';
    } else if (rest[0] === 'stops' && rest[2] === 'complete') {
      this.requireCode(body, !!body.recipientName);
      j.stops[1].status = 'COMPLETED';
      j.status = 'DELIVERED';
      const f: JobOfferPayload = j._offer;
      this.earnings.push({ id: uid(), type: 'TRIP', orderId: j.id, orderNo: j.orderNo, grossFare: f.grossFare, commission: f.commission, commissionRateBp: GP_BP, bonus: f.bonus, tip: 0, adjustment: 0, net: f.netEarnings, cashCollected: f.cashToCollect, deadMileageM: f.distanceToPickupM, loadedMileageM: f.deliveryDistanceM, earnedAt: iso(), note: null });
      this.history.push({ id: j.id, order_no: j.orderNo, status: 'DELIVERED', vehicle_type: 'MOTORCYCLE', driver_net: (f.netEarnings / 100).toFixed(2), delivered_at: iso(), created_at: iso(), pickup: j.stops[0].address, dropoff: j.stops[1].address });
      this.job = null;
      this.presence = 'ONLINE';
      this.scheduleOffer(12_000);
      this.socket.push(WsEvent.ORDER_UPDATED, { orderId: j.id, status: 'DELIVERED', at: iso() });
      return { status: 'DELIVERED', remainingStops: 0 };
    } else if (rest[0] === 'cancel') {
      this.history.push({ id: j.id, order_no: j.orderNo, status: 'CANCELLED', vehicle_type: 'MOTORCYCLE', driver_net: null, delivered_at: null, created_at: iso(), pickup: j.stops[0].address, dropoff: j.stops[1].address });
      this.job = null;
      this.presence = 'ONLINE';
      this.scheduleOffer(10_000);
      return { status: 'SEARCHING_DRIVER' };
    }
    push();
    return { status: j.status };
  }

  private earningsSummary(period: 'today' | 'week' | 'month'): EarningsSummary {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    if (period === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    if (period === 'month') from.setDate(1);
    const rows = this.earnings.filter((e) => new Date(e.earnedAt) >= from);
    const sum = (k: string) => rows.reduce((s, e) => s + (e[k] ?? 0), 0);
    const online = this.onlineAccum + (this.onlineSince ? (Date.now() - this.onlineSince) / 1000 : 0);
    return {
      period,
      from: from.toISOString(),
      to: now.toISOString(),
      trips: rows.filter((e) => e.type === 'TRIP').length,
      grossFare: sum('grossFare'),
      commission: sum('commission'),
      bonus: sum('bonus'),
      tips: sum('tip'),
      adjustment: sum('adjustment'),
      netEarnings: sum('net'),
      onlineSeconds: Math.round(period === 'today' ? online * 0.4 : online),
      deadMileageM: sum('deadMileageM'),
      loadedMileageM: sum('loadedMileageM'),
    };
  }
}

export { DemoError };
