import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { Payment } from '../entities/payment.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      LaundryOrder,
      PickupRequest,
      User,
    ]),
  ],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
