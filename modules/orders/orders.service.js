const Order = require("./orders.model");
const {
	getRedisClient,
	isRedisAvailable,
} = require("../../config/redis");
const redisClient = getRedisClient();
const Admin = require("../admin/admin.model.js");
const { RefundRequest } = require("../admin/models");
const { emitAgreementMessage } = require("../../config/socket");
const Product = require("../products/products.model");
const Vendor = require("../vendors/vendors.model");
const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');
const { ValidationError, NotFoundError, AuthorizationError, ConflictError, DatabaseError } = require('../../utils/errorHandler');
const { validateId } = require('../../utils/validation');
const mongoose = require('mongoose');

// Commission service for COD orders
let commissionService;
let notificationService;
try {
	commissionService = require('../commissions/commission.service');
	notificationService = require('../notifications/notification.service');
} catch (e) {
	console.warn('[Orders] Commission/Notification service not available');
}

const getUserOrdersKey = (userId) => `orders:user:${userId}`;
const getVendorOrdersKey = (vendorId) => `orders:vendor:${vendorId}`;
const getProductOrdersKey = (productId) => `orders:product:${productId}`;
const getOrderKey = (id) => `orders:${id}`;
const DEFAULT_COMMISSION_RATE = 0.07;
const FINANCIAL_STATUSES = ["delivered", "completed", "released"];
const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"
];

const resolveCommissionRate = async (vendorId) => {
	if (!vendorId) return DEFAULT_COMMISSION_RATE;
	const vendor = (await Vendor.findById(vendorId)) || (await Vendor.findOne({ userId: vendorId }));
	if (!vendor) return DEFAULT_COMMISSION_RATE;
	return typeof vendor.commissionRate === 'number' ? vendor.commissionRate : DEFAULT_COMMISSION_RATE;
};

// Helper function to update vendor revenue snapshot from delivered/completed orders (idempotent)
const updateVendorRevenue = async (vendorId) => {
	try {
		let vendor = await Vendor.findById(vendorId);
		if (!vendor) {
			vendor = await Vendor.findOne({ userId: vendorId });
		}

		if (!vendor) {
			console.error(`❌ [REVENUE TRACKING] Vendor not found with ID: ${vendorId}`);
			return;
		}

		const orders = await Order.find({
			vendorId: vendor.userId,
			status: { $in: FINANCIAL_STATUSES }
		}).select('subTotal createdAt');

		const monthlyMap = new Map();
		let totalRevenue = 0;

		for (const order of orders) {
			const gross = order.subTotal || 0;
			totalRevenue += gross;
			const d = new Date(order.createdAt);
			const year = d.getFullYear();
			const monthName = MONTH_NAMES[d.getMonth()];
			const key = `${year}:${monthName}`;
			if (!monthlyMap.has(key)) {
				monthlyMap.set(key, { year, monthName, total: 0 });
			}
			monthlyMap.get(key).total += gross;
		}

		// rebuild monthlyRevenueComparison
		const comparison = [];
		const groupedByYear = {};
		for (const { year, monthName, total } of monthlyMap.values()) {
			if (!groupedByYear[year]) {
				groupedByYear[year] = {
					year,
					revenues: {
						January: 0, February: 0, March: 0, April: 0, May: 0, June: 0,
						July: 0, August: 0, September: 0, October: 0, November: 0, December: 0
					}
				};
			}
			groupedByYear[year].revenues[monthName] += total;
		}
		Object.values(groupedByYear).forEach((entry) => comparison.push(entry));

		const now = new Date();
		const currentMonthName = MONTH_NAMES[now.getMonth()];
		const currentYear = now.getFullYear();
		const currentMonthRevenue = comparison
			.find((c) => c.year === currentYear)?.revenues[currentMonthName] || 0;

		vendor.monthlyRevenueComparison = comparison;
		vendor.currentMonthlyRevenue = currentMonthRevenue;
		vendor.totalRevenue = totalRevenue;
		vendor.totalOrders = orders.length;

		await vendor.save();

		if (isRedisAvailable()) {
			const { safeDel } = require('../../config/redis');
			await safeDel(`vendor:${vendorId}`);
			await safeDel(`vendor:${vendor._id}`);
		}

		console.log(`✅ [REVENUE TRACKING] Snapshot rebuilt for vendor ${vendor.storeName}`);
	} catch (error) {
		console.error(`❌ [REVENUE TRACKING] Error updating vendor revenue:`, error.message);
	}
};

// CREATE ORDER
exports.createOrderService = async (orderData) => {
	try {
		orderData = sanitizeMongoInput(orderData);
		// Ensure customerId exists and is valid
		const customerId = orderData.customerId || orderData.userId;
		if (!customerId) throw new ValidationError('Missing customerId');
		validateId(String(customerId), 'customerId');

		const order = new Order(orderData);
		const savedOrder = await order.save();

		// Update admin stats
		await Admin.updateOne({}, { $inc: { totalOrders: 1, newOrdersCount: 1 } });

		// Invalidate Redis cache
		if (isRedisAvailable()) {
			try {
				const { safeDel } = require('../../config/redis');
await safeDel(getUserOrdersKey(orderData.userId || orderData.customerId || (savedOrder && savedOrder.customerId)));
			if (orderData.vendorId || (savedOrder && savedOrder.vendorId)) {
				await safeDel(getVendorOrdersKey(orderData.vendorId || (savedOrder && savedOrder.vendorId)));
			}

			// Each product in the order
			if (Array.isArray(orderData.items)) {
				for (const item of orderData.items) {
					if (item.orderProductId) {
						await safeDel(getProductOrdersKey(item.orderProductId));
					}
				}
			}

			// This specific order (if cached)
			await safeDel(getOrderKey(savedOrder._id.toString()));
			await safeDel(getUserOrdersKey((savedOrder && savedOrder.customerId) || orderData.userId || orderData.customerId));

				// Optional: Admin dashboard/statistics cache
				await safeDel("adminDashboardStats");
			} catch (redisErr) {
				console.warn("Redis cache invalidation failed:", redisErr.message);
			}
		}

		return savedOrder;
	} catch (err) {
		console.error("Error creating order:", err);
		throw new DatabaseError(err.message || 'Failed to create order', 'createOrder');
	}
};
// GET ORDERS BY USER
exports.getOrdersByUserService = async (userId) => {
	userId = sanitizeMongoInput(userId);
	validateId(String(userId), 'userId');
	const key = getUserOrdersKey(userId);
	
	if (isRedisAvailable()) {
		const cache = await redisClient.get(key).catch(() => null);
		if (cache) return JSON.parse(cache);
	}

	const orders = await Order.find({ customerId: userId })
		.sort({ createdAt: -1 })
		.lean();
		
	if (orders.length > 0 && isRedisAvailable()) {
		await redisClient.set(key, JSON.stringify(orders), { EX: 300 }).catch(() => {});
	}
	return orders;
};

// GET ORDERS BY VENDOR
exports.getOrdersByVendorService = async (vendorId) => {
	vendorId = sanitizeMongoInput(vendorId);
	validateId(String(vendorId), 'vendorId');
	const key = getVendorOrdersKey(vendorId);
	
	if (isRedisAvailable()) {
		const cache = await redisClient.get(key).catch(() => null);
		if (cache) return JSON.parse(cache);
	}

	const orders = await Order.find({ vendorId }).sort({ createdAt: -1 }).lean();

	if (orders.length > 0 && isRedisAvailable()) {
		await redisClient.set(key, JSON.stringify(orders), { EX: 150 }).catch(() => {});
	}
	return orders;
};

// GET ORDERS BY PRODUCT
exports.getOrdersByProductService = async (productId) => {
	productId = sanitizeMongoInput(productId);
	validateId(String(productId), 'productId');
	const key = getProductOrdersKey(productId);
	
	if (isRedisAvailable()) {
		const cache = await redisClient.get(key).catch(() => null);
		if (cache) return JSON.parse(cache);
	}

	const orders = await Order.find({ "items.orderProductId": productId })
		.sort({ createdAt: -1 })
		.lean();

	if (orders.length > 0 && isRedisAvailable()) {
		await redisClient.set(key, JSON.stringify(orders)).catch(() => {});
	}
	return orders;
};

// GET ORDER BY ID 
exports.getOrderByIdService = async (orderId) => {
	orderId = sanitizeMongoInput(orderId);
	validateId(String(orderId), 'orderId');
	const key = getOrderKey(orderId);
	
	if (isRedisAvailable()) {
		const cache = await redisClient.get(key).catch(() => null);
		if (cache) return JSON.parse(cache);
	}

	const order = await Order.findById(orderId).lean();
	if (order && isRedisAvailable()) {
		await redisClient.set(key, JSON.stringify(order)).catch(() => {});
	}
	return order;
};

// CANCEL ORDER (WITH CACHE INVALIDATION AND AUTO-REFUND FOR PAID ORDERS)
exports.cancelOrderService = async (orderId, customerId = null) => {
	orderId = sanitizeMongoInput(orderId);
	validateId(String(orderId), 'orderId');
	
	// First get the order to check payment status
	const order = await Order.findById(orderId);
	if (!order) return null;
	
	// Check if order was already paid with non-COD method
	const wasPaidOnline = order.paymentStatus?.toLowerCase() === 'paid' && 
		order.paymentMethod && order.paymentMethod.toLowerCase() !== 'cod';
	
	// Update order status to cancelled
	const updated = await Order.findByIdAndUpdate(
		orderId,
		{ 
			status: "cancelled",
			cancelledAt: new Date(),
			cancelledBy: customerId || order.customerId
		},
		{ new: true }
	);

	if (!updated) return null;

	await Admin.updateOne({}, { $inc: { canceledOrdersCount: 1 } });

	// If order was paid online, automatically create a refund request
	if (wasPaidOnline) {
		try {
			const refundItems = updated.items.map(item => ({
				orderItemId: item._id,
				productId: item.productId,
				productName: item.name || item.label,
				optionId: item.optionId,
				quantity: item.quantity,
				price: item.price,
				refundAmount: item.price * item.quantity
			}));

			const totalRefundAmount = updated.subTotal || refundItems.reduce((sum, i) => sum + i.refundAmount, 0);

			const refundRequest = new RefundRequest({
				orderId: updated._id,
				customerId: updated.customerId,
				vendorId: updated.vendorId,
				items: refundItems,
				totalRefundAmount,
				commissionRefund: updated.commissionAmount || 0,
				sellerDeduction: updated.sellerEarnings || 0,
				reason: 'duplicate_order', // Default reason for cancellation
				reasonDetails: 'Order cancelled by customer - automatic refund request',
				status: 'pending',
				refundMethod: 'wallet',
				timeline: [{
					status: 'pending',
					message: 'Automatic refund request created due to order cancellation',
					updatedBy: customerId || updated.customerId
				}]
			});

			await refundRequest.save();

			// Update order with refund status
			await Order.findByIdAndUpdate(orderId, {
				refundStatus: 'requested',
				refundReason: 'Order cancelled - automatic refund',
				refundRequestedAt: new Date(),
				refundRequestedBy: customerId || updated.customerId
			});

			console.log(`✅ Auto-refund request created for cancelled paid order: ${orderId}`);
		} catch (refundError) {
			console.error(`❌ Failed to create auto-refund for order ${orderId}:`, refundError.message);
			// Don't fail the cancellation if refund creation fails
		}
	}

	if (isRedisAvailable()) {
		const { safeDel } = require('../../config/redis');
		await Promise.all([
			safeDel(getOrderKey(orderId)),
			safeDel(getUserOrdersKey(updated.userId || updated.customerId)),
			safeDel(getVendorOrdersKey(updated.vendorId)),
			...updated.items.map((item) => safeDel(getProductOrdersKey(item.orderProductId || item.productId))),
		]);
	}

	return updated;
};

const ALLOWED_TRANSITIONS = {
	pending: ["paid", "shipped", "cancelled"],
	paid: ["shipped", "cancelled", "delivered"],
	shipped: ["delivered", "cancelled"],
	delivered: [],
	cancelled: [],
};

// Helper function to delete Redis keys by pattern without blocking
const deleteKeysByPattern = async (pattern) => {
	if (!isRedisAvailable()) return;
	try {
		let cursor = 0;
		do {
			const reply = await redisClient.scan(cursor, {
				MATCH: pattern,
				COUNT: 100, // Process 100 keys per iteration
			}).catch(() => ({ cursor: 0, keys: [] }));
			cursor = reply.cursor;
			const keys = reply.keys;
			if (keys.length > 0) {
				const { safeDel } = require('../../config/redis'); await safeDel(keys);
			}
		} while (cursor !== 0);
		console.log(`Cache invalidated for pattern: ${pattern}`);
	} catch (err) {
		console.warn(`Error invalidating cache for pattern ${pattern}:`, err.message);
	}
};

const updateProductStock = async (productId, optionId, quantity) => {
	const product = await Product.findById(productId);
	if (!product) {
		console.error(`Product with ID ${productId} not found.`);
		return;
	}

	// If the product uses options, update both the option and the main product
	if (product.isOption) {
		if (!optionId) {
			console.error(
				`Product ${productId} requires an option ID, but none was provided.`
			);
			return;
		}
		const option = product.option.id(optionId);
		if (option) {
			// Update option stock
			option.stock -= quantity;
			option.sold += quantity;

			// Also update the main product's aggregate stock and sold counts
			product.stock -= quantity;
			product.sold += quantity;
		} else {
			console.error(
				`Option with ID ${optionId} not found in product ${productId}.`
			);
			return;
		}
	} else {
		// If the product does not use options, update the main product stock
		product.stock -= quantity;
		product.sold += quantity;
		console.log(`Updated product ${product.name} stock and sold counts.`);
	}

	await product.save();

	try {
		// Invalidate all paginated product lists using the helper
		await deleteKeysByPattern("products:skip*:limit*");

		// Invalidate other specific product-related caches
		const keysToDelete = [
			`products:${productId}`,
			`products:featured`,
			`product:vendor:${product.vendorId}`,
			`products:all`,
		];

		if (keysToDelete.length > 0) {
            const { safeDel } = require('../../config/redis');
            await safeDel(keysToDelete);
        }

		console.log(`Cache invalidated for product ${productId}`);
	} catch (redisErr) {
		console.warn(
			`Redis cache invalidation failed for product ${productId}:`,
			redisErr.message
		);
	}
};

// UPDATE ORDER STATUS (WITH CACHE INVALIDATION)
exports.updateOrderStatusService = async (
	orderId,
	newStatus,
	trackingNumber = null
) => {
	orderId = sanitizeMongoInput(orderId);
	newStatus = sanitizeMongoInput(newStatus);
	trackingNumber = sanitizeMongoInput(trackingNumber);
	validateId(String(orderId), 'orderId');
	const order = await Order.findById(orderId);
	if (!order) return null;

	// Validate transition
	const allowed = ALLOWED_TRANSITIONS[order.status] || [];
	if (!allowed.includes(newStatus)) {
		throw new ConflictError(
			`Cannot change order from '${order.status}' to '${newStatus}'.`
		);
	}

	order.status = newStatus;
	order.updatedAt = Date.now();
	if (newStatus === "shipped" && trackingNumber) {
		order.trackingNumber = trackingNumber;
	}
	if (newStatus === "delivered") {
		const orderTotal = order.subTotal || 0;
		const isCod = String(order.paymentMethod || "cod").toLowerCase() === "cod";
		const commissionRate = await resolveCommissionRate(order.vendorId);
		order.commissionRate = commissionRate;
		order.commissionAmount = parseFloat((orderTotal * commissionRate).toFixed(2));
		order.sellerEarnings = parseFloat((orderTotal - order.commissionAmount).toFixed(2));
		order.deliveredAt = new Date(); // Track delivery time for refund window

		console.log(`\n📦 [ORDER DELIVERED] Order ${order._id} marked as delivered`);
		console.log(`   Vendor ID: ${order.vendorId}`);
		console.log(`   SubTotal: ${order.subTotal}, Shipping: ${order.shippingFee}, Total: ${orderTotal}`);
		
		order.paymentStatus = "Paid"; // auto-mark COD as paid when delivered

		if (!isCod) {
			// digital payments are held until admin release
			order.escrowStatus = "pending_release";
			order.payoutStatus = "pending";
			order.escrowHeldAt = order.escrowHeldAt || new Date();
			order.payoutAmount = order.sellerEarnings;
			order.escrowAmount = order.sellerEarnings;
			if (order.commissionStatus === "pending") {
				order.commissionStatus = "paid";
				order.commissionPaidAt = new Date();
			}
		} else {
			// COD: vendor already collected cash; commission still pending
			order.escrowStatus = "not_applicable";
			order.payoutStatus = "not_applicable";
			
			// Create pending commission record for COD orders
			if (commissionService) {
				try {
					// Get shop info for the commission
					const vendor = await Vendor.findOne({ userId: order.vendorId });
					if (vendor) {
						const commission = await commissionService.createCODCommission(
							{
								orderId: order._id,
								orderNumber: order.orderNumber || order._id.toString(),
								amount: orderTotal,
								commissionRate: commissionRate * 100, // Convert to percentage
								customerName: order.customerName || order.shippingAddress?.name || 'Customer',
								deliveredAt: new Date()
							},
							order.vendorId,
							vendor._id
						);
						
						// Send notification to vendor about pending commission
						if (notificationService && commission) {
							await notificationService.notifyCommissionPending(order.vendorId, commission);
						}
						
						console.log(`✅ [COD COMMISSION] Created pending commission for order ${order._id}, amount: ${order.commissionAmount}`);
					}
				} catch (commErr) {
					console.error(`❌ [COD COMMISSION] Failed to create commission for order ${order._id}:`, commErr.message);
					// Don't fail the order update if commission creation fails
				}
			}
		}

		// Update stock and sold counts for each item in the order
		for (const item of order.items) {
			const productId = item.productId || item.orderProductId;
			if (productId) {
				await updateProductStock(productId, item.optionId, item.quantity);
			} else {
				console.error("Product ID not found for an item in order:", order._id);
			}
		}

		// Note: Vendor stats (totalRevenue, monthlyRevenueComparison) are now calculated
		// on-demand from orders in the database for accuracy. No incremental updates.
		console.log(`✅ [ORDER DELIVERED] Order marked delivered. Vendor stats will be calculated on-demand.`);
	}
	if (newStatus === "paid") {
		order.paymentStatus = "Paid";
	}

	const updated = await order.save();

	try {
		if (isRedisAvailable()) {
			const { safeDel } = require('../../config/redis');
			await Promise.all([
				safeDel(getOrderKey(orderId)),
				safeDel(getUserOrdersKey(updated.customerId)),
				safeDel(getVendorOrdersKey(updated.vendorId)),
				...updated.items.map((item) =>
					safeDel(getProductOrdersKey(item.productId || item.orderProductId))
				),
			]);
		}
	} catch (redisErr) {
		console.warn("Redis cache invalidation failed:", redisErr.message);
	}

	return updated.toObject();
};

exports.addAgreementMessageService = async ({
	orderId,
	userId,
	message,
	role,
}) => {
	console.log("🔍 Service Debug - addAgreementMessageService:");
	console.log("orderId:", orderId);
	console.log("userId:", userId);
	console.log("message:", message);
	console.log("role:", role);

	// Sanitize inputs
	orderId = sanitizeMongoInput(orderId);
	userId = sanitizeMongoInput(userId);
	message = sanitizeMongoInput(message);
	role = sanitizeMongoInput(role);

	if (!message || typeof message !== "string" || !message.trim()) {
		throw new ValidationError("Message content is required.");
	}

	validateId(String(orderId), 'orderId');

	const order = await Order.findById(orderId);

	if (!order) {
		throw new NotFoundError('Order');
	}

	console.log("📋 Order found:", {
		customerId: order.customerId.toString(),
		vendorId: order.vendorId.toString(),
		status: order.status
	});

	// Ensure the user is either the customer or the vendor for this order
	const isCustomer = order.customerId.toString() === String(userId);
	const isVendor = order.vendorId.toString() === String(userId);

	if (!isCustomer && !isVendor) {
		throw new AuthorizationError("You are not authorized to update this order.");
	}

	const newMessage = {
		sender: role, // 'customer' or 'vendor'
		message: message.trim(),
		timestamp: new Date(),
	};

	order.agreementMessages.push(newMessage);
	order.updatedAt = new Date();

	const updatedOrder = await order.save();

	// Invalidate Redis cache for this order and related data
	try {
		if (isRedisAvailable()) {
			const { safeDel } = require('../../config/redis');
			await Promise.all([
				safeDel(getOrderKey(orderId)),
				safeDel(getUserOrdersKey(order.customerId.toString())),
				safeDel(getVendorOrdersKey(order.vendorId.toString())),
			]);
		}
	} catch (redisErr) {
		console.warn("Redis cache invalidation failed after adding agreement message:", redisErr.message);
	}

	// Emit real-time message to all connected clients in the order room
	try {
		emitAgreementMessage(orderId, {
			id: newMessage.timestamp.getTime(), // Use timestamp as unique ID
			sender: newMessage.sender,
			message: newMessage.message,
			timestamp: newMessage.timestamp,
			orderId: orderId
		});
	} catch (socketErr) {
		console.warn("Socket.IO emission failed:", socketErr.message);
	}

	return updatedOrder;
};


