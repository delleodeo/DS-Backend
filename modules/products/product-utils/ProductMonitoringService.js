const logger = require('../../../utils/logger');
const { METRICS, LOG_LEVELS } = require('./constants.js');
const mongoose = require('mongoose');

// Metrics persistence schema
const MetricsSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  value: { type: Number, required: true },
  tags: { type: Map, of: String, default: {} },
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, default: 'product-service' }
}, {
  timestamps: true,
  expires: 604800 // Auto-delete after 7 days
});

MetricsSchema.index({ name: 1, timestamp: -1 });
MetricsSchema.index({ 'tags.service': 1, timestamp: -1 });

const MetricsModel = mongoose.model('ProductMetrics', MetricsSchema);

/**
 * Product Monitoring Service - Handles metrics, logging, and observability
 * Enhanced with persistent storage and external monitoring integration
 */
class ProductMonitoringService {
  constructor(options = {}) {
    this.metrics = new Map();
    this.startTime = Date.now();
    this.persistenceEnabled = options.persistence !== false;
    this.externalMonitoring = options.externalMonitoring || null;
    this.flushInterval = options.flushInterval || 30000; // 30 seconds

    // Start periodic flush if persistence is enabled
    if (this.persistenceEnabled) {
      this.startPeriodicFlush();
    }
  }

  /**
   * Record metric
   */
  recordMetric(name, value, tags = {}) {
    const key = `${name}:${JSON.stringify(tags)}`;
    const current = this.metrics.get(key) || { count: 0, sum: 0, values: [] };

    current.count++;
    current.sum += value;
    current.values.push({ value, timestamp: Date.now() });

    // Keep only last 100 values
    if (current.values.length > 100) {
      current.values.shift();
    }

    this.metrics.set(key, current);

    logger.debug(`Metric recorded: ${name}`, { value, tags, average: current.sum / current.count });
  }

  /**
   * Persist metrics to database
   */
  async persistMetrics() {
    if (!this.persistenceEnabled) return;

    try {
      const metricsToPersist = [];

      for (const [key, metric] of this.metrics.entries()) {
        const [name, tagsStr] = key.split(':');
        const tags = JSON.parse(tagsStr || '{}');

        // Only persist metrics that have been updated recently
        const recentValues = metric.values.filter(v =>
          Date.now() - v.timestamp < 60000 // Last minute
        );

        recentValues.forEach(({ value, timestamp }) => {
          metricsToPersist.push({
            name,
            value,
            tags,
            timestamp: new Date(timestamp)
          });
        });
      }

      if (metricsToPersist.length > 0) {
        await MetricsModel.insertMany(metricsToPersist, { ordered: false });
        logger.debug(`Persisted ${metricsToPersist.length} metrics to database`);
      }

    } catch (error) {
      logger.warn('Failed to persist metrics:', error.message);
    }
  }

  /**
   * Send metrics to external monitoring system
   */
  async sendToExternalMonitoring() {
    if (!this.externalMonitoring) return;

    try {
      const metricsData = {};

      for (const [key, metric] of this.metrics.entries()) {
        const [name, tagsStr] = key.split(':');
        const tags = JSON.parse(tagsStr || '{}');

        metricsData[name] = {
          value: metric.sum / metric.count,
          count: metric.count,
          tags,
          timestamp: Date.now()
        };
      }

      // Send to external monitoring (e.g., DataDog, Prometheus, etc.)
      if (this.externalMonitoring.send) {
        await this.externalMonitoring.send(metricsData);
      }

      logger.debug('Sent metrics to external monitoring system');

    } catch (error) {
      logger.warn('Failed to send metrics to external monitoring:', error.message);
    }
  }

  /**
   * Start periodic flush of metrics
   */
  startPeriodicFlush() {
    this.flushTimer = setInterval(async () => {
      await this.persistMetrics();
      await this.sendToExternalMonitoring();
    }, this.flushInterval);

    // Cleanup on process exit
    process.on('SIGINT', () => {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }
      this.persistMetrics(); // Final flush
    });
  }

  /**
   * Get historical metrics from database
   */
  async getHistoricalMetrics(name, tags = {}, timeRange = 3600000) { // 1 hour default
    if (!this.persistenceEnabled) {
      return this.getMetricStats(name, tags); // Return in-memory stats
    }

    try {
      const startTime = new Date(Date.now() - timeRange);

      const query = { name, timestamp: { $gte: startTime } };

      // Add tag filters
      if (Object.keys(tags).length > 0) {
        query.tags = {};
        for (const [key, value] of Object.entries(tags)) {
          query.tags[key] = value;
        }
      }

      const metrics = await MetricsModel.find(query)
        .sort({ timestamp: 1 })
        .lean();

      if (metrics.length === 0) {
        return null;
      }

      const values = metrics.map(m => m.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      return {
        name,
        count: metrics.length,
        average: avg,
        min,
        max,
        timeRange,
        dataPoints: metrics.map(m => ({
          value: m.value,
          timestamp: m.timestamp
        }))
      };

    } catch (error) {
      logger.warn('Failed to retrieve historical metrics:', error.message);
      return this.getMetricStats(name, tags); // Fallback to in-memory
    }
  }

  /**
   * Get metric statistics
   */
  getMetricStats(name, tags = {}) {
    const key = `${name}:${JSON.stringify(tags)}`;
    const metric = this.metrics.get(key);

    if (!metric) {
      return null;
    }

    const avg = metric.sum / metric.count;
    const min = Math.min(...metric.values.map(v => v.value));
    const max = Math.max(...metric.values.map(v => v.value));

    return {
      name,
      tags,
      count: metric.count,
      average: avg,
      min,
      max,
      latest: metric.values[metric.values.length - 1]?.value
    };
  }

  /**
   * Log product operation with correlation ID
   */
  logOperation(operation, level = LOG_LEVELS.INFO, data = {}) {
    const correlationId = data.correlationId || this.generateCorrelationId();
    const logData = {
      operation,
      correlationId,
      timestamp: new Date().toISOString(),
      ...data
    };

    logger[level](`[${operation}] ${data.message || 'Operation completed'}`, logData);

    // Record performance metrics
    if (data.duration) {
      this.recordMetric(`${operation}_duration`, data.duration, {
        success: data.success !== false
      });
    }

    return correlationId;
  }

  /**
   * Time operation execution
   */
  async timeOperation(operationName, operation, tags = {}) {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();

    try {
      this.logOperation(operationName, LOG_LEVELS.DEBUG, {
        correlationId,
        message: 'Operation started',
        ...tags
      });

      const result = await operation();

      const duration = Date.now() - startTime;
      this.logOperation(operationName, LOG_LEVELS.INFO, {
        correlationId,
        message: 'Operation completed successfully',
        duration,
        success: true,
        ...tags
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logOperation(operationName, LOG_LEVELS.ERROR, {
        correlationId,
        message: `Operation failed: ${error.message}`,
        duration,
        success: false,
        error: error.message,
        ...tags
      });

      throw error;
    }
  }

  /**
   * Monitor cache performance
   */
  recordCacheHit(cacheKey, hit = true) {
    this.recordMetric(METRICS.CACHE_HIT_RATE, hit ? 1 : 0, { cacheKey });
  }

  /**
   * Monitor query performance
   */
  recordQueryPerformance(queryType, duration, recordCount = 0) {
    this.recordMetric(METRICS.QUERY_PERFORMANCE, duration, {
      queryType,
      recordCount
    });
  }

  /**
   * Monitor error rates
   */
  recordError(operation, error) {
    this.recordMetric(METRICS.ERROR_RATE, 1, {
      operation,
      errorType: error.type || 'unknown'
    });
  }

  /**
   * Generate correlation ID
   */
  generateCorrelationId() {
    return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const uptime = Date.now() - this.startTime;
    const metrics = {};

    // Calculate cache hit rate
    const cacheStats = this.getMetricStats(METRICS.CACHE_HIT_RATE);
    if (cacheStats) {
      metrics.cacheHitRate = cacheStats.average;
    }

    // Calculate error rate
    const errorStats = this.getMetricStats(METRICS.ERROR_RATE);
    if (errorStats) {
      metrics.errorRate = errorStats.average;
    }

    return {
      service: 'ProductService',
      uptime,
      metrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Log audit trail for product modifications
   */
  logAudit(userId, action, productId, changes = {}, metadata = {}) {
    const auditLog = {
      userId,
      action,
      productId,
      changes,
      metadata,
      timestamp: new Date().toISOString(),
      correlationId: this.generateCorrelationId()
    };

    logger.info(`[AUDIT] ${action}`, auditLog);

    // Could also store in database for compliance
    // await AuditLog.create(auditLog);
  }

  /**
   * Performance monitoring for external service calls
   */
  async monitorExternalCall(serviceName, operation) {
    return this.timeOperation(`external_${serviceName}`, operation, {
      service: serviceName
    });
  }

  /**
   * Batch operation monitoring
   */
  monitorBatchOperation(operationName, totalItems, successfulItems, failedItems) {
    const successRate = successfulItems / totalItems;

    this.recordMetric(`${operationName}_batch_success_rate`, successRate, {
      totalItems,
      successfulItems,
      failedItems
    });

    this.logOperation(operationName, LOG_LEVELS.INFO, {
      message: `Batch operation completed`,
      totalItems,
      successfulItems,
      failedItems,
      successRate
    });
  }

  /**
   * Memory usage monitoring
   */
  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.recordMetric('memory_usage', memUsage.heapUsed, {
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    });
  }

  /**
   * Get all metrics summary
   */
  getMetricsSummary() {
    const summary = {
      totalMetrics: this.metrics.size,
      metrics: {}
    };

    for (const [key, data] of this.metrics) {
      const [name, tagsStr] = key.split(':');
      const tags = JSON.parse(tagsStr || '{}');

      if (!summary.metrics[name]) {
        summary.metrics[name] = [];
      }

      summary.metrics[name].push({
        tags,
        stats: this.getMetricStats(name, tags)
      });
    }

    return summary;
  }
}

module.exports = ProductMonitoringService;