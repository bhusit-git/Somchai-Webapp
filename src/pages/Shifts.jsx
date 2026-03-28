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
  const { user } = useAuth();

  useEffect(() => { 
    if (user?.branch_id) loadData(); 
  }, [user?.branch_id]);

  async function loadData() {
    if (!user?.branch_id) return;
    setLoading(true);
    try {
      const [shiftRes, userRes] = await Promise.all([
        supabase.from('shifts')
          .select('*, opener:users!opened_by(name, full_name), closer:users!closed_by(name, full_name)')
          .eq('branch_id', user.branch_id)
          .order('opened_at', { ascending: false })
          .limit(30),
        supabase.from('users').select('id, name, full_name, role').eq('is_active', true).eq('branch_id', user.branch_id),
      ]);
      
      let loadedShifts = shiftRes.data || [];
      
      // Calculate live cash for open shifts
      const openShifts = loadedShifts.filter(s => s.status === 'open');
      if (openShifts.length > 0) {
        const shiftIds = openShifts.map(s => s.id);
        
        const [salesRes, expRes] = await Promise.all([
           supabase.from('transactions')
             .select('shift_id, cash_received, change_amount')
             .in('shift_id', shiftIds)
             .eq('payment_method', 'cash')
             .eq('status', 'completed'),
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
          const totalCashSales = shiftSales.reduce((sum, tx) => sum + (Number(tx.cash_received || 0) - Number(tx.change_amount || 0)), 0);
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

  async function handleCloseShift(e) {
    e.preventDefault();
    if (!closeForm.closed_by || !closeForm.closing_cash) return alert('กรุณากรอกข้อมูลให้ครบ');

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
    }).eq('id', showClose.id);

    if (error) alert('Error: ' + error.message);
    else {
      setShowClose(null);
      setIsChecklistComplete(false);
      setCloseForm({ closed_by: '', closing_cash: '', notes: '' });
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
                    <td>{sh.closing_cash ? `฿${Number(sh.closing_cash).toLocaleString()}` : (sh.status === 'open' ? `(คาดหวัง) ฿${Number(sh.live_expected_cash || sh.opening_cash).toLocaleString()}` : '—')}</td>
                    <td>
                      {sh.status === 'closed' ? (
                        sh.cash_difference != null ? (
                          <span style={{ color: sh.cash_difference >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 600 }}>
                            {sh.cash_difference >= 0 ? '+' : ''}฿{Number(sh.cash_difference).toLocaleString()}
                          </span>
                        ) : '—'
                      ) : (
                        sh.live_difference != null ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ color: sh.live_difference >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 600, fontSize: '13px' }}>
                                  {sh.live_difference >= 0 ? '+' : ''}฿{Number(sh.live_difference).toLocaleString()}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}> (Live)</span>
                            </div>
                        ) : '—'
                      )}
                    </td>
                    <td>
                      <span className={`badge ${sh.status === 'open' ? 'badge-success' : 'badge-ghost'}`}>
                        {sh.status === 'open' ? '🟢 เปิด' : '⚪ ปิด'}
                      </span>
                    </td>
                    <td>
                      {sh.status === 'open' && (
                        <button className="btn btn-sm btn-warning" onClick={() => { setShowClose(sh); setIsChecklistComplete(false); }}>
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
                <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                     <span>เงินเปิดลิ้นชัก:</span>
                     <strong>฿{Number(showClose.opening_cash).toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--accent-success)' }}>
                     <span>ยอดขายเงินสด (Live):</span>
                     <strong>+฿{Number(showClose.live_cash_sales || 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--accent-danger)' }}>
                     <span>รายจ่ายเงินสด (Live):</span>
                     <strong>-฿{Number(showClose.live_cash_expenses || 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ borderTop: '1px dashed var(--border-primary)', margin: '8px 0' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px' }}>
                     <span>ยอดเงินสดที่ควรมีตามระบบ:</span>
                     <strong style={{ color: 'var(--accent-warning)' }}>฿{Number(showClose.live_expected_cash || showClose.opening_cash).toLocaleString()}</strong>
                  </div>
                </div>
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
                  <input type="number" className="form-input" placeholder="นับเงินจริงในลิ้นชัก" value={closeForm.closing_cash} onChange={(e) => setCloseForm({ ...closeForm, closing_cash: e.target.value })} required min="0" step="0.01" />
                </div>
                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <textarea className="form-textarea" value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" />
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
