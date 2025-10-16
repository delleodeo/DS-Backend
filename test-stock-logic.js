const mongoose = require("mongoose");
const Product = require("./modules/products/products.model");
const Order = require("./modules/orders/orders.model");
const { updateOrderStatusService } = require("./modules/orders/orders.service");
const redis = require("redis");

// Basic Redis client setup
const redisClient = redis.createClient();
redisClient.on("error", (err) => console.log("Redis Client Error", err));

const MONGODB_URI =
	process.env.MONGODB_URI || "mongodb://localhost:27017/doroshop";

async function setupTestData() {
	console.log("Setting up test data...");

	// 1. Create a product without options
	const productNoOptions = await Product.create({
		name: "Simple T-Shirt",
		price: 20,
		stock: 100,
		sold: 10,
		municipality: "Testville",
	});

	// 2. Create a product with options
	const productWithOptions = await Product.create({
		name: "Fancy Hoodie",
		price: 50,
		isOption: true,
		municipality: "Testville",
		option: [
			{ label: "Red", price: 52, stock: 30, sold: 5 },
			{ label: "Blue", price: 52, stock: 40, sold: 8 },
		],
	});
	// Set main stock/sold from options
	productWithOptions.stock = productWithOptions.option.reduce(
		(acc, opt) => acc + opt.stock,
		0
	);
	productWithOptions.sold = productWithOptions.option.reduce(
		(acc, opt) => acc + opt.sold,
		0
	);
	await productWithOptions.save();

	// 3. Create an order for the simple product
	const orderSimple = await Order.create({
		customerId: new mongoose.Types.ObjectId(),
		vendorId: new mongoose.Types.ObjectId(),
		items: [
			{
				productId: productNoOptions._id,
				quantity: 2,
				price: productNoOptions.price,
				name: productNoOptions.name,
			},
		],
		status: "shipped",
		paymentMethod: "cod",
	});

	// 4. Create an order for the product with options
	const orderWithOptions = await Order.create({
		customerId: new mongoose.Types.ObjectId(),
		vendorId: new mongoose.Types.ObjectId(),
		items: [
			{
				productId: productWithOptions._id,
				optionId: productWithOptions.option[0]._id, // Red
				quantity: 3,
				price: productWithOptions.option[0].price,
				name: productWithOptions.name,
				label: "Red",
			},
			{
				productId: productWithOptions._id,
				optionId: productWithOptions.option[1]._id, // Blue
				quantity: 1,
				price: productWithOptions.option[1].price,
				name: productWithOptions.name,
				label: "Blue",
			},
		],
		status: "shipped",
		paymentMethod: "cod",
	});

	console.log("Test data created!");
	return {
		productNoOptions,
		productWithOptions,
		orderSimple,
		orderWithOptions,
	};
}

async function verifyUpdate(
	productId,
	initialStock,
	initialSoldCount,
	quantitySold,
	optionId = null,
	optionLabel = ""
) {
	const product = await Product.findById(productId);
	let currentStock, currentSold;

	if (optionId) {
		const option = product.option.id(optionId);
		currentStock = option.stock;
		currentSold = option.sold;
		console.log(
			`  - Option '${optionLabel}': Stock: ${currentStock}, Sold: ${currentSold}`
		);
	} else {
		currentStock = product.stock;
		currentSold = product.sold;
		console.log(`  - Product: Stock: ${currentStock}, Sold: ${currentSold}`);
	}

	const expectedStock = initialStock - quantitySold;
	const expectedSoldCount = initialSoldCount + quantitySold;

	if (currentStock === expectedStock && currentSold === expectedSoldCount) {
		console.log(
			`  ✅ SUCCESS: Stock and sold count updated correctly for ${
				optionLabel || "product"
			}.`
		);
	} else {
		console.error(
			`  ❌ FAILURE: Mismatch for ${
				optionLabel || "product"
			}. Expected Stock: ${expectedStock}, Got: ${currentStock}. Expected Sold: ${expectedSoldCount}, Got: ${currentSold}.`
		);
	}
}

async function runTest() {
	await mongoose.connect(MONGODB_URI);
	await redisClient.connect();

	const {
		productNoOptions,
		productWithOptions,
		orderSimple,
		orderWithOptions,
	} = await setupTestData();

	// --- Test Case 1: Simple Product ---
	console.log("\n--- Testing Simple Product Order ---");
	const initialSimpleStock = productNoOptions.stock;
	const initialSimpleSoldCount = productNoOptions.sold;
	console.log(
		`Initial Stock: ${initialSimpleStock}, Initial Sold: ${initialSimpleSoldCount}`
	);

	await updateOrderStatusService(orderSimple._id, "delivered");
	console.log("Order status updated to 'delivered'. Verifying stock...");
	await verifyUpdate(
		productNoOptions._id,
		initialSimpleStock,
		initialSimpleSoldCount,
		orderSimple.items[0].quantity
	);

	// --- Test Case 2: Product With Options ---
	console.log("\n--- Testing Product with Options Order ---");
	const initialRedStock = productWithOptions.option[0].stock;
	const initialRedSoldCount = productWithOptions.option[0].sold;
	const initialBlueStock = productWithOptions.option[1].stock;
	const initialBlueSoldCount = productWithOptions.option[1].sold;

	console.log(
		`Initial Stock (Red): ${initialRedStock}, Sold: ${initialRedSoldCount}`
	);
	console.log(
		`Initial Stock (Blue): ${initialBlueStock}, Sold: ${initialBlueSoldCount}`
	);

	await updateOrderStatusService(orderWithOptions._id, "delivered");
	console.log("Order status updated to 'delivered'. Verifying stock...");

	// Verify Red option
	await verifyUpdate(
		productWithOptions._id,
		initialRedStock,
		initialRedSoldCount,
		orderWithOptions.items[0].quantity,
		productWithOptions.option[0]._id,
		"Red"
	);

	// Verify Blue option
	await verifyUpdate(
		productWithOptions._id,
		initialBlueStock,
		initialBlueSoldCount,
		orderWithOptions.items[1].quantity,
		productWithOptions.option[1]._id,
		"Blue"
	);

	// --- Cache Invalidation Test ---
	console.log("\n--- Testing Cache Invalidation ---");
	const productCacheKey = `product:${productNoOptions._id}`;
	const cachedValue = await redisClient.get(productCacheKey);
	if (cachedValue === null) {
		console.log(
			"  ✅ SUCCESS: Redis cache for the updated product was invalidated."
		);
	} else {
		console.error(
			"  ❌ FAILURE: Redis cache for the updated product was not invalidated."
		);
	}

	// Cleanup
	await Product.deleteMany({ municipality: "Testville" });
	await Order.deleteMany({
		_id: { $in: [orderSimple._id, orderWithOptions._id] },
	});
	await mongoose.disconnect();
	await redisClient.quit();
}

runTest().catch(console.error);
