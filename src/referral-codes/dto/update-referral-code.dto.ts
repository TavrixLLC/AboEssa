import { PartialType } from '@nestjs/mapped-types';
import { CreateReferralCodeDto } from 'src/referral-codes/dto/create-referral-code.dto';

export class UpdateReferralCodeDto extends PartialType(CreateReferralCodeDto) {}

