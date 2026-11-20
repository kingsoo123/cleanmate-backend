import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { BranchesService } from '../branches/branches.service';
import { formatRelativeTime } from '../common/format';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { Payment } from '../entities/payment.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';
import {
  orderListWhere,
  resolveBusinessPortalAccess,
  type BusinessPortalAccess,
} from '../business-portal/business-portal.access';

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
    private readonly branches: BranchesService,
  ) {}

  async getDashboardForBusiness(business: User) {
    const access = resolveBusinessPortalAccess(business);
    const businessId = access.ownerUserId;
    const orderWhere = orderListWhere(access);
    const today = this.todayRange();
    const yesterday = this.yesterdayRange();
    const week = this.weekRange();

    const [orders, payments, pickupRows] = await Promise.all([
      this.orders.find({
        where: orderWhere,
        relations: { customer: true },
        order: { updatedAt: 'DESC' },
      }),
      access.isOwner
        ? this.payments.find({
            where: { businessId },
            relations: { customer: true, order: true },
            order: { paidAt: 'DESC' },
            take: 50,
          })
        : Promise.resolve([]),
      access.isOwner
        ? this.pickups.find({
            where: { businessId },
            relations: { customer: true, assignedRider: true },
            order: { updatedAt: 'DESC' },
          })
        : Promise.resolve([]),
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

    const insights = await this.buildInsights(access, orders);
    const displayName = await this.portalBusinessName(access);

    return {
      businessName: displayName,
      periodLabel: today.label,
      isPreviewData: false,
      insights,
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

  private lastSevenDayBuckets() {
    const days: Array<{ start: Date; end: Date; label: string }> = [];
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    for (let offset = 6; offset >= 0; offset -= 1) {
      const start = new Date(anchor);
      start.setDate(anchor.getDate() - offset);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      days.push({
        start,
        end,
        label: start.toLocaleDateString('en-GB', { weekday: 'short' }),
      });
    }
    const rangeStart = days[0].start;
    const rangeEnd = days[days.length - 1].end;
    return { days, rangeStart, rangeEnd };
  }

  private inRange(date: Date, start: Date, end: Date) {
    return date >= start && date <= end;
  }

  private async buildInsights(
    access: BusinessPortalAccess,
    orders: LaundryOrder[],
  ) {
    const { days, rangeStart, rangeEnd } = this.lastSevenDayBuckets();
    const businessId = access.ownerUserId;

    const paymentRows = await this.payments.find({
      where: {
        businessId,
        status: 'Successful',
        paidAt: Between(rangeStart, rangeEnd),
      },
      relations: { order: true },
    });
    const payments = access.branchId
      ? paymentRows.filter((row) => row.order?.branchId === access.branchId)
      : paymentRows;

    const ordersInRange = orders.filter(
      (order) =>
        order.createdAt >= rangeStart && order.createdAt <= rangeEnd,
    );

    const daily = days.map((day) => {
      const paymentsNgn = payments
        .filter((row) => this.inRange(row.paidAt, day.start, day.end))
        .reduce((sum, row) => sum + row.amountNgn, 0);
      const ordersCreated = orders.filter((order) =>
        this.inRange(order.createdAt, day.start, day.end),
      ).length;
      const ordersCompleted = orders.filter(
        (order) =>
          order.status === 'Completed' &&
          this.inRange(order.updatedAt, day.start, day.end),
      ).length;
      return {
        label: day.label,
        paymentsNgn,
        ordersCreated,
        ordersCompleted,
      };
    });

    const statusLabels: Array<{ key: LaundryOrder['status']; label: string }> =
      [
        { key: 'Active', label: 'Active' },
        { key: 'In Progress', label: 'In progress' },
        { key: 'Quality Check', label: 'Quality check' },
        { key: 'Ready', label: 'Ready' },
        { key: 'Out for Delivery', label: 'Out for delivery' },
        { key: 'Completed', label: 'Completed (7d)' },
        { key: 'Cancelled', label: 'Cancelled (7d)' },
      ];

    const ordersByStatus = statusLabels.map(({ key, label }) => {
      let count = 0;
      if (key === 'Completed' || key === 'Cancelled') {
        count = orders.filter(
          (order) =>
            order.status === key &&
            order.updatedAt >= rangeStart &&
            order.updatedAt <= rangeEnd,
        ).length;
      } else {
        count = orders.filter((order) => order.status === key).length;
      }
      return { label, count };
    }).filter((row) => row.count > 0);

    const methodTotals = new Map<string, number>();
    for (const payment of payments) {
      const method = payment.method.trim() || 'Other';
      methodTotals.set(method, (methodTotals.get(method) ?? 0) + payment.amountNgn);
    }
    const paymentsByMethod = [...methodTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, amountNgn]) => ({ label, amountNgn }));

    const sourceTotals = new Map<string, number>();
    for (const order of ordersInRange) {
      const source = order.source?.trim() || 'Walk-in';
      sourceTotals.set(source, (sourceTotals.get(source) ?? 0) + 1);
    }
    const orderSources = [...sourceTotals.entries()].map(([label, count]) => ({
      label,
      count,
    }));

    const paymentsTotalNgn = payments.reduce((sum, row) => sum + row.amountNgn, 0);
    const orderValueNgn = ordersInRange.reduce(
      (sum, order) => sum + order.totalNgn,
      0,
    );
    const completedCount = orders.filter(
      (order) =>
        order.status === 'Completed' &&
        order.updatedAt >= rangeStart &&
        order.updatedAt <= rangeEnd,
    ).length;
    const createdCount = ordersInRange.length;
    const completionRatePercent =
      createdCount > 0 ? Math.round((completedCount / createdCount) * 100) : 0;
    const avgOrderValueNgn =
      createdCount > 0 ? Math.round(orderValueNgn / createdCount) : 0;
    const collectionRatePercent =
      orderValueNgn > 0
        ? Math.min(100, Math.round((paymentsTotalNgn / orderValueNgn) * 100))
        : paymentsTotalNgn > 0
          ? 100
          : 0;

    let branches: Array<{
      label: string;
      ordersCount: number;
      paymentsNgn: number;
    }> | undefined;

    if (access.isOwner) {
      const branchRows = await this.branches.listForBusiness(businessId);
      const nameById = new Map(branchRows.map((row) => [row.id, row.name]));
      const ordersByBranch = new Map<string, number>();
      const paymentsByBranch = new Map<string, number>();

      for (const order of ordersInRange) {
        const key = order.branchId ?? 'unassigned';
        ordersByBranch.set(key, (ordersByBranch.get(key) ?? 0) + 1);
      }
      for (const payment of paymentRows) {
        const key = payment.order?.branchId ?? 'unassigned';
        paymentsByBranch.set(
          key,
          (paymentsByBranch.get(key) ?? 0) + payment.amountNgn,
        );
      }

      const branchIds = new Set([
        ...ordersByBranch.keys(),
        ...paymentsByBranch.keys(),
      ]);
      branches = [...branchIds]
        .map((id) => ({
          label:
            id === 'unassigned'
              ? 'Unassigned branch'
              : (nameById.get(id) ?? 'Branch'),
          ordersCount: ordersByBranch.get(id) ?? 0,
          paymentsNgn: paymentsByBranch.get(id) ?? 0,
        }))
        .sort((a, b) => b.paymentsNgn - a.paymentsNgn);
    }

    return {
      periodLabel: 'Last 7 days',
      daily,
      ordersByStatus,
      paymentsByMethod,
      orderSources,
      branches,
      summary: {
        paymentsTotalNgn,
        ordersCreated: createdCount,
        ordersCompleted: completedCount,
        completionRatePercent,
        avgOrderValueNgn,
        collectionRatePercent,
      },
    };
  }

  private async portalBusinessName(
    access: BusinessPortalAccess,
  ): Promise<string> {
    if (access.isOwner) {
      return (
        access.actor.businessName?.trim() ||
        access.actor.fullName?.trim() ||
        'Your laundry'
      );
    }
    const owner = await this.payments.manager.getRepository(User).findOne({
      where: { id: access.ownerUserId, role: 'business' },
    });
    return (
      owner?.businessName?.trim() ||
      owner?.fullName?.trim() ||
      'Your laundry'
    );
  }
}
