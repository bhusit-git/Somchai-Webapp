import { calculateFinancials } from './src/lib/financials.js';

// Setup mock data
const transactions = [
  { id: 'tx1', status: 'completed', payment_method: 'cash', total: 200 },
  { id: 'tx2', status: 'completed', payment_method: 'staff_meal', total: 0 }
];

// In the new implementation, we have cogs_at_time_of_sale representing frozen cost (50)
const transactionItems = [
  { transaction_id: 'tx1', product_id: 'p1', quantity: 2, total_price: 200, cogs_at_time_of_sale: 50 },
  { transaction_id: 'tx2', product_id: 'p1', quantity: 1, total_price: 100, cogs_at_time_of_sale: 50 }
];

// But live costs have jumped to 100!
const resolvedCosts = {
  'p1': 100 
};

function runTest() {
  console.log('Running calculateFinancials test...');
  const metrics = calculateFinancials(transactions, transactionItems, resolvedCosts);
  
  // Since quantity is 2 and frozen COGS is 50, salesCogs should be 100.
  // BUT the current bug uses resolvedCosts (100 * 2 = 200) instead.
  
  const expectedSalesCogs = 100; // 2 * 50
  const expectedStaffMealCogs = 50; // 1 * 50
  
  try {
    if (metrics.salesCogs !== expectedSalesCogs) {
      throw new Error(`Bug Reproduced! Expected salesCogs to be ${expectedSalesCogs} (frozen cost), but got ${metrics.salesCogs} (live cost).`);
    }
    
    if (metrics.staffMealCogs !== expectedStaffMealCogs) {
      throw new Error(`Bug Reproduced! Expected staffMealCogs to be ${expectedStaffMealCogs} (frozen cost), but got ${metrics.staffMealCogs} (live cost).`);
    }

    console.log('✅ Test Passed! calculateFinancials correctly uses frozen cogs_at_time_of_sale.');
  } catch (err) {
    console.error('❌ Test Failed:', err.message);
    process.exit(1);
  }
}

runTest();
