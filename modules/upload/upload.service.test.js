const { getCloudinaryCircuitBreakerState } = require('../modules/upload/upload.service');

describe('Cloudinary Circuit Breaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    // Reset circuit breaker state
    jest.resetModules();
    const uploadService = require('../modules/upload/upload.service');
    circuitBreaker = uploadService.cloudinaryCircuitBreaker;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Circuit States', () => {
    test('should start in CLOSED state', () => {
      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    test('should transition to OPEN after threshold failures', () => {
      // Simulate 5 failures (threshold)
      for (let i = 0; i < 5; i++) {
        circuitBreaker.onFailure();
      }

      const state = circuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(5);
    });

    test('should transition to HALF_OPEN after timeout', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.onFailure();
      }
      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Fast-forward past recovery timeout (60 seconds)
      jest.advanceTimersByTime(61000);

      // Next call should attempt HALF_OPEN
      circuitBreaker.execute(async () => { throw new Error('test'); }).catch(() => {});
      expect(circuitBreaker.getState().state).toBe('HALF_OPEN');
    });

    test('should transition back to CLOSED on HALF_OPEN success', () => {
      // Get to HALF_OPEN state
      for (let i = 0; i < 5; i++) {
        circuitBreaker.onFailure();
      }
      jest.advanceTimersByTime(61000);
      circuitBreaker.execute(async () => { throw new Error('test'); }).catch(() => {});

      // Success should close circuit
      circuitBreaker.onSuccess();
      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });

    test('should stay OPEN on HALF_OPEN failure', () => {
      // Get to HALF_OPEN state
      for (let i = 0; i < 5; i++) {
        circuitBreaker.onFailure();
      }
      jest.advanceTimersByTime(61000);
      circuitBreaker.execute(async () => { throw new Error('test'); }).catch(() => {});

      // Another failure should reopen circuit
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState().state).toBe('OPEN');
    });
  });

  describe('Execute Method', () => {
    test('should execute operation when CLOSED', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    test('should reject when OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.onFailure();
      }

      const mockOperation = jest.fn();

      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow(
        'Circuit breaker is OPEN - Cloudinary service unavailable'
      );
      expect(mockOperation).not.toHaveBeenCalled();
    });

    test('should handle operation success', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      await circuitBreaker.execute(mockOperation);

      const state = circuitBreaker.getState();
      expect(state.successCount).toBe(1);
      expect(state.requestCount).toBe(1);
      expect(state.successRate).toBe(100);
    });

    test('should handle operation failure', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('operation failed'));

      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('operation failed');

      const state = circuitBreaker.getState();
      expect(state.failureCount).toBe(1);
    });
  });

  describe('Metrics', () => {
    test('should calculate success rate correctly', () => {
      circuitBreaker.onSuccess();
      circuitBreaker.onSuccess();
      circuitBreaker.onFailure();

      const state = circuitBreaker.getState();
      expect(state.successRate).toBe(66.67); // 2 out of 3
    });

    test('should reset metrics periodically', () => {
      circuitBreaker.onSuccess();
      circuitBreaker.onFailure();

      // Fast-forward 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      const state = circuitBreaker.getState();
      expect(state.requestCount).toBe(0);
      expect(state.successCount).toBe(0);
    });
  });
});