import { InjectQueue } from '@nestjs/bull';
import { Controller, Get } from '@nestjs/common';
import { Queue } from 'bull';
import { getRandomTypeBeatStyles, ProcessType } from './utils/params';

@Controller()
export class AppController {
  constructor(@InjectQueue('publisher') private readonly queue: Queue) {}

  @Get()
  getHello() {
    return 'Hello World!';
  }

  @Get('trigger')
  triggerJobs() {
    const randomProcessType =
      Object.values(ProcessType)[
        Math.floor(Math.random() * Object.values(ProcessType).length)
      ];
    const styles = getRandomTypeBeatStyles();
    return this.queue.add('create-song', {
      processType: randomProcessType,
      styles,
    });
  }
}
