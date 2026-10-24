import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { loadFirebaseServiceAccount } from './firebase-admin-credentials';

export type FcmPayload = {
  title: string;
  body: string;
  href?: string | null;
};

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    try {
      const serviceAccount = loadFirebaseServiceAccount(
        this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON'),
        this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH'),
      );

      if (!serviceAccount) {
        this.logger.warn(
          'Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON to enable web push sends.',
        );
        return;
      }

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      this.enabled = true;
      this.logger.log('Firebase Admin initialized for FCM.');
    } catch (error) {
      this.logger.error(
        'Could not initialize Firebase Admin; check service account env.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendToTokens(
    tokens: string[],
    payload: FcmPayload,
  ): Promise<{ invalidTokens: string[] }> {
    if (!this.enabled || tokens.length === 0) {
      return { invalidTokens: [] };
    }

    const invalidTokens: string[] = [];
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.href ? { href: payload.href } : undefined,
      webpush: payload.href
        ? {
            fcmOptions: {
              link: payload.href.startsWith('http')
                ? payload.href
                : undefined,
            },
          }
        : undefined,
    });

    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalidTokens.push(tokens[index]!);
      } else {
        this.logger.warn(
          `FCM send failed for token index ${index}: ${result.error?.message ?? 'unknown'}`,
        );
      }
    });

    return { invalidTokens };
  }
}
