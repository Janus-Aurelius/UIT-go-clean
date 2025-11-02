import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { GRPC_SERVICE, tripGrpcOptions } from '@uit-go/shared-client';
import { TripController } from './trip.controller';
import { TripService } from './trip.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: GRPC_SERVICE.TRIP.NAME,
        useFactory: async () => {
          return {
            ...tripGrpcOptions,
          };
        },
      },
    ]),
  ],
  controllers: [TripController],
  providers: [TripService],
  exports: [],
})
export class TripModule {}
