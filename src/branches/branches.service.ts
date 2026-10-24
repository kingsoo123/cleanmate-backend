import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessBranch } from '../entities/business-branch.entity';

export type BranchInput = {
  name: string;
  address?: string | null;
};

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(BusinessBranch)
    private readonly branches: Repository<BusinessBranch>,
  ) {}

  async createMany(businessId: string, inputs: BranchInput[]) {
    const normalized = inputs
      .map((row) => ({
        name: row.name.trim(),
        address: row.address?.trim() || null,
      }))
      .filter((row) => row.name.length > 0);

    const toSave =
      normalized.length > 0
        ? normalized.map((row) =>
            this.branches.create({
              businessId,
              name: row.name,
              address: row.address,
            }),
          )
        : [
            this.branches.create({
              businessId,
              name: 'Main branch',
              address: null,
            }),
          ];

    return this.branches.save(toSave);
  }

  listForBusiness(businessId: string) {
    return this.branches.find({
      where: { businessId },
      order: { createdAt: 'ASC' },
    });
  }

  async ensureAtLeastOne(businessId: string, businessName?: string | null) {
    const existing = await this.listForBusiness(businessId);
    if (existing.length > 0) {
      return existing;
    }
    const label = businessName?.trim()
      ? `${businessName.trim()} — Main`
      : 'Main branch';
    return this.createMany(businessId, [{ name: label }]);
  }

  async assertOwnedByBusiness(businessId: string, branchId: string) {
    const branch = await this.branches.findOne({
      where: { id: branchId, businessId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }
    return branch;
  }
}
