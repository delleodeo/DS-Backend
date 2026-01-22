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
  validateId(String(id), "vendorId");

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const sortDir = req.query.sortDir === "asc" ? 1 : -1;

  let search = req.query.search ? String(req.query.search).trim() : "";
  if (search.length > 80) search = search.slice(0, 80);
  search = search ? sanitizeMongoInput(search) : "";

  const STATUS_ALLOWED = new Set([
    "pending",
    "paid",
    "shipped",
    "delivered",
    "cancelled",
    "refund_requested",
    "refund_approved",
    "refunded",
  ]);

  const PAYMENT_METHOD_ALLOWED = new Set(["qrph", "card", "gcash", "paymaya", "cod"]);
  const PAYMENT_STATUS_ALLOWED = new Set(["pending", "paid", "failed", "refunded"]);

  const rawStatus =
    req.query.status && req.query.status !== "all" ? String(req.query.status).trim() : null;
  const status = rawStatus && STATUS_ALLOWED.has(rawStatus) ? rawStatus : null;

  const rawPm =
    req.query.paymentMethod && req.query.paymentMethod !== "all"
      ? String(req.query.paymentMethod).trim()
      : null;
  const paymentMethod = rawPm && PAYMENT_METHOD_ALLOWED.has(rawPm) ? rawPm : null;

  const rawPs =
    req.query.paymentStatus && req.query.paymentStatus !== "all"
      ? String(req.query.paymentStatus).trim()
      : null;
  const paymentStatus = rawPs && PAYMENT_STATUS_ALLOWED.has(rawPs) ? rawPs : null;

  const parseDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const result = await getOrdersByVendorService(id, {
    page,
    limit,
    search,
    status,
    paymentMethod,
    paymentStatus,
    dateFrom,
    dateTo,
    sortDir,
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

