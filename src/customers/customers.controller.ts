import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/user.entity';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('business/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('business')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.customers.listForBusiness(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateCustomerDto) {
    return this.customers.createForBusiness(user, dto);
  }
}
