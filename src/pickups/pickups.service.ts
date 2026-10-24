import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatRelativeTime } from '../common/format';
import { CustomerAddress } from '../entities/customer-address.entity';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';
import { CustomerNotificationsService } from '../notifications/customer-notifications.service';
import { OrderIdentityService } from '../orders/order-identity.service';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { UpdatePickupDto } from './dto/update-pickup.dto';
import { nextPickupStatus } from './pickup-status';

@Injectable()
export class PickupsService {
  constructor(
    @InjectRepository(PickupRequest)
    private readonly pickups: Repository<PickupRequest>,
    @InjectRepository(CustomerAddress)
    private readonly addresses: Repository<CustomerAddress>,
    @InjectRepository(LaundryOrder)
    private readonly orders: Repository<LaundryOrder>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly identity: OrderIdentityService,
    private readonly customerNotifications: CustomerNotificationsService,
  ) {}

  private async nextReference(businessId: string): Promise<string> {
    const count = await this.pickups.count({ where: { businessId } });
    return `PU-${2200 + count + 1}`;
  }

  async createForCustomer(customer: User, dto: CreatePickupDto) {
    if (customer.role !== 'customer' || !customer.businessId) {
      throw new ForbiddenException('Customer account is not linked to a laundry.');
    }

    const address = await this.addresses.findOne({
      where: { id: dto.addressId, customerId: customer.id },
    });
    if (!address) {
      throw new NotFoundException('Address not found.');
    }

    const reference = await this.nextReference(customer.businessId);
    const pickup = this.pickups.create({
      businessId: customer.businessId,
      customerId: customer.id,
      reference,
      addressLine: address.line,
      scheduledFor: dto.scheduledFor,
      estimatedItems: dto.estimatedItems.trim(),
      customerNotes: dto.customerNotes?.trim() ?? '',
      status: 'Pending Review',
      assignedRiderId: null,
      orderId: null,
    });
    const saved = await this.pickups.save(pickup);
    return this.toCustomerRow(saved);
  }

  async listForCustomer(customer: User) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }
    const rows = await this.pickups.find({
      where: { customerId: customer.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toCustomerRow(row));
  }

  async listForBusiness(business: User) {
    if (business.role !== 'business') {
      throw new ForbiddenException();
    }
    const rows = await this.pickups.find({
      where: { businessId: business.id },
      relations: { customer: true, assignedRider: true },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.toBusinessRow(row)));
  }

  async listRidersForBusiness(business: User) {
    if (business.role !== 'business') {
      throw new ForbiddenException();
    }
    const riders = await this.users.find({
      where: { role: 'rider', businessId: business.id },
    });
    return riders.map((rider) => ({
      id: rider.id,
      fullName: rider.fullName,
      status: 'Active' as const,
    }));
  }

  async updateForBusiness(business: User, pickupId: string, dto: UpdatePickupDto) {
    if (business.role !== 'business') {
      throw new ForbiddenException();
    }

    const pickup = await this.pickups.findOne({
      where: { id: pickupId, businessId: business.id },
      relations: { customer: true, assignedRider: true },
    });
    if (!pickup) {
      throw new NotFoundException('Pickup not found.');
    }

    if (dto.action === 'assign') {
      if (!dto.assignedRiderId) {
        throw new BadRequestException('Choose a rider to assign.');
      }
      const rider = await this.users.findOne({
        where: {
          id: dto.assignedRiderId,
          role: 'rider',
          businessId: business.id,
        },
      });
      if (!rider) {
        throw new NotFoundException('Rider not found.');
      }
      pickup.assignedRiderId = rider.id;
    }

    pickup.status = nextPickupStatus(pickup.status, dto.action);

    if (dto.action === 'convert') {
      if (pickup.orderId) {
        throw new BadRequestException('Pickup already linked to an order.');
      }
      const orderNumber = await this.identity.allocateOrderNumber(business.id);
      const tag = await this.identity.allocateTrackingCode();
      const order = this.orders.create({
        businessId: business.id,
        customerId: pickup.customerId,
        orderNumber,
        tag,
        trackingCode: tag,
        source: 'Pickup',
        status: 'Active',
        paymentState: 'Unpaid',
        processingStage: 'Intake',
        totalNgn: 0,
        outstandingNgn: 0,
        itemsSummary: pickup.estimatedItems,
        deliveryPreference: 'Pickup at shop',
        pickupId: pickup.id,
      });
      const savedOrder = await this.orders.save(order);
      pickup.orderId = savedOrder.id;

      const customer = await this.users.findOne({
        where: { id: pickup.customerId },
      });
      if (customer) {
        const businessName =
          business.businessName?.trim() || business.fullName || 'Your laundry';
        await this.customerNotifications.notifyOrderCreated(
          savedOrder,
          customer,
          businessName,
        );
      }
    }

    const saved = await this.pickups.save(pickup);
    return this.toBusinessRow(saved);
  }

  private toCustomerRow(pickup: PickupRequest) {
    return {
      id: pickup.id,
      reference: pickup.reference,
      status: pickup.status,
      scheduledFor: pickup.scheduledFor,
      addressLine: pickup.addressLine,
      estimatedItems: pickup.estimatedItems,
    };
  }

  private async toBusinessRow(pickup: PickupRequest) {
    const customer =
      pickup.customer ??
      (await this.users.findOne({ where: { id: pickup.customerId } }));
    const rider =
      pickup.assignedRider ??
      (pickup.assignedRiderId
        ? await this.users.findOne({ where: { id: pickup.assignedRiderId } })
        : null);

    let linkedOrderNumber: string | null = null;
    if (pickup.orderId) {
      const order = await this.orders.findOne({ where: { id: pickup.orderId } });
      linkedOrderNumber = order?.orderNumber ?? null;
    }

    return {
      id: pickup.id,
      reference: pickup.reference,
      customerId: pickup.customerId,
      customerName: customer?.fullName ?? 'Customer',
      customerPhone: customer?.phone ?? '',
      addressLine: pickup.addressLine,
      scheduledFor: pickup.scheduledFor,
      estimatedItems: pickup.estimatedItems,
      customerNotes: pickup.customerNotes,
      status: pickup.status,
      assignedRiderId: pickup.assignedRiderId,
      assignedRiderName: rider?.fullName ?? null,
      linkedOrderNumber,
      submittedAt: formatRelativeTime(pickup.createdAt),
      updatedAt: formatRelativeTime(pickup.updatedAt),
    };
  }
}
