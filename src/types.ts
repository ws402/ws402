// src/types.ts

/**
 * Configuration options for WS402
 */
export interface WS402Config {
  /** Interval in ms to send usage updates to client */
  updateInterval?: number;
  
  /** Price per second of resource usage (default fallback) */
  pricePerSecond?: number;
  
  /** Currency unit (e.g., 'wei', 'sat', 'usd') */
  currency?: string;
  
  /** Maximum session duration in seconds */
  maxSessionDuration?: number;
  
  /** Function to extract user ID from request */
  userIdExtractor?: (req: any) => string;
  
  /** Callback when payment is verified */
  onPaymentVerified?: (session: WS402Session) => void;
  
  /** Callback when refund is issued */
  onRefundIssued?: (session: WS402Session, refund: RefundDetails) => void;
  
  /** Callback when session ends */
  onSessionEnd?: (session: WS402Session) => void;
}

/**
 * Active WebSocket session
 */
export interface WS402Session {
  userId: string;
  sessionId: string;
  startTime: number;
  paidAmount: number;
  consumedAmount: number;
  elapsedSeconds: number;
  bytesTransferred: number;
  messageCount: number;
  status: 'active' | 'ended';
  paymentProof: any;
  
  /** Session-specific price per second (can differ from global config) */
  pricePerSecond: number;
  
  /** Optional: Resource ID associated with this session */
  _resourceId?: string;
}

/**
 * WS402 Schema sent to client via HTTP
 */
export interface WS402Schema {
  protocol: 'ws402';
  version: string;
  resourceId: string;
  websocketEndpoint: string;
  pricing: {
    pricePerSecond: number;
    currency: string;
    estimatedDuration: number;
    totalPrice: number;
  };
  paymentDetails: any;
  maxSessionDuration: number;
  
  /** Optional: Additional resource information */
  resourceInfo?: {
    name?: string;
    type?: string;
    estimatedTime?: number;
  };
}

/**
 * Usage update message sent to client
 */
export interface UsageUpdate {
  type: 'usage_update';
  sessionId: string;
  elapsedSeconds: number;
  consumedAmount: number;
  remainingBalance: number;
  bytesTransferred: number;
  messageCount: number;
}

/**
 * Refund details
 */
export interface RefundDetails {
  sessionId: string;
  amount: number;
  reason: string;
  timestamp: number;
}

/**
 * Payment provider interface - implement this for your payment system
 */
export interface PaymentProvider {
  /**
   * Generate payment details for the client
   * (e.g., wallet address, invoice, payment URL)
   */
  generatePaymentDetails(amount: number): any;
  
  /**
   * Verify that a payment proof is valid
   */
  verifyPayment(proof: any): Promise<PaymentVerification>;
  
  /**
   * Issue a refund to the user
   */
  issueRefund(proof: any, amount: number): Promise<void>;
}

/**
 * Payment verification result
 */
export interface PaymentVerification {
  valid: boolean;
  amount: number;
  reason?: string;
  
  /** Optional: Resource-specific price if payment verification includes it */
  pricePerSecond?: number;
}

/**
 * Express middleware options
 */
export interface WS402MiddlewareOptions {
  resourceIdExtractor?: (req: any) => string;
  estimatedDurationExtractor?: (req: any) => number;
  pricePerSecondExtractor?: (req: any) => number;
  schemaEndpoint?: string;
}