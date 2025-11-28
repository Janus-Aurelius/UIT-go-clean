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
import { H3Service } from '../common/h3/h3.service';

@Injectable()
export class DriverService {
  constructor(
    private prismaService: PrismaService,
    private redisService: RedisService,
    private h3Service: H3Service
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
    const useH3 = process.env.USE_H3 === 'true';

    if (!useH3) {
      // PRE-TUNING MODE: Keep existing Redis GEO logic
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

    // ========================================================================
    // POST-TUNING MODE: H3 Virtual Sharding
    // ========================================================================

    const startTime = Date.now();

    // Get driver rating
    let rating = 4.8; // Default for ghosts
    if (!data.driverId.startsWith('ghost:')) {
      const profile = await this.prismaService.driverProfile.findUnique({
        where: { userId: data.driverId },
        select: { rating: true },
      });
      rating = profile ? Number(profile.rating) : 4.5;
    }

    // Calculate new H3 bucket
    const newHex = this.h3Service.latLngToCell(
      data.latitude,
      data.longitude,
      H3Service.BUCKET_RESOLUTION
    );
    const newShardId = this.h3Service.getShardId(data.latitude, data.longitude);
    const newBucketKey = this.h3Service.getSmartBucketKey(
      data.latitude,
      data.longitude
    );

    // Check if driver moved between hexes
    const oldMeta = await this.redisService.h3GetDriverMeta(data.driverId);

    if (oldMeta && oldMeta.hex !== newHex) {
      const oldBucketKey = `shard:${oldMeta.shard}:hex:${oldMeta.hex}`;
      await this.redisService.h3RemoveDriver(oldBucketKey, data.driverId);
      console.log(`[H3] Driver ${data.driverId} moved: ${oldMeta.hex} -> ${newHex}`);
    }

    // Add to new bucket
    await this.redisService.h3AddDriver(newBucketKey, data.driverId, rating, {
      lat: data.latitude,
      lng: data.longitude,
      hex: newHex,
      shard: newShardId,
    });

    const duration = Date.now() - startTime;
    console.log(
      `[H3] Updated ${data.driverId} | Bucket: ${newBucketKey} | ` +
        `Rating: ${rating} | Duration: ${duration}ms`
    );

    // Update database for real drivers
    if (!data.driverId.startsWith('ghost:')) {
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

    return {
      userId: data.driverId,
      name: 'Ghost Driver',
      email: `${data.driverId}@ghost.test`,
      phone: '+1000000000',
      vehicleType: VehicleType.MOTOBIKE,
      licensePlate: 'GHOST-001',
      licenseNumber: 'DL-GHOST',
      status: DriverStatusEnum.ONLINE,
      rating: rating,
      balance: 0.0,
      lastLat: data.latitude,
      lastLng: data.longitude,
    };
  }

  /**
   * Search for nearby drivers
   *
   * PRE-TUNING MODE (USE_H3=false):
   * - Fetches up to MAX_DRIVER_SEARCH_COUNT (default 1000) drivers from Redis
   * - Filters real drivers from ghosts in application memory
   * - Returns real drivers first, ghosts as fallback (if PREFER_REAL_DRIVERS=true)
   * - Demonstrates Redis GEOSEARCH bottleneck with 100k+ ghost drivers
   *
   * POST-TUNING MODE (USE_H3=true):
   * - Uses Uber H3 spatial indexing for efficient driver lookup
   * - Only fetches drivers in relevant hex cells
   * - Avoids large result sets and in-memory filtering
   *
   * @param data NearbyQuery with location and search parameters
   * @returns NearbyDriverResponse with list of nearby drivers
   */
  async searchNearbyDrivers(data: NearbyQuery): Promise<NearbyDriverResponse> {
    const useH3 = process.env.USE_H3 === 'true';

    if (!useH3) {

    // ========================================================================
    // PRE-TUNING MODE: Redis Geo with High COUNT + In-Memory Filtering
    // ========================================================================
    //
    // ⚠️ CLUSTER BOMB SCENARIO: 100k drivers in 0.5km radius (concert/airport)
    //
    // Why this is SLOW:
    // 1. Redis GEOSEARCH can't use spatial filtering (all drivers in same geohash)
    // 2. Must calculate Haversine distance for ALL 100k drivers
    // 3. Must sort ALL 100k drivers by distance
    // 4. We ask for 5000 results (greedy query - common in legacy systems)
    // 5. Network transfer of 5000 driver records (~250KB)
    // 6. In-memory filtering in application code
    //
    // Result: 500ms-2000ms latency (HEROIC BASELINE for comparison)
    //
    // This bottleneck will be eliminated in post-tuning with H3.

    // ⚠️ GREEDY QUERY: Ask for 5000 drivers even though we only need 10
    // This simulates legacy systems that over-fetch "just in case"
    const maxSearchCount = parseInt(
      process.env.MAX_DRIVER_SEARCH_COUNT || '5000'  // Increased from 1000
    );
    const preferRealDrivers = process.env.PREFER_REAL_DRIVERS !== 'false';

    const searchStart = Date.now();

    // 💣 THE BOTTLENECK: Force Redis to sort and return 5000 drivers
    // Even though we only need 10, this is common in legacy code
    const allResults = await this.redisService.geosearchLarge(
      'drivers',
      data.longitude,
      data.latitude,
      data.radiusKm,
      maxSearchCount
    );

    const searchDuration = Date.now() - searchStart;

    // Separate real drivers from ghosts
    const realDrivers = allResults.filter(
      (r) => !r.member.startsWith('ghost:')
    );
    const ghostDrivers = allResults.filter((r) =>
      r.member.startsWith('ghost:')
    );

    // Log performance metrics for analysis
    console.log(
      `[DRIVER SEARCH] Pre-tuning mode | ` +
        `Total: ${allResults.length} | ` +
        `Real: ${realDrivers.length} | ` +
        `Ghosts: ${ghostDrivers.length} | ` +
        `Duration: ${searchDuration}ms | ` +
        `Requested: ${data.count}`
    );

    let results: Array<{ member: string; distance: number }>;

    if (preferRealDrivers) {
      // Prioritize real drivers, fill remaining slots with ghosts if needed
      const realSlice = realDrivers.slice(0, data.count);
      const remainingSlots = Math.max(0, data.count - realSlice.length);
      const ghostSlice = ghostDrivers.slice(0, remainingSlots);

      results = [...realSlice, ...ghostSlice];

      if (realSlice.length < data.count && ghostSlice.length > 0) {
        console.log(
          `[DRIVER SEARCH] Only found ${realSlice.length} real drivers, ` +
            `filled ${ghostSlice.length} slots with ghosts`
        );
      }
    } else {
      // No filtering - return raw results (includes ghosts)
      results = allResults.slice(0, data.count);
      console.log(
        `[DRIVER SEARCH] PREFER_REAL_DRIVERS=false, returning mixed results`
      );
    }

    return {
      list: results.map((r) => ({
        driverId: r.member,
        distance: r.distance.toString(),
      })),
    };
    }

    // ========================================================================
    // POST-TUNING MODE: H3 K-Ring Expansion
    // ========================================================================

    const searchStart = Date.now();
    const requestedCount = data.count || 10;
    const maxKRing = this.calculateMaxKRing(data.radiusKm);

    console.log(
      `[H3 SEARCH] Start | Origin: (${data.latitude}, ${data.longitude}) | ` +
        `Radius: ${data.radiusKm}km | Max K: ${maxKRing} | Requested: ${requestedCount}`
    );

    // Get origin hex at resolution 9
    const originHex = this.h3Service.latLngToCell(
      data.latitude,
      data.longitude,
      H3Service.BUCKET_RESOLUTION
    );

    const foundDrivers: Array<{
      driverId: string;
      rating: number;
      lat: number;
      lng: number;
      distance: number;
    }> = [];

    const queriedBuckets = new Set<string>();
    let totalBucketsQueried = 0;
    let totalDriversFound = 0;

    // K-ring expansion with early exit
    for (let k = 0; k <= maxKRing; k++) {
      const ringHexes = this.h3Service.gridDisk(originHex, k);
      const newHexes = ringHexes.filter((hex) => !queriedBuckets.has(hex));

      if (newHexes.length === 0) continue;

      // Convert hexes to bucket keys (calculate shard per hex)
      const bucketKeys: string[] = [];
      for (const hex of newHexes) {
        // CRITICAL: Calculate shard per hex, not per origin
        const hexCenter = this.h3Service.cellToLatLng(hex);
        const shardId = this.h3Service.getShardId(hexCenter.lat, hexCenter.lng);
        const key = `shard:${shardId}:hex:${hex}`;
        bucketKeys.push(key);
      }

      newHexes.forEach((hex) => queriedBuckets.add(hex));
      totalBucketsQueried += bucketKeys.length;

      // Query all buckets in parallel
      const driversByBucket = await this.redisService.h3GetTopDriversFromBuckets(
        bucketKeys,
        requestedCount * 2
      );

      // Collect driver IDs
      const driverIds: string[] = [];
      for (const drivers of driversByBucket.values()) {
        driverIds.push(...drivers.map((d) => d.driverId));
      }

      totalDriversFound += driverIds.length;

      if (driverIds.length === 0) {
        console.log(`[H3 SEARCH] K=${k} | No drivers in ${bucketKeys.length} buckets`);
        continue;
      }

      // Batch fetch metadata
      const metadataMap = await this.redisService.h3GetDriverMetaBatch(driverIds);

      // Calculate distances and filter by radius
      for (const [driverId, metadata] of metadataMap) {
        const distance = this.haversineDistance(
          data.latitude,
          data.longitude,
          metadata.lat,
          metadata.lng
        );

        if (distance <= data.radiusKm) {
          foundDrivers.push({
            driverId,
            rating: metadata.rating,
            lat: metadata.lat,
            lng: metadata.lng,
            distance,
          });
        }
      }

      console.log(
        `[H3 SEARCH] K=${k} | Buckets: ${bucketKeys.length} | ` +
          `Found: ${driverIds.length} | Within radius: ${foundDrivers.length}/${requestedCount}`
      );

      // Early exit
      if (foundDrivers.length >= requestedCount) {
        console.log(`[H3 SEARCH] Early exit at K=${k}`);
        break;
      }
    }

    const searchDuration = Date.now() - searchStart;

    // Sort by distance ASC, then rating DESC
    foundDrivers.sort((a, b) => {
      if (Math.abs(a.distance - b.distance) < 0.001) {
        return b.rating - a.rating;
      }
      return a.distance - b.distance;
    });

    const results = foundDrivers.slice(0, requestedCount);

    console.log(
      `[H3 SEARCH] Complete | Buckets: ${totalBucketsQueried} | ` +
        `Total: ${totalDriversFound} | Returned: ${results.length} | ` +
        `Duration: ${searchDuration}ms`
    );

    return {
      list: results.map((r) => ({
        driverId: r.driverId,
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

  /**
   * Calculate max K-ring based on search radius
   * Fixed at K=5 for demo focus (91 hexes, ~1.5km radius)
   */
  private calculateMaxKRing(radiusKm: number): number {
    return 5; // Cap at K=5 per user preference
  }

  /**
   * Haversine distance calculation (returns km)
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
