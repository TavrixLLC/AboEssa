import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import {
  UPLOAD_IMAGE_FOLDERS,
  UploadImageDto,
  UploadImageResultDto,
} from 'src/uploads/dto/upload-image.dto';
import { UploadedImageFile, UploadsService } from 'src/uploads/uploads.service';

@ApiTags('Uploads')
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @TokenTypes(TokenType.Admin)
  @Permissions(PERMISSIONS.PRODUCTS_UPLOAD_IMAGES)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload an admin image for products, auctions, ads, customers, or labels',
  })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: UploadImageResultDto })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', enum: [...UPLOAD_IMAGE_FOLDERS], example: 'products' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: UploadImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.uploadsService.uploadImage(file, dto, user.id);
  }
}
