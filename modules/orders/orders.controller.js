const {
	createOrderService,
	getOrdersByUserService,
	getOrderStatusCountsService,
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

	// Extract pagination parameters with defaults and validation
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10)); // Max 50, min 1, default 10

	const result = await getOrdersByUserService(id, { page, limit });
	res.json(result);
});

exports.getOrderStatusCounts = asyncHandler(async (req, res) => {
	const { id } = req.user;
	validateId(String(id), 'userId');
	const counts = await getOrderStatusCountsService(id);
	res.json({ success: true, data: counts });
});

exports.getOrdersByVendor = asyncHandler(async (req, res) => {
	const { id } = req.user;
	validateId(String(id), 'vendorId');

	// Extract pagination and filter parameters with defaults and validation
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 12)); // Max 100, min 1, default 12
	const search = req.query.search ? sanitizeMongoInput(String(req.query.search).trim()) : '';
	const status = req.query.status && req.query.status !== 'all' ? sanitizeMongoInput(req.query.status) : null;
	const paymentMethod = req.query.paymentMethod && req.query.paymentMethod !== 'all' ? sanitizeMongoInput(req.query.paymentMethod) : null;
	const paymentStatus = req.query.paymentStatus && req.query.paymentStatus !== 'all' ? sanitizeMongoInput(req.query.paymentStatus) : null;
	const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
	const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;
	const sortDir = req.query.sortDir === 'asc' ? 1 : -1; // Default desc (-1)

	const result = await getOrdersByVendorService(id, {
		page,
		limit,
		search,
		status,
		paymentMethod,
		paymentStatus,
		dateFrom,
		dateTo,
		sortDir
	});

	res.json(result);
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
	// Pass the customer ID for auto-refund creation
	const customerId = req.user?._id || req.user?.id;
	const order = await cancelOrderService(id, customerId);
	if (!order) throw new ValidationError('Order not found');
	res.json(order);
});

