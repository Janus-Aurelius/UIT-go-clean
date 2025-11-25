import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  GRPC_SERVICE,
  DriverServiceClient,
  UserServiceClient,
} from '@uit-go/shared-client';
import {
  CreateTripRequest,
  TripResponse,
  NearbyQuery,
  UpdateStatusRequest,
  DriverStatusEnum,
  UserId,
} from '@uit-go/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TripService implements OnModuleInit {
  private driverService: DriverServiceClient;
  private userService: UserServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GRPC_SERVICE.DRIVER.NAME) private readonly driverClient: ClientGrpc,
    @Inject(GRPC_SERVICE.USER.NAME) private readonly userClient: ClientGrpc
  ) {}

  onModuleInit() {
    this.driverService = this.driverClient.getService<DriverServiceClient>(
      GRPC_SERVICE.DRIVER.NAME
    );
    this.userService = this.userClient.getService<UserServiceClient>(
      GRPC_SERVICE.USER.NAME
    );
  }

  async createTrip(data: CreateTripRequest): Promise<TripResponse> {
    // Step 1: Create the trip with location data
    const trip = await this.prisma.trip.create({
      data: {
        userId: data.userId,
        pickupLatitude: data.pickupLatitude,
        pickupLongitude: data.pickupLongitude,
        destinationLatitude: data.destinationLatitude,
        destinationLongitude: data.destinationLongitude,
      },
    });

    // Step 2: Find nearest available driver
    try {
      const nearbyDriversQuery: NearbyQuery = {
        latitude: data.pickupLatitude,
        longitude: data.pickupLongitude,
        radiusKm: 5, // 5km radius
        count: 1, // Get the nearest driver
      };

      console.log(
        'TripService - About to call searchNearbyDrivers with:',
        JSON.stringify(nearbyDriversQuery, null, 2)
      );
      console.log('TripService - Individual field values:');
      console.log(
        '  latitude:',
        nearbyDriversQuery.latitude,
        typeof nearbyDriversQuery.latitude
      );
      console.log(
        '  longitude:',
        nearbyDriversQuery.longitude,
        typeof nearbyDriversQuery.longitude
      );
      console.log(
        '  radiusKm:',
        nearbyDriversQuery.radiusKm,
        typeof nearbyDriversQuery.radiusKm
      );
      console.log(
        '  count:',
        nearbyDriversQuery.count,
        typeof nearbyDriversQuery.count
      );

      const nearbyDriversResponse = await firstValueFrom(
        this.driverService.searchNearbyDrivers(nearbyDriversQuery)
      );

      if (nearbyDriversResponse.list && nearbyDriversResponse.list.length > 0) {
        const nearestDriverId = nearbyDriversResponse.list[0].driverId;

        // Step 3: Assign driver to trip
        const updatedTrip = await this.acceptTrip(trip.id, nearestDriverId);

        // Step 4: Update driver status to busy
        const updateStatusRequest: UpdateStatusRequest = {
          driverId: nearestDriverId,
          status: DriverStatusEnum.BUSY,
        };

        await firstValueFrom(
          this.driverService.updateStatus(updateStatusRequest)
        );

        // Step 5: Get driver info and location for response
        const driverProfile = await firstValueFrom(
          this.driverService.getDriver({ userId: nearestDriverId })
        );

        // Step 6: Update trip with driver location
        const finalTrip = await this.prisma.trip.update({
          where: { id: updatedTrip.id },
          data: {
            driverLatitude: driverProfile.lastLat,
            driverLongitude: driverProfile.lastLng,
          },
        });

        return {
          id: finalTrip.id,
          userId: finalTrip.userId,
          driverId: finalTrip.driverId,
          status: finalTrip.status,
          pickupLatitude: data.pickupLatitude,
          pickupLongitude: data.pickupLongitude,
          destinationLatitude: data.destinationLatitude,
          destinationLongitude: data.destinationLongitude,
          driverLatitude: finalTrip.driverLatitude,
          driverLongitude: finalTrip.driverLongitude,
          driverInfo: {
            name: driverProfile.name,
            phone: driverProfile.phone,
            vehicleType: driverProfile.vehicleType,
            licensePlate: driverProfile.licensePlate,
            rating: driverProfile.rating,
          },
        };
      } else {
        // No drivers available, return trip in FINDING_DRIVER status
        return {
          id: trip.id,
          userId: trip.userId,
          driverId: trip.driverId,
          status: trip.status,
          pickupLatitude: data.pickupLatitude,
          pickupLongitude: data.pickupLongitude,
          destinationLatitude: data.destinationLatitude,
          destinationLongitude: data.destinationLongitude,
          driverLatitude: null,
          driverLongitude: null,
        };
      }
    } catch (error) {
      console.error('Error finding or assigning driver:', error);
      // Return trip in FINDING_DRIVER status if driver assignment fails
      return {
        id: trip.id,
        userId: trip.userId,
        driverId: trip.driverId,
        status: trip.status,
        pickupLatitude: data.pickupLatitude,
        pickupLongitude: data.pickupLongitude,
        destinationLatitude: data.destinationLatitude,
        destinationLongitude: data.destinationLongitude,
        driverLatitude: null,
        driverLongitude: null,
      };
    }
  }

  async getTripById(id: string): Promise<TripResponse | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
    });

    if (!trip) {
      return null;
    }

    let driverInfo = undefined;

    // If trip has a driver assigned, get driver information
    if (trip.driverId) {
      try {
        const driverProfile = await firstValueFrom(
          this.driverService.getDriver({ userId: trip.driverId })
        );

        driverInfo = {
          name: driverProfile.name,
          phone: driverProfile.phone,
          vehicleType: driverProfile.vehicleType,
          licensePlate: driverProfile.licensePlate,
          rating: driverProfile.rating,
        };
      } catch (error) {
        console.error('Error fetching driver info:', error);
      }
    }

    return {
      id: trip.id,
      userId: trip.userId,
      driverId: trip.driverId,
      status: trip.status,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
      destinationLatitude: trip.destinationLatitude,
      destinationLongitude: trip.destinationLongitude,
      driverLatitude: trip.driverLatitude,
      driverLongitude: trip.driverLongitude,
      driverInfo,
    };
  }

  async cancelTrip(id: string) {
    const trip = await this.prisma.trip.update({
      where: { id },
      data: { status: 'CANCELED' },
    });

    // Update driver status back to online when trip is canceled
    if (trip.driverId) {
      try {
        const updateStatusRequest: UpdateStatusRequest = {
          driverId: trip.driverId,
          status: DriverStatusEnum.ONLINE,
        };

        await firstValueFrom(
          this.driverService.updateStatus(updateStatusRequest)
        );
      } catch (error) {
        console.error('Error updating driver status to online:', error);
      }
    }

    return trip;
  }

  async acceptTrip(id: string, driverId: string) {
    return this.prisma.trip.update({
      where: { id },
      data: { status: 'DRIVER_ACCEPTED', driverId },
    });
  }

  async startTrip(id: string) {
    return this.prisma.trip.update({
      where: { id },
      data: { status: 'ONGOING' },
    });
  }

  async completeTrip(id: string) {
    const trip = await this.prisma.trip.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    // Release driver: Update driver status back to ONLINE when trip is completed
    // The driver service will now accept location updates again since status is ONLINE
    // This allows the driver to move to a new location after completing the trip
    if (trip.driverId) {
      try {
        const updateStatusRequest: UpdateStatusRequest = {
          driverId: trip.driverId,
          status: DriverStatusEnum.ONLINE,
        };

        await firstValueFrom(
          this.driverService.updateStatus(updateStatusRequest)
        );

        console.log(`Driver ${trip.driverId} released and set to ONLINE. Can now accept location updates.`);
      } catch (error) {
        console.error('Error updating driver status to online:', error);
      }
    }

    return trip;
  }

  async getTrips(request: {
    userId?: string;
    driverId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    trips: TripResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = request.page || 1;
    const limit = request.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (request.userId) where.userId = request.userId;
    if (request.driverId) where.driverId = request.driverId;
    if (request.status) where.status = request.status;

    const [trips, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.trip.count({ where }),
    ]);

    const tripsWithDriverInfo = await Promise.all(
      trips.map(async (trip) => {
        let driverInfo = undefined;

        if (trip.driverId) {
          try {
            const driverProfile = await firstValueFrom(
              this.driverService.getDriver({ userId: trip.driverId })
            );

            driverInfo = {
              name: driverProfile.name,
              phone: driverProfile.phone,
              vehicleType: driverProfile.vehicleType,
              licensePlate: driverProfile.licensePlate,
              rating: driverProfile.rating,
            };
          } catch (error) {
            console.error('Error fetching driver info:', error);
          }
        }

        return {
          id: trip.id,
          userId: trip.userId,
          driverId: trip.driverId,
          status: trip.status,
          pickupLatitude: trip.pickupLatitude,
          pickupLongitude: trip.pickupLongitude,
          destinationLatitude: trip.destinationLatitude,
          destinationLongitude: trip.destinationLongitude,
          driverLatitude: trip.driverLatitude,
          driverLongitude: trip.driverLongitude,
          driverInfo,
        };
      })
    );

    return {
      trips: tripsWithDriverInfo,
      total,
      page,
      limit,
    };
  }

  async updateTrip(request: {
    id: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
  }): Promise<TripResponse> {
    const updateData: any = {};

    if (request.destinationLatitude !== undefined)
      updateData.destinationLatitude = request.destinationLatitude;
    if (request.destinationLongitude !== undefined)
      updateData.destinationLongitude = request.destinationLongitude;

    const trip = await this.prisma.trip.update({
      where: {
        id: request.id,
      },
      data: updateData,
    });

    let driverInfo = undefined;

    if (trip.driverId) {
      try {
        const driverProfile = await firstValueFrom(
          this.driverService.getDriver({ userId: trip.driverId })
        );

        driverInfo = {
          name: driverProfile.name,
          phone: driverProfile.phone,
          vehicleType: driverProfile.vehicleType,
          licensePlate: driverProfile.licensePlate,
          rating: driverProfile.rating,
        };
      } catch (error) {
        console.error('Error fetching driver info:', error);
      }
    }

    return {
      id: trip.id,
      userId: trip.userId,
      driverId: trip.driverId,
      status: trip.status,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
      destinationLatitude: trip.destinationLatitude,
      destinationLongitude: trip.destinationLongitude,
      driverLatitude: trip.driverLatitude,
      driverLongitude: trip.driverLongitude,
      driverInfo,
    };
  }

  async findNearestDriver(tripId: string): Promise<string | null> {
    // Get trip details to get location
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip || !trip.pickupLatitude || !trip.pickupLongitude) {
      console.error(`Trip ${tripId} not found or missing location data`);
      return null;
    }

    try {
      const nearbyDriversQuery: NearbyQuery = {
        latitude: trip.pickupLatitude,
        longitude: trip.pickupLongitude,
        radiusKm: 5, // 5km radius
        count: 1, // Get the nearest driver
      };

      const nearbyDriversResponse = await firstValueFrom(
        this.driverService.searchNearbyDrivers(nearbyDriversQuery)
      );

      if (nearbyDriversResponse.list && nearbyDriversResponse.list.length > 0) {
        return nearbyDriversResponse.list[0].driverId;
      }

      return null;
    } catch (error) {
      console.error('Error finding nearest driver:', error);
      return null;
    }
  }
}
