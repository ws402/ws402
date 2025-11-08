// src/providers/SolanaPaymentProvider.ts
import { PaymentProvider, PaymentVerification } from '../types';
import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  Keypair,
} from '@solana/web3.js';
import { encodeURL, createQR } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { webcrypto } from 'crypto';

export interface SolanaPaymentProviderConfig {
  /** Solana RPC endpoint URL */
  rpcEndpoint: string;
  
  /** Merchant wallet address to receive payments */
  merchantWallet: string;
  
  /** Merchant private key for refunds (optional - array of numbers from wallet JSON) */
  merchantPrivateKey?: number[];
  
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
  
  /** Enable automatic refunds (requires merchantPrivateKey) */
  autoRefund?: boolean;
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
  private merchantKeypair: Keypair | null;
  private config: Required<Omit<SolanaPaymentProviderConfig, 'splToken' | 'merchantPrivateKey'>> & { 
    splToken?: string;
    autoRefund: boolean;
  };
  private pendingPayments: Map<string, {
    amount: number;
    amountSOL: BigNumber;
    timestamp: number;
    recipient: PublicKey;
  }>;

  constructor(config: SolanaPaymentProviderConfig) {
    this.connection = new Connection(config.rpcEndpoint, 'confirmed');
    this.merchantWallet = new PublicKey(config.merchantWallet);
    
    // Initialize keypair if private key provided
    this.merchantKeypair = null;
    if (config.merchantPrivateKey && config.merchantPrivateKey.length === 64) {
      try {
        this.merchantKeypair = Keypair.fromSecretKey(Uint8Array.from(config.merchantPrivateKey));
        this.log('Merchant keypair loaded - automatic refunds enabled');
      } catch (error: any) {
        this.log('Warning: Failed to load merchant keypair', error.message);
      }
    }
    
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
      autoRefund: config.autoRefund !== false && this.merchantKeypair !== null, // Enable by default if keypair available
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

      // Fetch transaction from blockchain with retries
      this.log('Fetching transaction from blockchain...', { signature });
      
      let tx: ParsedTransactionWithMeta | null = null;
      const maxRetries = 10;
      const retryDelay = 2000; // 2 seconds
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          tx = await this.connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          });
          
          if (tx) {
            this.log('Transaction found on blockchain', { attempt: i + 1 });
            break;
          }
          
          // Transaction not found yet, wait and retry
          if (i < maxRetries - 1) {
            this.log(`Transaction not found yet, retrying... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        } catch (error: any) {
          this.log('Error fetching transaction', { attempt: i + 1, error: error.message });
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }

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

      // Validate sender wallet address
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(senderWallet);
      } catch (error) {
        throw new Error(`Invalid sender wallet address: ${senderWallet}`);
      }

      this.log('Issuing Solana refund', {
        amount,
        recipient: senderWallet,
        originalTx: signature,
      });

      // Convert refund amount to lamports
      const refundSOL = new BigNumber(amount)
        .dividedBy(this.config.conversionRate)
        .dividedBy(LAMPORTS_PER_SOL);

      const lamports = Math.floor(refundSOL.multipliedBy(LAMPORTS_PER_SOL).toNumber());

      // Check if amount is too small
      if (lamports < 1) {
        this.log('Refund amount too small, skipping', { lamports });
        return;
      }

      this.log('Refund calculated', {
        amount,
        refundSOL: refundSOL.toString(),
        lamports,
      });

      // Check if auto-refund is enabled and keypair is available
      if (!this.config.autoRefund || !this.merchantKeypair) {
        this.log('⚠️  Auto-refund disabled or keypair not available', {
          autoRefund: this.config.autoRefund,
          hasKeypair: this.merchantKeypair !== null,
        });
        this.log('Refund prepared but not sent', {
          to: senderWallet,
          amount: lamports,
          memo: `WS402 Refund - Original TX: ${signature?.slice(0, 20)}...`,
        });
        return;
      }

      // Check merchant balance
      const merchantBalance = await this.connection.getBalance(this.merchantWallet);
      const minBalance = 5000; // Keep 5000 lamports (0.000005 SOL) for rent
      
      if (merchantBalance < lamports + minBalance) {
        throw new Error(
          `Insufficient merchant balance. Need ${lamports + minBalance} lamports, have ${merchantBalance} lamports`
        );
      }

      // Create refund transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.merchantWallet,
          toPubkey: recipientPubkey,
          lamports,
        })
      );

      // Add memo if original signature exists
      if (signature) {
        const memoData = Buffer.from(`WS402 Refund: ${signature.slice(0, 20)}...`, 'utf-8');
        // Note: For production, you might want to use SPL Memo program
        // For now, we'll keep it simple
      }

      this.log('Sending refund transaction...', {
        from: this.merchantWallet.toBase58(),
        to: recipientPubkey.toBase58(),
        lamports,
      });

      // Send transaction (don't use sendAndConfirmTransaction - it needs WebSocket)
      const txSignature = await this.connection.sendTransaction(
        transaction,
        [this.merchantKeypair],
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );

      this.log('📤 Refund transaction sent', { signature: txSignature });

      // Manually confirm using polling (Alchemy doesn't support WebSocket subscriptions)
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds
      let confirmed = false;

      while (!confirmed && (Date.now() - startTime) < timeout) {
        try {
          const status = await this.connection.getSignatureStatus(txSignature);
          
          if (status?.value?.confirmationStatus === 'confirmed' || 
              status?.value?.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
          
          if (status?.value?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
          }
          
          // Wait 2 seconds before next check
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          // Continue trying
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!confirmed) {
        this.log('⚠️  Refund sent but confirmation timeout. Check explorer:', {
          signature: txSignature,
          explorer: `https://solscan.io/tx/${txSignature}${this.config.network !== 'mainnet-beta' ? '?cluster=' + this.config.network : ''}`,
        });
      } else {
        this.log('✅ Refund transaction confirmed', {
          signature: txSignature,
          amount: lamports,
          amountSOL: refundSOL.toString(),
          recipient: senderWallet,
          explorer: `https://solscan.io/tx/${txSignature}${this.config.network !== 'mainnet-beta' ? '?cluster=' + this.config.network : ''}`,
        });
      }

    } catch (error: any) {
      this.log('❌ Refund error', error.message);
      
      // Don't throw error to prevent session cleanup from failing
      // Log the error but allow the session to end gracefully
      if (error.message.includes('Insufficient')) {
        this.log('⚠️  Merchant wallet has insufficient balance for refund');
      } else if (error.message.includes('Invalid')) {
        this.log('⚠️  Invalid wallet address for refund');
      } else {
        this.log('⚠️  Refund failed, may need manual processing', {
          error: error.message,
          stack: error.stack,
        });
      }
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
    
    // Use webcrypto for Node.js compatibility
    if (typeof webcrypto !== 'undefined' && webcrypto.getRandomValues) {
      webcrypto.getRandomValues(array);
    } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback to random bytes
      for (let i = 0; i < 32; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    
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
      autoRefundEnabled: this.config.autoRefund,
      hasKeypair: this.merchantKeypair !== null,
    };
  }
}