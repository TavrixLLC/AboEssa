import { PartialType } from '@nestjs/mapped-types';
import { CreateInfluencerDto } from 'src/influencers/dto/create-influencer.dto';

export class UpdateInfluencerDto extends PartialType(CreateInfluencerDto) {}

