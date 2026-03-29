import { useState, useEffect } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight, CheckCircle, Clock, Plus, X, Edit2, Trash2, Banknote, CreditCard, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function CashLedger() {
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [resolvingItem, setResolvingItem] = useState(null);
  const [resolveMethod, setResolveMethod] = useState('cash');
  const [toast, setToast] = useState(null);

  const [formData, setFormData] = useState({ type: 'payable', amount: '', reason: '' });

  const { user } = useAuth();
  const currentBranchId = user?.branch_id;
  const currentUserId = user?.id;

  useEffect(() => {
    fetchLedgers();
  }, [currentBranchId]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  async function fetchLedgers() {
    if (!currentBranchId) return;
    setLoading(true);
    
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
    
    if (editingItem) {
      const { error } = await supabase.from('cross_shift_ledgers').update({
        type: formData.type,
        amount: parseFloat(formData.amount),
        reason: formData.reason
      }).eq('id', editingItem.id);

      if (!error) {
        setShowModal(false);
        setEditingItem(null);
        setFormData({ type: 'payable', amount: '', reason: '' });
        showToast('แก้ไขข้อมูลสำเร็จ');
        fetchLedgers();
      } else {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
      }
    } else {
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
        showToast('บันทึกรายการสำเร็จ');
        fetchLedgers();
      } else {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
      }
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?')) return;
    const { error } = await supabase.from('cross_shift_ledgers').delete().eq('id', id);
    if (!error) {
      showToast('ลบรายการสำเร็จ');
      fetchLedgers();
    } else {
      showToast('เกิดข้อผิดพลาดในการลบ: ' + error.message, 'error');
    }
  }

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      type: item.type,
      amount: item.amount.toString(),
      reason: item.reason
    });
    setShowModal(true);
  };

  const openResolveModal = (item) => {
    setResolvingItem(item);
    setResolveMethod('cash'); // Default to cash (Drawer)
  };

  async function submitResolve(e) {
    e.preventDefault();
    if (!currentUserId || !resolvingItem) return;

    if (resolveMethod === 'cash') {
      // Find active shift to attach the transaction to (if exists)
      const { data: activeShifts } = await supabase
        .from('shifts')
        .select('id')
        .eq('branch_id', currentBranchId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1);
      
      const shiftId = activeShifts?.[0]?.id || null;

      // Positive Expense = Cash Out (Payable)
      // Negative Expense = Cash In (Receivable)
      const expenseAmount = resolvingItem.type === 'payable' 
        ? Number(resolvingItem.amount)
        : -Number(resolvingItem.amount);

      const categoryName = resolvingItem.type === 'payable' ? 'จ่ายเงินค้างกะ' : 'รับเงินค้างกะเข้าลิ้นชัก';
      
      const { error: expError } = await supabase.from('expenses').insert({
        branch_id: currentBranchId,
        shift_id: shiftId,
        created_by: currentUserId,
        category: categoryName,
        description: `(เคลียร์ยอด) ${resolvingItem.reason}`,
        amount: expenseAmount,
        expense_type: 'unplanned',
        payment_method: 'cash',
        status: 'approved',
        notes: 'บันทึกอัตโนมัติจากหน้าเงินค้างกะ'
      });

      if (expError) {
        showToast('เกิดข้อผิดพลาดในการตัดยอดลิ้นชัก: ' + expError.message, 'error');
        return;
      }
    }

    const { error } = await supabase
      .from('cross_shift_ledgers')
      .update({
        resolved: true,
        resolved_by: currentUserId,
        resolved_at: new Date().toISOString()
      })
      .eq('id', resolvingItem.id);

    if (!error) {
      setResolvingItem(null);
      showToast('เคลียร์ยอดสำเร็จ');
      fetchLedgers();
    } else {
      showToast('เกิดข้อผิดพลาดในการอัปเดตสถานะ: ' + error.message, 'error');
    }
  }

  const pendingPayables = ledgers.filter(l => !l.resolved && l.type === 'payable').reduce((sum, l) => sum + Number(l.amount), 0);
  const pendingReceivables = ledgers.filter(l => !l.resolved && l.type === 'receivable').reduce((sum, l) => sum + Number(l.amount), 0);

  return (
    <div className="page-container relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transform transition-all ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast.msg}</span>
        </div>
      )}

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

      <div className="card">
        <div className="card-header pb-4 border-b border-slate-700/50 mb-4 px-5 pt-5 flex justify-between items-center">
          <h3 className="card-title m-0">บันทึกเงินค้างข้ามกะ</h3>
          <button className="btn btn-primary" onClick={() => {
            setEditingItem(null);
            setFormData({ type: 'payable', amount: '', reason: '' });
            setShowModal(true);
          }}>
            <Plus size={18} />
            เพิ่มรายการบันทึก
          </button>
        </div>
        
        <div className="table-responsive px-5 pb-5">
          <table className="table w-full">
            <thead>
              <tr className="text-left border-b border-slate-700/50">
                <th className="py-3 px-2 font-medium text-slate-400">วันที่</th>
                <th className="py-3 px-2 font-medium text-slate-400">ประเภท</th>
                <th className="py-3 px-2 font-medium text-slate-400">รายละเอียด</th>
                <th className="py-3 px-2 font-medium text-slate-400">จำนวนเงิน</th>
                <th className="py-3 px-2 font-medium text-slate-400">ผู้บันทึก</th>
                <th className="py-3 px-2 font-medium text-slate-400">สถานะ</th>
                <th className="py-3 px-2 font-medium text-slate-400 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="py-8 text-center"><span className="animate-pulse text-slate-400">กำลังโหลด...</span></td></tr>
              ) : ledgers.length === 0 ? (
                <tr><td colSpan="7" className="py-8 text-center text-slate-400">ไม่พบรายการเงินค้าง</td></tr>
              ) : ledgers.map(item => (
                <tr key={item.id} className="border-b border-slate-700/30 hover:bg-slate-800/20 transition-colors">
                  <td className="py-3 px-2">{new Date(item.created_at).toLocaleDateString('th-TH')}</td>
                  <td className="py-3 px-2">
                    {item.type === 'payable' ? (
                      <span className="badge badge-warning">ค้างจ่าย (Payable)</span>
                    ) : (
                      <span className="badge badge-success">รอรับ (Receivable)</span>
                    )}
                  </td>
                  <td className="py-3 px-2 max-w-[200px] truncate">{item.reason}</td>
                  <td className="py-3 px-2 font-semibold text-[var(--text-primary)]">฿{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="py-3 px-2 text-sm">{item.creator?.name || 'Unknown'}</td>
                  <td className="py-3 px-2">
                    {item.resolved ? (
                      <div className="text-green-500 flex items-center gap-1 text-sm font-medium">
                        <CheckCircle size={14} /> เคลียร์แล้ว
                      </div>
                    ) : (
                      <div className="text-amber-500 flex items-center gap-1 text-sm font-medium">
                        <Clock size={14} /> รอดำเนินการ
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {!item.resolved && (
                      <div className="flex justify-end items-center gap-1">
                        <button 
                          className="btn btn-sm border-slate-600 text-slate-300 hover:text-blue-400 hover:border-blue-400 bg-transparent px-2 py-1 h-auto"
                          onClick={() => openEditModal(item)}
                          title="แก้ไข"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          className="btn btn-sm border-slate-600 text-slate-300 hover:text-red-400 hover:border-red-400 bg-transparent px-2 py-1 h-auto"
                          onClick={() => handleDelete(item.id)}
                          title="ลบ"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button 
                          className="btn btn-sm btn-success ml-1 px-3 py-1 h-auto" 
                          onClick={() => openResolveModal(item)}
                        >
                          เคลียร์ยอด
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content !max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header border-b border-slate-700/50 pb-4 mb-4">
              <h3 className="m-0">{editingItem ? 'แก้ไขรายการเงินค้าง' : 'เพิ่มรายการบัญชีข้ามกะ'}</h3>
              <button className="btn-icon text-slate-400 hover:text-white" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body space-y-4">
              <div className="form-group">
                <label className="text-sm font-medium text-slate-300 mb-1 block">ประเภทรายการ</label>
                <select 
                  className="form-control w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100" 
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                >
                  <option value="payable">ค้างจ่าย (กะเราค้างจ่าย ให้กะถัดไปจ่ายแทน)</option>
                  <option value="receivable">รอรับ (กะก่อนหน้าค้างเงินเรา)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="text-sm font-medium text-slate-300 mb-1 block">จำนวนเงิน (บาท)</label>
                <input 
                  type="number" 
                  className="form-control w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100" 
                  required 
                  min="0.01"
                  step="0.01"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label className="text-sm font-medium text-slate-300 mb-1 block">รายละเอียด / เหตุผล</label>
                <textarea 
                  className="form-control w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 resize-none min-h-[80px]" 
                  required 
                  rows="3"
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  placeholder="เช่น ค่าผักพี่สมร, ค่าแก๊สที่ยังไม่มาส่ง"
                ></textarea>
              </div>
              <div className="modal-footer pt-4 border-t border-slate-700/50 flex justify-end gap-2">
                <button type="button" className="btn btn-ghost hover:bg-slate-800" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">{editingItem ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Confirmation Modal */}
      {resolvingItem && (
        <div className="modal-overlay" onClick={() => setResolvingItem(null)}>
          <div className="modal-content !max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header border-b border-slate-700/50 pb-4 mb-4">
              <h3 className="text-green-500 flex items-center gap-2 m-0">
                <CheckCircle size={20} /> ยืนยันการเคลียร์ยอด
              </h3>
              <button className="btn-icon text-slate-400 hover:text-white" onClick={() => setResolvingItem(null)}><X size={20} /></button>
            </div>
            <form onSubmit={submitResolve} className="modal-body space-y-4">
              <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl mb-4 text-center">
                <p className="text-slate-300 mb-2">คุณกำลังจะเคลียร์ยอด:</p>
                <p className="text-lg font-bold text-white mb-1">{resolvingItem.reason}</p>
                <p className={`text-xl font-black ${resolvingItem.type === 'payable' ? 'text-amber-500' : 'text-green-500'}`}>
                  {resolvingItem.type === 'payable' ? 'ค้างจ่าย ' : 'รอรับ '}
                  ฿{Number(resolvingItem.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="form-group">
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                  วิธีชำระ / รับเงิน (มีผลกับเงินสดกะปัจจุบัน)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all text-center ${resolveMethod === 'cash' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800'}`}>
                    <input type="radio" name="resolve_method" value="cash" className="hidden" checked={resolveMethod === 'cash'} onChange={() => setResolveMethod('cash')} />
                    <Banknote size={24} />
                    <div>
                      <span className="font-bold text-sm block">เงินสดล้ินชัก</span>
                      <span className="text-[10px] opacity-80 leading-tight">บันทึกเป็นรายรับ/รายจ่าย<br/>ลิ้นชักกะนี้อัตโนมัติ</span>
                    </div>
                  </label>
                  <label className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all text-center ${resolveMethod === 'transfer' ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800'}`}>
                    <input type="radio" name="resolve_method" value="transfer" className="hidden" checked={resolveMethod === 'transfer'} onChange={() => setResolveMethod('transfer')} />
                    <CreditCard size={24} />
                    <div>
                      <span className="font-bold text-sm block">เงินโอน/ส่วนตัว</span>
                      <span className="text-[10px] opacity-80 leading-tight">แค่ยืนยันการเคลียร์<br/>ไม่กระทบเงินสดหน้าล้ินชัก</span>
                    </div>
                  </label>
                </div>
                {resolveMethod === 'cash' && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex gap-2 items-start">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <p>ระบบซ่อนการหัก/เพิ่มเงินสดโดยการบันทึก Expense อัตโนมัติ (จำนวนเงินจะแสดงเป็นติดลบในหน้าค่าใช้จ่ายหากเป็นยอดรอรับ)</p>
                  </div>
                )}
              </div>

              <div className="modal-footer pt-4 border-t border-slate-700/50 flex justify-end gap-2 mt-6">
                <button type="button" className="btn btn-ghost hover:bg-slate-800" onClick={() => setResolvingItem(null)}>ยกเลิก</button>
                <button type="submit" className="btn btn-success"><CheckCircle size={16} className="mr-1"/> ยืนยันเคลียร์ยอด</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
