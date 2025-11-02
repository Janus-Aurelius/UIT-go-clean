import { GRPC_SERVICE } from '@uit-go/shared-client';
import {
  AcceptTripRequest,
  CreateTripRequest,
  TripId,
  TripServiceClient,
} from '@uit-go/shared-types';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';

@Injectable()
export class TripService implements OnModuleInit {
  private tripService: TripServiceClient;
  constructor(
    @Inject(GRPC_SERVICE.TRIP.NAME) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.tripService = this.client.getService<TripServiceClient>(
      GRPC_SERVICE.TRIP.NAME,
    );
  }

  createTrip(data: CreateTripRequest) {
    return this.tripService.createTrip(data);
  }

  getTripById(id: string) {
    const tripId: TripId = { id };
    return this.tripService.getTripById(tripId);
  }

  cancelTrip(id: string) {
    const tripId: TripId = { id };
    return this.tripService.cancelTrip(tripId);
  }

  acceptTrip(id: string, driverId: string) {
    const acceptTripRequest: AcceptTripRequest = { id, driverId };
    return this.tripService.acceptTrip(acceptTripRequest);
  }

  startTrip(id: string) {
    const tripId: TripId = { id };
    return this.tripService.startTrip(tripId);
  }

  completeTrip(id: string) {
    const tripId: TripId = { id };
    return this.tripService.completeTrip(tripId);
  }
}
