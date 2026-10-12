import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import type { UserRole } from '@ship/shared';
import { AppConfig, CONFIG } from '../config';
import { AppError } from './errors';
import { RedisService } from './redis.service';
import type { AuthUser } from './auth';

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly redis: RedisService,
  ) {
    this.key = new TextEncoder().encode(cfg.JWT_SECRET);
  }

  async signAccess(user: { id: string; role: UserRole }, sessionId: string): Promise<string> {
    return new SignJWT({ role: user.role, sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setIssuer('ship-api')
      .setAudience('ship')
      .setExpirationTime(`${this.cfg.JWT_ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AuthUser> {
    let payload: any;
    try {
      ({ payload } = await jwtVerify(token, this.key, { issuer: 'ship-api', audience: 'ship' }));
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Invalid or expired token', 401);
    }
    if (await this.redis.client.exists(`sess:revoked:${payload.sid}`)) {
      throw new AppError('SESSION_REVOKED', 'Session has been revoked', 401);
    }
    return { id: payload.sub, role: payload.role, sessionId: payload.sid };
  }

  async markSessionRevoked(sessionId: string) {
    // Access tokens are short-lived; keep the marker slightly longer than their TTL.
    await this.redis.client.set(`sess:revoked:${sessionId}`, '1', 'EX', this.cfg.JWT_ACCESS_TTL_SECONDS + 60);
  }
}
