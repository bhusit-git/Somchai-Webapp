import { useState, useEffect } from 'react';
import { Lock, DollarSign, TrendingUp, TrendingDown, Plus, X, ArrowUpRight, ArrowDownRight, RefreshCw, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function ProfitDashboard() {
  const [safe, setSafe] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [fixedCosts, setFixedCosts] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [expensesAmount, setExpensesAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [showCostModal, setShowCostModal] = useState(false);
  const [costForm, setCostForm] = useState({ type: '', amount: '', description: '' });

  const [showSafeModal, setShowSafeModal] = useState(false);
  const [safeForm, setSafeForm] = useState({ type: 'in', amount: '', reason: '' });

  const { user } = useAuth();
  const currentBranchId = user?.branch_id;
  const currentUserId = user?.id;
  
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  useEffect(() => {
    if (currentBranchId) fetchData();
  }, [currentBranchId]);

  async function fetchData() {
    if (!currentBranchId) return;
    setLoading(true);

    const startStr = new Date(`${currentMonth}-01T00:00:00+07:00`).toISOString();
    const endStr = new Date(new Date(`${currentMonth}-01T00:00:00+07:00`).getFullYear(), new Date(`${currentMonth}-01T00:00:00+07:00`).getMonth() + 1, 0, 23, 59, 59).toISOString();

    // 1. Fetch Manager Safe
    const { data: safeData } = await supabase.from('manager_safes').select('*').eq('branch_id', currentBranchId).single();
    if (safeData) {
      setSafe(safeData);
      const { data: txData } = await supabase.from('safe_transactions').select('*, creator:users!created_by(name)').eq('safe_id', safeData.id).order('created_at', { ascending: false }).limit(20);
      setTransactions(txData || []);
    }

    // 2. Fetch Fixed Costs
    const { data: fcData } = await supabase.from('fixed_costs').select('*').eq('branch_id', currentBranchId).eq('period_month', currentMonth).order('created_at', { ascending: false });
    if (fcData) setFixedCosts(fcData);

    // 3. Fetch Expense Categories (สำหรับ Dropdown)
    const { data: catData } = await supabase.from('expense_categories').select('*').eq('is_active', true).order('sort_order');
    if (catData) {
      setExpenseCategories(catData);
      if (catData.length > 0 && !costForm.type) {
        setCostForm(prev => ({ ...prev, type: catData[0].name }));
      }
    }

    // 4. Fetch Revenue (เดือนปัจจุบัน)
    const { data: revData } = await supabase.from('transactions')
      .select('total')
      .eq('branch_id', currentBranchId)
      .eq('status', 'completed')
      .gte('created_at', startStr)
      .lte('created_at', endStr);
    const totalRev = revData?.reduce((s, row) => s + Number(row.total), 0) || 0;
    setRevenue(totalRev);

    // 5. Fetch Expenses — ยกเว้นหมวดหมู่ที่บันทึกเป็น Fixed Cost แล้ว (ป้องกันนับซ้ำ)
    const fixedCostCategories = [...new Set((fcData || []).map(fc => fc.type))];
    const { data: expData } = await supabase.from('expenses')
      .select('amount, category')
      .eq('branch_id', currentBranchId)
      .eq('status', 'approved')
      .gte('created_at', startStr)
      .lte('created_at', endStr);
    const filteredExp = (expData || []).filter(row => !fixedCostCategories.includes(row.category));
    const totalExp = filteredExp.reduce((s, row) => s + Number(row.amount), 0);
    setExpensesAmount(totalExp);

    setLoading(false);
  }

  async function handleSafeCutoff() {
    if (!safe?.id) return;
    if (!confirm('ยืนยันตัดยอดบัญชีสะสม? การกระทำนี้จะบันทึกวันที่ปัจจุบันเป็นวันตัดรอบล่าสุด')) return;
    
    const { error } = await supabase.from('manager_safes')
      .update({ last_cutoff_date: new Date().toISOString() })
      .eq('id', safe.id);

    if (!error) fetchData();
    else alert('Error: ' + error.message);
  }

  async function handleSafeSubmit(e) {
    e.preventDefault();
    if (!safe?.id || !safeForm.amount || !currentUserId) return;

    const amt = parseFloat(safeForm.amount);
    const newBalance = safeForm.type === 'in' ? Number(safe.balance) + amt : Number(safe.balance) - amt;

    const { error: txError } = await supabase.from('safe_transactions').insert({
      safe_id: safe.id,
      type: safeForm.type,
      amount: amt,
      reason: safeForm.reason,
      created_by: currentUserId
    });

    if (!txError) {
      await supabase.from('manager_safes').update({ balance: newBalance }).eq('id', safe.id);
      setShowSafeModal(false);
      setSafeForm({ type: 'in', amount: '', reason: '' });
      fetchData();
    } else {
      alert('Error: ' + txError.message);
    }
  }

  async function handleAddCost(e) {
    e.preventDefault();
    if (!currentBranchId || !currentUserId) return;
    
    const { error } = await supabase.from('fixed_costs').insert([{
      branch_id: currentBranchId,
      period_month: currentMonth,
      type: costForm.type,
      amount: parseFloat(costForm.amount),
      description: costForm.description,
      created_by: currentUserId
    }]);

    if (!error) {
      setShowCostModal(false);
      setCostForm({ type: '', amount: '', description: '' });
      fetchData();
    } else {
      alert('Error: ' + error.message);
    }
  }

  const getTypeLabel = (type) => {
    const legacy = { rent: 'ค่าเช่าพื้นที่', salary: 'เงินเดือน', utility: 'ค่าน้ำไฟ', other: 'อื่นๆ' };
    return legacy[type] || type; // หากเป็นระบบใหม่ type จะเป็นชื่อหมวดหมู่ไปเลย
  };

  const totalFixedCosts = fixedCosts.reduce((sum, fc) => sum + Number(fc.amount), 0);
  const netProfit = revenue - expensesAmount - totalFixedCosts;

  return (
    <div className="page-container" style={{ paddingBottom: '60px' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>กระดานวิเคราะห์ตู้เซฟและกำไรสุทธิ</h3>
          <p className="text-sm text-muted">M9: Manager Safe & P&L Statement (เดือน {currentMonth})</p>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      </div>

      {/* P&L Cards */}
      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>📊 สรุปกำไรสุทธิตามกระแสเงินสด (Cash P&L) - เดือนปัจจุบัน</h4>
      <div className="stats-grid mb-6">
        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-muted">ยอดยกมา (Revenue)</h3>
            <DollarSign size={20} className="text-info" />
          </div>
          <p className="text-2xl text-info font-bold">฿{revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted">รายได้ทั้งหมดจากบิลที่ขายแล้ว</p>
        </div>

        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-muted">รายจ่ายร้าน (Purchases & OPEX)</h3>
            <TrendingDown size={20} className="text-danger" />
          </div>
          <p className="text-2xl text-danger font-bold">-฿{expensesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted">จากหน้าบันทึกค่าใช้จ่ายรายวัน</p>
        </div>

        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-muted">ต้นทุนคงที่ (Fixed Costs)</h3>
            <Layers size={20} className="text-warning" />
          </div>
          <p className="text-2xl text-warning font-bold">-฿{totalFixedCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted">บันทึกผ่านหน้านี้</p>
        </div>

        <div className={`stat-card ${netProfit >= 0 ? 'success' : 'danger'}`} style={{ border: `2px solid ${netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}50`, flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm font-bold" style={{ color: netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>กำไรสุทธิ (Net Profit)</h3>
            {netProfit >= 0 ? <TrendingUp size={20} className="text-success" /> : <TrendingDown size={20} className="text-danger" />}
          </div>
          <p className="text-2xl" style={{ color: netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 800 }}>
            {netProfit >= 0 ? '+' : '-'}฿{Math.abs(netProfit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <div style={{ height: '4px', background: netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', borderRadius: '2px', marginTop: 'auto' }} />
        </div>
      </div>

      {/* Safe Section */}
      <div className="card mb-6" style={{ background: 'linear-gradient(145deg, var(--bg-secondary), var(--bg-tertiary))', border: '1px solid var(--border-primary)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div style={{ padding: '12px', background: 'var(--accent-success-bg)', borderRadius: '12px', color: 'var(--accent-success)' }}>
              <Lock size={28} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', color: 'var(--text-muted)' }}>ยอดเงินสดในตู้เซฟ (Manager Safe Balance)</h3>
              <p style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
                ฿{safe ? Number(safe.balance).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={() => setShowSafeModal(true)}>
              <DollarSign size={16} /> นำเงินเข้า/ออก (ฝากเงิน)
            </button>
            <button className="btn btn-outline text-success border-green-500/50 hover:bg-green-500/10" onClick={handleSafeCutoff}>
              <RefreshCw size={16} /> ตัดรอบบัญชีสะสม
            </button>
          </div>
        </div>
        <div className="text-xs text-muted mt-4">
          ตัดรอบข้อมูลล่าสุด: {safe?.last_cutoff_date ? new Date(safe.last_cutoff_date).toLocaleString('th-TH') : 'ยังไม่เคยตัดรอบ'}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div className="content-card">
          <div className="card-header">
            <h3 className="card-title">ต้นทุนคงที่รายเดือน ({currentMonth})</h3>
            <button className="btn btn-sm btn-outline" onClick={() => setShowCostModal(true)}>
              <Plus size={16} /> เพิ่ม
            </button>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>หมวดหมู่</th>
                  <th>รายละเอียด</th>
                  <th className="text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {fixedCosts.length === 0 ? (
                  <tr><td colSpan="3" className="text-center text-muted">ยังไม่มีบันทึกต้นทุน</td></tr>
                ) : fixedCosts.map(fc => (
                  <tr key={fc.id}>
                    <td><span className="badge badge-outline">{getTypeLabel(fc.type)}</span></td>
                    <td>{fc.description || '-'}</td>
                    <td className="text-right text-warning">฿{Number(fc.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <h3 className="card-title">รายการเคลื่อนไหวเซฟ (Manager Safe)</h3>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>รายการ</th>
                  <th className="text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan="3" className="text-center text-muted">ไม่มีรายการเคลื่อนไหว</td></tr>
                ) : transactions.map(tx => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.created_at).toLocaleString('th-TH')}</td>
                    <td>
                      <div>
                        {tx.type === 'in' ? <span className="text-success">นำเข้าจากปิดกะ</span> : 
                         tx.type === 'out' ? <span className="text-error">นำออกฉุกเฉิน</span> : 
                         <span className="text-secondary">Owner รับยอด</span>}
                      </div>
                      <div className="text-xs text-muted">{tx.reason || '-'}</div>
                    </td>
                    <td className="text-right">
                      <span className={tx.type === 'in' ? 'text-success' : 'text-error'}>
                        {tx.type === 'in' ? '+' : '-'}฿{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCostModal && (
        <div className="modal-overlay" onClick={() => setShowCostModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>บันทึกต้นทุนคงที่ (Fixed Cost) - เดือน {currentMonth}</h3>
              <button className="btn-icon" onClick={() => setShowCostModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddCost}>
              <div className="modal-body">
                <div className="form-group">
                  <label>หมวดหมู่ (ดึงจากหน้าบันทึกรายจ่าย)</label>
                  <select 
                    className="form-control form-select" 
                    value={costForm.type}
                    onChange={e => setCostForm({...costForm, type: e.target.value})}
                    required
                  >
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {expenseCategories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>จำนวนเงิน (บาท)</label>
                  <input 
                    type="number" 
                    className="form-control form-input" 
                    required 
                    min="0"
                    step="0.01"
                    value={costForm.amount}
                    onChange={e => setCostForm({...costForm, amount: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>รายละเอียดเพิ่มเติม</label>
                  <textarea 
                    className="form-control form-textarea" 
                    rows="3"
                    value={costForm.description}
                    onChange={e => setCostForm({...costForm, description: e.target.value})}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCostModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">บันทึกคงที่</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Deposit/Withdraw Modal */}
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
                   <label>เหตุผลความจำเป็น</label>
                   <textarea className="form-control form-textarea" required rows="2" placeholder="เช่น เงินทอนตั้งต้นเริ่มสัปดาห์, นำเงินเข้าฝากบัญชีธนาคารกสิกร" value={safeForm.reason} onChange={e => setSafeForm({...safeForm, reason: e.target.value})}></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowSafeModal(false)}>ยกเลิก</button>
                <button type="submit" className={`btn ${safeForm.type === 'in' ? 'btn-success' : 'btn-danger'}`}>
                  ยืนยันทำรายการ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
