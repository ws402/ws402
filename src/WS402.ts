// src/WS402.ts
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  WS402Config,
  WS402Session,
  PaymentProvider,
  UsageUpdate,
  WS402Schema,
  RefundDetails,
} from './types';

/**
 * WS402 - WebSocket implementation of X402 protocol
 * Enables pay-as-you-go pricing for WebSocket resources with automatic refunds
 */
export class WS402 extends EventEmitter {
  private sessions: Map<WebSocket, WS402Session>;
  private config: Required<WS402Config>;
  private paymentProvider: PaymentProvider;

  constructor(config: WS402Config, paymentProvider: PaymentProvider) {
    super();
    
    this.sessions = new Map();
    this.paymentProvider = paymentProvider;
    
    // Set defaults
    this.config = {
      updateInterval: config.updateInterval || 3000,
      pricePerSecond: config.pricePerSecond || 1,
      currency: config.currency || 'wei',
      maxSessionDuration: config.maxSessionDuration || 3600,
      userIdExtractor: config.userIdExtractor || this.defaultUserIdExtractor,
      onPaymentVerified: config.onPaymentVerified || (() => {}),
      onRefundIssued: config.onRefundIssued || (() => {}),
      onSessionEnd: config.onSessionEnd || (() => {}),
    };
  }

  /**
   * Attach WS402 to a WebSocket server
   */
  attach(wss: WebSocket.Server): Map<string, WebSocket> {
    const userIdToWs = new Map<string, WebSocket>();
  
    wss.on('connection', async (ws: WebSocket, req: any) => {
      try {
        const userId = this.config.userIdExtractor(req);
        
        userIdToWs.set(userId, ws);
  
        ws.on('close', () => {
          userIdToWs.delete(userId);
        });
  
        await this.handleConnection(ws, req);
      } catch (error) {
        this.emit('error', error);
        ws.close(1011, 'Internal server error');
      }
    });
      return userIdToWs;
  }

  /**
   * Generate WS402 schema for initial HTTP response
   * @param pricePerSecond - Optional custom price per second, uses config default if not provided
   */
  generateSchema(resourceId: string, estimatedDuration: number, pricePerSecond?: number): WS402Schema {
    const price = pricePerSecond ?? this.config.pricePerSecond;
    const totalPrice = price * estimatedDuration;
    
    return {
      protocol: 'ws402',
      version: '0.1.2',
      resourceId,
      websocketEndpoint: `wss://your-server.com/ws402/${resourceId}`,
      pricing: {
        pricePerSecond: price,
        currency: this.config.currency,
        estimatedDuration,
        totalPrice,
      },
      paymentDetails: this.paymentProvider.generatePaymentDetails(totalPrice),
      maxSessionDuration: this.config.maxSessionDuration,
    };
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, req: any): Promise<void> {
    const userId = this.config.userIdExtractor(req);

    // Wait for payment proof
    const paymentProof = await this.waitForPaymentProof(ws);
    
    // Verify payment with provider
    const verification = await this.paymentProvider.verifyPayment(paymentProof);
    
    if (!verification.valid) {
      ws.send(JSON.stringify({
        type: 'payment_rejected',
        reason: verification.reason || 'Invalid payment',
      }));
      ws.close(1008, 'Payment verification failed');
      return;
    }

    // Create session with custom price if provided
    const session: WS402Session = {
      userId,
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      paidAmount: verification.amount,
      consumedAmount: 0,
      elapsedSeconds: 0,
      bytesTransferred: 0,
      messageCount: 0,
      status: 'active',
      paymentProof,
      pricePerSecond: this.config.pricePerSecond,
      _resourceId: req._resourceId, // Pass resourceId from request to session
    };

    this.sessions.set(ws, session);
    this.config.onPaymentVerified(session);

    // Send confirmation
    ws.send(JSON.stringify({
      type: 'session_started',
      sessionId: session.sessionId,
      balance: session.paidAmount,
      pricePerSecond: session.pricePerSecond,
    }));

    // Start usage tracking
    const interval = setInterval(() => {
      this.updateUsage(ws, session);
    }, this.config.updateInterval);

    // Handle messages (count bytes)
    ws.on('message', (data: WebSocket.Data) => {
      const byteLength = Buffer.byteLength(data.toString(), 'utf8');
      session.bytesTransferred += byteLength;
      session.messageCount++;
    });

    // Handle disconnection
    ws.on('close', () => {
      clearInterval(interval);
      this.endSession(ws, session);
    });

    ws.on('error', (error) => {
      clearInterval(interval);
      this.emit('error', error);
      this.endSession(ws, session);
    });
  }

  /**
   * Wait for client to send payment proof
   */
  private waitForPaymentProof(ws: WebSocket): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Payment proof timeout'));
      }, 30000); // 30 second timeout

      const handler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'payment_proof') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve(message.proof);
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      };

      ws.on('message', handler);
    });
  }

  /**
   * Update session usage and check limits
   */
  private updateUsage(ws: WebSocket, session: WS402Session): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    session.elapsedSeconds = Math.floor((now - session.startTime) / 1000);
    
    // Use session-specific price instead of global config
    session.consumedAmount = session.elapsedSeconds * session.pricePerSecond;

    const remaining = session.paidAmount - session.consumedAmount;

    // Send update to client
    const update: UsageUpdate = {
      type: 'usage_update',
      sessionId: session.sessionId,
      elapsedSeconds: session.elapsedSeconds,
      consumedAmount: session.consumedAmount,
      remainingBalance: remaining,
      bytesTransferred: session.bytesTransferred,
      messageCount: session.messageCount,
    };

    ws.send(JSON.stringify(update));

    // Check if balance exhausted
    if (remaining <= 0) {
      ws.send(JSON.stringify({
        type: 'balance_exhausted',
        message: 'Prepaid balance has been fully consumed',
      }));
      ws.close(1000, 'Balance exhausted');
    }

    // Check max duration
    if (session.elapsedSeconds >= this.config.maxSessionDuration) {
      ws.send(JSON.stringify({
        type: 'max_duration_reached',
        message: 'Maximum session duration reached',
      }));
      ws.close(1000, 'Max duration reached');
    }
  }

  /**
   * End session and issue refund
   */
  private async endSession(ws: WebSocket, session: WS402Session): Promise<void> {
    session.status = 'ended';
    
    const refundAmount = session.paidAmount - session.consumedAmount;

    if (refundAmount > 0) {
      try {
        const refund: RefundDetails = {
          sessionId: session.sessionId,
          amount: refundAmount,
          reason: 'unused_balance',
          timestamp: Date.now(),
        };

        await this.paymentProvider.issueRefund(session.paymentProof, refundAmount);
        
        this.config.onRefundIssued(session, refund);
        this.emit('refund', { session, refund });
      } catch (error) {
        this.emit('refund_error', { session, error });
      }
    }

    this.config.onSessionEnd(session);
    this.emit('session_end', session);
    this.sessions.delete(ws);
  }

  /**
   * Get active session by user ID
   */
  getSessionByUserId(userId: string): WS402Session | null {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): WS402Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Default user ID extractor from request
   */
  private defaultUserIdExtractor(req: any): string {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get('userId') || 'anonymous';
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `ws402_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}