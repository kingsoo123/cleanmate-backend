import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateAddressDto } from '../addresses/dto/create-address.dto';
import { AddressesService } from '../addresses/addresses.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SendMessageDto } from '../messages/dto/send-message.dto';
import { MessagesService } from '../messages/messages.service';
import { CreatePickupDto } from '../pickups/dto/create-pickup.dto';
import { PickupsService } from '../pickups/pickups.service';
import { SubmitCustomerPaymentDto } from '../orders/dto/submit-customer-payment.dto';
import { MarkCustomerNotificationsReadDto } from '../notifications/dto/mark-customer-notifications-read.dto';
import { CustomerNotificationsService } from '../notifications/customer-notifications.service';
import { OrdersService } from '../orders/orders.service';
import { User } from '../users/user.entity';
import { CustomerPortalService } from './customer-portal.service';

@Controller('customer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('customer')
export class CustomerPortalController {
  constructor(
    private readonly portal: CustomerPortalService,
    private readonly addresses: AddressesService,
    private readonly pickups: PickupsService,
    private readonly orders: OrdersService,
    private readonly messages: MessagesService,
    private readonly notifications: CustomerNotificationsService,
  ) {}

  @Get('notifications')
  listNotifications(@CurrentUser() user: User) {
    return this.notifications.listForCustomer(user);
  }

  @Patch('notifications/read')
  markNotificationsRead(
    @CurrentUser() user: User,
    @Body() dto: MarkCustomerNotificationsReadDto,
  ) {
    return this.notifications.markRead(user, dto);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: User) {
    return this.portal.getDashboard(user);
  }

  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return this.portal.getProfile(user);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: User) {
    return this.addresses.listForCustomer(user);
  }

  @Post('addresses')
  createAddress(@CurrentUser() user: User, @Body() dto: CreateAddressDto) {
    return this.addresses.createForCustomer(user, dto);
  }

  @Get('pickups')
  listPickups(@CurrentUser() user: User) {
    return this.pickups.listForCustomer(user);
  }

  @Post('pickups')
  createPickup(@CurrentUser() user: User, @Body() dto: CreatePickupDto) {
    return this.pickups.createForCustomer(user, dto);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: User) {
    return this.orders.listForCustomer(user);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() user: User, @Param('id') id: string) {
    return this.orders.getOneForCustomer(user, id);
  }

  @Get('payments')
  getPaymentsOverview(@CurrentUser() user: User) {
    return this.orders.getCustomerPaymentsOverview(user);
  }

  @Post('payments')
  submitPayment(
    @CurrentUser() user: User,
    @Body() dto: SubmitCustomerPaymentDto,
  ) {
    return this.orders.submitCustomerPayment(user, dto);
  }

  @Get('messages')
  getMessages(@CurrentUser() user: User) {
    return this.messages.getCustomerThread(user);
  }

  @Post('messages')
  sendMessage(@CurrentUser() user: User, @Body() dto: SendMessageDto) {
    return this.messages.sendAsCustomer(user, dto.body);
  }

  @Post('messages/typing')
  recordTyping(@CurrentUser() user: User) {
    return this.messages.recordCustomerTyping(user);
  }
}
