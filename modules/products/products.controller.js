const {
  getPaginatedProducts,
  getFeaturedSubscribedProducts,
  createProductService,
  getProducttruesByCategoryService,
  addProductStock,
  updateProductOptionService,
  getProductsByCategoryService,
  searchProductsService,
  getProductByIdService,
  updateProductService,
  deleteProductService,
  getProductByMunicipality,
  getRelatedProducts,
  removeVariant,
  getProductByVendor,
  getVendorOwnProducts,
  addSingleOption,
  addProductStockMain,
} = require("./products.service.js");
const logger = require("../../utils/logger");

module.exports = {
  // CREATE
  async createProductController(req, res, next) {
    try {
      const { id } = req.user;
      const newProduct = await createProductService({
        vendorId: id,
        ...req.body,
      });
      res.status(201).json(newProduct);
    } catch (error) {
      next(error);
    }
  },
  // READ ALL (with cache + limit)
  async getProductsController(req, res, next) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100); // limit hard-capped at 100
      const skip = Math.max(parseInt(req.query.skip) || 0, 0);

      const products = await getPaginatedProducts(skip);

      res.json(products);
    } catch (error) {
      next(error);
    }
  },

  // GET /products/featured-subscribed
  async getFeaturedSubscribedProductsController(req, res, next) {
    const municipalities = req.query.municipalities;
    const categories = req.query.categories;
    try {
      const products = await getFeaturedSubscribedProducts(municipalities, categories);
      res.json(products);
    } catch (error) {
      next(error);
    }
  },

  // GET /products/:id/related
  async getRelatedProductsController(req, res, next) {
    try {
      const related = await getRelatedProducts(req.params.id);
      res.status(200).json(related);
    } catch (error) {
      next(error);
    }
  },

  async getVendorProductsController(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 0;
      const skip = Math.max(parseInt(req.query.skip) || 0, 0);
      const { id } = req.params;

      const vendorProducts = await getProductByVendor(id, limit, skip);

      res.status(200).json(vendorProducts);
    } catch (error) {
      next(error);
    }
  },

  // GET /products/vendor/:id/own - Get all vendor's own products (including pending/rejected)
  async getVendorOwnProductsController(req, res, next) {
    try {
      const { id } = req.params;

      if (req.user.id !== id) {
        return res.status(403).json({
          message: "Access denied. You can only view your own products.",
        });
      }

      const vendorProducts = await getVendorOwnProducts(id);

      res.status(200).json(vendorProducts);
    } catch (error) {
      next(error);
    }
  },

  // GET /products/category/:category?limit=10&skip=10&fresh=true
  async getByCategoryController(req, res, next) {
    try {
      const { category } = req.query;
      const limit = parseInt(req.query.limit) || 0;
      const skip = parseInt(req.query.skip) || 0;

      const products = await getProductsByCategoryService(
        category,
        limit,
        skip,
      );
      res.json(products);
    } catch (error) {
      next(error);
    }
  },
  // GET /products/category/:municipality?limit=10&skip=10&fresh=true
  async getByMunicipalityController(req, res, next) {
    try {
      const { municipality } = req.params;
      const limit = parseInt(req.query.limit) || 0;
      const skip = parseInt(req.query.skip) || 0;
      const category = req.query.category || "all";

      const products = await getProductByMunicipality(
        municipality,
        category,
        limit,
        skip,
      );
      res.json(products);
    } catch (error) {
      next(error);
    }
  },
  // GET /products/search?query=piaya&limit=10&skip=0&fresh=
  async searchProductsController(req, res, next) {
    try {
      const { q, limit, skip } = req.query;

      if (!q || q.trim() === "") {
        return res.status(400).json({ error: "Search query is required" });
      }

      const products = await searchProductsService(q, limit, skip);
      res.json(products);
    } catch (error) {
      next(error);
    }
  },
  // READ ONE (with cache)2
  async getProductByIdController(req, res, next) {
    const { id } = req.params;
    const visitorId = req.user?.id || req.user?._id || null;

    try {
      const product = await getProductByIdService(id, visitorId);
      if (!product)
        return res.status(404).json({ message: "Product not found!" });

      res.json(product);
    } catch (error) {
      next(error);
    }
  },
  // UPDATE
  async updateProductController(req, res, next) {
    try {
      const { id } = req.params;
      const updatedProduct = await updateProductService(id, req.body);

      if (!updatedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(updatedProduct);
    } catch (error) {
      next(error);
    }
  },

  async updateProductOptionController(req, res, next) {
    const { productId, optionId } = req.params;
    const updateData = req.body;

    try {
      const updated = await updateProductOptionService(
        productId,
        optionId,
        updateData,
      );

      if (!updated) {
        return res.status(404).json({ message: "Product or Option not found" });
      }

      return res.json({
        message: "Option updated successfully",
        product: updated,
      });
    } catch (err) {
      next(err);
    }
  },
  // DELETE
  async deleteProductController(req, res, next) {
    try {
      const { id } = req.params;
      const result = await deleteProductService(id);

      if (!result) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json({ message: "Product deleted" });
    } catch (error) {
      next(error);
    }
  },

  async deleteProductVariantController(req, res, next) {
    const { productId, variantId } = req.params;

    try {
      const updatedProduct = await removeVariant(productId, variantId);

      if (!updatedProduct) {
        return res
          .status(404)
          .json({ message: "Product or variant not found" });
      }

      res.status(200).json({
        message: "Variant deleted successfully",
        product: updatedProduct,
      });
    } catch (error) {
      next(error);
    }
  },

  async addOptionController(req, res, next) {
    try {
      const { productId } = req.params;
      const updatedProduct = await addSingleOption(productId, req.body);
      res.status(201).json({
        message: "Option added successfully",
        product: updatedProduct,
      });
    } catch (err) {
      next(err);
    }
  },

  async adjustProductStockController(req, res, next) {
    try {
      const { productId, optionId: optionIdParam } = req.params;
      const { optionId: optionIdBody, stock, delta } = req.body ?? {};
      const optionId = optionIdParam || optionIdBody;

      const raw = delta ?? stock;
      const stockNum = Number(raw);

      if (!raw && raw !== 0) {
        return res.status(400).json({ error: "Missing stock/delta." });
      }
      if (
        !Number.isFinite(stockNum) ||
        Number.isNaN(stockNum) ||
        stockNum === 0
      ) {
        return res
          .status(400)
          .json({ error: "stock/delta must be non-zero number." });
      }

      const updated = await addProductStock(productId, optionId, stockNum);
      if (!updated) {
        return res.status(404).json({ error: "Product/option not found." });
      }

      res.status(200).json({
        message: "Stock adjusted successfully",
        product: updated,
      });
    } catch (error) {
      logger.error(error);
      next(error);
    }
  },

  async addProductStockMainController(req, res, next) {
    try {
      const { productId } = req.params;
      const { delta, stock } = req.body;

      const raw = delta ?? stock;
      const stockNum = Number(raw);

      if (!productId || raw === undefined || raw === null) {
        return res.status(400).json({ error: "Missing productId or stock." });
      }

      if (!Number.isFinite(stockNum) || Number.isNaN(stockNum)) {
        return res.status(400).json({ error: "stock/delta must be a number." });
      }
      const updated = await addProductStockMain(productId, stockNum);
      if (!updated) {
        return res.status(404).json({ error: "Product not found." });
      }

      res.status(200).json({
        message: "Stock adjusted successfully",
        product: updated,
      });
    } catch (error) {
      next(error);
    }
  },
};
