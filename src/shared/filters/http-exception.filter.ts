import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { env } from '../env.schema';
import { logger } from '../services/Logger';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  errors?: unknown;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errors: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const body = exceptionResponse as Record<string, unknown>;
        message = (body.message as string | string[]) ?? message;
        errors = body.errors;
      }
    } else if (exception instanceof Error) {
      message =
        env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception.message;

      logger.error('Unhandled exception', {
        path: request.url,
        message: exception.message,
        stack: exception.stack,
      });
    }

    const body: ErrorResponseBody = {
      statusCode,
      message,
      ...(errors !== undefined ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (statusCode >= 500) {
      logger.error('HTTP 5xx response', { ...body });
    }

    response.status(statusCode).json(body);
  }
}
