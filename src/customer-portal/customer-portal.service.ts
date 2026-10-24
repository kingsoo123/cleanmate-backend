import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatMemberSince } from '../common/format';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class CustomerPortalService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(PickupRequest)
    private readonly pickups: Repository<PickupRequest>,
    private readonly orders: OrdersService,
  ) {}

  async getProfile(customer: User) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }
    const business = customer.businessId
      ? await this.users.findOne({ where: { id: customer.businessId } })
      : null;

    return {
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      email: customer.email ?? '',
      preferredLaundry: business?.businessName ?? 'Your laundry',
      memberSince: formatMemberSince(customer.createdAt),
    };
  }

  async getDashboard(customer: User) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }

    const profile = await this.getProfile(customer);
    const { orders, outstandingNgn, activeOrders, readyOrders } =
      await this.orders.getCustomerDashboardOrders(customer);

    const pickupRows = await this.pickups.find({
      where: { customerId: customer.id },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const openPickups = pickupRows.filter(
      (p) => !['Converted to Order', 'Declined'].includes(p.status),
    ).length;

    const pickupRequests = pickupRows.map((p) => ({
      id: p.id,
      reference: p.reference,
      status: p.status,
      scheduledFor: p.scheduledFor,
      addressLine: p.addressLine,
      estimatedItems: p.estimatedItems,
    }));

    const payments = await this.orders.listPaymentsForCustomer(customer);

    return {
      customerName: profile.name,
      preferredLaundry: profile.preferredLaundry,
      summary: {
        activeOrders,
        readyOrders,
        outstandingNgn,
        openPickups,
      },
      featuredOrder: orders[0] ?? null,
      pickupRequests,
      recentOrders: orders.slice(0, 3),
      recentPayments: payments.slice(0, 2),
      isPreviewData: false,
    };
  }
}
