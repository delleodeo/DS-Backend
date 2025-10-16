const Order = require("./orders.model");
const redisClient = require("../../config/redis");
const Admin = require("../admin/admin.model.js");
const { emitAgreementMessage } = require("../../config/socket");
const Product = require("../products/products.model");

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

// Helper function to delete Redis keys by pattern without blocking
const deleteKeysByPattern = async (pattern) => {
	if (!redisClient) return;
	try {
		let cursor = 0;
		do {
			const reply = await redisClient.scan(cursor, {
				MATCH: pattern,
				COUNT: 100, // Process 100 keys per iteration
			});
			cursor = reply.cursor;
			const keys = reply.keys;
			if (keys.length > 0) {
				await redisClient.del(keys);
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
			await redisClient.del(keysToDelete);
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
	if (newStatus === "delivered") {
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
	}
	if (newStatus === "paid") {
		order.paymentStatus = "Paid";
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

	if (!message || typeof message !== "string" || !message.trim()) {
		throw new Error("Message content is required.");
	}

	const order = await Order.findById(orderId);

	if (!order) {
		throw new Error("Order not found.");
	}

	console.log("📋 Order found:", {
		customerId: order.customerId.toString(),
		vendorId: order.vendorId.toString(),
		status: order.status
	});

	// Ensure the user is either the customer or the vendor for this order
	const isCustomer = order.customerId.toString() === userId;
	const isVendor = order.vendorId.toString() === userId;

	if (!isCustomer && !isVendor) {
		throw new Error("You are not authorized to update this order.");
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
		await Promise.all([
			redisClient.del(getOrderKey(orderId)),
			redisClient.del(getUserOrdersKey(order.customerId.toString())),
			redisClient.del(getVendorOrdersKey(order.vendorId.toString())),
		]);
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

exports.createOrder = async (req, res) => {
	const orderData = req.body;

	try {
		// Basic validation
		if (!orderData.userId || !orderData.items || orderData.items.length === 0) {
			return res.status(400).json({ message: "Invalid order data" });
		}

		// Create order
		const savedOrder = await this.createOrderService(orderData);

		return res.status(201).json(savedOrder);
	} catch (error) {
		console.error("Error creating order:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};

// GET ORDERS BY USER
exports.getOrdersByUser = async (req, res) => {
	const userId = req.params.userId;

	try {
		const orders = await this.getOrdersByUserService(userId);
		return res.json(orders);
	} catch (error) {
		console.error("Error fetching orders by user:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};

// GET ORDERS BY VENDOR
exports.getOrdersByVendor = async (req, res) => {
	const vendorId = req.params.vendorId;

	try {
		const orders = await this.getOrdersByVendorService(vendorId);
		return res.json(orders);
	} catch (error) {
		console.error("Error fetching orders by vendor:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};

// GET ORDERS BY PRODUCT
exports.getOrdersByProduct = async (req, res) => {
	const productId = req.params.productId;

	try {
		const orders = await this.getOrdersByProductService(productId);
		return res.json(orders);
	} catch (error) {
		console.error("Error fetching orders by product:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};

// GET ORDER BY ID 
exports.getOrderById = async (req, res) => {
	const orderId = req.params.orderId;

	try {
		const order = await this.getOrderByIdService(orderId);
		if (!order) {
			return res.status(404).json({ message: "Order not found" });
		}
		return res.json(order);
	} catch (error) {
		console.error("Error fetching order by ID:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};

// CANCEL ORDER (WITH CACHE INVALIDATION)
exports.cancelOrder = async (req, res) => {
	const orderId = req.params.orderId;

	try {
		const updatedOrder = await this.cancelOrderService(orderId);
		if (!updatedOrder) {
			return res.status(404).json({ message: "Order not found" });
		}
		return res.json(updatedOrder);
	} catch (error) {
		console.error("Error cancelling order:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};

// UPDATE ORDER STATUS (WITH CACHE INVALIDATION)
exports.updateOrderStatus = async (req, res) => {
	const orderId = req.params.orderId;
	const { newStatus, trackingNumber } = req.body;

	try {
		const updatedOrder = await this.updateOrderStatusService(
			orderId,
			newStatus,
			trackingNumber
		);
		if (!updatedOrder) {
			return res.status(404).json({ message: "Order not found" });
		}
		return res.json(updatedOrder);
	} catch (error) {
		console.error("Error updating order status:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};

// ADD AGREEMENT MESSAGE TO ORDER
exports.addAgreementMessage = async (req, res) => {
	const { orderId } = req.params;
	const { message, role } = req.body;
	const userId = req.user._id; // Assuming user ID is available in the request object

	try {
		const updatedOrder = await this.addAgreementMessageService({
			orderId,
			userId,
			message,
			role,
		});
		return res.json(updatedOrder);
	} catch (error) {
		console.error("Error adding agreement message:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
};
