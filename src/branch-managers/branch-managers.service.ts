import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { assertBusinessOwner } from '../business-portal/business-portal.access';
import { BranchesService } from '../branches/branches.service';
import { BusinessBranch } from '../entities/business-branch.entity';
import { normalizePhone } from '../auth/normalize';
import { User } from '../users/user.entity';
import { CreateBranchManagerDto } from './dto/create-branch-manager.dto';
import { UpdateBranchManagerDto } from './dto/update-branch-manager.dto';

export type BranchManagerRecord = {
  id: string;
  fullName: string;
  phone: string;
  branchId: string;
  branchName: string;
  createdAt: string;
};

@Injectable()
export class BranchManagersService {
  private readonly pinRounds = 10;

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(BusinessBranch)
    private readonly branches: Repository<BusinessBranch>,
    private readonly branchesService: BranchesService,
  ) {}

  async listForBusinessOwner(owner: User): Promise<BranchManagerRecord[]> {
    assertBusinessOwner(owner);

    const rows = await this.users.find({
      where: { role: 'branch_manager', businessId: owner.id },
      order: { createdAt: 'DESC' },
    });

    const branchIds = [...new Set(rows.map((row) => row.branchId).filter(Boolean))];
    const branchRows =
      branchIds.length > 0
        ? await this.branches.find({ where: { id: In(branchIds) } })
        : [];
    const branchNameById = new Map(branchRows.map((b) => [b.id, b.name]));

    return rows.map((row) =>
      this.toRecord(row, branchNameById.get(row.branchId ?? '') ?? 'Branch'),
    );
  }

  async createForBusinessOwner(
    owner: User,
    dto: CreateBranchManagerDto,
  ): Promise<BranchManagerRecord> {
    assertBusinessOwner(owner);

    const phoneNormalized = normalizePhone(dto.phone);
    if (phoneNormalized.length < 10 || phoneNormalized.length > 15) {
      throw new ConflictException('Enter a valid phone number.');
    }

    await this.branchesService.assertOwnedByBusiness(owner.id, dto.branchId);

    const existingPhone = await this.users.findOne({
      where: { role: 'branch_manager', phoneNormalized },
    });
    if (existingPhone) {
      throw new ConflictException(
        'A branch manager with this phone number already exists.',
      );
    }

    const pinHash = await bcrypt.hash(dto.pin, this.pinRounds);
    const user = this.users.create({
      role: 'branch_manager',
      email: null,
      phone: dto.phone.trim(),
      phoneNormalized,
      pinHash,
      fullName: dto.fullName.trim(),
      businessName: null,
      businessId: owner.id,
      branchId: dto.branchId,
    });
    await this.users.save(user);

    const branch = await this.branches.findOne({ where: { id: dto.branchId } });
    return this.toRecord(user, branch?.name ?? 'Branch');
  }

  async updateForBusinessOwner(
    owner: User,
    managerId: string,
    dto: UpdateBranchManagerDto,
  ): Promise<BranchManagerRecord> {
    assertBusinessOwner(owner);

    const manager = await this.users.findOne({
      where: {
        id: managerId,
        role: 'branch_manager',
        businessId: owner.id,
      },
    });
    if (!manager) {
      throw new NotFoundException('Branch manager not found.');
    }

    if (dto.branchId) {
      await this.branchesService.assertOwnedByBusiness(owner.id, dto.branchId);
      manager.branchId = dto.branchId;
    }

    if (dto.fullName?.trim()) {
      manager.fullName = dto.fullName.trim();
    }

    if (dto.pin) {
      manager.pinHash = await bcrypt.hash(dto.pin, this.pinRounds);
    }

    await this.users.save(manager);

    const branch = await this.branches.findOne({
      where: { id: manager.branchId ?? undefined },
    });
    return this.toRecord(manager, branch?.name ?? 'Branch');
  }

  async removeForBusinessOwner(owner: User, managerId: string): Promise<void> {
    assertBusinessOwner(owner);

    const manager = await this.users.findOne({
      where: {
        id: managerId,
        role: 'branch_manager',
        businessId: owner.id,
      },
    });
    if (!manager) {
      throw new NotFoundException('Branch manager not found.');
    }

    await this.users.remove(manager);
  }

  private toRecord(user: User, branchName: string): BranchManagerRecord {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      branchId: user.branchId ?? '',
      branchName,
      createdAt: user.createdAt.toISOString(),
    };
  }
}