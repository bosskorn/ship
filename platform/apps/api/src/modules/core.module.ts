import { Module } from '@nestjs/common';
import { CustomersController } from './customers/customers.controller';
import { DeliveryService } from './delivery/delivery.service';
import { DispatchService } from './dispatch/dispatch.service';
import { DriversController } from './drivers/drivers.controller';
import { DriversService } from './drivers/drivers.service';
import { HealthController } from './health/health.controller';
import { MaintenanceService } from './maintenance.service';
import { ConfigAdminService } from './ops/config-admin.service';
import { OpsController } from './ops/ops.controller';
import { OpsService } from './ops/ops.service';
import { AssignmentService } from './orders/assignment.service';
import { OrderAccessService } from './orders/order-access.service';
import { OrderStateService } from './orders/order-state.service';
import { OrderViewService } from './orders/order-view.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { QuotesService } from './quotes/quotes.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { RealtimeListener } from './realtime/realtime.listener';

/**
 * Marketplace core: order lifecycle, quoting, dispatch, delivery workflow and operations.
 * Kept in one Nest module for the MVP (a modular monolith); folder boundaries mirror the
 * services they would be split into later (order, dispatch, tracking, ops...).
 */
@Module({
  controllers: [OrdersController, CustomersController, DriversController, OpsController, HealthController],
  providers: [
    OrderStateService,
    OrderAccessService,
    OrderViewService,
    AssignmentService,
    OrdersService,
    QuotesService,
    DispatchService,
    DeliveryService,
    DriversService,
    OpsService,
    ConfigAdminService,
    MaintenanceService,
    RealtimeGateway,
    RealtimeListener,
  ],
})
export class CoreModule {}
