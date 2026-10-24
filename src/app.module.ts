import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { BusinessPortalModule } from './business-portal/business-portal.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { CustomersModule } from './customers/customers.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    AuthModule,
    CustomersModule,
    CustomerPortalModule,
    BusinessPortalModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
