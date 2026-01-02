let redisClient;
try {
  const redisModule = require("../../config/redis");
  // Support modules that export either the client directly or a factory getRedisClient()
  redisClient =
    typeof redisModule.getRedisClient === "function"
      ? redisModule.getRedisClient()
      : redisModule;
} catch (e) {
  const logger = require("../../utils/logger");
  logger.warn("Redis client not available, falling back to MongoDB only.");
  redisClient = null;
}
const Product = require("./products.model.js");
const Admin = require("../admin/admin.model.js");
const Vendor = require("../vendors/vendors.model.js");
// validateOptionPayload re-exported from productUtils to allow easy mocking in tests
const { validateOptionPayload } = require("./product-utils/productUtils.js");
const {
  deleteBatchFromCloudinary,
  extractPublicIdFromUrl,
} = require("../upload/upload.service.js");
const CacheUtils = require("./product-utils/cacheUtils.js");
const {
  validateAndCleanPromotions,
  ensureMainImage,
  isValidObjectId,
  createError,
  sanitizePagination,
  buildSearchQuery,
  buildCategoryQuery,
  buildMunicipalityQuery,
} = require("./product-utils/productUtils.js");

const cache = new CacheUtils(redisClient);
const mongoose = require("mongoose");
const logger = require("../../utils/logger");
const sanitizeMongoInput = require("../../utils/sanitizeMongoInput");

async function invalidateAllProductCaches(productId, vendorId = null) {
  // Run deletes in parallel and don't fail the caller if cache errors occur
  const ops = [cache.delete(`products:${productId}`)];
  if (vendorId) {
    ops.push(cache.delete(`product:vendor:${vendorId}:approved`));
    ops.push(cache.delete(`product:vendor:${vendorId}:own:all`));
  }
  ops.push(cache.deletePattern(`products:approved:category:*`));
  ops.push(cache.deletePattern(`products:search:*`));
  ops.push(cache.deletePattern(`products:municipality:*`));

  try {
    await Promise.all(ops);
  } catch (err) {
    logger.warn(
      "[invalidateAllProductCaches] Cache invalidation encountered an error:",
      err
    );
  }
}

// Product status constants
const PRODUCT_STATUS = {
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
};

async function getPaginatedProducts(skip = 1, limit) {
  skip = sanitizeMongoInput(skip);
  limit = sanitizeMongoInput(limit);

  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const redisPageKey = `products:approved:limit:${limitNum}`;

  try {
    let paginatedProducts = await cache.get(redisPageKey);

    if (paginatedProducts) return paginatedProducts;

    // Only return approved products for public listing (buyers)
    paginatedProducts = await Product.aggregate([
      {
        $match: {
          status: PRODUCT_STATUS.APPROVED,
          isDisabled: { $ne: true },
          stock: { $gt: 0 },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: limitNum },
    ]);

    if (cache.isAvailable())
      await cache.set(redisPageKey, paginatedProducts, 120);

    return paginatedProducts;
  } catch (error) {
    throw createError(error);
  }
}

async function createProductService(data) {
  data = sanitizeMongoInput(data);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const newProduct = new Product(data);

    // Ensure product has at least one main image
    ensureMainImage(newProduct);

    await newProduct.save({ session });

    await session.commitTransaction();

    await invalidateAllProductCaches(newProduct._id, newProduct.vendorId);

    return newProduct;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function getProductsByCategoryService(category, limit, skip) {
  category = sanitizeMongoInput(category);

  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);

  if (typeof category !== "string" || category.trim().length === 0) {
    throw createError("Invalid category", 400);
  }
  if (category.length > 128) {
    throw createError("Category too long", 400);
  }

  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:approved:category:${normalizeCategory}:limit:${limitNum}:skip:${skipNum}`;

  let paginated = await cache.get(cacheKey);
  if (paginated) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return paginated;
  }

  // Build query for approved products with category filter
  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  const categoryQuery = buildCategoryQuery(normalizeCategory);
  const query = { ...baseQuery, ...categoryQuery, stock: { $gt: 0 } };

  paginated = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skipNum)
    .limit(limitNum)
    .lean({ virtuals: true });

  if (cache.isAvailable()) {
    await cache.set(cacheKey, paginated, 180); // 6 minutes TTL
  }

  return paginated;
}

// get product by municipality
async function getProductByMunicipality(municipality, category, limit, skip) {
  municipality = sanitizeMongoInput(municipality);
  category = sanitizeMongoInput(category);

  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  if (typeof municipality !== "string" || typeof category !== "string") {
    throw createError("Invalid municipality or category", 400);
  }
  if (municipality.length > 128 || category.length > 128) {
    throw createError("Municipality or category too long", 400);
  }
  const normalizeMunicipality = municipality.toLowerCase().trim();
  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:approved:municipality:${normalizeMunicipality}:${normalizeCategory}:limit:${limitNum}:skip:${skipNum}`;

  let paginated = await cache.get(cacheKey);
  if (paginated) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return paginated;
  }

  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  let query = { ...baseQuery };

  if (normalizeMunicipality !== "all") {
    query = {
      ...query,
      ...buildMunicipalityQuery(normalizeMunicipality),
      stock: { $gt: 0 },
    };
  }

  if (normalizeCategory !== "all") {
    query = {
      ...query,
      ...buildCategoryQuery(normalizeCategory),
      stock: { $gt: 0 },
    };
  }

  if (normalizeMunicipality === "all" && normalizeCategory === "all") {
    // No filters, just paginate all
    paginated = await Product.find(baseQuery)
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean({ virtuals: true });
  } else {
    paginated = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean({ virtuals: true });
  }

  if (cache.isAvailable()) {
    await cache.set(cacheKey, paginated, 120); // 2 min TTL
  }

  return paginated;
}

// related products
async function getRelatedProducts(productId, limit = 6) {
  productId = sanitizeMongoInput(productId);

  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }

  const currentProduct = await Product.findById(productId).lean();
  if (!currentProduct) throw createError("Product not found", 404);

  const categories = Array.isArray(currentProduct.categories)
    ? currentProduct.categories
    : [];

  if (categories.length === 0) return [];

  // ✅ Find products that share at least ONE category (only approved products)
  const related = await Product.find({
    _id: { $ne: productId },
    stock: { $gt: 0 },
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
    categories: { $in: categories }, // <-- Matches if ANY category overlaps
  })
    .sort({ updatedAt: -1 }) // newest first
    .limit(limit)
    .lean({ virtuals: true });

  return related;
}

async function searchProductsService(query, limit = 0, skip = 0) {
  query = sanitizeMongoInput(query);

  if (typeof query !== "string" || query.trim().length === 0) {
    throw createError("Search query must be a non-empty string", 400);
  }
  if (query.length > 256) {
    throw createError("Search query too long", 400);
  }

  const terms = query.toLowerCase().trim().split(/\s+/);
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const cacheKey = `products:search:${terms.join(
    "-"
  )}:limit:${limitNum}:skip:${skipNum}`;

  let paginated = await cache.get(cacheKey);
  if (paginated) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return paginated;
  }

  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  // Prefer MongoDB text search for performance if supported; fallback to regex search
  try {
    const textQuery = { $text: { $search: query } };
    paginated = await Product.find(
      { ...baseQuery, ...textQuery, stock: { $gt: 0 } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum > 0 ? limitNum : 0)
      .lean({ virtuals: true });
  } catch (err) {
    // If $text fails (e.g., no text index), fall back to regex-based search
    const searchQuery = buildSearchQuery(terms);
    const queryObj = { ...baseQuery, ...searchQuery };

    paginated = await Product.find(queryObj)
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum > 0 ? limitNum : 0)
      .lean({ virtuals: true });
  }

  if (cache.isAvailable() && paginated.length > 0) {
    await cache.set(cacheKey, paginated, 600); // 10 min TTL
  }

  return paginated;
}

async function getProductByVendor(vendorId, limit = 15, skip = 0) {
  vendorId = sanitizeMongoInput(vendorId);

  if (!isValidObjectId(vendorId)) {
    throw createError("Invalid vendor ID", 400);
  }

  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const cacheKey = `product:vendor:${vendorId}:approved:skip:${skipNum}:limit:${limitNum}`;

  let products = await cache.get(cacheKey);
  if (products) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return products;
  }

  // Only fetch approved and not disabled products for public view
  const vendorProducts = await Product.find({
    vendorId,
    status: PRODUCT_STATUS.APPROVED,
    stock: { $gt: 0 },
    isDisabled: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .skip(skipNum)
    .limit(limitNum)
    .lean({ virtuals: true });

  products = vendorProducts;

  if (cache.isAvailable()) {
    await cache.set(cacheKey, products, 300);
  }

  return products;
}

// Get ALL vendor's own products including pending/rejected (for vendor dashboard)
async function getVendorOwnProducts(vendorId) {
  vendorId = sanitizeMongoInput(vendorId);

  const cacheKey = `product:vendor:${vendorId}:own:all`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached.map((p) => new Product(p).toJSON());
  }

  // Fetch ALL products for this vendor (no status filter)
  const productsWithVirtuals = await Product.find({
    vendorId,
    isDisabled: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });

  if (cache.isAvailable()) {
    await cache.set(cacheKey, productsWithVirtuals, 120); // Shorter cache for own products
  }

  return productsWithVirtuals;
}

async function getProductByIdService(id) {
  id = sanitizeMongoInput(id);

  if (!isValidObjectId(id)) {
    throw createError("Invalid product ID", 400);
  }

  const cacheKey = `products:${id}`;
  let productWithVendorProfile = await cache.get(cacheKey);

  if (productWithVendorProfile) {
    // Clone cached object before any mutation to avoid side-effects on shared cache
    const cloned = JSON.parse(JSON.stringify(productWithVendorProfile));
    validateAndCleanPromotions(cloned);
    return cloned;
  }

  const productDoc = await Product.findById(id);
  if (!productDoc) {
    throw createError("Product not found", 404);
  }

  const product = productDoc.toObject();

  // Validate and clean expired promotions before returning
  validateAndCleanPromotions(product);

  const { vendorId } = product;
  const vendorProfile = await Vendor.findOne({ userId: vendorId })
    .select("imageUrl storeName")
    .lean();

  productWithVendorProfile = {
    ...product,
    storeName: vendorProfile?.storeName || null,
    vendorAvatar: vendorProfile?.imageUrl || null,
  };

  // Reduced cache TTL to 2 minutes for more accurate promotion handling
  if (cache.isAvailable()) {
    await cache.set(cacheKey, productWithVendorProfile, 120);
  }

  return productWithVendorProfile;
}

async function updateProductService(id, data) {
  id = sanitizeMongoInput(id);
  data = sanitizeMongoInput(data);

  if (!isValidObjectId(id)) {
    throw createError("Invalid product ID", 400);
  }

  const cacheKey = `products:${id}`;
  await cache.delete(cacheKey);

  let updatedProduct = await Product.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!updatedProduct) {
    throw createError("Product not found", 404);
  }

  // Check if we need to auto-replace main image with option image
  const wasModified = ensureMainImage(updatedProduct);

  if (wasModified) {
    // Save the changes if main image was auto-replaced
    await updatedProduct.save();
  }

  // Convert to plain object
  updatedProduct = updatedProduct.toObject();

  // Selective cache invalidation
  await invalidateAllProductCaches(id, updatedProduct.vendorId);

  return updatedProduct;
}

async function updateProductOptionService(productId, optionId, updateData) {
  productId = sanitizeMongoInput(productId);
  optionId = sanitizeMongoInput(optionId);
  updateData = sanitizeMongoInput(updateData);

  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }
  if (!isValidObjectId(optionId)) {
    throw createError("Invalid option ID", 400);
  }

  // Whitelist modifiable option fields to prevent unexpected updates
  const allowedKeys = ["imageUrl", "price", "label", "isHot", "stock", "sold"];
  const updateFields = {};
  for (const key of Object.keys(updateData)) {
    if (!allowedKeys.includes(key)) {
      throw createError(`Invalid option field: ${key}`, 400);
    }
    updateFields[`option.$.${key}`] = updateData[key];
  }

  const updated = await Product.findOneAndUpdate(
    { _id: productId, "option._id": optionId },
    { $set: updateFields },
    { new: true, runValidators: true, context: "query" }
  );

  if (!updated) {
    throw createError("Product or option not found", 404);
  }

  await invalidateAllProductCaches(productId, updated.vendorId);
  return updated;
}

async function addProductStock(productId, optionId, addition) {
  productId = sanitizeMongoInput(productId);
  if (optionId) optionId = sanitizeMongoInput(optionId);
  addition = sanitizeMongoInput(addition);

  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }
  if (optionId && !isValidObjectId(optionId)) {
    throw createError("Invalid option ID", 400);
  }

  if (typeof addition !== "number" || Number.isNaN(addition)) {
    throw createError("Addition value must be a number", 400);
  }

  // If optionId is provided, handle option stock
  if (optionId) {
    // Proceed with atomic update
    const updated = await Product.findOneAndUpdate(
      {
        _id: productId,
        "option._id": optionId,
        "option.stock": { $gte: -addition },
      },
      { $inc: { "option.$.stock": addition } },
      { new: true, runValidators: true, context: "query" }
    );

    if (!updated) {
      throw createError(
        "Product or option not found or insufficient stock",
        404
      );
    }

    await invalidateAllProductCaches(productId, updated.vendorId);
    return updated;
  }

  // No optionId: handle main product stock
  // Proceed with atomic update
  const updated = await Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: -addition } },
    { $inc: { stock: addition } },
    { new: true }
  );

  if (!updated) {
    throw createError("Product not found or insufficient stock", 404);
  }

  await invalidateAllProductCaches(productId, updated.vendorId);
  return updated;
}

async function addProductStockMain(productId, addition) {
  productId = sanitizeMongoInput(productId);
  addition = sanitizeMongoInput(addition);

  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }

  logger.debug(`addProductStockMain addition type: ${typeof addition}`);
  if (typeof addition !== "number" || Number.isNaN(addition)) {
    throw createError("Addition value must be a number", 400);
  }

  // Update stock atomically to prevent negative values
  let updated = await Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: -addition } },
    { $inc: { stock: addition } },
    { new: true }
  );

  if (!updated) {
    throw createError("Product not found or insufficient stock", 404);
  }

  await invalidateAllProductCaches(productId, updated.vendorId);
  return updated;
}

async function deleteProductService(id) {
  id = sanitizeMongoInput(id);

  if (!isValidObjectId(id)) {
    throw createError("Invalid product ID", 400);
  }

  const PRODUCT_BY_ID_KEY = `products:${id}`;

  logger.info(`[Product Delete] Starting deletion for product ${id}`);

  // Use transaction for DB operations
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Atomically delete product and return deleted document
    const deletedProduct = await Product.findOneAndDelete(
      { _id: id },
      { session }
    );
    if (!deletedProduct) {
      throw createError("Product not found", 404);
    }

    // Gather image URLs from deleted document
    const imageUrls = [];
    if (deletedProduct.imageUrls && Array.isArray(deletedProduct.imageUrls))
      imageUrls.push(...deletedProduct.imageUrls);
    if (deletedProduct.option && Array.isArray(deletedProduct.option))
      deletedProduct.option.forEach((v) => {
        if (v.imageUrl) imageUrls.push(v.imageUrl);
      });

    const publicIds = imageUrls
      .map((url) => {
        const publicId = extractPublicIdFromUrl(url);
        if (!publicId) {
          logger.warn(
            `[Product Delete] Failed to extract public_id from URL: ${url}`
          );
        }
        return publicId;
      })
      .filter((id) => id !== null);

    await session.commitTransaction();

    // Delete images from Cloudinary after successful DB deletion
    if (publicIds.length > 0) {
      try {
        const deleteResult = await deleteBatchFromCloudinary(publicIds);
        logger.info(
          `[Product Delete] Cloudinary deletion result: ${deleteResult.successful}/${deleteResult.total} images deleted successfully`
        );

        if (deleteResult.failed > 0) {
          logger.error(
            `[Product Delete] Failed to delete ${deleteResult.failed} images from Cloudinary`
          );
          logger.error(
            "[Product Delete] Deletion details:",
            JSON.stringify(deleteResult.details, null, 2)
          );
        }
      } catch (error) {
        logger.error(
          `[Product Delete] Exception during Cloudinary deletion: ${
            error?.message || error
          }`,
          error
        );
        // Log error but don't fail the operation since DB is already deleted
      }
    } else {
      logger.info(`[Product Delete] No Cloudinary images to delete`);
    }

    await cache.delete(PRODUCT_BY_ID_KEY);

    await invalidateAllProductCaches(id, deletedProduct.vendorId);

    logger.info(
      `[Product Delete] Successfully deleted product ${id} from database`
    );

    return true;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// --- Refactor helpers for removing variants ---

/**
 * Remove variant from product doc; if it was the only variant delete product
 * Returns: { deleted: boolean, product?: mongooseDoc, removedVariantImageUrl?: string, publicIdsToCleanup?: string[], vendorId }
 */
async function removeVariantData(productId, variantId) {
  productId = sanitizeMongoInput(productId);
  variantId = sanitizeMongoInput(variantId);

  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }
  if (!isValidObjectId(variantId)) {
    throw createError("Invalid variant ID", 400);
  }

  // Fetch current product once for logging and decision making
  const product = await Product.findById(productId);
  if (!product) {
    throw createError("Product not found", 404);
  }

  logger.debug(
    `[removeVariantData] Product ${productId} has ${
      product.option?.length || 0
    } options`
  );

  const variantToRemove = product.option.find(
    (opt) => opt._id.toString() === variantId
  );
  if (!variantToRemove) {
    throw createError("Variant not found", 404);
  }

  // If only one variant existed at read time, attempt an atomic delete of product
  if ((product.option?.length || 0) <= 1) {
    const deleted = await Product.findOneAndDelete({
      _id: productId,
      "option._id": variantId,
    });

    if (!deleted) {
      // Could be a concurrent modification
      throw createError("Product not found", 404);
    }

    // Gather all image URLs from deleted document
    const imageUrls = [];
    if (deleted.imageUrls && Array.isArray(deleted.imageUrls))
      imageUrls.push(...deleted.imageUrls);
    if (deleted.option && Array.isArray(deleted.option))
      deleted.option.forEach((v) => {
        if (v.imageUrl) imageUrls.push(v.imageUrl);
      });

    const publicIds = imageUrls
      .map((u) => extractPublicIdFromUrl(u))
      .filter((id) => id !== null);

    return {
      deleted: true,
      publicIdsToCleanup: publicIds,
      vendorId: deleted.vendorId,
    };
  }

  // Otherwise remove the variant atomically using $pull; then recalc aggregates from the returned doc
  const updated = await Product.findOneAndUpdate(
    { _id: productId, "option._id": variantId },
    { $pull: { option: { _id: variantId } } },
    { new: true }
  );

  if (!updated) {
    // Variant or product might have been removed concurrently
    throw createError("Variant not found", 404);
  }

  // Find image url of removed variant from earlier read (variantToRemove)
  const removedVariantImageUrl = variantToRemove.imageUrl || null;

  // Recalculate aggregates on updated doc
  updated.stock = (updated.option || []).reduce(
    (sum, o) => sum + (o.stock || 0),
    0
  );
  updated.sold = (updated.option || []).reduce(
    (sum, o) => sum + (o.sold || 0),
    0
  );
  updated.isOption = (updated.option || []).length > 0;

  await updated.save();

  return {
    deleted: false,
    product: updated,
    removedVariantImageUrl,
    vendorId: updated.vendorId,
  };
}

/**
 * Reassign main image if it referenced the removed variant image URL
 * Returns { modified: boolean }
 */
function reassignMainImageIfNeeded(product, removedVariantImageUrl) {
  if (!product || !removedVariantImageUrl) return { modified: false };

  const usedAsMain =
    product.imageUrls && product.imageUrls.includes(removedVariantImageUrl);
  if (!usedAsMain) return { modified: false };

  product.imageUrls = product.imageUrls.filter(
    (u) => u !== removedVariantImageUrl
  );
  ensureMainImage(product);
  return { modified: true };
}

/**
 * Cleanup images from Cloudinary safely using upload.service safeDeleteBatch
 * Returns the raw result from safeDeleteBatch
 */
async function cleanupVariantImages(publicIds) {
  if (!Array.isArray(publicIds) || publicIds.length === 0)
    return { successful: 0, failed: 0, total: 0 };
  try {
    const uploadService = require("../upload/upload.service.js");
    const result = await uploadService.safeDeleteBatch(publicIds);
    return result;
  } catch (err) {
    logger.error("[cleanupVariantImages] Unexpected error:", err);
    return {
      successful: 0,
      failed: publicIds.length,
      total: publicIds.length,
      failedDetails: publicIds.map((id) => ({
        publicId: id,
        reason: "error",
        error: err.message,
      })),
    };
  }
}

/**
 * Public removeVariant - orchestrates the smaller helpers
 */
async function removeVariant(productId, variantId) {
  productId = sanitizeMongoInput(productId);
  variantId = sanitizeMongoInput(variantId);

  if (!isValidObjectId(productId) && !isValidObjectId(variantId)) {
    throw createError("Invalid product ID", 400);
  }
  // 1) Remove data
  const dataResult = await removeVariantData(productId, variantId);

  // If product deleted entirely
  if (dataResult.deleted) {
    // Cleanup images if any
    if (
      dataResult.publicIdsToCleanup &&
      dataResult.publicIdsToCleanup.length > 0
    ) {
      const cleanupResult = await cleanupVariantImages(
        dataResult.publicIdsToCleanup
      );
      logger.info(
        `[removeVariant] cleanup result: ${cleanupResult.successful}/${cleanupResult.total} removed`
      );
    }

    // Invalidate caches
    await invalidateAllProductCaches(productId, dataResult.vendorId);

    return {
      deleted: true,
      message: "Product deleted since only one variant existed.",
    };
  }

  // 2) If variant removed from product, perform image cleanup for that variant only
  const publicIds = [];
  if (dataResult.removedVariantImageUrl) {
    const publicId = extractPublicIdFromUrl(dataResult.removedVariantImageUrl);
    if (publicId) publicIds.push(publicId);
  }

  if (publicIds.length > 0) {
    const cleanupResult = await cleanupVariantImages(publicIds);
    logger.info(
      `[removeVariant] variant image cleanup result: ${cleanupResult.successful}/${cleanupResult.total}`
    );
  }

  // 3) Reassign main image if needed
  const { product, removedVariantImageUrl } = dataResult;
  const reassigned = reassignMainImageIfNeeded(product, removedVariantImageUrl);
  if (reassigned.modified) {
    await product.save();
  }

  // 4) Invalidate caches
  await invalidateAllProductCaches(productId, dataResult.vendorId);

  return { deleted: false, message: "Variant removed successfully.", product };
}

async function getProductOrThrow(productId) {
  productId = sanitizeMongoInput(productId);

  const product = await Product.findById(productId);
  if (!product) {
    throw createError("Product not found", 404);
  }
  return product;
}

async function addSingleOption(productId, optionData) {
  productId = sanitizeMongoInput(productId);
  optionData = sanitizeMongoInput(optionData);

  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }

  // Validate payload
  const errors = validateOptionPayload(optionData);
  if (errors.length) {
    throw createError(errors.join(", "), 400);
  }

  const newOption = {
    imageUrl: optionData.imageUrl || "",
    price: optionData.price,
    label: optionData.label || null,
    isHot: !!optionData.isHot,
    stock: optionData.stock ?? 0,
    sold: optionData.sold ?? 0,
  };

  // If label provided, use a transaction to enforce uniqueness under concurrency
  if (optionData.label) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Load product in transaction and check for label existence (case-insensitive)
      const product = await Product.findById(productId).session(session);
      if (!product) {
        throw createError("Product not found", 404);
      }

      const labelExists = (product.option || []).some((opt) => {
        return (
          opt.label &&
          opt.label.toLowerCase() === optionData.label.toLowerCase()
        );
      });

      if (labelExists) {
        throw createError(
          "Option with this label already exists for this product",
          409
        );
      }

      // Push new option and update aggregates atomically within transaction
      await Product.updateOne(
        { _id: productId },
        {
          $push: { option: newOption },
          $inc: { stock: newOption.stock || 0, sold: newOption.sold || 0 },
          $set: { isOption: true },
        },
        { session }
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    // Return fresh product document
    const updated = await Product.findById(productId);

    // Ensure main image if none existed before and option has image
    const wasModified = ensureMainImage(updated);
    if (wasModified) {
      await updated.save();
    }

    await invalidateAllProductCaches(productId, updated.vendorId);
    return updated;
  }

  // Fallback for label-less options: atomic push is sufficient
  const updated = await Product.findOneAndUpdate(
    { _id: productId },
    {
      $push: { option: newOption },
      $inc: { stock: newOption.stock || 0, sold: newOption.sold || 0 },
      $set: { isOption: true },
    },
    { new: true }
  );

  if (!updated) {
    throw createError("Product not found", 404);
  }

  const wasModified = ensureMainImage(updated);
  if (wasModified) {
    await updated.save();
  }

  await invalidateAllProductCaches(productId, updated.vendorId);
  return updated;
}

module.exports = {
  addSingleOption,
  getPaginatedProducts,
  createProductService,
  getProductsByCategoryService,
  searchProductsService,
  getProductByIdService,
  updateProductService,
  deleteProductService,
  getProductByMunicipality,
  getRelatedProducts,
  getProductByVendor,
  getVendorOwnProducts,
  updateProductOptionService,
  removeVariant,
  removeVariantData,
  cleanupVariantImages,
  reassignMainImageIfNeeded,
  addProductStock,
  addProductStockMain,
  ensureMainImage,
  invalidateAllProductCaches,
  validateAndCleanPromotions,
};
