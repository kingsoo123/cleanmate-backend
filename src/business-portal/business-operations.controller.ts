import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { CreateCatalogServiceDto } from '../catalog/dto/create-catalog-service.dto';
import { UpdateCatalogServiceDto } from '../catalog/dto/update-catalog-service.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { BulkSendMessageDto } from '../messages/dto/bulk-send-message.dto';
import { SendMessageDto } from '../messages/dto/send-message.dto';
import { MessagesService } from '../messages/messages.service';
import { CreateWalkInOrderDto } from '../orders/dto/create-walk-in-order.dto';
import { RecordPaymentDto } from '../orders/dto/record-payment.dto';
import { BulkUpdateOrderStatusDto } from '../orders/dto/bulk-update-order-status.dto';
import { UpdateOrderStatusDto } from '../orders/dto/update-order-status.dto';
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
@Roles('business', 'branch_manager')
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
  @Roles('business')
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
  @Roles('business')
  updateNotificationSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notifications.updateSettings(user, dto);
  }

  @Get('reports')
  @Roles('business')
  getReports(@CurrentUser() user: User) {
    return this.reports.getSnapshotsForBusiness(user);
  }

  @Get('orders/catalog')
  getNewOrderCatalog(@CurrentUser() user: User) {
    return this.catalog.getNewOrderCatalog(user);
  }

  @Get('catalog/services')
  @Roles('business')
  listCatalogServices(@CurrentUser() user: User) {
    return this.catalog.listServicesForBusiness(user);
  }

  @Post('catalog/services')
  @Roles('business')
  createCatalogService(
    @CurrentUser() user: User,
    @Body() dto: CreateCatalogServiceDto,
  ) {
    return this.catalog.createServiceForBusiness(user, dto);
  }

  @Patch('catalog/services/:id')
  @Roles('business')
  updateCatalogService(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogServiceDto,
  ) {
    return this.catalog.updateServiceForBusiness(user, id, dto);
  }

  @Delete('catalog/services/:id')
  @HttpCode(204)
  @Roles('business')
  async deleteCatalogService(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    await this.catalog.deleteServiceForBusiness(user, id);
  }

  @Post('orders/walk-in')
  createWalkInOrder(
    @CurrentUser() user: User,
    @Body() dto: CreateWalkInOrderDto,
  ) {
    return this.orders.createWalkInOrder(user, dto);
  }

  @Get('pickups')
  @Roles('business')
  async listPickups(@CurrentUser() user: User) {
    const [pickups, riders] = await Promise.all([
      this.pickups.listForBusiness(user),
      this.pickups.listRidersForBusiness(user),
    ]);
    return { pickups, riders };
  }

  @Patch('pickups/:id')
  @Roles('business')
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

  @Patch('orders/bulk-status')
  bulkUpdateOrderStatus(
    @CurrentUser() user: User,
    @Body() dto: BulkUpdateOrderStatusDto,
  ) {
    return this.orders.bulkUpdateOrderStatusForBusiness(user, dto);
  }

  @Patch('orders/:id')
  updateOrderStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateOrderStatusForBusiness(user, id, dto);
  }

  @Get('payments')
  @Roles('business')
  listPayments(@CurrentUser() user: User) {
    return this.orders.getBusinessPaymentsBundle(user);
  }

  @Post('payments')
  @Roles('business')
  recordPayment(@CurrentUser() user: User, @Body() dto: RecordPaymentDto) {
    return this.orders.recordPayment(user, dto);
  }

  @Patch('payments/:id/verify')
  @Roles('business')
  verifyPayment(@CurrentUser() user: User, @Param('id') id: string) {
    return this.orders.verifyPayment(user, id);
  }

  @Get('messages/conversations')
  @Roles('business')
  listMessageConversations(@CurrentUser() user: User) {
    return this.messages.listConversationsForBusiness(user);
  }

  @Get('messages/conversations/:customerId')
  @Roles('business')
  getMessageThread(
    @CurrentUser() user: User,
    @Param('customerId') customerId: string,
  ) {
    return this.messages.getBusinessThread(user, customerId);
  }

  @Post('messages/bulk')
  @Roles('business')
  @HttpCode(200)
  sendBulkMessages(
    @CurrentUser() user: User,
    @Body() dto: BulkSendMessageDto,
  ) {
    return this.messages.bulkSendAsBusinessOwner(user, dto.body, {
      includeCustomers: dto.includeCustomers,
      includeStaff: dto.includeStaff,
    });
  }

  @Post('messages/conversations/:customerId')
  @Roles('business')
  sendMessageToCustomer(
    @CurrentUser() user: User,
    @Param('customerId') customerId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.sendAsBusiness(user, customerId, dto.body);
  }

  @Post('messages/conversations/:customerId/typing')
  @Roles('business')
  recordTyping(
    @CurrentUser() user: User,
    @Param('customerId') customerId: string,
  ) {
    return this.messages.recordBusinessTyping(user, customerId);
  }
}
