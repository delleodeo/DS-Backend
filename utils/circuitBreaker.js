/**
 * Circuit Breaker Utility
 * Prevents cascading failures by temporarily blocking requests to failing services
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.threshold = options.threshold || 5; // Number of failures before opening
    this.resetTimeout = options.resetTimeout || 60000; // Time in ms before attempting to close
    this.monitorInterval = options.monitorInterval || 10000; // Health check interval
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    
    // Statistics
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      lastStateChange: new Date()
    };
  }

  /**
   * Check if circuit allows the call
   */
  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'OPEN') {
      // Check if we should try half-open
      if (Date.now() >= this.nextAttempt) {
        this.state = 'HALF_OPEN';
        this.stats.lastStateChange = new Date();
        console.log(`[CircuitBreaker:${this.name}] State changed to HALF_OPEN`);
        return true;
      }
      return false;
    }
    
    // HALF_OPEN - allow one request through
    return true;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn) {
    this.stats.totalCalls++;
    
    if (!this.canExecute()) {
      this.stats.rejectedCalls++;
      const error = new Error(`Circuit breaker '${this.name}' is OPEN`);
      error.code = 'CIRCUIT_OPEN';
      error.retryAfter = Math.ceil((this.nextAttempt - Date.now()) / 1000);
      throw error;
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  onSuccess() {
    this.stats.successfulCalls++;
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      // Require multiple successes to close
      if (this.successes >= 2) {
        this.close();
      }
    }
  }

  /**
   * Record a failed call
   */
  onFailure(error) {
    this.stats.failedCalls++;
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;
    
    console.log(`[CircuitBreaker:${this.name}] Failure recorded: ${error.message}. Count: ${this.failures}/${this.threshold}`);
    
    if (this.state === 'HALF_OPEN') {
      this.open();
    } else if (this.failures >= this.threshold) {
      this.open();
    }
  }

  /**
   * Open the circuit
   */
  open() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.resetTimeout;
    this.stats.lastStateChange = new Date();
    console.log(`[CircuitBreaker:${this.name}] Circuit OPENED. Will retry at ${new Date(this.nextAttempt).toISOString()}`);
  }

  /**
   * Close the circuit
   */
  close() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.stats.lastStateChange = new Date();
    console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED`);
  }

  /**
   * Get circuit state info
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      threshold: this.threshold,
      nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt) : null,
      stats: this.stats
    };
  }

  /**
   * Force reset the circuit
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.stats.lastStateChange = new Date();
    console.log(`[CircuitBreaker:${this.name}] Circuit manually RESET`);
  }
}

// Circuit breaker registry for managing multiple breakers
const circuitBreakers = new Map();

/**
 * Get or create a circuit breaker by name
 */
const getCircuitBreaker = (name, options = {}) => {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ name, ...options }));
  }
  return circuitBreakers.get(name);
};

/**
 * Get all circuit breaker states (for monitoring)
 */
const getAllCircuitStates = () => {
  const states = {};
  for (const [name, breaker] of circuitBreakers) {
    states[name] = breaker.getState();
  }
  return states;
};

/**
 * Create middleware that uses circuit breaker
 */
const circuitBreakerMiddleware = (name, options = {}) => {
  const breaker = getCircuitBreaker(name, options);
  
  return (req, res, next) => {
    if (!breaker.canExecute()) {
      const retryAfter = Math.ceil((breaker.nextAttempt - Date.now()) / 1000);
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again later.',
        retryAfter
      });
    }
    
    // Store reference for success/failure recording
    req.circuitBreaker = breaker;
    
    // Override res.json to track success/failure
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      if (res.statusCode >= 500) {
        breaker.onFailure(new Error(`HTTP ${res.statusCode}`));
      } else {
        breaker.onSuccess();
      }
      return originalJson(data);
    };
    
    next();
  };
};

// Pre-configured circuit breakers
const paymentCircuitBreaker = getCircuitBreaker('payment', {
  threshold: 3,
  resetTimeout: 30000 // 30 seconds
});

const walletCircuitBreaker = getCircuitBreaker('wallet', {
  threshold: 5,
  resetTimeout: 60000 // 1 minute
});

const commissionCircuitBreaker = getCircuitBreaker('commission', {
  threshold: 5,
  resetTimeout: 60000
});

module.exports = {
  CircuitBreaker,
  getCircuitBreaker,
  getAllCircuitStates,
  circuitBreakerMiddleware,
  paymentCircuitBreaker,
  walletCircuitBreaker,
  commissionCircuitBreaker
};
