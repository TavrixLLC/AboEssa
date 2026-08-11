import { SetMetadata } from '@nestjs/common';
import { TokenType } from 'src/common/enums/token-type.enum';

export const TOKEN_TYPES_KEY = 'tokenTypes';
export const TokenTypes = (...types: TokenType[]) => SetMetadata(TOKEN_TYPES_KEY, types);

