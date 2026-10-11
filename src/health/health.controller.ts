import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { HealthService } from 'src/health/health.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Get('health')
  @Public()
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  async ready() {
    const result = await this.service.readiness();
    if (!result.ready) throw new ServiceUnavailableException(result);
    return result;
  }
}

