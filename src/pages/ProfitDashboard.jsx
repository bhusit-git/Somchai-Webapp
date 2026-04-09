import { useState, useEffect } from 'react';
import { Lock, DollarSign, TrendingUp, TrendingDown, X, ArrowUpRight, ArrowDownRight, RefreshCw, Layers, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function ProfitDashboard() {
  const [safe, setSafe] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [opexAmount, setOpexAmount] = useState(0);
  const [fixedCostAmount, setFixedCostAmount] = useState(0);
  const [fixedCostDetails, setFixedCostDetails] = useState([]);
  const [opexDetails, setOpexDetails] = useState([]);
  const [loading, setLoading] = useState(true);

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
    const { data: safeData, error: safeError } = await supabase.from('manager_safes').select('*').eq('branch_id', currentBranchId).maybeSingle();
    
    let currentSafe = safeData;

    // Auto-create safe if it doesn't exist for this branch
    if (!currentSafe && !safeError) {
      const { data: newSafe } = await supabase.from('manager_safes').insert({
        branch_id: currentBranchId,
        balance: 0,
      }).select().single();
      currentSafe = newSafe;
    }

    if (currentSafe) {
      setSafe(currentSafe);
      const { data: txData } = await supabase.from('safe_transactions').select('*, creator:users!created_by(name)').eq('safe_id', currentSafe.id).order('created_at', { ascending: false }).limit(20);
      setTransactions(txData || []);
    }

    // 2. Fetch Expense Categories (พร้อม is_fixed_cost flag)
    const { data: catData } = await supabase.from('expense_categories').select('id, name, is_fixed_cost').eq('is_active', true);
    const categoryMap = {};
    (catData || []).forEach(c => { categoryMap[c.name] = c.is_fixed_cost || false; });

    // 3. Fetch Revenue (เดือนปัจจุบัน)
    const { data: revData } = await supabase.from('transactions')
      .select('total, status')
      .eq('branch_id', currentBranchId)
      .gte('created_at', startStr)
      .lte('created_at', endStr);
      
    let totalRev = 0;
    (revData || []).forEach(row => {
      const amt = Number(row.total || 0);
      if (amt < 0) totalRev += amt;
      else if (row.status === 'completed') totalRev += amt;
    });
    setRevenue(totalRev);

    // 4. Fetch ALL Expenses ประจำเดือน แล้วแยกตะกร้าอัตโนมัติ
    const { data: expData } = await supabase.from('expenses')
      .select('id, amount, category, description, created_at, receipt_url')
      .eq('branch_id', currentBranchId)
      .eq('status', 'approved')
      .gte('created_at', startStr)
      .lte('created_at', endStr)
      .order('created_at', { ascending: false });

    const allExpenses = expData || [];
    
    // แยก Fixed Cost vs OPEX ตาม is_fixed_cost flag ของ category
    const fcItems = allExpenses.filter(e => categoryMap[e.category] === true);
    const opexItems = allExpenses.filter(e => categoryMap[e.category] !== true);

    const totalFC = fcItems.reduce((s, e) => s + Number(e.amount), 0);
    const totalOPEX = opexItems.reduce((s, e) => s + Number(e.amount), 0);

    setFixedCostAmount(totalFC);
    setFixedCostDetails(fcItems);
    setOpexAmount(totalOPEX);
    setOpexDetails(opexItems);

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

  // รวม Fixed Cost ตาม category name
  const fixedCostByCategory = fixedCostDetails.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = { total: 0, count: 0 };
    acc[item.category].total += Number(item.amount);
    acc[item.category].count += 1;
    return acc;
  }, {});

  const netProfit = revenue - opexAmount - fixedCostAmount;

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

      {/* P&L Cards - Hidden from Store Manager */}
      {['owner', 'manager'].includes(user?.role) && (
        <>
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
              <p className="text-2xl text-danger font-bold">-฿{opexAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted">ดึงอัตโนมัติจากบิลที่ is_fixed_cost = false ({opexDetails.length} รายการ)</p>
            </div>

            <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div className="flex items-center justify-between w-full">
                <h3 className="text-sm font-semibold text-muted">ต้นทุนคงที่ (Fixed Costs)</h3>
                <Layers size={20} className="text-warning" />
              </div>
              <p className="text-2xl text-warning font-bold">-฿{fixedCostAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted">ดึงอัตโนมัติจากบิลที่ is_fixed_cost = true ({fixedCostDetails.length} รายการ)</p>
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
        </>
      )}

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

      <div className="grid" style={{ gridTemplateColumns: ['owner', 'manager'].includes(user?.role) ? '1fr 1fr' : '1fr', gap: '20px', marginTop: '20px' }}>
        {/* Fixed Cost — Auto-pull from expenses - Hidden from Store Manager */}
        {['owner', 'manager'].includes(user?.role) && (
        <div className="content-card">
          <div className="card-header">
            <h3 className="card-title">🏷️ ต้นทุนคงที่รายเดือน (Auto) — {currentMonth}</h3>
          </div>
          {/* สรุปตามหมวดหมู่ */}
          {Object.keys(fixedCostByCategory).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--border-primary)' }}>
              {Object.entries(fixedCostByCategory).map(([cat, data]) => (
                <div key={cat} style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cat} ({data.count} บิล)</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-warning)' }}>
                    ฿{data.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>หมวดหมู่</th>
                  <th>รายละเอียด</th>
                  <th className="text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {fixedCostDetails.length === 0 ? (
                  <tr><td colSpan="4" className="text-center text-muted" style={{ padding: '24px' }}>
                    ยังไม่มีรายจ่ายในหมวดต้นทุนคงที่เดือนนี้
                    <br />
                    <span style={{ fontSize: '11px' }}>ตั้งค่าหมวดหมู่เป็น "ต้นทุนคงที่" ที่หน้า Settings → หมวดหมู่รายจ่าย</span>
                  </td></tr>
                ) : fixedCostDetails.map(fc => (
                  <tr key={fc.id}>
                    <td style={{ fontSize: '12px' }}>{new Date(fc.created_at).toLocaleDateString('th-TH')}</td>
                    <td><span className="badge badge-outline">{fc.category}</span></td>
                    <td style={{ fontSize: '12px' }}>{fc.description || '-'}</td>
                    <td className="text-right text-warning">฿{Number(fc.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Safe Transactions */}
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
