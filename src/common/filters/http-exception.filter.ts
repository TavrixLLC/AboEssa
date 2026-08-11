import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

type ErrorBody = {
  message?: string | string[];
  code?: string;
  error?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const { status, message, code } = this.normalizeException(exception);

    response.status(status).json({
      success: false,
      error: message,
      code,
      requestId: request.requestId ?? response.getHeader('x-request-id') ?? 'unknown',
    });
  }

  private normalizeException(exception: unknown) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as string | ErrorBody;
      if (typeof body === 'string') {
        return { status, message: body, code: this.statusToCode(status) };
      }

      const rawMessage = body.message ?? body.error ?? exception.message;
      const message = Array.isArray(rawMessage) ? rawMessage.join('; ') : rawMessage;
      return {
        status,
        message,
        code: body.code ?? this.statusToCode(status),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record was not found',
          code: 'NOT_FOUND',
        };
      }
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with the same unique value already exists',
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }

  private statusToCode(status: number) {
    const labels: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    };
    return labels[status] ?? 'HTTP_ERROR';
  }
}
