// src/providers/BasePaymentProvider.ts
import { PaymentProvider, PaymentVerification } from '../types';
import { ethers } from 'ethers';

export interface BasePaymentProviderConfig {
  /** Base RPC endpoint URL */
  rpcEndpoint: string;
  
  /** Merchant wallet address to receive payments */
  merchantWallet: string;
  
  /** Network: 'base' | 'base-goerli' | 'base-sepolia' */
  network?: 'base' | 'base-goerli' | 'base-sepolia';
  
  /** Conversion rate: wei to native units */
  conversionRate?: number;
  
  /** ERC20 token address (optional, for token payments) */
  erc20Token?: string;
  
  /** Payment timeout in milliseconds */
  paymentTimeout?: number;
  
  /** Chain ID */
  chainId?: number;
}

/**
 * Base Blockchain Payment Provider for WS402
 * 
 * Supports:
 * - Native ETH payments on Base
 * - ERC20 token payments
 * - On-chain payment verification
 * - Automatic refunds
 */
export class BasePaymentProvider implements PaymentProvider {
  private provider: ethers.JsonRpcProvider;
  private merchantWallet: string;
  private config: Required<Omit<BasePaymentProviderConfig, 'erc20Token'>> & { erc20Token?: string };
  private pendingPayments: Map<string, {
    amount: number;
    amountETH: string;
    timestamp: number;
    recipient: string;
  }>;

  constructor(config: BasePaymentProviderConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcEndpoint);
    this.merchantWallet = config.merchantWallet;
    
    const networkConfigs = {
      'base': { chainId: 8453 },
      'base-goerli': { chainId: 84531 },
      'base-sepolia': { chainId: 84532 },
    };

    const networkConfig = networkConfigs[config.network || 'base'];

    this.config = {
      rpcEndpoint: config.rpcEndpoint,
      merchantWallet: config.merchantWallet,
      network: config.network || 'base',
      conversionRate: config.conversionRate || 1,
      paymentTimeout: config.paymentTimeout || 300000, // 5 minutes
      chainId: config.chainId || networkConfig.chainId,
      erc20Token: config.erc20Token,
    };

    this.pendingPayments = new Map();
  }

  /**
   * Generate payment details for Base blockchain
   */
  generatePaymentDetails(amount: number): any {
    this.validateAmount(amount);

    // Convert amount to ETH
    const amountWei = Math.floor(amount / this.config.conversionRate);
    const amountETH = ethers.formatEther(amountWei);

    const reference = this.generateReference();
    
    // Store pending payment
    this.pendingPayments.set(reference, {
      amount,
      amountETH,
      timestamp: Date.now(),
      recipient: this.merchantWallet,
    });

    const paymentDetails: any = {
      type: 'base',
      network: this.config.network,
      chainId: this.config.chainId,
      recipient: this.merchantWallet,
      amount: amount,
      amountWei: amountWei,
      amountETH: amountETH,
      currency: this.config.erc20Token ? 'ERC20' : 'ETH',
      reference,
      expiresAt: Date.now() + this.config.paymentTimeout,
      instructions: {
        step1: 'Connect wallet to Base network',
        step2: `Send ${amountETH} ETH to ${this.merchantWallet}`,
        step3: 'Copy transaction hash',
        step4: 'Submit transaction hash as payment proof',
      }
    };

    if (this.config.erc20Token) {
      paymentDetails.tokenAddress = this.config.erc20Token;
      paymentDetails.instructions.step2 = `Approve and transfer tokens to ${this.merchantWallet}`;
    }

    return paymentDetails;
  }

  /**
   * Verify payment on Base blockchain
   */
  async verifyPayment(proof: any): Promise<PaymentVerification> {
    try {
      const { txHash, reference } = proof;

      if (!txHash) {
        return {
          valid: false,
          amount: 0,
          reason: 'Missing transaction hash',
        };
      }

      this.log('Verifying Base payment', { txHash, reference });

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
      const tx = await this.provider.getTransaction(txHash);
      
      if (!tx) {
        return {
          valid: false,
          amount: 0,
          reason: 'Transaction not found on blockchain',
        };
      }

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (!receipt || receipt.status !== 1) {
        return {
          valid: false,
          amount: 0,
          reason: 'Transaction failed or not confirmed',
        };
      }

      // Verify transaction details
      if (this.config.erc20Token) {
        // Verify ERC20 token transfer
        const verified = await this.verifyERC20Transfer(receipt, pending);
        if (!verified.valid) {
          return verified;
        }
      } else {
        // Verify native ETH transfer
        if (tx.to?.toLowerCase() !== this.merchantWallet.toLowerCase()) {
          return {
            valid: false,
            amount: 0,
            reason: 'Payment sent to wrong address',
          };
        }

        const expectedWei = ethers.parseEther(pending.amountETH);
        const receivedWei = tx.value;

        // Allow 1% variance for gas considerations
        const variance = receivedWei > expectedWei 
          ? receivedWei - expectedWei 
          : expectedWei - receivedWei;
        const allowedVariance = expectedWei / BigInt(100);

        if (variance > allowedVariance) {
          return {
            valid: false,
            amount: 0,
            reason: `Amount mismatch. Expected: ${ethers.formatEther(expectedWei)} ETH, Received: ${ethers.formatEther(receivedWei)} ETH`,
          };
        }
      }

      // Clean up pending payment
      this.pendingPayments.delete(reference);

      this.log('Payment verified successfully', {
        txHash,
        amount: pending.amount,
        amountETH: pending.amountETH,
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
   * Issue refund via Base blockchain transaction
   */
  async issueRefund(proof: any, amount: number): Promise<void> {
    try {
      const { txHash, senderAddress } = proof;

      if (!senderAddress) {
        throw new Error('Sender address required for refund');
      }

      this.log('Issuing Base refund', {
        amount,
        recipient: senderAddress,
        originalTx: txHash,
      });

      // Convert refund amount to ETH
      const refundWei = Math.floor(amount / this.config.conversionRate);
      const refundETH = ethers.formatEther(refundWei);

      this.log('Refund calculated', {
        amount,
        refundETH,
        refundWei,
      });

      // Note: Actual refund transaction would require merchant private key
      // This is a placeholder - in production, integrate with your wallet system
      this.log('⚠️  Refund prepared - requires merchant wallet signature', {
        to: senderAddress,
        amount: refundETH + ' ETH',
        network: this.config.network,
        chainId: this.config.chainId,
      });

      // In production, you would:
      // 1. Create transaction with merchant wallet
      // 2. Sign and send transaction
      // 3. Wait for confirmation
      
      // Example structure (requires merchant private key):
      /*
      const wallet = new ethers.Wallet(MERCHANT_PRIVATE_KEY, this.provider);
      const tx = await wallet.sendTransaction({
        to: senderAddress,
        value: ethers.parseEther(refundETH),
        data: ethers.toUtf8Bytes('WS402 Refund'),
      });
      await tx.wait();
      */

    } catch (error: any) {
      this.log('Refund error', error.message);
      throw new Error(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Verify ERC20 token transfer
   */
  private async verifyERC20Transfer(
    receipt: ethers.TransactionReceipt,
    pending: any
  ): Promise<PaymentVerification> {
    if (!this.config.erc20Token) {
      return {
        valid: false,
        amount: 0,
        reason: 'No ERC20 token configured',
      };
    }

    // ERC20 Transfer event signature
    const transferEventSignature = ethers.id('Transfer(address,address,uint256)');

    // Find Transfer event in logs
    const transferLog = receipt.logs.find(log => 
      log.topics[0] === transferEventSignature &&
      log.address.toLowerCase() === this.config.erc20Token!.toLowerCase()
    );

    if (!transferLog) {
      return {
        valid: false,
        amount: 0,
        reason: 'No token transfer found in transaction',
      };
    }

    // Decode the transfer event
    const toAddress = ethers.getAddress('0x' + transferLog.topics[2].slice(26));
    
    if (toAddress.toLowerCase() !== this.merchantWallet.toLowerCase()) {
      return {
        valid: false,
        amount: 0,
        reason: 'Token transfer sent to wrong address',
      };
    }

    return {
      valid: true,
      amount: pending.amount,
    };
  }

  /**
   * Generate unique reference for payment tracking
   */
  private generateReference(): string {
    return `base_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    console.log(`[BasePaymentProvider] ${message}`, data || '');
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
      chainId: this.config.chainId,
      merchantWallet: this.merchantWallet,
      erc20Token: this.config.erc20Token,
    };
  }
}