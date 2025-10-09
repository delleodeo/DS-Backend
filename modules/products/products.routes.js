const express = require("express");
const router = express.Router();
const productController = require("./products.controller");
const { protect } = require("../../auth/auth.controller.js");

router.post("/", protect, productController.createProductController);
router.get("/", productController.getProductsController);
router.get("/category/:category", productController.getByCategoryController);
router.patch(
	"/:productId/options/:optionId",
	productController.updateProductOptionController
);
router.patch(
	"/:productId/:optionId/stock",
	productController.adjustProductStockController
);

router.patch(
	"/:productId/stock",
	productController.addProductStockMainController
);
router.post("/:productId/options", productController.addOptionController);
router.get("/municipality/:municipality", productController.getByMunicipalityController);
router.get("/:id/related", productController.getRelatedProductsController);
router.get("/search", productController.searchProductsController);
router.get("/vendor/:id", productController.getVendorProductsController);
router.get("/:id", productController.getProductByIdController);
router.put("/:id", productController.updateProductController);
router.delete("/:id", productController.deleteProductController);
router.delete(
	"/:productId/options/:variantId",
	productController.deleteProductVariantController
);

module.exports = router;
