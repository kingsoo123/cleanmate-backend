import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { LaundryOrder } from '../entities/laundry-order.entity';

@Injectable()
export class OrderIdentityService {
  constructor(
    @InjectRepository(LaundryOrder)
    private readonly orders: Repository<LaundryOrder>,
  ) {}

  async allocateTrackingCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = randomBytes(4).toString('hex').toUpperCase();
      const code = `CM-${suffix}`;
      const exists = await this.orders
        .createQueryBuilder('order')
        .where('order.tag = :code OR order.trackingCode = :code', { code })
        .getExists();
      if (!exists) {
        return code;
      }
    }
    throw new Error('Could not allocate a unique tracking code.');
  }

  async allocateOrderNumber(businessId: string): Promise<string> {
    const rows = await this.orders.find({
      where: { businessId },
      select: { orderNumber: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    let maxSeq = 10_400;
    for (const row of rows) {
      const match = /^LD-(\d+)$/.exec(row.orderNumber);
      if (match) {
        maxSeq = Math.max(maxSeq, Number.parseInt(match[1], 10));
      }
    }

    for (let offset = 1; offset <= 50; offset++) {
      const candidate = `LD-${maxSeq + offset}`;
      const exists = await this.orders.exists({
        where: { businessId, orderNumber: candidate },
      });
      if (!exists) {
        return candidate;
      }
    }

    throw new Error('Could not allocate a unique order number.');
  }
}
