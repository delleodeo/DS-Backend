const express = require("express");
const router = express.Router();
const productController = require("./products.controller");
const { protect, optionalProtect } = require("../../auth/auth.controller.js");
const rateLimiter = require("../../utils/rateLimiter");
const { verifyOwnership, verifyProductAccess } = require("./product-utils/products.auth.js");
const {
  validate,
  validateQuery,
  createProductSchema,
  updateProductSchema,
  addOptionSchema,
  updateOptionSchema,
  stockAdjustmentSchema,
  searchQuerySchema,
  paginationSchema
} = require("./product-utils/productValidation.js");

// ===================== HIGH-RISK ROUTES (Strict Limit: 5 requests/min per user) =====================
router.post(
  "/",
  protect,
  validate(createProductSchema),
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "create-product" }),
  productController.createProductController
);

router.put(
  "/:id",
  protect,
  validate(updateProductSchema),
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "update-product" }),
  verifyOwnership,
  productController.updateProductController
);

router.delete(
  "/:id",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "delete-product" }),
  verifyOwnership,
  productController.deleteProductController
);

router.patch(
  "/:productId/options/:optionId",
  protect,
  validate(updateOptionSchema),
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "update-option" }),
  verifyOwnership,
  productController.updateProductOptionController
);

router.patch(
  "/:productId/:optionId/stock",
  protect,
  validate(stockAdjustmentSchema),
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "adjust-stock" }),
  verifyOwnership,
  productController.adjustProductStockController
);

router.patch(
  "/:productId/stock",
  protect,
  validate(stockAdjustmentSchema),
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "add-stock" }),
  verifyOwnership,
  productController.addProductStockMainController
);

router.post(
  "/:productId/options",
  protect,
  validate(addOptionSchema),
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "add-option" }),
  verifyOwnership,
  productController.addOptionController
);

router.delete(
  "/:productId/options/:variantId",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "delete-variant" }),
  verifyOwnership,
  productController.deleteProductVariantController
);

// ===================== MEDIUM-RISK ROUTES (Vendor Dashboard) =====================
router.get(
  "/vendor/:id/own",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 20, keyPrefix: "vendor-own" }),
  productController.getVendorOwnProductsController
);

// ===================== LOW-RISK / PUBLIC ROUTES (Optional limits per IP) =====================
router.get(
  "/",
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "get-products" }),
  productController.getProductsController
);

router.get(
  "/featured-subscribed",
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "featured-subscribed" }),
  productController.getFeaturedSubscribedProductsController
);

router.get(
  "/category",
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "get-category" }),
  productController.getByCategoryController
);

router.get(
  "/municipality/:municipality",
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "get-municipality" }),
  productController.getByMunicipalityController
);

router.get(
  "/:id/related",
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "get-related" }),
  productController.getRelatedProductsController
);

router.get(
  "/search",
  validateQuery(searchQuerySchema),
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "search-products" }),
  productController.searchProductsController
);

router.get(
  "/vendor/:id",
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "vendor-products" }),
  productController.getVendorProductsController
);

router.get(
  "/:id",
  rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: "get-product" }),
  protect,
  verifyProductAccess,
  productController.getProductByIdController
);

module.exports = router;
