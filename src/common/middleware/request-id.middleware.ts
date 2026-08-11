import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from 'src/common/constants/app.constants';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming?.trim() || randomUUID();
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}

