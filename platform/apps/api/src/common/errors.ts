import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InvalidTransitionError } from '@ship/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';

/** Domain error with a stable machine-readable code for clients. */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const NotFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`, 404);
export const Forbidden = (msg = 'Forbidden') => new AppError('FORBIDDEN', msg, 403);
export const Conflict = (code: string, msg: string, details?: unknown) => new AppError(code, msg, 409, details);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof ZodError) {
      res.status(400).json({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Invalid request', details: exception.flatten() });
      return;
    }
    if (exception instanceof InvalidTransitionError) {
      res.status(409).json({ statusCode: 409, code: 'INVALID_TRANSITION', message: exception.message });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : (body as any).message ?? exception.message;
      res.status(status).json({ statusCode: status, code: HttpStatus[status] ?? 'ERROR', message });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ statusCode: 500, code: 'INTERNAL', message: 'Internal server error' });
  }
}
