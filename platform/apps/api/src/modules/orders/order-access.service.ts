import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { DbService } from '../../common/db.service';

@Injectable()
export class OrderAccessService {
  constructor(private readonly db: DbService) {}

  /** Customers see their own orders, drivers the ones they are/were assigned to, ops everything. */
  async canView(user: AuthUser, orderId: string): Promise<boolean> {
    if (user.role === 'OPS' || user.role === 'ADMIN') return true;
    if (user.role === 'CUSTOMER') {
      return !!(await this.db.one('SELECT 1 FROM orders WHERE id = $1 AND customer_id = $2', [orderId, user.id]));
    }
    if (user.role === 'DRIVER') {
      return !!(await this.db.one(
        `SELECT 1 FROM orders WHERE id = $1 AND driver_id = $2
          UNION SELECT 1 FROM dispatch_offers WHERE order_id = $1 AND driver_id = $2 AND status IN ('PENDING','ACCEPTED')`,
        [orderId, user.id],
      ));
    }
    return false;
  }
}
