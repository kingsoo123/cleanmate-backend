import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { MessagesModule } from '../messages/messages.module';
import { OrdersModule } from '../orders/orders.module';
import { PickupsModule } from '../pickups/pickups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { BusinessOperationsController } from './business-operations.controller';

@Module({
  imports: [
    AuthModule,
    DashboardModule,
    PickupsModule,
    OrdersModule,
    CatalogModule,
    MessagesModule,
    ReportsModule,
    NotificationsModule,
  ],
  controllers: [BusinessOperationsController],
})
export class BusinessPortalModule {}
