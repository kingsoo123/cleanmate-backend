import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserPushToken } from '../entities/user-push-token.entity';
import { User } from '../users/user.entity';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';
import { FcmPayload, FcmService } from './fcm.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(UserPushToken)
    private readonly tokens: Repository<UserPushToken>,
    private readonly fcm: FcmService,
    private readonly config: ConfigService,
  ) {}

  async register(user: User, dto: RegisterPushTokenDto) {
    const platform = dto.platform ?? 'web';
    const existing = await this.tokens.findOne({
      where: { token: dto.token },
    });

    if (existing) {
      existing.userId = user.id;
      existing.platform = platform;
      await this.tokens.save(existing);
      return { ok: true };
    }

    await this.tokens.save(
      this.tokens.create({
        userId: user.id,
        token: dto.token,
        platform,
      }),
    );
    return { ok: true };
  }

  async unregister(user: User, dto: UnregisterPushTokenDto) {
    await this.tokens.delete({ userId: user.id, token: dto.token });
    return { ok: true };
  }

  async unregisterAllForUser(userId: string) {
    await this.tokens.delete({ userId });
    return { ok: true };
  }

  async sendToUser(userId: string, payload: FcmPayload) {
    const rows = await this.tokens.find({ where: { userId } });
    if (rows.length === 0) {
      return;
    }

    const normalized: FcmPayload = {
      ...payload,
      href: this.resolveHref(payload.href),
    };

    try {
      const tokenList = rows.map((row) => row.token);
      const { invalidTokens } = await this.fcm.sendToTokens(
        tokenList,
        normalized,
      );

      if (invalidTokens.length > 0) {
        await this.tokens.delete({ token: In(invalidTokens) });
      }
    } catch (error) {
      this.logger.warn(
        `Push send failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private resolveHref(href: string | null | undefined): string | undefined {
    if (!href) return undefined;
    if (/^https?:\/\//i.test(href)) {
      return href;
    }
    const base =
      this.config.get<string>('FRONTEND_URL')?.trim() ||
      this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ||
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}${href.startsWith('/') ? href : `/${href}`}`;
  }
}
