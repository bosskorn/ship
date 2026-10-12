import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { cancelOrderSchema, createOrderSchema, CreateOrderInput, rateOrderSchema, quoteRequestSchema, QuoteRequestInput } from '@ship/shared';
import { z } from 'zod';
import { Auth, AuthUser, CurrentUser, RateLimit } from '../../common/auth';
import { DbService } from '../../common/db.service';
import { Forbidden } from '../../common/errors';
import { zbody } from '../../common/zod';
import { PaymentsService } from '../payments/payments.service';
import { QuotesService } from '../quotes/quotes.service';
import { TrackingService } from '../tracking/tracking.service';
import { OrderAccessService } from './order-access.service';
import { OrderViewService } from './order-view.service';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly quotes: QuotesService,
    private readonly views: OrderViewService,
    private readonly access: OrderAccessService,
    private readonly payments: PaymentsService,
    private readonly tracking: TrackingService,
    private readonly db: DbService,
  ) {}

  @Post('quotes')
  @Auth('CUSTOMER')
  @RateLimit('quote', 30, 60)
  @HttpCode(200)
  quote(@CurrentUser() user: AuthUser, @Body(zbody(quoteRequestSchema)) body: QuoteRequestInput) {
    return this.quotes.quote(user.id, body);
  }

  @Post('orders')
  @Auth('CUSTOMER')
  @RateLimit('order-create', 10, 60)
  create(@CurrentUser() user: AuthUser, @Body(zbody(createOrderSchema)) body: CreateOrderInput) {
    return this.orders.createFromQuote(user, body);
  }

  @Get('orders')
  @Auth('CUSTOMER')
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: 'active' | 'past',
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.orders.list(user, { status, limit: Math.min(50, Number(limit) || 20), before });
  }

  @Get('orders/:id')
  @Auth()
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.access.canView(user, id))) throw Forbidden();
    return this.views.view(id, user);
  }

  @Get('orders/:id/timeline')
  @Auth()
  async timeline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.access.canView(user, id))) throw Forbidden();
    return this.views.timeline(id);
  }

  @Get('orders/:id/tracking')
  @Auth()
  async trackingSnapshot(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.access.canView(user, id))) throw Forbidden();
    return this.tracking.orderSnapshot(id);
  }

  @Get('orders/:id/payment')
  @Auth('CUSTOMER')
  async payment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.access.canView(user, id))) throw Forbidden();
    return this.payments.latest(id);
  }

  @Post('orders/:id/cancel')
  @Auth('CUSTOMER')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(cancelOrderSchema)) body: { reason: string }) {
    return this.orders.cancel(id, { type: 'CUSTOMER', id: user.id }, body.reason);
  }

  @Post('orders/:id/rate')
  @Auth('CUSTOMER')
  @HttpCode(200)
  rate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zbody(rateOrderSchema)) body: z.infer<typeof rateOrderSchema>) {
    return this.orders.rate(user, id, body);
  }

  /** Home screen: recent pickup/drop-off locations derived from order history. */
  @Get('me/recent-locations')
  @Auth('CUSTOMER')
  recentLocations(@CurrentUser() user: AuthUser) {
    return this.db.query(
      `SELECT DISTINCT ON (s.address) s.address, s.building, s.contact_name, s.contact_phone,
              ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng, o.created_at
         FROM order_stops s JOIN orders o ON o.id = s.order_id
        WHERE o.customer_id = $1
        ORDER BY s.address, o.created_at DESC
        LIMIT 10`,
      [user.id],
    );
  }
}
