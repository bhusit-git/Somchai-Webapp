import { useState, useEffect } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight, CheckCircle, Clock, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function CashLedger() {
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ type: 'payable', amount: '', reason: '' });

  const { user } = useAuth();
  const currentBranchId = user?.branch_id;
  const currentUserId = user?.id;

  useEffect(() => {
    fetchLedgers();
  }, []);

  async function fetchLedgers() {
    setLoading(true);
    if (!currentBranchId) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('cross_shift_ledgers')
      .select(`
        *,
        creator:users!created_by(name),
        resolver:users!resolved_by(name)
      `)
      .eq('branch_id', currentBranchId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLedgers(data);
    }
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!currentBranchId || !currentUserId) return;
    
    const { error } = await supabase.from('cross_shift_ledgers').insert([{
      branch_id: currentBranchId,
      type: formData.type,
      amount: parseFloat(formData.amount),
      reason: formData.reason,
      created_by: currentUserId,
      resolved: false
    }]);

    if (!error) {
      setShowModal(false);
      setFormData({ type: 'payable', amount: '', reason: '' });
      fetchLedgers();
    }
  }

  async function handleResolve(id) {
    if (!currentUserId) return;
    
    const { error } = await supabase
      .from('cross_shift_ledgers')
      .update({
        resolved: true,
        resolved_by: currentUserId,
        resolved_at: new Date().toISOString()
      })
      .eq('id', id);

    if (!error) {
      fetchLedgers();
    }
  }

  const pendingPayables = ledgers.filter(l => !l.resolved && l.type === 'payable').reduce((sum, l) => sum + Number(l.amount), 0);
  const pendingReceivables = ledgers.filter(l => !l.resolved && l.type === 'receivable').reduce((sum, l) => sum + Number(l.amount), 0);

  return (
    <div className="page-container">
      <div className="stats-grid">
        <div className="stat-card warning">
          <div className="stat-header">
            <h3 className="stat-title">ค้างจ่ายกะถัดไป (Payable)</h3>
            <ArrowUpRight size={20} className="text-warning" />
          </div>
          <p className="stat-value">฿{pendingPayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="stat-desc">ต้องจ่ายให้ Supplier/ค่าใช้จ่ายอื่นๆ</p>
        </div>
        <div className="stat-card success">
          <div className="stat-header">
            <h3 className="stat-title">รอรับเงินเข้ากะ (Receivable)</h3>
            <ArrowDownLeft size={20} className="text-success" />
          </div>
          <p className="stat-value">฿{pendingReceivables.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="stat-desc">ยอดเงินที่กะก่อนหน้าต้องโอน/ส่งมอบให้</p>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <h3 className="card-title">บันทึกเงินค้างข้ามกะ</h3>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} />
            เพิ่มรายการบันทึก
          </button>
        </div>
        
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ประเภท</th>
                <th>รายละเอียด</th>
                <th>จำนวนเงิน</th>
                <th>ผู้บันทึก</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center">กำลังโหลด...</td></tr>
              ) : ledgers.length === 0 ? (
                <tr><td colSpan="7" className="text-center text-muted">ไม่พบรายการเงินค้าง</td></tr>
              ) : ledgers.map(item => (
                <tr key={item.id}>
                  <td>{new Date(item.created_at).toLocaleDateString('th-TH')}</td>
                  <td>
                    {item.type === 'payable' ? (
                      <span className="badge badge-warning">ค้างจ่าย (Payable)</span>
                    ) : (
                      <span className="badge badge-success">รอรับ (Receivable)</span>
                    )}
                  </td>
                  <td>{item.reason}</td>
                  <td>฿{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>{item.creator?.name || 'Unknown'}</td>
                  <td>
                    {item.resolved ? (
                      <div className="text-success flex-center gap-1">
                        <CheckCircle size={14} /> เคลียร์แล้ว
                      </div>
                    ) : (
                      <div className="text-warning flex-center gap-1">
                        <Clock size={14} /> รอดำเนินการ
                      </div>
                    )}
                  </td>
                  <td>
                    {!item.resolved && (
                      <button 
                        className="btn btn-sm btn-outline" 
                        onClick={() => handleResolve(item.id)}
                      >
                        เคลียร์ยอด
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>เพิ่มรายการบัญชีข้ามกะ</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>ประเภทรายการ</label>
                <select 
                  className="form-control" 
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                >
                  <option value="payable">ค้างจ่าย (กะเราค้างจ่าย ให้กะถัดไปจ่ายแทน)</option>
                  <option value="receivable">รอรับ (กะก่อนหน้าค้างเงินเรา)</option>
                </select>
              </div>
              <div className="form-group">
                <label>จำนวนเงิน (บาท)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  required 
                  min="1"
                  step="0.01"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>รายละเอียด / เหตุผล</label>
                <textarea 
                  className="form-control" 
                  required 
                  rows="3"
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  placeholder="เช่น ค่าผักพี่สมร, ค่าแก๊สที่ยังไม่มาส่ง"
                ></textarea>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">บันทึกรายการ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
