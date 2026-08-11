import { Controller, Get } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { successEnvelopeSchema } from 'src/common/swagger/response-envelope.schema';
import { ServerTimeDto } from 'src/time/dto/server-time.dto';

@ApiTags('Time')
@ApiExtraModels(ServerTimeDto)
@Controller('time')
export class TimeController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Get current backend server time' })
  @ApiOkResponse({ schema: successEnvelopeSchema(ServerTimeDto) })
  now() {
    return { serverTime: new Date().toISOString() };
  }
}
