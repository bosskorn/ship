import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  commissionRuleSchema,
  CommissionRuleInput,
  manualAssignSchema,
  PlatformSettings,
  pricingRuleSchema,
  PricingRuleInput,
  settingsSchema,
  VehicleType,
  zoneSchema,
  ZoneInput,
} from '@ship/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { Auth, AuthUser, ClientIp, CurrentUser } from '../../common/auth';
import { DbService } from '../../common/db.service';
import { zbody } from '../../common/zod';
import { DispatchService } from '../dispatch/dispatch.service';
import { DriversService } from '../drivers/drivers.service';
import { EarningsService } from '../earnings/earnings.service';
import { OrdersService } from '../orders/orders.service';
import { SurgeService } from '../pricing/surge.service';
import { RiskService } from '../risk/risk.service';
import { SettingsService } from '../settings/settings.service';
import { TrackingService } from '../tracking/tracking.service';
import { ZonesService } from '../zones/zones.service';
import { ConfigAdminService } from './config-admin.service';
import { OpsService } from './ops.service';

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
const withReason = <T extends z.ZodTypeAny>(s: T) => z.object({ data: s, reason: z.string().max(300).optional() });

@Controller('ops')
@Auth('OPS', 'ADMIN')
export class OpsController {
  constructor(
    private readonly ops: OpsService,
    private readonly dispatch: DispatchService,
    private readonly orderService: OrdersService,
    private readonly drivers: DriversService,
    private readonly tracking: TrackingService,
    private readonly cfgAdmin: ConfigAdminService,
    private readonly zones: ZonesService,
    private readonly settings: SettingsService,
    private readonly surge: SurgeService,
    private readonly risk: RiskService,
    private readonly earnings: EarningsService,
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  // ---------------- live board
  @Get('live')
  live() {
    return this.ops.live();
  }

  @Get('kpis')
  kpis(@Query('from') from?: string, @Query('to') to?: string) {
    const t = to ? new Date(to) : new Date();
    const f = from ? new Date(from) : new Date(t.getTime() - 24 * 3600_000);
    return this.ops.kpis(f, t);
  }

  // ---------------- orders
  @Get('orders')
  orders(
    @Query('status') status?: string,
    @Query('q') search?: string,
    @Query('bucket') bucket?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.ops.orders({ status, search, bucket, limit: Math.min(200, Number(limit) || 50), offset: Number(offset) || 0 });
  }

  @Get('orders/:id')
  order(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.orderDetail(id, u);
  }

  @Get('orders/:id/path')
  path(@Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.orderPath(id);
  }

  @Get('orders/:id/candidates')
  candidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatch.candidatesForOps(id);
  }

  @Post('orders/:id/assign')
  @HttpCode(200)
  assign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(manualAssignSchema)) b: z.infer<typeof manualAssignSchema>, @ClientIp() ip: string) {
    return this.dispatch.manualAssign(u, id, b.driverId, b.reason, ip);
  }

  @Post('orders/:id/redispatch')
  @HttpCode(200)
  redispatch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(reasonSchema)) b: { reason: string }) {
    return this.dispatch.redispatch(u, id, b.reason);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(reasonSchema)) b: { reason: string }) {
    return this.orderService.cancel(id, { type: 'OPS', id: u.id }, b.reason);
  }

  // ---------------- drivers
  @Get('drivers')
  driverList(@Query('kyc') kyc?: string, @Query('presence') presence?: string, @Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.ops.drivers({ kyc, presence, search: q, limit: Math.min(200, Number(limit) || 50), offset: Number(offset) || 0 });
  }

  @Get('drivers/:id')
  driver(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.driverDetail(id);
  }

  @Get('drivers/:id/sensitive')
  @Auth('ADMIN')
  sensitive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    return this.drivers.sensitive(u, id, ip);
  }

  @Post('drivers/:id/kyc')
  @Auth('ADMIN')
  @HttpCode(200)
  async kyc(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zbody(z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']), note: z.string().trim().min(1).max(300) }))) b: { decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED'; note: string },
    @ClientIp() ip: string,
  ) {
    await this.drivers.kycDecision(u, id, b.decision, b.note, ip);
    return { ok: true };
  }

  @Post('drivers/:id/tier')
  @Auth('ADMIN')
  @HttpCode(200)
  async tier(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zbody(z.object({ tier: z.enum(['NEW', 'STANDARD', 'SILVER', 'GOLD', 'PRO']), reason: z.string().min(3).max(300) }))) b: { tier: string; reason: string },
  ) {
    await this.db.tx(async (c) => {
      const before = await this.db.one('SELECT tier FROM drivers WHERE id = $1 FOR UPDATE', [id], c);
      await this.db.query('UPDATE drivers SET tier = $2, updated_at = now() WHERE id = $1', [id, b.tier], c);
      await this.audit.log({ actor: u, action: 'driver.tier', entityType: 'driver', entityId: id, before, after: { tier: b.tier }, reason: b.reason }, c);
    });
    return { ok: true };
  }

  @Post('drivers/:id/adjust-earnings')
  @Auth('ADMIN')
  @HttpCode(200)
  async adjust(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zbody(z.object({ amountSatang: z.number().int().min(-1_000_000).max(1_000_000), reason: z.string().min(3).max(300), orderId: z.string().uuid().optional() }))) b: { amountSatang: number; reason: string; orderId?: string },
  ) {
    await this.earnings.adjust(u, id, b.amountSatang, b.reason, b.orderId);
    return { ok: true };
  }

  // ---------------- pricing / GP / zones / settings (ADMIN)
  @Get('pricing-rules')
  pricingRules() {
    return this.cfgAdmin.listPricing();
  }

  @Post('pricing-rules')
  @Auth('ADMIN')
  createPricing(@CurrentUser() u: AuthUser, @Body(zbody(withReason(pricingRuleSchema))) b: { data: PricingRuleInput; reason?: string }) {
    return this.cfgAdmin.createPricing(u, b.data, b.reason);
  }

  @Put('pricing-rules/:id')
  @Auth('ADMIN')
  updatePricing(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(withReason(pricingRuleSchema))) b: { data: PricingRuleInput; reason?: string }) {
    return this.cfgAdmin.updatePricing(u, id, b.data, b.reason);
  }

  @Get('commission-rules')
  commissionRules() {
    return this.cfgAdmin.listCommission();
  }

  @Post('commission-rules')
  @Auth('ADMIN')
  createCommission(@CurrentUser() u: AuthUser, @Body(zbody(withReason(commissionRuleSchema))) b: { data: CommissionRuleInput; reason?: string }) {
    return this.cfgAdmin.createCommission(u, b.data, b.reason);
  }

  @Put('commission-rules/:id')
  @Auth('ADMIN')
  updateCommission(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(withReason(commissionRuleSchema))) b: { data: CommissionRuleInput; reason?: string }) {
    return this.cfgAdmin.updateCommission(u, id, b.data, b.reason);
  }

  @Get('zones')
  zoneList() {
    return this.zones.list();
  }

  @Post('zones')
  @Auth('ADMIN')
  createZone(@CurrentUser() u: AuthUser, @Body(zbody(zoneSchema)) b: ZoneInput) {
    return this.zones.create(b, u);
  }

  @Put('zones/:id')
  @Auth('ADMIN')
  updateZone(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(zoneSchema)) b: ZoneInput) {
    return this.zones.update(id, b, u);
  }

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @Auth('ADMIN')
  putSettings(@CurrentUser() u: AuthUser, @Body(zbody(withReason(settingsSchema))) b: { data: PlatformSettings; reason?: string }) {
    return this.settings.update(b.data, u, b.reason);
  }

  @Get('surge')
  surgeList() {
    return this.surge.list();
  }

  @Get('surge/history')
  surgeHistory() {
    return this.surge.history();
  }

  @Post('surge/override')
  @Auth('ADMIN')
  @HttpCode(200)
  async surgeOverride(
    @CurrentUser() u: AuthUser,
    @Body(zbody(z.object({ zoneId: z.string().uuid(), vehicleType: z.enum(['MOTORCYCLE', 'CAR', 'PICKUP', 'VAN']), milli: z.number().int(), untilMinutes: z.number().int().min(5).max(1440).nullable(), reason: z.string().min(3).max(300) })))
    b: { zoneId: string; vehicleType: VehicleType; milli: number; untilMinutes: number | null; reason: string },
  ) {
    await this.surge.setManual(b, u);
    return { ok: true };
  }

  // ---------------- risk / support / audit
  @Get('risk-events')
  riskEvents(@Query('status') status?: string) {
    return this.risk.list(status);
  }

  @Post('risk-events/:id/review')
  @HttpCode(200)
  async reviewRisk(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zbody(z.object({ decision: z.enum(['REVIEWED', 'DISMISSED', 'ACTIONED']), note: z.string().min(1).max(300) }))) b: { decision: 'REVIEWED' | 'DISMISSED' | 'ACTIONED'; note: string },
  ) {
    await this.risk.review(id, b.decision, b.note, u);
    return { ok: true };
  }

  @Get('support-cases')
  supportCases(@Query('status') status?: string) {
    return this.db.query(
      `SELECT s.*, o.order_no FROM support_cases s LEFT JOIN orders o ON o.id = s.order_id
        WHERE ($1::text IS NULL OR s.status = $1) ORDER BY s.created_at DESC LIMIT 200`,
      [status ?? null],
    );
  }

  @Post('support-cases')
  createCase(
    @CurrentUser() u: AuthUser,
    @Body(zbody(z.object({ orderId: z.string().uuid().optional(), category: z.string().min(2).max(60), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'), description: z.string().min(3).max(2000) })))
    b: { orderId?: string; category: string; priority: string; description: string },
  ) {
    return this.db.one(
      `INSERT INTO support_cases (order_id, opened_by, category, priority, description) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [b.orderId ?? null, u.id, b.category, b.priority, b.description],
    );
  }

  @Post('support-cases/:id')
  @HttpCode(200)
  async updateCase(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zbody(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']), resolution: z.string().max(2000).optional() }))) b: { status: string; resolution?: string },
  ) {
    await this.db.query(
      `UPDATE support_cases SET status = $2, resolution = coalesce($3, resolution), assigned_to = coalesce(assigned_to, $4), updated_at = now() WHERE id = $1`,
      [id, b.status, b.resolution ?? null, u.id],
    );
    return { ok: true };
  }

  @Post('pod/:id/amend')
  @Auth('ADMIN')
  @HttpCode(200)
  amendPod(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zbody(z.object({ changes: z.record(z.unknown()), reason: z.string().min(3).max(300) }))) b: { changes: Record<string, unknown>; reason: string },
  ) {
    return this.cfgAdmin.amendPod(u, id, b.changes, b.reason);
  }

  @Get('audit-logs')
  @Auth('ADMIN')
  auditLogs(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('actorId') actorId?: string) {
    return this.cfgAdmin.auditLogs({ entityType, entityId, actorId, limit: 200 });
  }
}
