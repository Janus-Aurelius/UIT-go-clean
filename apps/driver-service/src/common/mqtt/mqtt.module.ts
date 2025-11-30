import { Global, Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [RedisModule, PrismaModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
