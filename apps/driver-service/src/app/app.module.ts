import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DriverModule } from '../driver/driver.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { RedisModule } from '../common/redis/redis.module';
import { MqttModule } from '../common/mqtt/mqtt.module';
import { H3Module } from '../common/h3/h3.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DriverModule,
    PrismaModule,
    RedisModule,
    MqttModule,
    H3Module,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
