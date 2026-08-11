import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TokenTypes } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { successEnvelopeSchema } from 'src/common/swagger/response-envelope.schema';
import { PermissionCatalogItemDto } from 'src/permissions/dto/permission-catalog.dto';
import { PermissionCatalogGroupDto } from 'src/permissions/dto/permission-catalog.dto';
import { PERMISSIONS_CATALOG } from 'src/permissions/permissions.catalog';

@ApiTags('Permissions')
@ApiBearerAuth()
@ApiExtraModels(PermissionCatalogGroupDto, PermissionCatalogItemDto)
@Controller('admin/permissions')
@UseGuards(JwtAccessGuard)
@TokenTypes(TokenType.Admin)
export class PermissionsController {
  @Get('catalog')
  @ApiOperation({ summary: 'Get the admin permissions catalog' })
  @ApiOkResponse({ schema: successEnvelopeSchema([PermissionCatalogGroupDto]) })
  catalog() {
    return PERMISSIONS_CATALOG;
  }
}
