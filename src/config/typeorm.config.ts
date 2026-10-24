import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  const url = config.getOrThrow<string>('DATABASE_URL');
  return {
    type: 'postgres',
    url,
    ssl: { rejectUnauthorized: false },
    extra: {
      family: 4,
    },
    autoLoadEntities: true,
    synchronize: config.get('DB_SYNCHRONIZE') === 'true',
  };
}
