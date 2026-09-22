import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { configureApp } from './setup';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(config.port);
}

void bootstrap();
