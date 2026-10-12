import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ship/shared';
import { AppError } from './errors';
import { TokenService } from './token.service';
import { RedisService } from './redis.service';

export interface AuthUser {
  id: string;
  role: UserRole;
  sessionId: string;
}

const ROLES_KEY = 'roles';
const RATE_KEY = 'rate';

export interface RateLimitSpec {
  name: string;
  limit: number;
  windowSec: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHENTICATED', 'Missing bearer token', 401);
    const user = await this.tokens.verifyAccess(header.slice(7));
    req.user = user;

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(user.role)) throw new AppError('FORBIDDEN', 'Insufficient role', 403);

    const rate = this.reflector.getAllAndOverride<RateLimitSpec | undefined>(RATE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (rate && !(await this.redis.rateLimit(`${rate.name}:${user.id}`, rate.limit, rate.windowSec))) {
      throw new AppError('RATE_LIMITED', 'Too many requests', 429);
    }
    return true;
  }
}

/** Require an authenticated user, optionally restricted to roles. */
export const Auth = (...roles: UserRole[]) => applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(AuthGuard));

/** Per-user fixed-window rate limit (requires @Auth). */
export const RateLimit = (name: string, limit: number, windowSec: number) =>
  SetMetadata(RATE_KEY, { name, limit, windowSec } satisfies RateLimitSpec);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim() as string) || req.ip || 'unknown';
});
