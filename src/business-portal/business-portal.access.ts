import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LaundryOrder } from '../entities/laundry-order.entity';
import { User } from '../users/user.entity';

export type BusinessPortalAccess = {
  actor: User;
  ownerUserId: string;
  branchId: string | null;
  isOwner: boolean;
};

export function resolveBusinessPortalAccess(user: User): BusinessPortalAccess {
  if (user.role === 'business') {
    return {
      actor: user,
      ownerUserId: user.id,
      branchId: null,
      isOwner: true,
    };
  }
  if (user.role === 'branch_manager') {
    if (!user.businessId || !user.branchId) {
      throw new ForbiddenException('Branch manager account is misconfigured.');
    }
    return {
      actor: user,
      ownerUserId: user.businessId,
      branchId: user.branchId,
      isOwner: false,
    };
  }
  throw new ForbiddenException();
}

export function assertBusinessOwner(user: User): void {
  if (user.role !== 'business') {
    throw new ForbiddenException('Only the business owner can do this.');
  }
}

export function assertOrderInPortalScope(
  access: BusinessPortalAccess,
  order: Pick<LaundryOrder, 'businessId' | 'branchId'>,
): void {
  if (order.businessId !== access.ownerUserId) {
    throw new NotFoundException('Order not found.');
  }
  if (access.branchId && order.branchId !== access.branchId) {
    throw new ForbiddenException('This order belongs to another branch.');
  }
}

export function orderListWhere(access: BusinessPortalAccess) {
  if (access.branchId) {
    return { businessId: access.ownerUserId, branchId: access.branchId };
  }
  return { businessId: access.ownerUserId };
}