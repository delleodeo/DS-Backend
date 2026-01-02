const Order = require('../../modules/orders/orders.model');
const {
  updateOrderStatusService,
  addAgreementMessageService,
} = require('../../modules/orders/orders.service');

const { ConflictError, AuthorizationError } = require('../../utils/errorHandler');

jest.mock('../../modules/orders/orders.model');

describe('orders.service', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('updateOrderStatusService throws ConflictError for invalid transition', async () => {
    const mockOrder = {
      _id: 'oid',
      status: 'delivered',
      save: jest.fn().mockResolvedValue({}),
    };

    jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);

    await expect(updateOrderStatusService('oid', 'pending')).rejects.toThrow(ConflictError);
  });

  test('addAgreementMessageService throws AuthorizationError when user is not part of the order', async () => {
    const mockOrder = {
      _id: 'orderid',
      customerId: 'cust1',
      vendorId: 'vend1',
      status: 'pending',
      agreementMessages: [],
      save: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
    };

    jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);

    await expect(addAgreementMessageService({ orderId: 'orderid', userId: 'someone-else', message: 'Hi', role: 'customer' }))
      .rejects.toThrow(AuthorizationError);
  });

  test('addAgreementMessageService strips HTML from message and saves', async () => {
    const mockOrder = {
      _id: 'orderid2',
      customerId: 'cust2',
      vendorId: 'vend2',
      status: 'pending',
      agreementMessages: [],
      save: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
    };

    jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);

    const updated = await addAgreementMessageService({ orderId: 'orderid2', userId: 'cust2', message: '<b>Hello</b> <i>there</i>', role: 'customer' });

    expect(updated.agreementMessages.length).toBe(1);
    expect(updated.agreementMessages[0].message).toBe('Hello there');
  });
});