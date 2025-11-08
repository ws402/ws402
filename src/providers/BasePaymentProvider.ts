// src/providers/BasePaymentProvider.ts
import { PaymentProvider, PaymentVerification } from '../types';
import { ethers } from 'ethers';

export interface BasePaymentProviderConfig {
  /** Base RPC endpoint URL */
  rpcEndpoint: string;
  
  /** Merchant wallet address to receive payments */
  merchantWallet: string;
  
  /** Merchant private key for signing refund transactions */
  merchantPrivateKey?: string;
  
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
  
  /** Enable automatic refunds (requires merchantPrivateKey) */
  autoRefund?: boolean;
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
  private wallet?: ethers.Wallet;
  private config: Required<Omit<BasePaymentProviderConfig, 'erc20Token' | 'merchantPrivateKey'>> & { 
    erc20Token?: string;
    merchantPrivateKey?: string;
  };
  private pendingPayments: Map<string, {
    amount: number;
    amountETH: string;
    timestamp: number;
    recipient: string;
  }>;

  constructor(config: BasePaymentProviderConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcEndpoint);
    this.merchantWallet = config.merchantWallet;
    
    // Initialize wallet if private key is provided
    if (config.merchantPrivateKey) {
      try {
        this.wallet = new ethers.Wallet(config.merchantPrivateKey, this.provider);
        this.log('✅ Wallet initialized with private key - refunds enabled');
        
        // Verify wallet address matches merchant wallet
        if (this.wallet.address.toLowerCase() !== config.merchantWallet.toLowerCase()) {
          this.log('⚠️  WARNING: Private key address does not match merchant wallet!');
          this.log(`   Private key: ${this.wallet.address}`);
          this.log(`   Merchant wallet: ${config.merchantWallet}`);
        }
        
        // Check wallet balance
        this.checkWalletBalance();
      } catch (error: any) {
        this.log('❌ Failed to initialize wallet:', error.message);
        throw new Error('Invalid merchant private key');
      }
    } else {
      this.log('⚠️  No private key provided - refunds will not be automatic');
    }
    
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
      autoRefund: config.autoRefund !== false, // Default true
      erc20Token: config.erc20Token,
      merchantPrivateKey: config.merchantPrivateKey,
    };

    this.pendingPayments = new Map();
  }

  /**
   * Check merchant wallet balance
   */
  private async checkWalletBalance(): Promise<void> {
    if (!this.wallet) return;
    
    try {
      const balance = await this.provider.getBalance(this.wallet.address);
      const balanceETH = ethers.formatEther(balance);
      
      this.log('💰 Merchant wallet balance:', {
        address: this.wallet.address,
        balance: balanceETH + ' ETH',
      });
      
      // Warn if balance is low
      const minBalance = ethers.parseEther('0.001'); // 0.001 ETH minimum recommended
      if (balance < minBalance) {
        this.log('⚠️  WARNING: Low merchant wallet balance!');
        this.log(`   Current: ${balanceETH} ETH`);
        this.log(`   Recommended minimum: 0.001 ETH`);
        this.log(`   You may not be able to process refunds`);
      }
    } catch (error: any) {
      this.log('⚠️  Could not check wallet balance:', error.message);
    }
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

      // Validate sender address format
      try {
        ethers.getAddress(senderAddress); // Throws if invalid
      } catch (error) {
        this.log('❌ Invalid sender address format:', senderAddress);
        throw new Error(`Invalid sender address: ${senderAddress}`);
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

      // Check minimum refund amount (must cover gas costs)
      // Gas cost on Base is typically ~21000 * gas price
      // Minimum recommended: 0.00001 ETH (10000000000000 wei) to cover gas
      const MIN_REFUND_WEI = BigInt(10000000000000); // 0.00001 ETH
      
      if (BigInt(refundWei) < MIN_REFUND_WEI) {
        this.log('⚠️  Refund amount too small to process on-chain', {
          refundWei,
          minRequired: MIN_REFUND_WEI.toString(),
          reason: 'Amount would be consumed by gas fees',
        });
        
        // Don't throw error, just log and return
        // In production, you might want to accumulate small refunds
        return;
      }

      // Check if automatic refunds are enabled and wallet is available
      if (!this.config.autoRefund || !this.wallet) {
        this.log('⚠️  Automatic refunds disabled or no private key - manual refund required', {
          to: senderAddress,
          amount: refundETH + ' ETH',
          network: this.config.network,
          chainId: this.config.chainId,
        });
        return;
      }

      // Check if recipient is a contract (might reject ETH)
      const code = await this.provider.getCode(senderAddress);
      if (code !== '0x') {
        this.log('⚠️  Recipient is a smart contract - may not accept ETH transfers', {
          address: senderAddress,
          codeLength: code.length,
        });
        
        // For now, we'll try anyway but log the warning
        // In production, you might want to use a different refund method
      }

      // Execute automatic refund
      this.log('💸 Sending refund transaction...');

      try {
        // Get current gas price
        const feeData = await this.provider.getFeeData();
        
        // Estimate gas cost
        const gasLimit = 21000n;
        const maxGasCost = gasLimit * (feeData.maxFeePerGas || BigInt(0));
        
        // Verify refund amount covers gas
        if (BigInt(refundWei) <= maxGasCost) {
          this.log('⚠️  Refund amount would be consumed by gas fees', {
            refundWei,
            estimatedGasCost: maxGasCost.toString(),
          });
          return;
        }

        // Check wallet balance
        const balance = await this.provider.getBalance(this.wallet.address);
        const totalNeeded = BigInt(refundWei) + maxGasCost;
        
        this.log('💰 Wallet check:', {
          merchantBalance: ethers.formatEther(balance) + ' ETH',
          refundAmount: ethers.formatEther(refundWei) + ' ETH',
          estimatedGas: ethers.formatEther(maxGasCost) + ' ETH',
          totalNeeded: ethers.formatEther(totalNeeded) + ' ETH',
          canProcess: balance >= totalNeeded,
        });
        
        if (balance < totalNeeded) {
          this.log('❌ Insufficient balance in merchant wallet', {
            balance: ethers.formatEther(balance),
            needed: ethers.formatEther(totalNeeded),
            refund: ethers.formatEther(refundWei),
            gas: ethers.formatEther(maxGasCost),
          });
          throw new Error('Insufficient funds in merchant wallet for refund + gas');
        }

        // Try to estimate gas first to catch issues early
        try {
          this.log('🔍 Estimating gas for refund transaction...');
          const gasEstimate = await this.wallet.estimateGas({
            to: senderAddress,
            value: BigInt(refundWei),
          });
          this.log('✅ Gas estimation successful:', gasEstimate.toString());
        } catch (estimateError: any) {
          this.log('❌ Gas estimation failed:', estimateError.message);
          this.log('⚠️  This transaction will likely fail');
          
          // Try to get more details about why it would fail
          if (estimateError.message.includes('insufficient funds')) {
            throw new Error('Insufficient funds for transaction');
          } else if (estimateError.message.includes('execution reverted')) {
            throw new Error('Transaction would revert - recipient may not accept ETH');
          }
          
          // Continue anyway to get actual error
          this.log('⚠️  Attempting transaction anyway for debugging...');
        }
        
        // Prepare transaction
        const tx = await this.wallet.sendTransaction({
          to: senderAddress,
          value: BigInt(refundWei),
          gasLimit: gasLimit,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        });

        this.log('⏳ Refund transaction sent, waiting for confirmation...', {
          txHash: tx.hash,
          to: senderAddress,
          amount: refundETH + ' ETH',
          nonce: tx.nonce,
        });

        // Wait for confirmation
        const receipt = await tx.wait();

        if (receipt && receipt.status === 1) {
          this.log('✅ Refund confirmed!', {
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            effectiveCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
          });
        } else {
          throw new Error('Refund transaction failed');
        }

      } catch (txError: any) {
        this.log('❌ Refund transaction error:', txError.message);
        
        // Check for common errors
        if (txError.code === 'INSUFFICIENT_FUNDS') {
          throw new Error('Insufficient funds in merchant wallet for refund');
        } else if (txError.code === 'NONCE_EXPIRED') {
          throw new Error('Transaction nonce expired - please retry');
        } else if (txError.code === 'CALL_EXCEPTION') {
          this.log('⚠️  Transaction reverted - likely due to recipient being a contract or having a receive() restriction');
          
          // Log detailed info for debugging
          this.log('💡 Possible solutions:', {
            solution1: 'Recipient might be a smart contract wallet',
            solution2: 'Recipient might not have a receive() or fallback() function',
            solution3: 'Consider implementing off-chain refund tracking',
            recipientAddress: senderAddress,
          });
          
          throw new Error('Refund transaction reverted - recipient cannot receive ETH (might be a contract)');
        } else {
          throw new Error(`Refund transaction failed: ${txError.message}`);
        }
      }

    } catch (error: any) {
      this.log('❌ Refund error:', error.message);
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
      autoRefundEnabled: this.config.autoRefund && !!this.wallet,
      walletConnected: !!this.wallet,
    };
  }
}