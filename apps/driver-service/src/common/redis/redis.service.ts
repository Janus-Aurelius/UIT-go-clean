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
}
