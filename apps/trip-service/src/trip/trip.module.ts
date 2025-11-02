import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import {
  GRPC_SERVICE,
  userGrpcOptions,
  driverGrpcOptions,
} from '@uit-go/shared-client';
import { PrismaModule } from '../common/prisma/prisma.module';
import { TripController } from './trip.controller';
import { TripService } from './trip.service';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: GRPC_SERVICE.USER.NAME,
        useFactory: async () => ({
          ...userGrpcOptions,
        }),
      },
      {
        name: GRPC_SERVICE.DRIVER.NAME,
        useFactory: async () => ({
          ...driverGrpcOptions,
        }),
      },
    ]),
  ],
  controllers: [TripController],
  providers: [TripService],
})
export class TripModule {}
