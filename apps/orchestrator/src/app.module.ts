import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppConsumer } from './app.consumer';
import { AppController } from './app.controller';
import { AppProducer } from './app.producer';
@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: 'redis',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'publisher',
    }),
    BullBoardModule.forRoot({
      route: '/dashboard',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'publisher',
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [AppController],
  providers: [AppProducer, AppConsumer],
  exports: [],
})
export class AppModule {}
