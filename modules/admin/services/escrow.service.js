const Order = require("../../orders/orders.model");
const Admin = require("../admin.model");
const Vendor = require("../../vendors/vendors.model");
const User = require("../../users/users.model");

/**
 * Escrow Service - Handles payment escrow operations
 */
class EscrowService {
  /**
   * Hold payment in escrow when order is paid
   */
  static async holdPayment(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      order.escrowStatus = "held";
      order.escrowHeldAt = new Date();
      await order.save();

      console.log(`Payment held in escrow for order ${orderId}`);
      return order;
    } catch (error) {
      console.error("Error holding payment in escrow:", error);
      throw error;
    }
  }

  /**
   * Release payment from escrow to vendor
   */
  static async releasePayment(orderId, releasedBy) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      if (order.escrowStatus !== "held") {
        throw new Error("Payment is not held in escrow");
      }

      order.escrowStatus = "released";
      order.escrowReleasedAt = new Date();
      order.escrowReleasedBy = releasedBy;
      await order.save();

      // Update vendor balance or payout
      if (order.vendorId) {
        await Vendor.findByIdAndUpdate(order.vendorId, {
          $inc: { balance: order.subTotal }
        });
      }

      console.log(`Payment released from escrow for order ${orderId}`);
      return order;
    } catch (error) {
      console.error("Error releasing payment from escrow:", error);
      throw error;
    }
  }

  /**
   * Request refund - move payment back to customer
   */
  static async requestRefund(orderId, reason, requestedBy) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      if (order.escrowStatus !== "held") {
        throw new Error("Cannot request refund - payment not in escrow");
      }

      order.escrowStatus = "refund_requested";
      order.refundReason = reason;
      order.refundRequestedBy = requestedBy;
      order.refundRequestedAt = new Date();
      await order.save();

      // Notify admin
      await Admin.updateOne({}, {
        $inc: { pendingRefunds: 1 },
        $push: {
          refundRequests: {
            orderId,
            reason,
            requestedBy,
            requestedAt: new Date()
          }
        }
      });

      console.log(`Refund requested for order ${orderId}`);
      return order;
    } catch (error) {
      console.error("Error requesting refund:", error);
      throw error;
    }
  }

  /**
   * Approve refund request
   */
  static async approveRefund(orderId, approvedBy) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      if (order.escrowStatus !== "refund_requested") {
        throw new Error("No refund request pending");
      }

      order.escrowStatus = "refunded";
      order.refundApprovedBy = approvedBy;
      order.refundApprovedAt = new Date();
      await order.save();

      // Update customer balance or process refund
      // This would integrate with payment processor

      // Update admin stats
      await Admin.updateOne({}, {
        $inc: { pendingRefunds: -1, totalRefunds: 1 },
        $pull: { refundRequests: { orderId } }
      });

      console.log(`Refund approved for order ${orderId}`);
      return order;
    } catch (error) {
      console.error("Error approving refund:", error);
      throw error;
    }
  }

  /**
   * Get escrow status for order
   */
  static async getEscrowStatus(orderId) {
    try {
      const order = await Order.findById(orderId).select('escrowStatus escrowHeldAt escrowReleasedAt escrowReleasedBy refundReason refundRequestedAt refundApprovedAt');
      return order;
    } catch (error) {
      console.error("Error getting escrow status:", error);
      throw error;
    }
  }
}

module.exports = EscrowService;