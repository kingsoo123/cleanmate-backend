import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { OrderLineItem } from '../entities/order-line-item.entity';
import { Payment } from '../entities/payment.entity';
import { User } from '../users/user.entity';
import { OrderIdentityService } from './order-identity.service';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LaundryOrder, OrderLineItem, Payment, User]),
    NotificationsModule,
  ],
  providers: [OrdersService, OrderIdentityService],
  exports: [OrdersService, OrderIdentityService],
})
export class OrdersModule {}
