/**
 * financials.js
 * Centralized utility for financial calculations in Somchai App.
 * Handles Staff Meal isolation and COGS calculations.
 */

/**
 * Calculates key financial metrics from transactions and items.
 * 
 * @param {Array} transactions - List of transaction objects
 * @param {Array} transactionItems - List of transaction_item objects (must include related transaction info if needed)
 * @param {Object} resolvedCosts - Map of product_id -> unit cost (BOM or manual cost)
 * @returns {Object} Calculated metrics
 */
export function calculateFinancials(transactions, transactionItems, resolvedCosts) {
  // Only process completed transactions
  const completedTx = transactions.filter(t => t.status === 'completed');
  const completedTxIds = new Set(completedTx.map(t => t.id));

  // Filter items for completed transactions
  const completedItems = transactionItems.filter(ti => completedTxIds.has(ti.transaction_id));

  // 1. Actual Revenue (Excludes Staff Meals)
  const actualRevenue = completedTx
    .filter(t => t.payment_method !== 'staff_meal')
    .reduce((sum, t) => sum + Number(t.total || 0), 0);

  // 2. Staff Benefit (Market Value)
  // Calculated by summing the item totals of staff meal transactions
  // (since transaction.total is set to 0 for database integrity)
  const staffMealTxIds = new Set(
    completedTx.filter(t => t.payment_method === 'staff_meal').map(t => t.id)
  );
  
  const staffBenefitMarketValue = completedItems
    .filter(ti => staffMealTxIds.has(ti.transaction_id))
    .reduce((sum, ti) => sum + Number(ti.total_price || ti.final_price || 0), 0);

  // 3. Staff Meal COGS (Internal Cost)
  const staffMealCogs = completedItems
    .filter(ti => staffMealTxIds.has(ti.transaction_id))
    .reduce((sum, ti) => {
      const unitCost = (ti.cogs_at_time_of_sale !== undefined && ti.cogs_at_time_of_sale !== null) 
        ? Number(ti.cogs_at_time_of_sale) 
        : (resolvedCosts[ti.product_id] || 0);
      return sum + (Number(ti.quantity || 0) * unitCost);
    }, 0);

  // 4. Sales COGS (Cost of Goods Sold for normal transactions)
  const salesCogs = completedItems
    .filter(ti => !staffMealTxIds.has(ti.transaction_id))
    .reduce((sum, ti) => {
      const unitCost = (ti.cogs_at_time_of_sale !== undefined && ti.cogs_at_time_of_sale !== null) 
        ? Number(ti.cogs_at_time_of_sale) 
        : (resolvedCosts[ti.product_id] || 0);
      return sum + (Number(ti.quantity || 0) * unitCost);
    }, 0);

  return {
    actualRevenue,
    staffBenefitMarketValue,
    staffMealCogs,
    salesCogs,
    netProfitBeforeExpenses: actualRevenue - salesCogs - staffMealCogs
  };
}

