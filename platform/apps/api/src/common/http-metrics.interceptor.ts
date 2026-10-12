import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const end = this.metrics.httpLatency.startTimer();
    const route = req.route?.path ?? 'unknown';
    const done = () => end({ method: req.method, route, status: String(res.statusCode) });
    return next.handle().pipe(tap({ next: done, error: () => end({ method: req.method, route, status: 'error' }) }));
  }
}
