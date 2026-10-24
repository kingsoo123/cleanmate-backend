import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerAddress } from '../entities/customer-address.entity';
import { User } from '../users/user.entity';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(CustomerAddress)
    private readonly addresses: Repository<CustomerAddress>,
  ) {}

  async listForCustomer(customer: User) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }
    const rows = await this.addresses.find({
      where: { customerId: customer.id },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      line: row.line,
    }));
  }

  async createForCustomer(customer: User, dto: CreateAddressDto) {
    if (customer.role !== 'customer') {
      throw new ForbiddenException();
    }
    const row = this.addresses.create({
      customerId: customer.id,
      label: dto.label.trim(),
      line: dto.line.trim(),
    });
    const saved = await this.addresses.save(row);
    return { id: saved.id, label: saved.label, line: saved.line };
  }

  async seedDefaultFromRegistration(customer: User) {
    if (!customer.defaultAddress?.trim()) return;
    const existing = await this.addresses.count({
      where: { customerId: customer.id },
    });
    if (existing > 0) return;
    await this.addresses.save(
      this.addresses.create({
        customerId: customer.id,
        label: 'Home',
        line: customer.defaultAddress.trim(),
      }),
    );
  }
}
