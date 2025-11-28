/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;
  private isConnected = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.logger.log(`Initializing Redis client: ${redisUrl}`);

    this.client = createClient({
      url: redisUrl,
    });

    // Error event handler
    this.client.on('error', (err) => {
      this.logger.error(`Redis Client Error: ${err.message}`, err.stack);
      this.isConnected = false;
    });

    // Connect event handler
    this.client.on('connect', () => {
      this.logger.log('Redis client connected successfully');
      this.isConnected = true;
    });

    // Ready event handler
    this.client.on('ready', () => {
      this.logger.log('Redis client ready to accept commands');
    });

    // Reconnecting event handler
    this.client.on('reconnecting', () => {
      this.logger.warn('Redis client reconnecting...');
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.logger.log('✅ Redis connection established');
    } catch (error) {
      this.logger.error(
        `❌ Failed to connect to Redis: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.client.disconnect();
      this.logger.log('Redis client disconnected');
    }
  }

  async geoadd(key: string, lon: number, lat: number, member: string) {
    return this.client.geoAdd(key, [{ longitude: lon, latitude: lat, member }]);
  }

  async geopos(key: string, member: string) {
    return this.client.geoPos(key, member);
  }

  async geosearch(
    key: string,
    lon: number,
    lat: number,
    radiusKm: number,
    count?: number
  ) {
    const options: any = { SORT: 'ASC' };
    if (count && count > 0) {
      options.COUNT = count;
    }

    const results = await this.client.geoSearchWith(
      key,
      { longitude: lon, latitude: lat },
      { radius: radiusKm, unit: 'km' },
      ['WITHDIST'],
      options
    );
    return results.map((r) => ({
      member: r.member,
      distance: parseFloat(r.distance),
    }));
  }

  /**
   * Large geosearch for pre-tuning bottleneck testing
   *
   * Fetches a large number of drivers (up to maxCount) to demonstrate
   * the Redis GEOSEARCH bottleneck when searching through 100k+ ghost drivers.
   *
   * In pre-tuning mode, this creates:
   * - Network bottleneck (transferring large result sets)
   * - Redis CPU bottleneck (sorting/filtering large datasets)
   * - App CPU bottleneck (in-memory filtering)
   *
   * Post-tuning with H3 will avoid this by partitioning data into small cells.
   */
  async geosearchLarge(
    key: string,
    lon: number,
    lat: number,
    radiusKm: number,
    maxCount: number = 1000
  ) {
    const options: any = { SORT: 'ASC' };
    if (maxCount && maxCount > 0) {
      options.COUNT = maxCount;
    }

    this.logger.debug(
      `Fetching up to ${maxCount} drivers from Redis (pre-tuning bottleneck test)`
    );

    const startTime = Date.now();
    const results = await this.client.geoSearchWith(
      key,
      { longitude: lon, latitude: lat },
      { radius: radiusKm, unit: 'km' },
      ['WITHDIST'],
      options
    );
    const duration = Date.now() - startTime;

    this.logger.debug(
      `Redis GEOSEARCH completed: ${results.length} drivers in ${duration}ms`
    );

    return results.map((r) => ({
      member: r.member,
      distance: parseFloat(r.distance),
    }));
  }

  // ========================================================================
  // H3 Virtual Sharding Methods
  // ========================================================================

  /**
   * Add driver to H3 smart bucket with rating as score
   */
  async h3AddDriver(
    bucketKey: string,
    driverId: string,
    rating: number,
    metadata: { lat: number; lng: number; hex: string; shard: number }
  ): Promise<void> {
    const multi = this.client.multi();

    // Add to sorted set (rating as score)
    multi.zAdd(bucketKey, { score: rating, value: driverId });
    multi.expire(bucketKey, 30); // 30s TTL

    // Store metadata
    const metaKey = `driver:${driverId}:h3meta`;
    multi.hSet(metaKey, {
      lat: metadata.lat.toString(),
      lng: metadata.lng.toString(),
      hex: metadata.hex,
      shard: metadata.shard.toString(),
      rating: rating.toString(),
      updated: Date.now().toString(),
    });
    multi.expire(metaKey, 30);

    await multi.exec();
  }

  /**
   * Remove driver from old H3 bucket
   */
  async h3RemoveDriver(oldBucketKey: string, driverId: string): Promise<void> {
    await this.client.zRem(oldBucketKey, driverId);
  }

  /**
   * Get driver's current H3 metadata
   */
  async h3GetDriverMeta(driverId: string): Promise<{
    lat: number;
    lng: number;
    hex: string;
    shard: number;
    rating: number;
    updated: number;
  } | null> {
    const metaKey = `driver:${driverId}:h3meta`;
    const data = await this.client.hGetAll(metaKey);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      hex: data.hex,
      shard: parseInt(data.shard),
      rating: parseFloat(data.rating),
      updated: parseInt(data.updated),
    };
  }

  /**
   * Query multiple H3 buckets in parallel
   * Returns top N drivers from each bucket (sorted by rating DESC)
   */
  async h3GetTopDriversFromBuckets(
    bucketKeys: string[],
    topN: number = 10
  ): Promise<Map<string, Array<{ driverId: string; rating: number }>>> {
    if (bucketKeys.length === 0) return new Map();

    const multi = this.client.multi();

    for (const bucketKey of bucketKeys) {
      // Use zRangeWithScores for proper typing
      multi.zRangeWithScores(bucketKey, 0, topN - 1, { REV: true });
    }

    const results = await multi.exec();
    const driversByBucket = new Map();

    for (let i = 0; i < bucketKeys.length; i++) {
      const bucketKey = bucketKeys[i];
      const rawResult = results[i];

      if (!rawResult || !Array.isArray(rawResult) || rawResult.length === 0) {
        driversByBucket.set(bucketKey, []);
        continue;
      }

      const drivers = [];
      // zRangeWithScores returns array of {value, score} objects
      for (const item of rawResult as Array<{ value: string; score: number }>) {
        drivers.push({
          driverId: item.value,
          rating: item.score,
        });
      }

      driversByBucket.set(bucketKey, drivers);
    }

    return driversByBucket;
  }

  /**
   * Batch get driver metadata
   */
  async h3GetDriverMetaBatch(
    driverIds: string[]
  ): Promise<Map<string, { lat: number; lng: number; rating: number }>> {
    if (driverIds.length === 0) return new Map();

    const multi = this.client.multi();

    for (const driverId of driverIds) {
      const metaKey = `driver:${driverId}:h3meta`;
      multi.hGetAll(metaKey);
    }

    const results = await multi.exec();
    const metadataMap = new Map();

    for (let i = 0; i < driverIds.length; i++) {
      const driverId = driverIds[i];
      const data = results[i];

      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        const dataObj = data as any;
        metadataMap.set(driverId, {
          lat: parseFloat(dataObj.lat),
          lng: parseFloat(dataObj.lng),
          rating: parseFloat(dataObj.rating),
        });
      }
    }

    return metadataMap;
  }
}
