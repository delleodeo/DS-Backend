import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "sellers",
      required: true,
      unique: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "plans",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "expired", "canceled"],
      default: "active",
      index: true,
    },

    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, required: true, index: true },

    cancelAtPeriodEnd: { type: Boolean, default: false, index: true },
    canceledAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },

    history: [
      {
        event: {
          type: String,
          enum: ["created", "renewed", "changed", "canceled", "expired"],
          required: true,
        },
        fromPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "plans", default: null },
        toPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "plans", default: null },
        at: { type: Date, default: Date.now },
        note: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

SubscriptionSchema.index({ sellerId: 1 }, { unique: true });
SubscriptionSchema.index({ sellerId: 1, status: 1 });
SubscriptionSchema.index({ planId: 1, status: 1 });
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
SubscriptionSchema.index({ cancelAtPeriodEnd: 1, currentPeriodEnd: 1 });

export const Subscription = mongoose.model("subscriptions", SubscriptionSchema);
