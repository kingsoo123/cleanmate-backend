import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserPushToken } from '../entities/user-push-token.entity';
import { FcmService } from './fcm.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserPushToken]), AuthModule],
  controllers: [PushController],
  providers: [FcmService, PushService],
  exports: [PushService],
})
export class PushModule {}
