// Admin Dashboard Controller - Comprehensive Admin API Endpoints
const {
  AuditService,
  UserManagementService,
  SellerManagementService,
  ProductManagementService,
  OrderCommissionService,
  AnalyticsService,
  CategoryService,
  BannerService,
  AnnouncementService,
  RefundService,
  SystemSettingsService,
} = require("../services/adminDashboard.service");
const SellerApplicationService = require("../../users/sellerApplication.service");

// ============================================
// DASHBOARD & ANALYTICS
// ============================================
exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await AnalyticsService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Get Dashboard Stats Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTopSellingProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const products = await AnalyticsService.getTopSellingProducts(
      parseInt(limit),
    );
    res.json({ success: true, data: products });
  } catch (error) {
    console.error("Get Top Products Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTopSellers = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const sellers = await AnalyticsService.getTopSellers(parseInt(limit));
    res.json({ success: true, data: sellers });
  } catch (error) {
    console.error("Get Top Sellers Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getSalesChart = async (req, res) => {
  try {
    const { period = "monthly", year } = req.query;
    const data = await AnalyticsService.getSalesChart(
      period,
      parseInt(year) || new Date().getFullYear(),
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("Get Sales Chart Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.exportData = async (req, res) => {
  try {
    const { type } = req.params;
    const filters = req.query;
    const data = await AnalyticsService.exportData(type, filters);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Export Data Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// USER MANAGEMENT
// ============================================
exports.getAllUsers = async (req, res) => {
  try {
    const { page, limit, search, role, status } = req.query;
    const result = await UserManagementService.getAllUsers(
      { search, role, status },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get All Users Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await UserManagementService.getUserById(req.params.userId);
    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Get User Error:", error);
    res.status(404).json({ success: false, error: error.message });
  }
};

exports.restrictUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await UserManagementService.restrictUser(
      req.params.userId,
      req.user.id,
      req.user.email,
      reason,
      req,
    );
    res.json({
      success: true,
      message: "User restricted successfully",
      data: user,
    });
  } catch (error) {
    console.error("Restrict User Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.unrestrictUser = async (req, res) => {
  try {
    const user = await UserManagementService.unrestrictUser(
      req.params.userId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "User unrestricted successfully",
      data: user,
    });
  } catch (error) {
    console.error("Unrestrict User Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "vendor", "admin", "rider"].includes(role)) {
      return res.status(400).json({ success: false, error: "Invalid role" });
    }
    const user = await UserManagementService.changeUserRole(
      req.params.userId,
      role,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "User role updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Change Role Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.flagUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await UserManagementService.flagUser(
      req.params.userId,
      reason,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "User flagged successfully",
      data: user,
    });
  } catch (error) {
    console.error("Flag User Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.unflagUser = async (req, res) => {
  try {
    const user = await UserManagementService.unflagUser(
      req.params.userId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "User unflagged successfully",
      data: user,
    });
  } catch (error) {
    console.error("Unflag User Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.getUserActivityLogs = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await UserManagementService.getUserActivityLogs(
      req.params.userId,
      { page: parseInt(page) || 1, limit: parseInt(limit) || 50 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get User Activity Logs Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// SELLER MANAGEMENT
// ============================================
exports.getAllSellers = async (req, res) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await SellerManagementService.getAllSellers(
      { search, status },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get All Sellers Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getSellerPerformance = async (req, res) => {
  try {
    const data = await SellerManagementService.getSellerPerformance(
      req.params.sellerId,
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("Get Seller Performance Error:", error);
    res.status(404).json({ success: false, error: error.message });
  }
};

// ============================================
// SELLER APPLICATION MANAGEMENT
// ============================================
exports.getPendingApplications = async (req, res) => {
  try {
    const applications =
      await SellerApplicationService.getPendingApplications();
    res.json({ success: true, data: applications });
  } catch (error) {
    console.error("Get Pending Applications Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.reviewSellerApplication = async (req, res) => {
  try {
    const { decision, rejectionReason } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid decision" });
    }

    const result = await SellerApplicationService.reviewApplication(
      req.params.userId,
      req.user.id,
      decision,
      rejectionReason,
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Review Application Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// PRODUCT MANAGEMENT
// ============================================
exports.getAllProducts = async (req, res) => {
  try {
    const { page, limit, search, status, vendorId, category } = req.query;
    const result = await ProductManagementService.getAllProducts(
      { search, status, vendorId, category },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get All Products Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPendingProducts = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await ProductManagementService.getPendingProducts({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get Pending Products Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.approveProduct = async (req, res) => {
  try {
    const product = await ProductManagementService.approveProduct(
      req.params.productId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Product approved successfully",
      data: product,
    });
  } catch (error) {
    console.error("Approve Product Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.rejectProduct = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res
        .status(400)
        .json({ success: false, error: "Rejection reason is required" });
    }
    const product = await ProductManagementService.rejectProduct(
      req.params.productId,
      reason,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({ success: true, message: "Product rejected", data: product });
  } catch (error) {
    console.error("Reject Product Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.disableProduct = async (req, res) => {
  try {
    const { reason } = req.body;
    const product = await ProductManagementService.disableProduct(
      req.params.productId,
      reason,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Product disabled successfully",
      data: product,
    });
  } catch (error) {
    console.error("Disable Product Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.enableProduct = async (req, res) => {
  try {
    const product = await ProductManagementService.enableProduct(
      req.params.productId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Product enabled successfully",
      data: product,
    });
  } catch (error) {
    console.error("Enable Product Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const result = await ProductManagementService.deleteProduct(
      req.params.productId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Product deleted successfully",
      ...result,
    });
  } catch (error) {
    console.error("Delete Product Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await ProductManagementService.updateProduct(
      req.params.productId,
      req.body,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Update Product Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// ORDERS & COMMISSION
// ============================================
exports.getAllOrders = async (req, res) => {
  try {
    const { page, limit, status, vendorId, customerId, startDate, endDate } =
      req.query;
    const result = await OrderCommissionService.getAllOrders(
      { status, vendorId, customerId, startDate, endDate },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get All Orders Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const order = await OrderCommissionService.getOrderDetails(
      req.params.orderId,
    );
    res.json({ success: true, data: order });
  } catch (error) {
    console.error("Get Order Details Error:", error);
    res.status(404).json({ success: false, error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const order = await OrderCommissionService.updateOrderStatus(
      req.params.orderId,
      status,
      req.user.id,
      req.user.email,
      notes,
      req,
    );
    res.json({ success: true, message: "Order status updated", data: order });
  } catch (error) {
    console.error("Update Order Status Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.getCommissionReport = async (req, res) => {
  try {
    const { startDate, endDate, vendorId } = req.query;
    const report = await OrderCommissionService.getCommissionReport({
      startDate,
      endDate,
      vendorId,
    });
    res.json({ success: true, data: report });
  } catch (error) {
    console.error("Get Commission Report Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get pending COD commissions
exports.getPendingCODCommissions = async (req, res) => {
  try {
    const { page, limit, vendorId } = req.query;
    const result = await OrderCommissionService.getPendingCODCommissions(
      { vendorId },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get Pending COD Commissions Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Collect COD commission
exports.collectCODCommission = async (req, res) => {
  try {
    const { notes } = req.body;
    const order = await OrderCommissionService.collectCODCommission(
      req.params.orderId,
      req.user.id,
      req.user.email,
      notes,
      req,
    );
    res.json({
      success: true,
      message: "Commission collected successfully",
      data: order,
    });
  } catch (error) {
    console.error("Collect COD Commission Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// Waive commission
exports.waiveCommission = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res
        .status(400)
        .json({ success: false, error: "Reason is required" });
    }
    const order = await OrderCommissionService.waiveCommission(
      req.params.orderId,
      reason,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({ success: true, message: "Commission waived", data: order });
  } catch (error) {
    console.error("Waive Commission Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get commission summary
exports.getCommissionSummary = async (req, res) => {
  try {
    const summary = await OrderCommissionService.getCommissionSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error("Get Commission Summary Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Reset product to pending
exports.resetProductToPending = async (req, res) => {
  try {
    const product = await ProductManagementService.resetProductToPending(
      req.params.productId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Product reset to pending review",
      data: product,
    });
  } catch (error) {
    console.error("Reset Product Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// CATEGORIES
// ============================================
exports.getAllCategories = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const categories = await CategoryService.getAllCategories(
      includeInactive === "true",
    );
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error("Get Categories Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    // Debug: Log what we receive
    console.log("Create Category - req.body:", req.body);
    console.log("Create Category - req.file:", req.file);

    // Handle file upload - if image was uploaded via multer, get URL from Cloudinary
    const categoryData = { ...req.body };
    if (req.file) {
      categoryData.imageUrl = req.file.path; // Cloudinary URL
      categoryData.imagePublicId = req.file.filename; // Cloudinary public_id
    }

    // Validate required fields
    if (!categoryData.name) {
      return res
        .status(400)
        .json({ success: false, error: "Category name is required" });
    }

    const category = await CategoryService.createCategory(
      categoryData,
      req.user.id,
      req.user.email,
      req,
    );
    res
      .status(201)
      .json({
        success: true,
        message: "Category created successfully",
        data: category,
      });
  } catch (error) {
    console.error("Create Category Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    // Debug: Log what we receive
    console.log("Update Category - req.body:", req.body);
    console.log("Update Category - req.file:", req.file);

    // Handle file upload - if image was uploaded via multer, get URL from Cloudinary
    const updateData = { ...req.body };
    if (req.file) {
      updateData.imageUrl = req.file.path; // Cloudinary URL
      updateData.imagePublicId = req.file.filename; // Cloudinary public_id
    } else if (updateData.existingImageUrl) {
      // Keep existing image URL if no new image uploaded
      updateData.imageUrl = updateData.existingImageUrl;
      delete updateData.existingImageUrl;
    }

    const category = await CategoryService.updateCategory(
      req.params.categoryId,
      updateData,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    console.error("Update Category Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    await CategoryService.deleteCategory(
      req.params.categoryId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    console.error("Delete Category Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.toggleCategoryStatus = async (req, res) => {
  try {
    const category = await CategoryService.toggleCategoryStatus(
      req.params.categoryId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: `Category ${category.isActive ? "enabled" : "disabled"} successfully`,
      data: category,
    });
  } catch (error) {
    console.error("Toggle Category Status Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// BANNERS
// ============================================
exports.getAllBanners = async (req, res) => {
  try {
    const { placement, isActive } = req.query;
    const banners = await BannerService.getAllBanners({
      placement,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
    });
    res.json({ success: true, data: banners });
  } catch (error) {
    console.error("Get Banners Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getActiveBanners = async (req, res) => {
  try {
    const { placement = "hero" } = req.query;
    const banners = await BannerService.getActiveBanners(placement);
    res.json({ success: true, data: banners });
  } catch (error) {
    console.error("Get Active Banners Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createBanner = async (req, res) => {
  try {
    // Debug: Log what we receive
    console.log("Create Banner - req.body:", req.body);
    console.log("Create Banner - req.files:", req.files);
    console.log(
      "Create Banner - Has image field?:",
      req.files && req.files.image,
    );
    console.log(
      "Create Banner - Image array?:",
      req.files && req.files.image && req.files.image[0],
    );

    // Handle file upload - with .fields() we get req.files object
    const bannerData = { ...req.body };

    // Handle background image
    if (req.files && req.files.image && req.files.image[0]) {
      console.log("Create Banner - Image uploaded:", req.files.image[0]);
      bannerData.imageUrl = req.files.image[0].path; // Cloudinary URL
      bannerData.imagePublicId = req.files.image[0].filename; // Cloudinary public_id
      console.log("Create Banner - Set imageUrl:", bannerData.imageUrl);
    } else {
      console.log("Create Banner - NO IMAGE UPLOADED in req.files");
    }

    // Handle product image
    if (req.files && req.files.productImage && req.files.productImage[0]) {
      bannerData.productImageUrl = req.files.productImage[0].path;
      bannerData.productImagePublicId = req.files.productImage[0].filename;
    }

    // Map frontend field names to model field names
    if (bannerData.link) {
      bannerData.linkUrl = bannerData.link;
      delete bannerData.link;
    }
    if (bannerData.position) {
      bannerData.displayOrder = parseInt(bannerData.position);
      delete bannerData.position;
    }

    // Convert hasButton string to boolean
    if (bannerData.hasButton !== undefined) {
      bannerData.hasButton =
        bannerData.hasButton === "true" || bannerData.hasButton === true;
    }

    // Convert isActive string to boolean
    if (bannerData.isActive !== undefined) {
      bannerData.isActive =
        bannerData.isActive === "true" || bannerData.isActive === true;
    }

    // Convert backgroundOnly string to boolean
    if (bannerData.backgroundOnly !== undefined) {
      bannerData.backgroundOnly =
        bannerData.backgroundOnly === "true" ||
        bannerData.backgroundOnly === true;
    }

    // For image background type, require an image (unless editing with existing image)
    if (bannerData.backgroundType === "image" && !bannerData.imageUrl) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Background image is required for image-type banner",
        });
    }

    const banner = await BannerService.createBanner(
      bannerData,
      req.user.id,
      req.user.email,
      req,
    );
    res
      .status(201)
      .json({
        success: true,
        message: "Banner created successfully",
        data: banner,
      });
  } catch (error) {
    console.error("Create Banner Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    // Debug: Log what we receive
    console.log("Update Banner - req.body:", req.body);
    console.log("Update Banner - req.files:", req.files);

    // Handle file upload - with .fields() we get req.files object
    const updateData = { ...req.body };

    // Handle background image
    if (req.files && req.files.image && req.files.image[0]) {
      updateData.imageUrl = req.files.image[0].path;
      updateData.imagePublicId = req.files.image[0].filename;
    } else if (updateData.existingImageUrl) {
      // Keep existing image URL if no new image uploaded
      updateData.imageUrl = updateData.existingImageUrl;
      delete updateData.existingImageUrl;
    }

    // Handle product image
    if (req.files && req.files.productImage && req.files.productImage[0]) {
      updateData.productImageUrl = req.files.productImage[0].path;
      updateData.productImagePublicId = req.files.productImage[0].filename;
    } else if (updateData.existingProductImageUrl) {
      updateData.productImageUrl = updateData.existingProductImageUrl;
      delete updateData.existingProductImageUrl;
    }

    // Map frontend field names to model field names
    if (updateData.link) {
      updateData.linkUrl = updateData.link;
      delete updateData.link;
    }
    if (updateData.position) {
      updateData.displayOrder = parseInt(updateData.position);
      delete updateData.position;
    }

    // Convert hasButton string to boolean
    if (updateData.hasButton !== undefined) {
      updateData.hasButton =
        updateData.hasButton === "true" || updateData.hasButton === true;
    }

    // Convert isActive string to boolean
    if (updateData.isActive !== undefined) {
      updateData.isActive =
        updateData.isActive === "true" || updateData.isActive === true;
    }

    // Convert backgroundOnly string to boolean
    if (updateData.backgroundOnly !== undefined) {
      updateData.backgroundOnly =
        updateData.backgroundOnly === "true" ||
        updateData.backgroundOnly === true;
    }

    const banner = await BannerService.updateBanner(
      req.params.bannerId,
      updateData,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Banner updated successfully",
      data: banner,
    });
  } catch (error) {
    console.error("Update Banner Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    await BannerService.deleteBanner(
      req.params.bannerId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Delete Banner Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.toggleBannerStatus = async (req, res) => {
  try {
    const banner = await BannerService.toggleBannerStatus(
      req.params.bannerId,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: `Banner ${banner.isActive ? "activated" : "deactivated"} successfully`,
      data: banner,
    });
  } catch (error) {
    console.error("Toggle Banner Status Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.recordBannerInteraction = async (req, res) => {
  try {
    const { type } = req.body; // 'click' or 'view'
    if (type === "click") {
      await BannerService.recordBannerClick(req.params.bannerId);
    } else {
      await BannerService.recordBannerView(req.params.bannerId);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Record Banner Interaction Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// ANNOUNCEMENTS
// ============================================
exports.getAllAnnouncements = async (req, res) => {
  try {
    const { page, limit, isActive, type, targetAudience } = req.query;
    const result = await AnnouncementService.getAllAnnouncements(
      {
        isActive: isActive !== undefined ? isActive === "true" : undefined,
        type,
        targetAudience,
      },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get Announcements Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const announcement = await AnnouncementService.createAnnouncement(
      req.body,
      req.user.id,
      req.user.email,
      req,
    );
    res
      .status(201)
      .json({
        success: true,
        message: "Announcement created successfully",
        data: announcement,
      });
  } catch (error) {
    console.error("Create Announcement Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateAnnouncement = async (req, res) => {
  try {
    const announcement = await AnnouncementService.updateAnnouncement(
      req.params.announcementId,
      req.body,
      req.user.id,
    );
    res.json({
      success: true,
      message: "Announcement updated successfully",
      data: announcement,
    });
  } catch (error) {
    console.error("Update Announcement Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    await AnnouncementService.deleteAnnouncement(req.params.announcementId);
    res.json({ success: true, message: "Announcement deleted successfully" });
  } catch (error) {
    console.error("Delete Announcement Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.getActiveAnnouncements = async (req, res) => {
  try {
    const announcements = await AnnouncementService.getActiveAnnouncements(
      req.user.id,
      req.user.role,
    );
    res.json({ success: true, data: announcements });
  } catch (error) {
    console.error("Get Active Announcements Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.markAnnouncementAsRead = async (req, res) => {
  try {
    await AnnouncementService.markAsRead(
      req.params.announcementId,
      req.user.id,
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Mark Announcement Read Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// REFUNDS
// ============================================
exports.getAllRefunds = async (req, res) => {
  try {
    const { page, limit, status, vendorId, customerId } = req.query;
    const result = await RefundService.getAllRefunds(
      { status, vendorId, customerId },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get Refunds Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getRefundDetails = async (req, res) => {
  try {
    const refund = await RefundService.getRefundDetails(req.params.refundId);
    res.json({ success: true, data: refund });
  } catch (error) {
    console.error("Get Refund Details Error:", error);
    res.status(404).json({ success: false, error: error.message });
  }
};

exports.rejectRefund = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res
        .status(400)
        .json({ success: false, error: "Rejection reason is required" });
    }
    const refund = await RefundService.rejectRefund(
      req.params.refundId,
      reason,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({ success: true, message: "Refund rejected", data: refund });
  } catch (error) {
    console.error("Reject Refund Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.processRefund = async (req, res) => {
  try {
    const refund = await RefundService.processRefund(
      req.params.refundId,
      req.user.id,
    );
    res.json({
      success: true,
      message: "Refund processed successfully",
      data: refund,
    });
  } catch (error) {
    console.error("Process Refund Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.approveRefund = async (req, res) => {
  const { refundId } = req.params;
  const { notes = "" } = req.body;

  const adminId = req.user.id;
  const adminEmail = req.user.email;

  const refund = await RefundService.approveRefund(
    refundId,
    adminId,
    adminEmail,
    notes,
    req,
  );

  return res.status(200).json({
    success: true,
    message: "Refund approved",
    data: refund,
  });
};

// ============================================
// SYSTEM SETTINGS
// ============================================
exports.getSettings = async (req, res) => {
  try {
    const settings = await SystemSettingsService.getSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error("Get Settings Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await SystemSettingsService.updateSettings(
      req.body,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Update Settings Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.toggleMaintenanceMode = async (req, res) => {
  try {
    const { enabled, message } = req.body;
    const settings = await SystemSettingsService.toggleMaintenanceMode(
      enabled,
      message,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: `Maintenance mode ${enabled ? "enabled" : "disabled"}`,
      data: settings,
    });
  } catch (error) {
    console.error("Toggle Maintenance Mode Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateCommissionRate = async (req, res) => {
  try {
    const { rate } = req.body;
    const settings = await SystemSettingsService.updateCommissionRate(
      rate,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Commission rate updated",
      data: settings,
    });
  } catch (error) {
    console.error("Update Commission Rate Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================
// AUDIT LOGS
// ============================================
exports.getAuditLogs = async (req, res) => {
  try {
    const { page, limit, adminId, action, targetType, startDate, endDate } =
      req.query;
    const result = await AuditService.getAuditLogs(
      { adminId, action, targetType, startDate, endDate },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 50 },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get Audit Logs Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// MUNICIPALITY MANAGEMENT
// ============================================
const { MunicipalityService } = require("../services/adminDashboard.service");

exports.getAllMunicipalities = async (req, res) => {
  try {
    const municipalities = await MunicipalityService.getAllMunicipalities();
    res.json({ success: true, data: municipalities });
  } catch (error) {
    console.error("Get Municipalities Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getActiveMunicipalities = async (req, res) => {
  try {
    const municipalities = await MunicipalityService.getActiveMunicipalities();
    res.json({ success: true, data: municipalities });
  } catch (error) {
    console.error("Get Active Municipalities Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createMunicipality = async (req, res) => {
  try {
    const municipality = await MunicipalityService.createMunicipality(
      req.body,
      req.user.id,
      req.user.email,
      req,
    );
    res
      .status(201)
      .json({
        success: true,
        message: "Municipality created successfully",
        data: municipality,
      });
  } catch (error) {
    console.error("Create Municipality Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateMunicipality = async (req, res) => {
  try {
    const municipality = await MunicipalityService.updateMunicipality(
      req.params.id,
      req.body,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({
      success: true,
      message: "Municipality updated successfully",
      data: municipality,
    });
  } catch (error) {
    console.error("Update Municipality Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.deleteMunicipality = async (req, res) => {
  try {
    const result = await MunicipalityService.deleteMunicipality(
      req.params.id,
      req.user.id,
      req.user.email,
      req,
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Delete Municipality Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};
