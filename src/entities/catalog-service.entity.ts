import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('catalog_services')
export class CatalogService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Column({ type: 'varchar', length: 64 })
  category: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'int', name: 'unit_price_ngn' })
  unitPriceNgn: number;
}
