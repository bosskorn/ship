import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { refreshSchema, requestOtpSchema, staffLoginSchema, verifyOtpSchema } from '@ship/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, AuthUser, ClientIp, CurrentUser } from '../../common/auth';
import { DbService } from '../../common/db.service';
import { zbody } from '../../common/zod';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DbService,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body(zbody(requestOtpSchema)) body: z.infer<typeof requestOtpSchema>, @ClientIp() ip: string) {
    return this.auth.requestOtp(body, ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body(zbody(verifyOtpSchema)) body: z.infer<typeof verifyOtpSchema>, @ClientIp() ip: string, @Req() req: Request) {
    return this.auth.verifyOtp(body, { ip, userAgent: req.headers['user-agent'] });
  }

  @Post('staff/login')
  @HttpCode(200)
  staffLogin(@Body(zbody(staffLoginSchema)) body: z.infer<typeof staffLoginSchema>, @ClientIp() ip: string, @Req() req: Request) {
    return this.auth.staffLogin(body, { ip, userAgent: req.headers['user-agent'] });
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(zbody(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return this.auth.refresh(body.refreshToken, body.deviceId);
  }

  @Post('logout')
  @Auth()
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user);
  }

  @Post('push-token')
  @Auth()
  @HttpCode(204)
  async pushToken(@CurrentUser() user: AuthUser, @Body(zbody(z.object({ pushToken: z.string().max(512).nullable() }))) body: { pushToken: string | null }) {
    await this.auth.updatePushToken(user, body.pushToken);
  }

  @Get('me')
  @Auth()
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.db.one('SELECT id, role, phone, email, display_name, status, created_at FROM users WHERE id = $1', [user.id]);
    return u;
  }
}
