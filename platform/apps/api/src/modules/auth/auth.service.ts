import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { RequestOtpInput, StaffLoginInput, UserRole, VerifyOtpInput } from '@ship/shared';
import { AppConfig, CONFIG } from '../../config';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { FieldCipher, hmac, randomDigits, randomToken, safeEqual, sha256, verifyPassword, verifyTotp } from '../../common/crypto';
import { DbService } from '../../common/db.service';
import { AppError } from '../../common/errors';
import { RedisService } from '../../common/redis.service';
import { TokenService } from '../../common/token.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RiskService } from '../risk/risk.service';

const OTP_TTL_S = 300;
const OTP_MAX_ATTEMPTS = 5;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; role: UserRole; phone: string | null; displayName: string | null };
}

/** Normalise Thai numbers to E.164 (+66...). */
export function normalizePhone(phone: string): string {
  const p = phone.replace(/[\s-]/g, '');
  return p.startsWith('+66') ? p : `+66${p.replace(/^0/, '')}`;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly db: DbService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly notifications: NotificationsService,
    private readonly risk: RiskService,
    private readonly audit: AuditService,
    private readonly cipher: FieldCipher,
  ) {}

  async requestOtp(input: RequestOtpInput, ip: string) {
    const phone = normalizePhone(input.phone);
    // Spec §38: OTP rate limits per phone and per IP.
    const [perMin, perHour, perIp] = await Promise.all([
      this.redis.rateLimit(`otp:phone:min:${phone}`, 1, 60),
      this.redis.rateLimit(`otp:phone:hour:${phone}`, 5, 3600),
      this.redis.rateLimit(`otp:ip:${ip}`, 20, 3600),
    ]);
    if (!perMin || !perHour || !perIp) throw new AppError('OTP_RATE_LIMITED', 'ขอรหัส OTP บ่อยเกินไป กรุณารอสักครู่', 429);

    const code = this.cfg.OTP_DEV_FIXED_CODE ?? randomDigits(6);
    await this.db.query(
      `INSERT INTO otp_requests (phone, role, code_hash, expires_at, ip) VALUES ($1,$2,$3, now() + $4 * interval '1 second', $5)`,
      [phone, input.role, hmac(this.cfg.HASH_PEPPER, `${phone}:${code}`), OTP_TTL_S, ip],
    );
    await this.notifications.sendSms(phone, `รหัส OTP ของคุณคือ ${code} (หมดอายุใน 5 นาที) ห้ามบอกรหัสนี้กับผู้อื่น`);
    return { expiresIn: OTP_TTL_S, ...(this.cfg.OTP_DEV_ECHO ? { devCode: code } : {}) };
  }

  async verifyOtp(input: VerifyOtpInput, meta: { ip: string; userAgent?: string }): Promise<TokenPair> {
    const phone = normalizePhone(input.phone);
    const outcome = await this.db.tx(async (c) => {
      const otp = await this.db.one(
        `SELECT * FROM otp_requests WHERE phone = $1 AND role = $2 AND consumed_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [phone, input.role],
        c,
      );
      if (!otp) return { error: new AppError('OTP_INVALID', 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ', 401) };
      if (otp.attempts >= OTP_MAX_ATTEMPTS) return { error: new AppError('OTP_LOCKED', 'กรอกรหัสผิดเกินกำหนด กรุณาขอรหัสใหม่', 429) };
      if (!safeEqual(otp.code_hash, hmac(this.cfg.HASH_PEPPER, `${phone}:${input.code}`))) {
        // returned rather than thrown so the attempt counter is committed
        await this.db.query('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1', [otp.id], c);
        return { error: new AppError('OTP_INVALID', 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ', 401) };
      }
      await this.db.query('UPDATE otp_requests SET consumed_at = now() WHERE id = $1', [otp.id], c);

      let user = await this.db.one('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, input.role], c);
      if (!user) {
        user = await this.db.one(`INSERT INTO users (role, phone) VALUES ($1,$2) RETURNING *`, [input.role, phone], c);
        if (input.role === 'CUSTOMER') await this.db.query('INSERT INTO customers (id) VALUES ($1)', [user.id], c);
        else await this.db.query('INSERT INTO drivers (id) VALUES ($1)', [user.id], c);
      }
      if (user.status !== 'ACTIVE') return { error: new AppError('ACCOUNT_SUSPENDED', 'บัญชีถูกระงับ กรุณาติดต่อฝ่ายบริการ', 403) };

      if (input.role === 'DRIVER') await this.checkDriverDevices(c, user.id, input.deviceId);
      return { pair: await this.issueSession(c, user, input.deviceId, { ...meta, deviceName: input.deviceName, pushToken: input.pushToken }) };
    });
    if ('error' in outcome) throw outcome.error;
    return outcome.pair;
  }

  /** Drivers get one active device: a new login revokes others and flags it for review. */
  private async checkDriverDevices(c: PoolClient, userId: string, deviceId: string) {
    const others = await this.db.query<{ id: string; device_id: string }>(
      `SELECT id, device_id FROM device_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() AND device_id <> $2`,
      [userId, deviceId],
      c,
    );
    if (!others.length) return;
    for (const s of others) {
      await this.db.query(
        `UPDATE device_sessions SET revoked_at = now(), revoke_reason = 'NEW_DEVICE_LOGIN' WHERE id = $1`,
        [s.id],
        c,
      );
      await this.tokens.markSessionRevoked(s.id);
    }
    const recentDevices = await this.db.one<{ n: string }>(
      `SELECT count(DISTINCT device_id) AS n FROM device_sessions WHERE user_id = $1 AND created_at > now() - interval '7 days'`,
      [userId],
      c,
    );
    if (Number(recentDevices?.n ?? 0) >= 3) {
      await this.risk.record(
        { type: 'MULTIPLE_DEVICES', userId, score: 40, details: { devicesLast7d: Number(recentDevices?.n), newDevice: deviceId } },
        c,
      );
    }
  }

  private async issueSession(
    c: PoolClient,
    user: any,
    deviceId: string,
    meta: { ip: string; userAgent?: string; deviceName?: string; pushToken?: string },
  ): Promise<TokenPair> {
    // Reuse the session for this device if one is active (re-login), otherwise create.
    await this.db.query(
      `UPDATE device_sessions SET revoked_at = now(), revoke_reason = 'RELOGIN'
        WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [user.id, deviceId],
      c,
    );
    const session = await this.db.one<{ id: string }>(
      `INSERT INTO device_sessions (user_id, device_id, device_name, push_token, ip, user_agent, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() + $7 * interval '1 day') RETURNING id`,
      [user.id, deviceId, meta.deviceName ?? null, meta.pushToken ?? null, meta.ip, meta.userAgent ?? null, this.cfg.REFRESH_TTL_DAYS],
      c,
    );
    return this.issueTokens(c, user, session!.id);
  }

  private async issueTokens(c: PoolClient, user: any, sessionId: string): Promise<TokenPair> {
    const refreshToken = randomToken();
    await this.db.query(
      `INSERT INTO refresh_tokens (session_id, token_hash, expires_at) VALUES ($1,$2, now() + $3 * interval '1 day')`,
      [sessionId, sha256(refreshToken), this.cfg.REFRESH_TTL_DAYS],
      c,
    );
    return {
      accessToken: await this.tokens.signAccess(user, sessionId),
      refreshToken,
      expiresIn: this.cfg.JWT_ACCESS_TTL_SECONDS,
      user: { id: user.id, role: user.role, phone: user.phone, displayName: user.display_name },
    };
  }

  /** Refresh token rotation with reuse detection. */
  async refresh(refreshToken: string, deviceId: string): Promise<TokenPair> {
    const outcome = await this.db.tx(async (c) => {
      const row = await this.db.one(
        `SELECT rt.*, s.user_id, s.device_id, s.revoked_at AS session_revoked_at, s.expires_at AS session_expires_at
           FROM refresh_tokens rt JOIN device_sessions s ON s.id = rt.session_id
          WHERE rt.token_hash = $1 FOR UPDATE OF rt`,
        [sha256(refreshToken)],
        c,
      );
      if (!row) return { error: new AppError('REFRESH_INVALID', 'Invalid refresh token', 401) };
      if (row.used_at) {
        // A rotated token was presented again: assume theft, kill the session.
        await this.db.query(
          `UPDATE device_sessions SET revoked_at = now(), revoke_reason = 'REFRESH_REUSE' WHERE id = $1 AND revoked_at IS NULL`,
          [row.session_id],
          c,
        );
        await this.tokens.markSessionRevoked(row.session_id);
        return { error: new AppError('REFRESH_REUSED', 'Session revoked', 401) };
      }
      if (row.session_revoked_at || row.expires_at < new Date() || row.session_expires_at < new Date())
        return { error: new AppError('REFRESH_INVALID', 'Session expired', 401) };
      if (row.device_id !== deviceId) return { error: new AppError('REFRESH_INVALID', 'Device mismatch', 401) };

      await this.db.query('UPDATE refresh_tokens SET used_at = now() WHERE id = $1', [row.id], c);
      await this.db.query('UPDATE device_sessions SET last_seen_at = now() WHERE id = $1', [row.session_id], c);
      const user = await this.db.one('SELECT * FROM users WHERE id = $1', [row.user_id], c);
      if (user.status !== 'ACTIVE') return { error: new AppError('ACCOUNT_SUSPENDED', 'Account suspended', 403) };
      return { pair: await this.issueTokens(c, user, row.session_id) };
    });
    // Errors are returned (not thrown) so the reuse revocation above is committed.
    if ('error' in outcome) throw outcome.error;
    return outcome.pair;
  }

  async logout(user: AuthUser) {
    await this.db.query(`UPDATE device_sessions SET revoked_at = now(), revoke_reason = 'LOGOUT' WHERE id = $1`, [user.sessionId]);
    await this.tokens.markSessionRevoked(user.sessionId);
  }

  async updatePushToken(user: AuthUser, pushToken: string | null) {
    await this.db.query('UPDATE device_sessions SET push_token = $2 WHERE id = $1', [user.sessionId, pushToken]);
  }

  /** Ops/admin login: email + password, and TOTP when enrolled (mandatory for ADMIN in production). */
  async staffLogin(input: StaffLoginInput, meta: { ip: string; userAgent?: string }): Promise<TokenPair> {
    if (!(await this.redis.rateLimit(`staff-login:${meta.ip}`, 10, 900)))
      throw new AppError('RATE_LIMITED', 'Too many login attempts', 429);
    const user = await this.db.one(`SELECT * FROM users WHERE lower(email) = lower($1) AND role IN ('OPS','ADMIN')`, [input.email]);
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      throw new AppError('LOGIN_FAILED', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
    }
    if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_SUSPENDED', 'Account suspended', 403);
    if (user.totp_secret_enc) {
      if (!input.totp) throw new AppError('TOTP_REQUIRED', 'กรุณากรอกรหัส 2FA', 401);
      const secret = this.cipher.decrypt(user.totp_secret_enc)!;
      if (!verifyTotp(secret, input.totp)) throw new AppError('TOTP_INVALID', 'รหัส 2FA ไม่ถูกต้อง', 401);
    } else if (user.role === 'ADMIN' && this.cfg.NODE_ENV === 'production') {
      throw new AppError('TOTP_ENROLLMENT_REQUIRED', 'Admin accounts must enrol 2FA', 403);
    }
    const pair = await this.db.tx((c) => this.issueSession(c, user, input.deviceId, meta));
    await this.audit.log({ actor: { id: user.id, role: user.role, sessionId: '' }, action: 'staff.login', entityType: 'user', entityId: user.id, ip: meta.ip });
    return pair;
  }
}
