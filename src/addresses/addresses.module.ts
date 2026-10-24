import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAddress } from '../entities/customer-address.entity';
import { AddressesService } from './addresses.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerAddress])],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
