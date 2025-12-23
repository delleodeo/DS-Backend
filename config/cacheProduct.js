const Product = require("../modules/products/products.model"); // Adjust path
const { getRedisClient, isRedisAvailable } = require("./redis"); // Adjust path

module.exports = async () => {
	if (!isRedisAvailable()) {
		console.log("⚠️ Redis not available, skipping product cache");
		return;
	}

	try {
		const redisClient = getRedisClient();
		const products = await Product.find().lean();
		await redisClient.set("products:all", JSON.stringify(products), { EX: 3600 }).catch(() => {}); // No expiry
		console.log(`✅ Cached ${products.length} products in Redis`);
	} catch (err) {
		console.error("Failed to cache products:", err.message);
	}
};
