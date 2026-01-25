require("dotenv").config();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const memoryStorage = multer.memoryStorage();

function uploadBufferToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
}

const uploadDocuments = multer({
  storage: memoryStorage,
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPG, WEBP images and PDF files are allowed for seller documents"), false);
  },
});

const uploadTemp = multer({
  storage: memoryStorage,
  limits: { files: 10, fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
});

const uploadPermanent = multer({
  storage: memoryStorage,
  limits: { files: 10, fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
});

async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return { success: result.result === "ok", result };
  } catch (error) {
    console.error("[Cloudinary Delete Error]", error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

async function deleteBatchFromCloudinary(publicIds) {
  try {
    console.log(`[Cloudinary Batch Delete] Attempting to delete ${publicIds.length} images:`, publicIds);

    const results = await Promise.allSettled(
      publicIds.map((id) => {
        console.log(`[Cloudinary Delete] Deleting image with public_id: ${id}`);
        return cloudinary.uploader.destroy(id);
      })
    );

    const successful = [];
    const failed = [];

    results.forEach((result, index) => {
      const publicId = publicIds[index];
      if (result.status === "fulfilled") {
        if (result.value.result === "ok") {
          successful.push(publicId);
          console.log(`[Cloudinary Delete] Successfully deleted: ${publicId}`);
        } else if (result.value.result === "not found") {
          console.warn(`[Cloudinary Delete] Image not found: ${publicId}`);
          failed.push({ publicId, reason: "not found", detail: result.value });
        } else {
          console.warn(`[Cloudinary Delete] Unexpected result for ${publicId}:`, result.value);
          failed.push({ publicId, reason: result.value.result, detail: result.value });
        }
      } else {
        console.error(`[Cloudinary Delete] Failed to delete ${publicId}:`, result.reason);
        failed.push({ publicId, reason: "error", error: result.reason });
      }
    });

    return {
      successful: successful.length,
      failed: failed.length,
      total: results.length,
      successfulIds: successful,
      failedDetails: failed,
      details: results,
    };
  } catch (error) {
    console.error("[Cloudinary Batch Delete Error]", error);
    throw new Error(`Failed to delete images: ${error.message}`);
  }
}

async function safeDeleteBatch(publicIds) {
  try {
    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return { successful: 0, failed: 0, total: 0, successfulIds: [], failedDetails: [] };
    }

    const result = await deleteBatchFromCloudinary(publicIds).catch((err) => {
      console.error("[Safe Cloudinary Delete] Underlying delete error:", err.message);
      return {
        successful: 0,
        failed: publicIds.length,
        total: publicIds.length,
        successfulIds: [],
        failedDetails: publicIds.map((id) => ({ publicId: id, reason: "error", error: err.message })),
      };
    });

    return result;
  } catch (err) {
    console.error("[Safe Cloudinary Delete] Unexpected error:", err);
    return {
      successful: 0,
      failed: publicIds.length || 0,
      total: publicIds.length || 0,
      successfulIds: [],
      failedDetails: (publicIds || []).map((id) => ({ publicId: id, reason: "error", error: err.message })),
    };
  }
}

function makeUploadHandler(type = "temp") {
  return async function (req, res, next) {
    try {
      const sessionId = req.headers["x-session-id"] || `session_${Date.now()}`;

      const buildOptions = (file) => {
        const isPdf = file.mimetype === "application/pdf";
        const isImage = file.mimetype.startsWith("image/");
        const timestamp = Date.now();
        const opts = {};

        if (type === "temp") {
          opts.folder = "DoroShop-Images/temp";
          if (isImage) {
            opts.format = "webp";
            opts.transformation = [
              { width: 1200, height: 1200, crop: "limit", quality: "auto:good" },
            ];
          }
          opts.tags = ["temp", sessionId];
          opts.context = `temp=true|session=${sessionId}|created=${timestamp}`;
          return opts;
        }

        if (type === "permanent") {
          opts.folder = "DoroShop-Images/products";
          if (isImage) {
            opts.format = "webp";
            opts.transformation = [
              { width: 1200, height: 1200, crop: "limit", quality: "auto:good" },
            ];
          }
          opts.tags = ["permanent", "product"];
          opts.context = "temp=false";
          return opts;
        }

        if (type === "document") {
          const userId = req.user?.id || req.user?._id || "anon";
          opts.folder = `DoroShop-Documents/seller-applications/${userId}`;
          opts.tags = ["seller-application", userId ? `user-${userId}` : "temp"];
          opts.context = `temp=false|user=${userId}|type=seller-document|created=${timestamp}`;
          opts.public_id = `${file.fieldname}_${timestamp}`;

          if (isPdf) {
            opts.resource_type = "raw";
            return opts;
          }

          if (isImage) {
            opts.format = "webp";
            opts.transformation = [
              { width: 1200, height: 1200, crop: "limit", quality: "auto:good" },
            ];
          }
          return opts;
        }

        return opts;
      };

      const uploadOne = async (file) => {
        const uploader =
          module.exports && module.exports.uploadBufferToCloudinary
            ? module.exports.uploadBufferToCloudinary
            : uploadBufferToCloudinary;

        const options = buildOptions(file);
        const result = await uploader(file.buffer, options);

        file.path = result.secure_url || result.url;
        file.filename = result.public_id;
        file.width = result.width;
        file.height = result.height;
        file.format = result.format;
        file.bytes = result.bytes || file.size;

        return file;
      };

      if (req.file && req.file.buffer) {
        await uploadOne(req.file);
      }

      if (req.files && Array.isArray(req.files)) {
        for (let i = 0; i < req.files.length; i++) {
          if (req.files[i] && req.files[i].buffer) {
            await uploadOne(req.files[i]);
          }
        }
      }

      if (req.files && typeof req.files === "object" && !Array.isArray(req.files)) {
        for (const key of Object.keys(req.files)) {
          for (let i = 0; i < req.files[key].length; i++) {
            const f = req.files[key][i];
            if (f && f.buffer) await uploadOne(f);
          }
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

const tempUploadHandler = makeUploadHandler("temp");
const permanentUploadHandler = makeUploadHandler("permanent");
const documentUploadHandler = makeUploadHandler("document");
const profileUploadHandler = makeUploadHandler("profile");

// Profile image upload multer configuration
const uploadProfileImage = multer({
  storage: memoryStorage,
  limits: { files: 1, fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
});

// Extended makeUploadHandler to support profile uploads
function makeProfileUploadHandler() {
  return async function (req, res, next) {
    try {
      const userId = req.user?.id || req.user?._id || "anon";
      const timestamp = Date.now();

      const buildProfileOptions = () => ({
        folder: "DoroShop-Images/profiles",
        format: "webp",
        transformation: [
          { width: 400, height: 400, crop: "fill", gravity: "face", quality: "auto:good" },
        ],
        tags: ["profile", `user-${userId}`],
        context: `temp=false|user=${userId}|type=profile|created=${timestamp}`,
        public_id: `profile_${userId}_${timestamp}`,
      });

      const uploadOne = async (file) => {
        const options = buildProfileOptions();
        const result = await uploadBufferToCloudinary(file.buffer, options);

        file.path = result.secure_url || result.url;
        file.filename = result.public_id;
        file.width = result.width;
        file.height = result.height;
        file.format = result.format;
        file.bytes = result.bytes || file.size;

        return file;
      };

      if (req.file && req.file.buffer) {
        await uploadOne(req.file);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

async function markAsPermanent(publicId) {
  try {
    const result = await cloudinary.uploader.explicit(publicId, {
      type: "upload",
      tags: ["permanent", "product"],
      context: "temp=false",
    });
    return { success: true, result };
  } catch (error) {
    console.error("[Cloudinary Update Error]", error);
    throw new Error(`Failed to mark image as permanent: ${error.message}`);
  }
}

async function cleanupOldTempImages(hours = 24) {
  try {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    const result = await cloudinary.api.resources_by_tag("temp", {
      type: "upload",
      max_results: 500,
      context: true,
    });

    const oldImages = result.resources.filter((resource) => {
      if (!resource.context?.custom?.created) return false;
      const created = parseInt(resource.context.custom.created, 10);
      return Number.isFinite(created) && created < cutoffTime;
    });

    if (oldImages.length === 0) {
      return { deleted: 0, message: "No old temporary images found" };
    }

    const publicIds = oldImages.map((img) => img.public_id);
    const deleteResult = await deleteBatchFromCloudinary(publicIds);

    return {
      deleted: deleteResult.successful,
      failed: deleteResult.failed,
      message: `Cleaned up ${deleteResult.successful} old temporary images`,
    };
  } catch (error) {
    console.error("[Cleanup Error]", error);
    throw new Error(`Failed to cleanup temp images: ${error.message}`);
  }
}

function extractPublicIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;

  try {
    const uploadMatch = url.match(/\/upload\/(.*)/);
    if (!uploadMatch) return null;

    let pathAfterUpload = uploadMatch[1];
    pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, "");

    const transformationPattern = /^(?:[a-z]_[^/,]+(?:,[a-z]_[^/,]+)*\/)+/;
    pathAfterUpload = pathAfterUpload.replace(transformationPattern, "");

    pathAfterUpload = pathAfterUpload.replace(/\.[^/.]+$/, "");

    return pathAfterUpload || null;
  } catch (error) {
    console.error("[Extract Public ID Error]", error);
    return null;
  }
}

function generateSignedUrl(publicId, resourceType = "image", expiresIn = 3600) {
  try {
    const timestamp = Math.round(Date.now() / 1000) + expiresIn;

    const options = {
      type: "authenticated",
      sign_url: true,
      expires_at: timestamp,
      resource_type: resourceType,
    };

    if (publicId.includes(".pdf") || resourceType === "raw") {
      options.resource_type = "raw";
    }

    return cloudinary.url(publicId, options);
  } catch (error) {
    console.error("[Generate Signed URL Error]", error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

function getDocumentViewUrl(url) {
  if (!url) return null;
  if (url.includes(".pdf")) return url;
  return url;
}

module.exports = {
  uploadTemp,
  uploadPermanent,
  uploadDocuments,
  uploadProfileImage,
  tempUploadHandler,
  permanentUploadHandler,
  documentUploadHandler,
  profileUploadHandler,
  makeProfileUploadHandler,
  deleteFromCloudinary,
  deleteBatchFromCloudinary,
  safeDeleteBatch,
  markAsPermanent,
  cleanupOldTempImages,
  extractPublicIdFromUrl,
  generateSignedUrl,
  getDocumentViewUrl,
  cloudinary,
  uploadBufferToCloudinary,
};
