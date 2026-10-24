import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CustomerNotification } from '../entities/customer-notification.entity';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { User } from '../users/user.entity';
import { PushService } from '../push/push.service';
import { MarkCustomerNotificationsReadDto } from './dto/mark-customer-notifications-read.dto';

@Injectable()
export class CustomerNotificationsService {
  constructor(
    @InjectRepository(CustomerNotification)
    private readonly notifications: Repository<CustomerNotification>,
    private readonly push: PushService,
  ) {}

  async listForCustomer(customer: User) {
    this.assertCustomer(customer);
    const rows = await this.notifications.find({
      where: { customerId: customer.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const unreadCount = rows.filter((row) => !row.readAt).length;

    return {
      unreadCount,
      items: rows.map((row) => this.toDto(row)),
    };
  }

  async markRead(customer: User, dto: MarkCustomerNotificationsReadDto) {
    this.assertCustomer(customer);

    if (dto.all) {
      await this.notifications
        .createQueryBuilder()
        .update()
        .set({ readAt: new Date() })
        .where('customer_id = :customerId', { customerId: customer.id })
        .andWhere('read_at IS NULL')
        .execute();
      return { ok: true };
    }

    const ids = dto.ids?.filter(Boolean) ?? [];
    if (ids.length === 0) {
      return { ok: true };
    }

    await this.notifications.update(
      { id: In(ids), customerId: customer.id },
      { readAt: new Date() },
    );
    return { ok: true };
  }

  async notifyOrderCreated(
    order: LaundryOrder,
    customer: User,
    businessName: string,
  ) {
    const tag = this.orderTag(order);
    if (!tag) return;

    const title = 'Order registered';
    const body = `${businessName} created your order. Tag: ${tag}. Shop reference: ${order.orderNumber}.`;
    const href = `/customer/orders/${order.id}`;

    await this.notifications.save(
      this.notifications.create({
        customerId: customer.id,
        businessId: order.businessId,
        orderId: order.id,
        tag,
        trackingCode: tag,
        eventType: 'order_created',
        title,
        body,
        href,
      }),
    );
    void this.push.sendToUser(customer.id, { title, body, href });
  }

  async notifyQuotationSent(
    order: LaundryOrder,
    customer: User,
    businessName: string,
  ) {
    const tag = this.orderTag(order);
    if (!tag) return;

    const title = 'Quotation ready';
    const body = `Review your quote for tag ${tag} (${formatNgn(order.totalNgn)}). Order ref ${order.orderNumber} at ${businessName}.`;
    const href = `/customer/orders/${order.id}`;

    await this.notifications.save(
      this.notifications.create({
        customerId: customer.id,
        businessId: order.businessId,
        orderId: order.id,
        tag,
        trackingCode: tag,
        eventType: 'quotation_sent',
        title,
        body,
        href,
      }),
    );
    void this.push.sendToUser(customer.id, { title, body, href });
  }

  async notifyPaymentSubmitted(
    order: LaundryOrder,
    customer: User,
    amountNgn: number,
  ) {
    const tag = this.orderTag(order);
    if (!tag) return;

    const title = 'Payment submitted';
    const body = `We received your ${formatNgn(amountNgn)} transfer for tag ${tag}. Pending verification.`;
    const href = `/customer/payments`;

    await this.notifications.save(
      this.notifications.create({
        customerId: customer.id,
        businessId: order.businessId,
        orderId: order.id,
        tag,
        trackingCode: tag,
        eventType: 'payment_submitted',
        title,
        body,
        href,
      }),
    );
    void this.push.sendToUser(customer.id, { title, body, href });
  }

  async notifyChatFromBusiness(
    customer: User,
    business: User,
    body: string,
    conversationId: string,
  ) {
    const businessName =
      business.businessName?.trim() || business.fullName?.trim() || 'Your laundry';
    const preview =
      body.trim().length > 160
        ? `${body.trim().slice(0, 157)}…`
        : body.trim();
    const title = `Message from ${businessName}`;
    const href = '/customer/messages';

    await this.notifications.save(
      this.notifications.create({
        customerId: customer.id,
        businessId: business.id,
        orderId: null,
        tag: null,
        trackingCode: null,
        eventType: 'chat_message',
        title,
        body: preview,
        href,
      }),
    );
    void this.push.sendToUser(customer.id, { title, body: preview, href });
  }

  async markChatNotificationsRead(customer: User) {
    this.assertCustomer(customer);
    await this.notifications
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('customer_id = :customerId', { customerId: customer.id })
      .andWhere('event_type = :eventType', { eventType: 'chat_message' })
      .andWhere('read_at IS NULL')
      .execute();
  }

  async notifyPaymentReceived(
    order: LaundryOrder,
    customer: User,
    amountNgn: number,
    businessName: string,
  ) {
    const tag = this.orderTag(order);
    if (!tag) return;

    const title = 'Payment recorded';
    const body = `${businessName} recorded ${formatNgn(amountNgn)} on tag ${tag}. Balance due: ${formatNgn(order.outstandingNgn)}.`;
    const href = `/customer/orders/${order.id}`;

    await this.notifications.save(
      this.notifications.create({
        customerId: customer.id,
        businessId: order.businessId,
        orderId: order.id,
        tag,
        trackingCode: tag,
        eventType: 'payment_received',
        title,
        body,
        href,
      }),
    );
    void this.push.sendToUser(customer.id, { title, body, href });
  }

  private toDto(row: CustomerNotification) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      href: row.href,
      tag: row.tag ?? row.trackingCode,
      trackingCode: row.tag ?? row.trackingCode,
      eventType: row.eventType,
      orderId: row.orderId,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt != null,
    };
  }

  private orderTag(order: LaundryOrder) {
    return order.tag ?? order.trackingCode ?? null;
  }

  private assertCustomer(user: User) {
    if (user.role !== 'customer') {
      throw new ForbiddenException();
    }
  }
}

function formatNgn(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}
