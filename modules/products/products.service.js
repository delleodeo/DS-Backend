let redisClient;
try {
  redisClient = require("../../config/redis");
} catch (e) {
  console.warn("Redis client not available, falling back to MongoDB only.");
  redisClient = null;
}
const Product = require("./products.model.js");
const Admin = require("../admin/admin.model.js");
const Vendor = require("../vendors/vendors.model.js");
const { validateOptionPayload } = require("../../utils/validateOption.js");
const {
  deleteBatchFromCloudinary,
  extractPublicIdFromUrl,
} = require("../upload/upload.service.js");
const CacheUtils = require("./cacheUtils.js");
const {
  validateAndCleanPromotions,
  ensureMainImage,
  isValidObjectId,
  createError,
  sanitizePagination,
  buildSearchQuery,
  buildCategoryQuery,
  buildMunicipalityQuery,
} = require("./productUtils.js");

const cache = new CacheUtils(redisClient);
const redisKey = "products:all";
const mongoose = require("mongoose");

async function invalidateAllProductCaches(productId, vendorId = null) {
  // Invalidate specific product cache
  await cache.delete(`products:${productId}`);

  // Invalidate vendor-related caches
  if (vendorId) {
    await cache.delete(`product:vendor:${vendorId}:approved`);
    await cache.delete(`product:vendor:${vendorId}:own:all`);
  }

  // Invalidate patterns that might be affected (more selective than all)
  await cache.deletePattern(`products:approved:category:*`);
  await cache.deletePattern(`products:search:*`);
  await cache.deletePattern(`products:municipality:*`);
}

// Product status constants
const PRODUCT_STATUS = {
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
};

async function getPaginatedProducts(skip, limit) {
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const redisPageKey = `products:approved:skip:${skipNum}:limit:${limitNum}`;

  let paginatedProducts = await cache.get(redisPageKey);
  if (paginatedProducts) {
    console.log("Redis cache hit:", redisPageKey);
  } else {
    // Only return approved products for public listing (buyers)
    paginatedProducts = await Product.find({
      status: PRODUCT_STATUS.APPROVED,
      isDisabled: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean({ virtuals: true });

    if (cache.isAvailable()) {
      await cache.set(redisPageKey, paginatedProducts, 300); // 5 min TTL
      console.log(
        `Cached approved products page skip=${skipNum}, limit=${limitNum}`
      );
    }
  }

  return paginatedProducts;
}

async function createProductService(data) {
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
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:approved:category:${normalizeCategory}:limit:${limitNum}:skip:${skipNum}`;

  let paginated = await cache.get(cacheKey);
  if (paginated) {
    console.log("Redis cache hit:", cacheKey);
    return paginated;
  }

  // Build query for approved products with category filter
  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  const categoryQuery = buildCategoryQuery(normalizeCategory);
  const query = { ...baseQuery, ...categoryQuery };

  paginated = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skipNum)
    .limit(limitNum)
    .lean({ virtuals: true });

  if (cache.isAvailable()) {
    await cache.set(cacheKey, paginated, 3600); // 1 hour TTL
  }

  return paginated;
}

// get product by municipality
async function getProductByMunicipality(municipality, category, limit, skip) {
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const normalizeMunicipality = municipality.toLowerCase().trim();
  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:approved:municipality:${normalizeMunicipality}:${normalizeCategory}:limit:${limitNum}:skip:${skipNum}`;

  let paginated = await cache.get(cacheKey);
  if (paginated) {
    console.log("Redis cache hit:", cacheKey);
    return paginated;
  }

  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  let query = { ...baseQuery };

  if (normalizeMunicipality !== "all") {
    query = { ...query, ...buildMunicipalityQuery(normalizeMunicipality) };
  }

  if (normalizeCategory !== "all") {
    query = { ...query, ...buildCategoryQuery(normalizeCategory) };
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
    await cache.set(cacheKey, paginated, 300); // 5 min TTL
  }

  return paginated;
}

// related products
async function getRelatedProducts(productId, limit = 6) {
  const _id =
    typeof productId === "string"
      ? new mongoose.Types.ObjectId(productId)
      : productId;

  const currentProduct = await Product.findById(_id).lean();
  if (!currentProduct) throw new Error("Product not found");

  const categories = Array.isArray(currentProduct.categories)
    ? currentProduct.categories
    : [];

  if (categories.length === 0) return [];

  // ✅ Find products that share at least ONE category (only approved products)
  const related = await Product.find({
    _id: { $ne: _id },
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
  const terms = query.toLowerCase().trim().split(/\s+/);
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const cacheKey = `products:search:${terms.join(
    "-"
  )}:limit:${limitNum}:skip:${skipNum}`;

  let paginated = await cache.get(cacheKey);
  if (paginated) {
    console.log("Redis cache hit:", cacheKey);
    return paginated;
  }

  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  const searchQuery = buildSearchQuery(terms);
  const queryObj = { ...baseQuery, ...searchQuery };

  paginated = await Product.find(queryObj)
    .sort({ createdAt: -1 })
    .skip(skipNum)
    .limit(limitNum > 0 ? limitNum : 0)
    .lean({ virtuals: true });

  if (cache.isAvailable() && paginated.length > 0) {
    await cache.set(cacheKey, paginated, 600); // 10 min TTL
  }

  return paginated;
}

async function getProductByVendor(vendorId, limit = 15, skip = 0) {
  if (!isValidObjectId(vendorId)) {
    throw createError("Invalid vendor ID", 400);
  }

  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const cacheKey = `product:vendor:${vendorId}:approved:skip:${skipNum}:limit:${limitNum}`;

  let products = await cache.get(cacheKey);
  if (products) {
    console.log("Redis cache hit:", cacheKey);
    return products;
  }

  // Only fetch approved and not disabled products for public view
  const vendorProducts = await Product.find({
    vendorId,
    status: PRODUCT_STATUS.APPROVED,
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
async function getVendorOwnProducts(vendorId, limit = 100, skip = 0) {
  const limitNum = parseInt(limit) || 100;
  const skipNum = parseInt(skip) || 0;
  const cacheKey = `product:vendor:${vendorId}:own:all`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached.map((p) => new Product(p).toJSON());
  }

  // Fetch ALL products for this vendor (no status filter)
  const productsWithVirtuals = await Product.find({
    vendorId,
    isDisabled: { $ne: true },
  }).sort({ createdAt: -1 }).lean({ virtuals: true });

  if (cache.isAvailable()) {
    await cache.set(cacheKey, productsWithVirtuals, 120); // Shorter cache for own products
  }

  return productsWithVirtuals;
}

async function getProductByIdService(id) {
  if (!isValidObjectId(id)) {
    throw createError("Invalid product ID", 400);
  }

  const cacheKey = `products:${id}`;
  let productWithVendorProfile = await cache.get(cacheKey);

  if (productWithVendorProfile) {
    // Validate promotions even on cached data to ensure accuracy
    validateAndCleanPromotions(productWithVendorProfile);
    return productWithVendorProfile;
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
  if (!isValidObjectId(id)) {
    throw createError("Invalid product ID", 400);
  }

  const PRODUCT_BY_ID_KEY = `products:${id}`;
  await cache.delete(PRODUCT_BY_ID_KEY);

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
    { new: true, runValidators: true, context: 'query' }
  );

  if (!updated) {
    throw createError("Product or option not found", 404);
  }

  await invalidateAllProductCaches(productId, updated.vendorId);
  return updated;
}

async function addProductStock(productId, optionId, addition) {
  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }
  if (optionId && !isValidObjectId(optionId)) {
    throw createError("Invalid option ID", 400);
  }

  if (typeof addition !== "number" || Number.isNaN(addition)) {
    throw createError("Addition value must be a number", 400);
  }

  // If optionId is provided, update the stock inside that option atomically
  if (optionId) {
    const updated = await Product.findOneAndUpdate(
      { _id: productId, "option._id": optionId, "option.stock": { $gte: -addition } },
      { $inc: { "option.$.stock": addition } },
      { new: true, runValidators: true, context: 'query' }
    );

    if (!updated) {
      throw createError("Product or option not found or insufficient stock", 404);
    }

    await invalidateAllProductCaches(productId, updated.vendorId);
    return updated;
  }

  // No optionId: update main product stock atomically
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
  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }

  console.log("type", typeof addition);
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
  if (!isValidObjectId(id)) {
    throw createError("Invalid product ID", 400);
  }

  const PRODUCT_BY_ID_KEY = `products:${id}`;

  console.log(`[Product Delete] Starting deletion for product ${id}`);

  // Use transaction for DB operations
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Atomically delete product and return deleted document
    const deletedProduct = await Product.findOneAndDelete({ _id: id }, { session });
    if (!deletedProduct) {
      throw createError("Product not found", 404);
    }

    // Gather image URLs from deleted document
    const imageUrls = [];
    if (deletedProduct.imageUrls && Array.isArray(deletedProduct.imageUrls)) imageUrls.push(...deletedProduct.imageUrls);
    if (deletedProduct.option && Array.isArray(deletedProduct.option)) deletedProduct.option.forEach((v) => { if (v.imageUrl) imageUrls.push(v.imageUrl); });

    const publicIds = imageUrls
      .map((url) => {
        const publicId = extractPublicIdFromUrl(url);
        if (!publicId) {
          console.warn(`
            [Product Delete] Failed to extract public_id from URL: ${url}`
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
        console.log(
          `[Product Delete] Cloudinary deletion result: ${deleteResult.successful}/${deleteResult.total} images deleted successfully`
        );

        if (deleteResult.failed > 0) {
          console.error(
            `[Product Delete] Failed to delete ${deleteResult.failed} images from Cloudinary`
          );
          console.error(
            "[Product Delete] Deletion details:",
            JSON.stringify(deleteResult.details, null, 2)
          );
        }
      } catch (error) {
        console.error(
          `[Product Delete] Exception during Cloudinary deletion:`,
          error
        );
        // Log error but don't fail the operation since DB is already deleted
      }
    } else {
      console.log(`[Product Delete] No Cloudinary images to delete`);
    }

    await cache.delete(PRODUCT_BY_ID_KEY);

    await invalidateAllProductCaches(id, deletedProduct.vendorId);

    console.log(
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

  console.log(`[removeVariantData] Product ${productId} has ${product.option?.length || 0} options`);

  const variantToRemove = product.option.find((opt) => opt._id.toString() === variantId);
  if (!variantToRemove) {
    throw createError("Variant not found", 404);
  }

  // If only one variant existed at read time, attempt an atomic delete of product
  if ((product.option?.length || 0) <= 1) {
    const deleted = await Product.findOneAndDelete({ _id: productId, 'option._id': variantId });

    if (!deleted) {
      // Could be a concurrent modification
      throw createError('Product not found', 404);
    }

    // Gather all image URLs from deleted document
    const imageUrls = [];
    if (deleted.imageUrls && Array.isArray(deleted.imageUrls)) imageUrls.push(...deleted.imageUrls);
    if (deleted.option && Array.isArray(deleted.option)) deleted.option.forEach((v) => { if (v.imageUrl) imageUrls.push(v.imageUrl); });

    const publicIds = imageUrls.map((u) => extractPublicIdFromUrl(u)).filter((id) => id !== null);

    return { deleted: true, publicIdsToCleanup: publicIds, vendorId: deleted.vendorId };
  }

  // Otherwise remove the variant atomically using $pull; then recalc aggregates from the returned doc
  const updated = await Product.findOneAndUpdate(
    { _id: productId, 'option._id': variantId },
    { $pull: { option: { _id: variantId } } },
    { new: true }
  );

  if (!updated) {
    // Variant or product might have been removed concurrently
    throw createError('Variant not found', 404);
  }

  // Find image url of removed variant from earlier read (variantToRemove)
  const removedVariantImageUrl = variantToRemove.imageUrl || null;

  // Recalculate aggregates on updated doc
  updated.stock = (updated.option || []).reduce((sum, o) => sum + (o.stock || 0), 0);
  updated.sold = (updated.option || []).reduce((sum, o) => sum + (o.sold || 0), 0);
  updated.isOption = (updated.option || []).length > 0;

  await updated.save();

  return { deleted: false, product: updated, removedVariantImageUrl, vendorId: updated.vendorId };
}

/**
 * Reassign main image if it referenced the removed variant image URL
 * Returns { modified: boolean }
 */
function reassignMainImageIfNeeded(product, removedVariantImageUrl) {
  if (!product || !removedVariantImageUrl) return { modified: false };

  const usedAsMain = product.imageUrls && product.imageUrls.includes(removedVariantImageUrl);
  if (!usedAsMain) return { modified: false };

  product.imageUrls = product.imageUrls.filter((u) => u !== removedVariantImageUrl);
  ensureMainImage(product);
  return { modified: true };
}

/**
 * Cleanup images from Cloudinary safely using upload.service safeDeleteBatch
 * Returns the raw result from safeDeleteBatch
 */
async function cleanupVariantImages(publicIds) {
  if (!Array.isArray(publicIds) || publicIds.length === 0) return { successful: 0, failed: 0, total: 0 };
  try {
    const uploadService = require('../upload/upload.service.js');
    const result = await uploadService.safeDeleteBatch(publicIds);
    return result;
  } catch (err) {
    console.error('[cleanupVariantImages] Unexpected error:', err);
    return { successful: 0, failed: publicIds.length, total: publicIds.length, failedDetails: publicIds.map(id => ({ publicId: id, reason: 'error', error: err.message })) };
  }
}

/**
 * Public removeVariant - orchestrates the smaller helpers
 */
async function removeVariant(productId, variantId) {
  // 1) Remove data
  const dataResult = await removeVariantData(productId, variantId);

  // If product deleted entirely
  if (dataResult.deleted) {
    // Cleanup images if any
    if (dataResult.publicIdsToCleanup && dataResult.publicIdsToCleanup.length > 0) {
      const cleanupResult = await cleanupVariantImages(dataResult.publicIdsToCleanup);
      console.log(`[removeVariant] cleanup result: ${cleanupResult.successful}/${cleanupResult.total} removed`);
    }

    // Invalidate caches
    await cache.delete(`products:${productId}`);
    await invalidateAllProductCaches(productId, dataResult.vendorId);

    return { deleted: true, message: 'Product deleted since only one variant existed.' };
  }

  // 2) If variant removed from product, perform image cleanup for that variant only
  const publicIds = [];
  if (dataResult.removedVariantImageUrl) {
    const publicId = extractPublicIdFromUrl(dataResult.removedVariantImageUrl);
    if (publicId) publicIds.push(publicId);
  }

  if (publicIds.length > 0) {
    const cleanupResult = await cleanupVariantImages(publicIds);
    console.log(`[removeVariant] variant image cleanup result: ${cleanupResult.successful}/${cleanupResult.total}`);
  }

  // 3) Reassign main image if needed
  const { product, removedVariantImageUrl } = dataResult;
  const reassigned = reassignMainImageIfNeeded(product, removedVariantImageUrl);
  if (reassigned.modified) {
    await product.save();
  }

  // 4) Invalidate caches
  await cache.delete(`products:${productId}`);
  await invalidateAllProductCaches(productId, dataResult.vendorId);

  return { deleted: false, message: 'Variant removed successfully.', product };
}

async function getProductOrThrow(productId) {
  const product = await Product.findById(productId);
  if (!product) {
    const err = new Error("Product not found");
    err.status = 404;
    throw err;
  }
  return product;
}

async function addSingleOption(productId, optionData) {
  if (!isValidObjectId(productId)) {
    throw createError("Invalid product ID", 400);
  }

  // Validate payload
  const errors = validateOptionPayload(optionData);
  if (errors.length) {
    throw createError(errors.join(", "), 400);
  }

  // If a label is provided, ensure uniqueness (case-insensitive)
  if (optionData.label) {
    const labelRegex = new RegExp(`^${optionData.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$$`, "i");
    const conflict = await Product.findOne({ _id: productId, "option.label": { $regex: labelRegex } }).select("_id");
    if (conflict) {
      throw createError("Option with this label already exists for this product", 409);
    }
  }

  const newOption = {
    imageUrl: optionData.imageUrl || "",
    price: optionData.price,
    label: optionData.label || null,
    isHot: !!optionData.isHot,
    stock: optionData.stock ?? 0,
    sold: optionData.sold ?? 0,
  };

  // Use atomic update: push option and increment product aggregates
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

  // Ensure main image if none existed before and option has image
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
