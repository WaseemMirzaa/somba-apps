import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { errorFr, errorFrList } from './error-fr';

/**
 * Global: an HTTP error body keeps the shape Nest gives it (`{ statusCode, message, error }`, plus whatever fields a
 * custom exception adds) and gains `messageFr` when the dictionary knows `message` (a string, or a list of strings
 * when all of them are known). Only `HttpException`s are caught; anything else goes through Nest's own handling.
 * Registered through `APP_FILTER`; Nest never applies global filters to gateways, so this is HTTP only (socket acks get
 * their `errorFr` in `SocketIoAdapter.bindMessageHandlers`).
 */
@Catch(HttpException)
export class ErrorFrFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : { statusCode: status, message: raw };
    if (body.messageFr === undefined) {
      const fr = Array.isArray(body.message) ? errorFrList(body.message) : errorFr(body.message);
      if (fr !== null) body.messageFr = fr;
    }
    if (res.headersSent) return;
    res.status(status).json(body);
  }
}
