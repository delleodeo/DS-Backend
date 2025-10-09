const Product = require("../modules/products/products.model"); // Adjust path
const redisClient = require("./redis"); // Adjust path
 
module.exports = async() => {
  try {
    const products = await Product.find().lean();
    await redisClient.set("products:all", JSON.stringify(products)); // No expiry
    console.log(`✅ Cached ${products.length} products in Redis`);
  } catch (err) {
    console.error("Failed to cache products:", err.message);
  }
}
