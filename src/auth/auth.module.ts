import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SecurityModule } from 'src/common/security/security.module';
import { TokenService } from 'src/auth/token.service';

@Global()
@Module({
  imports: [JwtModule.register({}), SecurityModule],
  providers: [TokenService],
  exports: [JwtModule, TokenService, SecurityModule],
})
export class AuthModule {}
