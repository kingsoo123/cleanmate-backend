import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatRelativeTime } from '../common/format';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { OrderLineItem } from '../entities/order-line-item.entity';
import { Payment } from '../entities/payment.entity';
import { User } from '../users/user.entity';
import { BranchesService } from '../branches/branches.service';
import {
  assertBusinessOwner,
  assertOrderInPortalScope,
  orderListWhere,
  resolveBusinessPortalAccess,
  type BusinessPortalAccess,
} from '../business-portal/business-portal.access';
import { CreateWalkInOrderDto } from './dto/create-walk-in-order.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { SubmitCustomerPaymentDto } from './dto/submit-customer-payment.dto';
import { BulkUpdateOrderStatusDto } from './dto/bulk-update-order-status.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  DEFAULT_PROCESSING_STAGE_BY_STATUS,
} from './order-status.defaults';
import { CustomerNotificationsService } from '../notifications/customer-notifications.service';
import { OrderIdentityService } from './order-identity.service';
import {
  buildItemsSummary,
  resolveWalkInOrderState,
  sumLineItemsTotal,
} from './walk-in-order.logic';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(LaundryOrder)
    private readonly orders: Repository<LaundryOrder>,
    @InjectRepository(OrderLineItem)
    private readonly lineItems: Repository<OrderLineItem>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly identity: OrderIdentityService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly branches: BranchesService,
  ) {}

  async createWalkInOrder(business: User, dto: CreateWalkInOrderDto) {
    const access = resolveBusinessPortalAccess(business);
    const branchId = access.branchId ?? dto.branchId;
    if (access.branchId && dto.branchId !== access.branchId) {
      throw new ForbiddenException('You can only create orders for your branch.');
    }

    const branch = await this.branches.assertOwnedByBusiness(
      access.ownerUserId,
      branchId,
    );

    const totalNgn = sumLineItemsTotal(dto.lineItems);
    const paidNgn = Math.min(dto.initialPaymentNgn, totalNgn);

    if (dto.initialPaymentNgn > totalNgn) {
      throw new BadRequestException('Payment cannot exceed the quotation total.');
    }
    if (
      !dto.sendForApproval &&
      dto.initialPaymentNgn <= 0 &&
      totalNgn > 0
    ) {
      throw new BadRequestException(
        'Record an initial payment or send the quotation for approval.',
      );
    }

    let customerId: string | null = null;
    let walkInName: string | null = null;
    let walkInPhone: string | null = null;
    let customerLabel = 'Customer';

    if (dto.customerMode === 'existing') {
      if (!dto.customerId) {
        throw new BadRequestException('Select a customer.');
      }
      const customer = await this.users.findOne({
        where: {
          id: dto.customerId,
          role: 'customer',
          businessId: access.ownerUserId,
        },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found.');
      }
      customerId = customer.id;
      customerLabel = customer.fullName;
    } else {
      walkInName = dto.walkInName?.trim() ?? null;
      walkInPhone = dto.walkInPhone?.trim() ?? null;
      customerLabel = walkInName ? `Walk-in — ${walkInName}` : 'Walk-in customer';
    }

    const { status, paymentState } = resolveWalkInOrderState({
      totalNgn,
      paidNgn,
      sendForApproval: dto.sendForApproval,
    });

    const orderNumber = await this.identity.allocateOrderNumber(
      access.ownerUserId,
    );
    const tag = await this.identity.allocateTrackingCode();
    const outstandingNgn = Math.max(0, totalNgn - paidNgn);

    const order = this.orders.create({
      businessId: access.ownerUserId,
      branchId: branch.id,
      customerId,
      walkInName,
      walkInPhone,
      orderNumber,
      tag,
      trackingCode: tag,
      source: 'Walk-in',
      status,
      paymentState,
      processingStage: dto.sendForApproval ? 'Quotation' : 'Intake',
      totalNgn,
      outstandingNgn,
      itemsSummary: buildItemsSummary(dto.lineItems),
      deliveryPreference: dto.deliveryPreference,
      customerNotes: dto.customerNotes?.trim() || null,
      internalNotes: dto.internalNotes?.trim() || null,
      pickupId: null,
    });

    const savedOrder = await this.orders.save(order);

    const lineRows = dto.lineItems.map((item) =>
      this.lineItems.create({
        orderId: savedOrder.id,
        serviceId: item.serviceId ?? null,
        label: item.label,
        quantity: item.quantity,
        unitPriceNgn: item.unitPriceNgn,
      }),
    );
    await this.lineItems.save(lineRows);

    if (paidNgn > 0 && customerId) {
      await this.payments.save(
        this.payments.create({
          businessId: access.ownerUserId,
          orderId: savedOrder.id,
          customerId,
          amountNgn: paidNgn,
          method: dto.paymentMethod,
          status: 'Successful',
        }),
      );
    }

    if (customerId) {
      const customer = await this.users.findOne({ where: { id: customerId } });
      const businessName = await this.portalBusinessName(access);
      if (customer) {
        if (dto.sendForApproval) {
          await this.customerNotifications.notifyQuotationSent(
            savedOrder,
            customer,
            businessName,
          );
        } else {
          await this.customerNotifications.notifyOrderCreated(
            savedOrder,
            customer,
            businessName,
          );
        }
        if (paidNgn > 0) {
          await this.customerNotifications.notifyPaymentReceived(
            savedOrder,
            customer,
            paidNgn,
            businessName,
          );
        }
      }
    }

    return {
      orderNumber: savedOrder.orderNumber,
      tag: savedOrder.tag,
      trackingCode: savedOrder.tag,
      orderId: savedOrder.id,
      customerLabel,
      totalNgn,
      paidNgn,
      outstandingNgn,
      statusLabel: status,
      paymentLabel: paymentState,
    };
  }

  async listForBusiness(business: User) {
    const access = resolveBusinessPortalAccess(business);
    const rows = await this.orders.find({
      where: orderListWhere(access),
      relations: { customer: true },
      order: { updatedAt: 'DESC' },
    });
    for (const row of rows) {
      await this.ensureOrderTag(row);
    }
    return rows.map((row) => this.toBusinessListRow(row));
  }

  async getOneForBusiness(business: User, orderId: string) {
    const access = resolveBusinessPortalAccess(business);

    const order = await this.orders.findOne({
      where: { id: orderId, businessId: access.ownerUserId },
      relations: { customer: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    assertOrderInPortalScope(access, order);

    await this.ensureOrderTag(order);
    return this.toBusinessListRow(order);
  }

  async updateOrderStatusForBusiness(
    business: User,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const access = resolveBusinessPortalAccess(business);

    const order = await this.orders.findOne({
      where: { id: orderId, businessId: access.ownerUserId },
      relations: { customer: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    assertOrderInPortalScope(access, order);

    if (['Completed', 'Cancelled'].includes(order.status)) {
      throw new BadRequestException(
        'This order is closed. Re-open is not supported yet.',
      );
    }

    if (dto.status === 'Completed' && order.outstandingNgn > 0) {
      throw new BadRequestException(
        'Record or collect the outstanding balance before marking the order completed.',
      );
    }

    const previousStatus = order.status;
    const previousStage = order.processingStage;
    const processingStage =
      dto.processingStage?.trim() ||
      DEFAULT_PROCESSING_STAGE_BY_STATUS[dto.status] ||
      order.processingStage;

    order.status = dto.status;
    order.processingStage = processingStage;
    await this.orders.save(order);

    if (
      order.customerId &&
      order.customer &&
      (previousStatus !== dto.status || previousStage !== processingStage)
    ) {
      const businessName = await this.portalBusinessName(access);
      void this.customerNotifications.notifyOrderStatusUpdated(
        order,
        order.customer,
        businessName,
        dto.status,
        processingStage,
      );
    }

    return this.toBusinessListRow(order);
  }

  async bulkUpdateOrderStatusForBusiness(
    business: User,
    dto: BulkUpdateOrderStatusDto,
  ) {
    const access = resolveBusinessPortalAccess(business);

    const uniqueIds = [...new Set(dto.orderIds)];
    const payload: UpdateOrderStatusDto = {
      status: dto.status,
      processingStage: dto.processingStage,
    };

    const updated: Awaited<ReturnType<OrdersService['getOneForBusiness']>>[] = [];
    const skipped: {
      orderId: string;
      orderNumber: string;
      reason: string;
    }[] = [];

    for (const orderId of uniqueIds) {
      try {
        const row = await this.updateOrderStatusForBusiness(
          business,
          orderId,
          payload,
        );
        updated.push(row);
      } catch (error) {
        const reason =
          error instanceof HttpException
            ? this.httpExceptionMessage(error)
            : 'Could not update.';
        const order = await this.orders.findOne({
          where: { id: orderId, businessId: access.ownerUserId },
          select: { id: true, orderNumber: true },
        });
        skipped.push({
          orderId,
          orderNumber: order?.orderNumber ?? orderId,
          reason,
        });
      }
    }

    if (updated.length === 0 && skipped.length > 0) {
      throw new BadRequestException(
        'No orders were updated. Check skipped reasons.',
      );
    }

    return {
      updated,
      skipped,
      updatedCount: updated.length,
      skippedCount: skipped.length,
    };
  }

  private httpExceptionMessage(error: HttpException): string {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (
      response &&
      typeof response === 'object' &&
      'message' in response
    ) {
      const message = (response as { message: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(' ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return error.message;
  }

  async listForCustomer(customer: User) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }
    const business = customer.businessId
      ? await this.users.findOne({ where: { id: customer.businessId } })
      : null;

    const rows = await this.orders.find({
      where: { customerId: customer.id },
      order: { updatedAt: 'DESC' },
    });

    for (const row of rows) {
      await this.ensureOrderTag(row);
    }

    return rows.map((row) =>
      this.toCustomerListRow(row, business?.businessName ?? 'Your laundry'),
    );
  }

  async getOneForCustomer(customer: User, orderId: string) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }

    const order = await this.orders.findOne({
      where: { id: orderId, customerId: customer.id },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    await this.ensureOrderTag(order);

    const business = customer.businessId
      ? await this.users.findOne({ where: { id: customer.businessId } })
      : null;

    return this.toCustomerListRow(
      order,
      business?.businessName ?? 'Your laundry',
    );
  }

  async recordPayment(business: User, dto: RecordPaymentDto) {
    assertBusinessOwner(business);

    const order = await this.orders.findOne({
      where: { id: dto.orderId, businessId: business.id },
      relations: { customer: true },
    });
    if (!order) {
      throw new ForbiddenException('Order not found.');
    }
    if (!order.customerId) {
      throw new BadRequestException(
        'Link this walk-in order to a customer account before recording payments.',
      );
    }

    const payment = this.payments.create({
      businessId: business.id,
      orderId: order.id,
      customerId: order.customerId,
      amountNgn: dto.amountNgn,
      method: dto.method.trim(),
      status: 'Successful',
      transferReference: undefined,
      note: dto.note?.trim() || undefined,
    });
    await this.payments.save(payment);

    this.applyPaymentToOrder(order, dto.amountNgn);
    await this.orders.save(order);

    if (order.customerId && order.customer) {
      await this.ensureOrderTag(order);
      const businessName =
        business.businessName?.trim() || business.fullName || 'Your laundry';
      await this.customerNotifications.notifyPaymentReceived(
        order,
        order.customer,
        dto.amountNgn,
        businessName,
      );
    }

    return this.toBusinessPaymentRecord(payment, order, order.customer);
  }

  async getBusinessPaymentsBundle(business: User) {
    assertBusinessOwner(business);
    const [payments, outstanding] = await Promise.all([
      this.listBusinessPaymentRecords(business),
      this.listOutstandingOrdersForBusiness(business),
    ]);
    return { payments, outstanding };
  }

  async verifyPayment(business: User, paymentId: string) {
    assertBusinessOwner(business);

    const payment = await this.payments.findOne({
      where: { id: paymentId, businessId: business.id },
      relations: { order: true, customer: true },
    });
    if (!payment || payment.status !== 'Pending') {
      throw new NotFoundException('Pending payment not found.');
    }

    payment.status = 'Successful';
    await this.payments.save(payment);

    this.applyPaymentToOrder(payment.order, payment.amountNgn);
    await this.orders.save(payment.order);

    return this.toBusinessPaymentRecord(
      payment,
      payment.order,
      payment.customer,
    );
  }

  async getCustomerPaymentsOverview(customer: User) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }

    const business = customer.businessId
      ? await this.users.findOne({ where: { id: customer.businessId } })
      : null;

    const orderRows = await this.orders.find({
      where: { customerId: customer.id },
      order: { updatedAt: 'DESC' },
    });

    const outstanding = orderRows
      .filter((order) => order.outstandingNgn > 0)
      .map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalNgn: order.totalNgn,
        paidNgn: Math.max(0, order.totalNgn - order.outstandingNgn),
        outstandingNgn: order.outstandingNgn,
      }));

    const totalOutstandingNgn = outstanding.reduce(
      (sum, row) => sum + row.outstandingNgn,
      0,
    );

    const history = await this.listPaymentsForCustomer(customer);

    const laundryName =
      business?.businessName?.trim() || 'Your laundry';

    return {
      outstanding,
      totalOutstandingNgn,
      transferDetails: {
        laundryName,
        bankName: 'Contact your laundry',
        accountName: laundryName,
        accountNumber: 'Ask at the front desk',
        note: 'Use your order Tag (CM-…) as the transfer description.',
      },
      history,
    };
  }

  async submitCustomerPayment(customer: User, dto: SubmitCustomerPaymentDto) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }

    const order = await this.orders.findOne({
      where: { id: dto.orderId, customerId: customer.id },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    if (order.outstandingNgn <= 0) {
      throw new BadRequestException('This order has no balance due.');
    }
    if (dto.amountNgn > order.outstandingNgn) {
      throw new BadRequestException(
        'Amount cannot exceed the outstanding balance.',
      );
    }

    const method = dto.method.trim();
    if (method === 'Bank transfer' && !dto.transferReference?.trim()) {
      throw new BadRequestException('Enter your transfer reference.');
    }

    const payment = this.payments.create({
      businessId: order.businessId,
      orderId: order.id,
      customerId: customer.id,
      amountNgn: dto.amountNgn,
      method,
      status: 'Pending',
      transferReference: dto.transferReference?.trim() || undefined,
      note: undefined,
    });
    const saved = await this.payments.save(payment);

    await this.ensureOrderTag(order);
    await this.customerNotifications.notifyPaymentSubmitted(
      order,
      customer,
      dto.amountNgn,
    );

    return {
      id: saved.id,
      orderNumber: order.orderNumber,
      tag: order.tag ?? order.trackingCode,
      trackingCode: order.tag ?? order.trackingCode,
      amountNgn: saved.amountNgn,
      method: saved.method,
      status: saved.status,
      paidAt: saved.paidAt.toISOString(),
    };
  }

  async listPaymentsForBusiness(business: User) {
    const bundle = await this.getBusinessPaymentsBundle(business);
    return bundle.payments;
  }

  private async listBusinessPaymentRecords(business: User) {
    const rows = await this.payments.find({
      where: { businessId: business.id },
      relations: { order: true, customer: true },
      order: { paidAt: 'DESC' },
    });
    return rows.map((row) =>
      this.toBusinessPaymentRecord(row, row.order, row.customer),
    );
  }

  private async listOutstandingOrdersForBusiness(business: User) {
    const rows = await this.orders.find({
      where: { businessId: business.id },
      relations: { customer: true },
      order: { updatedAt: 'DESC' },
    });

    return rows
      .filter((order) => order.outstandingNgn > 0)
      .map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName:
          order.customer?.fullName ??
          order.walkInName ??
          (order.walkInPhone ? 'Walk-in customer' : 'Walk-in'),
        totalNgn: order.totalNgn,
        paidNgn: Math.max(0, order.totalNgn - order.outstandingNgn),
        outstandingNgn: order.outstandingNgn,
      }));
  }

  async listPaymentsForCustomer(customer: User) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }
    const rows = await this.payments.find({
      where: { customerId: customer.id },
      relations: { order: true },
      order: { paidAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.order.orderNumber,
      amountNgn: row.amountNgn,
      method: row.method,
      status: row.status,
      paidAt: row.paidAt.toISOString(),
    }));
  }

  private applyPaymentToOrder(order: LaundryOrder, amountNgn: number) {
    order.outstandingNgn = Math.max(0, order.outstandingNgn - amountNgn);
    if (order.outstandingNgn === 0 && order.totalNgn > 0) {
      order.paymentState = 'Fully Paid';
    } else if (order.outstandingNgn < order.totalNgn) {
      order.paymentState = 'Partially Paid';
    }
  }

  private paymentReference(id: string) {
    return `PAY-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  private toBusinessPaymentRecord(
    payment: Payment,
    order: LaundryOrder,
    customer?: User | null,
  ) {
    const pending = payment.status === 'Pending';
    return {
      id: payment.id,
      orderId: order.id,
      reference: this.paymentReference(payment.id),
      orderNumber: order.orderNumber,
      customerName:
        customer?.fullName ??
        order.walkInName ??
        (order.walkInPhone ? 'Walk-in customer' : 'Walk-in'),
      amountNgn: payment.amountNgn,
      method: payment.method,
      status: pending ? 'Pending verification' : 'Recorded',
      recordedAt: payment.paidAt.toISOString(),
      recordedBy: 'Staff',
      note: payment.note ?? payment.transferReference,
    };
  }

  async getCustomerDashboardOrders(customer: User) {
    const orders = await this.listForCustomer(customer);
    const outstandingNgn = orders.reduce((sum, o) => sum + o.outstandingNgn, 0);
    const activeOrders = orders.filter(
      (o) => !['Completed', 'Cancelled'].includes(o.status),
    ).length;
    const readyOrders = orders.filter((o) => o.status === 'Ready').length;
    return { orders, outstandingNgn, activeOrders, readyOrders };
  }

  private async ensureOrderTag(order: LaundryOrder): Promise<string> {
    if (order.tag) {
      if (!order.trackingCode) {
        order.trackingCode = order.tag;
        await this.orders.save(order);
      }
      return order.tag;
    }
    if (order.trackingCode) {
      order.tag = order.trackingCode;
      await this.orders.save(order);
      return order.tag;
    }
    const code = await this.identity.allocateTrackingCode();
    order.tag = code;
    order.trackingCode = code;
    await this.orders.save(order);
    return code;
  }

  private toBusinessListRow(order: LaundryOrder) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      tag: order.tag ?? order.trackingCode,
      trackingCode: order.tag ?? order.trackingCode,
      customerName:
        order.customer?.fullName ??
        order.walkInName ??
        (order.walkInPhone ? 'Walk-in customer' : 'Walk-in'),
      customerPhone: order.customer?.phone ?? order.walkInPhone ?? '',
      source: order.source,
      status: order.status,
      paymentState: order.paymentState,
      processingStage: order.processingStage,
      totalNgn: order.totalNgn,
      outstandingNgn: order.outstandingNgn,
      itemsSummary: order.itemsSummary,
      updatedAt: order.updatedAt.toISOString(),
      createdAt: order.createdAt.toISOString(),
    };
  }

  private toCustomerListRow(order: LaundryOrder, laundryName: string) {
    const tag = order.tag ?? order.trackingCode ?? '';
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      tag,
      trackingCode: tag,
      laundryName,
      status: order.status,
      processingStage: order.processingStage,
      paymentState: order.paymentState,
      totalNgn: order.totalNgn,
      outstandingNgn: order.outstandingNgn,
      updatedAt: order.updatedAt.toISOString(),
      deliveryPreference:
        (order.deliveryPreference as 'Pickup at shop' | 'Home delivery') ??
        'Pickup at shop',
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
    const owner = await this.users.findOne({
      where: { id: access.ownerUserId, role: 'business' },
    });
    return (
      owner?.businessName?.trim() ||
      owner?.fullName?.trim() ||
      'Your laundry'
    );
  }
}
