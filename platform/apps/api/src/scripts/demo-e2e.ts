/**
 * End-to-end proof of the marketplace core (Definition of Done, spec §46), run against a
 * live API over HTTP + Socket.IO exactly like the apps do:
 *
 *   customer quote -> confirm -> SEARCHING_DRIVER -> driver gets offer -> accept ->
 *   customer sees driver on map -> arrive pickup -> pickup OTP -> GPS tracking ->
 *   arrive destination -> POD OTP -> DELIVERED -> earnings booked -> ops timeline
 *
 * Usage: API_URL=http://localhost:4000 node dist/scripts/demo-e2e.js
 * Requires the API to run with OTP_DEV_ECHO=true and a seeded database.
 */
import { formatTHB, haversineMeters, JobOfferPayload, LatLng, WsEvent } from '@ship/shared';
import { io, Socket } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:4000';
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@ship.local';
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'ChangeMe!2026';

// ลาดพร้าว (Central Ladprao area) -> บางนา (Bangna)
const PICKUP: LatLng = { lat: 13.8167, lng: 100.5615 };
const DROPOFF: LatLng = { lat: 13.6681, lng: 100.6045 };
// driver waiting ~1.8 km from the pickup
const DRIVER_START: LatLng = { lat: 13.8285, lng: 100.5725 };

const rnd = () => Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let step = 0;
function log(msg: string, data?: unknown) {
  step++;
  console.log(`\n[${String(step).padStart(2, '0')}] ${msg}`);
  if (data !== undefined) console.log('     ', typeof data === 'string' ? data : JSON.stringify(data));
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json as T;
}

async function otpLogin(phone: string, role: 'CUSTOMER' | 'DRIVER') {
  const req = await call('POST', '/auth/otp/request', undefined, { phone, role });
  assert(req.devCode, 'API must run with OTP_DEV_ECHO=true for the demo');
  return call('POST', '/auth/otp/verify', undefined, { phone, role, code: req.devCode, deviceId: `demo-${role}-${rnd()}` });
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(API, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function waitFor<T>(socket: Socket, event: string, pred: (p: T) => boolean = () => true, timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const h = (p: T) => {
      if (!pred(p)) return;
      clearTimeout(t);
      socket.off(event, h);
      resolve(p);
    };
    socket.on(event, h);
  });
}

/** Move the driver in ≤300 m steps (realistic for the impossible-travel check). */
async function drive(token: string, from: LatLng, to: LatLng, onPing?: () => void) {
  const steps = Math.max(2, Math.ceil(haversineMeters(from, to) / 300));
  for (let i = 1; i <= steps; i++) {
    const p = { lat: from.lat + ((to.lat - from.lat) * i) / steps, lng: from.lng + ((to.lng - from.lng) * i) / steps };
    await call('POST', '/driver/location', token, { pings: [{ ...p, ts: Date.now(), speed: 8, accuracy: 8 }] });
    onPing?.();
    await sleep(40);
  }
}

async function tinyJpeg(token: string, purpose: string): Promise<string> {
  const signed = await call('POST', '/uploads/sign', token, { purpose, contentType: 'image/jpeg' });
  const bytes = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q==', 'base64');
  const res = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: bytes });
  assert(res.ok, `upload failed ${res.status}`);
  return signed.key;
}

async function main() {
  console.log(`Ship marketplace E2E demo against ${API}`);
  const health = await call('GET', '/health');
  assert(health.ok, 'API unhealthy');

  // ---------------------------------------------------------------- ops login
  const admin = await call('POST', '/auth/staff/login', undefined, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId: `demo-ops-${rnd()}` });
  log('Operations admin logged in', admin.user.role);
  const ops = await connect(admin.accessToken);
  const opsEvents: string[] = [];
  ops.on(WsEvent.OPS_ORDER_UPDATED, (e: any) => opsEvents.push(e.status));

  // ---------------------------------------------------------------- driver onboarding
  const driverPhone = `08${rnd()}`;
  const drv = await otpLogin(driverPhone, 'DRIVER');
  const D = drv.accessToken;
  await call('PUT', '/driver/profile', D, {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    nationalId: `1${rnd()}${rnd().slice(0, 4)}`,
    licenseNumber: `DL${rnd()}`,
    licenseExpiry: '2030-12-31',
    bankName: 'KBANK',
    bankAccountNumber: `0${rnd()}1`,
    bankAccountName: 'สมชาย ใจดี',
  });
  await call('POST', '/driver/vehicles', D, { type: 'MOTORCYCLE', plateNumber: `1กข ${rnd().slice(0, 4)}`, plateProvince: 'กรุงเทพมหานคร', brand: 'Honda', model: 'Wave 110i', color: 'แดง' });
  for (const kind of ['SELFIE', 'NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION']) {
    await call('POST', '/driver/documents', D, { kind, fileKey: await tinyJpeg(D, 'KYC') });
  }
  const kyc = await call('POST', '/driver/kyc/submit', D);
  log('Driver registered, uploaded KYC documents via signed URLs, submitted', kyc);
  await call('POST', `/ops/drivers/${drv.user.id}/kyc`, admin.accessToken, { decision: 'APPROVED', note: 'เอกสารครบ (demo)' });
  await call('POST', `/ops/drivers/${drv.user.id}/tier`, admin.accessToken, { tier: 'STANDARD', reason: 'demo: show standard 8% GP' });
  log('Ops approved driver KYC and set tier STANDARD (both audited)');

  const driverSocket = await connect(D);
  const presence = await call('POST', '/driver/presence', D, { online: true, location: DRIVER_START });
  assert(presence.presence === 'ONLINE', 'driver should be online');
  log('Driver is ONLINE near Lat Phrao', DRIVER_START);

  // ---------------------------------------------------------------- customer: quote -> order
  const cust = await otpLogin(`09${rnd()}`, 'CUSTOMER');
  const C = cust.accessToken;
  await call('PATCH', '/me/profile', C, { name: 'คุณลูกค้า ทดสอบ' });
  const quote = await call('POST', '/quotes', C, {
    pickup: { location: PICKUP, address: 'เซ็นทรัล ลาดพร้าว ถ.พหลโยธิน', building: 'อาคาร A', floor: '3', contactName: 'ผู้ส่ง', contactPhone: '0811111111', note: 'รอที่ประตู 2' },
    dropoffs: [{ location: DROPOFF, address: 'ไบเทค บางนา ถ.บางนา-ตราด', contactName: 'ผู้รับ', contactPhone: '0822222222' }],
    parcel: { category: 'SMALL_BOX', weightKg: 2, quantity: 1, fragile: false },
  });
  const moto = quote.options.find((o: any) => o.vehicleType === 'MOTORCYCLE');
  assert(moto?.available, `motorcycle option should be available: ${JSON.stringify(moto)}`);
  log(`Quote from server (zone ${quote.zone.code}) — client never computes price`, {
    options: quote.options.map((o: any) => `${o.vehicleType}: ${o.available ? formatTHB(o.price) : o.unavailableReason} (${(o.distanceM / 1000).toFixed(1)} km)`),
    validUntil: moto.expiresAt,
  });

  const customerSocket = await connect(C);
  const orderUpdates: string[] = [];
  customerSocket.on(WsEvent.ORDER_UPDATED, (e: any) => orderUpdates.push(e.status));
  const offerPromise = waitFor<JobOfferPayload>(driverSocket, WsEvent.OFFER_NEW);

  const created = await call('POST', '/orders', C, { quoteId: moto.quoteId, paymentMethod: 'CASH', cashCollectAt: 'PICKUP', idempotencyKey: `demo-${rnd()}` });
  assert(created.status === 'SEARCHING_DRIVER', `order should be SEARCHING_DRIVER, got ${created.status}`);
  log(`Customer confirmed order ${created.orderNo} -> ${created.status}`);
  const orderId: string = created.orderId;
  await new Promise<void>((r) => customerSocket.emit(WsEvent.SUBSCRIBE_ORDER, { orderId }, () => r()));

  // ---------------------------------------------------------------- dispatch -> offer -> accept
  const offer = await offerPromise;
  assert(offer.orderId === orderId, 'offer for our order');
  assert(offer.netEarnings === offer.grossFare - offer.commission + offer.bonus, 'net = gross - GP + bonus');
  log('Driver received job offer (before accepting sees full economics)', {
    route: `${offer.pickup.address} → ${offer.dropoffs[0].address}`,
    toPickup: `${(offer.distanceToPickupM / 1000).toFixed(1)} km`,
    delivery: `${(offer.deliveryDistanceM / 1000).toFixed(1)} km`,
    duration: `~${Math.round(offer.estimatedDurationS / 60)} นาที`,
    fare: formatTHB(offer.grossFare),
    gp: `-${formatTHB(offer.commission)} (${offer.commissionRateBp / 100}%)`,
    bonus: formatTHB(offer.bonus),
    youGet: formatTHB(offer.netEarnings),
    cashToCollect: formatTHB(offer.cashToCollect),
    expiresAt: offer.expiresAt,
  });

  const firstLocation = waitFor<any>(customerSocket, WsEvent.DRIVER_LOCATION, (p) => p.orderId === orderId);
  const accepted = await call('POST', `/driver/offers/${offer.offerId}/accept`, D);
  log('Driver accepted (Redis lock + row lock, server-side transition)', accepted);

  // ---------------------------------------------------------------- to pickup with live GPS
  await drive(D, DRIVER_START, { lat: PICKUP.lat + 0.0005, lng: PICKUP.lng });
  const seen = await firstLocation;
  log('Customer sees driver moving on the map (socket driver:location)', { lat: seen.lat, lng: seen.lng, etaSeconds: seen.etaSeconds });

  const view = await call('GET', `/orders/${orderId}`, C);
  assert(view.driver?.vehicle?.plateNumber, 'customer sees driver vehicle/plate');
  log('Customer order view shows driver', { name: view.driver.name, phone: view.driver.phoneMasked, vehicle: view.driver.vehicle });
  const pickupOtp = view.stops.find((s: any) => s.type === 'PICKUP').otp;
  const dropStop = view.stops.find((s: any) => s.type === 'DROPOFF');

  // geofence: arriving from far away is rejected without a reason
  let rejected = false;
  try {
    await call('POST', `/driver/orders/${orderId}/arrive-pickup`, D, { location: DROPOFF });
  } catch (e) {
    rejected = String(e).includes('OUTSIDE_GEOFENCE');
  }
  assert(rejected, 'arrive-pickup far away must be rejected');
  log('Server rejected "arrived" from 17 km away (geofence)');

  await call('POST', `/driver/orders/${orderId}/arrive-pickup`, D, { location: { lat: PICKUP.lat + 0.0005, lng: PICKUP.lng } });
  log('Driver ARRIVED_PICKUP (within geofence)');

  let wrongOtp = false;
  try {
    await call('POST', `/driver/orders/${orderId}/pickup`, D, { location: PICKUP, otp: pickupOtp === '0000' ? '1111' : '0000' });
  } catch (e) {
    wrongOtp = String(e).includes('OTP_MISMATCH');
  }
  assert(wrongOtp, 'wrong pickup OTP must be rejected');
  const photo = await tinyJpeg(D, 'POD');
  const picked = await call('POST', `/driver/orders/${orderId}/pickup`, D, { location: PICKUP, otp: pickupOtp, photoKeys: [photo] });
  log('Pickup verified with sender OTP + photo + GPS; cash collected at pickup', picked);

  // ---------------------------------------------------------------- transit
  let pings = 0;
  await drive(D, PICKUP, { lat: DROPOFF.lat + 0.0005, lng: DROPOFF.lng }, () => pings++);
  log(`Driver drove to Bang Na sending ${pings} GPS pings`);
  await call('POST', `/driver/orders/${orderId}/stops/${dropStop.id}/arrive`, D, { location: { lat: DROPOFF.lat + 0.0005, lng: DROPOFF.lng } });
  log('Driver ARRIVED_DESTINATION');

  const signature = await tinyJpeg(D, 'SIGNATURE');
  const delivered = await call('POST', `/driver/orders/${orderId}/stops/${dropStop.id}/complete`, D, {
    location: DROPOFF,
    otp: dropStop.otp,
    recipientName: 'คุณผู้รับ',
    photoKeys: [await tinyJpeg(D, 'POD')],
    signatureKey: signature,
  });
  assert(delivered.status === 'DELIVERED', 'order delivered');
  log('POD: recipient OTP + photo + signature + GPS -> DELIVERED', delivered);

  // ---------------------------------------------------------------- results
  await call('POST', `/orders/${orderId}/rate`, C, { score: 5, comment: 'รวดเร็วมาก', tipSatang: 2000 });
  const earnings = await call('GET', '/driver/earnings?period=today', D);
  assert(earnings.trips >= 1 && earnings.netEarnings > 0, 'earnings booked');
  log('Driver earnings (today)', {
    trips: earnings.trips,
    gross: formatTHB(earnings.grossFare),
    gp: formatTHB(earnings.commission),
    bonus: formatTHB(earnings.bonus),
    tips: formatTHB(earnings.tips),
    net: formatTHB(earnings.netEarnings),
    deadMileage: `${(earnings.deadMileageM / 1000).toFixed(2)} km`,
    loadedMileage: `${(earnings.loadedMileageM / 1000).toFixed(2)} km`,
  });

  const detail = await call('GET', `/ops/orders/${orderId}`, admin.accessToken);
  const transitions = detail.timeline.filter((t: any) => t.toStatus).map((t: any) => t.toStatus);
  log('Operations sees the full timeline', transitions.join(' → '));
  log('Unit economics recorded on the order', {
    customerPays: formatTHB(detail.economics.price),
    driverNet: formatTHB(detail.economics.driverNet),
    gp: formatTHB(detail.economics.commission),
    contributionMargin: formatTHB(detail.economics.contributionMargin),
    pod: detail.pod.map((p: any) => `${p.kind}: otp=${p.otp_verified} photos=${p.photo_keys.length} ${p.distance_from_stop_m}m`),
  });
  const expected = ['SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'GOING_TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_DESTINATION', 'DELIVERED'];
  for (const s of expected) assert(transitions.includes(s), `timeline should include ${s}`);
  await sleep(300);
  assert(orderUpdates.includes('DELIVERED'), 'customer received realtime DELIVERED');
  assert(opsEvents.includes('DELIVERED'), 'ops received realtime DELIVERED');
  log('Realtime events received by customer app', orderUpdates.join(' → '));

  await call('POST', '/driver/presence', D, { online: false });
  const kpis = await call('GET', '/ops/kpis', admin.accessToken);
  log('Ops KPIs (last 24 h)', {
    orders: kpis.orders,
    timeToMatchP50S: kpis.timeToMatchP50S,
    acceptanceRate: kpis.acceptanceRate,
    completionRate: kpis.completionRate,
    cmPerOrder: kpis.contributionMarginPerOrder !== null ? formatTHB(kpis.contributionMarginPerOrder) : null,
  });

  for (const s of [ops, driverSocket, customerSocket]) s.disconnect();
  console.log('\n✅ END-TO-END FLOW PASSED');
}

main().catch((e) => {
  console.error('\n❌ DEMO FAILED:', e.message ?? e);
  process.exit(1);
});
