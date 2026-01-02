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
      totalRequests: 0,
      cartOperations: {},
      requestDurations: {},
      successfulRequests: 0,
      serverErrors: 0,
      clientErrors: 0,
      healthChecks: { count: 0, totalDuration: 0, avgDuration: 0 },
      rateLimitHits: 0,
      externalErrors: {},
      externalSuccesses: {}
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

  recordCartOperation(operation, duration) {
    if (!this.metrics.cartOperations) {
      this.metrics.cartOperations = {};
    }
    if (!this.metrics.cartOperations[operation]) {
      this.metrics.cartOperations[operation] = { count: 0, totalDuration: 0 };
    }
    this.metrics.cartOperations[operation].count++;
    this.metrics.cartOperations[operation].totalDuration += duration;
  }

  recordRequestDuration(method, path, duration) {
    if (!this.metrics.requestDurations) {
      this.metrics.requestDurations = {};
    }
    const key = `${method} ${path}`;
    if (!this.metrics.requestDurations[key]) {
      this.metrics.requestDurations[key] = { count: 0, totalDuration: 0, avgDuration: 0 };
    }
    this.metrics.requestDurations[key].count++;
    this.metrics.requestDurations[key].totalDuration += duration;
    this.metrics.requestDurations[key].avgDuration = this.metrics.requestDurations[key].totalDuration / this.metrics.requestDurations[key].count;
  }

  recordSuccessfulRequest() {
    if (!this.metrics.successfulRequests) {
      this.metrics.successfulRequests = 0;
    }
    this.metrics.successfulRequests++;
  }

  recordServerError() {
    if (!this.metrics.serverErrors) {
      this.metrics.serverErrors = 0;
    }
    this.metrics.serverErrors++;
  }

  recordClientError() {
    if (!this.metrics.clientErrors) {
      this.metrics.clientErrors = 0;
    }
    this.metrics.clientErrors++;
  }

  recordHealthCheck(duration) {
    if (!this.metrics.healthChecks) {
      this.metrics.healthChecks = { count: 0, totalDuration: 0, avgDuration: 0 };
    }
    this.metrics.healthChecks.count++;
    this.metrics.healthChecks.totalDuration += duration;
    this.metrics.healthChecks.avgDuration = this.metrics.healthChecks.totalDuration / this.metrics.healthChecks.count;
  }

  recordRateLimitHit() {
    if (!this.metrics.rateLimitHits) {
      this.metrics.rateLimitHits = 0;
    }
    this.metrics.rateLimitHits++;
  }

  recordExternalError(serviceName) {
    if (!this.metrics.externalErrors) {
      this.metrics.externalErrors = {};
    }
    if (!this.metrics.externalErrors[serviceName]) {
      this.metrics.externalErrors[serviceName] = 0;
    }
    this.metrics.externalErrors[serviceName]++;
  }

  recordExternalSuccess(serviceName) {
    if (!this.metrics.externalSuccesses) {
      this.metrics.externalSuccesses = {};
    }
    if (!this.metrics.externalSuccesses[serviceName]) {
      this.metrics.externalSuccesses[serviceName] = 0;
    }
    this.metrics.externalSuccesses[serviceName]++;
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
      totalRequests: 0,
      cartOperations: {},
      requestDurations: {},
      successfulRequests: 0,
      serverErrors: 0,
      clientErrors: 0,
      healthChecks: { count: 0, totalDuration: 0, avgDuration: 0 },
      rateLimitHits: 0,
      externalErrors: {},
      externalSuccesses: {}
    };
  }
}

const monitoringService = new MonitoringService();

module.exports = monitoringService;