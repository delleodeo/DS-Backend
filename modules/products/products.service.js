const redisClient = require("../../config/redis");
const Product = require("./products.model.js");
const Admin = require("../admin/admin.model.js");
const Vendor = require("../vendors/vendors.model.js");
const { validateOptionPayload } = require("../../utils/validateOption.js");
const redisKey = "products:all";
const mongoose = require("mongoose");

async function invalidateAllProductCaches() {
  console.log("Starting full product cache invalidation...");

  await redisClient.del(redisKey);

  console.log(`Deleted key: ${redisKey}`);

  const paginatedKeys = await redisClient.keys("products:skip:*:limit:*");
  if (paginatedKeys.length) {
    await redisClient.del(...paginatedKeys);
    console.log(`Deleted ${paginatedKeys.length} paginated keys`);
  } else {
    console.log(`No paginated keys found`);
  }

  const categoryKeys = await redisClient.keys("products:category:*");
  if (categoryKeys.length) {
    await redisClient.del(...categoryKeys);
    console.log(`Deleted ${categoryKeys.length} category keys`);
  } else {
    console.log(`No category keys found`);
  }

  const searchKeys = await redisClient.keys("products:search:*");
  if (searchKeys.length) {
    await redisClient.del(...searchKeys);
    console.log(`Deleted ${searchKeys.length} search keys`);
  } else {
    console.log(`No search keys found`);
  }

  const municipalityKeys = await redisClient.keys("products:municipality:*");
  if (municipalityKeys.length) {
    await redisClient.del(...municipalityKeys);
    console.log(`Deleted ${municipalityKeys.length} municipality keys`);
  } else {
    console.log(`No municipality keys found`);
  }

  const vendorKeys = await redisClient.keys("product:vendor:*");
  if (vendorKeys.length) {
    await redisClient.del(...vendorKeys);
    console.log(`Deleted ${municipalityKeys.length} municipality keys`);
  } else {
    console.log(`No municipality keys found`);
  }

  console.log("All product-related caches invalidated successfully!");
}

async function getPaginatedProducts(skip, limit) {
  const redisPageKey = `products:skip:${skip}:limit:${limit}`;
  let paginatedProducts;

  const cache = await redisClient.get(redisPageKey);
  if (cache) {
    console.log("Redis cache hit:", redisPageKey);
    paginatedProducts = JSON.parse(cache);
  } else {
    paginatedProducts = await Product.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    await redisClient.setEx(
      redisPageKey,
      300,
      JSON.stringify(paginatedProducts)
    ); // 5 min TTL
    console.log(`Cached products page skip=${skip}, limit=${limit}`);
  }

  return paginatedProducts;
}

async function createProductService(data) {
  const newProduct = new Product(data);
  await newProduct.save();

  await Admin.updateOne({}, { $inc: { totalProducts: 1 } });

  await invalidateAllProductCaches();

  return newProduct;
}

async function getProductsByCategoryService(category, limit, skip) {
  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:category:${normalizeCategory}:limit:${limit}:skip:${skip}`;

  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("Redis cache hit:", cacheKey);
    return JSON.parse(cached);
  }

  let allProducts;
  const allCached = await redisClient.get(redisKey);

  if (allCached) {
    allProducts = JSON.parse(allCached);
    console.log("🗃 Products loaded from Redis: products:all");
  } else {
    allProducts = await Product.find().lean();
    await redisClient.set(redisKey, JSON.stringify(allProducts), { EX: 600 });
    console.log("Re-fetched and cached all products from MongoDB");
  }

  const filtered = allProducts.filter((p) => {
    const text = `${p.name} ${p.description || ""} ${(p.categories || []).join(
      " "
    )}`.toLowerCase();
    return text.includes(normalizeCategory);
  });

  const paginated =
    limit > 0 ? filtered.slice(skip, skip + limit) : filtered.slice(skip);

  await redisClient.setEx(cacheKey, 3600, JSON.stringify(paginated)); // 1 hour TTL

  return paginated;
}

// get product by municipality
async function getProductByMunicipality(municipality, category, limit, skip) {
  const normalizeMunicipality = municipality.toLowerCase().trim();
  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:municipality:${normalizeMunicipality}${category}:limit:${limit}:skip:${skip}`;

  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("Redis cache hit:", cacheKey);
    return JSON.parse(cached);
  }

  let allProducts;
  const allCached = await redisClient.get(redisKey);

  if (allCached) {
    allProducts = JSON.parse(allCached);
    console.log("🗃 Products loaded from Redis: products:all");
  } else {
    allProducts = await Product.find().lean();
    await redisClient.set(redisKey, JSON.stringify(allProducts), { EX: 600 });
    console.log("Re-fetched and cached all products from MongoDB");
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

  await redisClient.set(cacheKey, JSON.stringify(paginated), {
    EX: 300,
  }); // 1 hour TTL

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
  const cacheKey = `product:vendor:${vendorId}:limit:${limitNum}:skip:${skipNum}`;

  const cached = await redisClient.get(cacheKey);

  if (cached) return JSON.parse(cached);

  const vendorProducts = await Product.find({ vendorId });

  const paginated = vendorProducts.slice(skipNum, limitNum);

  redisClient.set(cacheKey, JSON.stringify(paginated), { EX: 300 });

  return paginated;
}

async function getProductByIdService(id) {
  const cacheKey = `products:${id}`;
  const cached = await redisClient.get(cacheKey);

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
  await redisClient.set(cacheKey, JSON.stringify(productWithVendorProfile), {
    EX: 500,
  });

  return productWithVendorProfile;
}

// update
async function updateProductService(id, data) {
  const PRODUCT_BY_ID_KEY = `products:${id}`;
  await redisClient.del(PRODUCT_BY_ID_KEY);
  const updatedProduct = await Product.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).lean();

  if (!updatedProduct) return null;

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

  const deletedProduct = await Product.findByIdAndDelete(id);
  if (!deletedProduct) return null;

  await Admin.updateOne({}, { $inc: { totalProducts: -1 } });

  await redisClient.del(PRODUCT_BY_ID_KEY);

  await invalidateAllProductCaches();

  return true;
}

async function removeVariant(productId, variantId) {
  try {
    const product = await Product.findById(productId);
    if (!product) return null;

    if (product.option.length <= 1) {
      await Product.findByIdAndDelete(productId);
      await redisClient.del(`products:${productId}`);
      await invalidateAllProductCaches();
      return {
        deleted: true,
        message: "Product deleted since only one variant existed.",
      };
    }

    const initialLength = product.option.length;

    product.option = product.option.filter(
      (opt) => opt._id.toString() !== variantId
    );

    if (product.option.length === initialLength) {
      // No variant was removed (variantId not found)
      return null;
    }

    await product.save();
    await redisClient.del(`products:${productId}`);
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
};
