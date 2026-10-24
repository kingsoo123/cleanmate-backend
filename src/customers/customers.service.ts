import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AddressesService } from '../addresses/addresses.service';
import { normalizeEmail, normalizePhone } from '../auth/normalize';
import { User } from '../users/user.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  registeredAt: string;
  totalOrders: number;
  activeOrders: number;
  outstandingNgn: number;
  lastActivity: string;
  portalAccess: boolean;
  defaultAddress: string | null;
};

@Injectable()
export class CustomersService {
  private readonly pinRounds = 10;

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly addresses: AddressesService,
  ) {}

  assertBusinessOwner(user: User): void {
    if (user.role !== 'business') {
      throw new ForbiddenException('Only business accounts can manage customers.');
    }
  }

  async listForBusiness(businessUser: User): Promise<CustomerRecord[]> {
    this.assertBusinessOwner(businessUser);

    const rows = await this.users.find({
      where: { role: 'customer', businessId: businessUser.id },
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => this.toCustomerRecord(row));
  }

  async createForBusiness(
    businessUser: User,
    dto: CreateCustomerDto,
  ): Promise<CustomerRecord> {
    this.assertBusinessOwner(businessUser);

    const phoneNormalized = normalizePhone(dto.phone);
    if (phoneNormalized.length < 10 || phoneNormalized.length > 15) {
      throw new ConflictException('Enter a valid phone number.');
    }

    const existingPhone = await this.users.findOne({
      where: { role: 'customer', phoneNormalized },
    });
    if (existingPhone) {
      throw new ConflictException(
        'A customer with this phone number already exists.',
      );
    }

    const email = dto.email?.trim()
      ? normalizeEmail(dto.email)
      : null;

    if (email) {
      const existingEmail = await this.users.findOne({ where: { email } });
      if (existingEmail) {
        throw new ConflictException('An account with this email already exists.');
      }
    }

    const pinHash = await bcrypt.hash(dto.pin, this.pinRounds);
    const customer = this.users.create({
      role: 'customer',
      businessId: businessUser.id,
      fullName: dto.name.trim(),
      phone: dto.phone.trim(),
      phoneNormalized,
      email,
      pinHash,
      defaultAddress: dto.defaultAddress?.trim() || null,
      businessName: null,
    });

    const saved = await this.users.save(customer);
    await this.addresses.seedDefaultFromRegistration(saved);
    return this.toCustomerRecord(saved);
  }

  private toCustomerRecord(user: User): CustomerRecord {
    const registeredAt = user.createdAt.toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
    });

    return {
      id: user.id,
      name: user.fullName,
      phone: user.phone,
      email: user.email,
      registeredAt,
      totalOrders: 0,
      activeOrders: 0,
      outstandingNgn: 0,
      lastActivity: 'Just now',
      portalAccess: true,
      defaultAddress: user.defaultAddress,
    };
  }
}
