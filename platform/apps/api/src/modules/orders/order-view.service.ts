import { Injectable } from '@nestjs/common';
import { DriverPublicInfo, numericToSatang, OrderView, TimelineEvent } from '@ship/shared';
import type { AuthUser } from '../../common/auth';
import { FieldCipher } from '../../common/crypto';
import { DbService, Queryable } from '../../common/db.service';
import { NotFound } from '../../common/errors';

export const STOP_COLUMNS = `s.id, s.seq, s.type, s.status, s.address, s.district, s.building, s.floor, s.room,
  s.contact_name, s.contact_phone, s.note, s.locked, s.otp_enc, s.arrived_at, s.completed_at,
  ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng`;

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/^(\+66|0)(\d+)(\d{4})$/, (_, p, mid, last) => `${p}${'•'.repeat(mid.length)}${last}`);
}

@Injectable()
export class OrderViewService {
  constructor(
    private readonly db: DbService,
    private readonly cipher: FieldCipher,
  ) {}

  async stops(orderId: string, client?: Queryable) {
    return this.db.query(`SELECT ${STOP_COLUMNS} FROM order_stops s WHERE s.order_id = $1 ORDER BY s.seq`, [orderId], client);
  }

  async driverPublic(driverId: string): Promise<DriverPublicInfo | null> {
    const d = await this.db.one(
      `SELECT d.id, d.first_name, d.last_name, d.photo_key, d.rating_sum, d.rating_count, u.phone,
              v.type, v.plate_number, v.plate_province, v.brand, v.model, v.color
         FROM drivers d JOIN users u ON u.id = d.id
         LEFT JOIN vehicles v ON v.id = d.current_vehicle_id
        WHERE d.id = $1`,
      [driverId],
    );
    if (!d) return null;
    return {
      id: d.id,
      name: [d.first_name, d.last_name ? `${d.last_name.slice(0, 1)}.` : ''].filter(Boolean).join(' ') || 'คนขับ',
      phoneMasked: maskPhone(d.phone),
      photoUrl: null,
      rating: d.rating_count > 0 ? Math.round((d.rating_sum / d.rating_count) * 10) / 10 : null,
      vehicle: {
        type: d.type,
        plateNumber: d.plate_number,
        plateProvince: d.plate_province,
        brand: d.brand,
        model: d.model,
        color: d.color,
      },
    };
  }

  async view(orderId: string, viewer: AuthUser): Promise<OrderView> {
    const o = await this.db.one('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!o) throw NotFound('Order');
    const stops = await this.stops(orderId);
    const items = await this.db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    const rating = await this.db.one(
      `SELECT score, comment FROM ratings WHERE order_id = $1 AND rater_type = 'CUSTOMER'`,
      [orderId],
    );
    const showOtp = viewer.role === 'CUSTOMER' && viewer.id === o.customer_id;
    return {
      id: o.id,
      orderNo: o.order_no,
      status: o.status,
      vehicleType: o.vehicle_type,
      paymentMethod: o.payment_method,
      price: numericToSatang(o.price),
      breakdown: o.breakdown,
      distanceM: o.distance_m,
      durationS: o.duration_s,
      createdAt: o.created_at.toISOString(),
      updatedAt: o.updated_at.toISOString(),
      stops: stops.map((s) => ({
        id: s.id,
        seq: s.seq,
        type: s.type,
        status: s.status,
        address: s.address,
        building: s.building,
        floor: s.floor,
        room: s.room,
        contactName: s.contact_name,
        contactPhone: s.contact_phone,
        note: s.note,
        location: { lat: Number(s.lat), lng: Number(s.lng) },
        otp: showOtp && s.status !== 'COMPLETED' ? this.cipher.decrypt(s.otp_enc) : null,
        arrivedAt: s.arrived_at?.toISOString() ?? null,
        completedAt: s.completed_at?.toISOString() ?? null,
      })),
      driver: o.driver_id ? await this.driverPublic(o.driver_id) : null,
      parcel: { ...o.parcel, items: items.length },
      rating: rating ? { score: rating.score, comment: rating.comment } : null,
    };
  }

  async timeline(orderId: string): Promise<TimelineEvent[]> {
    const rows = await this.db.query(
      `SELECT id, type, from_status, to_status, actor_type, actor_id, data, created_at,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM tracking_events WHERE order_id = $1 ORDER BY id`,
      [orderId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      at: r.created_at.toISOString(),
      type: r.type,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      actorType: r.actor_type,
      actorId: r.actor_id,
      data: { ...r.data, ...(r.lat !== null ? { location: { lat: Number(r.lat), lng: Number(r.lng) } } : {}) },
    }));
  }
}
