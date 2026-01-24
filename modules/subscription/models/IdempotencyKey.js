import mongoose from "mongoose";

const IdempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    route: { type: String, required: true, index: true },
    requestHash: { type: String, required: true },
    status: { type: String, enum: ["started", "completed"], default: "started", index: true },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

IdempotencyKeySchema.index({ key: 1 }, { unique: true });
IdempotencyKeySchema.index({ userId: 1, route: 1, key: 1 });
IdempotencyKeySchema.index({ status: 1, createdAt: 1 });

// TTL cleanup: delete after 7 days
IdempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const IdempotencyKey = mongoose.model("idempotency_keys", IdempotencyKeySchema);
