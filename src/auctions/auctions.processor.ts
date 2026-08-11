import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AUCTION_CLOSE_QUEUE } from 'src/auctions/auction-queue.constants';
import { AuctionsService } from 'src/auctions/auctions.service';

@Processor(AUCTION_CLOSE_QUEUE)
export class AuctionsProcessor extends WorkerHost {
  constructor(private readonly auctionsService: AuctionsService) {
    super();
  }

  async process(job: Job<{ auctionId: string }>) {
    await this.auctionsService.closeAuction(job.data.auctionId);
  }
}

