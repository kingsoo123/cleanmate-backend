import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressesModule } from '../addresses/addresses.module';
import { AuthModule } from '../auth/auth.module';
import { PickupRequest } from '../entities/pickup-request.entity';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PickupsModule } from '../pickups/pickups.module';
import { User } from '../users/user.entity';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';

@Module({
  imports: [
    AuthModule,
    AddressesModule,
    PickupsModule,
    OrdersModule,
    MessagesModule,
    NotificationsModule,
    TypeOrmModule.forFeature([User, PickupRequest]),
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService],
})
export class CustomerPortalModule {}
