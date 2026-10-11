import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { CustomerStatus, ScreenStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessPayload } from 'src/common/types/authenticated-user.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { PasswordService } from 'src/common/security/password.service';

type AuthedSocket = Socket & {
  data: SocketData;
};

type SocketData = {
  user?: {
    id: string;
    type: TokenType;
  };
};

type SocketCorsCallback = (error: Error | null, allow?: boolean) => void;

function allowConfiguredSocketOrigin(origin: string | undefined, callback: SocketCorsCallback) {
  // Native Android clients normally send no browser Origin header.
  if (!origin) {
    callback(null, true);
    return;
  }

  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowDevelopmentWildcard =
    process.env.NODE_ENV !== 'production' && configured.includes('*');

  callback(null, allowDevelopmentWildcard || configured.includes(origin));
}

@WebSocketGateway({ cors: { origin: allowConfiguredSocketOrigin, credentials: true } })
export class SocketsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketsGateway.name);

  constructor(
    private readonly socketsService: SocketsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  afterInit(server: Server) {
    this.socketsService.bindServer(server);
  }

  async handleConnection(client: AuthedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.verifyToken(token);
      await this.joinDefaultRooms(client, payload, token);
      this.getData(client).user = { id: payload.sub, type: payload.type };
    } catch (error) {
      this.logger.debug(`Socket auth failed: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join_screen_room')
  async joinScreenRoom(@ConnectedSocket() client: AuthedSocket) {
    if (this.getData(client).user?.type === TokenType.Screen) {
      await client.join('screens');
    }
  }

  private extractToken(client: Socket) {
    const auth = client.handshake.auth as Record<string, unknown>;
    const authToken = auth.token;
    if (typeof authToken === 'string') {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    const [scheme, token] = header?.split(' ') ?? [];
    return scheme === 'Bearer' ? token : undefined;
  }

  private async verifyToken(token: string): Promise<JwtAccessPayload> {
    const decoded: unknown = this.jwtService.decode(token);
    const untrusted = this.isPartialJwtAccessPayload(decoded) ? decoded : undefined;
    const secret = this.secretForType(untrusted?.type);
    if (!secret) {
      throw new Error('Invalid socket token type');
    }
    return this.jwtService.verifyAsync<JwtAccessPayload>(token, { secret });
  }

  private isPartialJwtAccessPayload(value: unknown): value is Partial<JwtAccessPayload> {
    return typeof value === 'object' && value !== null;
  }

  private getData(client: Socket): SocketData {
    return client.data as SocketData;
  }

  private secretForType(type?: TokenType) {
    if (type === TokenType.Admin) {
      return this.config.get<string>('jwt.adminAccessSecret');
    }
    if (type === TokenType.Customer) {
      return this.config.get<string>('jwt.customerAccessSecret');
    }
    if (type === TokenType.Screen) {
      return this.config.get<string>('jwt.screenAccessSecret');
    }
    return undefined;
  }

  private async joinDefaultRooms(client: Socket, payload: JwtAccessPayload, token: string) {
    if (payload.type === TokenType.Admin) {
      const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (
        !admin?.isActive ||
        admin.status !== 'ACTIVE' ||
        admin.tokenVersion !== payload.tokenVersion
      ) {
        throw new Error('Inactive admin socket token');
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
        if (!session) throw new Error('Revoked admin socket session');
      }
      await client.join('admins');
      return;
    }

    if (payload.type === TokenType.Customer) {
      const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
      if (!customer || customer.status === CustomerStatus.BLOCKED) {
        throw new Error('Blocked customer socket token');
      }
      await client.join('customers');
      await client.join(`customer:${customer.id}`);
      return;
    }

    const screen = await this.prisma.screenDevice.findUnique({ where: { id: payload.sub } });
    if (
      !screen ||
      !screen.isActive ||
      screen.status !== ScreenStatus.ACTIVE ||
      screen.tokenVersion !== payload.tokenVersion ||
      screen.tokenHash === 'pending-pairing-delivery' ||
      !(await this.passwordService.verify(screen.tokenHash, token))
    ) {
      throw new Error('Inactive screen socket token');
    }
    await this.prisma.screenDevice.update({
      where: { id: screen.id },
      data: { lastSeenAt: new Date() },
    });
    await client.join('screens');
    await client.join(`screen:${screen.id}`);
  }
}
