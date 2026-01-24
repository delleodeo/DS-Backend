const crypto = require("crypto");

function addMonths(baseDate, monthsToAdd) {
  const d = new Date(baseDate);
  const day = d.getDate();
  d.setMonth(d.getMonth() + monthsToAdd);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function computePeriodEnd(start, interval) {
  if (interval === "monthly") return addMonths(start, 1);
  return addMonths(start, 3);
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = {
  addMonths,
  computePeriodEnd,
  sha256,
  HttpError,
};