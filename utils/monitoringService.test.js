const MonitoringService = require('../../utils/monitoringService');

describe('MonitoringService', () => {
  let monitoring;

  beforeEach(() => {
    // Reset the singleton instance
    monitoring = new MonitoringService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Cache Metrics', () => {
    test('should record cache hits and misses', () => {
      monitoring.recordCacheHit();
      monitoring.recordCacheHit();
      monitoring.recordCacheMiss();

      const metrics = monitoring.getMetrics();
      expect(metrics.cache.hitRate).toBe(66.67); // 2 hits out of 3 requests
      expect(metrics.cache.hits).toBe(2);
      expect(metrics.cache.misses).toBe(1);
    });

    test('should record cache operations', () => {
      monitoring.recordCacheSet();
      monitoring.recordCacheDelete();
      monitoring.recordCacheError();

      const metrics = monitoring.getMetrics();
      expect(metrics.cache.sets).toBe(1);
      expect(metrics.cache.deletes).toBe(1);
      expect(metrics.cache.errors).toBe(1);
    });
  });

  describe('Database Metrics', () => {
    test('should record database queries with timing', () => {
      monitoring.recordDatabaseQuery(50);
      monitoring.recordDatabaseQuery(150);
      monitoring.recordDatabaseQuery(75);

      const metrics = monitoring.getMetrics();
      expect(metrics.database.queries).toBe(3);
      expect(metrics.database.averageQueryTime).toBe(91.67); // (50+150+75)/3
    });

    test('should track slow queries', () => {
      monitoring.recordDatabaseQuery(50);
      monitoring.recordDatabaseQuery(200); // Slow query
      monitoring.recordDatabaseQuery(300); // Slow query

      const metrics = monitoring.getMetrics();
      expect(metrics.performance.slowQueries).toHaveLength(2);
    });

    test('should record database errors', () => {
      monitoring.recordDatabaseError();
      monitoring.recordDatabaseError();

      const metrics = monitoring.getMetrics();
      expect(metrics.database.errors).toBe(2);
    });
  });

  describe('External Service Metrics', () => {
    test('should record Cloudinary operations', () => {
      monitoring.recordCloudinaryUpload();
      monitoring.recordCloudinaryUploadError();
      monitoring.recordCloudinaryDelete();
      monitoring.recordCloudinaryDeleteError();

      const metrics = monitoring.getMetrics();
      expect(metrics.external.cloudinary.uploads).toBe(1);
      expect(metrics.external.cloudinary.uploadErrors).toBe(1);
      expect(metrics.external.cloudinary.deletes).toBe(1);
      expect(metrics.external.cloudinary.deleteErrors).toBe(1);
    });
  });

  describe('Performance Metrics', () => {
    test('should record response times', () => {
      monitoring.recordResponseTime(100);
      monitoring.recordResponseTime(200);
      monitoring.recordResponseTime(150);

      const metrics = monitoring.getMetrics();
      expect(metrics.performance.averageResponseTime).toBe(150);
      expect(metrics.performance.percentile95ResponseTime).toBe(200); // All values, so max
    });

    test('should limit response time history', () => {
      // Record 1001 response times
      for (let i = 0; i < 1001; i++) {
        monitoring.recordResponseTime(i);
      }

      const metrics = monitoring.getMetrics();
      expect(metrics.performance.responseTimes).toHaveLength(1000);
    });
  });

  describe('Metrics Reset', () => {
    test('should reset metrics periodically', () => {
      monitoring.recordCacheHit();
      monitoring.recordDatabaseQuery(100);

      // Fast-forward 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      const metrics = monitoring.getMetrics();
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.database.queries).toBe(0);
    });

    test('should allow manual reset', () => {
      monitoring.recordCacheHit();
      monitoring.recordDatabaseQuery(100);

      monitoring.resetMetrics();

      const metrics = monitoring.getMetrics();
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.database.queries).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle division by zero in hit rate', () => {
      const metrics = monitoring.getMetrics();
      expect(metrics.cache.hitRate).toBe(0);
    });

    test('should handle empty response times array', () => {
      const metrics = monitoring.getMetrics();
      expect(metrics.performance.averageResponseTime).toBe(0);
      expect(metrics.performance.percentile95ResponseTime).toBe(0);
    });

    test('should handle empty slow queries array', () => {
      const metrics = monitoring.getMetrics();
      expect(metrics.performance.slowQueries).toHaveLength(0);
    });
  });
});