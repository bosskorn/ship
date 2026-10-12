import { Injectable } from '@nestjs/common';
import { QueueService } from '../common/queue.service';
import { DispatchService } from './dispatch/dispatch.service';
import { DriversService } from './drivers/drivers.service';
import { OrdersService } from './orders/orders.service';
import { SurgeService } from './pricing/surge.service';

/** Background jobs that keep the marketplace consistent. */
@Injectable()
export class MaintenanceService {
  constructor(
    queue: QueueService,
    surge: SurgeService,
    dispatch: DispatchService,
    drivers: DriversService,
    orders: OrdersService,
  ) {
    queue.handle('maintenance', 'surge-tick', () => surge.tick());
    queue.handle('maintenance', 'sweep', async () => {
      await dispatch.sweepStuck();
      await drivers.sweepStalePresence();
    });
    queue.handle('maintenance', 'scheduled-dispatch', (d) => orders.startScheduled(d.orderId));
    queue.every('maintenance', 'surge-tick', 60_000);
    queue.every('maintenance', 'sweep', 30_000);
  }
}
