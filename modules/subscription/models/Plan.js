import mongoose from "mongoose";

const PlanSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "PHP" },
    interval: { type: String, enum: ["monthly", "quarterly"], required: true },

    features: { type: [String], default: [] },

    limits: {
      products: { type: Number, default: 0 },
      analytics: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      ads: { type: Boolean, default: true },
    },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);
PlanSchema.index({ _id: 1 });
PlanSchema.index({ code: 1 }, { unique: true });
PlanSchema.index({ isActive: 1, sortOrder: 1 });
PlanSchema.index({ interval: 1, isActive: 1 });

export const Plan = mongoose.model("plans", PlanSchema);
