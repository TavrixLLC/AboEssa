import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { PERMISSIONS_KEY } from 'src/common/decorators/permissions.decorator';
import { AppException } from 'src/common/exceptions/app.exception';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user || user.role === undefined) {
      throw new AppException('Admin permissions are required', 'PERMISSIONS_REQUIRED', 403);
    }

    if (user.role === AdminRole.OWNER || user.isOwner) {
      return true;
    }

    const permissions = new Set(user.permissions ?? []);
    const allowed = required.every((permission) => permissions.has(permission));
    if (!allowed) {
      throw new AppException('You do not have permission to perform this action', 'INSUFFICIENT_PERMISSIONS', 403);
    }

    return true;
  }
}
