import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { TripService } from './trip.service';
import {
  CreateTripRequest,
  TripId,
  AcceptTripRequest,
} from '@uit-go/shared-types';
import { GRPC_SERVICE } from '@uit-go/shared-client';

@Controller()
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.CREATE)
  async createTrip(data: CreateTripRequest) {
    // The createTrip method now handles the complete flow:
    // 1. Creates trip with location data
    // 2. Finds nearest driver
    // 3. Assigns driver to trip
    // 4. Updates driver status to busy
    // 5. Returns trip with driver info
    return await this.tripService.createTrip(data);
  }

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.DETAIL)
  getTripById(data: TripId) {
    return this.tripService.getTripById(data.id);
  }

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.CANCEL)
  cancelTrip(data: TripId) {
    return this.tripService.cancelTrip(data.id);
  }

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.ACCEPT)
  acceptTrip(data: AcceptTripRequest) {
    return this.tripService.acceptTrip(data.id, data.driverId);
  }

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.START)
  startTrip(data: TripId) {
    return this.tripService.startTrip(data.id);
  }

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.COMPLETE)
  completeTrip(data: TripId) {
    return this.tripService.completeTrip(data.id);
  }

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.LIST)
  getTrips(data: {
    userId?: string;
    driverId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return this.tripService.getTrips(data);
  }

  @GrpcMethod(GRPC_SERVICE.TRIP.NAME, GRPC_SERVICE.TRIP.METHODS.UPDATE)
  updateTrip(data: {
    id: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
  }) {
    return this.tripService.updateTrip(data);
  }
}
