import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bull';

@Injectable()
export class AppProducer {
  constructor(
    @InjectQueue('scrobbler')
    private readonly queue: Queue,
  ) {}
  private readonly logger = new Logger(AppProducer.name);

  @Cron(CronExpression.EVERY_DAY_AT_2PM, {
    name: 'scrobble',
  })
  async scrobble() {
    this.queue.add(
      'scrobble',
      {},
      {
        repeat: {
          every: 1000 * 60 * 60 * 24,
        },
      },
    );
  }
}
