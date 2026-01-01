const { ExternalServiceError } = require("./errorHandler");
const logger = require("./logger");

/**
 * PayMongo API Client
 * Encapsulates all PayMongo API interactions with retry logic and error handling
 */
class PayMongoClient {
  constructor() {
    this.baseUrl = "https://api.paymongo.com/v1";
    this.secretKey = process.env.PAYMONGO_SECRET_KEY;
    this.publicKey = process.env.PAYMONGO_PUBLIC_KEY;
    this.webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second

    if (!this.secretKey) {
      throw new Error("PAYMONGO_SECRET_KEY is not configured");
    }
  }

  /**
   * Get authorization header
   */
  getAuthHeader(usePublicKey = false) {
    const key = usePublicKey ? this.publicKey : this.secretKey;
    return `Basic ${Buffer.from(key + ":").toString("base64")}`;
  }

  /**
   * Make HTTP request with retry logic
   */
  async request(endpoint, options = {}, retryCount = 0) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.getAuthHeader(options.usePublicKey),
        ...options.headers,
      },
    };

    try {
      logger.info(`PayMongo API Request: ${options.method || "GET"} ${endpoint}`);

      const response = await fetch(url, config);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = data?.errors?.[0]?.detail || data?.message || "PayMongo API request failed";
        
        logger.error("PayMongo API Error:", {
          status: response.status,
          endpoint,
          error: errorMessage,
          data
        });

        // Retry on 5xx errors
        if (response.status >= 500 && retryCount < this.maxRetries) {
          logger.warn(`Retrying PayMongo request (${retryCount + 1}/${this.maxRetries})...`);
          await this.delay(this.retryDelay * (retryCount + 1));
          return this.request(endpoint, options, retryCount + 1);
        }

        throw new ExternalServiceError("PayMongo", `${errorMessage} (Status: ${response.status})`);
      }

      logger.info(`PayMongo API Success: ${endpoint}`);
      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }

      // Network errors - retry
      if (retryCount < this.maxRetries) {
        logger.warn(`Network error, retrying (${retryCount + 1}/${this.maxRetries})...`);
        await this.delay(this.retryDelay * (retryCount + 1));
        return this.request(endpoint, options, retryCount + 1);
      }

      logger.error("PayMongo Network Error:", error);
      throw new ExternalServiceError("PayMongo", error.message);
    }
  }

  /**
   * Delay helper for retries
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create Payment Intent
   */
  async createPaymentIntent(amount, description, metadata = {}) {
    return this.request("/payment_intents", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount), // Ensure integer (centavos)
            payment_method_allowed: ["card", "gcash", "grab_pay", "paymaya", "qrph"],
            payment_method_options: {
              card: { request_three_d_secure: "automatic" }
            },
            currency: "PHP",
            capture_type: "automatic",
            description: description || "Payment",
            metadata
          },
        },
      }),
    });
  }

  /**
   * Retrieve Payment Intent
   */
  async retrievePaymentIntent(paymentIntentId) {
    return this.request(`/payment_intents/${paymentIntentId}`, {
      method: "GET",
    });
  }

  /**
   * Attach Payment Method to Intent
   */
  async attachPaymentMethod(paymentIntentId, paymentMethodId, returnUrl) {
    return this.request(`/payment_intents/${paymentIntentId}/attach`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            payment_method: paymentMethodId,
            return_url: returnUrl || process.env.PAYMENT_RETURN_URL || "http://localhost:3000/payment-success",
          },
        },
      }),
    });
  }

  /**
   * Create Payment Method (QR Ph, GCash, etc.)
   */
  async createPaymentMethod(type = "gcash", details = {}) {
    return this.request("/payment_methods", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            type,
            ...details
          },
        },
      }),
    });
  }

  /**
   * Create Source (for GCash, GrabPay)
   */
  async createSource(type, amount, redirectUrl) {
    return this.request("/sources", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            type,
            amount: Math.round(amount),
            currency: "PHP",
            redirect: {
              success: redirectUrl.success,
              failed: redirectUrl.failed,
            },
          },
        },
      }),
    });
  }

  /**
   * Create Refund
   */
  async createRefund(paymentId, amount, reason, metadata = {}) {
    return this.request("/refunds", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amount ? Math.round(amount) : undefined, // Partial or full refund
            payment_id: paymentId,
            reason: reason || "requested_by_customer",
            notes: metadata.notes,
            metadata
          },
        },
      }),
    });
  }

  /**
   * Retrieve Refund
   */
  async retrieveRefund(refundId) {
    return this.request(`/refunds/${refundId}`, {
      method: "GET",
    });
  }

  /**
   * Create Payout (for vendor withdrawals)
   */
  async createPayout(amount, destination, metadata = {}) {
    return this.request("/payouts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount),
            currency: "PHP",
            destination,
            metadata
          },
        },
      }),
    });
  }

  /**
   * Verify Webhook Signature
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      logger.warn("Webhook secret not configured, skipping verification");
      return true;
    }

    const crypto = require("crypto");
    const computedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest("hex");

    const isValid = computedSignature === signature;
    
    if (!isValid) {
      logger.error("Webhook signature verification failed");
    }

    return isValid;
  }

  /**
   * List Payment Intents (for reconciliation)
   */
  async listPaymentIntents(limit = 10) {
    return this.request(`/payment_intents?limit=${limit}`, {
      method: "GET",
    });
  }

  /**
   * Cancel Payment Intent
   */
  async cancelPaymentIntent(paymentIntentId, reason) {
    return this.request(`/payment_intents/${paymentIntentId}/cancel`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            reason: reason || "requested_by_customer"
          }
        }
      }),
    });
  }
}

// Export singleton instance
module.exports = new PayMongoClient();
