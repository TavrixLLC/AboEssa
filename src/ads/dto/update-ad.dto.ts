import { PartialType } from '@nestjs/mapped-types';
import { CreateAdDto } from 'src/ads/dto/create-ad.dto';

export class UpdateAdDto extends PartialType(CreateAdDto) {}
