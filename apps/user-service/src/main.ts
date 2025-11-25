import { userGrpcOptions } from '@uit-go/shared-client';
/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  try {
    console.log('Starting User Service...');
    console.log('__dirname:', __dirname);
    // console.log('userGrpcOptions:', JSON.stringify(userGrpcOptions, null, 2));

    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
      AppModule,
      {
        ...userGrpcOptions,
      }
    );
    await app.listen();

    Logger.log(`🚀 User Microservice is running successfully!`);
  } catch (error) {
    console.error('Error starting User Service:', error);
    process.exit(1);
  }
}

bootstrap();
