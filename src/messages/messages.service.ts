import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}

function previewMessageBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 120) {
    return trimmed;
  }
  return `${trimmed.slice(0, 117)}…`;
}
