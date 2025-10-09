const Order = require("./orders.model");
const redisClient = require("../../config/redis");
const Admin = require("../admin/admin.model.js");

const getUserOrdersKey = (userId) => `orders:user:${userId}`;
const getVendorOrdersKey = (vendorId) => `orders:vendor:${vendorId}`;
const getProductOrdersKey = (productId) => `orders:product:${productId}`;
const getOrderKey = (id) => `orders:${id}`;

// CREATE ORDER
exports.createOrderService = async (orderData) => {
	try {
		const order = new Order(orderData);
		const savedOrder = await order.save();

		// Update admin stats
		await Admin.updateOne({}, { $inc: { totalOrders: 1, newOrdersCount: 1 } });

		// Invalidate Redis cache
		if (redisClient) {
			try {
				await redisClient.del(getUserOrdersKey(orderData.userId));
				if (orderData.vendorId) {
					await redisClient.del(getVendorOrdersKey(orderData.vendorId));
				}

				// Each product in the order
				if (Array.isArray(orderData.items)) {
					for (const item of orderData.items) {
						if (item.orderProductId) {
							await redisClient.del(getProductOrdersKey(item.orderProductId));
						}
					}
				}

				// This specific order (if cached)
				await redisClient.del(getOrderKey(savedOrder._id.toString()));
				await redisClient.del(getUserOrdersKey(savedOrder.customerId.toString()));

				// Optional: Admin dashboard/statistics cache
				await redisClient.del("adminDashboardStats");
			} catch (redisErr) {
				console.warn("Redis cache invalidation failed:", redisErr.message);
			}
		}

		return savedOrder;
	} catch (err) {
		console.error("Error creating order:", err);
		throw new Error("Failed to create order");
	}
};
// GET ORDERS BY USER
exports.getOrdersByUserService = async (userId) => {
	const key = getUserOrdersKey(userId);
	const cache = await redisClient.get(key);
	if (cache) return JSON.parse(cache);

	const orders = await Order.find({ customerId: userId })
		.sort({ createdAt: -1 })
		.lean();
	if (orders.length > 0) {
		await redisClient.set(key, JSON.stringify(orders), { EX: 300 });
	}
	return orders;
};

// GET ORDERS BY VENDOR
exports.getOrdersByVendorService = async (vendorId) => {
	const key = getVendorOrdersKey(vendorId);
	const cache = await redisClient.get(key);
	if (cache) return JSON.parse(cache);

	const orders = await Order.find({ vendorId }).sort({ createdAt: -1 }).lean();

	if (orders.length > 0) {
		await redisClient.set(key, JSON.stringify(orders), { EX: 150 });
	}
	return orders;
};

// GET ORDERS BY PRODUCT
exports.getOrdersByProductService = async (productId) => {
	const key = getProductOrdersKey(productId);
	const cache = await redisClient.get(key);
	if (cache) return JSON.parse(cache);

	const orders = await Order.find({ "items.orderProductId": productId })
		.sort({ createdAt: -1 })
		.lean();

	if (orders.length > 0) {
		await redisClient.set(key, JSON.stringify(orders));
	}
	return orders;
};

// GET ORDER BY ID 
exports.getOrderByIdService = async (orderId) => {
	const key = getOrderKey(orderId);
	const cache = await redisClient.get(key);
	if (cache) return JSON.parse(cache);

	const order = await Order.findById(orderId).lean();
	if (order) {
		await redisClient.set(key, JSON.stringify(order));
	}
	return order;
};

// CANCEL ORDER (WITH CACHE INVALIDATION)
exports.cancelOrderService = async (orderId) => {
	const updated = await Order.findByIdAndUpdate(
		orderId,
		{ status: "cancelled" },
		{ new: true }
	).lean();

	if (!updated) return null;

	await Admin.updateOne({}, { $inc: { canceledOrdersCount: 1 } });

	await Promise.all([
		redisClient.set(getOrderKey(orderId), JSON.stringify(updated)),
		redisClient.del(getUserOrdersKey(updated.userId)),
		redisClient.del(getVendorOrdersKey(updated.vendorId)),
		...updated.items.map((item) =>
			redisClient.del(getProductOrdersKey(item.orderProductId))
		),
	]);

	return updated;
};

const ALLOWED_TRANSITIONS = {
	pending: ["paid", "shipped", "cancelled"],
	paid: ["shipped", "cancelled", "delivered"],
	shipped: ["delivered", "cancelled"],
	delivered: [],
	cancelled: [],
};

// UPDATE ORDER STATUS (WITH CACHE INVALIDATION)
exports.updateOrderStatusService = async (
	orderId,
	newStatus,
	trackingNumber = null
) => {
	const order = await Order.findById(orderId);
	if (!order) return null;

	// Validate transition
	const allowed = ALLOWED_TRANSITIONS[order.status] || [];
	if (!allowed.includes(newStatus)) {
		throw new Error(
			`Cannot change order from '${order.status}' to '${newStatus}'.`
		);
	}

	order.status = newStatus;
	order.updatedAt = Date.now();
	if (newStatus === "shipped" && trackingNumber) {
		order.trackingNumber = trackingNumber;
	}
	if (newStatus === "delivered" || newStatus === "paid") {
		order.paymentStatus = "Paid"; // auto-mark COD as paid when delivered
	}

	const updated = await order.save();

	await Promise.all([
		redisClient.del(getOrderKey(orderId)),
		redisClient.del(getUserOrdersKey(updated.customerId)),
		redisClient.del(getVendorOrdersKey(updated.vendorId)),
		...updated.items.map((item) =>
			redisClient.del(
				getProductOrdersKey(item.productId || item.orderProductId)
			)
		),
	]);

	return updated.toObject();
};
