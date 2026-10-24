import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { formatRelativeTime } from '../common/format';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { Payment } from '../entities/payment.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';

const PIPELINE_STAGE_ORDER = [
  'Quotation',
  'Intake',
  'Received',
  'Sorting',
  'Washing / Dry clean',
  'Drying',
  'Ironing / Folding',
  'Quality check',
  'Ready',
];

const PICKUP_IN_PROGRESS = [
  'Accepted',
  'Driver Assigned',
  'En Route',
  'Collected',
  'Received at Facility',
];

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(LaundryOrder)
    private readonly orders: Repository<LaundryOrder>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(PickupRequest)
    private readonly pickups: Repository<PickupRequest>,
  ) {}

  async getDashboardForBusiness(business: User) {
    if (business.role !== 'business') {
      throw new ForbiddenException();
    }

    const businessId = business.id;
    const today = this.todayRange();
    const yesterday = this.yesterdayRange();
    const week = this.weekRange();

    const [orders, payments, pickupRows] = await Promise.all([
      this.orders.find({
        where: { businessId },
        relations: { customer: true },
        order: { updatedAt: 'DESC' },
      }),
      this.payments.find({
        where: { businessId },
        relations: { customer: true, order: true },
        order: { paidAt: 'DESC' },
        take: 50,
      }),
      this.pickups.find({
        where: { businessId },
        relations: { customer: true, assignedRider: true },
        order: { updatedAt: 'DESC' },
      }),
    ]);

    const paymentsToday = payments.filter(
      (row) =>
        row.status === 'Successful' &&
        row.paidAt >= today.start &&
        row.paidAt <= today.end,
    );
    const paymentsYesterday = await this.payments.find({
      where: {
        businessId,
        status: 'Successful',
        paidAt: Between(yesterday.start, yesterday.end),
      },
    });

    const paymentsReceivedNgn = paymentsToday.reduce(
      (sum, row) => sum + row.amountNgn,
      0,
    );
    const priorPaymentsNgn = paymentsYesterday.reduce(
      (sum, row) => sum + row.amountNgn,
      0,
    );

    const completedToday = orders.filter(
      (order) =>
        order.status === 'Completed' &&
        order.updatedAt >= today.start &&
        order.updatedAt <= today.end,
    );
    const revenueTodayNgn = completedToday.reduce(
      (sum, order) => sum + order.totalNgn,
      0,
    );

    const openOrders = orders.filter(
      (order) => !['Completed', 'Cancelled'].includes(order.status),
    );
    const outstandingBalancesNgn = openOrders.reduce(
      (sum, order) => sum + order.outstandingNgn,
      0,
    );

    const orderValueThisWeekNgn = orders
      .filter(
        (order) =>
          order.createdAt >= week.start && order.createdAt <= week.end,
      )
      .reduce((sum, order) => sum + order.totalNgn, 0);

    const operational = {
      totalOrders: orders.length,
      activeOrders: openOrders.length,
      draftRequests:
        orders.filter((order) => order.status === 'Draft').length +
        pickupRows.filter((row) => row.status === 'Pending Review').length,
      pickupsAwaitingReview: pickupRows.filter(
        (row) => row.status === 'Pending Review',
      ).length,
      pickupsInProgress: pickupRows.filter((row) =>
        PICKUP_IN_PROGRESS.includes(row.status),
      ).length,
      awaitingProcessing: orders.filter((order) => order.status === 'Active')
        .length,
      inProcessing: orders.filter((order) => order.status === 'In Progress')
        .length,
      awaitingQualityCheck: orders.filter(
        (order) => order.status === 'Quality Check',
      ).length,
      readyForCollection: orders.filter((order) => order.status === 'Ready')
        .length,
      awaitingDelivery: orders.filter(
        (order) => order.status === 'Out for Delivery',
      ).length,
      completedToday: completedToday.length,
      cancelled: orders.filter(
        (order) =>
          order.status === 'Cancelled' &&
          order.updatedAt >= week.start &&
          order.updatedAt <= week.end,
      ).length,
    };

    return {
      businessName:
        business.businessName?.trim() || business.fullName || 'Your laundry',
      periodLabel: today.label,
      isPreviewData: false,
      financial: {
        revenueTodayNgn,
        paymentsReceivedNgn,
        outstandingBalancesNgn,
        orderValueThisWeekNgn,
        paymentsTrend: this.formatTrend(paymentsReceivedNgn, priorPaymentsNgn),
      },
      operational,
      attentionOrders: this.buildAttentionOrders(orders, pickupRows).slice(
        0,
        6,
      ),
      processingStages: this.buildProcessingStages(openOrders),
      recentOrders: orders.slice(0, 8).map((order) => this.toRecentOrder(order)),
      driverJobs: this.buildDriverJobs(pickupRows, orders).slice(0, 6),
      recentPayments: payments
        .filter((row) => row.status === 'Successful')
        .slice(0, 6)
        .map((row) => this.toRecentPayment(row)),
    };
  }

  private buildAttentionOrders(
    orders: LaundryOrder[],
    pickups: PickupRequest[],
  ) {
    const items: Array<{
      id: string;
      orderNumber: string;
      customerName: string;
      reason: string;
      status: LaundryOrder['status'];
      paymentState: LaundryOrder['paymentState'];
      outstandingNgn: number;
      dueLabel: string;
    }> = [];

    for (const order of orders) {
      if (['Completed', 'Cancelled'].includes(order.status)) continue;

      let reason: string | null = null;
      if (order.status === 'Ready' && order.outstandingNgn > 0) {
        reason = 'Outstanding balance before release';
      } else if (order.status === 'Awaiting Customer Approval') {
        reason = 'Quotation awaiting customer approval';
      } else if (order.status === 'Awaiting Initial Payment') {
        reason = 'Initial payment not verified';
      } else if (order.status === 'Quality Check') {
        reason = 'Awaiting quality sign-off';
      } else if (
        order.paymentState !== 'Fully Paid' &&
        order.outstandingNgn > 0 &&
        order.status === 'Out for Delivery'
      ) {
        reason = 'Balance due before delivery handover';
      }

      if (!reason) continue;

      items.push({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: this.customerLabel(order),
        reason,
        status: order.status,
        paymentState: order.paymentState,
        outstandingNgn: order.outstandingNgn,
        dueLabel: formatRelativeTime(order.updatedAt),
      });
    }

    for (const pickup of pickups) {
      if (pickup.status !== 'Pending Review') continue;
      items.push({
        id: pickup.id,
        orderNumber: pickup.reference,
        customerName: pickup.customer?.fullName?.trim() || 'Customer',
        reason: 'Pickup request pending review',
        status: 'Draft',
        paymentState: 'Unpaid',
        outstandingNgn: 0,
        dueLabel: formatRelativeTime(pickup.createdAt),
      });
    }

    items.sort(
      (a, b) =>
        this.attentionRank(a) - this.attentionRank(b),
    );

    return items;
  }

  private attentionRank(item: { status: string; outstandingNgn: number }) {
    if (item.status === 'Draft') return 0;
    if (item.status === 'Awaiting Customer Approval') return 1;
    if (item.status === 'Awaiting Initial Payment') return 2;
    if (item.status === 'Ready' && item.outstandingNgn > 0) return 3;
    return 4;
  }

  private buildProcessingStages(openOrders: LaundryOrder[]) {
    const counts = new Map<string, number>();
    for (const order of openOrders) {
      const stage = order.processingStage?.trim() || 'Intake';
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }

    const known = PIPELINE_STAGE_ORDER.filter((stage) =>
      counts.has(stage),
    ).map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));

    for (const [stage, count] of counts.entries()) {
      if (!PIPELINE_STAGE_ORDER.includes(stage)) {
        known.push({ stage, count });
      }
    }

    if (known.length === 0) {
      return [{ stage: 'No active processing', count: 0 }];
    }

    return known;
  }

  private buildDriverJobs(pickups: PickupRequest[], orders: LaundryOrder[]) {
    const jobs: Array<{
      id: string;
      reference: string;
      type: 'Pickup' | 'Delivery';
      driverName: string;
      status: string;
      scheduledAt: string;
      sortAt: number;
    }> = [];

    for (const pickup of pickups) {
      if (
        !['Driver Assigned', 'En Route', 'Collected'].includes(pickup.status)
      ) {
        continue;
      }
      jobs.push({
        id: `pickup:${pickup.id}`,
        reference: pickup.reference,
        type: 'Pickup',
        driverName: pickup.assignedRider?.fullName?.trim() || 'Rider',
        status: pickup.status,
        scheduledAt: pickup.scheduledFor,
        sortAt: pickup.updatedAt.getTime(),
      });
    }

    for (const order of orders) {
      if (order.status !== 'Out for Delivery') continue;
      jobs.push({
        id: `order:${order.id}`,
        reference: order.orderNumber,
        type: 'Delivery',
        driverName: 'Delivery team',
        status: order.status,
        scheduledAt: formatRelativeTime(order.updatedAt),
        sortAt: order.updatedAt.getTime(),
      });
    }

    jobs.sort((a, b) => b.sortAt - a.sortAt);
    return jobs.map(({ sortAt: _sortAt, ...job }) => job);
  }

  private toRecentOrder(order: LaundryOrder) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      tag: order.tag ?? order.trackingCode,
      customerName: this.customerLabel(order),
      source: order.source as 'Walk-in' | 'Pickup',
      status: order.status,
      paymentState: order.paymentState,
      totalNgn: order.totalNgn,
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toRecentPayment(payment: Payment) {
    return {
      id: payment.id,
      orderNumber: payment.order?.orderNumber ?? '—',
      customerName: payment.customer?.fullName?.trim() || 'Customer',
      amountNgn: payment.amountNgn,
      method: payment.method,
      recordedAt: payment.paidAt.toISOString(),
    };
  }

  private customerLabel(order: LaundryOrder) {
    return (
      order.customer?.fullName?.trim() ||
      order.walkInName?.trim() ||
      (order.walkInPhone ? 'Walk-in customer' : 'Walk-in')
    );
  }

  private formatTrend(current: number, prior: number) {
    if (prior <= 0) {
      return current > 0
        ? { direction: 'up' as const, text: 'New activity today' }
        : { direction: 'neutral' as const, text: 'No prior day data' };
    }
    const delta = Math.round(((current - prior) / prior) * 100);
    if (delta === 0) {
      return { direction: 'neutral' as const, text: 'Flat vs yesterday' };
    }
    return {
      direction: delta > 0 ? ('up' as const) : ('down' as const),
      text: `${delta > 0 ? '+' : ''}${delta}% vs yesterday`,
    };
  }

  private todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
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

  private yesterdayRange() {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setMilliseconds(-1);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  private weekRange() {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
}
