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
const { deleteBatchFromCloudinary, extractPublicIdFromUrl } = require("../upload/upload.service.js");
const redisKey = "products:all";
const mongoose = require("mongoose");

async function invalidateAllProductCaches() {
  console.log("Starting full product cache invalidation...");
  if (!redisClient || !redisClient.isOpen) {
    console.log("Skip cache invalidation: Redis not available");
    return;
  }

  await redisClient.del(redisKey).catch(() => {});

  console.log(`Deleted key: ${redisKey}`);

  const paginatedKeys = await redisClient.keys("products:skip:*:limit:*").catch(() => []);
  if (paginatedKeys.length) {
    await redisClient.del(...paginatedKeys).catch(() => {});
    console.log(`Deleted ${paginatedKeys.length} paginated keys`);
  } else {
    console.log(`No paginated keys found`);
  }

  const categoryKeys = await redisClient.keys("products:category:*").catch(() => []);
  if (categoryKeys.length) {
    await redisClient.del(...categoryKeys).catch(() => {});
    console.log(`Deleted ${categoryKeys.length} category keys`);
  } else {
    console.log(`No category keys found`);
  }

  const searchKeys = await redisClient.keys("products:search:*").catch(() => []);
  if (searchKeys.length) {
    await redisClient.del(...searchKeys).catch(() => {});
    console.log(`Deleted ${searchKeys.length} search keys`);
  } else {
    console.log(`No search keys found`);
  }

  const municipalityKeys = await redisClient.keys("products:municipality:*").catch(() => []);
  if (municipalityKeys.length) {
    await redisClient.del(...municipalityKeys).catch(() => {});
    console.log(`Deleted ${municipalityKeys.length} municipality keys`);
  } else {
    console.log(`No municipality keys found`);
  }

  const vendorKeys = await redisClient.keys("product:vendor:*").catch(() => []);
  if (vendorKeys.length) {
    await redisClient.del(...vendorKeys).catch(() => {});
    console.log(`Deleted ${municipalityKeys.length} municipality keys`);
  } else {
    console.log(`No municipality keys found`);
  }

  console.log("All product-related caches invalidated successfully!");
}

async function getPaginatedProducts(skip, limit) {
  const redisPageKey = `products:skip:${skip}:limit:${limit}`;
  let paginatedProducts;

  const cache = redisClient && redisClient.isOpen ? await redisClient.get(redisPageKey).catch(() => null) : null;
  if (cache) {
    console.log("Redis cache hit:", redisPageKey);
    paginatedProducts = JSON.parse(cache);
  } else {
    paginatedProducts = await Product.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    if (redisClient && redisClient.isOpen) {
      await redisClient
        .setEx(redisPageKey, 300, JSON.stringify(paginatedProducts))
        .catch(() => {}); // 5 min TTL
      console.log(`Cached products page skip=${skip}, limit=${limit}`);
    }
  }

  return paginatedProducts;
}

async function createProductService(data) {
  const newProduct = new Product(data);
  
  // Ensure product has at least one main image
  ensureMainImage(newProduct);
  
  await newProduct.save();

  await Admin.updateOne({}, { $inc: { totalProducts: 1 } });

  await invalidateAllProductCaches();

  return newProduct;
}

async function getProductsByCategoryService(category, limit, skip) {
  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:category:${normalizeCategory}:limit:${limit}:skip:${skip}`;

  const cached = redisClient && redisClient.isOpen ? await redisClient.get(cacheKey).catch(() => null) : null;
  if (cached) {
    console.log("Redis cache hit:", cacheKey);
    return JSON.parse(cached);
  }

  let allProducts;
  const allCached = redisClient && redisClient.isOpen ? await redisClient.get(redisKey).catch(() => null) : null;

  if (allCached) {
    allProducts = JSON.parse(allCached);
    console.log("🗃 Products loaded from Redis: products:all");
  } else {
    allProducts = await Product.find().lean();
    if (redisClient && redisClient.isOpen) {
      await redisClient
        .set(redisKey, JSON.stringify(allProducts), { EX: 600 })
        .catch(() => {});
      console.log("Re-fetched and cached all products from MongoDB");
    }
  }

  const filtered = allProducts.filter((p) => {
    const text = `${p.name} ${p.description || ""} ${(p.categories || []).join(
      " "
    )}`.toLowerCase();
    return text.includes(normalizeCategory);
  });

  const paginated =
    limit > 0 ? filtered.slice(skip, skip + limit) : filtered.slice(skip);

  if (redisClient && redisClient.isOpen) {
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(paginated)).catch(() => {}); // 1 hour TTL
  }

  return paginated;
}

// get product by municipality
async function getProductByMunicipality(municipality, category, limit, skip) {
  const normalizeMunicipality = municipality.toLowerCase().trim();
  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:municipality:${normalizeMunicipality}${category}:limit:${limit}:skip:${skip}`;

  const cached = redisClient && redisClient.isOpen ? await redisClient.get(cacheKey).catch(() => null) : null;
  if (cached) {
    console.log("Redis cache hit:", cacheKey);
    return JSON.parse(cached);
  }

  let allProducts;
  const allCached = redisClient && redisClient.isOpen ? await redisClient.get(redisKey).catch(() => null) : null;

  if (allCached) {
    allProducts = JSON.parse(allCached);
    console.log("🗃 Products loaded from Redis: products:all");
  } else {
    allProducts = await Product.find().lean();
    if (redisClient && redisClient.isOpen) {
      await redisClient
        .set(redisKey, JSON.stringify(allProducts), { EX: 600 })
        .catch(() => {});
      console.log("Re-fetched and cached all products from MongoDB");
    }
  }

  let filtered;

  if (normalizeMunicipality === "all" && normalizeCategory !== "all") {
    filtered = allProducts.filter((p) => {
      const text = `${(p.categories || []).join(" ")}`.toLowerCase();
      return text.includes(normalizeCategory);
    });
    return filtered;
  }

  if (normalizeMunicipality === "all") {
    const paginated =
      limit > 0
        ? allProducts.slice(skip, skip + limit)
        : allProducts.slice(skip);
    return paginated;
  }

  if (normalizeCategory !== "all") {
    filtered = allProducts.filter((p) => {
      const text = `${(p.categories || []).join(" ")}`.toLowerCase();
      return (
        p.municipality.toLowerCase() === normalizeMunicipality &&
        text.includes(normalizeCategory)
      );
    });
  } else {
    filtered = allProducts.filter((p) => {
      return p.municipality.toLowerCase() === normalizeMunicipality;
    });
  }

  const paginated =
    limit > 0 ? filtered.slice(skip, skip + limit) : filtered.slice(skip);

  if (redisClient && redisClient.isOpen) {
    await redisClient
      .set(cacheKey, JSON.stringify(paginated), { EX: 300 })
      .catch(() => {}); // 1 hour TTL
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

  // ✅ Find products that share at least ONE category
  const related = await Product.find({
    _id: { $ne: _id },
    stock: { $gt: 0 },
    categories: { $in: categories }, // <-- Matches if ANY category overlaps
  })
    .sort({ updatedAt: -1 }) // newest first
    .limit(limit)
    .lean();

  return related;
}

async function searchProductsService(query, limit = 0, skip = 0) {
  const terms = query.toLowerCase().trim().split(/\s+/);
  const limitNum = parseInt(limit) || 0;
  const skipNum = parseInt(skip) || 0;
  const cacheKey = `products:search:${terms.join(
    "-"
  )}:limit:${limitNum}:skip:${skipNum}`;

  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("Redis cache hit:", cacheKey);
    return JSON.parse(cached);
  }

  let allProducts;
  const allCached = await redisClient.get(redisKey);

  if (allCached) {
    allProducts = JSON.parse(allCached);
    console.log("📦 Products loaded from Redis");
  } else {
    allProducts = await Product.find().lean();
    await redisClient.set(redisKey, JSON.stringify(allProducts), { EX: 600 });
    console.log("Products reloaded from MongoDB");
  }

  const results = allProducts.filter((product) => {
    const text = `${product.name} ${product.description || ""} ${(
      product.categories || []
    ).join(" ")}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });

  const paginated =
    limitNum > 0
      ? results.slice(skipNum, skipNum + limitNum)
      : results.slice(skipNum);

  if (paginated.length > 0) {
    await redisClient.set(cacheKey, JSON.stringify(paginated), { EX: 600 }); 
  }

  return paginated;
}
 
async function getProductByVendor(vendorId, limit = 15, skip = 0) {
  const limitNum = parseInt(limit);
  const skipNum = parseInt(skip) || 0;
  const cacheKey = `product:vendor:${vendorId}`;

  const cached = redisClient && redisClient.isOpen ? await redisClient.get(cacheKey).catch(() => null) : null;

  if (cached) return JSON.parse(cached);

  const vendorProducts = await Product.find({ vendorId });

  // const paginated = vendorProducts.slice(skipNum, limitNum);

  if (redisClient && redisClient.isOpen) {
    redisClient.set(cacheKey, JSON.stringify(vendorProducts), { EX: 300 }).catch(() => {});
  }

  return vendorProducts;
}

async function getProductByIdService(id) {
  const cacheKey = `products:${id}`;
  const cached = redisClient && redisClient.isOpen ? await redisClient.get(cacheKey).catch(() => null) : null;

  if (cached) return JSON.parse(cached);

  const product = await Product.findById(id).lean();
  if (!product) return null; // Check first

  const { vendorId } = product;
  const vendorProfile = await Vendor.findOne({ userId: vendorId })
    .select("imageUrl storeName")
    .lean();

  const productWithVendorProfile = {
    ...product,
    storeName: vendorProfile?.storeName || null,
    vendorAvatar: vendorProfile?.imageUrl || null,
  };

  // Cache for 10 minutes
  if (redisClient && redisClient.isOpen) {
    await redisClient
      .set(cacheKey, JSON.stringify(productWithVendorProfile), { EX: 500 })
      .catch(() => {});
  }

  return productWithVendorProfile;
}

// update
/**
 * Ensure product has at least one main image.
 * If imageUrls is empty but product has options with images,
 * use the first option's image as the main image.
 * @param {Object} product - Product document
 * @returns {boolean} - Whether the product was modified
 */
function ensureMainImage(product) {
  // Check if product has no main images
  if (!product.imageUrls || product.imageUrls.length === 0) {
    // Check if product has options with images
    if (product.option && product.option.length > 0) {
      // Find first option with an image
      const optionWithImage = product.option.find(opt => opt.imageUrl);
      
      if (optionWithImage) {
        console.log(`[Product Image Auto-Replace] No main images found for product ${product._id}, using option image: ${optionWithImage.imageUrl}`);
        product.imageUrls = [optionWithImage.imageUrl];
        return true;
      }
    }
  }
  return false;
}

async function updateProductService(id, data) {
  const PRODUCT_BY_ID_KEY = `products:${id}`;
  if (redisClient && redisClient.isOpen) {
    await redisClient.del(PRODUCT_BY_ID_KEY).catch(() => {});
  }
  
  let updatedProduct = await Product.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!updatedProduct) return null;

  // Check if we need to auto-replace main image with option image
  const wasModified = ensureMainImage(updatedProduct);
  
  if (wasModified) {
    // Save the changes if main image was auto-replaced
    await updatedProduct.save();
  }
  
  // Convert to plain object
  updatedProduct = updatedProduct.toObject();

  await invalidateAllProductCaches();

  return updatedProduct;
}

async function updateProductOptionService(productId, optionId, updateData) {
  // Build dynamic $set object using dot notation for embedded document
  const updateFields = {};
  for (const key in updateData) {
    updateFields[`option.$.${key}`] = updateData[key];
  }

  const updated = await Product.findOneAndUpdate(
    { _id: productId, "option._id": optionId },
    { $set: updateFields },
    { new: true }
  );

  await invalidateAllProductCaches();
  return updated;
}

async function addProductStock(productId, optionId, addition) {
  console.log("type", typeof addition);
  if (!addition || typeof addition !== "number") {
    throw new Error("Addition value must be a number.");
  }

  let updated;
  if (optionId) {
    // Update stock inside an option of the product
    updated = await Product.findOneAndUpdate(
      { _id: productId, "option._id": optionId },
      { $inc: { "option.$.stock": addition } }, // increment the stock of the matched option
      { new: true }
    );
  }
  //   else {
  //     // Update the main product stock
  //     updated = await Product.findOneAndUpdate(
  //       { _id: productId },
  //       { $inc: { stock: addition } },  // increment the stock of the product
  //       { new: true }
  //     );
  //   }

  await invalidateAllProductCaches();
  return updated;
}

async function addProductStockMain(productId, addition) {
  console.log("type", typeof addition);
  if (!addition || typeof addition !== "number") {
    throw new Error("Addition value must be a number.");
  }

  let updated = await Product.findOneAndUpdate(
    { _id: productId },
    { $inc: { stock: addition } },
    { new: true }
  );

  await invalidateAllProductCaches();
  return updated;
}

async function deleteProductService(id) {
  const PRODUCT_BY_ID_KEY = `products:${id}`;

  // First, fetch the product to get image URLs
  const product = await Product.findById(id);
  if (!product) return null;

  console.log(`[Product Delete] Starting deletion for product ${id}`);

  // Collect all image URLs from product and variants
  const imageUrls = [];
  
  // Add main product images
  if (product.imageUrls && Array.isArray(product.imageUrls)) {
    console.log(`[Product Delete] Found ${product.imageUrls.length} main product images`);
    imageUrls.push(...product.imageUrls);
  }
  
  // Add variant images
  if (product.option && Array.isArray(product.option)) {
    const variantImagesCount = product.option.filter(v => v.imageUrl).length;
    console.log(`[Product Delete] Found ${variantImagesCount} variant images from ${product.option.length} variants`);
    product.option.forEach(variant => {
      if (variant.imageUrl) {
        imageUrls.push(variant.imageUrl);
      }
    });
  }

  console.log(`[Product Delete] Total image URLs to process: ${imageUrls.length}`);
  if (imageUrls.length > 0) {
    console.log(`[Product Delete] Image URLs:`, imageUrls);
  }

  // Extract public IDs from Cloudinary URLs
  const publicIds = imageUrls
    .map(url => {
      const publicId = extractPublicIdFromUrl(url);
      if (!publicId) {
        console.warn(`[Product Delete] Failed to extract public_id from URL: ${url}`);
      }
      return publicId;
    })
    .filter(id => id !== null);

  console.log(`[Product Delete] Extracted ${publicIds.length} public IDs:`, publicIds);

  // Delete images from Cloudinary
  if (publicIds.length > 0) {
    try {
      const deleteResult = await deleteBatchFromCloudinary(publicIds);
      console.log(`[Product Delete] Cloudinary deletion result: ${deleteResult.successful}/${deleteResult.total} images deleted successfully`);
      
      if (deleteResult.failed > 0) {
        console.error(`[Product Delete] Failed to delete ${deleteResult.failed} images from Cloudinary`);
        console.error('[Product Delete] Deletion details:', JSON.stringify(deleteResult.details, null, 2));
      }
    } catch (error) {
      console.error(`[Product Delete] Exception during Cloudinary deletion:`, error);
      // Continue with product deletion even if Cloudinary deletion fails
    }
  } else {
    console.log(`[Product Delete] No Cloudinary images to delete`);
  }

  // Delete product from database
  const deletedProduct = await Product.findByIdAndDelete(id);
  if (!deletedProduct) return null;

  await Admin.updateOne({}, { $inc: { totalProducts: -1 } });

  if (redisClient && redisClient.isOpen) {
    await redisClient.del(PRODUCT_BY_ID_KEY).catch(() => {});
  }

  await invalidateAllProductCaches();

  console.log(`[Product Delete] Successfully deleted product ${id} from database`);

  return true;
}

async function removeVariant(productId, variantId) {
  try {
    const product = await Product.findById(productId);
    if (!product) return null;

    // Find the variant to be removed to get its image URL
    const variantToRemove = product.option.find(
      (opt) => opt._id.toString() === variantId
    );

    if (product.option.length <= 1) {
      // If only one variant exists, delete the entire product
      // This will trigger deleteProductService logic that handles Cloudinary cleanup
      await Product.findByIdAndDelete(productId);
      if (redisClient && redisClient.isOpen) {
        await redisClient.del(`products:${productId}`).catch(() => {});
      }
      await invalidateAllProductCaches();
      
      // Delete all product images from Cloudinary
      const imageUrls = [];
      if (product.imageUrls && Array.isArray(product.imageUrls)) {
        imageUrls.push(...product.imageUrls);
      }
      if (product.option && Array.isArray(product.option)) {
        product.option.forEach(variant => {
          if (variant.imageUrl) {
            imageUrls.push(variant.imageUrl);
          }
        });
      }
      
      const publicIds = imageUrls
        .map(url => extractPublicIdFromUrl(url))
        .filter(id => id !== null);
      
      if (publicIds.length > 0) {
        try {
          const deleteResult = await deleteBatchFromCloudinary(publicIds);
          console.log(`[Variant Delete] Deleted ${deleteResult.successful}/${deleteResult.total} images from Cloudinary for product ${productId}`);
        } catch (error) {
          console.error(`[Variant Delete] Failed to delete images from Cloudinary:`, error);
        }
      }
      
      return {
        deleted: true,
        message: "Product deleted since only one variant existed.",
      };
    }

    const initialLength = product.option.length;

    // Delete variant's image from Cloudinary before removing from database
    if (variantToRemove && variantToRemove.imageUrl) {
      const publicId = extractPublicIdFromUrl(variantToRemove.imageUrl);
      if (publicId) {
        try {
          const { deleteBatchFromCloudinary } = require("../upload/upload.service.js");
          const deleteResult = await deleteBatchFromCloudinary([publicId]);
          console.log(`[Variant Delete] Deleted variant image from Cloudinary: ${publicId}`);
        } catch (error) {
          console.error(`[Variant Delete] Failed to delete variant image from Cloudinary:`, error);
          // Continue with variant removal even if Cloudinary deletion fails
        }
      }
    }

    product.option = product.option.filter(
      (opt) => opt._id.toString() !== variantId
    );

    if (product.option.length === initialLength) {
      // No variant was removed (variantId not found)
      return null;
    }

    // Check if the deleted variant's image was used as main image
    // If so, replace it with another option's image
    if (variantToRemove && variantToRemove.imageUrl) {
      const variantImageUsedAsMain = product.imageUrls && 
        product.imageUrls.includes(variantToRemove.imageUrl);
      
      if (variantImageUsedAsMain) {
        console.log(`[Variant Delete] Removed variant image was used as main image, replacing...`);
        // Remove the deleted variant's image from main images
        product.imageUrls = product.imageUrls.filter(
          url => url !== variantToRemove.imageUrl
        );
      }
    }

    // Ensure product has at least one main image
    ensureMainImage(product);

    await product.save();
    if (redisClient && redisClient.isOpen) {
      await redisClient.del(`products:${productId}`).catch(() => {});
    }
    await invalidateAllProductCaches();

    return {
      deleted: false,
      message: "Variant removed successfully.",
      product,
    };
  } catch (error) {
    console.error("Error removing variant:", error);
    throw new Error("Failed to remove variant.");
  }
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
  const product = await getProductOrThrow(productId);

  // Validate
  const errors = validateOptionPayload(optionData);
  if (errors.length) {
    const err = new Error(errors.join(", "));
    err.status = 400;
    throw err;
  }

  if (optionData.label) {
    const exists = product.option.some(
      (o) => (o.label || "").toLowerCase() === optionData.label.toLowerCase()
    );
    if (exists) {
      const err = new Error(
        "Option with this label already exists for this product"
      );
      err.status = 409;
      throw err;
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

  product.option.push(newOption);

  product.stock = product.option.reduce((sum, o) => sum + (o.stock || 0), 0);
  product.sold = product.option.reduce((sum, o) => sum + (o.sold || 0), 0);
  product.isOption = product.option.length > 0;

  // Ensure product has at least one main image
  ensureMainImage(product);

  await product.save();
  await invalidateAllProductCaches();
  return product;
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
  updateProductOptionService,
  removeVariant,
  addProductStock,
  addProductStockMain,
  ensureMainImage,
};
