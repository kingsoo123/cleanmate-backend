import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FcmService } from './push/fcm.service';

@Injectable()
export class AppService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fcm: FcmService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth(): Promise<{
    status: string;
    database: string;
    fcm: 'ready' | 'disabled';
  }> {
    await this.dataSource.query('SELECT 1');
    return {
      status: 'ok',
      database: 'connected',
      fcm: this.fcm.isEnabled() ? 'ready' : 'disabled',
    };
  }
}
