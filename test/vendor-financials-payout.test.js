const { getVendorFinancials } = require('../modules/vendors/vendors.service');
const Order = require('../modules/orders/orders.model');
const Vendor = require('../modules/vendors/vendors.model');

jest.mock('../modules/orders/orders.model', () => ({ find: jest.fn() }));
jest.mock('../modules/vendors/vendors.model', () => ({ findOne: jest.fn(), findById: jest.fn() }));

describe('getVendorFinancials payout-aware summary', () => {
  const now = new Date();
  const currentYear = now.getFullYear();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes commission, net, and pending admin release correctly', async () => {
    const mockOrders = [
      {
        _id: 'order1',
        subTotal: 100,
        commissionAmount: 7,
        sellerEarnings: 93,
        commissionStatus: 'paid',
        paymentMethod: 'gcash',
        payoutStatus: 'pending',
        escrowStatus: 'pending_release',
        createdAt: new Date(currentYear, 0, 2),
        shippingAddress: { fullName: 'Alice' }
      },
      {
        _id: 'order2',
        subTotal: 50,
        commissionAmount: 3.5,
        sellerEarnings: 46.5,
        commissionStatus: 'pending',
        paymentMethod: 'cod',
        payoutStatus: 'not_applicable',
        escrowStatus: 'not_applicable',
        createdAt: new Date(currentYear, 0, 3),
        shippingAddress: { fullName: 'Bob' }
      }
    ];

    Order.find.mockReturnValue({
      sort: () => ({
        lean: async () => mockOrders
      })
    });

    Vendor.findOne.mockResolvedValue({ commissionRate: 0.07 });
    Vendor.findById.mockResolvedValue({ commissionRate: 0.07 });

    const result = await getVendorFinancials('vendor-123');

    expect(result.success).toBe(true);
    expect(result.summary.totalGrossRevenue).toBeCloseTo(150);
    expect(result.summary.totalCommissionPaid).toBeCloseTo(7);
    expect(result.summary.totalCommissionPending).toBeCloseTo(3.5);
    expect(result.summary.totalNetEarnings).toBeCloseTo(139.5);
    expect(result.summary.pendingAdminRelease).toBeCloseTo(93);
    expect(result.summary.netEarningsReleased).toBeCloseTo(0);
    expect(result.summary.codPendingCommission).toBeCloseTo(3.5);
  });
});
