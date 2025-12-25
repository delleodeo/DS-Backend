// monitoringService.js
const logger = require('./logger');

class MonitoringService {
  constructor() {
    this.metrics = {
      databaseQueries: 0,
      databaseErrors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheErrors: 0,
      responseTimes: [],
      totalRequests: 0
    };
  }

  recordDatabaseQuery() {
    this.metrics.databaseQueries++;
  }

  recordDatabaseError() {
    this.metrics.databaseErrors++;
  }

  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  recordCacheError() {
    this.metrics.cacheErrors++;
  }

  recordResponseTime(time) {
    this.metrics.responseTimes.push(time);
    this.metrics.totalRequests++;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      databaseQueries: 0,
      databaseErrors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheErrors: 0,
      responseTimes: [],
      totalRequests: 0
    };
  }
}

const monitoringService = new MonitoringService();

module.exports = monitoringService;