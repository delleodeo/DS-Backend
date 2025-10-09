const {
	createOrderService,
	getOrdersByUserService,
	getOrderByIdService,
	updateOrderStatusService,
	cancelOrderService,
	getOrdersByVendorService,
	getOrdersByProductService,
} = require("./orders.service");

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

