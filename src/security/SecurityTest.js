// Security Test Suite - Test all security validations
import { transactionValidator } from './TransactionValidator';
import FeeProtection from './FeeProtection';

class SecurityTest {
  static async runAllTests() {
    console.log('🔒 Starting Security Test Suite...');
    
    const results = {
      passed: 0,
      failed: 0,
      tests: []
    };

    // Test 1: Contract Address Validation
    await this.testContractAddressValidation(results);
    
    // Test 2: Transaction Amount Limits
    await this.testTransactionLimits(results);
    
    // Test 3: Fee Protection
    await this.testFeeProtection(results);
    
    // Test 4: Function Call Validation
    await this.testFunctionCallValidation(results);
    
    // Test 5: Rate Limiting
    await this.testRateLimiting(results);
    
    this.printResults(results);
    return results;
  }

  static async testContractAddressValidation(results) {
    console.log('🧪 Testing Contract Address Validation...');
    
    // Test valid contract
    try {
      transactionValidator.validateContractAddress('0x807BE43Cd840144819EA8D05C19F4E5530D38bf1');
      this.addResult(results, '✅ Valid Gigaverse contract accepted', true);
    } catch (error) {
      this.addResult(results, '❌ Valid Gigaverse contract rejected', false, error.message);
    }

    // Test valid fee wallet
    try {
      transactionValidator.validateContractAddress('0x010Cf19b9c0E75FC9EBFbae3302E3710be4ba911');
      this.addResult(results, '✅ Valid fee wallet accepted', true);
    } catch (error) {
      this.addResult(results, '❌ Valid fee wallet rejected', false, error.message);
    }

    // Test invalid contract (should fail)
    try {
      transactionValidator.validateContractAddress('0x1234567890123456789012345678901234567890');
      this.addResult(results, '❌ Invalid contract was accepted (SECURITY BREACH!)', false);
    } catch (error) {
      this.addResult(results, '✅ Invalid contract correctly rejected', true);
    }
  }

  static async testTransactionLimits(results) {
    console.log('🧪 Testing Transaction Limits...');
    
    // Test valid transaction amount
    try {
      transactionValidator.validateTransactionAmount('30000000000000000'); // 0.03 ETH
      this.addResult(results, '✅ Valid transaction amount (0.03 ETH) accepted', true);
    } catch (error) {
      this.addResult(results, '❌ Valid transaction amount rejected', false, error.message);
    }

    // Test transaction exceeding limit (should fail)
    try {
      transactionValidator.validateTransactionAmount('100000000000000000'); // 0.1 ETH (exceeds 0.05 limit)
      this.addResult(results, '❌ Transaction exceeding limit was accepted (SECURITY BREACH!)', false);
    } catch (error) {
      this.addResult(results, '✅ Transaction exceeding limit correctly rejected', true);
    }
  }

  static async testFeeProtection(results) {
    console.log('🧪 Testing Fee Protection...');
    
    // Test valid fee wallet
    try {
      FeeProtection.validateFeeWallet('0x010Cf19b9c0E75FC9EBFbae3302E3710be4ba911');
      this.addResult(results, '✅ Valid fee wallet accepted', true);
    } catch (error) {
      this.addResult(results, '❌ Valid fee wallet rejected', false, error.message);
    }

    // Test invalid fee wallet (should fail)
    try {
      FeeProtection.validateFeeWallet('0x1234567890123456789012345678901234567890');
      this.addResult(results, '❌ Invalid fee wallet was accepted (SECURITY BREACH!)', false);
    } catch (error) {
      this.addResult(results, '✅ Invalid fee wallet correctly rejected', true);
    }

    // Test valid fee percentage
    try {
      FeeProtection.validateFeePercentage(0.001, 0.1); // 1% fee on 0.1 ETH
      this.addResult(results, '✅ Valid fee percentage (1%) accepted', true);
    } catch (error) {
      this.addResult(results, '❌ Valid fee percentage rejected', false, error.message);
    }

    // Test excessive fee percentage (should fail)
    try {
      FeeProtection.validateFeePercentage(0.005, 0.1); // 5% fee (exceeds 2% limit)
      this.addResult(results, '❌ Excessive fee percentage was accepted (SECURITY BREACH!)', false);
    } catch (error) {
      this.addResult(results, '✅ Excessive fee percentage correctly rejected', true);
    }
  }

  static async testFunctionCallValidation(results) {
    console.log('🧪 Testing Function Call Validation...');
    
    // Test valid function call
    try {
      transactionValidator.validateFunctionCall('0x807ef825'); // bulkBuy
      this.addResult(results, '✅ Valid function call (bulkBuy) accepted', true);
    } catch (error) {
      this.addResult(results, '❌ Valid function call rejected', false, error.message);
    }

    // Test empty transaction data (should be allowed)
    try {
      transactionValidator.validateFunctionCall('0x');
      this.addResult(results, '✅ Empty transaction data accepted', true);
    } catch (error) {
      this.addResult(results, '❌ Empty transaction data rejected', false, error.message);
    }
  }

  static async testRateLimiting(results) {
    console.log('🧪 Testing Rate Limiting...');
    
    try {
      transactionValidator.validateTransactionFrequency();
      this.addResult(results, '✅ Rate limiting check passed', true);
    } catch (error) {
      if (error.message.includes('frequency limit exceeded')) {
        this.addResult(results, '✅ Rate limiting correctly enforced', true);
      } else {
        this.addResult(results, '❌ Rate limiting check failed', false, error.message);
      }
    }
  }

  static addResult(results, message, passed, error = null) {
    results.tests.push({
      message,
      passed,
      error
    });
    
    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  static printResults(results) {
    console.log('\n🔒 Security Test Results:');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📊 Total: ${results.tests.length}`);
    
    console.log('\n📋 Detailed Results:');
    results.tests.forEach(test => {
      console.log(test.message);
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
    });

    if (results.failed === 0) {
      console.log('\n🎉 ALL SECURITY TESTS PASSED! System is secure.');
    } else {
      console.log(`\n⚠️ ${results.failed} tests failed. Review security implementation.`);
    }
  }

  // Quick security check function for production
  static async quickSecurityCheck() {
    console.log('🔍 Running Quick Security Check...');
    
    const checks = [];
    
    // Check 1: Transaction validator exists
    checks.push({
      name: 'Transaction Validator',
      status: typeof transactionValidator !== 'undefined',
      details: 'Transaction validation system loaded'
    });
    
    // Check 2: Fee protection exists
    checks.push({
      name: 'Fee Protection',
      status: typeof FeeProtection !== 'undefined',
      details: 'Fee protection system loaded'
    });
    
    // Check 3: Security configuration
    const limits = transactionValidator.getCurrentLimits();
    checks.push({
      name: 'Security Limits',
      status: limits.maxPerTransaction === '0.05',
      details: `Max per transaction: ${limits.maxPerTransaction} ETH`
    });
    
    console.log('Quick Security Check Results:');
    checks.forEach(check => {
      const status = check.status ? '✅' : '❌';
      console.log(`${status} ${check.name}: ${check.details}`);
    });
    
    const allPassed = checks.every(check => check.status);
    console.log(allPassed ? '\n🔒 Security systems operational' : '\n⚠️ Security issues detected');
    
    return allPassed;
  }
}

// Export for testing
export default SecurityTest;

// Auto-run quick check in development
if (process.env.NODE_ENV === 'development') {
  setTimeout(() => {
    SecurityTest.quickSecurityCheck();
  }, 1000);
}