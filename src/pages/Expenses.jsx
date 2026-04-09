import { useState, useEffect, useRef } from 'react';
import { Receipt, Plus, CheckCircle, XCircle, Clock, Upload, FileImage, CreditCard, Banknote, Edit2, Trash2, AlertCircle, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [filterType, setFilterType] = useState('recent');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState({
    created_by: '',
    category: '',
    description: '',
    amount: '',
    expense_type: 'planned',
    payment_method: 'cash',
    notes: '',
    receipt_url: null,
  });
  const fileRef = useRef(null);
  const editFileRef = useRef(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [authorizer, setAuthorizer] = useState('');
  const { user } = useAuth();

  const managerUsers = users.filter(u => ['store_manager', 'area_manager', 'owner', 'admin'].includes(u.role));

  useEffect(() => {
    if (user?.branch_id) loadData();
  }, [user?.branch_id, filterType, selectedMonth, selectedDate]);

  async function loadData() {
    if (!user?.branch_id) return;
    setLoading(true);
    try {
      let expQuery = supabase.from('expenses')
        .select('*, creator:users!created_by(name, full_name), approver:users!approved_by(name, full_name)')
        .eq('branch_id', user.branch_id);
      
      if (!['owner', 'manager'].includes(user.role)) {
        expQuery = expQuery.eq('created_by', user.id);
      }

      if (filterType === 'month') {
        if (selectedMonth) {
          const start = new Date(`${selectedMonth}-01T00:00:00+07:00`).toISOString();
          const end = new Date(new Date(`${selectedMonth}-01T00:00:00+07:00`).getFullYear(), new Date(`${selectedMonth}-01T00:00:00+07:00`).getMonth() + 1, 0, 23, 59, 59).toISOString();
          expQuery = expQuery.gte('created_at', start).lte('created_at', end);
        }
        expQuery = expQuery.order('created_at', { ascending: false });
      } else if (filterType === 'date') {
        if (selectedDate) {
          const start = new Date(`${selectedDate}T00:00:00+07:00`).toISOString();
          const end = new Date(`${selectedDate}T23:59:59+07:00`).toISOString();
          expQuery = expQuery.gte('created_at', start).lte('created_at', end);
        }
        expQuery = expQuery.order('created_at', { ascending: false });
      } else {
        expQuery = expQuery.order('created_at', { ascending: false }).limit(50);
      }

      const [expRes, userRes, catRes] = await Promise.all([
        expQuery,
        supabase.from('users').select('id, name, full_name, role').eq('is_active', true).eq('branch_id', user.branch_id),
        supabase.from('expense_categories').select('*').eq('is_active', true).order('sort_order').order('name'),
      ]);
      setExpenses(expRes.data || []);
      setUsers(userRes.data || []);
      setCategories(catRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.category || !form.amount || !form.description) {
      return alert('กรุณากรอกข้อมูลให้ครบ');
    }
    
    if (!form.receipt_url) {
      return alert('กรุณาอัปโหลดรูปใบเสร็จ / สลิปโอนเงิน');
    }

    const branch_id = user?.branch_id;
    if (!branch_id) return alert('ไม่พบสาขา กรุณาเข้าสู่ระบบใหม่');

    // Get active shift if any
    const { data: shifts } = await supabase.from('shifts').select('id').eq('status', 'open').limit(1);

    const { error } = await supabase.from('expenses').insert({
      branch_id,
      shift_id: shifts?.[0]?.id || null,
      created_by: form.created_by || user?.id,
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount),
      expense_type: form.expense_type,
      payment_method: form.payment_method,
      status: 'pending',
      notes: form.notes || null,
      receipt_url: form.receipt_url,
    });

    if (error) alert('Error: ' + error.message);
    else {
      setShowModal(false);
      setForm({ category: '', description: '', amount: '', expense_type: 'planned', payment_method: 'cash', notes: '', receipt_url: null });
      loadData();
    }
  }

  const handleReceiptUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setForm(prev => ({ ...prev, receipt_url: evt.target.result }));
    reader.readAsDataURL(file);
  };

  async function handleApprove(expense) {
    const { error } = await supabase.from('expenses').update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', expense.id);

    if (!error) loadData();
  }

  async function handleReject(expense) {
    const { error } = await supabase.from('expenses').update({
      status: 'rejected',
    }).eq('id', expense.id);

    if (!error) loadData();
  }

  const openEditModal = (exp) => {
    setSelectedExpense(exp);
    setForm({
      created_by: exp.created_by,
      category: exp.category,
      description: exp.description,
      amount: exp.amount.toString(),
      expense_type: exp.expense_type,
      payment_method: exp.payment_method,
      notes: exp.notes || '',
      receipt_url: exp.receipt_url || null,
    });
    setActionReason('');
    setAuthorizer('');
    setShowEditModal(true);
  };

  const openCancelPrompt = (exp) => {
    setSelectedExpense(exp);
    setActionReason('');
    setAuthorizer('');
    setShowCancelPrompt(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!actionReason || !authorizer) {
      alert("กรุณาระบุผู้อนุมัติและเหตุผลในการแก้ไข");
      return;
    }
    /* 
    if (!form.receipt_url) {
      alert("กรุณาอัปโหลดรูปใบเสร็จ / สลิปโอนเงิน");
      return;
    }
    */

    const { error } = await supabase.from('expenses').update({
      created_by: form.created_by || selectedExpense.created_by,
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount),
      expense_type: form.expense_type,
      payment_method: form.payment_method,
      notes: form.notes || null,
      receipt_url: form.receipt_url,
      edit_reason: `[โดย ${users.find(u => u.id === authorizer)?.name}] ${actionReason}`,
      status: 'pending' // Reset status so it can be re-approved
    }).eq('id', selectedExpense.id);

    if (error) alert('Error: ' + error.message);
    else {
      setShowEditModal(false);
      loadData();
    }
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    if (!actionReason || !authorizer) {
      alert("กรุณาระบุผู้อนุมัติและเหตุผลในการยกเลิก");
      return;
    }

    const { error } = await supabase.from('expenses').update({
      status: 'cancelled',
      cancel_reason: `[โดย ${users.find(u => u.id === authorizer)?.name}] ${actionReason}`
    }).eq('id', selectedExpense.id);

    if (error) alert('Error: ' + error.message);
    else {
      setShowCancelPrompt(false);
      loadData();
    }
  };

  const activeSet = expenses.filter(e => {
    const matchCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchPayment = paymentFilter === 'all' || e.payment_method === paymentFilter;
    return matchCategory && matchPayment;
  });

  const filtered = activeSet.filter(e => filter === 'all' || e.status === filter);

  const totalPending = activeSet.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const totalApproved = activeSet.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
  const totalAll = activeSet.filter(e => e.status !== 'cancelled' && e.status !== 'rejected').reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>บันทึกค่าใช้จ่าย</h3>
          <p className="text-sm text-muted">M3B: Expense Entry — บันทึกรายจ่ายทั้งแบบวางแผนและฉุกเฉิน</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> เพิ่มค่าใช้จ่าย (OPEX)
        </button>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '16px', background: 'var(--accent-info-bg)', color: 'var(--accent-info)', borderRadius: 'var(--radius-sm)' }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>ประกาศสำคัญ:</strong> ห้ามคีย์ค่า "วัตถุดิบ" ในหน้านี้โดยเด็ดขาด! ค่าวัตถุดิบจะถูกบันทึกอัตโนมัติมาจากหน้า <b>สั่งซื้อวัตถุดิบ (Purchase Orders)</b> หน้านี้ใช้สำหรับค่าใช้จ่ายปฏิบัติการ (OPEX) เช่น ค่าเช่า, ค่าน้ำไฟ, เงินเดือน, วัสดุสิ้นเปลือง ฯลฯ เท่านั้น
          </div>
        </div>
      </div>

      {/* Stats */}
      {['owner', 'manager'].includes(user?.role) && (
        <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon orange">
            <Receipt size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{totalAll.toLocaleString()}</h3>
            <p>ค่าใช้จ่ายทั้งหมด</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <Clock size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{totalPending.toLocaleString()}</h3>
            <p>รออนุมัติ</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{totalApproved.toLocaleString()}</h3>
            <p>อนุมัติแล้ว</p>
          </div>
        </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-400 w-16">สถานะ:</span>
          <div className="flex flex-wrap gap-2">
            {[
              { val: 'all', label: 'ทั้งหมด' },
              { val: 'pending', label: '⏳ รออนุมัติ' },
              { val: 'approved', label: '✅ อนุมัติ' },
              { val: 'rejected', label: '❌ ไม่อนุมัติ' },
              { val: 'cancelled', label: '🚫 ยกเลิก' },
            ].map(f => (
              <button
                key={f.val}
                className={`pos-category-btn text-xs px-3 py-1.5 ${filter === f.val ? 'active' : ''}`}
                onClick={() => setFilter(f.val)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-400">แสดงผล:</span>
            <select 
              className="form-select bg-slate-900 border-slate-700 text-sm py-1.5 pr-8 pl-3 rounded-lg"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="recent">50 ล่าสุด</option>
              <option value="date">รายวัน</option>
              <option value="month">รายเดือน</option>
            </select>
          </div>

          {filterType === 'date' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="form-input bg-slate-900 border-slate-700 text-sm py-1.5 px-3 rounded-lg text-white"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
            </div>
          )}

          {filterType === 'month' && (
            <div className="flex items-center gap-2">
              <input
                type="month"
                className="form-input bg-slate-900 border-slate-700 text-sm py-1.5 px-3 rounded-lg text-white"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-400">หมวดหมู่:</span>
            <select 
              className="form-select bg-slate-900 border-slate-700 text-sm py-1.5 pr-8 pl-3 rounded-lg"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="all">ทั้งหมด</option>
              <option value="วัตถุดิบ (Raw Materials)">วัตถุดิบ (Raw Materials)</option>
              {categories
                .filter(c => user?.role !== 'staff' || !c.is_admin_only)
                .filter(c => !c.name.includes('วัตถุดิบ') && !c.name.includes('Raw Material'))
                .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-400">ช่องทาง:</span>
            <select 
              className="form-select bg-slate-900 border-slate-700 text-sm py-1.5 pr-8 pl-3 rounded-lg"
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
            >
              <option value="all">ทั้งหมด</option>
              <option value="cash">เงินสด</option>
              <option value="transfer">เงินโอน</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>หมวด</th>
                <th>รายละเอียด</th>
                <th>จำนวน</th>
                <th>ช่องทาง</th>
                <th>ผู้บันทึก</th>
                <th>สถานะ</th>
                <th>วันที่</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9"><div className="empty-state"><Receipt size={48} /><h3>ยังไม่มีรายจ่าย</h3><p>กดปุ่ม "เพิ่มค่าใช้จ่าย"</p></div></td></tr>
              ) : (
                filtered.map(exp => (
                  <tr key={exp.id}>
                    <td><span className="badge badge-purple">{exp.category}</span></td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500, maxWidth: '200px' }}>
                      {exp.description}
                      {exp.receipt_url && (
                        <a href={exp.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 ml-2 bg-blue-500/10 px-2 py-0.5 rounded">
                          <FileImage size={12} /> ดูสลิป
                        </a>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-danger)' }}>฿{Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`badge ${exp.payment_method === 'cash' ? 'badge-warning' : 'badge-info'}`}>
                        {exp.payment_method === 'cash' ? '💵 เงินสด' : '🏦 เงินโอน'}
                      </span>
                    </td>
                    <td>{exp.creator?.name || '—'}</td>
                    <td>
                      <span className={`badge ${exp.status === 'approved' ? 'badge-success' : exp.status === 'rejected' ? 'badge-danger' : exp.status === 'cancelled' ? 'badge-secondary' : 'badge-warning'}`}>
                        {exp.status === 'approved' ? '✅ อนุมัติ' : exp.status === 'rejected' ? '❌ ไม่อนุมัติ' : exp.status === 'cancelled' ? '🚫 ยกเลิก' : '⏳ รอ'}
                      </span>
                      {exp.status === 'cancelled' && exp.cancel_reason && (
                        <div className="text-[10px] text-slate-500 mt-1 flex items-start max-w-xs">
                          <AlertCircle size={10} className="mr-1 mt-0.5 shrink-0" /> {exp.cancel_reason}
                        </div>
                      )}
                    </td>
                    <td>{new Date(exp.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td>
                    <td>
                      <div className="flex gap-2">
                        {exp.status === 'pending' && ['owner', 'manager'].includes(user?.role) && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => handleApprove(exp)} title="อนุมัติ">
                              <CheckCircle size={14} />
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleReject(exp)} title="ไม่อนุมัติ">
                              <XCircle size={14} />
                            </button>
                          </>
                        )}
                        {exp.status !== 'cancelled' && !(user?.role === 'staff' && exp.status === 'approved') && (
                          <>
                            <button className="btn btn-sm border border-slate-600 text-slate-300 hover:text-blue-400 hover:border-blue-500 bg-transparent py-1 px-2" onClick={() => openEditModal(exp)} title="แก้ไข">
                              <Edit2 size={14} />
                            </button>
                            <button className="btn btn-sm border border-slate-600 text-slate-300 hover:text-red-400 hover:border-red-500 bg-transparent py-1 px-2" onClick={() => openCancelPrompt(exp)} title="ยกเลิกรายการ">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เพิ่มค่าใช้จ่าย</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {['area_manager', 'owner', 'admin'].includes(user?.role) && (
                  <div className="form-group">
                    <label className="form-label text-amber-500">ผู้ทำรายการ (ระบุแทนพนักงาน)</label>
                    <select className="form-select border-amber-500/30 bg-amber-500/5 focus:border-amber-500" value={form.created_by || ''} onChange={e => setForm({ ...form, created_by: e.target.value })}>
                      <option value="">-- ตัวฉันเอง ({user?.name}) --</option>
                      {users.map(u => <option key={u.id} value={u.id}>[{u.role}] {u.full_name || u.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">หมวดหมู่ *</label>
                  <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required>
                    <option value="">-- เลือก --</option>
                    {categories
                      .filter(c => user?.role !== 'staff' || !c.is_admin_only)
                      .filter(c => !c.name.includes('วัตถุดิบ') && !c.name.includes('Raw Material'))
                      .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">รายละเอียด *</label>
                  <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="เช่น ซื้อน้ำแก้วจากร้านขายส่ง" required />
                </div>
                <div className="form-group">
                  <label className="form-label">จำนวนเงิน (บาท) *</label>
                  <input type="number" className="form-input" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" required min="0" step="0.01" />
                </div>

                <div className="form-group">
                  <label className="form-label">ช่องทางการชำระเงิน *</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${form.payment_method === 'cash' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'}`}>
                      <input type="radio" name="payment_method" value="cash" className="hidden" checked={form.payment_method === 'cash'} onChange={() => setForm({ ...form, payment_method: 'cash' })} />
                      <Banknote size={18} />
                      <span className="font-medium text-sm">เงินสด (ลิ้นชัก)</span>
                    </label>
                    <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${form.payment_method === 'transfer' ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'}`}>
                      <input type="radio" name="payment_method" value="transfer" className="hidden" checked={form.payment_method === 'transfer'} onChange={() => setForm({ ...form, payment_method: 'transfer' })} />
                      <CreditCard size={18} />
                      <span className="font-medium text-sm">เงินโอน (ไม่หักลิ้นชัก)</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label mb-2 block">รูปใบเสร็จ / สลิปโอนเงิน *</label>
                  <div

                    onClick={() => fileRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-600 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer group relative overflow-hidden h-32"
                  >
                    {form.receipt_url ? (
                      <>
                        <img src={form.receipt_url} alt="receipt preview" className="h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <p className="text-white text-xs font-medium">เปลี่ยนรูปภาพ</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload size={24} className="text-slate-500 mb-2 group-hover:text-blue-400 transition-colors" />
                        <p className="text-slate-400 text-xs font-medium">คลิกเพื่ออัปโหลดรูปภาพ</p>
                        <p className="text-slate-500 text-[10px] mt-1">ไฟล์ JPG, PNG</p>
                      </>
                    )}
                  </div>
                  <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={handleReceiptUpload} />
                  {form.receipt_url && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, receipt_url: null }))} className="text-[10px] text-red-400 hover:text-red-300 mt-2 text-center w-full">
                      ยกเลิกรูปภาพ
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="หมายเหตุเพิ่มเติม" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary"><Receipt size={16} /> บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>แก้ไขค่าใช้จ่าย</h3>
              <button className="btn-icon" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div className="p-4 mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 space-y-3">
                  <div className="form-group mb-0">
                    <label className="form-label text-blue-400">ผู้อนุมัติการแก้ไข (ผจก.เขตขึ้นไป) *</label>
                    <select className="form-select border-blue-500/30" value={authorizer} onChange={e => setAuthorizer(e.target.value)} required>
                      <option value="">-- เลือกผู้อนุมัติ --</option>
                      {users.filter(u => ['manager', 'owner'].includes(u.role)).map(u => <option key={u.id} value={u.id}>[{u.role}] {u.full_name || u.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-blue-400">เหตุผลที่แก้ไข *</label>
                    <input type="text" className="form-input border-blue-500/30" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="เช่น ใส่จำนวนเงินผิด..." required />
                  </div>
                </div>

                {['area_manager', 'owner', 'admin'].includes(user?.role) && (
                  <div className="form-group">
                    <label className="form-label text-amber-500">ผู้ทำรายการ (แก้ไขผู้บันทึก)</label>
                    <select className="form-select border-amber-500/30 bg-amber-500/5 focus:border-amber-500" value={form.created_by || ''} onChange={e => setForm({ ...form, created_by: e.target.value })}>
                      <option value="">-- ตัวฉันเอง ({user?.name}) --</option>
                      {users.map(u => <option key={u.id} value={u.id}>[{u.role}] {u.full_name || u.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">หมวดหมู่ *</label>
                  <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required>
                    <option value="">-- เลือก --</option>
                    {categories
                      .filter(c => user?.role !== 'staff' || !c.is_admin_only)
                      .filter(c => !c.name.includes('วัตถุดิบ') && !c.name.includes('Raw Material'))
                      .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">รายละเอียด *</label>
                  <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">จำนวนเงิน (บาท) *</label>
                  <input type="number" className="form-input" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required min="0" step="0.01" />
                </div>

                <div className="form-group">
                  <label className="form-label">ช่องทางการชำระเงิน *</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${form.payment_method === 'cash' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
                      <input type="radio" name="payment_method_edit" value="cash" className="hidden" checked={form.payment_method === 'cash'} onChange={() => setForm({ ...form, payment_method: 'cash' })} />
                      <Banknote size={18} />
                      <span className="font-medium text-sm">เงินสด</span>
                    </label>
                    <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${form.payment_method === 'transfer' ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
                      <input type="radio" name="payment_method_edit" value="transfer" className="hidden" checked={form.payment_method === 'transfer'} onChange={() => setForm({ ...form, payment_method: 'transfer' })} />
                      <CreditCard size={18} />
                      <span className="font-medium text-sm">เงินโอน</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label mb-2 block">รูปใบเสร็จ / สลิปโอนเงิน *</label>
                  <div
                    onClick={() => editFileRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-600 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer group relative overflow-hidden h-32"
                  >
                    {form.receipt_url ? (
                      <>
                        <img src={form.receipt_url} alt="receipt preview" className="h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <p className="text-white text-xs font-medium">เปลี่ยนรูปภาพ</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload size={24} className="text-slate-500 mb-2 group-hover:text-blue-400 transition-colors" />
                        <p className="text-slate-400 text-xs font-medium">คลิกเพื่ออัปโหลดรูปภาพ</p>
                        <p className="text-slate-500 text-[10px] mt-1">ไฟล์ JPG, PNG</p>
                      </>
                    )}
                  </div>
                  <input type="file" ref={editFileRef} accept="image/*" className="hidden" onChange={handleReceiptUpload} />
                  {form.receipt_url && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, receipt_url: null }))} className="text-[10px] text-red-400 hover:text-red-300 mt-2 text-center w-full">
                      ยกเลิกรูปภาพ
                    </button>
                  )}
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary bg-blue-600 hover:bg-blue-500"><Save className="mr-2" size={16} /> บันทึกการแก้ไข</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Expense Prompt */}
      {showCancelPrompt && (
        <div className="modal-overlay" onClick={() => setShowCancelPrompt(false)}>
          <div className="modal w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header border-b-0 pb-0">
              <h3 className="text-red-400 flex items-center gap-2">
                <AlertCircle size={20} /> ยืนยันการยกเลิกรายจ่าย
              </h3>
              <button className="btn-icon" onClick={() => setShowCancelPrompt(false)}>✕</button>
            </div>
            <form onSubmit={handleCancelSubmit}>
              <div className="modal-body pt-2 space-y-4">
                <p className="text-slate-300 text-sm">
                  คุณกำลังจะยกเลิกรายจ่าย: <strong className="text-white">{selectedExpense?.description}</strong> มูลค่า ฿{Number(selectedExpense?.amount).toLocaleString()}
                </p>
                <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 space-y-3">
                  <div className="form-group mb-0">
                    <label className="form-label text-red-400">ผู้อนุมัติยกเลิก (ผจก.เขตขึ้นไป) *</label>
                    <select className="form-select border-red-500/30" value={authorizer} onChange={e => setAuthorizer(e.target.value)} required>
                      <option value="">-- เลือกผู้อนุมัติ --</option>
                      {users.filter(u => ['manager', 'owner'].includes(u.role)).map(u => <option key={u.id} value={u.id}>[{u.role}] {u.full_name || u.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-red-400">เหตุผลที่ยกเลิก *</label>
                    <input type="text" className="form-input border-red-500/30 focus:border-red-500" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="เช่น ซ้ำซ้อน, ยกเลิกการซื้อ..." required />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCancelPrompt(false)}>กลับ</button>
                <button type="submit" className="btn btn-danger"><Trash2 className="mr-2" size={16} /> ยืนยันยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
