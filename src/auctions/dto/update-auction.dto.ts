import { PartialType } from '@nestjs/swagger';
import { CreateAuctionDto } from 'src/auctions/dto/create-auction.dto';

export class UpdateAuctionDto extends PartialType(CreateAuctionDto) {}
