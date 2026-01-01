const Order = require("./orders.model");
const {
	getRedisClient,
	isRedisAvailable,
} = require("../../config/redis");
const redisClient = getRedisClient();
const Admin = require("../admin/admin.model.js");
const { emitAgreementMessage } = require("../../config/socket");
const Product = require("../products/products.model");
const Vendor = require("../vendors/vendors.model");
const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');
const { ValidationError, NotFoundError, AuthorizationError, ConflictError, DatabaseError } = require('../../utils/errorHandler');
const { validateId } = require('../../utils/validation');
const mongoose = require('mongoose');

const getUserOrdersKey = (userId) => `orders:user:${userId}`;
const getVendorOrdersKey = (vendorId) => `orders:vendor:${vendorId}`;
const getProductOrdersKey = (productId) => `orders:product:${productId}`;
const getOrderKey = (id) => `orders:${id}`;

// Helper function to update vendor revenue - pushes directly to monthlyRevenueComparison
const updateVendorRevenue = async (vendorId, orderAmount) => {
	try {
		console.log(`\n🔵 [REVENUE TRACKING] Starting update for vendor: ${vendorId}, amount: ${orderAmount}`);
		
		// Try finding vendor by _id first, then by userId
		let vendor = await Vendor.findById(vendorId);
		if (!vendor) {
			vendor = await Vendor.findOne({ userId: vendorId });
		}
		
		if (!vendor) {
			console.error(`❌ [REVENUE TRACKING] Vendor not found with ID: ${vendorId}`);
			return;
		}

		console.log(`✅ [REVENUE TRACKING] Vendor found: ${vendor.storeName} (ID: ${vendor._id})`);

		const currentDate = new Date();
		const currentYear = currentDate.getFullYear();
		const monthNames = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];
		const currentMonth = monthNames[currentDate.getMonth()];

		console.log(`📅 [REVENUE TRACKING] Current date: ${currentMonth} ${currentYear}`);

		// Find if the current year exists in monthlyRevenueComparison
		const yearIndex = vendor.monthlyRevenueComparison.findIndex(
			(data) => data.year === currentYear
		);

		let previousRevenue = 0;
		if (yearIndex !== -1) {
			// Year exists, add to the current month's revenue
			previousRevenue = vendor.monthlyRevenueComparison[yearIndex].revenues[currentMonth] || 0;
			vendor.monthlyRevenueComparison[yearIndex].revenues[currentMonth] = previousRevenue + orderAmount;
			console.log(`📊 [REVENUE TRACKING] Updated existing year ${currentYear}: ${currentMonth} ${previousRevenue} → ${vendor.monthlyRevenueComparison[yearIndex].revenues[currentMonth]}`);
		} else {
			// Year doesn't exist, create new year entry
			const newYearData = {
				year: currentYear,
				revenues: {
					January: 0,
					February: 0,
					March: 0,
					April: 0,
					May: 0,
					June: 0,
					July: 0,
					August: 0,
					September: 0,
					October: 0,
					November: 0,
					December: 0,
					[currentMonth]: orderAmount
				}
			};
			vendor.monthlyRevenueComparison.push(newYearData);
			console.log(`📊 [REVENUE TRACKING] Created new year ${currentYear}: ${currentMonth} = ${orderAmount}`);
		}

		// Update current month revenue (for reference)
		const oldCurrentMonthly = vendor.currentMonthlyRevenue || 0;
		vendor.currentMonthlyRevenue = oldCurrentMonthly + orderAmount;
		
		// Update total revenue
		const oldTotalRevenue = vendor.totalRevenue || 0;
		vendor.totalRevenue = oldTotalRevenue + orderAmount;
		
		// Update total orders count
		const oldTotalOrders = vendor.totalOrders || 0;
		vendor.totalOrders = oldTotalOrders + 1;

		console.log(`💰 [REVENUE TRACKING] Stats update:
		   - Current Monthly: ${oldCurrentMonthly} → ${vendor.currentMonthlyRevenue}
		   - Total Revenue: ${oldTotalRevenue} → ${vendor.totalRevenue}
		   - Total Orders: ${oldTotalOrders} → ${vendor.totalOrders}`);

		await vendor.save();

		// Clear vendor cache
		if (isRedisAvailable()) {
			const { safeDel } = require('../../config/redis');
			await safeDel(`vendor:${vendorId}`);
			await safeDel(`vendor:${vendor._id}`);
		}
		console.log(`✅ [REVENUE TRACKING] Successfully saved! Revenue added: +${orderAmount} to ${currentMonth} ${currentYear}`);
		console.log(`📈 [REVENUE TRACKING] monthlyRevenueComparison updated for vendor ${vendor.storeName}\n`);
	} catch (error) {
		console.error(`❌ [REVENUE TRACKING] Error updating vendor revenue:`, error.message);
		console.error(error.stack);
		// Don't throw error to prevent order completion failure
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

// CANCEL ORDER (WITH CACHE INVALIDATION)
exports.cancelOrderService = async (orderId) => {
	orderId = sanitizeMongoInput(orderId);
	validateId(String(orderId), 'orderId');
	const updated = await Order.findByIdAndUpdate(
		orderId,
		{ status: "cancelled" },
		{ new: true }
	).lean();

	if (!updated) return null;

	await Admin.updateOne({}, { $inc: { canceledOrdersCount: 1 } });

	if (isRedisAvailable()) {
		const { safeDel } = require('../../config/redis');
		await Promise.all([
			redisClient.set(getOrderKey(orderId), JSON.stringify(updated)).catch(() => {}),
			safeDel(getUserOrdersKey(updated.userId || updated.customerId)),
			safeDel(getVendorOrdersKey(updated.vendorId)),
			...updated.items.map((item) => safeDel(getProductOrdersKey(item.orderProductId))),
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
		// Calculate total amount (subTotal + shippingFee)
		const orderTotal = order.subTotal || 0;
		
		console.log(`\n📦 [ORDER DELIVERED] Order ${order._id} marked as delivered`);
		console.log(`   Vendor ID: ${order.vendorId}`);
		console.log(`   SubTotal: ${order.subTotal}, Shipping: ${order.shippingFee}, Total: ${orderTotal}`);
		
		order.paymentStatus = "Paid"; // auto-mark COD as paid when delivered

		// Update stock and sold counts for each item in the order
		for (const item of order.items) {
			const productId = item.productId || item.orderProductId;
			if (productId) {
				await updateProductStock(productId, item.optionId, item.quantity);
			} else {
				console.error("Product ID not found for an item in order:", order._id);
			}
		}

		// Update vendor revenue when order is delivered
		if (order.vendorId && orderTotal > 0) {
			console.log(`🚀 [ORDER DELIVERED] Triggering revenue update...`);
			await updateVendorRevenue(order.vendorId, orderTotal);
		} else {
			console.warn(`⚠️ [ORDER DELIVERED] Missing vendorId or total - Revenue not updated!`);
			console.warn(`   vendorId: ${order.vendorId}, orderTotal: ${orderTotal}`);
		}
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


