const Cart = require("./cart.model");
const Product = require("../products/products.model");
const Vendor = require("../vendors/vendors.model.js");
const {
	getRedisClient,
	isRedisAvailable,
} = require("../../config/redis");
const redisClient = getRedisClient();
const { json } = require("express");

const getCacheKey = (userId) => `cart:${userId}`;

exports.addToCartService = async (userId, item) => {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = new Cart({ userId, items: [item] });
  } else {
    const existingItem = cart.items.find(
      (i) =>
        i.productId.equals(item.productId) &&
        String(i.optionId) === String(item.optionId)
    );

    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
  }

  cart.updatedAt = new Date();
  await cart.save();

	if (isRedisAvailable()) {
		await redisClient.set(getCacheKey(userId), JSON.stringify(cart)).catch(() => {});
	}	return cart;
};
exports.getCartService = async (userId) => {
	if (isRedisAvailable()) {
		const cache = await redisClient.get(getCacheKey(userId)).catch(() => null);
		if (cache) return JSON.parse(cache);
	}

	const cart = await Cart.findOne({ userId }).lean();
	if (cart && isRedisAvailable()) {
		await redisClient.set(getCacheKey(userId), JSON.stringify(cart)).catch(() => {});
	}
	console.log(cart);
	return cart || { userId, items: [] };
};

exports.updateCartItemService = async (userId, item) => {
  const cart = await Cart.findOne({ userId });
  if (!cart) throw new Error("Cart not found");

  const existingItem = cart.items.find(
    (i) =>
      i.productId.equals(item.productId) &&
      String(i.optionId) === String(item.optionId)
  );

  if (existingItem) {
    existingItem.quantity += item.quantity;
  } else {
    cart.items.push(item);
  }

  cart.updatedAt = new Date();
  await cart.save();
	if (isRedisAvailable()) {
		await redisClient.set(getCacheKey(userId), JSON.stringify(cart)).catch(() => {});
	}	return cart;
};
exports.removeCartItemService = async (userId, productId, optionId) => {
	console.log("Removing item: START");
	console.log(JSON.stringify({ productId, optionId }));
	const cart = await Cart.findOne({ userId });
	if (!cart) throw new Error("Cart not found");

	cart.items = cart.items.filter((item) => {
		const isProductMatch = item.productId.equals(productId);
		const isOptionMatch =
			// Both have no optionId
			(!item.optionId && !optionId) ||
			// Both have an optionId and they are the same
			(item.optionId &&
				optionId &&
				String(item.optionId) === String(optionId));

		// We want to keep items that DON'T match
		return !(isProductMatch && isOptionMatch);
	});

	cart.updatedAt = new Date();
	await cart.save();
	if (isRedisAvailable()) {
		await redisClient.del(getCacheKey(userId)).catch(() => {});
	}
	console.log("Removing item: END");
	console.log(JSON.stringify({ productId, optionId }));
	return cart;
};

exports.clearCartService = async (userId) => {
	const cart = await Cart.findOneAndUpdate(
		{ userId },
		{ items: [], updatedAt: new Date() },
		{ new: true }
	);

	if (isRedisAvailable()) {
		await redisClient.set(getCacheKey(userId), JSON.stringify(cart)).catch(() => {});
	}
	return cart;
};

/**
 * Invalidate all cart caches to force fresh data fetch
 * Should be called when promotions are changed/ended
 */
exports.invalidateAllCartCaches = async () => {
	console.log("Starting cart cache invalidation...");
	if (!isRedisAvailable()) {
		console.log("Skip cart cache invalidation: Redis not available");
		return;
	}

	try {
		// Get all cart cache keys
		const cartKeys = await redisClient.keys("cart:*").catch(() => []);
		
		if (cartKeys.length > 0) {
			// Delete all cart cache keys
			await redisClient.del(...cartKeys).catch(() => {});
			console.log(`✅ Invalidated ${cartKeys.length} cart cache entries`);
		} else {
			console.log("No cart caches found to invalidate");
		}
	} catch (error) {
		console.error("Error invalidating cart caches:", error);
	}
};
