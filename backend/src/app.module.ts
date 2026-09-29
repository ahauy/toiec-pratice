import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ToeicModule } from './toeic/toeic.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ToeicModule],
})
export class AppModule {}
