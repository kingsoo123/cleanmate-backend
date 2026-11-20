import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchesModule } from '../branches/branches.module';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { Payment } from '../entities/payment.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    BranchesModule,
    TypeOrmModule.forFeature([LaundryOrder, Payment, PickupRequest]),
  ],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
