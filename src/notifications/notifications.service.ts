import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessNotificationRead } from '../entities/business-notification-read.entity';
import { BusinessNotificationSettings } from '../entities/business-notification-settings.entity';
import { CustomerNotification } from '../entities/customer-notification.entity';
import { ChatConversation } from '../entities/chat-conversation.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { Payment } from '../entities/payment.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  mergeChannelEnabled,
  mergeEventSettings,
} from './notification.defaults';
import { MarkInboxReadDto } from './dto/mark-inbox-read.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

export type InboxItemDto = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
};

export type NotificationLogDto = {
  id: string;
  sentAt: string;
  eventLabel: string;
  channel: 'sms' | 'email' | 'whatsapp';
  recipient: string;
  customerName: string;
  status: 'Sent' | 'Failed' | 'Queued';
  detail: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(BusinessNotificationRead)
    private readonly reads: Repository<BusinessNotificationRead>,
    @InjectRepository(BusinessNotificationSettings)
    private readonly settings: Repository<BusinessNotificationSettings>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(PickupRequest)
    private readonly pickups: Repository<PickupRequest>,
    @InjectRepository(LaundryOrder)
    private readonly orders: Repository<LaundryOrder>,
    @InjectRepository(ChatConversation)
    private readonly conversations: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messages: Repository<ChatMessage>,
    @InjectRepository(CustomerNotification)
    private readonly customerNotifications: Repository<CustomerNotification>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async getBundleForBusiness(business: User) {
    this.assertBusiness(business);

    const [settingsRow, readKeys, inboxItems, log] = await Promise.all([
      this.settings.findOne({ where: { businessId: business.id } }),
      this.loadReadKeys(business.id),
      this.buildInboxItems(business.id),
      this.buildDeliveryLog(business.id),
    ]);

    const inbox = this.applyReadState(inboxItems, readKeys);

    return {
      channelEnabled: mergeChannelEnabled(settingsRow?.channelEnabled),
      events: mergeEventSettings(settingsRow?.events),
      templates: DEFAULT_NOTIFICATION_TEMPLATES,
      log,
      inbox: {
        unreadCount: inbox.filter((item) => !item.read).length,
        items: inbox.slice(0, 25),
      },
    };
  }

  async getInboxSummaryForBusiness(business: User) {
    this.assertBusiness(business);
    const readKeys = await this.loadReadKeys(business.id);
    const inbox = this.applyReadState(
      await this.buildInboxItems(business.id),
      readKeys,
    );
    return {
      unreadCount: inbox.filter((item) => !item.read).length,
      items: inbox.slice(0, 8),
    };
  }

  async markInboxRead(business: User, dto: MarkInboxReadDto) {
    this.assertBusiness(business);

    if (dto.all) {
      const items = await this.buildInboxItems(business.id);
      await this.upsertReadKeys(
        business.id,
        items.map((item) => item.id),
      );
      return { ok: true };
    }

    const keys = dto.itemKeys?.filter(Boolean) ?? [];
    if (keys.length === 0) {
      return { ok: true };
    }
    await this.upsertReadKeys(business.id, keys);
    return { ok: true };
  }

  async updateSettings(business: User, dto: UpdateNotificationSettingsDto) {
    this.assertBusiness(business);

    let row = await this.settings.findOne({
      where: { businessId: business.id },
    });
    if (!row) {
      row = this.settings.create({
        businessId: business.id,
        channelEnabled: mergeChannelEnabled(null),
        events: mergeEventSettings(null),
      });
    }

    if (dto.channelEnabled) {
      row.channelEnabled = {
        ...row.channelEnabled,
        ...dto.channelEnabled,
      };
    }

    if (dto.events?.length) {
      const merged = mergeEventSettings(row.events);
      const patchById = new Map(dto.events.map((event) => [event.id, event]));
      row.events = merged.map((event) => {
        const patch = patchById.get(event.id);
        if (!patch?.channels) return event;
        return {
          ...event,
          channels: { ...event.channels, ...patch.channels },
        };
      });
    }

    await this.settings.save(row);

    return {
      channelEnabled: row.channelEnabled,
      events: row.events,
    };
  }

  private async buildInboxItems(businessId: string): Promise<InboxItemDto[]> {
    const items: InboxItemDto[] = [];

    const [pendingPickups, pendingPayments, attentionOrders, chatItems] =
      await Promise.all([
        this.pickups.find({
          where: { businessId, status: 'Pending Review' },
          relations: { customer: true },
          order: { createdAt: 'DESC' },
          take: 10,
        }),
        this.payments.find({
          where: { businessId, status: 'Pending' },
          relations: { customer: true, order: true },
          order: { paidAt: 'DESC' },
          take: 10,
        }),
        this.orders.find({
          where: {
            businessId,
            status: In([
              'Awaiting Customer Approval',
              'Awaiting Initial Payment',
            ]),
          },
          relations: { customer: true },
          order: { updatedAt: 'DESC' },
          take: 10,
        }),
        this.buildChatInboxItems(businessId),
      ]);

    for (const pickup of pendingPickups) {
      const name = pickup.customer?.fullName?.trim() || 'Customer';
      items.push({
        id: `pickup:${pickup.id}`,
        kind: 'pickup_review',
        title: 'Pickup awaiting review',
        body: `${name} requested a pickup.`,
        href: '/business/pickups',
        createdAt: pickup.createdAt.toISOString(),
        read: false,
      });
    }

    for (const payment of pendingPayments) {
      const name = payment.customer?.fullName?.trim() || 'Customer';
      const orderNo = payment.order?.orderNumber ?? 'Order';
      items.push({
        id: `payment:${payment.id}`,
        kind: 'payment_verify',
        title: 'Transfer pending verification',
        body: `${name} submitted ₦${payment.amountNgn.toLocaleString('en-NG')} for ${orderNo}.`,
        href: '/business/payments',
        createdAt: payment.paidAt.toISOString(),
        read: false,
      });
    }

    for (const order of attentionOrders) {
      const name =
        order.customer?.fullName?.trim() ||
        order.walkInName?.trim() ||
        'Customer';
      items.push({
        id: `order:${order.id}`,
        kind: 'order_attention',
        title: order.status,
        body: `${order.orderNumber} · ${name}`,
        href: `/business/orders/${order.id}`,
        createdAt: order.updatedAt.toISOString(),
        read: false,
      });
    }

    items.push(...chatItems);

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return items;
  }

  private async buildChatInboxItems(
    businessId: string,
  ): Promise<InboxItemDto[]> {
    const conversationRows = await this.conversations.find({
      where: { businessId },
      relations: { customer: true },
    });
    if (conversationRows.length === 0) return [];

    const conversationById = new Map(
      conversationRows.map((row) => [row.id, row]),
    );

    const recentCustomerMessages = await this.messages
      .createQueryBuilder('message')
      .innerJoin('message.conversation', 'conversation')
      .where('conversation.businessId = :businessId', { businessId })
      .andWhere('message.senderRole = :role', { role: 'customer' })
      .orderBy('message.createdAt', 'DESC')
      .take(30)
      .getMany();

    const items: InboxItemDto[] = [];
    const seenConversations = new Set<string>();
    for (const message of recentCustomerMessages) {
      if (seenConversations.has(message.conversationId)) continue;
      seenConversations.add(message.conversationId);
      const conversation = conversationById.get(message.conversationId);
      if (!conversation) continue;
      const name = conversation.customer?.fullName?.trim() || 'Customer';
      items.push({
        id: `chat:${conversation.id}`,
        kind: 'chat_message',
        title: `Message from ${name}`,
        body: message.body.slice(0, 120),
        href: `/business/messages?customer=${conversation.customerId}`,
        createdAt: message.createdAt.toISOString(),
        read: false,
      });
    }
    return items;
  }

  private async buildDeliveryLog(businessId: string): Promise<NotificationLogDto[]> {
    type RawLog = NotificationLogDto & { sortAt: number };
    const [payments, readyOrders, pickupUpdates, inAppSent] = await Promise.all([
      this.payments.find({
        where: { businessId },
        relations: { customer: true, order: true },
        order: { paidAt: 'DESC' },
        take: 40,
      }),
      this.orders.find({
        where: { businessId, status: In(['Ready', 'Completed']) },
        relations: { customer: true },
        order: { updatedAt: 'DESC' },
        take: 15,
      }),
      this.pickups.find({
        where: {
          businessId,
          status: In(['Driver Assigned', 'En Route', 'Collected']),
        },
        relations: { customer: true },
        order: { updatedAt: 'DESC' },
        take: 15,
      }),
      this.customerNotifications.find({
        where: { businessId },
        order: { createdAt: 'DESC' },
        take: 30,
      }),
    ]);

    const customerIds = [
      ...new Set(inAppSent.map((row) => row.customerId)),
    ];
    const customers =
      customerIds.length > 0
        ? await this.users.find({ where: { id: In(customerIds) } })
        : [];
    const customerNameById = new Map(
      customers.map((row) => [row.id, row.fullName?.trim() || 'Customer']),
    );

    const log: RawLog[] = [];

    for (const notice of inAppSent) {
      log.push({
        id: `log:inapp:${notice.id}`,
        sentAt: formatLogWhen(notice.createdAt),
        sortAt: notice.createdAt.getTime(),
        eventLabel: notice.title,
        channel: 'sms',
        recipient: 'In-app (customer portal)',
        customerName: customerNameById.get(notice.customerId) ?? 'Customer',
        status: 'Sent',
        detail: notice.tag ?? notice.trackingCode ?? notice.body.slice(0, 80),
      });
    }

    for (const payment of payments) {
      const name = payment.customer?.fullName?.trim() || 'Customer';
      const orderNo = payment.order?.orderNumber ?? '';
      log.push({
        id: `log:payment:${payment.id}`,
        sentAt: formatLogWhen(payment.paidAt),
        sortAt: payment.paidAt.getTime(),
        eventLabel: 'Payment received',
        channel: payment.method.toLowerCase().includes('bank')
          ? 'email'
          : 'sms',
        recipient: maskRecipient(
          payment.customer?.phone ?? payment.customer?.email ?? 'Customer',
        ),
        customerName: name,
        status: payment.status === 'Successful' ? 'Sent' : 'Queued',
        detail: orderNo
          ? `₦${payment.amountNgn.toLocaleString('en-NG')} · ${orderNo}`
          : `₦${payment.amountNgn.toLocaleString('en-NG')}`,
      });
    }

    for (const order of readyOrders) {
      const name =
        order.customer?.fullName?.trim() ||
        order.walkInName?.trim() ||
        'Customer';
      log.push({
        id: `log:order-ready:${order.id}:${order.updatedAt.getTime()}`,
        sentAt: formatLogWhen(order.updatedAt),
        sortAt: order.updatedAt.getTime(),
        eventLabel: 'Order ready',
        channel: 'sms',
        recipient: maskRecipient(
          order.customer?.phone ?? order.walkInPhone ?? 'Customer',
        ),
        customerName: name,
        status: 'Sent',
        detail: order.orderNumber,
      });
    }

    for (const pickup of pickupUpdates) {
      const name = pickup.customer?.fullName?.trim() || 'Customer';
      const eventLabel =
        pickup.status === 'Driver Assigned' || pickup.status === 'En Route'
          ? 'Pickup scheduled'
          : 'Pickup update';
      log.push({
        id: `log:pickup:${pickup.id}:${pickup.updatedAt.getTime()}`,
        sentAt: formatLogWhen(pickup.updatedAt),
        sortAt: pickup.updatedAt.getTime(),
        eventLabel,
        channel: 'sms',
        recipient: maskRecipient(pickup.customer?.phone ?? 'Customer'),
        customerName: name,
        status: 'Sent',
        detail: pickup.reference,
      });
    }

    log.sort((a, b) => b.sortAt - a.sortAt);

    return log.slice(0, 50).map(({ sortAt: _sortAt, ...entry }) => entry);
  }

  private async loadReadKeys(businessId: string): Promise<Set<string>> {
    const rows = await this.reads.find({ where: { businessId } });
    return new Set(rows.map((row) => row.itemKey));
  }

  private applyReadState(
    items: InboxItemDto[],
    readKeys: Set<string>,
  ): InboxItemDto[] {
    return items.map((item) => ({
      ...item,
      read: readKeys.has(item.id),
    }));
  }

  private async upsertReadKeys(businessId: string, keys: string[]) {
    const unique = [...new Set(keys)];
    for (const itemKey of unique) {
      const existing = await this.reads.findOne({
        where: { businessId, itemKey },
      });
      if (!existing) {
        await this.reads.save(
          this.reads.create({ businessId, itemKey }),
        );
      }
    }
  }

  private assertBusiness(user: User) {
    if (user.role !== 'business') {
      throw new ForbiddenException();
    }
  }
}

function maskRecipient(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    const [local, domain] = trimmed.split('@');
    if (!domain) return trimmed;
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 7) {
    return `${trimmed.slice(0, Math.min(8, trimmed.length))} *** ${digits.slice(-4)}`;
  }
  return trimmed;
}

function formatLogWhen(date: Date): string {
  const now = new Date();
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (date.toDateString() === now.toDateString()) {
    return `Today · ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday · ${time}`;
  }
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  return `${day} · ${time}`;
}
