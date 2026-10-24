import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from '../catalog/catalog.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { SendMessageDto } from '../messages/dto/send-message.dto';
import { MessagesService } from '../messages/messages.service';
import { CreateWalkInOrderDto } from '../orders/dto/create-walk-in-order.dto';
import { RecordPaymentDto } from '../orders/dto/record-payment.dto';
import { OrdersService } from '../orders/orders.service';
import { MarkInboxReadDto } from '../notifications/dto/mark-inbox-read.dto';
import { UpdateNotificationSettingsDto } from '../notifications/dto/update-notification-settings.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportsService } from '../reports/reports.service';
import { UpdatePickupDto } from '../pickups/dto/update-pickup.dto';
import { PickupsService } from '../pickups/pickups.service';
import { User } from '../users/user.entity';

@Controller('business')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('business')
export class BusinessOperationsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly pickups: PickupsService,
    private readonly orders: OrdersService,
    private readonly catalog: CatalogService,
    private readonly messages: MessagesService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: User) {
    return this.dashboard.getDashboardForBusiness(user);
  }

  @Get('notifications')
  getNotifications(@CurrentUser() user: User) {
    return this.notifications.getBundleForBusiness(user);
  }

  @Get('notifications/inbox')
  getNotificationInbox(@CurrentUser() user: User) {
    return this.notifications.getInboxSummaryForBusiness(user);
  }

  @Patch('notifications/inbox/read')
  markNotificationsRead(
    @CurrentUser() user: User,
    @Body() dto: MarkInboxReadDto,
  ) {
    return this.notifications.markInboxRead(user, dto);
  }

  @Patch('notifications/settings')
  updateNotificationSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notifications.updateSettings(user, dto);
  }

  @Get('reports')
  getReports(@CurrentUser() user: User) {
    return this.reports.getSnapshotsForBusiness(user);
  }

  @Get('orders/catalog')
  getNewOrderCatalog(@CurrentUser() user: User) {
    return this.catalog.getNewOrderCatalog(user);
  }

  @Post('orders/walk-in')
  createWalkInOrder(
    @CurrentUser() user: User,
    @Body() dto: CreateWalkInOrderDto,
  ) {
    return this.orders.createWalkInOrder(user, dto);
  }

  @Get('pickups')
  async listPickups(@CurrentUser() user: User) {
    const [pickups, riders] = await Promise.all([
      this.pickups.listForBusiness(user),
      this.pickups.listRidersForBusiness(user),
    ]);
    return { pickups, riders };
  }

  @Patch('pickups/:id')
  updatePickup(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdatePickupDto,
  ) {
    return this.pickups.updateForBusiness(user, id, dto);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: User) {
    return this.orders.listForBusiness(user);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() user: User, @Param('id') id: string) {
    return this.orders.getOneForBusiness(user, id);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: User) {
    return this.orders.getBusinessPaymentsBundle(user);
  }

  @Post('payments')
  recordPayment(@CurrentUser() user: User, @Body() dto: RecordPaymentDto) {
    return this.orders.recordPayment(user, dto);
  }

  @Patch('payments/:id/verify')
  verifyPayment(@CurrentUser() user: User, @Param('id') id: string) {
    return this.orders.verifyPayment(user, id);
  }

  @Get('messages/conversations')
  listMessageConversations(@CurrentUser() user: User) {
    return this.messages.listConversationsForBusiness(user);
  }

  @Get('messages/conversations/:customerId')
  getMessageThread(
    @CurrentUser() user: User,
    @Param('customerId') customerId: string,
  ) {
    return this.messages.getBusinessThread(user, customerId);
  }

  @Post('messages/conversations/:customerId')
  sendMessageToCustomer(
    @CurrentUser() user: User,
    @Param('customerId') customerId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.sendAsBusiness(user, customerId, dto.body);
  }

  @Post('messages/conversations/:customerId/typing')
  recordTyping(
    @CurrentUser() user: User,
    @Param('customerId') customerId: string,
  ) {
    return this.messages.recordBusinessTyping(user, customerId);
  }
}
