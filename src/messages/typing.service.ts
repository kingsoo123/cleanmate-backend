import { Injectable } from '@nestjs/common';
import { ChatSenderRole } from '../entities/chat-message.entity';

const TYPING_TTL_MS = 4500;

@Injectable()
export class TypingService {
  /** conversationId → role → expiresAt (ms) */
  private readonly active = new Map<string, Map<ChatSenderRole, number>>();

  markTyping(conversationId: string, role: ChatSenderRole) {
    let roles = this.active.get(conversationId);
    if (!roles) {
      roles = new Map();
      this.active.set(conversationId, roles);
    }
    roles.set(role, Date.now() + TYPING_TTL_MS);
  }

  isTyping(conversationId: string, role: ChatSenderRole): boolean {
    const roles = this.active.get(conversationId);
    if (!roles) return false;

    const expiresAt = roles.get(role);
    if (!expiresAt) return false;

    if (Date.now() > expiresAt) {
      roles.delete(role);
      if (roles.size === 0) {
        this.active.delete(conversationId);
      }
      return false;
    }

    return true;
  }

  clearTyping(conversationId: string, role: ChatSenderRole) {
    const roles = this.active.get(conversationId);
    if (!roles) return;
    roles.delete(role);
    if (roles.size === 0) {
      this.active.delete(conversationId);
    }
  }
}
