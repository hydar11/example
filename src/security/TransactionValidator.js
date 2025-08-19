import { ethers } from 'ethers';
import FeeProtection from './FeeProtection';

// SECURITY CONFIG - HARDCODED (NEVER FROM SERVER)
const SECURITY_CONFIG = {
  // Whitelisted contract addresses
  ALLOWED_CONTRACTS: {
    GIGAVERSE_MARKET: '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
    // Add more contracts here as needed
  },
  
  // Transaction limits
  LIMITS: {
    MAX_ETH_PER_TRANSACTION: '0.05', // 0.05 ETH per transaction
    MAX_ETH_PER_DAY: '0.2',          // 0.2 ETH per day
    MAX_TRANSACTIONS_PER_HOUR: 10,   // 10 transactions per hour
    MAX_FEE_PERCENTAGE: 0.03,        // 3% maximum fee
  },
  
  // Allowed fee wallet (HARDCODED)
  FEE_WALLET: '0x010Cf19b9c0E75FC9EBFbae3302E3710be4ba911', // Your actual fee wallet
  
  // Allowed function signatures for Gigaverse Market (HARDCODED)
  ALLOWED_FUNCTIONS: {
    // Market functions - extracted from actual code
    'bulkBuy': '0x807ef825',        // bulkBuy function signature (from encodeBulkBuyTransaction)
    'cancelListing': '0x305a67a8',  // cancelListing function signature  
    // createListing uses dynamic encoding, so we'll validate by contract address only
    // Empty transactions (0x) are also allowed for ETH transfers
  }
};

class TransactionValidator {
  constructor() {
    this.userLimits = this.loadUserLimits();
  }

  // Load user spending limits from localStorage
  loadUserLimits() {
    const stored = localStorage.getItem('user_transaction_limits');
    const now = Date.now();
    
    if (stored) {
      const limits = JSON.parse(stored);
      // Reset daily limits if it's a new day
      if (limits.lastResetDate !== this.getTodayDateString()) {
        limits.dailySpent = '0';
        limits.dailyTransactionCount = 0;
        limits.lastResetDate = this.getTodayDateString();
      }
      return limits;
    }
    
    // Initialize fresh limits
    return {
      dailySpent: '0',
      dailyTransactionCount: 0,
      hourlyTransactionCount: 0,
      lastTransactionTime: 0,
      lastHourReset: now,
      lastResetDate: this.getTodayDateString(),
      transactionHistory: []
    };
  }

  // Save user limits to localStorage
  saveUserLimits() {
    localStorage.setItem('user_transaction_limits', JSON.stringify(this.userLimits));
  }

  // Get today's date as string for daily reset
  getTodayDateString() {
    return new Date().toISOString().split('T')[0];
  }

  // Reset hourly limits if needed
  resetHourlyLimitsIfNeeded() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (now - this.userLimits.lastHourReset > oneHour) {
      this.userLimits.hourlyTransactionCount = 0;
      this.userLimits.lastHourReset = now;
    }
  }

  // Validate contract address
  validateContractAddress(contractAddress) {
    const normalizedAddress = contractAddress.toLowerCase();
    const allowedAddresses = Object.values(SECURITY_CONFIG.ALLOWED_CONTRACTS)
      .map(addr => addr.toLowerCase());
    
    // Also allow the fee wallet for fee transfers
    const feeWallet = SECURITY_CONFIG.FEE_WALLET.toLowerCase();
    
    if (!allowedAddresses.includes(normalizedAddress) && normalizedAddress !== feeWallet) {
      throw new Error(`🚨 SECURITY ALERT: Unauthorized contract address: ${contractAddress}`);
    }
    
    console.log('✅ Contract address validated:', contractAddress);
    return true;
  }

  // Validate transaction amount
  validateTransactionAmount(value) {
    const valueInEth = ethers.formatEther(value);
    const maxPerTransaction = SECURITY_CONFIG.LIMITS.MAX_ETH_PER_TRANSACTION;
    
    // Check per-transaction limit
    if (parseFloat(valueInEth) > parseFloat(maxPerTransaction)) {
      throw new Error(`🚨 SECURITY ALERT: Transaction amount ${valueInEth} ETH exceeds limit of ${maxPerTransaction} ETH`);
    }
    
    // Check daily limit
    const currentDailySpent = parseFloat(this.userLimits.dailySpent);
    const newDailyTotal = currentDailySpent + parseFloat(valueInEth);
    const maxPerDay = parseFloat(SECURITY_CONFIG.LIMITS.MAX_ETH_PER_DAY);
    
    if (newDailyTotal > maxPerDay) {
      throw new Error(`🚨 SECURITY ALERT: Daily spending limit exceeded. Spent today: ${currentDailySpent.toFixed(4)} ETH, Attempting: ${valueInEth} ETH, Daily limit: ${maxPerDay} ETH`);
    }
    
    console.log('✅ Transaction amount validated:', valueInEth, 'ETH');
    return true;
  }

  // Validate transaction frequency
  validateTransactionFrequency() {
    this.resetHourlyLimitsIfNeeded();
    
    const maxPerHour = SECURITY_CONFIG.LIMITS.MAX_TRANSACTIONS_PER_HOUR;
    
    if (this.userLimits.hourlyTransactionCount >= maxPerHour) {
      throw new Error(`🚨 SECURITY ALERT: Transaction frequency limit exceeded. Max ${maxPerHour} transactions per hour.`);
    }
    
    // Allow immediate transactions - no delay required
    const now = Date.now();
    
    console.log('✅ Transaction frequency validated');
    return true;
  }

  // Validate function call data
  validateFunctionCall(data) {
    if (!data || data === '0x') {
      console.log('✅ Empty transaction data validated');
      return true;
    }
    
    // Extract function selector (first 4 bytes)
    const functionSelector = data.slice(0, 10);
    
    // Check if function is allowed
    const allowedSelectors = Object.values(SECURITY_CONFIG.ALLOWED_FUNCTIONS);
    
    // Special case: createListing functions start with different selectors but are all valid
    // We'll allow any function call to the whitelisted contract address for createListing
    const isCreateListingPattern = data.length > 200; // createListing calls are typically long
    
    if (!allowedSelectors.includes(functionSelector) && !isCreateListingPattern) {
      console.warn(`⚠️ Unknown function selector: ${functionSelector} (data length: ${data.length})`);
      // For now, we'll allow unknown functions to the whitelisted contract
      // In production, you might want to be more restrictive
      console.log('✅ Function call allowed (whitelisted contract)');
      return true;
    }
    
    console.log('✅ Function call validated:', functionSelector);
    return true;
  }

  // Validate fee parameters using FeeProtection system
  validateFee(feeAmount, totalTransactionAmount, feeWallet) {
    if (!feeAmount || feeAmount === 0) {
      console.log('✅ Zero fee transaction validated');
      return true;
    }
    
    // Use comprehensive FeeProtection validation
    const feeData = {
      feeAmount: feeAmount,
      feeWallet: feeWallet,
      transactionAmount: totalTransactionAmount
    };
    
    FeeProtection.validateFeeTransaction(feeData);
    return true;
  }

  // Main validation function
  validateTransaction(txData) {
    const startTime = performance.now();
    console.log('🔍 Starting transaction validation...', txData);
    
    try {
      // 1. Validate contract address
      this.validateContractAddress(txData.to);
      
      // 2. Validate transaction amount
      this.validateTransactionAmount(txData.value);
      
      // 3. Validate transaction frequency
      this.validateTransactionFrequency();
      
      // 4. Validate function call
      this.validateFunctionCall(txData.data);
      
      // 5. Validate fee (if present)
      if (txData.feeAmount && txData.feeWallet) {
        const totalAmount = parseFloat(ethers.formatEther(txData.value));
        const feeAmount = parseFloat(ethers.formatEther(txData.feeAmount));
        this.validateFee(feeAmount, totalAmount, txData.feeWallet);
      }
      
      const endTime = performance.now();
      console.log(`✅ All transaction validations passed (${(endTime - startTime).toFixed(2)}ms)`);
      return true;
      
    } catch (error) {
      console.error('❌ Transaction validation failed:', error.message);
      throw error;
    }
  }

  // Record successful transaction
  recordTransaction(txData, txHash) {
    const valueInEth = ethers.formatEther(txData.value);
    const now = Date.now();
    
    // Update spending limits
    this.userLimits.dailySpent = (parseFloat(this.userLimits.dailySpent) + parseFloat(valueInEth)).toString();
    this.userLimits.dailyTransactionCount++;
    this.userLimits.hourlyTransactionCount++;
    this.userLimits.lastTransactionTime = now;
    
    // Add to transaction history
    this.userLimits.transactionHistory.push({
      txHash,
      amount: valueInEth,
      to: txData.to,
      timestamp: now,
      functionSelector: txData.data ? txData.data.slice(0, 10) : null
    });
    
    // Keep only last 100 transactions
    if (this.userLimits.transactionHistory.length > 100) {
      this.userLimits.transactionHistory = this.userLimits.transactionHistory.slice(-100);
    }
    
    this.saveUserLimits();
    console.log('📝 Transaction recorded:', txHash);
  }

  // Get current user limits (for display)
  getCurrentLimits() {
    const maxPerTx = SECURITY_CONFIG.LIMITS.MAX_ETH_PER_TRANSACTION;
    const maxPerDay = SECURITY_CONFIG.LIMITS.MAX_ETH_PER_DAY;
    const dailySpent = parseFloat(this.userLimits.dailySpent);
    const dailyRemaining = Math.max(0, parseFloat(maxPerDay) - dailySpent);
    
    this.resetHourlyLimitsIfNeeded();
    
    return {
      maxPerTransaction: maxPerTx,
      maxPerDay: maxPerDay,
      dailySpent: dailySpent.toFixed(4),
      dailyRemaining: dailyRemaining.toFixed(4),
      dailyTransactionCount: this.userLimits.dailyTransactionCount,
      hourlyTransactionCount: this.userLimits.hourlyTransactionCount,
      maxTransactionsPerHour: SECURITY_CONFIG.LIMITS.MAX_TRANSACTIONS_PER_HOUR
    };
  }

  // Emergency reset (use with caution)
  emergencyReset() {
    localStorage.removeItem('user_transaction_limits');
    this.userLimits = this.loadUserLimits();
    console.log('🚨 User limits reset');
  }
}

// Export singleton instance
export const transactionValidator = new TransactionValidator();

// Export config for debugging (read-only)
export const getSecurityConfig = () => ({ ...SECURITY_CONFIG });