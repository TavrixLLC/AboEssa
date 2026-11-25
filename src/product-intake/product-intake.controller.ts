import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { inventoryError } from 'src/inventory/inventory-ledger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { PERMISSIONS as P } from 'src/common/constants/permissions.constants';
import { UploadedImageFile } from 'src/uploads/uploads.service';
import {
  IntakeCreateDto,
  IntakeImageDto,
  IntakeListDto,
  IntakePatchDto,
  IntakeRevisionDto,
} from './product-intake.dto';
import { ProductIntakeService } from './product-intake.service';

@Injectable()
export class IntakeEnabledGuard implements CanActivate {
  constructor(private readonly intake: ProductIntakeService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const expected = request.headers['x-intake-actor'];
    if (expected && expected !== request.user.id)
      inventoryError(
        'INTAKE_ACTOR_CHANGED',
        'The signed-in employee changed; do not replay another employee draft',
        403,
      );
    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    this.intake.assertEnabled();
    return true;
  }
}
@ApiTags('Rapid product intake')
@ApiBearerAuth()
@Controller('admin/product-intake')
@UseGuards(JwtAccessGuard, PermissionsGuard, IntakeEnabledGuard)
@TokenTypes(TokenType.Admin)
@Permissions(P.INTAKE_USE)
export class ProductIntakeController {
  constructor(private readonly intake: ProductIntakeService) {}
  @Post('sessions') create(@Body() dto: IntakeCreateDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.intake.create(dto, actor);
  }
  @Get('sessions') list(@Query() q: IntakeListDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.intake.list(q, actor);
  }
  @Get('sessions/:id') one(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.intake.one(id, actor);
  }
  @Patch('sessions/:id') patch(
    @Param('id') id: string,
    @Body() dto: IntakePatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.intake.patch(id, dto, actor);
  }
  @Post('sessions/:id/image')
  @ApiConsumes('multipart/form-data')
  @Permissions(P.INTAKE_USE, P.PRODUCTS_UPLOAD_IMAGES)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 128 },
    }),
  )
  upload(
    @Param('id') id: string,
    @Body() dto: IntakeImageDto,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.intake.upload(id, dto, file, actor);
  }
  @Get('sessions/:id/preview') preview(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.intake.preview(id, actor);
  }
  @Post('sessions/:id/retry-media')
  @Permissions(P.INTAKE_USE, P.PRODUCTS_UPLOAD_IMAGES)
  retryMedia(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.intake.retryMedia(id, actor);
  }
  @Post('sessions/:id/submit') submit(
    @Param('id') id: string,
    @Body() dto: IntakeRevisionDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.intake.submit(id, dto, key, actor);
  }
  @Get('submissions/:key') submission(
    @Param('key') key: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.intake.submission(key, actor);
  }
  @Post('sessions/:id/cancel') cancel(
    @Param('id') id: string,
    @Body() dto: IntakeRevisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.intake.cancel(id, dto, actor);
  }
}
