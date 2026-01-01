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

const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');
const { ValidationError, asyncHandler } = require('../../utils/errorHandler');
const { validateId } = require('../../utils/validation');

exports.addAgreementMessage = asyncHandler(async (req, res) => {
	const { id: orderId } = req.params;
	const { id: userId, role } = req.user;
	let { message } = req.body;

	// Basic input sanitization
	message = sanitizeMongoInput(message);
	validateId(String(orderId), 'orderId');

	if (!message || typeof message !== 'string' || !message.trim()) {
		throw new ValidationError('Message content is required.');
	}

	// Map user role to sender type
	const senderType = role === 'vendor' ? 'vendor' : 'customer';

	const updatedOrder = await addAgreementMessageService({
		orderId,
		userId,
		message,
		role: senderType,
	});

	res.json(updatedOrder);
});

exports.createOrder = asyncHandler(async (req, res) => {
	const { id } = req.user;
	const payload = sanitizeMongoInput(req.body);

	if (!payload || !payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
		throw new ValidationError('Invalid order data');
	}

	const order = await createOrderService({ customerId: id, ...payload });
	res.status(201).json(order);
});

exports.getOrdersByUser = asyncHandler(async (req, res) => {
	const { id } = req.user;
	validateId(String(id), 'userId');
	const orders = await getOrdersByUserService(id);
	res.json(orders);
});

exports.getOrdersByVendor = asyncHandler(async (req, res) => {
	const { id } = req.user;
	validateId(String(id), 'vendorId');
	const orders = await getOrdersByVendorService(id);
	res.json(orders);
});

exports.getOrdersByProduct = asyncHandler(async (req, res) => {
	const { productId } = req.params;
	validateId(String(productId), 'productId');
	const orders = await getOrdersByProductService(productId);
	res.json(orders);
});

exports.getOrderById = asyncHandler(async (req, res) => {
	const { id } = req.params;
	validateId(String(id), 'orderId');
	const order = await getOrderByIdService(id);
	if (!order) throw new ValidationError('Order not found');
	res.json(order);
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
	const { orderId } = req.params;
	const { newStatus, trackingNumber } = req.body;
	validateId(String(orderId), 'orderId');
	const order = await updateOrderStatusService(orderId, newStatus, trackingNumber);
	if (!order) throw new ValidationError('Order not found');
	res.json(order);
});

exports.cancelOrder = asyncHandler(async (req, res) => {
	const { id } = req.params;
	validateId(String(id), 'orderId');
	const order = await cancelOrderService(id);
	if (!order) throw new ValidationError('Order not found');
	res.json(order);
});

