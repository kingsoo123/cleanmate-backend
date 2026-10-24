import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAddress } from '../entities/customer-address.entity';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { User } from '../users/user.entity';
import { PickupsService } from './pickups.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PickupRequest,
      CustomerAddress,
      LaundryOrder,
      User,
    ]),
    OrdersModule,
    NotificationsModule,
  ],
  providers: [PickupsService],
  exports: [PickupsService],
})
export class PickupsModule {}
