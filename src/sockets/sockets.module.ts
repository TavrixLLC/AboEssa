import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { SocketsGateway } from 'src/sockets/sockets.gateway';
import { SocketsService } from 'src/sockets/sockets.service';

@Module({
  imports: [AuthModule],
  providers: [SocketsGateway, SocketsService],
  exports: [SocketsService],
})
export class SocketsModule {}

