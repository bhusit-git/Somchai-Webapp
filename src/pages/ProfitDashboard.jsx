import { Lock, DollarSign, TrendingUp, TrendingDown, X, ArrowUpRight, ArrowDownRight, RefreshCw, Layers, FileText, Gift, ChevronDown, ChevronUp, AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateFinancials } from '../lib/financials';

export default function ProfitDashboard() {
  const [safe, setSafe] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pastSummaries, setPastSummaries] = useState(null); // Snapshot data
  const [opexAmount, setOpexAmount] = useState(0);
  const [fixedCostAmount, setFixedCostAmount] = useState(0);
  const [fixedCostDetails, setFixedCostDetails] = useState([]);
  const [financialMetrics, setFinancialMetrics] = useState({
    actualRevenue: 0,
    staffBenefitMarketValue: 0,
    staffMealCogs: 0,
    salesCogs: 0
  });
  const [showStaffMealDetails, setShowStaffMealDetails] = useState(false);
  const [loading, setLoading] = useState(true);

  // --- Resolution 2: EOD Reconciliation State ---
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reconData, setReconData] = useState(null); // Existing recon from daily_reconciliations
  const [actualCashCount, setActualCashCount] = useState('');
  const [shiftsData, setShiftsData] = useState([]); // Closed shifts for the date
  const [isSubmittingRecon, setIsSubmittingRecon] = useState(false);

  const [showSafeModal, setShowSafeModal] = useState(false);
  const [safeForm, setSafeForm] = useState({ type: 'in', amount: '', reason: '' });

  const { user } = useAuth();
  const currentBranchId = user?.branch_id;
  
  const currentMonth = selectedDate.slice(0, 7); // YYYY-MM
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (currentBranchId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranchId, selectedDate]);

  async function fetchData() {
    if (!currentBranchId) return;
    setLoading(true);

    try {
      // 1. Fetch Manager Safe
      const { data: safeData } = await supabase.from('manager_safes').select('*').eq('branch_id', currentBranchId).maybeSingle();
      setSafe(safeData);

      // --- Resolution 3: Hybrid Fetching ---
      if (isToday) {
        // [LIVE FETCHING]
        const startStr = `${selectedDate}T00:00:00+07:00`;
        const endStr = `${selectedDate}T23:59:59+07:00`;

        // Fetch Transactions & Expenses Live
        const [revRes, expRes, catRes, prodRes, bomRes, invRes, comboRes, shiftRes, reconRes] = await Promise.all([
          supabase.from('transactions').select('id, total, status, payment_method').eq('branch_id', currentBranchId).gte('created_at', startStr).lte('created_at', endStr),
          supabase.from('expenses').select('*').eq('branch_id', currentBranchId).eq('status', 'approved').gte('created_at', startStr).lte('created_at', endStr),
          supabase.from('expense_categories').select('id, name, is_fixed_cost').eq('is_active', true),
          supabase.from('products').select('id, cost, product_type'),
          supabase.from('menu_item_ingredients').select('menu_item_id, inventory_item_id, qty_required'),
          supabase.from('inventory_items').select('id, cost_per_stock_unit'),
          supabase.from('product_combo_items').select('combo_product_id, item_product_id, quantity'),
          supabase.from('shifts').select('*').eq('branch_id', currentBranchId).eq('status', 'closed').gte('closed_at', startStr).lte('closed_at', endStr),
          supabase.from('daily_reconciliations').select('*').eq('branch_id', currentBranchId).eq('reconciliation_date', selectedDate).maybeSingle()
        ]);

        const categoryMap = {};
        (catRes.data || []).forEach(c => { categoryMap[c.name] = c.is_fixed_cost || false; });

        const allExpenses = expRes.data || [];
        const fcItems = allExpenses.filter(e => categoryMap[e.category] === true);
        const opexItems = allExpenses.filter(e => categoryMap[e.category] !== true);

        setFixedCostAmount(fcItems.reduce((s, e) => s + Number(e.amount), 0));
        setFixedCostDetails(fcItems);
        setOpexAmount(opexItems.reduce((s, e) => s + Number(e.amount), 0));

        // Resolve costs for Live COGS
        const invMap = {}; (invRes.data || []).forEach(i => { invMap[i.id] = i.cost_per_stock_unit; });
        const resCosts = {};
        (prodRes.data || []).forEach(p => {
          const boms = (bomRes.data || []).filter(b => b.menu_item_id === p.id);
          resCosts[p.id] = boms.length > 0 ? boms.reduce((s, b) => s + (Number(b.qty_required) * Number(invMap[b.inventory_item_id] || 0)), 0) : Number(p.cost || 0);
        });
        (prodRes.data || []).forEach(p => {
          if (p.product_type === 'COMBO') {
            const children = (comboRes.data || []).filter(ci => ci.combo_product_id === p.id);
            resCosts[p.id] = children.reduce((s, ci) => s + (Number(resCosts[ci.item_product_id] || 0) * ci.quantity), 0);
          }
        });

        // Fetch Items for Live COGS
        const { data: txItems } = await supabase.from('transaction_items')
          .select('product_id, quantity, total_price, final_price, transaction_id, transactions!inner(created_at, status, payment_method)')
          .gte('transactions.created_at', startStr).lte('transactions.created_at', endStr)
          .eq('transactions.status', 'completed').eq('transactions.branch_id', currentBranchId);

        if (txItems) {
          const metrics = calculateFinancials(revRes.data || [], txItems, resCosts);
          setFinancialMetrics(metrics);
        }

        setShiftsData(shiftRes.data || []);
        setReconData(reconRes.data);
        if (reconRes.data) setActualCashCount(reconRes.data.actual_balance);
        else setActualCashCount('');
        setPastSummaries(null);
      } else {
        // [SNAPSHOT FETCHING]
        const { data: summaryData } = await supabase.from('profit_loss_summaries')
          .select('*').eq('branch_id', currentBranchId).eq('summary_date', selectedDate).maybeSingle();
        
        const { data: reconRes } = await supabase.from('daily_reconciliations')
          .select('*').eq('branch_id', currentBranchId).eq('reconciliation_date', selectedDate).maybeSingle();

        if (summaryData) {
          setFinancialMetrics({
            actualRevenue: Number(summaryData.total_revenue),
            salesCogs: Number(summaryData.total_cogs),
            staffMealCogs: 0, // Simplified for history
            staffBenefitMarketValue: 0
          });
          setOpexAmount(Number(summaryData.total_expenses));
          setFixedCostAmount(0); // Aggregated into total_expenses in snapshot
          setPastSummaries(summaryData);
        } else {
          setFinancialMetrics({ actualRevenue: 0, salesCogs: 0, staffMealCogs: 0, staffBenefitMarketValue: 0 });
          setOpexAmount(0);
          setFixedCostAmount(0);
          setPastSummaries(null);
        }
        setReconData(reconRes);
        if (reconRes) setActualCashCount(reconRes.actual_balance);
        else setActualCashCount('');
        setShiftsData([]); // Historical shifts optional, we trust recon record
      }

      // 4. Fetch Safe Transactions (Ledger)
      if (safeData?.id) {
        const { data: stData } = await supabase.from('safe_transactions')
          .select('*')
          .eq('safe_id', safeData.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setTransactions(stData || []);
      }
    } catch (error) {
      console.error("Error fetching Dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  // --- Resolution 1: EOD Reconciliation Submission ---
  async function handleSubmitReconciliation() {
    if (!currentBranchId || actualCashCount === '') return;
    setIsSubmittingRecon(true);

    try {
      const actual = Number(actualCashCount);
      const expected = expectedSafeBalance; // Derived from shifts below
      const discrepancy = actual - expected;

      // 1. Update/Insert daily_reconciliations
      const reconPayload = {
        branch_id: currentBranchId,
        reconciliation_date: selectedDate,
        cash_sales: totalCashSalesFromShifts,
        cash_expenses: totalCashExpensesFromShifts,
        expected_balance: expected,
        actual_balance: actual,
        discrepancy_amount: discrepancy,
        status: discrepancy === 0 ? 'matched' : (discrepancy < 0 ? 'short' : 'over'),
        updated_at: new Date().toISOString()
      };

      const { data: newRecon, error: reconErr } = await supabase
        .from('daily_reconciliations')
        .upsert(reconPayload, { onConflict: 'branch_id, reconciliation_date' })
        .select().single();

      if (reconErr) throw reconErr;

      // 2. Update manager_safes balance (Resolution 1.2)
      const { error: safeErr } = await supabase
        .from('manager_safes')
        .update({ balance: actual })
        .eq('branch_id', currentBranchId);
      
      if (safeErr) throw safeErr;

      // 3. Log audit adjustment if needed (Resolution 1.3)
      if (discrepancy !== 0) {
        await supabase.from('safe_transactions').insert({
          safe_id: safe.id,
          type: 'audit_adjustment',
          amount: Math.abs(discrepancy),
          reason: `System Auto-Adjustment from EOD Reconciliation. Discrepancy: ${discrepancy}`,
          created_by: user.id
        });
      }

      alert('ยืนยันยอดตู้เซฟและเปรียบเทียบกำไรสำเร็จ');
      fetchData();
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setIsSubmittingRecon(false);
    }
  }

  // --- Derived Calculations for Reconciliation (Resolution 2) ---
  const totalCashSalesFromShifts = shiftsData.reduce((s, sh) => s + Number(sh.expected_cash || 0) - Number(sh.opening_cash || 0), 0);
  const totalCashExpensesFromShifts = 0; // Handled within expected_cash logic of shifts usually
  const expectedSafeBalance = (reconData?.opening_balance || 0) + totalCashSalesFromShifts - totalCashExpensesFromShifts;

  const netProfit = financialMetrics.actualRevenue - financialMetrics.salesCogs - financialMetrics.staffMealCogs - opexAmount - fixedCostAmount;

  return (
    <div className="page-container" style={{ paddingBottom: '60px' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: 800 }}>วิเคราะห์กำไรและตู้เซฟ</h3>
          <p className="text-sm text-muted">Safe & Net Profit Analysis Dashboard ({selectedDate})</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            className="form-input" 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)} 
          />
          <button className="btn btn-sm btn-ghost" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
        </div>
      </div>

      {/* Info Banner: Single Source of Truth */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(59,130,246,0.08))',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <FileText size={16} style={{ color: 'var(--accent-info)', flexShrink: 0 }} />
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
          💡 ข้อมูลรายจ่ายทั้ง OPEX และ Fixed Cost ดึงจาก<strong style={{ color: 'var(--text-primary)' }}> หน้าบันทึกค่าใช้จ่าย (M3B) </strong>โดยอัตโนมัติ — ตั้งค่าหมวดหมู่ที่เป็นต้นทุนคงที่ได้ที่หน้า <strong style={{ color: 'var(--text-primary)' }}>Settings → หมวดหมู่รายจ่าย</strong>
        </p>
      </div>

      {/* Section 1: The Vitals (Summary Cards) */}
      <div className="stats-grid mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {/* Card 1: Net Profit */}
        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-muted">กำไรสุทธิ (Net Profit)</h3>
            <TrendingUp size={20} className={netProfit >= 0 ? 'text-success' : 'text-danger'} />
          </div>
          <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            ฿{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <div style={{ height: '4px', background: netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', borderRadius: '2px' }} />
        </div>

        {/* Card 2: Net Profit Margin */}
        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-muted">Profit Margin %</h3>
            <Layers size={20} className="text-info" />
          </div>
          <p className="text-2xl font-bold text-info">
            {financialMetrics.actualRevenue > 0 ? ((netProfit / financialMetrics.actualRevenue) * 100).toFixed(1) : 0}%
          </p>
          <p className="text-xs text-muted">ของรายรับรวม</p>
        </div>

        {/* Card 3: Safe Discrepancy (Highlighted) */}
        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', border: reconData?.discrepancy_amount < 0 ? '2px solid var(--accent-danger)' : 'none' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-muted">ส่วนต่างตู้เซฟ</h3>
            {reconData?.discrepancy_amount < 0 ? <AlertTriangle size={20} className="text-danger animate-pulse" /> : <Lock size={20} className="text-muted" />}
          </div>
          <p className={`text-2xl font-bold ${!reconData ? 'text-muted' : (reconData.discrepancy_amount < 0 ? 'text-danger' : (reconData.discrepancy_amount > 0 ? 'text-warning' : 'text-success'))}`}>
            ฿{reconData ? Number(reconData.discrepancy_amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
          </p>
          {reconData?.discrepancy_amount < 0 && <p className="text-[10px] text-danger font-bold">⚠️ เงินขาด ต้องตรวจสอบ!</p>}
        </div>

        {/* Card 4: Total Revenue */}
        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-muted">รายรับรวม</h3>
            <DollarSign size={20} className="text-primary" />
          </div>
          <p className="text-2xl font-bold text-primary">฿{financialMetrics.actualRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted">ไม่รวมสวัสดิการพนักงาน</p>
        </div>
      </div>

      {/* Section 2: Safe Reconciliation & Shift Integration (Resultion 1 & 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: EOD Reconciliation Console */}
        <div className="card" style={{ border: '2px solid var(--accent-primary)20', background: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="text-primary" size={20} />
            <h4 style={{ fontSize: '16px', fontWeight: 700 }}>บันทึกและยืนยันยอดตู้เซฟประจำวัน (EOD)</h4>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-tertiary rounded-lg">
                <span className="text-[10px] text-muted block mb-1 uppercase tracking-wider">ยอดเงินยกมา (Opening)</span>
                <span className="text-lg font-bold">฿{(reconData?.opening_balance || 0).toLocaleString()}</span>
              </div>
              <div className="p-3 bg-tertiary rounded-lg">
                <span className="text-[10px] text-muted block mb-1 uppercase tracking-wider">ยอดขายเงินสด (Cash Sales)</span>
                <span className="text-lg font-bold text-success">+฿{totalCashSalesFromShifts.toLocaleString()}</span>
              </div>
            </div>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold">ยอดเงินสดที่ต้องมี (Expected Cash)</span>
                <span className="text-xl font-extrabold text-primary">฿{expectedSafeBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <p className="text-[11px] text-muted">คำนวณจาก: เปิดเซฟ + ยอดขายเงินสด ({shiftsData.length} กะ) - ค่าใช้จ่ายเงินสด</p>
            </div>

            <div className="form-group">
              <label className="text-sm font-bold mb-2 block">ระบุยอดเงินสดที่นับได้จริง (Actual Cash)</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="form-control text-2xl font-bold py-4 pl-10 h-auto" 
                  placeholder="0.00"
                  value={actualCashCount}
                  onChange={e => setActualCashCount(e.target.value)}
                  disabled={!isToday && reconData?.status === 'matched'}
                />
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={20} />
              </div>
            </div>

            <button 
              className="btn btn-primary w-full py-4 text-lg font-bold rounded-xl shadow-lg shadow-primary/20"
              onClick={handleSubmitReconciliation}
              disabled={isSubmittingRecon || actualCashCount === ''}
            >
              {isSubmittingRecon ? <RefreshCw className="animate-spin mr-2" /> : <Lock className="mr-2" />}
              {reconData ? 'อัปเดตและยืนยันยอดใหม่' : 'ยืนยันยอดและปิดวัน'}
            </button>
          </div>
        </div>

        {/* Right: Shifts Breakdown (Resolution 2) */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="text-muted" size={20} />
              <h4 style={{ fontSize: '15px', fontWeight: 600 }}>สรุปยอดเงินสดรายกะ (Closed Shifts)</h4>
            </div>
          </div>
          
          <div className="table-responsive" style={{ maxHeight: '320px' }}>
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>กะ / พนักงาน</th>
                  <th className="text-right">ยอดขายสด</th>
                  <th className="text-right">นำส่ง</th>
                </tr>
              </thead>
              <tbody>
                {shiftsData.length === 0 ? (
                  <tr><td colSpan="3" className="text-center py-10 text-muted">ไม่มีข้อมูลกะที่ปิดแล้วในวันนี้</td></tr>
                ) : shiftsData.map(sh => (
                  <tr key={sh.id}>
                    <td>
                      <div className="text-xs font-bold">{new Date(sh.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {sh.closed_at ? new Date(sh.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ยังไม่ปิด'}</div>
                      <div className="text-[10px] text-muted">โดย: {sh.closed_by || 'N/A'}</div>
                    </td>
                    <td className="text-right text-success">+฿{(Number(sh.expected_cash || 0) - Number(sh.opening_cash || 0)).toLocaleString()}</td>
                    <td className="text-right font-bold">฿{Number(sh.closing_cash || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 3: Safe Ledger & P&L Details (Resolution 1.3) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* P&L Details */}
        <div className="card">
          <div className="card-header pb-4 border-b">
            <h3 className="card-title">📈 รายละเอียดกำไรขาดทุน (P&L Details)</h3>
          </div>
          <div className="space-y-4 pt-4">
             <div className="flex justify-between items-center px-2">
                <span className="text-sm">รายได้จากการขายจริง (Revenue)</span>
                <span className="font-bold text-info">฿{financialMetrics.actualRevenue.toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center px-2">
                <span className="text-sm">ต้นทุนขาย (Sales COGS)</span>
                <span className="font-bold text-warning">-฿{financialMetrics.salesCogs.toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center px-2">
                <span className="text-sm">รายจ่ายดำเนินงาน (OPEX)</span>
                <span className="font-bold text-danger">-฿{opexAmount.toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center px-2">
                <span className="text-sm">ต้นทุนคงที่ (Fixed Costs)</span>
                <span className="font-bold text-danger">-฿{fixedCostAmount.toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center px-2 pt-2 border-t font-extrabold text-lg">
                <span>กำไรสุทธิ</span>
                <span className={netProfit >= 0 ? 'text-success' : 'text-danger'}>
                  ฿{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
             </div>
          </div>
        </div>

        {/* Safe Ledger */}
        <div className="card">
          <div className="card-header flex justify-between items-center pb-4 border-b">
            <h3 className="card-title">🧾 ประวัติตู้เซฟ (Safe Ledger)</h3>
            <button className="btn btn-sm btn-outline" onClick={() => setShowSafeModal(true)}>
              <DollarSign size={14} /> นำเงินเข้า/ออก (Manual)
            </button>
          </div>
          <div className="table-responsive" style={{ maxHeight: '400px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>วัน/เวลา</th>
                  <th>รายการ</th>
                  <th className="text-right">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {/* We need to fetch safe_transactions specifically for this branch safe */}
                {/* Note: In a real implementation we would fetch these in fetchData */}
                {/* For now, we'll placeholder or just reuse the existing transactions state */}
                {transactions.length === 0 ? (
                  <tr><td colSpan="3" className="text-center py-6 text-muted">ไม่มีประวัติรายการ</td></tr>
                ) : transactions.map(tx => (
                  <tr key={tx.id}>
                    <td className="text-[10px]">{new Date(tx.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      <div className="text-xs font-bold">
                        {tx.type === 'in' ? 'เงินเข้า' : (tx.type === 'out' ? 'เงินออก' : 'ปรับปรุงยอดบัญชี')}
                      </div>
                      <div className="text-[10px] text-muted truncate max-w-[150px]">{tx.reason}</div>
                    </td>
                    <td className={`text-right font-bold ${tx.type === 'in' ? 'text-success' : (tx.type === 'out' ? 'text-danger' : 'text-info')}`}>
                      {tx.type === 'in' ? '+' : '-'}{Number(tx.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Manual Action Modal */}
      {showSafeModal && (
        <div className="modal-overlay" onClick={() => setShowSafeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ทำรายการตู้เซฟ (Safe Action)</h3>
              <button className="btn-icon" onClick={() => setShowSafeModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSafeSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>ประเภทรายการ</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${safeForm.type === 'in' ? 'border-green-500 bg-green-500/10 text-green-500' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
                      <input type="radio" value="in" className="hidden" checked={safeForm.type === 'in'} onChange={() => setSafeForm({ ...safeForm, type: 'in' })} />
                      <ArrowDownRight size={18} /> นำเงินเข้า
                    </label>
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${safeForm.type === 'out' ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
                      <input type="radio" value="out" className="hidden" checked={safeForm.type === 'out'} onChange={() => setSafeForm({ ...safeForm, type: 'out' })} />
                      <ArrowUpRight size={18} /> นำเงินออก
                    </label>
                  </div>
                </div>
                <div className="form-group">
                   <label>จำนวนเงิน (บาท)</label>
                   <input type="number" className="form-control form-input" required min="0.01" step="0.01" value={safeForm.amount} onChange={e => setSafeForm({...safeForm, amount: e.target.value})} />
                </div>
                <div className="form-group">
                   <label>เหตุผล</label>
                   <textarea className="form-control form-textarea" required rows="2" value={safeForm.reason} onChange={e => setSafeForm({...safeForm, reason: e.target.value})}></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowSafeModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">ยืนยันทำรายการ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
