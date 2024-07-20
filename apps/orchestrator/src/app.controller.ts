import { InjectQueue } from '@nestjs/bull';
import { Controller, Get } from '@nestjs/common';
import { Queue } from 'bull';

@Controller()
export class AppController {
  constructor(@InjectQueue('publisher') private readonly queue: Queue) {}

  @Get()
  getHello() {
    return 'Hello World!';
  }

  @Get('trigger')
  triggerJobs() {
    return this.queue.add('create-song');
  }
}
