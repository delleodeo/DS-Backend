require('dotenv').config();

const mongoose = require("mongoose");
const Payment = require("../modules/payments/payments.model");
const paymentService = require("../modules/payments/payments.service");
const paymongoClient = require("../utils/paymongoClient");

// Mock dependencies
jest.mock("../utils/paymongoClient");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock Order model
jest.mock("../modules/orders/orders.model", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const Order = require("../modules/orders/orders.model");

// Increase Jest timeout for all tests
jest.setTimeout(30000);

// Global setup - connect once before all tests
beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
}, 30000);

// Global teardown - disconnect after all tests
afterAll(async () => {
  await Payment.deleteMany({});
  await mongoose.connection.close();
}, 30000);

describe("Payment Model", () => {
  afterEach(async () => {
    await Payment.deleteMany({});
  });

  describe("Schema Validation", () => {
    it("should create a valid checkout payment", async () => {
      const paymentData = {
        userId: new mongoose.Types.ObjectId(),
        orderId: new mongoose.Types.ObjectId(),
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        fee: 1750,
        netAmount: 48250,
        currency: "PHP",
        status: "pending",
      };

      const payment = new Payment(paymentData);
      const savedPayment = await payment.save();

      expect(savedPayment._id).toBeDefined();
      expect(savedPayment.type).toBe("checkout");
      expect(savedPayment.amount).toBe(50000);
    });

    it("should fail validation with invalid amount", async () => {
      const paymentData = {
        userId: new mongoose.Types.ObjectId(),
        type: "checkout",
        provider: "paymongo",
        amount: -100, // Invalid negative amount
        netAmount: -100,
      };

      const payment = new Payment(paymentData);
      await expect(payment.save()).rejects.toThrow();
    });

    it("should fail validation with invalid type", async () => {
      const paymentData = {
        userId: new mongoose.Types.ObjectId(),
        type: "invalid_type",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
      };

      const payment = new Payment(paymentData);
      await expect(payment.save()).rejects.toThrow();
    });

    it("should calculate net amount correctly in pre-save hook", async () => {
      const payment = new Payment({
        userId: new mongoose.Types.ObjectId(),
        type: "checkout",
        provider: "paymongo",
        amount: 100000,
        fee: 3500,
        netAmount: 0, // Will be calculated
      });

      await payment.save();
      expect(payment.netAmount).toBe(96500);
    });
  });

  describe("Instance Methods", () => {
    let payment;

    beforeEach(async () => {
      payment = await Payment.create({
        userId: new mongoose.Types.ObjectId(),
        orderId: new mongoose.Types.ObjectId(),
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        fee: 1750,
        netAmount: 48250,
        status: "processing",
      });
    });

    it("should mark payment as succeeded", async () => {
      const gatewayData = { id: "test_123", status: "succeeded" };
      await payment.markAsSucceeded(gatewayData);

      expect(payment.status).toBe("succeeded");
      expect(payment.isFinal).toBe(true);
      expect(payment.paidAt).toBeDefined();
      expect(payment.gatewayResponse).toEqual(gatewayData);
    });

    it("should mark payment as failed", async () => {
      const reason = "Card declined";
      await payment.markAsFailed(reason);

      expect(payment.status).toBe("failed");
      expect(payment.isFinal).toBe(true);
      expect(payment.failureReason).toBe(reason);
    });

    it("should mark payment as refunded", async () => {
      payment.status = "succeeded";
      await payment.save();

      await payment.markAsRefunded({ refund_id: "ref_123" });

      expect(payment.status).toBe("refunded");
      expect(payment.isFinal).toBe(true);
      expect(payment.refundedAt).toBeDefined();
    });

    it("should check if payment can be refunded", async () => {
      payment.status = "succeeded";
      payment.type = "checkout";
      payment.isFinal = false;

      expect(payment.canBeRefunded()).toBe(true);

      payment.isFinal = true;
      expect(payment.canBeRefunded()).toBe(false);
    });

    it("should increment retry count", async () => {
      expect(payment.retryCount).toBe(0);
      await payment.incrementRetry();
      expect(payment.retryCount).toBe(1);
    });
  });

  describe("Static Methods", () => {
    let userId, orderId;

    beforeEach(async () => {
      userId = new mongoose.Types.ObjectId();
      orderId = new mongoose.Types.ObjectId();

      await Payment.create([
        {
          userId,
          orderId,
          type: "checkout",
          provider: "paymongo",
          amount: 50000,
          netAmount: 50000,
          status: "succeeded",
          paymentIntentId: "pi_123",
          paidAt: new Date("2026-01-01"),
        },
        {
          userId,
          type: "cash_in",
          provider: "paymongo",
          amount: 100000,
          netAmount: 100000,
          status: "succeeded",
          paidAt: new Date("2026-01-02"),
        },
      ]);
    });

    it("should find payment by intent ID", async () => {
      const payment = await Payment.findByIntent("pi_123");
      expect(payment).toBeDefined();
      expect(payment.paymentIntentId).toBe("pi_123");
    });

    it("should find payments by order ID", async () => {
      const payments = await Payment.findByOrder(orderId);
      expect(payments).toHaveLength(1);
      expect(payments[0].orderId.toString()).toBe(orderId.toString());
    });

    it("should find user payments filtered by type", async () => {
      const payments = await Payment.findUserPayments(userId, "checkout");
      expect(payments).toHaveLength(1);
      expect(payments[0].type).toBe("checkout");
    });

    it("should calculate total revenue", async () => {
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-31");
      
      const result = await Payment.getTotalRevenue(startDate, endDate);
      
      expect(result).toHaveLength(1);
      expect(result[0].totalRevenue).toBe(50000);
      expect(result[0].totalTransactions).toBe(1);
    });
  });
});

describe("Payment Service", () => {
  let mockUserId, mockOrderId;

  beforeEach(() => {
    mockUserId = new mongoose.Types.ObjectId();
    mockOrderId = new mongoose.Types.ObjectId();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await Payment.deleteMany({});
  });

  describe("createCheckoutPayment", () => {
    it("should create a checkout payment successfully", async () => {
      // Mock order
      Order.findById.mockResolvedValue({
        _id: mockOrderId,
        customerId: mockUserId,
        subTotal: 50000,
      });

      // Mock PayMongo response
      paymongoClient.createPaymentIntent.mockResolvedValue({
        data: {
          id: "pi_test123",
          attributes: {
            client_key: "test_client_key",
            status: "awaiting_payment_method",
          },
        },
      });

      const result = await paymentService.createCheckoutPayment(
        mockUserId,
        mockOrderId,
        50000,
        "Test Order Payment"
      );

      expect(result).toBeDefined();
      expect(result.payment).toBeDefined();
      expect(result.clientKey).toBe("test_client_key");
      expect(result.paymentIntentId).toBe("pi_test123");
      expect(paymongoClient.createPaymentIntent).toHaveBeenCalledWith(
        50000,
        "Test Order Payment",
        expect.any(Object)
      );
    });

    it("should allow zero amount for checkout payment", async () => {
      const result = await paymentService.createCheckoutPayment(
        mockUserId,
        mockOrderId,
        0,
        "Free Item Test"
      );

      expect(result).toBeDefined();
      expect(result.payment).toBeDefined();
      expect(result.payment.amount).toBe(0);
    });

    it("should throw error if order not found", async () => {
      Order.findById.mockResolvedValue(null);

      await expect(
        paymentService.createCheckoutPayment(mockUserId, mockOrderId, 50000, "Test")
      ).rejects.toThrow("Order not found");
    });

    it("should throw error if order already paid", async () => {
      Order.findById.mockResolvedValue({
        _id: mockOrderId,
        customerId: mockUserId,
      });

      await Payment.create({
        userId: mockUserId,
        orderId: mockOrderId,
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
        status: "succeeded",
      });

      await expect(
        paymentService.createCheckoutPayment(mockUserId, mockOrderId, 50000, "Test")
      ).rejects.toThrow("Order has already been paid");
    });
  });

  describe("attachPaymentMethod", () => {
    it("should attach payment method successfully", async () => {
      const payment = await Payment.create({
        userId: mockUserId,
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
        status: "awaiting_payment",
        paymentIntentId: "pi_test123",
      });

      paymongoClient.attachPaymentMethod.mockResolvedValue({
        data: {
          attributes: {
            status: "processing",
            next_action: { type: "redirect", url: "https://test.com" },
          },
        },
      });

      const result = await paymentService.attachPaymentMethod(
        mockUserId,
        "pi_test123",
        "pm_test456",
        "http://localhost:3000/success"
      );

      expect(result.payment.paymentMethodId).toBe("pm_test456");
      expect(result.payment.status).toBe("processing");
      expect(result.nextAction).toBeDefined();
    });

    it("should throw error if payment not found", async () => {
      await expect(
        paymentService.attachPaymentMethod(mockUserId, "pi_invalid", "pm_test", "url")
      ).rejects.toThrow("Payment not found");
    });

    it("should throw error if payment already completed", async () => {
      await Payment.create({
        userId: mockUserId,
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
        status: "succeeded",
        paymentIntentId: "pi_test123",
      });

      await expect(
        paymentService.attachPaymentMethod(mockUserId, "pi_test123", "pm_test", "url")
      ).rejects.toThrow("Payment has already been completed");
    });
  });

  describe("createRefund", () => {
    it("should create refund successfully", async () => {
      const originalPayment = await Payment.create({
        userId: mockUserId,
        orderId: mockOrderId,
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
        status: "succeeded",
        gatewayResponse: { data: { id: "pay_123" } },
      });

      paymongoClient.createRefund.mockResolvedValue({
        data: {
          id: "ref_test123",
          attributes: { status: "pending" },
        },
      });

      const refund = await paymentService.createRefund(
        mockUserId,
        originalPayment._id.toString(),
        null,
        "Customer request"
      );

      expect(refund.type).toBe("refund");
      expect(refund.amount).toBe(50000);
      expect(refund.status).toBe("processing");
    });

    it("should throw error for non-succeeded payments", async () => {
      const payment = await Payment.create({
        userId: mockUserId,
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
        status: "pending",
      });

      await expect(
        paymentService.createRefund(mockUserId, payment._id.toString(), null, "reason")
      ).rejects.toThrow("Only succeeded payments can be refunded");
    });
  });

  describe("createCashIn", () => {
    it("should create cash-in payment successfully", async () => {
      paymongoClient.createPaymentIntent.mockResolvedValue({
        data: {
          id: "pi_cashin123",
          attributes: {
            client_key: "cashin_client_key",
          },
        },
      });

      const result = await paymentService.createCashIn(mockUserId, 100000, "gcash");

      expect(result.payment.type).toBe("cash_in");
      expect(result.payment.amount).toBe(100000);
      expect(result.clientKey).toBe("cashin_client_key");
    });

    it("should NOT allow zero amount for cash-in payment (minimum 1 PHP)", async () => {
      await expect(paymentService.createCashIn(mockUserId, 0, "gcash")).rejects.toThrow(
        "Minimum cash-in amount is 1 PHP (100 centavos)"
      );
    });

    it("should throw error if amount is too high", async () => {
      await expect(
        paymentService.createCashIn(mockUserId, 20000000, "gcash")
      ).rejects.toThrow("Maximum cash-in amount is 100,000 PHP");
    });
  });

  describe("createWithdrawal", () => {
    it("should create withdrawal request successfully", async () => {
      const bankAccount = {
        accountNumber: "1234567890",
        accountName: "John Doe",
        bankName: "BPI",
      };

      const withdrawal = await paymentService.createWithdrawal(
        mockUserId,
        200000,
        bankAccount
      );

      expect(withdrawal.type).toBe("withdraw");
      expect(withdrawal.amount).toBe(200000);
      expect(withdrawal.status).toBe("pending");
      expect(withdrawal.bankAccount.accountName).toBe("John Doe");
    });

    it("should throw error if amount is too low", async () => {
      const bankAccount = {
        accountNumber: "1234567890",
        accountName: "John Doe",
        bankName: "BPI",
      };

      // 50.00 PHP = 5000 centavos (below 100 PHP minimum)
      await expect(
        paymentService.createWithdrawal(mockUserId, 5000, bankAccount)
      ).rejects.toThrow("Minimum withdrawal amount is 100 PHP");
    });

    it("should throw error if bank details incomplete", async () => {
      const incompleteBankAccount = {
        accountNumber: "1234567890",
        // Missing accountName and bankName
      };

      await expect(
        paymentService.createWithdrawal(mockUserId, 200000, incompleteBankAccount)
      ).rejects.toThrow("Complete bank account details are required");
    });

    it("should allow vendor to cancel pending withdrawal", async () => {
      const bankAccount = {
        accountNumber: "1234567890",
        accountName: "John Doe",
        bankName: "BPI",
      };

      const withdrawal = await paymentService.createWithdrawal(
        mockUserId,
        200000,
        bankAccount
      );

      const cancelled = await paymentService.cancelWithdrawal(mockUserId, withdrawal._id, 'Cancelled by vendor');

      expect(cancelled.status).toBe('cancelled');
    });

    it("should not allow cancelling a non-pending withdrawal", async () => {
      const bankAccount = {
        accountNumber: "9876543210",
        accountName: "Jane Doe",
        bankName: "BPI",
      };

      const withdrawal = await paymentService.createWithdrawal(
        mockUserId,
        200000,
        bankAccount
      );

      // Simulate that withdrawal moved to processing
      withdrawal.status = 'processing';
      await withdrawal.save();

      await expect(
        paymentService.cancelWithdrawal(mockUserId, withdrawal._id, 'Too late')
      ).rejects.toThrow('Only pending withdrawals can be cancelled');
    });

    it('should allow admin to approve a pending withdrawal and debit wallet', async () => {
      const Wallet = require('../modules/wallet/userWallet.model');

      // Seed wallet document with sufficient funds (PHP)
      await Wallet.create({ user: mockUserId, balance: 5000, usdtBalance: 0 });

      const bankAccount = {
        accountNumber: '111122223333',
        accountName: 'Alice',
        bankName: 'BDO'
      };

      const withdrawal = await paymentService.createWithdrawal(mockUserId, 200000, bankAccount); // 2000.00 PHP

      const adminId = new mongoose.Types.ObjectId();

      const approved = await paymentService.approveWithdrawal(adminId, withdrawal._id, { adminProofUrl: 'http://proof', payoutRef: 'PR123' });

      expect(approved.status).toBe('succeeded');
      expect(approved.approvedBy.toString()).toBe(adminId.toString());
    });

    it('should allow admin to reject a pending withdrawal with reason', async () => {
      const bankAccount = {
        accountNumber: '444455556666',
        accountName: 'Bob',
        bankName: 'BPI'
      };

      const withdrawal = await paymentService.createWithdrawal(mockUserId, 200000, bankAccount);

      const adminId = new mongoose.Types.ObjectId();

      const rejected = await paymentService.rejectWithdrawal(adminId, withdrawal._id, 'Insufficient KYC');

      expect(rejected.status).toBe('failed');
      expect(rejected.rejectionReason).toBe('Insufficient KYC');
    });
  });

  describe("checkPaymentStatus", () => {
    it("should update payment status from gateway", async () => {
      const payment = await Payment.create({
        userId: mockUserId,
        orderId: mockOrderId,
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
        status: "processing",
        paymentIntentId: "pi_test123",
      });

      Order.findByIdAndUpdate.mockResolvedValue({});

      paymongoClient.retrievePaymentIntent.mockResolvedValue({
        data: {
          id: "pi_test123",
          attributes: {
            status: "succeeded",
          },
        },
      });

      const updatedPayment = await paymentService.checkPaymentStatus("pi_test123");

      expect(updatedPayment.status).toBe("succeeded");
      expect(updatedPayment.isFinal).toBe(true);
      expect(updatedPayment.paidAt).toBeDefined();
    });
  });

  describe("processWebhook", () => {
    it("should process payment.paid webhook", async () => {
      const payment = await Payment.create({
        userId: mockUserId,
        orderId: mockOrderId,
        type: "checkout",
        provider: "paymongo",
        amount: 50000,
        netAmount: 50000,
        status: "processing",
        paymentIntentId: "pi_webhook123",
      });

      Order.findByIdAndUpdate.mockResolvedValue({});

      const webhookPayload = {
        data: {
          attributes: {
            type: "payment.paid",
            data: {
              id: "pi_webhook123",
            },
          },
        },
      };

      paymongoClient.verifyWebhookSignature.mockReturnValue(true);

      await paymentService.processWebhook(webhookPayload, "valid_signature");

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe("succeeded");
      expect(updatedPayment.webhookReceived).toBe(true);
    });

    it("should credit vendor wallet when cash-in payment succeeds via webhook", async () => {
      const vendorId = new mongoose.Types.ObjectId();
      const amountCentavos = 10000; // ₱100.00

      // Mock paymongo responses for createCashIn
      paymongoClient.createPaymentIntent.mockResolvedValue({
        data: {
          id: "pi_cashin123",
          attributes: {
            client_key: "ck_test",
            status: "awaiting_payment_method",
            next_action: {
              code: { image_url: "https://qr.test/cashin" }
            }
          }
        }
      });

      // Create cash-in payment
      const result = await paymentService.createCashIn(vendorId, amountCentavos, "gcash");
      expect(result.payment).toBeDefined();
      expect(result.payment.paymentIntentId).toBe("pi_cashin123");

      // Simulate webhook
      const webhookPayload = {
        data: {
          attributes: {
            type: "payment.paid",
            data: {
              id: "ch_cashin_1",
              attributes: {
                id: "ch_cashin_1",
                status: "succeeded",
                payment_intent_id: "pi_cashin123",
              },
            },
          },
        },
      };

      paymongoClient.verifyWebhookSignature.mockReturnValue(true);

      await paymentService.processWebhook(webhookPayload, "sig_test");

      const paymentAfter = await Payment.findByIntent("pi_cashin123");
      expect(paymentAfter.status).toBe("succeeded");

      const VendorWallet = require("../modules/wallet/vendorWallet.model");
      const wallet = await VendorWallet.findOne({ user: vendorId });
      expect(wallet).toBeDefined();

      const netCentavos = paymentAfter.netAmount;
      const netPhp = netCentavos / 100;
      const balance = Number(wallet.balance);
      expect(balance).toBeCloseTo(netPhp);
      expect(paymentAfter.walletCredited).toBe(true);
    });
  });
});

describe("Payment Controller Integration", () => {
  // Add controller tests if needed
  // These would test the HTTP layer with mocked requests/responses
});
