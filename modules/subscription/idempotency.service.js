const { IdempotencyKey } = require("./models/IdempotencyKey");
const { HttpError, sha256 } = require("./utils/subscriptionErrors");

const withIdempotency = async ({ key, userId, route, body, handler }) => {
  if (!key) return handler();

  const requestHash = sha256(JSON.stringify(body || {}));
  const existing = await IdempotencyKey.findOne({ key, userId, route });

  if (existing && existing.status === "completed") {
    if (existing.requestHash !== requestHash) {
      throw new HttpError(409, "Idempotency key reused with different payload");
    }
    return existing.response;
  }

  if (existing && existing.status === "started") {
    if (existing.requestHash !== requestHash) {
      throw new HttpError(409, "Idempotency key reused with different payload");
    }
    throw new HttpError(409, "Request already in progress");
  }

  await IdempotencyKey.create({
    key,
    userId,
    route,
    requestHash,
    status: "started",
  });

  try {
    const result = await handler();
    await IdempotencyKey.updateOne(
      { key, userId, route },
      { $set: { status: "completed", response: result } }
    );
    return result;
  } catch (error) {
    await IdempotencyKey.deleteOne({ key, userId, route });
    throw error;
  }
};

module.exports = { withIdempotency };
