import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

interface LocationUpdate {
  driverId: string;
  latitude: number;
  longitude: number;
  timestamp?: number;
}

@Injectable()
export class MqttService implements OnModuleInit {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);
  private readonly TOPIC = 'driver/location/+'; // Subscribe to all driver location updates

  constructor(
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService
  ) {}

  async onModuleInit() {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883';

    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId: `driver-service-${Math.random().toString(16).slice(3)}`,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
      });

      this.client.on('connect', () => {
        this.logger.log(`Connected to MQTT broker at ${brokerUrl}`);
        this.client.subscribe(this.TOPIC, (err) => {
          if (err) {
            this.logger.error(`Failed to subscribe to ${this.TOPIC}:`, err);
          } else {
            this.logger.log(`Subscribed to topic: ${this.TOPIC}`);
          }
        });
      });

      this.client.on('message', async (topic, message) => {
        try {
          await this.handleLocationUpdate(topic, message);
        } catch (error) {
          this.logger.error(`Error processing MQTT message:`, error);
        }
      });

      this.client.on('error', (error) => {
        this.logger.error('MQTT connection error:', error);
      });

      this.client.on('offline', () => {
        this.logger.warn('MQTT client is offline');
      });

      this.client.on('reconnect', () => {
        this.logger.log('Reconnecting to MQTT broker...');
      });
    } catch (error) {
      this.logger.error('Failed to initialize MQTT client:', error);
    }
  }

  private async handleLocationUpdate(topic: string, message: Buffer) {
    try {
      const payload: LocationUpdate = JSON.parse(message.toString());
      const { driverId, latitude, longitude } = payload;

      if (!driverId || latitude === undefined || longitude === undefined) {
        this.logger.warn('Invalid location update payload:', payload);
        return;
      }

      this.logger.debug(
        `Received location update for driver ${driverId}: (${latitude}, ${longitude})`
      );

      // Update PostgreSQL
      await this.prismaService.driverProfile.update({
        where: { userId: driverId },
        data: {
          lastLat: latitude,
          lastLng: longitude,
          updatedAt: new Date(),
        },
      });

      // Update Redis geospatial index
      await this.redisService.geoadd('drivers', longitude, latitude, driverId);

      this.logger.debug(`Location updated for driver ${driverId}`);
    } catch (error) {
      this.logger.error('Failed to process location update:', error);
    }
  }

  async publish(topic: string, message: string | object): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload =
        typeof message === 'string' ? message : JSON.stringify(message);
      this.client.publish(topic, payload, (error) => {
        if (error) {
          this.logger.error(`Failed to publish to ${topic}:`, error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.client.end(false, {}, () => {
        this.logger.log('MQTT client disconnected');
        resolve();
      });
    });
  }
}
