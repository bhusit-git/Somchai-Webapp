import { useState, useEffect } from 'react';
import { ArrowLeftRight, Plus, DollarSign, Lock, Unlock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Checklist from '../components/Checklist';
import { useAuth } from '../contexts/AuthContext';

export default function Shifts() {
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(null);
  const [isChecklistComplete, setIsChecklistComplete] = useState(false);
  const [openForm, setOpenForm] = useState({ opened_by: '', opening_cash: '' });
  const [closeForm, setCloseForm] = useState({ closed_by: '', closing_cash: '', notes: '' });
  const [keyItems, setKeyItems] = useState([]);
  const [stockCounts, setStockCounts] = useState({});
  const { user } = useAuth();

  useEffect(() => { 
    if (user?.branch_id) loadData(); 
  }, [user?.branch_id]);

  async function loadData() {
    if (!user?.branch_id) return;
    setLoading(true);
    try {
      const [shiftRes, userRes, inventoryRes] = await Promise.all([
        supabase.from('shifts')
          .select('*, opener:users!opened_by(name, full_name), closer:users!closed_by(name, full_name)')
          .eq('branch_id', user.branch_id)
          .order('opened_at', { ascending: false })
          .limit(30),
        supabase.from('users').select('id, name, full_name, role').eq('is_active', true).eq('branch_id', user.branch_id),
        supabase.from('inventory_items').select('id, name, purchase_unit, stock_unit, conversion_factor').eq('is_active', true).eq('is_recipe_item', true).eq('branch_id', user.branch_id).order('name')
      ]);
      
      let loadedShifts = shiftRes.data || [];
      setKeyItems(inventoryRes?.data || []);
      
      // Calculate live cash for open shifts
      const openShifts = loadedShifts.filter(s => s.status === 'open');
      if (openShifts.length > 0) {
        const shiftIds = openShifts.map(s => s.id);
        
        const [salesRes, expRes] = await Promise.all([
           supabase.from('transactions')
             .select('shift_id, cash_received, change_amount, total, status')
             .in('shift_id', shiftIds)
             .eq('payment_method', 'cash'),
           supabase.from('expenses')
             .select('shift_id, amount')
             .in('shift_id', shiftIds)
             .eq('payment_method', 'cash')
             .neq('status', 'cancelled')
             .neq('status', 'rejected')
        ]);
        
        const salesData = salesRes.data || [];
        const expData = expRes.data || [];
        
        loadedShifts = loadedShifts.map(shift => {
          if (shift.status !== 'open') return shift;
          
          const shiftSales = salesData.filter(s => s.shift_id === shift.id);
          const shiftExp = expData.filter(e => e.shift_id === shift.id);
          
          // Net cash from sales = (cash_received - change_amount) for each transaction
          // Also handle negative total refunds adjusting cash downwards
          let totalCashSales = 0;
          shiftSales.forEach(tx => {
            const isRefund = Number(tx.total) < 0;
            if (isRefund || tx.status === 'completed') {
              // If it's a negative refund, cash_received/change_amount might not be populated or might be negative.
              // Fallback to tx.total if cash_received isn't explicitly setting the delta.
              // Easiest is to add (cash_received - change) but if that is 0 for refunds, we add `total` (which is negative)
              const received = Number(tx.cash_received || 0);
              const change = Number(tx.change_amount || 0);
              const netCash = (received > 0 || change > 0) ? (received - change) : Number(tx.total);
              totalCashSales += netCash;
            }
          });
          
          const totalCashExp = shiftExp.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
          
          // We calculate the current live cash difference (excluding opening cash to match how closing works)
          // Live Difference = Cash Sales - Cash Expenses
          const liveDifference = totalCashSales - totalCashExp;
          
          // Calculate expected cash in drawer right now
          const liveExpectedCash = Number(shift.opening_cash || 0) + liveDifference;
          
          return {
            ...shift,
            live_cash_sales: totalCashSales,
            live_cash_expenses: totalCashExp,
            live_difference: liveDifference,
            live_expected_cash: liveExpectedCash
          };
        });
      }

      setShifts(loadedShifts);
      setUsers(userRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }
  async function handleOpenShift(e) {
    e.preventDefault();
    if (!openForm.opened_by || !openForm.opening_cash) return alert('กรุณากรอกข้อมูลให้ครบ');

    const branch_id = user?.branch_id;
    if (!branch_id) return alert('ไม่พบสาขา กรุณาเข้าสู่ระบบใหม่');

    const { error } = await supabase.from('shifts').insert({
      branch_id,
      opened_by: openForm.opened_by,
      opening_cash: parseFloat(openForm.opening_cash),
      shift_date: new Date().toISOString().split('T')[0],
      status: 'open',
    });

    if (error) alert('Error: ' + error.message);
    else {
      setShowOpen(false);
      setOpenForm({ opened_by: '', opening_cash: '' });
      loadData();
    }
  }

  const openCloseShiftModal = (sh) => {
    setShowClose(sh);
    setIsChecklistComplete(false);
    const initialCounts = {};
    keyItems.forEach(item => {
      initialCounts[item.id] = { purchase_count: '', stock_count: '' };
    });
    setStockCounts(initialCounts);
  };

  async function handleCloseShift(e) {
    e.preventDefault();
    if (!closeForm.closed_by || !closeForm.closing_cash) return alert('กรุณากรอกข้อมูลให้ครบ');

    // -- TEMPORARILY DISABLED: User requested to remove mandatory stock counting for now --
    /* for (const item of keyItems) {
      const pCount = stockCounts[item.id]?.purchase_count;
      const sCount = stockCounts[item.id]?.stock_count;
      
      if ((pCount === '' || pCount === undefined) && (sCount === '' || sCount === undefined)) {
         return alert(`กรุณากรอกยอดนับสต๊อกสำหรับ: ${item.name} (หากไม่มีให้ใส่ 0)`);
      }
    } */

    const formattedStockCounts = {};
    keyItems.forEach(item => {
      const pCount = Number(stockCounts[item.id]?.purchase_count || 0);
      const sCount = Number(stockCounts[item.id]?.stock_count || 0);
      const cf = Number(item.conversion_factor) || 1;
      const totalCount = (pCount * cf) + sCount;
      
      formattedStockCounts[item.id] = {
        name: item.name,
        count: totalCount,
        purchase_count: pCount,
        stock_count: sCount,
        unit: item.stock_unit || 'ชิ้น'
      };
    });

    const closingCash = parseFloat(closeForm.closing_cash);
    // Use the dynamically calculated expected cash if available, otherwise just use opening cash (fallback)
    const expectedCash = showClose.live_expected_cash !== undefined ? showClose.live_expected_cash : parseFloat(showClose.opening_cash) || 0;
    const difference = closingCash - expectedCash;

    const { error } = await supabase.from('shifts').update({
      closed_by: closeForm.closed_by,
      closing_cash: closingCash,
      expected_cash: expectedCash,
      cash_difference: difference,
      closed_at: new Date().toISOString(),
      status: 'closed',
      notes: closeForm.notes || null,
      stock_count_data: formattedStockCounts
    }).eq('id', showClose.id);

    if (error) alert('Error: ' + error.message);
    else {
      setShowClose(null);
      setIsChecklistComplete(false);
      setCloseForm({ closed_by: '', closing_cash: '', notes: '' });
      setStockCounts({});
      loadData();
    }
  }

  const openShifts = shifts.filter(s => s.status === 'open');
  const closedShifts = shifts.filter(s => s.status === 'closed');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>จัดการกะ & ลิ้นชักเงิน</h3>
          <p className="text-sm text-muted">M2: Shift & Drawer — เปิดกะพร้อมเงินเปิดลิ้นชัก ปิดกะพร้อมนับเงิน</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowOpen(true)}>
          <Plus size={18} /> เปิดกะ
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green">
            <Unlock size={22} />
          </div>
          <div className="stat-info">
            <h3>{openShifts.length}</h3>
            <p>กะที่เปิดอยู่</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <Lock size={22} />
          </div>
          <div className="stat-info">
            <h3>{closedShifts.length}</h3>
            <p>กะที่ปิดแล้ว</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <DollarSign size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{openShifts.reduce((s, sh) => s + Number(sh.opening_cash || 0), 0).toLocaleString()}</h3>
            <p>เงินเปิดลิ้นชักรวม</p>
          </div>
        </div>
      </div>

      {/* Shifts Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">รายการกะ</div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>เปิดโดย</th>
                <th>เปิดกะ</th>
                <th>เงินเปิด</th>
                <th>เงินปิด</th>
                <th>ผลต่าง</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : shifts.length === 0 ? (
                <tr><td colSpan="8"><div className="empty-state"><ArrowLeftRight size={48}/><h3>ยังไม่มีกะ</h3><p>กดปุ่ม "เปิดกะ" เพื่อเริ่ม</p></div></td></tr>
              ) : (
                shifts.map((sh) => (
                  <tr key={sh.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sh.shift_date || new Date(sh.opened_at).toLocaleDateString('th-TH')}</td>
                    <td>{sh.opener?.full_name || sh.opener?.name || '—'}</td>
                    <td>{new Date(sh.opened_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>฿{Number(sh.opening_cash).toLocaleString()}</td>
                    <td>
                      {sh.status === 'open' 
                        ? (user?.role === 'owner' 
                            ? `(คาดหวัง) ฿${Number(sh.live_expected_cash || sh.opening_cash).toLocaleString()}` 
                            : <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>กำลังขาย...</span>)
                        : (sh.closing_cash ? `฿${Number(sh.closing_cash).toLocaleString()}` : '—')}
                    </td>
                    <td>
                      {sh.status === 'closed' ? (
                        sh.cash_difference != null ? (
                          <span style={{ color: sh.cash_difference >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 600 }}>
                            {sh.cash_difference >= 0 ? '+' : ''}฿{Number(sh.cash_difference).toLocaleString()}
                          </span>
                        ) : '—'
                      ) : (
                        user?.role === 'owner' && sh.live_difference != null ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ color: sh.live_difference >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 600, fontSize: '13px' }}>
                                  {sh.live_difference >= 0 ? '+' : ''}฿{Number(sh.live_difference).toLocaleString()}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}> (Live)</span>
                            </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${sh.status === 'open' ? 'badge-success' : 'badge-ghost'}`}>
                        {sh.status === 'open' ? '🟢 เปิด' : '⚪ ปิด'}
                      </span>
                    </td>
                    <td>
                      {sh.status === 'open' && (
                        <button className="btn btn-sm btn-warning" onClick={() => openCloseShiftModal(sh)}>
                          <Lock size={14} /> ปิดกะ
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Shift Modal */}
      {showOpen && (
        <div className="modal-overlay" onClick={() => setShowOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เปิดกะใหม่</h3>
              <button className="btn-icon" onClick={() => setShowOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleOpenShift}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">ผู้เปิดกะ *</label>
                  <select className="form-select" value={openForm.opened_by} onChange={(e) => setOpenForm({ ...openForm, opened_by: e.target.value })} required>
                    <option value="">-- เลือกพนักงาน --</option>
                    {users.filter(u => ['owner', 'manager', 'store_manager', 'staff'].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>{u.full_name || u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">เงินเปิดลิ้นชัก (บาท) *</label>
                  <input type="number" className="form-input" placeholder="เช่น 2000" value={openForm.opening_cash} onChange={(e) => setOpenForm({ ...openForm, opening_cash: e.target.value })} required min="0" step="0.01" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowOpen(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-success"><Unlock size={16} /> เปิดกะ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showClose && (
        <div className="modal-overlay" onClick={() => { setShowClose(null); setIsChecklistComplete(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ปิดกะ</h3>
              <button className="btn-icon" onClick={() => { setShowClose(null); setIsChecklistComplete(false); }}>✕</button>
            </div>
            <form onSubmit={handleCloseShift}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">ผู้ปิดกะ *</label>
                  <select className="form-select" value={closeForm.closed_by} onChange={(e) => setCloseForm({ ...closeForm, closed_by: e.target.value })} required>
                    <option value="">-- เลือกพนักงาน --</option>
                    {users.filter(u => ['owner', 'manager', 'store_manager', 'staff'].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>{u.full_name || u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">เงินปิดลิ้นชัก (บาท) *</label>
                  <input type="number" className="form-input" placeholder="นับเงินจริงทั้งหมดในลิ้นชัก" value={closeForm.closing_cash} onChange={(e) => setCloseForm({ ...closeForm, closing_cash: e.target.value })} required min="0" step="0.01" />
                </div>

                {/* -- TEMPORARILY DISABLED: User requested to remove mandatory stock counting for now -- */}
                {false && keyItems.length > 0 && (
                  <div className="form-group" style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                    <label className="form-label" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      นับสต๊อกหลักก่อนปิดกะ
                      <span className="badge badge-warning" style={{ fontSize: '10px' }}>บังคับ</span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {keyItems.map(item => {
                        const pUnit = item.purchase_unit || 'แพ็ค';
                        const sUnit = item.stock_unit || 'ชิ้น';
                        const cf = Number(item.conversion_factor) || 1;
                        const pVal = Number(stockCounts[item.id]?.purchase_count || 0);
                        const sVal = Number(stockCounts[item.id]?.stock_count || 0);
                        const liveTotal = (pVal * cf) + sVal;
                        const hasInput = stockCounts[item.id]?.purchase_count !== '' || stockCounts[item.id]?.stock_count !== '';

                        return (
                        <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', display: 'block' }}>{pUnit}</label>
                              <input 
                                type="number" 
                                className="form-input" 
                                placeholder="0" 
                                value={stockCounts[item.id]?.purchase_count !== undefined ? stockCounts[item.id].purchase_count : ''} 
                                onChange={(e) => setStockCounts({ ...stockCounts, [item.id]: { ...stockCounts[item.id], purchase_count: e.target.value } })} 
                                min="0"
                                step="any"
                              />
                            </div>
                            <span style={{ color: 'var(--text-muted)', marginTop: '16px', fontWeight: 600 }}>+</span>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', display: 'block' }}>เศษ ({sUnit})</label>
                              <input 
                                type="number" 
                                className="form-input" 
                                placeholder="0" 
                                value={stockCounts[item.id]?.stock_count !== undefined ? stockCounts[item.id].stock_count : ''} 
                                onChange={(e) => setStockCounts({ ...stockCounts, [item.id]: { ...stockCounts[item.id], stock_count: e.target.value } })} 
                                min="0"
                                step="any"
                              />
                            </div>
                            <span style={{ color: 'var(--text-muted)', marginTop: '16px' }}>=</span>
                            <div style={{ minWidth: '70px', textAlign: 'right', marginTop: '16px' }}>
                              <span style={{ fontWeight: 700, fontSize: '16px', color: hasInput && liveTotal > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>{liveTotal.toLocaleString()}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>{sUnit}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            1 {pUnit} = {cf.toLocaleString()} {sUnit}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <textarea className="form-textarea" value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} placeholder="ทอนเงินผิด, แบงก์ยับ, หรือหมายเหตุอื่นๆ" />
                </div>
                <Checklist onComplete={setIsChecklistComplete} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowClose(null); setIsChecklistComplete(false); }}>ยกเลิก</button>
                <button type="submit" className="btn btn-warning" disabled={!isChecklistComplete} style={{ opacity: isChecklistComplete ? 1 : 0.5 }}>
                  <Lock size={16} /> ยืนยันปิดกะ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
