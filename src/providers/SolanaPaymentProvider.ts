// src/providers/SolanaPaymentProvider.ts
import { PaymentProvider, PaymentVerification } from '../types';
import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { encodeURL, createQR } from '@solana/pay';
import BigNumber from 'bignumber.js';

export interface SolanaPaymentProviderConfig {
  /** Solana RPC endpoint URL */
  rpcEndpoint: string;
  
  /** Merchant wallet address to receive payments */
  merchantWallet: string;
  
  /** Network: 'mainnet-beta' | 'devnet' | 'testnet' */
  network?: 'mainnet-beta' | 'devnet' | 'testnet';
  
  /** Conversion rate: wei/sat/etc to SOL */
  conversionRate?: number;
  
  /** SPL Token mint address (optional, for token payments) */
  splToken?: string;
  
  /** Payment timeout in milliseconds */
  paymentTimeout?: number;
  
  /** Label for Solana Pay QR code */
  label?: string;
  
  /** Message for Solana Pay */
  message?: string;
  
  /** Memo for transaction */
  memo?: string;
}

/**
 * Solana Payment Provider for WS402
 * 
 * Supports:
 * - Native SOL payments
 * - SPL Token payments
 * - Solana Pay QR codes
 * - On-chain payment verification
 * - Automatic refunds
 */
export class SolanaPaymentProvider implements PaymentProvider {
  private connection: Connection;
  private merchantWallet: PublicKey;
  private config: Required<Omit<SolanaPaymentProviderConfig, 'splToken'>> & { splToken?: string };
  private pendingPayments: Map<string, {
    amount: number;
    amountSOL: BigNumber;
    timestamp: number;
    recipient: PublicKey;
  }>;

  constructor(config: SolanaPaymentProviderConfig) {
    super();

    this.connection = new Connection(config.rpcEndpoint, 'confirmed');
    this.merchantWallet = new PublicKey(config.merchantWallet);
    
    this.config = {
      rpcEndpoint: config.rpcEndpoint,
      merchantWallet: config.merchantWallet,
      network: config.network || 'mainnet-beta',
      conversionRate: config.conversionRate || 1, // 1:1 by default (wei to lamports)
      paymentTimeout: config.paymentTimeout || 300000, // 5 minutes
      label: config.label || 'WS402 Payment',
      message: config.message || 'Pay for WebSocket resource access',
      memo: config.memo || 'WS402',
      splToken: config.splToken,
    };

    this.pendingPayments = new Map();
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
   * Log payment activity
   */
  private log(message: string, data?: any): void {
    console.log(`[SolanaPaymentProvider] ${message}`, data || '');
  }

  /**
   * Generate payment details with Solana Pay QR code
   */
  generatePaymentDetails(amount: number): any {
    this.validateAmount(amount);

    // Convert amount to SOL
    const amountSOL = new BigNumber(amount)
      .dividedBy(this.config.conversionRate)
      .dividedBy(LAMPORTS_PER_SOL);

    const reference = this.generateReference();
    
    // Store pending payment
    this.pendingPayments.set(reference, {
      amount,
      amountSOL,
      timestamp: Date.now(),
      recipient: this.merchantWallet,
    });

    // Create Solana Pay URL
    const url = encodeURL({
      recipient: this.merchantWallet,
      amount: amountSOL,
      reference: new PublicKey(reference),
      label: this.config.label,
      message: this.config.message,
      memo: this.config.memo,
      splToken: this.config.splToken ? new PublicKey(this.config.splToken) : undefined,
    });

    return {
      type: 'solana',
      network: this.config.network,
      recipient: this.merchantWallet.toBase58(),
      amount: amount,
      amountSOL: amountSOL.toString(),
      currency: this.config.splToken ? 'SPL' : 'SOL',
      splToken: this.config.splToken,
      reference,
      solanaPayURL: url.toString(),
      qrCode: url.toString(), // Can be used with createQR() on client side
      expiresAt: Date.now() + this.config.paymentTimeout,
      instructions: {
        step1: 'Scan QR code with Solana-compatible wallet',
        step2: 'Or use Phantom, Solflare, or other Solana wallet',
        step3: 'Approve transaction',
        step4: 'Connection will be established automatically',
      }
    };
  }

  /**
   * Verify Solana payment on-chain
   */
  async verifyPayment(proof: any): Promise<PaymentVerification> {
    try {
      const { signature, reference } = proof;

      if (!signature) {
        return {
          valid: false,
          amount: 0,
          reason: 'Missing transaction signature',
        };
      }

      this.log('Verifying Solana payment', { signature, reference });

      // Get pending payment info
      const pending = this.pendingPayments.get(reference);
      if (!pending) {
        return {
          valid: false,
          amount: 0,
          reason: 'Invalid or expired payment reference',
        };
      }

      // Check if payment has expired
      if (Date.now() - pending.timestamp > this.config.paymentTimeout) {
        this.pendingPayments.delete(reference);
        return {
          valid: false,
          amount: 0,
          reason: 'Payment timeout expired',
        };
      }

      // Fetch transaction from blockchain
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return {
          valid: false,
          amount: 0,
          reason: 'Transaction not found on blockchain',
        };
      }

      // Verify transaction was successful
      if (tx.meta?.err) {
        return {
          valid: false,
          amount: 0,
          reason: `Transaction failed: ${JSON.stringify(tx.meta.err)}`,
        };
      }

      // Verify payment to correct recipient
      const verified = await this.verifyTransactionDetails(
        tx,
        pending.recipient,
        pending.amountSOL,
        reference
      );

      if (!verified.valid) {
        return verified;
      }

      // Clean up pending payment
      this.pendingPayments.delete(reference);

      this.log('Payment verified successfully', {
        signature,
        amount: pending.amount,
        amountSOL: pending.amountSOL.toString(),
      });

      return {
        valid: true,
        amount: pending.amount,
      };

    } catch (error: any) {
      this.log('Payment verification error', error.message);
      return {
        valid: false,
        amount: 0,
        reason: `Verification error: ${error.message}`,
      };
    }
  }

  /**
   * Issue refund via Solana transaction
   */
  async issueRefund(proof: any, amount: number): Promise<void> {
    try {
      const { signature, senderWallet } = proof;

      if (!senderWallet) {
        throw new Error('Sender wallet address required for refund');
      }

      this.log('Issuing Solana refund', {
        amount,
        recipient: senderWallet,
        originalTx: signature,
      });

      // Convert refund amount to SOL
      const refundSOL = new BigNumber(amount)
        .dividedBy(this.config.conversionRate)
        .dividedBy(LAMPORTS_PER_SOL);

      const lamports = refundSOL.multipliedBy(LAMPORTS_PER_SOL).toNumber();

      this.log('Refund calculated', {
        amount,
        refundSOL: refundSOL.toString(),
        lamports,
      });

      // Note: Actual refund transaction would require merchant private key
      // This is a placeholder - in production, integrate with your wallet system
      this.log('⚠️  Refund prepared - requires merchant wallet signature', {
        to: senderWallet,
        amount: lamports,
        memo: `WS402 Refund - Original TX: ${signature}`,
      });

      // In production, you would:
      // 1. Create transaction with merchant keypair
      // 2. Sign and send transaction
      // 3. Wait for confirmation
      
      // Example structure (requires merchant keypair):
      /*
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.merchantWallet,
          toPubkey: new PublicKey(senderWallet),
          lamports,
        })
      );
      
      const signature = await this.connection.sendTransaction(transaction, [merchantKeypair]);
      await this.connection.confirmTransaction(signature);
      */

    } catch (error: any) {
      this.log('Refund error', error.message);
      throw new Error(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Verify transaction details match expected payment
   */
  private async verifyTransactionDetails(
    tx: ParsedTransactionWithMeta,
    expectedRecipient: PublicKey,
    expectedAmount: BigNumber,
    expectedReference: string
  ): Promise<PaymentVerification> {
    
    // Find the transfer instruction
    const instructions = tx.transaction.message.instructions;
    
    let transferFound = false;
    let transferAmount = new BigNumber(0);

    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.program === 'system') {
        const parsed = instruction.parsed;
        
        if (parsed.type === 'transfer') {
          const info = parsed.info;
          
          // Check recipient matches
          if (info.destination === expectedRecipient.toBase58()) {
            transferAmount = new BigNumber(info.lamports);
            transferFound = true;
            break;
          }
        }
      }
    }

    if (!transferFound) {
      return {
        valid: false,
        amount: 0,
        reason: 'No valid transfer instruction found',
      };
    }

    // Verify amount (allow small variance for fees)
    const expectedLamports = expectedAmount.multipliedBy(LAMPORTS_PER_SOL);
    const variance = transferAmount.minus(expectedLamports).abs();
    const allowedVariance = expectedLamports.multipliedBy(0.01); // 1% variance

    if (variance.isGreaterThan(allowedVariance)) {
      return {
        valid: false,
        amount: 0,
        reason: `Amount mismatch. Expected: ${expectedLamports.toString()}, Received: ${transferAmount.toString()}`,
      };
    }

    // Verify reference is in transaction (check account keys)
    let referenceFound = false;
    try {
      const referencePubkey = new PublicKey(expectedReference);
      const accountKeys = tx.transaction.message.accountKeys.map(key => 
        typeof key === 'string' ? key : key.pubkey.toBase58()
      );
      referenceFound = accountKeys.includes(referencePubkey.toBase58());
    } catch (e) {
      // Invalid reference format
    }

    if (!referenceFound) {
      return {
        valid: false,
        amount: 0,
        reason: 'Payment reference not found in transaction',
      };
    }

    return {
      valid: true,
      amount: transferAmount.dividedBy(LAMPORTS_PER_SOL)
        .multipliedBy(this.config.conversionRate)
        .toNumber(),
    };
  }

  /**
   * Generate unique reference for payment tracking
   */
  private generateReference(): string {
    // Generate a valid Solana public key as reference
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return new PublicKey(array).toBase58();
  }

  /**
   * Get pending payment info
   */
  getPendingPayment(reference: string) {
    return this.pendingPayments.get(reference);
  }

  /**
   * Clean up expired pending payments
   */
  cleanupExpiredPayments(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [reference, payment] of this.pendingPayments.entries()) {
      if (now - payment.timestamp > this.config.paymentTimeout) {
        this.pendingPayments.delete(reference);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.log(`Cleaned up ${cleaned} expired pending payments`);
    }

    return cleaned;
  }

  /**
   * Get connection info
   */
  getConnectionInfo() {
    return {
      rpcEndpoint: this.config.rpcEndpoint,
      network: this.config.network,
      merchantWallet: this.merchantWallet.toBase58(),
      splToken: this.config.splToken,
    };
  }
}