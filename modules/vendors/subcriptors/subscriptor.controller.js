// controllers/vendorAnalytics.controller.js
const mongoose = require("mongoose");
const analyticsService = require("./subscriptor.sevice"); // adjust path to your service file

const clampInt = (n, min, max, fallback) => {
  const v = Number.parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
};

const toDateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const resolvePeriod = (q) => {
  const now = new Date();
  const range = String(q.range || "30d").toLowerCase();

  const qStart = toDateOrNull(q.startDate);
  const qEnd = toDateOrNull(q.endDate);

  if (qStart || qEnd) {
    const start = qStart ? startOfDay(qStart) : startOfDay(new Date(now.getTime() - 29 * 86400000));
    const end = qEnd ? endOfDay(qEnd) : endOfDay(now);
    return { startDate: start, endDate: end, rangeKey: "custom" };
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const start = startOfDay(new Date(now.getTime() - (days - 1) * 86400000));
  const end = endOfDay(now);
  return { startDate: start, endDate: end, rangeKey: range };
};

const pctChange = (cur, prev) => {
  const c = Number(cur || 0);
  const p = Number(prev || 0);
  if (p <= 0 && c > 0) return 1;
  if (p <= 0) return 0;
  return (c - p) / p;
};

exports.getAnalyticsData = async (req, res) => {
  try {
    const vendorUserId = String(req.user?.id || req.user?._id || req.params.vendorUserId || "");
    if (!mongoose.Types.ObjectId.isValid(vendorUserId)) {
      return res.status(400).json({ success: false, message: "Invalid vendor id" });
    }

    const { startDate, endDate, rangeKey } = resolvePeriod(req.query);

    const limitProducts = clampInt(req.query.limitProducts, 1, 50, 8);
    const limitCustomers = clampInt(req.query.limitCustomers, 1, 50, 6);
    const limitLocations = clampInt(req.query.limitLocations, 1, 50, 6);

    const cacheTtlSec = clampInt(req.query.cacheTtlSec, 10, 3600, 120);
    const noCache = String(req.query.noCache || "0") === "1";
    const includePrevious = String(req.query.compare || "1") !== "0";

    const current = await analyticsService.getAnalyticsData(vendorUserId, {
      startDate,
      endDate,
      limitProducts,
      limitCustomers,
      limitLocations,
      cacheTtlSec,
      noCache,
    });

    const response = {
      success: true,
      period: {
        rangeKey,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      current,
    };

    if (includePrevious) {
      const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
      const prevEnd = new Date(startDate.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);

      const previous = await analyticsService.getAnalyticsData(vendorUserId, {
        startDate: startOfDay(prevStart),
        endDate: endOfDay(prevEnd),
        limitProducts,
        limitCustomers,
        limitLocations,
        cacheTtlSec,
        noCache,
      });

      const curTotals = current?.totals || {};
      const prevTotals = previous?.totals || {};

      response.previous = previous;
      response.trends = {
        totalRevenue: pctChange(curTotals.totalRevenue, prevTotals.totalRevenue),
        totalSold: pctChange(curTotals.totalSold, prevTotals.totalSold),
        totalViews: pctChange(curTotals.totalViews, prevTotals.totalViews),
        totalUniqueViews: pctChange(curTotals.totalUniqueViews, prevTotals.totalUniqueViews),
      };
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("getAnalyticsData controller error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch analytics data" });
  }
};

