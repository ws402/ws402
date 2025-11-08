// src/providers/ProxyPaymentProvider.ts
import { PaymentProvider, PaymentVerification } from '../types';

export interface ProxyPaymentProviderConfig {
  /** Payment gateway server URL */
  gatewayUrl: string;
  
  /** API key for authentication with gateway */
  apiKey: string;
  
  /** Request timeout in milliseconds */
  timeout?: number;
  
  /** Retry failed requests */
  retryAttempts?: number;
  
  /** Custom headers to send with requests */
  customHeaders?: Record<string, string>;
}

/**
 * Proxy Payment Provider for WS402
 * 
 * Delegates all payment operations to a centralized gateway server.
 * The gateway handles:
 * - Payment verification on blockchain
 * - Refund processing (has private keys)
 * - Centralized logging and auditing
 * 
 * Benefits:
 * - No private keys on WS402 servers
 * - Multiple WS402 servers can share one gateway
 * - Centralized payment logic and security
 * - Easier compliance and auditing
 */
export class ProxyPaymentProvider implements PaymentProvider {
  private config: Required<Omit<ProxyPaymentProviderConfig, 'customHeaders'>> & {
    customHeaders?: Record<string, string>;
  };

  constructor(config: ProxyPaymentProviderConfig) {
    this.config = {
      gatewayUrl: config.gatewayUrl.replace(/\/$/, ''), // Remove trailing slash
      apiKey: config.apiKey,
      timeout: config.timeout || 30000, // 30 seconds
      retryAttempts: config.retryAttempts || 3,
      customHeaders: config.customHeaders,
    };

    this.log('✅ ProxyPaymentProvider initialized');
    this.log(`   Gateway: ${this.config.gatewayUrl}`);
  }

  /**
   * Generate payment details by requesting from gateway
   */
  generatePaymentDetails(amount: number): any {
    this.validateAmount(amount);

    // For synchronous generation, we return a structure that includes
    // instructions to call the gateway. The actual payment details
    // should be fetched from the gateway in the HTTP schema endpoint.
    return {
      type: 'proxy',
      amount,
      gatewayUrl: this.config.gatewayUrl,
      instructions: {
        step1: 'Payment details will be fetched from gateway',
        step2: 'Use /ws402/schema endpoint to get blockchain payment details',
      }
    };
  }

  /**
   * Request payment details from gateway (async version for HTTP endpoints)
   */
  async requestPaymentDetails(amount: number, resourceId: string, estimatedDuration: number): Promise<any> {
    this.validateAmount(amount);

    const endpoint = `${this.config.gatewayUrl}/api/payment/generate`;
    
    this.log('📤 Requesting payment details from gateway', {
      amount,
      resourceId,
      estimatedDuration,
    });

    try {
      const response = await this.makeRequest(endpoint, 'POST', {
        amount,
        resourceId,
        estimatedDuration,
      });

      this.log('✅ Payment details received from gateway');
      return response;

    } catch (error: any) {
      this.log('❌ Failed to get payment details:', error.message);
      throw new Error(`Gateway error: ${error.message}`);
    }
  }

  /**
   * Verify payment by delegating to gateway
   */
  async verifyPayment(proof: any): Promise<PaymentVerification> {
    const endpoint = `${this.config.gatewayUrl}/api/payment/verify`;
    
    this.log('📤 Sending payment verification to gateway', {
      proofType: proof.type || 'unknown',
    });

    try {
      const response = await this.makeRequest(endpoint, 'POST', {
        proof,
        timestamp: Date.now(),
      });

      this.log('✅ Payment verification response received', {
        valid: response.valid,
        amount: response.amount,
      });

      return {
        valid: response.valid,
        amount: response.amount,
        reason: response.reason,
      };

    } catch (error: any) {
      this.log('❌ Payment verification failed:', error.message);
      return {
        valid: false,
        amount: 0,
        reason: `Gateway error: ${error.message}`,
      };
    }
  }

  /**
   * Issue refund by delegating to gateway
   */
  async issueRefund(proof: any, amount: number): Promise<void> {
    const endpoint = `${this.config.gatewayUrl}/api/payment/refund`;
    
    this.log('📤 Requesting refund from gateway', {
      amount,
    });

    try {
      const response = await this.makeRequest(endpoint, 'POST', {
        proof,
        amount,
        timestamp: Date.now(),
      });

      this.log('✅ Refund processed by gateway', {
        txHash: response.txHash,
        status: response.status,
      });

    } catch (error: any) {
      this.log('❌ Refund failed:', error.message);
      throw new Error(`Gateway refund error: ${error.message}`);
    }
  }

  /**
   * Make HTTP request to gateway with retry logic
   */
  private async makeRequest(
    url: string,
    method: 'GET' | 'POST' | 'PUT' = 'POST',
    body?: any,
    attempt: number = 1
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-WS402-Provider': 'proxy',
        ...this.config.customHeaders,
      };

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(
          errorData.message || 
          `Gateway returned ${response.status}: ${response.statusText}`
        );
      }

      return await response.json();

    } catch (error: any) {
      clearTimeout(timeoutId);

      // Retry on network errors
      if (attempt < this.config.retryAttempts && this.isRetryableError(error)) {
        this.log(`⚠️  Request failed, retrying (${attempt}/${this.config.retryAttempts})...`);
        await this.delay(1000 * attempt); // Exponential backoff
        return this.makeRequest(url, method, body, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, 5xx errors
    return (
      error.name === 'AbortError' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.message.includes('500') ||
      error.message.includes('502') ||
      error.message.includes('503') ||
      error.message.includes('504')
    );
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate amount is positive
   */
  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
  }

  /**
   * Log activity
   */
  private log(message: string, data?: any): void {
    console.log(`[ProxyPaymentProvider] ${message}`, data || '');
  }

  /**
   * Get gateway info
   */
  getGatewayInfo() {
    return {
      gatewayUrl: this.config.gatewayUrl,
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
    };
  }

  /**
   * Health check - ping gateway
   */
  async healthCheck(): Promise<boolean> {
    const endpoint = `${this.config.gatewayUrl}/api/health`;
    
    try {
      const response = await this.makeRequest(endpoint, 'GET');
      return response.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}