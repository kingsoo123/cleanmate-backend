import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';
import { PushService } from './push.service';

@Controller('push-tokens')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  register(@CurrentUser() user: User, @Body() dto: RegisterPushTokenDto) {
    return this.push.register(user, dto);
  }

  @Delete()
  @HttpCode(204)
  async unregister(
    @CurrentUser() user: User,
    @Body() dto: UnregisterPushTokenDto,
  ) {
    await this.push.unregister(user, dto);
  }
}
