// FEE PROTECTION SYSTEM - HARDCODED SECURITY
// This file contains hardcoded fee validation to prevent manipulation

const FEE_CONFIG = {
  // HARDCODED FEE WALLET - NEVER CHANGE UNLESS AUTHORIZED
  AUTHORIZED_FEE_WALLET: '0x010Cf19b9c0E75FC9EBFbae3302E3710be4ba911',
  
  // FEE LIMITS - HARDCODED
  MAX_FEE_PERCENTAGE: 0.02,    // 2% maximum fee
  MIN_TRANSACTION_FOR_FEE: 0.001, // Minimum transaction amount to charge fee (0.001 ETH)
  
  // FEE CALCULATION RULES
  STANDARD_FEE_RATE: 0.01,     // 1% standard fee
  
  // ALERT THRESHOLDS
  SUSPICIOUS_FEE_THRESHOLD: 0.015, // Alert if fee > 1.5%
};

class FeeProtection {
  
  // Validate fee wallet address
  static validateFeeWallet(feeWalletAddress) {
    if (!feeWalletAddress) {
      console.log('✅ No fee wallet specified, transaction allowed');
      return true;
    }
    
    const normalizedFeeWallet = feeWalletAddress.toLowerCase();
    const authorizedWallet = FEE_CONFIG.AUTHORIZED_FEE_WALLET.toLowerCase();
    
    if (normalizedFeeWallet !== authorizedWallet) {
      throw new Error(`🚨 SECURITY ALERT: Unauthorized fee wallet detected!
        Expected: ${FEE_CONFIG.AUTHORIZED_FEE_WALLET}
        Received: ${feeWalletAddress}
        This could be a wallet drainage attempt!`);
    }
    
    console.log('✅ Fee wallet validated:', feeWalletAddress);
    return true;
  }
  
  // Calculate expected fee amount
  static calculateExpectedFee(transactionAmount) {
    const amount = parseFloat(transactionAmount);
    
    // No fee for very small transactions
    if (amount < FEE_CONFIG.MIN_TRANSACTION_FOR_FEE) {
      return 0;
    }
    
    return amount * FEE_CONFIG.STANDARD_FEE_RATE;
  }
  
  // Validate fee percentage
  static validateFeePercentage(feeAmount, transactionAmount) {
    const fee = parseFloat(feeAmount);
    const amount = parseFloat(transactionAmount);
    
    if (fee === 0 || amount === 0) {
      console.log('✅ Zero fee transaction validated');
      return true;
    }
    
    const feePercentage = fee / amount;
    const maxFeePercentage = FEE_CONFIG.MAX_FEE_PERCENTAGE;
    
    // Check if fee exceeds maximum allowed
    if (feePercentage > maxFeePercentage) {
      throw new Error(`🚨 SECURITY ALERT: Fee percentage too high!
        Fee Amount: ${fee} ETH (${(feePercentage * 100).toFixed(2)}%)
        Transaction Amount: ${amount} ETH
        Maximum Allowed: ${(maxFeePercentage * 100).toFixed(2)}%
        This could be a wallet drainage attempt!`);
    }
    
    // Alert for suspicious fees (higher than normal but below max)
    if (feePercentage > FEE_CONFIG.SUSPICIOUS_FEE_THRESHOLD) {
      console.warn(`⚠️ WARNING: Fee percentage is higher than normal:
        Fee: ${(feePercentage * 100).toFixed(2)}% (Normal: ${(FEE_CONFIG.STANDARD_FEE_RATE * 100)}%)`);
    }
    
    console.log('✅ Fee percentage validated:', (feePercentage * 100).toFixed(2) + '%');
    return true;
  }
  
  // Validate expected vs actual fee amount
  static validateFeeAmount(providedFeeAmount, transactionAmount) {
    const providedFee = parseFloat(providedFeeAmount);
    const expectedFee = this.calculateExpectedFee(transactionAmount);
    const tolerance = 0.0001; // Allow small rounding differences (0.0001 ETH)
    
    if (providedFee === 0 && expectedFee === 0) {
      console.log('✅ Zero fee transaction validated');
      return true;
    }
    
    // Check if provided fee matches expected fee (within tolerance)
    const feeDifference = Math.abs(providedFee - expectedFee);
    const isWithinTolerance = feeDifference <= tolerance;
    
    if (!isWithinTolerance && providedFee > expectedFee) {
      console.warn(`⚠️ WARNING: Fee amount higher than expected:
        Provided Fee: ${providedFee} ETH
        Expected Fee: ${expectedFee.toFixed(6)} ETH
        Difference: +${(providedFee - expectedFee).toFixed(6)} ETH`);
      
      // Still validate percentage limits
      this.validateFeePercentage(providedFee, transactionAmount);
    }
    
    console.log(`✅ Fee amount validated: ${providedFee} ETH (expected: ${expectedFee.toFixed(6)} ETH)`);
    return true;
  }
  
  // Main fee validation function
  static validateFeeTransaction(feeData) {
    console.log('🔍 Starting fee validation...', feeData);
    
    const { feeAmount, feeWallet, transactionAmount } = feeData;
    
    try {
      // 1. Validate fee wallet address
      this.validateFeeWallet(feeWallet);
      
      // 2. Validate fee percentage
      this.validateFeePercentage(feeAmount, transactionAmount);
      
      // 3. Validate fee amount against expected
      this.validateFeeAmount(feeAmount, transactionAmount);
      
      console.log('✅ All fee validations passed');
      return true;
      
    } catch (error) {
      console.error('❌ Fee validation failed:', error.message);
      throw error;
    }
  }
  
  // Get current fee configuration (read-only)
  static getFeeConfig() {
    return {
      authorizedFeeWallet: FEE_CONFIG.AUTHORIZED_FEE_WALLET,
      maxFeePercentage: (FEE_CONFIG.MAX_FEE_PERCENTAGE * 100).toFixed(1) + '%',
      standardFeeRate: (FEE_CONFIG.STANDARD_FEE_RATE * 100).toFixed(1) + '%',
      minTransactionForFee: FEE_CONFIG.MIN_TRANSACTION_FOR_FEE + ' ETH'
    };
  }
  
  // Check if transaction should have fee
  static shouldHaveFee(transactionAmount) {
    const amount = parseFloat(transactionAmount);
    return amount >= FEE_CONFIG.MIN_TRANSACTION_FOR_FEE;
  }
  
  // Generate fee preview for user
  static generateFeePreview(transactionAmount) {
    const amount = parseFloat(transactionAmount);
    const expectedFee = this.calculateExpectedFee(amount);
    const totalCost = amount + expectedFee;
    
    return {
      transactionAmount: amount.toFixed(6) + ' ETH',
      feeAmount: expectedFee.toFixed(6) + ' ETH',
      feePercentage: expectedFee > 0 ? (expectedFee / amount * 100).toFixed(1) + '%' : '0%',
      totalCost: totalCost.toFixed(6) + ' ETH',
      feeWallet: FEE_CONFIG.AUTHORIZED_FEE_WALLET
    };
  }
}

export default FeeProtection;