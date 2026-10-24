import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerNotification } from '../entities/customer-notification.entity';
import { BusinessNotificationRead } from '../entities/business-notification-read.entity';
import { BusinessNotificationSettings } from '../entities/business-notification-settings.entity';
import { ChatConversation } from '../entities/chat-conversation.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { Payment } from '../entities/payment.entity';
import { PickupRequest } from '../entities/pickup-request.entity';
import { User } from '../users/user.entity';
import { PushModule } from '../push/push.module';
import { CustomerNotificationsService } from './customer-notifications.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    PushModule,
    TypeOrmModule.forFeature([
      BusinessNotificationRead,
      BusinessNotificationSettings,
      CustomerNotification,
      Payment,
      PickupRequest,
      LaundryOrder,
      ChatConversation,
      ChatMessage,
      User,
    ]),
  ],
  providers: [NotificationsService, CustomerNotificationsService],
  exports: [NotificationsService, CustomerNotificationsService],
})
export class NotificationsModule {}
