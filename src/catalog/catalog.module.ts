import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogService as CatalogServiceEntity } from '../entities/catalog-service.entity';
import { User } from '../users/user.entity';
import { CatalogService } from './catalog.service';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogServiceEntity, User])],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
