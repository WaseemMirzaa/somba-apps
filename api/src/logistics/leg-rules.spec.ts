import {
  canScanInAt,
  canScanOutAt,
  isHubBound,
  isOrderFlow,
  managingHub,
  movesForward,
  orderStatusFor,
  riderFits,
  riderHubIds,
  riderNext,
  touchesHub,
} from './leg-rules';
import { tierAllows, tierOf } from './tiers';
import type { DeliveryKind, DeliveryStatus } from '../database/entities';

const task = (kind: DeliveryKind, o: Partial<{ status: DeliveryStatus; hubId: string | null; fromHubId: string | null; toHubId: string | null }> = {}) => ({
  kind,
  status: 'unassigned' as DeliveryStatus,
  hubId: null,
  fromHubId: null,
  toHubId: null,
  ...o,
});

describe('leg transitions (rider)', () => {
  it('lets a rider walk assigned -> picked_up -> in_transit -> delivered on a leg that ends at a customer or seller', () => {
    for (const kind of ['delivery', 'replacement_delivery', 'return_to_seller'] as const) {
      expect(riderNext(kind, 'assigned')).toEqual(['picked_up', 'failed']);
      expect(riderNext(kind, 'picked_up')).toEqual(['in_transit', 'failed']);
      expect(riderNext(kind, 'in_transit')).toEqual(['delivered', 'failed']);
    }
  });

  it('does not let a rider finish a leg that ends at a warehouse (staff scan it in)', () => {
    for (const kind of ['pickup', 'transfer', 'return_pickup', 'return_transfer'] as const) {
      expect(isHubBound(kind)).toBe(true);
      expect(riderNext(kind, 'in_transit')).toEqual(['failed']);
    }
  });

  it('offers nothing from unassigned (a rider is assigned, never self-served) or from a finished task', () => {
    expect(riderNext('delivery', 'unassigned')).toEqual([]);
    expect(riderNext('delivery', 'delivered')).toEqual([]);
    expect(riderNext('pickup', 'failed')).toEqual([]);
  });
});

describe('who manages and who may run a leg', () => {
  it('the managing warehouse is where the staff who assign the rider work', () => {
    expect(managingHub('pickup', null, 'O')).toBe('O');
    expect(managingHub('transfer', 'O', 'D')).toBe('O');
    expect(managingHub('delivery', 'D', null)).toBe('D');
    expect(managingHub('return_pickup', null, 'D')).toBe('D');
    expect(managingHub('return_transfer', 'D', 'O')).toBe('D');
    expect(managingHub('return_to_seller', 'O', null)).toBe('O');
  });

  it('riders: own warehouse only, except transfers which may use either end', () => {
    const pickup = task('pickup', { hubId: 'O', toHubId: 'O' });
    expect(riderHubIds(pickup)).toEqual(['O']);
    expect(riderFits(pickup, 'O')).toBe(true);
    expect(riderFits(pickup, 'D')).toBe(false);
    expect(riderFits(pickup, null)).toBe(false);
    const transfer = task('transfer', { hubId: 'O', fromHubId: 'O', toHubId: 'D' });
    expect(riderHubIds(transfer).sort()).toEqual(['D', 'O']);
    expect(riderFits(transfer, 'D')).toBe(true);
    expect(riderFits(transfer, 'X')).toBe(false);
    const delivery = task('delivery', { hubId: 'D', fromHubId: 'D' });
    expect(riderFits(delivery, 'O')).toBe(false);
  });

  it('a legacy task tied to no warehouse accepts any rider', () => {
    expect(riderFits(task('delivery'), 'anything')).toBe(true);
  });

  it('a warehouse sees the legs it manages, sends or receives', () => {
    const transfer = task('transfer', { hubId: 'O', fromHubId: 'O', toHubId: 'D' });
    expect(touchesHub(transfer, 'O')).toBe(true);
    expect(touchesHub(transfer, 'D')).toBe(true);
    expect(touchesHub(transfer, 'X')).toBe(false);
  });
});

describe('scan in / scan out', () => {
  it('only staff of the receiving warehouse can scan a hub-bound leg in, while it is open', () => {
    const pickup = task('pickup', { status: 'in_transit', hubId: 'O', toHubId: 'O' });
    expect(canScanInAt(pickup, 'O')).toBe(true);
    expect(canScanInAt(pickup, 'D')).toBe(false);
    expect(canScanInAt({ ...pickup, status: 'delivered' }, 'O')).toBe(false);
    expect(canScanInAt({ ...pickup, status: 'failed' }, 'O')).toBe(false);
    expect(canScanInAt(task('delivery', { status: 'in_transit', hubId: 'D', fromHubId: 'D' }), 'D')).toBe(false);
  });

  it('only staff of the sending warehouse hand over an assigned parcel', () => {
    const transfer = task('transfer', { status: 'assigned', hubId: 'O', fromHubId: 'O', toHubId: 'D' });
    expect(canScanOutAt(transfer, 'O')).toBe(true);
    expect(canScanOutAt(transfer, 'D')).toBe(false);
    expect(canScanOutAt({ ...transfer, status: 'unassigned' }, 'O')).toBe(false);
    expect(canScanOutAt(task('pickup', { status: 'assigned', toHubId: 'O' }), 'O')).toBe(false);
  });
});

describe('order status follows the order legs, forward only', () => {
  it('maps pickup assigned -> processing and delivery picked_up/in_transit/delivered', () => {
    expect(orderStatusFor('pickup', 'assigned')).toBe('processing');
    expect(orderStatusFor('pickup', 'delivered')).toBeNull();
    expect(orderStatusFor('transfer', 'picked_up')).toBeNull();
    expect(orderStatusFor('delivery', 'picked_up')).toBe('shipped');
    expect(orderStatusFor('delivery', 'in_transit')).toBe('out_for_delivery');
    expect(orderStatusFor('delivery', 'delivered')).toBe('delivered');
    expect(orderStatusFor('replacement_delivery', 'delivered')).toBeNull();
  });

  it('never moves an order back', () => {
    expect(movesForward('confirmed', 'processing')).toBe(true);
    expect(movesForward('pending', 'processing')).toBe(true);
    expect(movesForward('shipped', 'processing')).toBe(false);
    expect(movesForward('out_for_delivery', 'out_for_delivery')).toBe(false);
    expect(movesForward('delivered', 'shipped')).toBe(false);
    expect(movesForward('cancelled', 'shipped')).toBe(false);
  });

  it('only the order own legs count as order flow', () => {
    expect(isOrderFlow({ kind: 'pickup' })).toBe(true);
    expect(isOrderFlow({ kind: 'delivery' })).toBe(true);
    expect(isOrderFlow({ kind: 'pickup', replacementId: 'r1' })).toBe(false);
    expect(isOrderFlow({ kind: 'return_pickup', disputeId: 'd1' })).toBe(false);
    expect(isOrderFlow({ kind: 'replacement_delivery', exchangeId: 'e1' })).toBe(false);
  });
});

describe('warehouse tiers', () => {
  it('operators scan, supervisors also assign, managers also manage; admins do everything', () => {
    expect(tierAllows('warehouse_staff', 'operator', 'scan')).toBe(true);
    expect(tierAllows('warehouse_staff', 'operator', 'assign')).toBe(false);
    expect(tierAllows('warehouse_staff', 'operator', 'manage')).toBe(false);
    expect(tierAllows('warehouse_staff', 'supervisor', 'assign')).toBe(true);
    expect(tierAllows('warehouse_staff', 'supervisor', 'manage')).toBe(false);
    expect(tierAllows('warehouse_staff', 'manager', 'manage')).toBe(true);
    expect(tierAllows('admin', null, 'manage')).toBe(true);
    expect(tierAllows('admin_operations', undefined, 'assign')).toBe(true);
  });

  it('a staff account with no tier is an operator; riders and customers get nothing', () => {
    expect(tierOf(null)).toBe('operator');
    expect(tierOf('bogus')).toBe('operator');
    expect(tierAllows('warehouse_staff', null, 'assign')).toBe(false);
    expect(tierAllows('rider', 'manager', 'scan')).toBe(false);
    expect(tierAllows('customer', null, 'scan')).toBe(false);
  });
});
