/**
 * Marketplace simulator for demos and soak testing: bot drivers roam the Bangkok pilot area,
 * accept most offers (some decline / let expire), drive to pickup and drop-off with GPS pings,
 * and complete OTP-verified deliveries; bot customers place orders at a steady rate.
 *
 *   SIM_DRIVERS=12 SIM_ORDERS_PER_MIN=4 SIM_MINUTES=10 node dist/scripts/simulate-drivers.js
 *
 * Development only (relies on OTP_DEV_ECHO and the seeded admin account).
 */
import { haversineMeters, JobOfferPayload, LatLng, WsEvent } from '@ship/shared';
import type { Socket } from 'socket.io-client';
import { call, connect, onboardDriver, otpLogin, sleep, staffLogin, stop, uploadTinyJpeg } from './lib';

const N_DRIVERS = Number(process.env.SIM_DRIVERS ?? 10);
const ORDERS_PER_MIN = Number(process.env.SIM_ORDERS_PER_MIN ?? 3);
const MINUTES = Number(process.env.SIM_MINUTES ?? 10);
/** Simulated speed multiplier: 10 = a 10-minute trip takes 1 minute. */
const SPEEDUP = Number(process.env.SIM_SPEEDUP ?? 10);
const TICK_MS = 2000;

const HOTSPOTS: LatLng[] = [
  { lat: 13.8167, lng: 100.5615 }, // Central Ladprao
  { lat: 13.8, lng: 100.553 }, // Chatuchak
  { lat: 13.873, lng: 100.596 }, // Bang Khen
  { lat: 13.868, lng: 100.65 }, // Ramintra
  { lat: 13.7466, lng: 100.5393 }, // Siam
  { lat: 13.7286, lng: 100.5345 }, // Silom
  { lat: 13.7563, lng: 100.5018 }, // Rattanakosin
  { lat: 13.7228, lng: 100.5806 }, // Ekkamai
];
const DROPOFFS: LatLng[] = [...HOTSPOTS, { lat: 13.6681, lng: 100.6045 }, { lat: 13.6904, lng: 100.75 }, { lat: 13.85, lng: 100.48 }];
const jitter = (p: LatLng, d = 0.01): LatLng => ({ lat: p.lat + (Math.random() - 0.5) * d * 2, lng: p.lng + (Math.random() - 0.5) * d * 2 });
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

interface Bot {
  id: string;
  token: string;
  refreshToken: string;
  deviceId: string;
  socket: Socket;
  pos: LatLng;
  target: LatLng | null;
  busy: boolean;
}

async function moveTowards(bot: Bot, to: LatLng): Promise<boolean> {
  const stepM = 7 * (TICK_MS / 1000) * SPEEDUP; // ~25 km/h scaled
  const d = haversineMeters(bot.pos, to);
  const f = d <= stepM ? 1 : stepM / d;
  const next = { lat: bot.pos.lat + (to.lat - bot.pos.lat) * f, lng: bot.pos.lng + (to.lng - bot.pos.lng) * f };
  // split long scaled steps so the impossible-travel detector stays quiet
  const parts = Math.max(1, Math.ceil(haversineMeters(bot.pos, next) / 800));
  const pings = [];
  for (let i = 1; i <= parts; i++) {
    pings.push({
      lat: bot.pos.lat + ((next.lat - bot.pos.lat) * i) / parts,
      lng: bot.pos.lng + ((next.lng - bot.pos.lng) * i) / parts,
      ts: Date.now() - (parts - i) * 1000,
      speed: 7,
      accuracy: 10,
    });
  }
  bot.pos = next;
  await call('POST', '/driver/location', bot.token, { pings }).catch(() => undefined);
  return f === 1;
}

async function runJob(bot: Bot, offer: JobOfferPayload, C: Map<string, string>) {
  bot.busy = true;
  try {
    const custToken = C.get(offer.orderId);
    const res = await call('POST', `/driver/offers/${offer.offerId}/accept`, bot.token).catch(() => null);
    if (!res) return;
    const active = await call('GET', '/driver/orders/active', bot.token);
    const view = custToken ? await call('GET', `/orders/${offer.orderId}`, custToken) : active;
    const pickup = active.stops[0];
    while (!(await moveTowards(bot, pickup.location))) await sleep(TICK_MS);
    await call('POST', `/driver/orders/${offer.orderId}/arrive-pickup`, bot.token, { location: bot.pos });
    await sleep(3000);
    const photo = await uploadTinyJpeg(bot.token, 'POD');
    await call('POST', `/driver/orders/${offer.orderId}/pickup`, bot.token, { location: bot.pos, otp: view.stops[0].otp ?? undefined, photoKeys: [photo] });
    for (const s of active.stops.filter((x: any) => x.type === 'DROPOFF')) {
      while (!(await moveTowards(bot, s.location))) await sleep(TICK_MS);
      await call('POST', `/driver/orders/${offer.orderId}/stops/${s.id}/arrive`, bot.token, { location: bot.pos });
      await sleep(2000);
      const otp = view.stops.find((x: any) => x.id === s.id)?.otp;
      await call('POST', `/driver/orders/${offer.orderId}/stops/${s.id}/complete`, bot.token, { location: bot.pos, otp });
    }
    console.log(`  ✓ ${offer.orderNo} delivered by ${bot.id.slice(0, 8)}`);
  } catch (e) {
    console.log(`  ! job ${offer.orderNo} aborted: ${(e as Error).message.slice(0, 160)}`);
  } finally {
    bot.busy = false;
  }
}

async function main() {
  const admin = await staffLogin();
  console.log(`creating ${N_DRIVERS} bot drivers...`);
  const customerTokens = new Map<string, string>();
  const bots: Bot[] = [];
  for (let i = 0; i < N_DRIVERS; i++) {
    const d = await onboardDriver(admin.accessToken, { firstName: `บอท${i + 1}`, tier: pick(['STANDARD', 'SILVER', 'GOLD']) });
    const pos = jitter(pick(HOTSPOTS), 0.02);
    const socket = await connect(d.token);
    await call('POST', '/driver/presence', d.token, { online: true, location: pos });
    const bot: Bot = { id: d.id, token: d.token, refreshToken: d.refreshToken, deviceId: d.deviceId, socket, pos, target: null, busy: false };
    socket.on(WsEvent.OFFER_NEW, (offer: JobOfferPayload) => {
      if (bot.busy) return;
      const r = Math.random();
      if (r < 0.1) return; // let it expire
      if (r < 0.2) {
        void call('POST', `/driver/offers/${offer.offerId}/decline`, bot.token, { reason: 'sim decline' }).catch(() => undefined);
        return;
      }
      setTimeout(() => void runJob(bot, offer, customerTokens), 1000 + Math.random() * 4000);
    });
    bots.push(bot);
  }

  const customers = await Promise.all(Array.from({ length: 5 }, () => otpLogin(`09${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, 'CUSTOMER')));
  // access tokens live 15 min: rotate bot tokens well before that
  const refresher = setInterval(() => {
    for (const b of bots) {
      void call('POST', '/auth/refresh', undefined, { refreshToken: b.refreshToken, deviceId: b.deviceId })
        .then((p) => {
          b.token = p.accessToken;
          b.refreshToken = p.refreshToken;
        })
        .catch((e) => console.log(`  ! refresh failed for ${b.id.slice(0, 8)}: ${(e as Error).message.slice(0, 80)}`));
    }
    for (const c of customers) {
      void call('POST', '/auth/refresh', undefined, { refreshToken: c.refreshToken, deviceId: c.deviceId })
        .then((p) => {
          c.accessToken = p.accessToken;
          c.refreshToken = p.refreshToken;
        })
        .catch(() => undefined);
    }
  }, 10 * 60_000);
  const end = Date.now() + MINUTES * 60_000;
  let nextOrder = Date.now();
  console.log(`simulating for ${MINUTES} min, ~${ORDERS_PER_MIN} orders/min, speedup ×${SPEEDUP}`);

  while (Date.now() < end) {
    // idle roaming
    for (const b of bots.filter((x) => !x.busy)) {
      if (!b.target || haversineMeters(b.pos, b.target) < 100) b.target = jitter(pick(HOTSPOTS), 0.015);
      void moveTowards(b, b.target);
    }
    if (Date.now() >= nextOrder) {
      nextOrder = Date.now() + (60_000 / ORDERS_PER_MIN) * (0.5 + Math.random());
      const c = pick(customers);
      const pickup = jitter(pick(HOTSPOTS), 0.01);
      const drops = Math.random() < 0.2 ? [jitter(pick(DROPOFFS)), jitter(pick(DROPOFFS))] : [jitter(pick(DROPOFFS))];
      try {
        const q = await call('POST', '/quotes', c.accessToken, {
          pickup: stop(pickup, 'จุดรับ (sim)'),
          dropoffs: drops.map((d, i) => stop(d, `จุดส่ง ${i + 1} (sim)`)),
          parcel: { category: pick(['DOCUMENT', 'FOOD', 'SMALL_BOX']), weightKg: 1 + Math.round(Math.random() * 5), quantity: 1 },
          vehicleType: 'MOTORCYCLE',
          optimizeRoute: drops.length > 1,
        });
        const o = await call('POST', '/orders', c.accessToken, { quoteId: q.options[0].quoteId, paymentMethod: pick(['CASH', 'CARD']), idempotencyKey: `sim-${Date.now()}-${Math.random()}` });
        customerTokens.set(o.orderId, c.accessToken);
        console.log(`+ ${o.orderNo} ${(q.options[0].price / 100).toFixed(0)}฿ ${(q.options[0].distanceM / 1000).toFixed(1)}km`);
      } catch (e) {
        console.log(`  ! order failed: ${(e as Error).message.slice(0, 160)}`);
      }
    }
    await sleep(TICK_MS);
  }

  console.log('winding down: waiting for active jobs...');
  while (bots.some((b) => b.busy)) await sleep(TICK_MS);
  for (const b of bots) {
    await call('POST', '/driver/presence', b.token, { online: false }).catch(() => undefined);
    b.socket.disconnect();
  }
  clearInterval(refresher);
  console.log('simulation finished');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
