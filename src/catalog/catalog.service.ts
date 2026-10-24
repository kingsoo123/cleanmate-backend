import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchesService } from '../branches/branches.service';
import { CatalogService as CatalogServiceEntity } from '../entities/catalog-service.entity';
import { User } from '../users/user.entity';
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

  async listServicesForBusiness(business: User) {
    await this.ensureDefaultCatalog(business.id);
    const rows = await this.services.find({
      where: { businessId: business.id },
      order: { category: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      name: row.name,
      unitPriceNgn: row.unitPriceNgn,
    }));
  }

  async listCustomersForBusiness(business: User) {
    const customers = await this.users.find({
      where: { role: 'customer', businessId: business.id },
      order: { fullName: 'ASC' },
    });
    return customers.map((c) => ({
      id: c.id,
      name: c.fullName,
      phone: c.phone,
    }));
  }

  async getNewOrderCatalog(business: User) {
    const [customers, services, branchRows] = await Promise.all([
      this.listCustomersForBusiness(business),
      this.listServicesForBusiness(business),
      this.branches.ensureAtLeastOne(business.id, business.businessName),
    ]);
    return {
      customers,
      services,
      branches: branchRows.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
      })),
    };
  }
}
