import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { envSchema } from './config/env';
import { DatabaseModule } from './db/database.module';
import { RemindersModule } from './reminders/reminders.module';
import { SpeechModule } from './speech/speech.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
      validate: (config) => envSchema.parse(config),
    }),
    DatabaseModule,
    AuthModule,
    RemindersModule,
    SpeechModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
