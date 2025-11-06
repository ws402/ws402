// src/providers/MockPaymentProvider.ts
import { PaymentProvider, PaymentVerification } from '../types';

/**
 * Mock payment provider for testing and development
 * Replace with real payment provider in production
 */
export class MockPaymentProvider implements PaymentProvider {
  private payments: Map<string, number> = new Map();

  generatePaymentDetails(amount: number): any {
    const invoiceId = `mock_invoice_${Date.now()}`;
    
    return {
      provider: 'mock',
      invoiceId,
      amount,
      currency: 'MOCK',
      paymentAddress: '0xMOCK_ADDRESS',
      instructions: 'This is a mock payment. In production, replace with real payment provider.',
    };
  }

  async verifyPayment(proof: any): Promise<PaymentVerification> {
    // Simulate async verification
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock verification - always succeeds with proof amount
    if (proof && proof.amount) {
      this.payments.set(proof.txId || 'mock_tx', proof.amount);
      
      return {
        valid: true,
        amount: proof.amount,
      };
    }

    return {
      valid: false,
      amount: 0,
      reason: 'Invalid payment proof',
    };
  }

  async issueRefund(proof: any, amount: number): Promise<void> {
    // Simulate async refund
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`[MockPaymentProvider] Refund issued: ${amount} to ${proof.userId || 'unknown'}`);
  }

  // Helper for testing
  getPaymentHistory(): Array<[string, number]> {
    return Array.from(this.payments.entries());
  }
}
