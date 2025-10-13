const {
	createOrderService,
	getOrdersByUserService,
	getOrderByIdService,
	updateOrderStatusService,
	cancelOrderService,
	getOrdersByVendorService,
	getOrdersByProductService,
	addAgreementMessageService,
} = require("./orders.service");

exports.addAgreementMessage = async (req, res) => {
	try {
		const { id: orderId } = req.params;
		const { id: userId, role } = req.user;
		const { message } = req.body;

		console.log("🔍 Debug - Add Agreement Message:");
		console.log("Order ID:", orderId);
		console.log("User ID:", userId);
		console.log("User Role:", role);
		console.log("Message:", message);
		console.log("Full req.user:", req.user);

		// Map user role to sender type (enum values: "customer" or "vendor")
		let senderType;
		if (role === "vendor") {
			senderType = "vendor";
		} else {
			// Default to customer for any other role (user, admin, etc.)
			senderType = "customer";
		}

		console.log("🔄 Mapped sender type:", senderType);

		const updatedOrder = await addAgreementMessageService({
			orderId,
			userId,
			message,
			role: senderType, // Pass the mapped sender type
		});

		res.json(updatedOrder);
	} catch (err) {
		console.error("❌ Error in addAgreementMessage controller:", err);
		console.error("Error stack:", err.stack);
		
		if (err.message === "Order not found.") {
			return res.status(404).json({ error: err.message });
		}
		if (err.message === "You are not authorized to update this order.") {
			return res.status(403).json({ error: err.message });
		}
		if (err.message === "Message content is required.") {
			return res.status(400).json({ error: err.message });
		}
		res.status(500).json({ error: "Server error while adding message." });
	}
};

exports.createOrder = async (req, res) => {
	try {
		const { id } = req.user;
		const order = await createOrderService({ customerId: id, ...req.body });
		res.status(201).json(order);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

exports.getOrdersByUser = async (req, res) => {
	try {
		const { id } = req.user;
    console.log(id)
		const orders = await getOrdersByUserService(id);
		res.json(orders);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.getOrdersByVendor = async (req, res) => {
	try {
		const { id } = req.user;
		const orders = await getOrdersByVendorService(id);
		res.json(orders);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.getOrdersByProduct = async (req, res) => {
	try {
		const { productId } = req.params;
		const orders = await getOrdersByProductService(productId);
		res.json(orders);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.getOrderById = async (req, res) => {
	try {
		const { id } = req.params;
		const order = await getOrderByIdService(id);
		if (!order) return res.status(404).json({ message: "Order not found" });
		res.json(order);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.updateOrderStatus = async (req, res) => {
	try {
		const { orderId } = req.params;
		const { status } = req.body;
		console.log(orderId)
		const order = await updateOrderStatusService(orderId, status);
		if (!order) return res.status(404).json({ message: "Order not found" });
		res.json(order);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

exports.cancelOrder = async (req, res) => {
	try {
		const { id } = req.params;
		const order = await cancelOrderService(id);
		if (!order) return res.status(404).json({ message: "Order not found" });
		res.json(order);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

