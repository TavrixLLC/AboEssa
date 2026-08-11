import { AdminRole, ActorType } from '@prisma/client';
import { TokenType } from 'src/common/enums/token-type.enum';

export interface AuthenticatedUser {
  id: string;
  type: TokenType;
  actorType: ActorType;
  role?: AdminRole;
  permissions?: string[];
  tokenVersion?: number;
  sessionId?: string;
  isOwner?: boolean;
  mustChangePassword?: boolean;
  status?: string;
}

export interface JwtAccessPayload {
  sub: string;
  type: TokenType;
  role?: AdminRole;
  permissions?: string[];
  tokenVersion?: number;
  sessionId?: string;
}
