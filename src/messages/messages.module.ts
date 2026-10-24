import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatConversation } from '../entities/chat-conversation.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { User } from '../users/user.entity';
import { MessagesService } from './messages.service';
import { TypingService } from './typing.service';

@Module({
  imports: [
    PushModule,
    NotificationsModule,
    TypeOrmModule.forFeature([ChatConversation, ChatMessage, User]),
  ],
  providers: [MessagesService, TypingService],
  exports: [MessagesService, TypingService],
})
export class MessagesModule {}
