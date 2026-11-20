import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCatalogServiceDto } from './dto/create-catalog-service.dto';
import { UpdateCatalogServiceDto } from './dto/update-catalog-service.dto';
import { BranchesService } from '../branches/branches.service';
import { CatalogService as CatalogServiceEntity } from '../entities/catalog-service.entity';
import { User } from '../users/user.entity';
import {
  assertBusinessOwner,
  resolveBusinessPortalAccess,
} from '../business-portal/business-portal.access';
import { DEFAULT_CATALOG_SERVICES } from './default-services';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(CatalogServiceEntity)
    private readonly services: Repository<CatalogServiceEntity>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly branches: BranchesService,
  ) {}

  async ensureDefaultCatalog(businessId: string) {
    const count = await this.services.count({ where: { businessId } });
    if (count > 0) return;

    const rows = DEFAULT_CATALOG_SERVICES.map((item) =>
      this.services.create({
        businessId,
        category: item.category,
        name: item.name,
        unitPriceNgn: item.unitPriceNgn,
      }),
    );
    await this.services.save(rows);
  }

  private toServiceDto(row: CatalogServiceEntity) {
    return {
      id: row.id,
      category: row.category,
      name: row.name,
      unitPriceNgn: row.unitPriceNgn,
    };
  }

  private async getOwnedService(businessId: string, serviceId: string) {
    const row = await this.services.findOne({
      where: { id: serviceId, businessId },
    });
    if (!row) {
      throw new NotFoundException('Service not found.');
    }
    return row;
  }

  private normalizeLabel(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  async listServicesForBusiness(business: User) {
    assertBusinessOwner(business);
    await this.ensureDefaultCatalog(business.id);
    const rows = await this.services.find({
      where: { businessId: business.id },
      order: { category: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => this.toServiceDto(row));
  }

  async createServiceForBusiness(business: User, dto: CreateCatalogServiceDto) {
    assertBusinessOwner(business);
    await this.ensureDefaultCatalog(business.id);
    const category = this.normalizeLabel(dto.category);
    const name = this.normalizeLabel(dto.name);

    const duplicate = await this.services.findOne({
      where: { businessId: business.id, category, name },
    });
    if (duplicate) {
      throw new ConflictException(
        'An item with this name already exists in that category.',
      );
    }

    const saved = await this.services.save(
      this.services.create({
        businessId: business.id,
        category,
        name,
        unitPriceNgn: dto.unitPriceNgn,
      }),
    );
    return this.toServiceDto(saved);
  }

  async updateServiceForBusiness(
    business: User,
    serviceId: string,
    dto: UpdateCatalogServiceDto,
  ) {
    assertBusinessOwner(business);
    const row = await this.getOwnedService(business.id, serviceId);
    const category =
      dto.category !== undefined
        ? this.normalizeLabel(dto.category)
        : row.category;
    const name =
      dto.name !== undefined ? this.normalizeLabel(dto.name) : row.name;

    if (category !== row.category || name !== row.name) {
      const duplicate = await this.services.findOne({
        where: {
          businessId: business.id,
          category,
          name,
        },
      });
      if (duplicate && duplicate.id !== row.id) {
        throw new ConflictException(
          'An item with this name already exists in that category.',
        );
      }
    }

    row.category = category;
    row.name = name;
    if (dto.unitPriceNgn !== undefined) {
      row.unitPriceNgn = dto.unitPriceNgn;
    }

    const saved = await this.services.save(row);
    return this.toServiceDto(saved);
  }

  async deleteServiceForBusiness(business: User, serviceId: string) {
    assertBusinessOwner(business);
    const row = await this.getOwnedService(business.id, serviceId);
    await this.services.remove(row);
    return { ok: true };
  }

  async listCustomersForBusiness(business: User) {
    const access = resolveBusinessPortalAccess(business);
    const customers = await this.users.find({
      where: { role: 'customer', businessId: access.ownerUserId },
      order: { fullName: 'ASC' },
    });
    return customers.map((c) => ({
      id: c.id,
      name: c.fullName,
      phone: c.phone,
    }));
  }

  private async listServicesForOwner(businessId: string) {
    await this.ensureDefaultCatalog(businessId);
    const rows = await this.services.find({
      where: { businessId },
      order: { category: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => this.toServiceDto(row));
  }

  async getNewOrderCatalog(business: User) {
    const access = resolveBusinessPortalAccess(business);
    const owner = await this.users.findOne({
      where: { id: access.ownerUserId, role: 'business' },
    });
    const [customers, services, branchRows] = await Promise.all([
      this.listCustomersForBusiness(business),
      this.listServicesForOwner(access.ownerUserId),
      this.branches.ensureAtLeastOne(
        access.ownerUserId,
        owner?.businessName ?? null,
      ),
    ]);
    const visibleBranches = access.branchId
      ? branchRows.filter((branch) => branch.id === access.branchId)
      : branchRows;
    return {
      customers,
      services,
      branches: visibleBranches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
      })),
    };
  }
}
