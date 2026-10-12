import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DriverProfileInput, KycStatus, LatLng, VehicleInput } from '@ship/shared';
import { AppConfig, CONFIG } from '../../config';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { FieldCipher, hmac } from '../../common/crypto';
import { DbService } from '../../common/db.service';
import { AppError, NotFound } from '../../common/errors';
import { DomainEvent } from '../../common/events';
import { MetricsService } from '../../common/metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingService } from '../tracking/tracking.service';

const REQUIRED_DOCS = ['SELFIE', 'NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION'];
const EDITABLE_KYC: KycStatus[] = ['DRAFT', 'PENDING', 'REJECTED'];

@Injectable()
export class DriversService {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly db: DbService,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly tracking: TrackingService,
    private readonly notifications: NotificationsService,
    private readonly metrics: MetricsService,
    private readonly events: EventEmitter2,
  ) {}

  async me(driverId: string) {
    const d = await this.db.one(
      `SELECT d.id, d.first_name, d.last_name, d.license_expiry, d.kyc_status, d.kyc_note, d.tier, d.presence,
              d.rating_sum, d.rating_count, d.offers_received, d.offers_accepted, d.trips_completed, d.trips_cancelled,
              d.current_vehicle_id, d.photo_key, u.phone,
              (d.national_id_enc IS NOT NULL) AS has_national_id, (d.bank_account_enc IS NOT NULL) AS has_bank_account
         FROM drivers d JOIN users u ON u.id = d.id WHERE d.id = $1`,
      [driverId],
    );
    if (!d) throw NotFound('Driver');
    const vehicles = await this.db.query(
      `SELECT id, type, plate_number, plate_province, brand, model, color, year, status FROM vehicles
        WHERE driver_id = $1 AND status <> 'INACTIVE' ORDER BY created_at DESC`,
      [driverId],
    );
    const documents = await this.db.query(
      `SELECT DISTINCT ON (kind) kind, status, note, created_at FROM driver_documents
        WHERE driver_id = $1 ORDER BY kind, created_at DESC`,
      [driverId],
    );
    return {
      ...d,
      rating: d.rating_count ? Math.round((d.rating_sum / d.rating_count) * 10) / 10 : null,
      acceptanceRate: d.offers_received ? Math.round((d.offers_accepted / d.offers_received) * 100) / 100 : null,
      vehicles,
      documents,
      missingDocuments: REQUIRED_DOCS.filter((k) => !documents.some((x) => x.kind === k && x.status !== 'REJECTED')),
    };
  }

  async updateProfile(driverId: string, p: DriverProfileInput) {
    const d = await this.db.one('SELECT kyc_status FROM drivers WHERE id = $1', [driverId]);
    if (!EDITABLE_KYC.includes(d.kyc_status)) throw new AppError('KYC_LOCKED', 'ข้อมูลอยู่ระหว่างตรวจสอบหรืออนุมัติแล้ว กรุณาติดต่อฝ่ายบริการ', 409);
    const nidHash = hmac(this.cfg.HASH_PEPPER, `nid:${p.nationalId}`);
    const dup = await this.db.one('SELECT id FROM drivers WHERE national_id_hash = $1 AND id <> $2', [nidHash, driverId]);
    if (dup) throw new AppError('NATIONAL_ID_IN_USE', 'เลขบัตรประชาชนนี้ถูกใช้สมัครแล้ว', 409);
    await this.db.query(
      `UPDATE drivers SET first_name = $2, last_name = $3, national_id_enc = $4, national_id_hash = $5, license_number_enc = $6,
              license_expiry = $7, emergency_contact_enc = $8, bank_account_enc = $9, updated_at = now()
        WHERE id = $1`,
      [
        driverId,
        p.firstName,
        p.lastName,
        this.cipher.encrypt(p.nationalId),
        nidHash,
        this.cipher.encrypt(p.licenseNumber),
        p.licenseExpiry,
        this.cipher.encrypt(JSON.stringify({ name: p.emergencyContactName ?? null, phone: p.emergencyContactPhone ?? null })),
        p.bankAccountNumber
          ? this.cipher.encrypt(JSON.stringify({ bank: p.bankName, number: p.bankAccountNumber, name: p.bankAccountName }))
          : null,
      ],
    );
    await this.db.query('UPDATE users SET display_name = $2 WHERE id = $1', [driverId, `${p.firstName} ${p.lastName}`]);
    return { ok: true };
  }

  async addVehicle(driverId: string, v: VehicleInput) {
    const row = await this.db.one(
      `INSERT INTO vehicles (driver_id, type, plate_number, plate_province, brand, model, color, year)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [driverId, v.type, v.plateNumber.replace(/\s+/g, ' ').trim(), v.plateProvince, v.brand ?? null, v.model ?? null, v.color ?? null, v.year ?? null],
    ).catch((e) => {
      if (e.code === '23505') throw new AppError('PLATE_IN_USE', 'ทะเบียนรถนี้ถูกลงทะเบียนแล้ว', 409);
      throw e;
    });
    await this.db.query('UPDATE drivers SET current_vehicle_id = coalesce(current_vehicle_id, $2) WHERE id = $1', [driverId, row!.id]);
    return row;
  }

  async addDocument(driverId: string, kind: string, fileKey: string) {
    const file = await this.db.one('SELECT key FROM files WHERE key = $1 AND owner_id = $2 AND uploaded_at IS NOT NULL', [fileKey, driverId]);
    if (!file) throw new AppError('FILE_NOT_UPLOADED', 'ไม่พบไฟล์ที่อัปโหลด', 422);
    await this.db.query(`UPDATE driver_documents SET status = 'SUPERSEDED' WHERE driver_id = $1 AND kind = $2 AND status = 'SUBMITTED'`, [driverId, kind]);
    if (kind === 'SELFIE') await this.db.query('UPDATE drivers SET photo_key = $2 WHERE id = $1', [driverId, fileKey]);
    return this.db.one(`INSERT INTO driver_documents (driver_id, kind, file_key) VALUES ($1,$2,$3) RETURNING id`, [driverId, kind, fileKey]);
  }

  async submitKyc(driverId: string) {
    const me = await this.me(driverId);
    if (!EDITABLE_KYC.includes(me.kyc_status)) throw new AppError('KYC_LOCKED', 'ส่งตรวจสอบแล้ว', 409);
    if (!me.first_name || !me.has_national_id) throw new AppError('KYC_INCOMPLETE', 'กรุณากรอกข้อมูลส่วนตัวให้ครบ', 422);
    if (!me.vehicles.length) throw new AppError('KYC_INCOMPLETE', 'กรุณาเพิ่มข้อมูลรถ', 422);
    if (me.missingDocuments.length) throw new AppError('KYC_INCOMPLETE', 'เอกสารยังไม่ครบ', 422, { missing: me.missingDocuments });
    await this.db.query(`UPDATE drivers SET kyc_status = 'REVIEW', kyc_note = NULL, updated_at = now() WHERE id = $1`, [driverId]);
    return { kycStatus: 'REVIEW' };
  }

  /** Online/offline (spec §12). Going online requires approval and an approved vehicle. */
  async setPresence(driverId: string, online: boolean, location?: LatLng) {
    const d = await this.db.one(
      `SELECT d.kyc_status, d.presence, v.status AS vehicle_status
         FROM drivers d LEFT JOIN vehicles v ON v.id = d.current_vehicle_id WHERE d.id = $1`,
      [driverId],
    );
    if (!d) throw NotFound('Driver');
    if (online) {
      if (d.kyc_status !== 'APPROVED') throw new AppError('KYC_NOT_APPROVED', 'บัญชียังไม่ได้รับการอนุมัติ', 403);
      if (d.vehicle_status !== 'APPROVED') throw new AppError('VEHICLE_NOT_APPROVED', 'รถยังไม่ได้รับการอนุมัติ', 403);
      if (d.presence === 'OFFLINE') {
        await this.db.query(`UPDATE drivers SET presence = 'ONLINE', presence_changed_at = now() WHERE id = $1`, [driverId]);
        await this.db.query('INSERT INTO driver_shifts (driver_id) VALUES ($1)', [driverId]);
      }
      if (location) await this.tracking.ingest(driverId, [{ lat: location.lat, lng: location.lng, ts: Date.now() }]);
    } else {
      if (d.presence === 'BUSY') throw new AppError('HAS_ACTIVE_JOB', 'ไม่สามารถออฟไลน์ระหว่างมีงาน', 409);
      await this.db.query(`UPDATE drivers SET presence = 'OFFLINE', presence_changed_at = now() WHERE id = $1`, [driverId]);
      await this.db.query('UPDATE driver_shifts SET ended_at = now() WHERE driver_id = $1 AND ended_at IS NULL', [driverId]);
      // decline anything still pending so dispatch moves on immediately
      await this.db.query(
        `UPDATE dispatch_offers SET status = 'EXPIRED', responded_at = now() WHERE driver_id = $1 AND status = 'PENDING'`,
        [driverId],
      );
    }
    const row = await this.db.one<{ presence: string }>('SELECT presence FROM drivers WHERE id = $1', [driverId]);
    this.events.emit(DomainEvent.DRIVER_PRESENCE, { driverId, presence: row!.presence });
    await this.refreshOnlineGauge();
    return { presence: row!.presence };
  }

  async refreshOnlineGauge() {
    const r = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM drivers WHERE presence <> 'OFFLINE'`);
    this.metrics.onlineDrivers.set(Number(r!.n));
  }

  /** Auto-offline drivers whose app stopped reporting (crash, no signal, battery). */
  async sweepStalePresence() {
    const stale = await this.db.query<{ id: string }>(
      `SELECT d.id FROM drivers d LEFT JOIN driver_locations l ON l.driver_id = d.id
        WHERE d.presence = 'ONLINE' AND (l.updated_at IS NULL OR l.updated_at < now() - interval '10 minutes')`,
    );
    for (const s of stale) await this.setPresence(s.id, false).catch(() => undefined);
    if (stale.length) await this.refreshOnlineGauge();
  }

  // ---------------------------------------------------------------- ops-side

  async kycDecision(actor: AuthUser, driverId: string, decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED', note: string, ip: string) {
    await this.db.tx(async (c) => {
      const before = await this.db.one('SELECT kyc_status, tier FROM drivers WHERE id = $1 FOR UPDATE', [driverId], c);
      if (!before) throw NotFound('Driver');
      await this.db.query('UPDATE drivers SET kyc_status = $2, kyc_note = $3, updated_at = now() WHERE id = $1', [driverId, decision, note], c);
      if (decision === 'APPROVED') {
        await this.db.query(`UPDATE vehicles SET status = 'APPROVED' WHERE driver_id = $1 AND status = 'PENDING'`, [driverId], c);
        await this.db.query(
          `UPDATE driver_documents SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now() WHERE driver_id = $1 AND status = 'SUBMITTED'`,
          [driverId, actor.id],
          c,
        );
      }
      if (decision === 'SUSPENDED') {
        await this.db.query(`UPDATE drivers SET presence = 'OFFLINE' WHERE id = $1 AND presence = 'ONLINE'`, [driverId], c);
      }
      await this.audit.log({ actor, action: 'driver.kyc_decision', entityType: 'driver', entityId: driverId, before, after: { kycStatus: decision }, reason: note, ip }, c);
    });
    await this.notifications.notify({
      userId: driverId,
      event: 'KYC_DECISION',
      title: decision === 'APPROVED' ? 'บัญชีได้รับการอนุมัติแล้ว' : 'สถานะบัญชีมีการเปลี่ยนแปลง',
      body: decision === 'APPROVED' ? 'คุณสามารถออนไลน์เพื่อรับงานได้แล้ว' : note,
      channels: ['PUSH', 'SMS'],
    });
  }

  /** Decrypted PII for ops: ADMIN only, and every read is audited. */
  async sensitive(actor: AuthUser, driverId: string, ip: string) {
    const d = await this.db.one(
      'SELECT national_id_enc, license_number_enc, emergency_contact_enc, bank_account_enc FROM drivers WHERE id = $1',
      [driverId],
    );
    if (!d) throw NotFound('Driver');
    await this.audit.log({ actor, action: 'driver.pii_view', entityType: 'driver', entityId: driverId, ip });
    return {
      nationalId: this.cipher.decrypt(d.national_id_enc),
      licenseNumber: this.cipher.decrypt(d.license_number_enc),
      emergencyContact: d.emergency_contact_enc ? JSON.parse(this.cipher.decrypt(d.emergency_contact_enc)!) : null,
      bankAccount: d.bank_account_enc ? JSON.parse(this.cipher.decrypt(d.bank_account_enc)!) : null,
    };
  }
}
