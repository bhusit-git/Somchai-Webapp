import { useState, useEffect } from 'react';
import { ArrowLeftRight, Plus, DollarSign, Lock, Unlock } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Shifts() {
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(null);
  const [openForm, setOpenForm] = useState({ opened_by: '', opening_cash: '' });
  const [closeForm, setCloseForm] = useState({ closed_by: '', closing_cash: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [shiftRes, userRes] = await Promise.all([
        supabase.from('shifts')
          .select('*, opener:users!opened_by(name, full_name), closer:users!closed_by(name, full_name)')
          .order('opened_at', { ascending: false })
          .limit(30),
        supabase.from('users').select('id, name, full_name, role').eq('is_active', true),
      ]);
      setShifts(shiftRes.data || []);
      setUsers(userRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleOpenShift(e) {
    e.preventDefault();
    if (!openForm.opened_by || !openForm.opening_cash) return alert('กรุณากรอกข้อมูลให้ครบ');

    const { data: branches } = await supabase.from('branches').select('id').limit(1);
    const branch_id = branches?.[0]?.id;
    if (!branch_id) return alert('ไม่พบสาขา กรุณาสร้างสาขาก่อน');

    const { error } = await supabase.from('shifts').insert({
      branch_id,
      opened_by: openForm.opened_by,
      opening_cash: parseFloat(openForm.opening_cash),
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
    const expectedCash = parseFloat(showClose.opening_cash) || 0;
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
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sh.shift_date}</td>
                    <td>{sh.opener?.full_name || sh.opener?.name || '—'}</td>
                    <td>{new Date(sh.opened_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>฿{Number(sh.opening_cash).toLocaleString()}</td>
                    <td>{sh.closing_cash ? `฿${Number(sh.closing_cash).toLocaleString()}` : '—'}</td>
                    <td>
                      {sh.cash_difference != null ? (
                        <span style={{ color: sh.cash_difference >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 600 }}>
                          {sh.cash_difference >= 0 ? '+' : ''}฿{Number(sh.cash_difference).toLocaleString()}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${sh.status === 'open' ? 'badge-success' : 'badge-ghost'}`}>
                        {sh.status === 'open' ? '🟢 เปิด' : '⚪ ปิด'}
                      </span>
                    </td>
                    <td>
                      {sh.status === 'open' && (
                        <button className="btn btn-sm btn-warning" onClick={() => setShowClose(sh)}>
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
                    {users.filter(u => ['store_manager', 'owner'].includes(u.role)).map(u => (
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
        <div className="modal-overlay" onClick={() => setShowClose(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ปิดกะ</h3>
              <button className="btn-icon" onClick={() => setShowClose(null)}>✕</button>
            </div>
            <form onSubmit={handleCloseShift}>
              <div className="modal-body">
                <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '14px' }}>
                  <strong>เงินเปิดลิ้นชัก:</strong> ฿{Number(showClose.opening_cash).toLocaleString()}
                </div>
                <div className="form-group">
                  <label className="form-label">ผู้ปิดกะ *</label>
                  <select className="form-select" value={closeForm.closed_by} onChange={(e) => setCloseForm({ ...closeForm, closed_by: e.target.value })} required>
                    <option value="">-- เลือกพนักงาน --</option>
                    {users.filter(u => ['store_manager', 'owner'].includes(u.role)).map(u => (
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowClose(null)}>ยกเลิก</button>
                <button type="submit" className="btn btn-warning"><Lock size={16} /> ยืนยันปิดกะ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
