import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { normalizeMediaResponse } from 'src/files/media-reference.util';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown): unknown => {
        if (data && typeof data === 'object' && 'success' in data) {
          return normalizeMediaResponse(data);
        }

        return {
          success: true,
          data: normalizeMediaResponse(data),
        };
      }),
    );
  }
}
