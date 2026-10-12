/**
 * Integration scenarios for the edges of the marketplace core. Runs against a live API
 * (OTP_DEV_ECHO=true, seeded DB). Temporarily shortens offer TTL to keep the run fast.
 *
 *   node dist/scripts/scenarios.js
 */
import { JobOfferPayload, LatLng, PlatformSettings, WsEvent } from '@ship/shared';
import type { Socket } from 'socket.io-client';
import { API, assert, call, connect, drive, expectError, onboardDriver, otpLogin, sleep, staffLogin, stop, uploadTinyJpeg, waitFor } from './lib';

// Distinct areas so scenarios don't steal each other's drivers.
const AREAS: Record<string, LatLng> = {
  latphrao: { lat: 13.8167, lng: 100.5615 },
  chatuchak: { lat: 13.8, lng: 100.553 },
  bangkhen: { lat: 13.873, lng: 100.596 },
  ramintra: { lat: 13.868, lng: 100.7 },
  silom: { lat: 13.7286, lng: 100.5345 },
  bangna: { lat: 13.6681, lng: 100.6045 },
};
const near = (p: LatLng, dLat = 0.004, dLng = 0.004) => ({ lat: p.lat + dLat, lng: p.lng + dLng });
const parcel = { category: 'DOCUMENT', weightKg: 1, quantity: 1 };

let admin: any;
const results: { name: string; ok: boolean; ms: number; error?: string }[] = [];

async function scenario(name: string, fn: () => Promise<void>) {
  const t = Date.now();
  process.stdout.write(`• ${name} ... `);
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, error: (e as Error).message });
    console.log(`FAILED\n    ${(e as Error).message}`);
  }
}

async function goOnline(d: { token: string }, at: LatLng): Promise<Socket> {
  const s = await connect(d.token);
  await call('POST', '/driver/presence', d.token, { online: true, location: at });
  return s;
}

async function offline(...drivers: { token: string }[]) {
  for (const d of drivers) await call('POST', '/driver/presence', d.token, { online: false }).catch(() => undefined);
}

async function newCustomer() {
  return otpLogin(`09${(Math.random() * 1e8).toFixed(0).padStart(8, '0')}`, 'CUSTOMER');
}

async function quoteAndOrder(C: string, pickup: LatLng, dropoffs: LatLng[], extra: Record<string, unknown> = {}, payment = 'CASH') {
  const q = await call('POST', '/quotes', C, {
    pickup: stop(pickup, 'จุดรับ'),
    dropoffs: dropoffs.map((d, i) => stop(d, `จุดส่ง ${i + 1}`)),
    parcel,
    vehicleType: 'MOTORCYCLE',
    ...extra,
  });
  const opt = q.options[0];
  assert(opt.available, `quote unavailable: ${opt.unavailableReason}`);
  const o = await call('POST', '/orders', C, { quoteId: opt.quoteId, paymentMethod: payment, idempotencyKey: `sc-${Date.now()}-${Math.random()}` });
  return { quote: opt, order: o };
}

async function doPickup(driver: { token: string }, orderId: string, C: string, at: LatLng) {
  const view = await call('GET', `/orders/${orderId}`, C);
  const pickup = view.stops[0];
  await drive(driver.token, at, pickup.location, 0);
  await call('POST', `/driver/orders/${orderId}/arrive-pickup`, driver.token, { location: pickup.location });
  await call('POST', `/driver/orders/${orderId}/pickup`, driver.token, { location: pickup.location, otp: pickup.otp });
  return pickup.location as LatLng;
}

/** Visit every remaining drop-off in sequence with OTP POD. */
async function finishDropoffs(driver: { token: string }, orderId: string, C: string, from: LatLng) {
  const view = await call('GET', `/orders/${orderId}`, C);
  let pos = from;
  for (const s of view.stops.filter((x: any) => x.type === 'DROPOFF' && x.status !== 'COMPLETED')) {
    await drive(driver.token, pos, s.location, 0);
    await call('POST', `/driver/orders/${orderId}/stops/${s.id}/arrive`, driver.token, { location: s.location });
    await call('POST', `/driver/orders/${orderId}/stops/${s.id}/complete`, driver.token, { location: s.location, otp: s.otp });
    pos = s.location;
  }
}

async function completeDelivery(driver: { token: string }, orderId: string, C: string, at: LatLng) {
  const p = await doPickup(driver, orderId, C, at);
  await finishDropoffs(driver, orderId, C, p);
}

async function main() {
  console.log(`Scenario run against ${API}\n`);
  admin = await staffLogin();
  const A = admin.accessToken;
  const original: PlatformSettings = await call('GET', '/ops/settings', A);
  await call('PUT', '/ops/settings', A, { data: { ...original, offerTtlSeconds: 10 }, reason: 'scenario run: short offer TTL' });

  try {
    await scenario('decline moves dispatch to the next candidate immediately', async () => {
      const p = AREAS.chatuchak;
      const d1 = await onboardDriver(A, { tier: 'STANDARD' });
      const d2 = await onboardDriver(A, { tier: 'STANDARD' });
      const s1 = await goOnline(d1, near(p, 0.002, 0));
      const s2 = await goOnline(d2, near(p, 0.03, 0)); // ~3.3 km: outside wave-1 radius
      const C = (await newCustomer()).accessToken;
      const offer1 = waitFor<JobOfferPayload>(s1, WsEvent.OFFER_NEW);
      const { order } = await quoteAndOrder(C, p, [AREAS.silom]);
      const o1 = await offer1;
      const offer2 = waitFor<JobOfferPayload>(s2, WsEvent.OFFER_NEW, (x) => x.orderId === order.orderId, 8000);
      await call('POST', `/driver/offers/${o1.offerId}/decline`, d1.token, { reason: 'ไกลเกินไป' });
      const o2 = await offer2; // must arrive well before the 10 s timer
      await call('POST', `/driver/offers/${o2.offerId}/accept`, d2.token);
      const v = await call('GET', `/orders/${order.orderId}`, C);
      assert(v.status === 'GOING_TO_PICKUP' && v.driver.id === d2.id, 'second driver assigned');
      await expectError('OFFER_EXPIRED', () => call('POST', `/driver/offers/${o1.offerId}/accept`, d1.token)).catch(async () =>
        expectError('OFFER_TAKEN', () => call('POST', `/driver/offers/${o1.offerId}/accept`, d1.token)),
      );
      await completeDelivery(d2, order.orderId, C, near(p, 0.03, 0));
      s1.disconnect();
      s2.disconnect();
      await offline(d1, d2);
    });

    await scenario('two drivers race to accept: exactly one wins', async () => {
      const p = AREAS.latphrao;
      const ds = [await onboardDriver(A), await onboardDriver(A), await onboardDriver(A)];
      const socks = await Promise.all(ds.map((d, i) => goOnline(d, near(p, 0.001 * (i + 1), 0))));
      const C = (await newCustomer()).accessToken;
      const offersP = socks.map((s) => waitFor<JobOfferPayload>(s, WsEvent.OFFER_NEW));
      const { order } = await quoteAndOrder(C, p, [AREAS.bangna]);
      const offers = await Promise.all(offersP);
      const res = await Promise.allSettled(offers.map((o, i) => call('POST', `/driver/offers/${o.offerId}/accept`, ds[i].token)));
      const wins = res.filter((r) => r.status === 'fulfilled').length;
      assert(wins === 1, `expected exactly 1 winner, got ${wins}`);
      const v = await call('GET', `/orders/${order.orderId}`, C);
      await call('POST', `/orders/${order.orderId}/cancel`, C, { reason: 'test cleanup' });
      const winner = ds.find((d) => d.id === v.driver.id)!;
      const me = await call('GET', '/driver/me', winner.token);
      assert(me.presence === 'ONLINE', 'driver freed after customer cancel');
      socks.forEach((s) => s.disconnect());
      await offline(...ds);
    });

    await scenario('no driver -> waves exhaust -> NO_DRIVER -> ops manual dispatch (audited)', async () => {
      const p = AREAS.ramintra;
      const C = (await newCustomer()).accessToken;
      const ops = await connect(A);
      const alert = waitFor<any>(ops, WsEvent.OPS_ALERT, (a) => a.kind === 'NO_DRIVER', 30_000);
      const { order } = await quoteAndOrder(C, p, [AREAS.bangkhen]);
      await alert;
      const v = await call('GET', `/orders/${order.orderId}`, C);
      assert(v.status === 'NO_DRIVER', `expected NO_DRIVER, got ${v.status}`);
      // a driver comes online 12 km away; ops finds and assigns them manually
      const d = await onboardDriver(A);
      const s = await goOnline(d, AREAS.latphrao);
      const cands = await call('GET', `/ops/orders/${order.orderId}/candidates`, A);
      assert(cands.some((c: any) => c.driverId === d.id), 'driver is listed as a candidate');
      await expectError('VALIDATION_ERROR', () => call('POST', `/ops/orders/${order.orderId}/assign`, A, { driverId: d.id, reason: '' }));
      await call('POST', `/ops/orders/${order.orderId}/assign`, A, { driverId: d.id, reason: 'ไม่มีคนขับในพื้นที่ รามอินทรา' });
      const after = await call('GET', `/orders/${order.orderId}`, C);
      assert(after.status === 'GOING_TO_PICKUP' && after.driver.id === d.id, 'manually assigned');
      const audit = await call('GET', `/ops/audit-logs?entityType=order&entityId=${order.orderId}`, A);
      assert(audit.some((a: any) => a.action === 'dispatch.manual_assign'), 'manual assignment audited');
      await completeDelivery(d, order.orderId, C, AREAS.latphrao);
      ops.disconnect();
      s.disconnect();
      await offline(d);
    });

    await scenario('driver cancels before pickup -> order re-dispatched to another driver', async () => {
      const p = AREAS.bangkhen;
      const d1 = await onboardDriver(A);
      const s1 = await goOnline(d1, near(p, 0.002, 0));
      const C = (await newCustomer()).accessToken;
      const offer = waitFor<JobOfferPayload>(s1, WsEvent.OFFER_NEW);
      const { order } = await quoteAndOrder(C, p, [AREAS.latphrao]);
      await call('POST', `/driver/offers/${(await offer).offerId}/accept`, d1.token);
      await expectError('CANNOT_CANCEL', () => call('POST', `/driver/orders/${order.orderId}/cancel`, d1.token, { reason: 'x' })).catch(() => undefined);
      const d2 = await onboardDriver(A);
      const s2 = await goOnline(d2, near(p, 0.003, 0));
      const offer2 = waitFor<JobOfferPayload>(s2, WsEvent.OFFER_NEW, (o) => o.orderId === order.orderId, 15_000);
      await call('POST', `/driver/orders/${order.orderId}/cancel`, d1.token, { reason: 'รถเสีย' });
      const me1 = await call('GET', '/driver/me', d1.token);
      assert(me1.presence === 'ONLINE' && me1.trips_cancelled === 1, 'driver 1 freed, cancellation counted');
      await call('POST', `/driver/offers/${(await offer2).offerId}/accept`, d2.token);
      await completeDelivery(d2, order.orderId, C, near(p, 0.003, 0));
      const final = await call('GET', `/orders/${order.orderId}`, C);
      assert(final.status === 'DELIVERED' && final.driver.id === d2.id, 'delivered by driver 2');
      s1.disconnect();
      s2.disconnect();
      await offline(d1, d2);
    });

    await scenario('QR payment: PAYMENT_PENDING until gateway webhook, then dispatch', async () => {
      const C = (await newCustomer()).accessToken;
      const { order } = await quoteAndOrder(C, AREAS.silom, [AREAS.bangna], {}, 'QR');
      assert(order.status === 'PAYMENT_PENDING', `expected PAYMENT_PENDING, got ${order.status}`);
      assert(String(order.payment.clientData.qrPayload).startsWith('MOCK-PROMPTPAY'), 'QR payload returned');
      const pay = await call('GET', `/orders/${order.orderId}/payment`, C);
      // bad signature rejected
      const bad = await fetch(`${API}/payments/webhooks/mock-qr`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-signature': 'nope' }, body: JSON.stringify({ providerRef: 'x' }) });
      assert(bad.status === 400, 'unsigned webhook rejected');
      const ref = String(order.payment.clientData.qrPayload).split('|')[3];
      const ok = await fetch(`${API}/payments/webhooks/mock-qr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mock-signature': process.env.PAYMENT_MOCK_SECRET ?? 'dev-only-mock-payment' },
        body: JSON.stringify({ providerRef: ref, status: 'PAID' }),
      });
      assert(ok.ok, `webhook ok ${ok.status}`);
      const v = await call('GET', `/orders/${order.orderId}`, C);
      assert(['SEARCHING_DRIVER', 'NO_DRIVER'].includes(v.status), `dispatch started after payment, got ${v.status}`);
      assert(pay.method === 'QR', 'payment method recorded');
      await call('POST', `/orders/${order.orderId}/cancel`, C, { reason: 'test cleanup' });
      const refunded = await call('GET', `/orders/${order.orderId}/payment`, C);
      assert(refunded.status === 'REFUNDED', `captured QR payment refunded on cancel, got ${refunded.status}`);
    });

    await scenario('multi-stop: optimized sequence, locked stop kept, wrong stop order rejected', async () => {
      const p = AREAS.chatuchak;
      const C = (await newCustomer()).accessToken;
      const far = { lat: 13.75, lng: 100.53 };
      const mid = { lat: 13.78, lng: 100.545 };
      const closest = { lat: 13.795, lng: 100.55 };
      const q = await call('POST', '/quotes', C, {
        pickup: stop(p, 'จตุจักร'),
        dropoffs: [stop(far, 'ไกล'), stop(mid, 'กลาง'), stop(closest, 'ใกล้')],
        parcel,
        vehicleType: 'MOTORCYCLE',
        optimizeRoute: true,
      });
      const opt = q.options[0];
      assert(opt.breakdown.additionalStopsFee === 2 * 1500, 'two additional stops charged');
      const d = await onboardDriver(A);
      const s = await goOnline(d, near(p, 0.002, 0));
      const offer = waitFor<JobOfferPayload>(s, WsEvent.OFFER_NEW);
      const o = await call('POST', '/orders', C, { quoteId: opt.quoteId, paymentMethod: 'CASH', idempotencyKey: `ms-${Date.now()}` });
      const of = await offer;
      assert(of.stopCount === 3, 'offer shows 3 stops');
      await call('POST', `/driver/offers/${of.offerId}/accept`, d.token);
      const v = await call('GET', `/orders/${o.orderId}`, C);
      const drops = v.stops.filter((x: any) => x.type === 'DROPOFF').map((x: any) => x.address);
      assert(JSON.stringify(drops) === JSON.stringify(['ใกล้', 'กลาง', 'ไกล']), `optimized order, got ${drops}`);
      await call('POST', `/driver/orders/${o.orderId}/arrive-pickup`, d.token, { location: p });
      await call('POST', `/driver/orders/${o.orderId}/pickup`, d.token, { location: p, otp: v.stops[0].otp });
      const lastStop = v.stops[3];
      await expectError('WRONG_STOP', () => call('POST', `/driver/orders/${o.orderId}/stops/${lastStop.id}/arrive`, d.token, { location: lastStop.location }));
      // first drop-off proved with photo + recipient name instead of OTP
      const first = v.stops[1];
      await drive(d.token, p, first.location, 0);
      await call('POST', `/driver/orders/${o.orderId}/stops/${first.id}/arrive`, d.token, { location: first.location });
      await expectError('POD_REQUIRED', () => call('POST', `/driver/orders/${o.orderId}/stops/${first.id}/complete`, d.token, { location: first.location }));
      const photo = await uploadTinyJpeg(d.token, 'POD');
      const r = await call('POST', `/driver/orders/${o.orderId}/stops/${first.id}/complete`, d.token, { location: first.location, photoKeys: [photo], recipientName: 'รปภ. อาคาร' });
      assert(r.status === 'IN_TRANSIT' && r.remainingStops === 2, 'continues to next stop');
      await finishDropoffs(d, o.orderId, C, first.location);
      const done = await call('GET', `/orders/${o.orderId}`, C);
      assert(done.status === 'DELIVERED', `multi-stop delivered, got ${done.status}`);
      s.disconnect();
      await offline(d);
    });

    await scenario('state machine & ownership enforced server-side', async () => {
      const C = (await newCustomer()).accessToken;
      const other = (await newCustomer()).accessToken;
      const d = await onboardDriver(A);
      const s = await goOnline(d, near(AREAS.silom, 0.002, 0));
      const offer = waitFor<JobOfferPayload>(s, WsEvent.OFFER_NEW);
      const { order } = await quoteAndOrder(C, AREAS.silom, [AREAS.latphrao]);
      await expectError('FORBIDDEN', () => call('GET', `/orders/${order.orderId}`, other));
      await call('POST', `/driver/offers/${(await offer).offerId}/accept`, d.token);
      // cannot skip ahead to delivery or pickup without arriving
      await expectError('INVALID_STATE', () => call('POST', `/driver/orders/${order.orderId}/pickup`, d.token, { location: AREAS.silom, otp: '0000' }));
      // customers cannot call driver endpoints
      await expectError('FORBIDDEN', () => call('POST', `/driver/orders/${order.orderId}/arrive-pickup`, C, { location: AREAS.silom }));
      // arriving far away needs a reason; with a reason it is allowed but flagged for ops
      await expectError('OUTSIDE_GEOFENCE', () => call('POST', `/driver/orders/${order.orderId}/arrive-pickup`, d.token, { location: AREAS.bangna }));
      await call('POST', `/driver/orders/${order.orderId}/arrive-pickup`, d.token, { location: near(AREAS.silom, 0.01, 0), overrideReason: 'GPS คลาดเคลื่อนในอาคาร' });
      const risk = await call('GET', '/ops/risk-events?status=OPEN', A);
      assert(risk.some((r: any) => r.order_id === order.orderId && r.type === 'GEOFENCE_OVERRIDE'), 'override recorded as risk event');
      // pickup needs evidence
      await expectError('PICKUP_EVIDENCE_REQUIRED', () => call('POST', `/driver/orders/${order.orderId}/pickup`, d.token, { location: AREAS.silom }));
      // customer cannot cancel after pickup
      const v = await call('GET', `/orders/${order.orderId}`, C);
      await call('POST', `/driver/orders/${order.orderId}/pickup`, d.token, { location: AREAS.silom, otp: v.stops[0].otp });
      await expectError('CANNOT_CANCEL', () => call('POST', `/orders/${order.orderId}/cancel`, C, { reason: 'เปลี่ยนใจ' }));
      // driver cannot go offline with an active job
      await expectError('HAS_ACTIVE_JOB', () => call('POST', '/driver/presence', d.token, { online: false }));
      await finishDropoffs(d, order.orderId, C, AREAS.silom);
      // POD rows are append-only in the database
      s.disconnect();
      await offline(d);
    });

    await scenario('quotes are single-use; order creation is idempotent; service area enforced', async () => {
      const C = (await newCustomer()).accessToken;
      const q = await call('POST', '/quotes', C, { pickup: stop(AREAS.silom, 'ก'), dropoffs: [stop(AREAS.bangna, 'ข')], parcel, vehicleType: 'MOTORCYCLE' });
      const key = `idem-${Date.now()}`;
      const a = await call('POST', '/orders', C, { quoteId: q.options[0].quoteId, paymentMethod: 'CARD', idempotencyKey: key });
      const b = await call('POST', '/orders', C, { quoteId: q.options[0].quoteId, paymentMethod: 'CARD', idempotencyKey: key });
      assert(a.orderId === b.orderId && b.duplicate, 'same idempotency key returns same order');
      await expectError('QUOTE_USED', () => call('POST', '/orders', C, { quoteId: q.options[0].quoteId, paymentMethod: 'CARD', idempotencyKey: `${key}-2` }));
      await call('POST', `/orders/${a.orderId}/cancel`, C, { reason: 'cleanup' });
      await expectError('OUT_OF_SERVICE_AREA', () =>
        call('POST', '/quotes', C, { pickup: stop({ lat: 18.79, lng: 98.98 }, 'เชียงใหม่'), dropoffs: [stop(AREAS.bangna, 'ข')], parcel }),
      );
      await expectError('VALIDATION_ERROR', () => call('POST', '/quotes', C, { pickup: stop(AREAS.silom, 'ก'), dropoffs: [], parcel }));
    });

    await scenario('refresh token rotation with reuse detection', async () => {
      const c = await newCustomer();
      const r1 = await call('POST', '/auth/refresh', undefined, { refreshToken: c.refreshToken, deviceId: c.deviceId });
      const r2 = await call('POST', '/auth/refresh', undefined, { refreshToken: r1.refreshToken, deviceId: c.deviceId });
      assert(r2.accessToken, 'rotated twice');
      await expectError('REFRESH_REUSED', () => call('POST', '/auth/refresh', undefined, { refreshToken: c.refreshToken, deviceId: c.deviceId }));
      // the whole session is now revoked, including the latest tokens
      await expectError('SESSION_REVOKED', () => call('GET', '/auth/me', r2.accessToken));
      await expectError('REFRESH_INVALID', () => call('POST', '/auth/refresh', undefined, { refreshToken: r2.refreshToken, deviceId: c.deviceId }));
    });

    await scenario('uploads: signed URLs, type restrictions, sandboxed serving', async () => {
      const c = (await newCustomer()).accessToken;
      await expectError('UNSUPPORTED_TYPE', () => call('POST', '/uploads/sign', c, { purpose: 'POD', contentType: 'image/svg+xml' }));
      await expectError('UNSUPPORTED_TYPE', () => call('POST', '/uploads/sign', c, { purpose: 'PARCEL', contentType: 'text/html' }));
      await expectError('FORBIDDEN', () => call('POST', '/uploads/sign', c, { purpose: 'KYC', contentType: 'image/jpeg' }));
      const signed = await call('POST', '/uploads/sign', c, { purpose: 'SIGNATURE', contentType: 'image/svg+xml' });
      const tampered = signed.uploadUrl.replace(/sig=[0-9a-f]+/, 'sig=' + '0'.repeat(64));
      const bad = await fetch(tampered, { method: 'PUT', headers: signed.headers, body: '<svg/>' });
      assert(bad.status === 403, `tampered signature rejected, got ${bad.status}`);
      const ok = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
      assert(ok.ok, 'signature upload ok');
      const again = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: '<svg/>' });
      assert(again.status === 409, 'signed URL is single-use');
    });

    await scenario('wrong OTP attempts are limited', async () => {
      const phone = `09${Date.now().toString().slice(-8)}`;
      await call('POST', '/auth/otp/request', undefined, { phone, role: 'CUSTOMER' });
      for (let i = 0; i < 5; i++) {
        await expectError('OTP_INVALID', () => call('POST', '/auth/otp/verify', undefined, { phone, role: 'CUSTOMER', code: '999999', deviceId: 'dev-x' })).catch(
          () => undefined,
        );
      }
      await expectError('OTP_LOCKED', () => call('POST', '/auth/otp/verify', undefined, { phone, role: 'CUSTOMER', code: '123456', deviceId: 'dev-x' }));
      await expectError('OTP_RATE_LIMITED', () => call('POST', '/auth/otp/request', undefined, { phone, role: 'CUSTOMER' }));
    });
  } finally {
    await call('PUT', '/ops/settings', A, { data: original, reason: 'scenario run: restore settings' });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
  await sleep(100);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
