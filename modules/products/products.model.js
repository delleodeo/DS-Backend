const mongoose = require("mongoose");
const sanitizeHtml = require('sanitize-html');

const PromotionSchema = new mongoose.Schema(
	{
		isActive: { type: Boolean, default: false },
		discountType: { type: String, enum: ['percentage', 'fixed', 'none'], default: 'none' },
		discountValue: { type: Number, default: 0, min: 0 },
		startDate: { type: Date },
		endDate: { type: Date },
		freeShipping: { type: Boolean, default: false },
	},
	{ _id: false }
);

const OptionSchema = new mongoose.Schema(
	{
		imageUrl: String,
		price: { type: Number, required: true },
		label: { type: String, required: false },
		isHot: { type: Boolean, default: false },
		stock: { type: Number, default: 0 },
		sold: { type: Number, default: 0 },
		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now },
		promotion: { type: PromotionSchema, default: () => ({}) },
	},
	{ _id: true }
);

// Review sub-schema
const ReviewSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		rating: { type: Number, min: 1, max: 5, required: true },
		comment: { type: String },
		createdAt: { type: Date, default: Date.now },
	},
	{ _id: false }
);

const ProductSchema = new mongoose.Schema({
	vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
	name: { type: String, required: true },
	description: String,
	price: { type: Number, required: true, min: 0 },
	stock: { type: Number, default: 0, min: 0 },
	sold: { type: Number, default: 0, min: 0 },
	option: { type: [OptionSchema], required: false },
	categories: [String],
	isOption: { type: Boolean, default: false },
	imageUrls: [String],
	isNew: { type: Boolean, default: true },
	isHot: { type: Boolean, default: false },
	isApproved: { type: Boolean, default: false },
	
	// Product Approval Status (pending_review, approved, rejected)
	status: {
		type: String,
		enum: ['pending_review', 'approved', 'rejected'],
		default: 'pending_review'
	},
	
	// Product Approval Workflow (Admin Feature)
	approvedAt: { type: Date },
	approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	rejectedAt: { type: Date },
	rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	rejectionReason: { type: String },
	
	// Product Disable Feature (Admin Feature)
	isDisabled: { type: Boolean, default: false },
	disabledAt: { type: Date },
	disabledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	disableReason: { type: String },
	
	reviews: { type: [ReviewSchema], required: false },
	averageRating: { type: Number, default: 0, min: 0 },
	numReviews: { type: Number, default: 0, min: 0 },
	createdAt: { type: Date, default: Date.now },
	municipality: { type: String, required: true },
	promotion: { type: PromotionSchema, default: () => ({}) },
});

// XSS Protection: Sanitize user-generated content before saving
ProductSchema.pre('save', function(next) {
  try {
    // Sanitize product description - allow safe formatting tags from Quill editor
    if (this.description && typeof this.description === 'string') {
      this.description = sanitizeHtml(this.description, {
        // Allow Quill editor formatting tags
        allowedTags: [
          'b', 'i', 'em', 'strong', 'u', 's', 'strike',
          'ul', 'ol', 'li',
          'p', 'br', 'span',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'a', 'blockquote', 'pre', 'code'
        ],
        allowedAttributes: {
          'p': ['class', 'style'],
          'span': ['class', 'style'],
          'li': ['class', 'style'],
          'ol': ['class', 'style'],
          'ul': ['class', 'style'],
          'a': ['href', 'target', 'rel'],
          'h1': ['class'],
          'h2': ['class'],
          'h3': ['class'],
          'h4': ['class'],
          'h5': ['class'],
          'h6': ['class'],
          'blockquote': ['class']
        },
        // Use custom matcher function to allow all Quill classes (ql-indent-*, ql-align-*, etc.)
        allowedClasses: {
          'p': (className) => className.startsWith('ql-'),
          'span': (className) => className.startsWith('ql-'),
          'li': (className) => className.startsWith('ql-'),
          'ol': (className) => className.startsWith('ql-'),
          'ul': (className) => className.startsWith('ql-'),
          'h1': (className) => className.startsWith('ql-'),
          'h2': (className) => className.startsWith('ql-'),
          'h3': (className) => className.startsWith('ql-'),
          'h4': (className) => className.startsWith('ql-'),
          'h5': (className) => className.startsWith('ql-'),
          'h6': (className) => className.startsWith('ql-'),
          'blockquote': (className) => className.startsWith('ql-')
        },
        allowedStyles: {
          '*': {
            'padding-left': [/^\d+(?:px|em|rem)$/],
            'margin-left': [/^\d+(?:px|em|rem)$/],
            'text-align': [/^(left|right|center|justify)$/]
          }
        },
        disallowedTagsMode: 'discard',
        // Security: only allow safe URL schemes for links
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: {
          a: ['http', 'https', 'mailto']
        },
        allowProtocolRelative: false,
        // Transform links to open in new tab safely
        transformTags: {
          'a': function(tagName, attribs) {
            return {
              tagName: 'a',
              attribs: {
                href: attribs.href || '',
                target: '_blank',
                rel: 'noopener noreferrer'
              }
            };
          }
        }
      }).trim();
    }

    // Sanitize rejection reason (admin field)
    if (this.rejectionReason && typeof this.rejectionReason === 'string') {
      this.rejectionReason = sanitizeHtml(this.rejectionReason, {
        allowedTags: [], // No HTML tags allowed
        allowedAttributes: {},
        disallowedTagsMode: 'discard'
      }).trim();
    }

    // Sanitize disable reason (admin field)
    if (this.disableReason && typeof this.disableReason === 'string') {
      this.disableReason = sanitizeHtml(this.disableReason, {
        allowedTags: [], // No HTML tags allowed
        allowedAttributes: {},
        disallowedTagsMode: 'discard'
      }).trim();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Sanitize review comments when reviews are modified
ProductSchema.pre('save', function(next) {
  try {
    if (this.reviews && Array.isArray(this.reviews)) {
      this.reviews.forEach(review => {
        if (review.comment && typeof review.comment === 'string') {
          review.comment = sanitizeHtml(review.comment, {
            allowedTags: [], // No HTML tags allowed
            allowedAttributes: {},
            disallowedTagsMode: 'discard'
          }).trim();
        }
      });
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Indexes for efficient admin queries
ProductSchema.index({ isApproved: 1, createdAt: -1 });
ProductSchema.index({ vendorId: 1, isApproved: 1 });
ProductSchema.index({ isDisabled: 1 });
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ vendorId: 1, status: 1 });

// Text index for search on common fields
ProductSchema.index({ name: 'text', description: 'text', categories: 'text' });
// Municipality + status compound index for efficient municipality queries
ProductSchema.index({ municipality: 1, status: 1 });

// Virtual for checking if a product has an active promotion
ProductSchema.virtual('hasPromotion').get(function() {
  // A promotion is active if the flag is true and it's not scheduled for the future or already expired.
  if (!this.promotion || !this.promotion.isActive) {
    return false;
  }
  const now = new Date();
  if (this.promotion.startDate && new Date(this.promotion.startDate) > now) {
    return false; // Scheduled, not active yet
  }
  if (this.promotion.endDate && new Date(this.promotion.endDate) < now) {
    return false; // Expired
  }
  return true;
});


// Virtual for promotion status
ProductSchema.virtual('promotionStatus').get(function() {
  if (!this.promotion || !this.promotion.isActive) {
    return 'inactive';
  }
  const now = new Date();
  if (this.promotion.startDate && new Date(this.promotion.startDate) > now) {
    return 'scheduled';
  }
  if (this.promotion.endDate && new Date(this.promotion.endDate) < now) {
    return 'expired';
  }
  return 'active';
});

// Virtual for checking if an option has an active promotion
OptionSchema.virtual('hasPromotion').get(function() {
    // A promotion is active if the flag is true and it's not scheduled for the future or already expired.
  if (!this.promotion || !this.promotion.isActive) {
    return false;
  }
  const now = new Date();
  if (this.promotion.startDate && new Date(this.promotion.startDate) > now) {
    return false; // Scheduled, not active yet
  }
  if (this.promotion.endDate && new Date(this.promotion.endDate) < now) {
    return false; // Expired
  }
  return true;
});

// Virtual for promotion status on option
OptionSchema.virtual('promotionStatus').get(function() {
  if (!this.promotion || !this.promotion.isActive) {
    return 'inactive';
  }
  const now = new Date();
  if (this.promotion.startDate && new Date(this.promotion.startDate) > now) {
    return 'scheduled';
  }
  if (this.promotion.endDate && new Date(this.promotion.endDate) < now) {
    return 'expired';
  }
  return 'active';
});


// Ensure virtuals are included in toJSON and toObject outputs
ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });
OptionSchema.set('toJSON', { virtuals: true });
OptionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model("Product", ProductSchema);
