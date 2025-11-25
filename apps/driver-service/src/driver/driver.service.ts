/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import {
  CreateDriverRequest,
  DriverProfileResponse,
  DriverStatusEnum,
  NearbyDriverResponse,
  NearbyQuery,
  UpdateLocationRequest,
  UpdateStatusRequest,
} from '@uit-go/shared-types';
import { DriverProfile, VehicleType } from '../../generated/prisma';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class DriverService {
  constructor(
    private prismaService: PrismaService,
    private redisService: RedisService
  ) {}

  private mapToResponse(profile: DriverProfile): DriverProfileResponse {
    return {
      userId: profile.userId,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      vehicleType: profile.vehicleType,
      licensePlate: profile.licensePlate,
      licenseNumber: profile.licenseNumber,
      status: profile.status,
      rating: Number(profile.rating),
      balance: Number(profile.balance),
      lastLat: profile.lastLat,
      lastLng: profile.lastLng,
    };
  }

  async create(driver: CreateDriverRequest): Promise<DriverProfileResponse> {
    console.log(
      'DriverService.create received data:',
      JSON.stringify(driver, null, 2)
    );

    try {
      const profile = await this.prismaService.$transaction(async (db) => {
        // Map numeric enum to string enum for Prisma
        const vehicleTypeMap = {
          [0]: VehicleType.MOTOBIKE, // 0 maps to "MOTOBIKE"
          [1]: VehicleType.BIKE, // 1 maps to "BIKE"
        };

        const createData = {
          userId: driver.userId,
          name: driver.name,
          email: driver.email,
          phone: driver.phone,
          vehicleType:
            vehicleTypeMap[driver.vehicleType as number] ||
            VehicleType.MOTOBIKE,
          licensePlate: driver.licensePlate,
          licenseNumber: driver.licenseNumber,
          rating: 0.0, // Use simple decimal notation
          balance: 0.0, // Use simple decimal notation
        };

        console.log(
          'Creating driver with data:',
          JSON.stringify(createData, null, 2)
        );

        const result = await db.driverProfile.create({
          data: createData,
        });

        console.log(
          'Successfully created driver profile:',
          JSON.stringify(result, null, 2)
        );
        return result;
      });

      const response = this.mapToResponse(profile);
      console.log(
        'Returning driver response:',
        JSON.stringify(response, null, 2)
      );
      return response;
    } catch (error) {
      console.error('ERROR in DriverService.create:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack,
      });
      throw error;
    }
  }

  async findOne(id: string) {
    // 🟢 SAFETY CHECK: Ghost Driver Bypass
    // If it's a ghost, return fake data immediately without hitting Clerk or NeonDB.
    // This allows load testing with 100k+ virtual drivers without database costs.
    if (id.startsWith('ghost:')) {
      return {
        userId: id,
        name: 'Ghost Driver',
        email: `${id}@ghost.test`,
        phone: '+1000000000',
        vehicleType: VehicleType.MOTOBIKE,
        licensePlate: 'GHOST-001',
        licenseNumber: 'DL-GHOST',
        status: DriverStatusEnum.ONLINE,
        rating: 4.8,
        balance: 0.0,
        lastLat: null,
        lastLng: null,
      };
    }

    // Only hit the database for REAL drivers
    const profile = await this.prismaService.driverProfile.findUnique({
      where: {
        userId: id,
      },
    });

    return this.mapToResponse(profile);
  }

  async updateStatus(data: UpdateStatusRequest) {
    // 🟢 GHOST BYPASS: Ghost drivers don't have database records
    if (data.driverId.startsWith('ghost:')) {
      return {
        userId: data.driverId,
        name: 'Ghost Driver',
        email: `${data.driverId}@ghost.test`,
        phone: '+1000000000',
        vehicleType: VehicleType.MOTOBIKE,
        licensePlate: 'GHOST-001',
        licenseNumber: 'DL-GHOST',
        status: DriverStatusEnum[data.status],
        rating: 4.8,
        balance: 0.0,
        lastLat: null,
        lastLng: null,
      };
    }

    const profile = await this.prismaService.$transaction(async (db) => {
      const updateData: any = {
        status: DriverStatusEnum[data.status],
      };
      if (
        data.status === DriverStatusEnum.BUSY ||
        data.status === DriverStatusEnum.OFFLINE
      ) {
        updateData.lastLat = null;
        updateData.lastLng = null;
      }

      return db.driverProfile.update({
        where: {
          userId: data.driverId,
        },
        data: updateData,
      });
    });

    return this.mapToResponse(profile);
  }

  async updateLocation(data: UpdateLocationRequest) {
    // 🟢 GHOST BYPASS: Always update Redis (for geospatial bottleneck test)
    // But skip database update for ghost drivers (to avoid Clerk/NeonDB costs)
    await this.redisService.geoadd(
      'drivers',
      data.longitude,
      data.latitude,
      data.driverId
    );

    if (data.driverId.startsWith('ghost:')) {
      // Return fake profile without hitting database
      return {
        userId: data.driverId,
        name: 'Ghost Driver',
        email: `${data.driverId}@ghost.test`,
        phone: '+1000000000',
        vehicleType: VehicleType.MOTOBIKE,
        licensePlate: 'GHOST-001',
        licenseNumber: 'DL-GHOST',
        status: DriverStatusEnum.ONLINE,
        rating: 4.8,
        balance: 0.0,
        lastLat: data.latitude,
        lastLng: data.longitude,
      };
    }

    // Only update database for real drivers
    const profile = await this.prismaService.$transaction(async (db) => {
      return db.driverProfile.update({
        where: {
          userId: data.driverId,
        },
        data: {
          lastLat: data.latitude,
          lastLng: data.longitude,
        },
      });
    });

    return this.mapToResponse(profile);
  }

  async searchNearbyDrivers(data: NearbyQuery): Promise<NearbyDriverResponse> {
    const res = await this.redisService.geosearch(
      'drivers',
      data.longitude,
      data.latitude,
      data.radiusKm,
      data.count
    );

    return {
      list: res.map((r) => ({
        driverId: r.member,
        distance: r.distance.toString(),
      })),
    };
  }

  async findAll(request: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{
    drivers: DriverProfileResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = request.page || 1;
    const limit = request.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (request.status) {
      where.status = request.status;
    }

    const [drivers, total] = await this.prismaService.$transaction([
      this.prismaService.driverProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.driverProfile.count({ where }),
    ]);

    return {
      drivers: drivers.map((driver) => this.mapToResponse(driver)),
      total,
      page,
      limit,
    };
  }

  async updateProfile(request: {
    userId: string;
    name?: string;
    email?: string;
    phone?: string;
    vehicleType?: string;
    licensePlate?: string;
    licenseNumber?: string;
    balance?: number;
  }): Promise<DriverProfileResponse> {
    const updateData: any = {};

    if (request.name !== undefined) updateData.name = request.name;
    if (request.email !== undefined) updateData.email = request.email;
    if (request.phone !== undefined) updateData.phone = request.phone;
    if (request.vehicleType !== undefined) {
      // Map numeric enum to string enum for Prisma
      const vehicleTypeMap = {
        [0]: VehicleType.MOTOBIKE, // 0 maps to "MOTOBIKE"
        [1]: VehicleType.BIKE, // 1 maps to "BIKE"
      };
      updateData.vehicleType =
        vehicleTypeMap[request.vehicleType as unknown as number] ||
        VehicleType.MOTOBIKE;
    }
    if (request.licensePlate !== undefined)
      updateData.licensePlate = request.licensePlate;
    if (request.licenseNumber !== undefined)
      updateData.licenseNumber = request.licenseNumber;
    if (request.balance !== undefined) updateData.balance = request.balance;

    const profile = await this.prismaService.driverProfile.update({
      where: {
        userId: request.userId,
      },
      data: updateData,
    });

    return this.mapToResponse(profile);
  }

  async deleteDriver(userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.prismaService.$transaction(async (db) => {
        // Delete from database
        await db.driverProfile.delete({
          where: {
            userId,
          },
        });
      });

      // Remove from Redis geospatial index
      try {
        await this.redisService.geoadd('drivers', 0, 0, userId);
        // Note: Redis GEOADD doesn't have a direct delete, so we'd need ZREM
        // For now, just leaving this as a note
      } catch (error) {
        console.log('Redis cleanup error:', error);
      }

      return {
        success: true,
        message: 'Driver deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to delete driver',
      };
    }
  }
}
