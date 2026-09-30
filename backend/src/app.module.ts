import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ToeicModule } from './toeic/toeic.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ToeicModule],
  controllers: [HealthController],
})
export class AppModule {}
