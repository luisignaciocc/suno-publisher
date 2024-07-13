import { NestFactory } from '@nestjs/core';
import * as basicAuth from 'express-basic-auth';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    '/dashboard',
    basicAuth({
      users: { admin: '1234' },
      challenge: true,
    }),
  );
  await app.listen(4000);
}
bootstrap();
