import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { Payment } from '../entities/payment.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';

export type ReportPeriod = 'today' | 'week' | 'month';

type PeriodRange = {
  start: Date;
  end: Date;
  label: string;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(LaundryOrder)
    private readonly orders: Repository<LaundryOrder>,
    @InjectRepository(PickupRequest)
    private readonly pickups: Repository<PickupRequest>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async getSnapshotsForBusiness(business: User) {
    if (business.role !== 'business') {
      throw new ForbiddenException();
    }

    const periods: ReportPeriod[] = ['today', 'week', 'month'];
    const entries = await Promise.all(
      periods.map(async (period) => [
        period,
        await this.buildSnapshot(business.id, period),
      ] as const),
    );

    return Object.fromEntries(entries) as Record<
      ReportPeriod,
      Awaited<ReturnType<ReportsService['buildSnapshot']>>
    >;
  }

  private async buildSnapshot(businessId: string, period: ReportPeriod) {
    const range = this.rangeForPeriod(period);
    const prior = this.priorRange(period);

    const [
      paymentsInPeriod,
      paymentsPrior,
      ordersInPeriod,
      ordersAll,
      pickupsInPeriod,
      newCustomers,
    ] = await Promise.all([
      this.payments.find({
        where: {
          businessId,
          status: 'Successful',
          paidAt: Between(range.start, range.end),
        },
        relations: { customer: true },
      }),
      this.payments.find({
        where: {
          businessId,
          status: 'Successful',
          paidAt: Between(prior.start, prior.end),
        },
      }),
      this.orders.find({
        where: {
          businessId,
          createdAt: Between(range.start, range.end),
        },
      }),
      this.orders.find({ where: { businessId } }),
      this.pickups.find({
        where: {
          businessId,
          updatedAt: Between(range.start, range.end),
          status: In(['Converted to Order', 'Received at Facility', 'Collected']),
        },
      }),
      this.users.count({
        where: {
          role: 'customer',
          businessId,
          createdAt: Between(range.start, range.end),
        },
      }),
    ]);

    const paymentsReceivedNgn = paymentsInPeriod.reduce(
      (sum, row) => sum + row.amountNgn,
      0,
    );
    const priorPaymentsNgn = paymentsPrior.reduce(
      (sum, row) => sum + row.amountNgn,
      0,
    );

    const orderValueNgn = ordersInPeriod.reduce(
      (sum, row) => sum + row.totalNgn,
      0,
    );

    const completedInPeriod = ordersAll.filter(
      (order) =>
        order.status === 'Completed' &&
        order.updatedAt >= range.start &&
        order.updatedAt <= range.end,
    );
    const recordedRevenueNgn = completedInPeriod.reduce(
      (sum, order) => sum + order.totalNgn,
      0,
    );

    const outstandingBalancesNgn = ordersAll
      .filter((order) => !['Completed', 'Cancelled'].includes(order.status))
      .reduce((sum, order) => sum + order.outstandingNgn, 0);

    const ordersActive = ordersAll.filter(
      (order) => !['Completed', 'Cancelled'].includes(order.status),
    ).length;

    const ordersCompleted = completedInPeriod.length;

    const ordersCancelled = ordersAll.filter(
      (order) =>
        order.status === 'Cancelled' &&
        order.updatedAt >= range.start &&
        order.updatedAt <= range.end,
    ).length;

    const deliveriesCompleted = completedInPeriod.filter(
      (order) => order.deliveryPreference === 'Home delivery',
    ).length;

    const paymentMethods = this.breakdownByMethod(paymentsInPeriod);

    return {
      period,
      periodLabel: range.label,
      financial: {
        recordedRevenueNgn,
        paymentsReceivedNgn,
        outstandingBalancesNgn,
        orderValueNgn,
        revenueTrend: this.formatTrend(paymentsReceivedNgn, priorPaymentsNgn),
      },
      paymentMethods,
      operations: {
        ordersCompleted,
        ordersActive,
        ordersCancelled,
        pickupsCompleted: pickupsInPeriod.length,
        deliveriesCompleted,
        newCustomers,
      },
      topCustomersByPayments: this.topCustomersFromPayments(paymentsInPeriod),
    };
  }

  private topCustomersFromPayments(payments: Payment[]) {
    const totals = new Map<string, number>();
    for (const payment of payments) {
      const name = payment.customer?.fullName?.trim() || 'Customer';
      totals.set(name, (totals.get(name) ?? 0) + payment.amountNgn);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([customerName, amountNgn]) => ({ customerName, amountNgn }));
  }

  private breakdownByMethod(payments: Payment[]) {
    const totals = new Map<string, number>();
    for (const payment of payments) {
      const key = payment.method.trim() || 'Other';
      totals.set(key, (totals.get(key) ?? 0) + payment.amountNgn);
    }
    const grand = [...totals.values()].reduce((sum, n) => sum + n, 0);
    if (grand === 0) {
      return [
        { method: 'Cash', amountNgn: 0, sharePercent: 0 },
        { method: 'Bank transfer', amountNgn: 0, sharePercent: 0 },
        { method: 'POS', amountNgn: 0, sharePercent: 0 },
      ];
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([method, amountNgn]) => ({
        method,
        amountNgn,
        sharePercent: Math.round((amountNgn / grand) * 100),
      }));
  }

  private formatTrend(current: number, prior: number): string {
    if (prior <= 0) {
      return current > 0 ? 'New activity in period' : 'No prior period data';
    }
    const delta = Math.round(((current - prior) / prior) * 100);
    if (delta === 0) return 'Flat vs prior period';
    return `${delta > 0 ? '+' : ''}${delta}% vs prior period`;
  }

  private rangeForPeriod(period: ReportPeriod): PeriodRange {
    const end = new Date();
    const start = new Date();

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        start,
        end,
        label: `Today · ${start.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`,
      };
    }

    if (period === 'week') {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        start,
        end,
        label: `This week · ${start.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        })} – ${end.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`,
      };
    }

    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      label: `${start.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })} (month to date)`,
    };
  }

  private priorRange(period: ReportPeriod): PeriodRange {
    const current = this.rangeForPeriod(period);
    const durationMs = current.end.getTime() - current.start.getTime();
    const end = new Date(current.start.getTime() - 1);
    const start = new Date(end.getTime() - durationMs);
    return { start, end, label: 'prior' };
  }
}
