const Order = require("../../orders/orders.model");
const Vendor = require("../../vendors/vendors.model");
const VendorWallet = require("../../wallet/vendorWallet.model");
const { RefundRequest } = require("../models");
const { safeDel, isRedisAvailable } = require("../../../config/redis");

// Cache key helpers (aligned with orders.service)
const getUserOrdersKey = (userId) => `orders:user:${userId}`;
const getVendorOrdersKey = (vendorId) => `orders:vendor:${vendorId}`;
const getProductOrdersKey = (productId) => `orders:product:${productId}`;
const getOrderKey = (id) => `orders:${id}`;
const DEFAULT_COMMISSION_RATE = 0.07;
const FINANCIAL_STATUSES = ["delivered", "completed", "released"];

const computePayoutNet = (order, vendorRate) => {
  const commissionRate =
    order.commissionRate ?? vendorRate ?? DEFAULT_COMMISSION_RATE;
  const gross = order.subTotal || 0;
  const commissionAmount =
    order.commissionAmount ?? parseFloat((gross * commissionRate).toFixed(2));
  const sellerEarnings =
    order.sellerEarnings ?? parseFloat((gross - commissionAmount).toFixed(2));
  return { gross, commissionAmount, sellerEarnings };
};

/**
 * Escrow Service - Handles payment escrow operations and admin releases
 */
class EscrowService {
  static async getEscrowSummary() {
    const match = {
      paymentMethod: { $ne: "cod" },
      status: { $in: FINANCIAL_STATUSES },
    };

    const orders = await Order.find(match).select(
      "subTotal sellerEarnings payoutStatus escrowStatus commissionAmount commissionStatus paymentMethod",
    );

    let pendingTotal = 0;
    let releasedTotal = 0;
    let heldTotal = 0;

    for (const order of orders) {
      const { sellerEarnings } = computePayoutNet(order);
      if (
        order.payoutStatus === "released" ||
        order.escrowStatus === "released"
      ) {
        releasedTotal += sellerEarnings;
      } else if (order.payoutStatus === "held") {
        heldTotal += sellerEarnings;
      } else {
        pendingTotal += sellerEarnings;
      }
    }

    return {
      pendingReleaseTotal: parseFloat(pendingTotal.toFixed(2)),
      releasedTotal: parseFloat(releasedTotal.toFixed(2)),
      heldTotal: parseFloat(heldTotal.toFixed(2)),
      pendingCount: orders.filter((o) => o.payoutStatus !== "released").length,
      releasedCount: orders.filter((o) => o.payoutStatus === "released").length,
    };
  }

  static async getPendingReleases(filters = {}, pagination = {}) {
    const { vendorId, minAmount, maxAmount, payoutStatus } = filters;
    const { page = 1, limit = 20 } = pagination;

    const query = {
      paymentMethod: { $ne: "cod" },
      status: { $in: FINANCIAL_STATUSES },
      payoutStatus: {
        $in: payoutStatus ? [payoutStatus] : ["pending", "held"],
      },
    };

    if (vendorId) query.vendorId = vendorId;
    if (minAmount || maxAmount) {
      query.payoutAmount = {};
      if (minAmount) query.payoutAmount.$gte = Number(minAmount);
      if (maxAmount) query.payoutAmount.$lte = Number(maxAmount);
    }

    const [items, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(query),
    ]);

    return {
      page,
      limit,
      total,
      results: items.map((o) => ({
        orderId: o._id,
        vendorId: o.vendorId,
        payoutStatus: o.payoutStatus,
        escrowStatus: o.escrowStatus,
        payoutAmount: o.payoutAmount || o.sellerEarnings,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
      })),
    };
  }

  static async getHeldReleases(pagination = {}) {
    return this.getPendingReleases(
      {
        vendorId: null,
        minAmount: null,
        maxAmount: null,
        payoutStatus: "held",
      },
      pagination,
    );
  }

  static async getSellersWithPendingReleases(pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const match = {
      paymentMethod: { $ne: "cod" },
      status: { $in: FINANCIAL_STATUSES },
      payoutStatus: { $in: ["pending", "held"] },
    };

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$vendorId",
          pendingAmount: {
            $sum: { $ifNull: ["$payoutAmount", "$sellerEarnings"] },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { pendingAmount: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    const rows = await Order.aggregate(pipeline);
    const total = await Order.countDocuments(match);

    return {
      page,
      limit,
      total,
      vendors: rows.map((row) => ({
        vendorId: row._id,
        pendingAmount: row.pendingAmount,
        pendingOrders: row.count,
      })),
    };
  }

  static async releasePaymentToSeller(orderId, adminId, adminEmail, notes) {
    const order = await Order.findById(orderId);

    if (!order) throw new Error("Order not found");

    if (String(order.paymentMethod || "").toLowerCase() === "cod") {
      throw new Error("COD orders do not use escrow release");
    }

    if (!FINANCIAL_STATUSES.includes(order.status)) {
      throw new Error("Order must be delivered/completed before release");
    }

    if (order.payoutStatus === "released") {
      return {
        message: "Already released",
        sellerReceived: order.payoutAmount || order.sellerEarnings,
      };
    }

    const vendor =
      (await Vendor.findOne({ userId: order.vendorId })) ||
      (await Vendor.findById(order.vendorId));

    const { sellerEarnings } = computePayoutNet(order, vendor?.commissionRate);
    const payoutAmount = order.payoutAmount || sellerEarnings;

    if (!vendor) throw new Error("Vendor not found");

    const VendorId = order.vendorId;

    const vendorCashBalance = await VendorWallet.getOrCreateForUser(VendorId);

    if (!vendorCashBalance) throw new Error("Vendor wallet not found");

   const UpdateVendorWallet = await VendorWallet.findOneAndUpdate({user: VendorId}, {
      $inc: { balance: payoutAmount },
    });

	if (!UpdateVendorWallet) throw new Error("Failed to update vendor wallet");
	
    order.payoutStatus = "released";
    order.escrowStatus = "released";
    order.payoutAmount = payoutAmount;
    order.payoutReleasedAt = new Date();
    order.payoutReleasedBy = adminId;
    order.payoutNotes = notes;
    await order.save();

    const { isRedisAvailable, safeDel } = require("../../../config/redis");
    
    if (isRedisAvailable()) {
      try {
        await safeDel([
          `vendor:${vendor.userId}`,
          `vendor:${VendorId}`,
          `vendor:details:${vendor.userId}`,
          `vendor:details:${VendorId}`,
          "adminDashboardStats",
        ]);
      } catch (cacheErr) {
        console.warn("Cache invalidation failed:", cacheErr.message);
      }
    }

    return {
      orderId: order._id,
      vendorId: order.vendorId,
      sellerReceived: payoutAmount,
      releasedAt: order.payoutReleasedAt,
      walletCredited: true,
    };
  }

  static async holdPayment(orderId, adminId, adminEmail, reason) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (String(order.paymentMethod || "").toLowerCase() === "cod") {
      throw new Error("COD orders do not use escrow hold");
    }

    order.payoutStatus = "held";
    order.escrowStatus = "pending_release";
    order.payoutNotes = reason;
    await order.save();

    return { orderId: order._id, payoutStatus: order.payoutStatus };
  }

  static async getPendingRefunds() {
    const refunds = await Order.find({
      refundStatus: { $in: ["requested", "approved"] },
    }).select("refundStatus refundReason vendorId customerId subTotal");
    return { total: refunds.length, refunds };
  }

  static async approveRefund(orderId, adminId) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    order.refundStatus = "processed";
    order.refundApprovedAt = new Date();
    order.refundApprovedBy = adminId;
    await order.save();

    // Update RefundRequest status as well
    await RefundRequest.findOneAndUpdate(
      { orderId: order._id },
      {
        status: "approved",
        $push: {
          timeline: {
            status: "approved",
            message: "Refund approved by admin",
            updatedBy: adminId,
            timestamp: new Date(),
          },
        },
      },
    );

    // Invalidate caches so customers see the updated refund status immediately
    if (isRedisAvailable()) {
      const productKeys =
        order.items?.map((item) =>
          getProductOrdersKey(item.orderProductId || item.productId),
        ) || [];
      await safeDel(`orders:user:${order.customerId}`);
      await safeDel([
        getOrderKey(order._id),
        getUserOrdersKey(order.customerId),
        getVendorOrdersKey(order.vendorId),
        ...productKeys,
      ]);
    }

    return order;
  }

  static async rejectRefund(orderId, adminId, reason) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    order.refundStatus = "rejected";
    order.refundNotes = reason;
    // Reset order status back to delivered since refund was rejected
    order.status = "delivered";
    await order.save();

    // Update RefundRequest status as well
    await RefundRequest.findOneAndUpdate(
      { orderId: order._id },
      {
        status: "rejected",
        rejectionReason: reason,
        $push: {
          timeline: {
            status: "rejected",
            message: `Refund rejected: ${reason}`,
            updatedBy: adminId,
            timestamp: new Date(),
          },
        },
      },
    );

    // Invalidate caches so customers see the updated refund status immediately
    if (isRedisAvailable()) {
      const productKeys =
        order.items?.map((item) =>
          getProductOrdersKey(item.orderProductId || item.productId),
        ) || [];
      await safeDel([
        getOrderKey(order._id),
        getUserOrdersKey(order.customerId),
        getVendorOrdersKey(order.vendorId),
        ...productKeys,
      ]);
    }

    return order;
  }

  static async requestRefund(orderId, requestedBy, reason, reasonDetails = "") {
    const order = await Order.findById(orderId).populate("items");
    if (!order) throw new Error("Order not found");

    // Check if order is delivered
    if (order.status !== "delivered") {
      throw new Error("Refund can only be requested for delivered orders");
    }

    // Check 1-day refund window from delivery date
    const deliveredAt = order.deliveredAt || order.updatedAt;
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const timeSinceDelivery = now.getTime() - new Date(deliveredAt).getTime();

    if (timeSinceDelivery > oneDayMs) {
      throw new Error(
        "Refund window has expired. Refunds can only be requested within 24 hours of delivery.",
      );
    }

    // Check if refund already requested (check both order and RefundRequest)
    if (
      order.refundStatus &&
      order.refundStatus !== "none" &&
      order.refundStatus !== "rejected"
    ) {
      throw new Error("A refund has already been requested for this order");
    }

    const existingRefund = await RefundRequest.findOne({
      orderId,
      status: { $in: ["pending", "under_review", "approved"] },
    });
    if (existingRefund) {
      throw new Error("A refund request already exists for this order");
    }

    // Create RefundRequest entry for admin panel
    const refundItems = order.items.map((item) => ({
      orderItemId: item._id,
      productId: item.productId,
      productName: item.name || item.label,
      optionId: item.optionId,
      quantity: item.quantity,
      price: item.price,
      refundAmount: item.price * item.quantity,
    }));

    const totalRefundAmount =
      order.subTotal || refundItems.reduce((sum, i) => sum + i.refundAmount, 0);

    const refundRequest = new RefundRequest({
      orderId: order._id,
      customerId: requestedBy,
      vendorId: order.vendorId,
      items: refundItems,
      totalRefundAmount,
      commissionRefund: order.commissionAmount || 0,
      sellerDeduction: order.sellerEarnings || 0,
      reason: reason || "other",
      reasonDetails: reasonDetails || "",
      status: "pending",
      refundMethod: "wallet",
      timeline: [
        {
          status: "pending",
          message: `Refund requested by customer: ${reasonDetails || reason}`,
          updatedBy: requestedBy,
        },
      ],
    });

    await refundRequest.save();

    // Update order status
    order.refundStatus = "requested";
    order.refundReason = reason;
    order.refundRequestedBy = requestedBy;
    order.refundRequestedAt = new Date();
    order.status = "refund_requested";
    if (reasonDetails) {
      order.refundNotes = reasonDetails;
    }
    await order.save();

    // Invalidate caches so customers/admins see the updated refund status immediately
    if (isRedisAvailable()) {
      const productKeys = order.items.map((item) =>
        getProductOrdersKey(item.orderProductId || item.productId),
      );
      await safeDel(`orders:user:${requestedBy}`);
      await safeDel([
        getOrderKey(order._id),
        getUserOrdersKey(order.customerId),
        getVendorOrdersKey(order.vendorId),
        ...productKeys,
      ]);
    }

    return { order, refundRequest };
  }

  static async cancelRefundRequest(orderId, customerId) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    // Only allow cancellation while pending/under review
    const refundRequest = await RefundRequest.findOne({
      orderId,
      customerId,
      status: { $in: ["pending", "under_review"] },
    });

    if (!refundRequest) {
      throw new Error("No pending refund request to cancel");
    }

    refundRequest.status = "cancelled";
    refundRequest.timeline.push({
      status: "cancelled",
      message: "Refund request cancelled by customer",
      updatedBy: customerId,
    });
    await refundRequest.save();

    // Reset order refund flags
    order.refundStatus = "cancelled";
    order.status = "delivered";
    order.refundNotes = "Refund cancelled by customer";
    await order.save();

    if (isRedisAvailable()) {
      await safeDel([
        getOrderKey(order._id),
        getUserOrdersKey(order.customerId),
        getVendorOrdersKey(order.vendorId),
      ]);
    }

    return { order, refundRequest };
  }

  static async getVendorEscrowDashboard(vendorUserId) {
    const match = {
      vendorId: vendorUserId,
      paymentMethod: { $ne: "cod" },
      status: { $in: FINANCIAL_STATUSES },
    };
    const orders = await Order.find(match).select(
      "payoutStatus escrowStatus subTotal commissionAmount commissionRate sellerEarnings",
    );
    let pending = 0;
    let released = 0;
    for (const o of orders) {
      const { sellerEarnings } = computePayoutNet(o);
      if (o.payoutStatus === "released") released += sellerEarnings;
      else pending += sellerEarnings;
    }
    return { pendingRelease: pending, released };
  }

  static async getVendorPendingCODCommissions(vendorUserId) {
    const orders = await Order.find({
      vendorId: vendorUserId,
      paymentMethod: "cod",
      status: { $in: FINANCIAL_STATUSES },
      commissionStatus: { $in: ["pending", null] },
    });
    const list = orders.map((o) => {
      const { commissionAmount } = computePayoutNet(o);
      return {
        orderId: o._id,
        commissionDue: commissionAmount,
        grossAmount: o.subTotal,
      };
    });
    const totalPendingCommission = list.reduce(
      (sum, x) => sum + (x.commissionDue || 0),
      0,
    );
    return { orders: list, totalPendingCommission };
  }

  static async remitCODCommission(
    orderId,
    vendorUserId,
    paymentMethod = "manual",
  ) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (String(order.paymentMethod || "").toLowerCase() !== "cod")
      throw new Error("Not a COD order");
    if (!FINANCIAL_STATUSES.includes(order.status))
      throw new Error("Order not delivered");
    order.commissionStatus = "paid";
    order.commissionPaidAt = new Date();
    order.commissionNotes = `Collected via ${paymentMethod}`;
    await order.save();
    return order;
  }

  static async bulkRemitCODCommissions(orderIds = [], vendorUserId) {
    const results = { processed: 0, failed: [] };
    for (const id of orderIds) {
      try {
        await this.remitCODCommission(id, vendorUserId, "bulk");
        results.processed += 1;
      } catch (err) {
        results.failed.push({ orderId: id, error: err.message });
      }
    }
    return results;
  }

  static async getVendorTransactions(vendorUserId, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const query = {
      vendorId: vendorUserId,
      payoutStatus: { $ne: "not_applicable" },
    };
    const [rows, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(query),
    ]);
    return { page, limit, total, rows };
  }

  static async getVendorTransactionSummary(vendorUserId) {
    const orders = await Order.find({
      vendorId: vendorUserId,
      payoutStatus: { $ne: "not_applicable" },
    });
    let released = 0;
    let pending = 0;
    for (const o of orders) {
      const { sellerEarnings } = computePayoutNet(o);
      if (o.payoutStatus === "released") released += sellerEarnings;
      else pending += sellerEarnings;
    }
    return { released, pending };
  }

  static async getAdminTransactions(pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const query = {
      payoutStatus: { $ne: "not_applicable" },
      paymentMethod: { $ne: "cod" },
    };
    const [rows, total] = await Promise.all([
      Order.find(query)
        .sort({ payoutReleasedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(query),
    ]);
    return { page, limit, total, rows };
  }
}

module.exports = EscrowService;
