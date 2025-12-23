const express = require("express");
const router = express.Router();
const productController = require("./products.controller");
const { protect } = require("../../auth/auth.controller.js");
const rateLimiter = require("../../utils/rateLimiter");

// ===================== HIGH-RISK ROUTES (Strict Limit: 5 requests/min per user) =====================
router.post(
  "/",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "create-product" }),
  productController.createProductController
);

router.put(
  "/:id",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "update-product" }),
  productController.updateProductController
);

router.delete(
  "/:id",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "delete-product" }),
  productController.deleteProductController
);

router.patch(
  "/:productId/options/:optionId",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "update-option" }),
  productController.updateProductOptionController
);

router.patch(
  "/:productId/:optionId/stock",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "adjust-stock" }),
  productController.adjustProductStockController
);

router.patch(
  "/:productId/stock",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "add-stock" }),
  productController.addProductStockMainController
);

router.post(
  "/:productId/options",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "add-option" }),
  productController.addOptionController
);

router.delete(
  "/:productId/options/:variantId",
  protect,
  rateLimiter({ windowSec: 60, maxRequests: 5, keyPrefix: "delete-variant" }),
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
  "/category/:category",
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
  productController.getProductByIdController
);

module.exports = router;
