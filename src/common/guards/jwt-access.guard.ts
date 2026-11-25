import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ActorType, AdminRole, CustomerStatus } from '@prisma/client';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';
import { ALLOW_MANDATORY_PASSWORD_CHANGE } from 'src/common/decorators/mandatory-password-change.decorator';
import { TOKEN_TYPES_KEY } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { AppException } from 'src/common/exceptions/app.exception';
import { AuthenticatedUser, JwtAccessPayload } from 'src/common/types/authenticated-user.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractBearerToken(request);
    const payload = await this.verifyByType(token);

    const allowedTypes = this.reflector.getAllAndOverride<TokenType[]>(TOKEN_TYPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowedTypes?.length && !allowedTypes.includes(payload.type)) {
      throw new AppException(
        'Token type is not allowed for this endpoint',
        'TOKEN_TYPE_FORBIDDEN',
        HttpStatus.FORBIDDEN,
      );
    }

    request.user = await this.resolveUser(payload);
    if (
      request.user.type === TokenType.Admin &&
      request.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_MANDATORY_PASSWORD_CHANGE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new AppException(
        'Password change is required before using administrative endpoints',
        'STAFF_MUST_CHANGE_PASSWORD',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }

  private extractBearerToken(request: Request) {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({ message: 'Missing bearer token', code: 'MISSING_TOKEN' });
    }
    return token;
  }

  private async verifyByType(token: string): Promise<JwtAccessPayload> {
    const decoded: unknown = this.jwtService.decode(token);
    const untrusted = this.isPartialJwtAccessPayload(decoded) ? decoded : undefined;
    const secret = this.getSecretForType(untrusted?.type);
    if (!secret) {
      throw new UnauthorizedException({
        message: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE',
      });
    }

    try {
      return await this.jwtService.verifyAsync<JwtAccessPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException({
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }
  }

  private isPartialJwtAccessPayload(value: unknown): value is Partial<JwtAccessPayload> {
    return typeof value === 'object' && value !== null;
  }

  private getSecretForType(type?: TokenType) {
    if (type === TokenType.Admin) {
      return process.env.JWT_ADMIN_ACCESS_SECRET;
    }
    if (type === TokenType.Customer) {
      return process.env.JWT_CUSTOMER_ACCESS_SECRET;
    }
    return undefined;
  }

  private async resolveUser(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    if (payload.type === TokenType.Admin) {
      const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (!admin || !admin.isActive || admin.status !== 'ACTIVE') {
        throw new UnauthorizedException({
          message: 'Admin account is inactive or locked',
          code: admin?.status === 'LOCKED' ? 'STAFF_LOCKED' : 'ADMIN_INACTIVE',
        });
      }
      if (payload.tokenVersion !== admin.tokenVersion) {
        throw new UnauthorizedException({
          message: 'Token has been revoked',
          code: 'TOKEN_REVOKED',
        });
      }
      if (payload.sessionId) {
        const session = await this.prisma.adminSession.findFirst({
          where: {
            id: payload.sessionId,
            adminUserId: admin.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (!session) {
          throw new UnauthorizedException({
            message: 'Session has been revoked',
            code: 'SESSION_REVOKED',
          });
        }
      }
      return {
        id: admin.id,
        type: TokenType.Admin,
        actorType: ActorType.ADMIN,
        role: admin.role,
        permissions:
          admin.role === AdminRole.OWNER || admin.isOwner
            ? undefined
            : await this.permissionResolver.forAdmin(admin.id),
        tokenVersion: admin.tokenVersion,
        sessionId: payload.sessionId,
        isOwner: admin.isOwner || admin.role === AdminRole.OWNER,
        mustChangePassword: admin.mustChangePassword,
        status: admin.status,
      };
    }

    if (payload.type === TokenType.Customer) {
      const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
      if (!customer || customer.status === CustomerStatus.BLOCKED) {
        throw new UnauthorizedException({
          message: 'Customer account is blocked',
          code: 'CUSTOMER_BLOCKED',
        });
      }
      return {
        id: customer.id,
        type: TokenType.Customer,
        actorType: ActorType.CUSTOMER,
      };
    }

    throw new UnauthorizedException({ message: 'Invalid token type', code: 'INVALID_TOKEN_TYPE' });
  }
}
