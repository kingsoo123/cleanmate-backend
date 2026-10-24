import type { PickupRequestStatus } from '../entities/pickup-request.entity';

export type PickupAction =
  | 'accept'
  | 'decline'
  | 'assign'
  | 'en_route'
  | 'collected'
  | 'received'
  | 'convert';

export function nextPickupStatus(
  current: PickupRequestStatus,
  action: PickupAction,
): PickupRequestStatus {
  switch (action) {
    case 'decline':
      return 'Declined';
    case 'accept':
      return 'Accepted';
    case 'assign':
      return 'Driver Assigned';
    case 'en_route':
      return 'En Route';
    case 'collected':
      return 'Collected';
    case 'received':
      return 'Received at Facility';
    case 'convert':
      return 'Converted to Order';
    default:
      return current;
  }
}
