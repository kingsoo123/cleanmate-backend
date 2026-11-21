import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { resolveBusinessPortalAccess } from '../business-portal/business-portal.access';
import { BusinessStaffMessage } from '../entities/business-staff-message.entity';
import { ChatConversation } from '../entities/chat-conversation.entity';
import { ChatMessage, ChatSenderRole } from '../entities/chat-message.entity';
import { CustomerNotificationsService } from '../notifications/customer-notifications.service';
import { PushService } from '../push/push.service';
import { User } from '../users/user.entity';
import { TypingService } from './typing.service';

const MESSAGE_PAGE_SIZE = 100;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversations: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messages: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(BusinessStaffMessage)
    private readonly staffMessages: Repository<BusinessStaffMessage>,
    private readonly typing: TypingService,
    private readonly push: PushService,
    private readonly customerNotifications: CustomerNotificationsService,
  ) {}

  async getCustomerThread(customer: User) {
    this.assertCustomer(customer);
    if (!customer.businessId) {
      throw new BadRequestException(
        'Your account is not linked to a laundry yet.',
      );
    }

    const conversation = await this.getOrCreateConversation(
      customer.businessId,
      customer.id,
    );
    const business = await this.users.findOne({
      where: { id: customer.businessId, role: 'business' },
    });
    const messageRows = await this.loadMessages(conversation.id);
    await this.customerNotifications.markChatNotificationsRead(customer);

    return {
      conversationId: conversation.id,
      partnerName: business?.businessName?.trim() || 'Your laundry',
      partnerIsTyping: this.typing.isTyping(conversation.id, 'business'),
      messages: messageRows.map((row) => this.toMessageDto(row, customer.id)),
    };
  }

  async sendAsCustomer(customer: User, body: string) {
    this.assertCustomer(customer);
    if (!customer.businessId) {
      throw new BadRequestException(
        'Your account is not linked to a laundry yet.',
      );
    }

    const conversation = await this.getOrCreateConversation(
      customer.businessId,
      customer.id,
    );
    const saved = await this.persistMessage({
      conversation,
      senderId: customer.id,
      senderRole: 'customer',
      body,
    });
    this.typing.clearTyping(conversation.id, 'customer');

    void this.push.sendToUser(customer.businessId, {
      title: 'New customer message',
      body: previewMessageBody(body),
      href: `/business/messages?customer=${customer.id}`,
    });

    return this.toMessageDto(saved, customer.id);
  }

  async recordCustomerTyping(customer: User) {
    this.assertCustomer(customer);
    if (!customer.businessId) {
      throw new BadRequestException(
        'Your account is not linked to a laundry yet.',
      );
    }
    const conversation = await this.getOrCreateConversation(
      customer.businessId,
      customer.id,
    );
    this.typing.markTyping(conversation.id, 'customer');
    return { ok: true };
  }

  async listMessageDirectory(actor: User) {
    const access = resolveBusinessPortalAccess(actor);
    const ownerId = access.ownerUserId;

    const [customers, conversations, staffMembers, staffMessageRows] =
      await Promise.all([
        this.users.find({
          where: { role: 'customer', businessId: ownerId },
          order: { fullName: 'ASC' },
        }),
        this.conversations.find({
          where: { businessId: ownerId },
          order: { lastMessageAt: 'DESC' },
        }),
        access.isOwner
          ? this.users.find({
              where: {
                businessId: ownerId,
                role: In(['branch_manager', 'rider'] as User['role'][]),
              },
              order: { fullName: 'ASC' },
            })
          : Promise.resolve([] as User[]),
        access.isOwner
          ? this.staffMessages.find({
              where: { businessId: ownerId },
              order: { createdAt: 'DESC' },
              take: 500,
            })
          : Promise.resolve([] as BusinessStaffMessage[]),
      ]);

    const convByCustomer = new Map(
      conversations.map((row) => [row.customerId, row]),
    );

    const staffPreviewByUser = new Map<string, BusinessStaffMessage>();
    for (const row of staffMessageRows) {
      if (!staffPreviewByUser.has(row.staffUserId)) {
        staffPreviewByUser.set(row.staffUserId, row);
      }
    }

    const customerRecipients = customers.map((customer) => {
      const conv = convByCustomer.get(customer.id);
      return {
        kind: 'customer' as const,
        id: customer.id,
        name: customer.fullName.trim() || 'Customer',
        phone: customer.phone,
        roleLabel: 'Customer',
        lastMessagePreview: conv?.lastMessagePreview ?? '',
        lastMessageAt: conv?.lastMessageAt?.toISOString() ?? null,
      };
    });

    const staffRecipients = staffMembers.map((member) => {
      const last = staffPreviewByUser.get(member.id);
      const roleLabel =
        member.role === 'branch_manager' ? 'Branch manager' : 'Rider';
      return {
        kind: 'staff' as const,
        id: member.id,
        name: member.fullName.trim() || roleLabel,
        phone: member.phone,
        roleLabel,
        lastMessagePreview: last?.body.slice(0, 280) ?? '',
        lastMessageAt: last?.createdAt.toISOString() ?? null,
      };
    });

    return [...customerRecipients, ...staffRecipients];
  }

  async getStaffThread(owner: User, staffUserId: string) {
    this.assertBusinessOwnerPortal(owner);
    const access = resolveBusinessPortalAccess(owner);
    const staff = await this.findStaffMember(access.ownerUserId, staffUserId);
    const rows = await this.staffMessages.find({
      where: { businessId: access.ownerUserId, staffUserId: staff.id },
      order: { createdAt: 'ASC' },
      take: MESSAGE_PAGE_SIZE,
    });

    return {
      staffUserId: staff.id,
      staffName: staff.fullName.trim() || staffRoleLabel(staff.role),
      staffPhone: staff.phone,
      staffRole: staff.role,
      messages: rows.map((row) => ({
        id: row.id,
        body: row.body,
        senderRole: 'business' as const,
        isMine: true,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async sendToStaffMember(owner: User, staffUserId: string, body: string) {
    this.assertBusinessOwnerPortal(owner);
    const access = resolveBusinessPortalAccess(owner);
    const trimmed = body.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty.');
    }

    const staff = await this.findStaffMember(access.ownerUserId, staffUserId);
    const ownerUser = await this.users.findOne({
      where: { id: access.ownerUserId, role: 'business' },
    });
    if (!ownerUser) {
      throw new NotFoundException('Business not found.');
    }

    const saved = await this.staffMessages.save(
      this.staffMessages.create({
        businessId: access.ownerUserId,
        staffUserId: staff.id,
        body: trimmed,
      }),
    );

    const businessName =
      ownerUser.businessName?.trim() ||
      ownerUser.fullName?.trim() ||
      'Your laundry';
    const title = `Message from ${businessName}`;
    const preview = previewMessageBody(trimmed);
    const href =
      staff.role === 'branch_manager'
        ? '/business/dashboard'
        : '/rider/dashboard';

    void this.push.sendToUser(staff.id, { title, body: preview, href });

    return {
      id: saved.id,
      body: saved.body,
      senderRole: 'business' as const,
      isMine: true,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async listConversationsForBusiness(business: User) {
    this.assertBusiness(business);

    const rows = await this.conversations.find({
      where: { businessId: business.id },
      relations: { customer: true },
      order: { lastMessageAt: 'DESC', createdAt: 'DESC' },
    });

    return rows.map((row) => ({
      conversationId: row.id,
      customerId: row.customerId,
      customerName: row.customer?.fullName?.trim() || 'Customer',
      customerPhone: row.customer?.phone ?? '',
      lastMessagePreview: row.lastMessagePreview ?? '',
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    }));
  }

  async getBusinessThread(business: User, customerId: string) {
    this.assertBusiness(business);

    const customer = await this.users.findOne({
      where: {
        id: customerId,
        role: 'customer',
        businessId: business.id,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const conversation = await this.getOrCreateConversation(
      business.id,
      customer.id,
    );
    const messageRows = await this.loadMessages(conversation.id);

    return {
      conversationId: conversation.id,
      customerId: customer.id,
      customerName: customer.fullName.trim() || 'Customer',
      customerPhone: customer.phone,
      partnerIsTyping: this.typing.isTyping(conversation.id, 'customer'),
      messages: messageRows.map((row) => this.toMessageDto(row, business.id)),
    };
  }

  async sendAsBusiness(business: User, customerId: string, body: string) {
    this.assertBusiness(business);

    const customer = await this.users.findOne({
      where: {
        id: customerId,
        role: 'customer',
        businessId: business.id,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const conversation = await this.getOrCreateConversation(
      business.id,
      customer.id,
    );
    const saved = await this.persistMessage({
      conversation,
      senderId: business.id,
      senderRole: 'business',
      body,
    });
    this.typing.clearTyping(conversation.id, 'business');

    await this.customerNotifications.notifyChatFromBusiness(
      customer,
      business,
      saved.body,
      conversation.id,
    );

    return this.toMessageDto(saved, business.id);
  }

  async bulkSendAsBusinessOwner(
    owner: User,
    body: string,
    options?: { includeCustomers?: boolean; includeStaff?: boolean },
  ) {
    if (owner.role !== 'business') {
      throw new ForbiddenException(
        'Only the business owner can send bulk messages.',
      );
    }

    const includeCustomers = options?.includeCustomers ?? true;
    const includeStaff = options?.includeStaff ?? true;
    if (!includeCustomers && !includeStaff) {
      throw new BadRequestException(
        'Choose at least one audience: customers or staff.',
      );
    }

    const trimmed = body.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty.');
    }

    const customerResults: {
      customerId: string;
      ok: boolean;
      error?: string;
    }[] = [];

    if (includeCustomers) {
      const customers = await this.users.find({
        where: { role: 'customer', businessId: owner.id },
        order: { fullName: 'ASC' },
      });

      for (const customer of customers) {
        try {
          await this.sendAsBusiness(owner, customer.id, trimmed);
          customerResults.push({ customerId: customer.id, ok: true });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Could not send message.';
          customerResults.push({
            customerId: customer.id,
            ok: false,
            error: message,
          });
        }
      }
    }

    const staffRoles: User['role'][] = ['branch_manager', 'rider'];
    const staffNotified: { userId: string; role: User['role'] }[] = [];

    if (includeStaff) {
      const staff = await this.users.find({
        where: {
          businessId: owner.id,
          role: In(staffRoles),
        },
        order: { fullName: 'ASC' },
      });

      const businessName =
        owner.businessName?.trim() ||
        owner.fullName?.trim() ||
        'Your laundry';
      const title = `Message from ${businessName}`;
      const preview = previewMessageBody(trimmed);

      for (const member of staff) {
        const href =
          member.role === 'branch_manager'
            ? '/business/dashboard'
            : '/rider/dashboard';
        await this.push.sendToUser(member.id, {
          title,
          body: preview,
          href,
        });
        staffNotified.push({ userId: member.id, role: member.role });
      }
    }

    const customersSent = customerResults.filter((row) => row.ok).length;
    const customersFailed = customerResults.filter((row) => !row.ok);

    return {
      customers: {
        attempted: customerResults.length,
        sent: customersSent,
        failed: customersFailed,
      },
      staff: {
        notified: staffNotified,
        count: staffNotified.length,
      },
    };
  }

  async recordBusinessTyping(business: User, customerId: string) {
    this.assertBusiness(business);

    const customer = await this.users.findOne({
      where: {
        id: customerId,
        role: 'customer',
        businessId: business.id,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const conversation = await this.getOrCreateConversation(
      business.id,
      customer.id,
    );
    this.typing.markTyping(conversation.id, 'business');
    return { ok: true };
  }

  private async getOrCreateConversation(businessId: string, customerId: string) {
    let conversation = await this.conversations.findOne({
      where: { businessId, customerId },
    });
    if (!conversation) {
      conversation = this.conversations.create({
        businessId,
        customerId,
        lastMessageAt: null,
        lastMessagePreview: null,
      });
      conversation = await this.conversations.save(conversation);
    }
    return conversation;
  }

  private async loadMessages(conversationId: string) {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: MESSAGE_PAGE_SIZE,
    });
    return rows.reverse();
  }

  private async persistMessage(input: {
    conversation: ChatConversation;
    senderId: string;
    senderRole: ChatSenderRole;
    body: string;
  }) {
    const trimmed = input.body.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty.');
    }

    const message = this.messages.create({
      conversationId: input.conversation.id,
      senderId: input.senderId,
      senderRole: input.senderRole,
      body: trimmed,
    });
    const saved = await this.messages.save(message);

    input.conversation.lastMessageAt = saved.createdAt;
    input.conversation.lastMessagePreview = trimmed.slice(0, 280);
    await this.conversations.save(input.conversation);

    return saved;
  }

  private toMessageDto(message: ChatMessage, viewerUserId: string) {
    return {
      id: message.id,
      body: message.body,
      senderRole: message.senderRole,
      isMine: message.senderId === viewerUserId,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private assertCustomer(user: User) {
    if (user.role !== 'customer') {
      throw new ForbiddenException();
    }
  }

  private assertBusiness(user: User) {
    if (user.role !== 'business') {
      throw new ForbiddenException();
    }
  }

  private assertBusinessOwnerPortal(user: User) {
    if (user.role !== 'business') {
      throw new ForbiddenException(
        'Only the business owner can message staff.',
      );
    }
  }

  private async findStaffMember(businessId: string, staffUserId: string) {
    const staff = await this.users.findOne({
      where: {
        id: staffUserId,
        businessId,
        role: In(['branch_manager', 'rider'] as User['role'][]),
      },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found.');
    }
    return staff;
  }
}

function staffRoleLabel(role: User['role']) {
  return role === 'branch_manager' ? 'Branch manager' : 'Rider';
}

function previewMessageBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 120) {
    return trimmed;
  }
  return `${trimmed.slice(0, 117)}…`;
}
