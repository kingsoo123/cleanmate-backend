import type {
  NotificationEventChannelMap,
  StoredNotificationEvent,
} from '../entities/business-notification-settings.entity';

export const DEFAULT_CHANNEL_ENABLED: Record<
  'sms' | 'email' | 'whatsapp',
  boolean
> = {
  sms: true,
  email: true,
  whatsapp: false,
};

export const DEFAULT_NOTIFICATION_EVENTS: StoredNotificationEvent[] = [
  {
    id: 'quotation_sent',
    label: 'Quotation sent',
    description: 'Customer receives itemized quote for approval.',
    channels: { sms: true, email: true, whatsapp: false },
  },
  {
    id: 'order_approved',
    label: 'Order approved',
    description: 'Confirmation when customer approves a quotation.',
    channels: { sms: true, email: false, whatsapp: false },
  },
  {
    id: 'payment_received',
    label: 'Payment received',
    description: 'Receipt after front desk or transfer is recorded.',
    channels: { sms: true, email: true, whatsapp: false },
  },
  {
    id: 'order_ready',
    label: 'Order ready',
    description: 'Clothes ready for pickup or delivery scheduling.',
    channels: { sms: true, email: true, whatsapp: true },
  },
  {
    id: 'pickup_scheduled',
    label: 'Pickup scheduled',
    description: 'Driver assigned and window confirmed.',
    channels: { sms: true, email: false, whatsapp: false },
  },
  {
    id: 'out_for_delivery',
    label: 'Out for delivery',
    description: 'Rider en route to customer address.',
    channels: { sms: true, email: false, whatsapp: true },
  },
  {
    id: 'delivery_complete',
    label: 'Delivery complete',
    description: 'Handover confirmed or collected at shop.',
    channels: { sms: false, email: true, whatsapp: false },
  },
];

export const DEFAULT_NOTIFICATION_TEMPLATES = [
  {
    eventId: 'order_ready',
    channel: 'sms' as const,
    subject: null,
    bodyPreview:
      'Hi {{name}}, your order {{orderNumber}} is ready at {{businessName}}. Balance due: {{balance}}. Reply or call us to arrange collection.',
  },
  {
    eventId: 'order_ready',
    channel: 'email' as const,
    subject: 'Your laundry is ready — {{orderNumber}}',
    bodyPreview:
      'Hello {{name}},\n\nYour items are ready. Total {{total}}, amount paid {{paid}}, balance {{balance}}.\n\n{{businessName}}',
  },
  {
    eventId: 'quotation_sent',
    channel: 'sms' as const,
    subject: null,
    bodyPreview:
      '{{name}}, your pickup {{reference}} quote is ₦{{total}}. Open the CleanMate app to approve or call us.',
  },
  {
    eventId: 'out_for_delivery',
    channel: 'whatsapp' as const,
    subject: null,
    bodyPreview:
      'Your order {{orderNumber}} is on the way with {{riderName}}. ETA {{window}}.',
  },
];

export function mergeEventSettings(
  stored: StoredNotificationEvent[] | null | undefined,
): StoredNotificationEvent[] {
  if (!stored?.length) {
    return DEFAULT_NOTIFICATION_EVENTS.map((event) => ({
      ...event,
      channels: { ...event.channels },
    }));
  }
  const byId = new Map(stored.map((event) => [event.id, event]));
  return DEFAULT_NOTIFICATION_EVENTS.map((defaults) => {
    const saved = byId.get(defaults.id);
    if (!saved) {
      return { ...defaults, channels: { ...defaults.channels } };
    }
    return {
      ...defaults,
      channels: {
        ...defaults.channels,
        ...saved.channels,
      },
    };
  });
}

export function mergeChannelEnabled(
  stored: Record<string, boolean> | null | undefined,
): Record<'sms' | 'email' | 'whatsapp', boolean> {
  return {
    sms: stored?.sms ?? DEFAULT_CHANNEL_ENABLED.sms,
    email: stored?.email ?? DEFAULT_CHANNEL_ENABLED.email,
    whatsapp: stored?.whatsapp ?? DEFAULT_CHANNEL_ENABLED.whatsapp,
  };
}

export type NotificationChannelKey = keyof NotificationEventChannelMap;
