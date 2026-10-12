import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  arriveSchema,
  driverDocumentSchema,
  driverProfileSchema,
  DriverProfileInput,
  locationBatchSchema,
  presenceSchema,
  stopEvidenceSchema,
  StopEvidence,
  vehicleSchema,
  VehicleInput,
} from '@ship/shared';
import { z } from 'zod';
import { Auth, AuthUser, CurrentUser, RateLimit } from '../../common/auth';
import { zbody } from '../../common/zod';
import { DeliveryService } from '../delivery/delivery.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { EarningsService, Period } from '../earnings/earnings.service';
import { TrackingService } from '../tracking/tracking.service';
import { DriversService } from './drivers.service';

/** Everything the driver app calls. All routes require the DRIVER role. */
@Controller('driver')
@Auth('DRIVER')
export class DriversController {
  constructor(
    private readonly drivers: DriversService,
    private readonly dispatch: DispatchService,
    private readonly delivery: DeliveryService,
    private readonly earnings: EarningsService,
    private readonly tracking: TrackingService,
  ) {}

  // ---- profile / KYC
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.drivers.me(u.id);
  }

  @Put('profile')
  profile(@CurrentUser() u: AuthUser, @Body(zbody(driverProfileSchema)) body: DriverProfileInput) {
    return this.drivers.updateProfile(u.id, body);
  }

  @Post('vehicles')
  vehicle(@CurrentUser() u: AuthUser, @Body(zbody(vehicleSchema)) body: VehicleInput) {
    return this.drivers.addVehicle(u.id, body);
  }

  @Post('documents')
  document(@CurrentUser() u: AuthUser, @Body(zbody(driverDocumentSchema)) body: z.infer<typeof driverDocumentSchema>) {
    return this.drivers.addDocument(u.id, body.kind, body.fileKey);
  }

  @Post('kyc/submit')
  @HttpCode(200)
  submitKyc(@CurrentUser() u: AuthUser) {
    return this.drivers.submitKyc(u.id);
  }

  // ---- presence / GPS
  @Post('presence')
  @HttpCode(200)
  presence(@CurrentUser() u: AuthUser, @Body(zbody(presenceSchema)) body: z.infer<typeof presenceSchema>) {
    return this.drivers.setPresence(u.id, body.online, body.location);
  }

  /** Batched pings from the background location task. */
  @Post('location')
  @RateLimit('gps', 120, 60)
  @HttpCode(200)
  location(@CurrentUser() u: AuthUser, @Body(zbody(locationBatchSchema)) body: z.infer<typeof locationBatchSchema>) {
    return this.tracking.ingest(u.id, body.pings);
  }

  // ---- job offers
  @Get('offers')
  offers(@CurrentUser() u: AuthUser) {
    return this.dispatch.currentOffers(u.id);
  }

  @Post('offers/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.dispatch.accept(u, id);
  }

  @Post('offers/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(z.object({ reason: z.string().max(200).optional() }))) body: { reason?: string }) {
    return this.dispatch.decline(u, id, body.reason);
  }

  // ---- delivery workflow
  @Get('orders/active')
  active(@CurrentUser() u: AuthUser) {
    return this.delivery.activeOrder(u);
  }

  @Get('orders/history')
  history(@CurrentUser() u: AuthUser) {
    return this.delivery.history(u);
  }

  @Post('orders/:id/arrive-pickup')
  @HttpCode(200)
  arrivePickup(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(arriveSchema)) body: z.infer<typeof arriveSchema>) {
    return this.delivery.arrivePickup(u, id, body);
  }

  @Post('orders/:id/pickup')
  @HttpCode(200)
  pickup(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(stopEvidenceSchema)) body: StopEvidence) {
    return this.delivery.confirmPickup(u, id, body);
  }

  @Post('orders/:id/stops/:stopId/arrive')
  @HttpCode(200)
  arriveStop(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body(zbody(arriveSchema)) body: z.infer<typeof arriveSchema>,
  ) {
    return this.delivery.arriveStop(u, id, stopId, body);
  }

  @Post('orders/:id/stops/:stopId/complete')
  @HttpCode(200)
  completeStop(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body(zbody(stopEvidenceSchema)) body: StopEvidence,
  ) {
    return this.delivery.completeStop(u, id, stopId, body);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(z.object({ reason: z.string().trim().min(3).max(300) }))) body: { reason: string }) {
    return this.delivery.driverCancel(u, id, body.reason);
  }

  // ---- earnings
  @Get('earnings')
  earningsSummary(@CurrentUser() u: AuthUser, @Query('period') period: Period = 'today') {
    const p: Period = ['today', 'week', 'month'].includes(period) ? period : 'today';
    return this.earnings.summary(u.id, p);
  }

  @Get('earnings/items')
  earningsItems(@CurrentUser() u: AuthUser, @Query('before') before?: string) {
    return this.earnings.items(u.id, 50, before);
  }
}
