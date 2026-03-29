import { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  CheckCircle, 
  Clock,
  Trash2,
  AlertCircle,
  Banknote,
  CreditCard
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/*
  Supabase Schema reference required for this to work:
  create table purchase_orders (
    id uuid primary key default uuid_generate_v4(),
    branch_id uuid references branches(id),
    po_number text not null,
    supplier_name text,
    status text default 'pending', -- 'pending', 'received', 'cancelled'
    total_amount numeric default 0,
    created_by uuid references users(id),
    received_by uuid references users(id),
    created_at timestamp with time zone default timezone('utc'::text, now()),
    received_at timestamp with time zone
  );

  create table purchase_order_items (
    id uuid primary key default uuid_generate_v4(),
    po_id uuid references purchase_orders(id) on delete cascade,
    inventory_item_id uuid references inventory_items(id),
    qty_ordered numeric not null,
    qty_received numeric,
    unit_cost numeric not null,
    total_cost numeric not null
  );
*/

export default function PurchaseOrders() {
  const [pos, setPos] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form State
  const [headerForm, setHeaderForm] = useState({
    supplier_name: '',
    payment_method: 'transfer'
  });
  const [lineItems, setLineItems] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.branch_id) loadData();
  }, [user?.branch_id]);

  async function loadData() {
    if (!user?.branch_id) return;
    setLoading(true);
    try {
      // 1. Fetch POs
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          creator:users!created_by(name, full_name),
          receiver:users!received_by(name, full_name),
          items:purchase_order_items(id, inventory_item_id, qty_ordered, qty_received, unit_cost, total_cost)
        `)
        .eq('branch_id', user.branch_id)
        .order('created_at', { ascending: false });

      if (poError && poError.code !== '42P01') console.error(poError);

      // 2. Fetch Inventory Items for dropdown — only Recipe Items (trackable stock)
      const { data: invData, error: invErr } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('is_active', true)
        .eq('branch_id', user.branch_id)
        .eq('is_recipe_item', true)   // PO: สั่งซื้อเฉพาะวัตถุดิบหลัก (ไม่ใช่ของจุกจิก)
        .order('name');
      
      if (invErr && invErr.code !== '42P01') console.error(invErr);

      setPos(poData || []);
      setInventoryItems(invData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const openCreateModal = () => {
    setHeaderForm({ supplier_name: '', payment_method: 'transfer' });
    setLineItems([]);
    setShowModal(true);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems, 
      { id: Date.now().toString(), item_id: '', qty_ordered: '', unit_cost: '' }
    ]);
  };

  const updateLineItem = (id, field, value) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const removeLineItem = (id) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const handleDelete = async (po) => {
    if (po.status === 'received') {
      alert('ไม่สามารถลบใบสั่งซื้อที่รับของแล้วได้');
      return;
    }
    const confirmDelete = window.confirm('คุณแน่ใจหรือไม่ที่จะลบใบสั่งซื้อนี้?');
    if (!confirmDelete) return;

    try {
      // Items automatically deleted if fk has ON DELETE CASCADE, otherwise delete items first
      await supabase.from('purchase_order_items').delete().eq('po_id', po.id);
      
      const { error } = await supabase.from('purchase_orders').delete().eq('id', po.id);
      if (error) throw error;
      
      // Also technically should cancel the linked expense if we can find it by description,
      // but a proper design would link expense_id in purchase_orders.
      // We will attempt to cancel the linked expense based on description match for simplicity.
      await supabase.from('expenses')
        .update({ status: 'cancelled', cancel_reason: 'ลบ PO' })
        .like('description', `%PO: ${po.po_number}%`)
        .eq('status', 'pending'); // Only cancel if still pending
      
      setShowDetailModal(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error deleting PO: ' + err.message);
    }
  };

  const handleStatusCancel = async (po) => {
    if (po.status === 'received') {
      alert('ไม่สามารถยกเลิกใบสั่งซื้อที่รับของแล้วได้');
      return;
    }
    const confirmCancel = window.confirm('ยืนยันยกเลิกรายการสั่งซื้อ?');
    if (!confirmCancel) return;

    try {
      const { error } = await supabase.from('purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', po.id);
      
      if (error) throw error;

      // Cancel the linked expense
      await supabase.from('expenses')
        .update({ status: 'cancelled', cancel_reason: 'ยกเลิก PO' })
        .like('description', `%PO: ${po.po_number}%`)
        .eq('status', 'pending');

      setShowDetailModal(null);
      loadData();
    } catch (err) {
      alert('Error cancelling: ' + err.message);
    }
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (Number(item.qty_ordered) * Number(item.unit_cost) || 0), 0);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (lineItems.length === 0) {
      alert('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    
    // Validate line items
    for (let li of lineItems) {
      if (!li.item_id || !li.qty_ordered || !li.unit_cost) {
        alert('กรุณาเลือกสินค้า กรอกจำนวนและราคาให้ครบถ้วน');
        return;
      }
    }

    try {
      const branch_id = user?.branch_id;
      if (!branch_id) return alert('ไม่พบสาขา กรุณาเข้าสู่ระบบใหม่');

      const total_amount = calculateTotal();

      // Generate sequential PO Number
      const todayPrefix = `PO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-`;
      const { data: latestPo } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .eq('branch_id', branch_id)
        .like('po_number', `${todayPrefix}%`)
        .order('po_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextSeq = 1;
      if (latestPo && latestPo.po_number && latestPo.po_number.startsWith(todayPrefix)) {
        const lastSeqStr = latestPo.po_number.substring(todayPrefix.length);
        const lastSeqNum = parseInt(lastSeqStr, 10);
        if (!isNaN(lastSeqNum)) {
          nextSeq = lastSeqNum + 1;
        }
      }
      const po_number = `${todayPrefix}${String(nextSeq).padStart(4, '0')}`;

      // 1. Insert PO Header
      const { data: newPo, error: headerErr } = await supabase
        .from('purchase_orders')
        .insert({
          branch_id,
          po_number,
          supplier_name: headerForm.supplier_name || 'ไม่ระบุ',
          status: 'pending',
          total_amount,
          created_by: user.id
        })
        .select()
        .single();

      if (headerErr) {
        if (headerErr.code === '42P01') {
          alert('Database error: Table purchase_orders does not exist. Please run migrations.');
          return;
        }
        throw headerErr;
      }

      // 2. Insert PO Items
      const itemsPayload = lineItems.map(li => ({
        po_id: newPo.id,
        inventory_item_id: li.item_id,
        qty_ordered: Number(li.qty_ordered),
        unit_cost: Number(li.unit_cost),
        total_cost: Number(li.qty_ordered) * Number(li.unit_cost)
      }));

      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // 3. Automatically create an Expense record
      // Get active shift if any
      const { data: shifts } = await supabase.from('shifts').select('id').eq('status', 'open').limit(1);

      const { error: expErr } = await supabase.from('expenses').insert({
        branch_id,
        shift_id: shifts?.[0]?.id || null,
        created_by: user.id,
        category: 'วัตถุดิบ (Raw Materials)',
        description: `สั่งซื้อวัตถุดิบ PO: ${po_number} (${headerForm.supplier_name})`,
        amount: total_amount,
        expense_type: 'planned',
        payment_method: headerForm.payment_method,
        status: 'pending', // Pending approval by manager
        notes: `สร้างอัตโนมัติจากใบสั่งซื้อ PO: ${po_number}`
      });

      if (expErr && expErr.code !== '42P01') console.error('Error creating expense:', expErr);

      setShowModal(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    }
  };

  const filteredPos = pos.filter(p => 
    p.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = pos.filter(p => p.status === 'pending').length;
  const receivedCount = pos.filter(p => p.status === 'received').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>สั่งซื้อวัตถุดิบ (Purchase Orders)</h3>
          <p className="text-sm text-muted">สั่งซื้อสินค้า และส่งรายการไปหน้ารับของพร้อมบันทึกค่าใช้จ่ายอัตโนมัติ</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={18} /> สร้างใบสั่งซื้อ (PO)
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon orange">
            <Clock size={22} />
          </div>
          <div className="stat-info">
            <h3>{pendingCount}</h3>
            <p>รอรับของ (Pending)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle size={22} />
          </div>
          <div className="stat-info">
            <h3>{receivedCount}</h3>
            <p>รับของแล้ว (Received)</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '16px', background: 'var(--accent-info-bg, rgba(59, 130, 246, 0.1))', color: 'var(--accent-info, #3b82f6)', borderRadius: 'var(--radius-sm)' }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>ข้อมูลระบบ:</strong> การสร้างใบสั่งซื้อที่นี่ ระบบจะส่งไปให้พนักงานหน้าร้านกดรับของแบบซ่อนราคา (Blind Receiving) และจะถูกลงบันทึกในหน้า "ค่าใช้จ่าย" อัตโนมัติ
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: '20px' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="ค้นหาเลขที่ PO หรือซัพพลายเออร์..." 
              style={{ paddingLeft: '36px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>เลขที่ PO</th>
                <th>วันที่เวลา</th>
                <th>ซัพพลายเออร์</th>
                <th>มูลค่ารวม</th>
                <th>สถานะ</th>
                <th>ผู้สั่งซื้อ</th>
                <th>ผู้รับของ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : filteredPos.length === 0 ? (
                <tr><td colSpan="7"><div className="empty-state"><ShoppingCart size={48}/><h3>ไม่มีใบสั่งซื้อ</h3><p>กดสร้างใบสั่งซื้อเพื่อสั่งของเข้าร้าน</p></div></td></tr>
              ) : (
                filteredPos.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setShowDetailModal(p)}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.po_number}</td>
                    <td>{new Date(p.created_at).toLocaleString('th-TH')}</td>
                    <td>{p.supplier_name || '-'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--accent-danger)' }}>฿{Number(p.total_amount || 0).toLocaleString()}</td>
                    <td>
                      {p.status === 'received' ? (
                        <span className="badge badge-success">รับแล้ว</span>
                      ) : p.status === 'cancelled' ? (
                        <span className="badge badge-secondary">ยกเลิก</span>
                      ) : (
                        <span className="badge badge-warning">รอรับของ</span>
                      )}
                    </td>
                    <td>{p.creator?.full_name || p.creator?.name || '-'}</td>
                    <td>{p.receiver?.full_name || p.receiver?.name || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>สร้างใบสั่งซื้อ (Purchase Order)</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSave} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">ชื่อผู้ขาย (ซัพพลายเออร์)</label>
                  <input type="text" className="form-input" value={headerForm.supplier_name} onChange={e => setHeaderForm({...headerForm, supplier_name: e.target.value})} placeholder="เช่น CP, ร้านเจ๊อ้วน" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">ช่องทางชำระเงินที่ตั้งไว้ (สำหรับบันทึกรายจ่าย)</label>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${headerForm.payment_method === 'cash' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
                      <input type="radio" name="payment_method" value="cash" className="hidden" checked={headerForm.payment_method === 'cash'} onChange={() => setHeaderForm({ ...headerForm, payment_method: 'cash' })} />
                      <Banknote size={16} />
                      <span className="font-medium text-xs">เงินสด</span>
                    </label>
                    <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${headerForm.payment_method === 'transfer' ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
                      <input type="radio" name="payment_method" value="transfer" className="hidden" checked={headerForm.payment_method === 'transfer'} onChange={() => setHeaderForm({ ...headerForm, payment_method: 'transfer' })} />
                      <CreditCard size={16} />
                      <span className="font-medium text-xs">เงินโอน</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600 }}>รายการสั่งซื้อ</h4>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={addLineItem}>
                    <Plus size={14} /> เพิ่มรายการ
                  </button>
                </div>

                {lineItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                    คลิก "เพิ่มรายการ" เพื่อเลือกสินค้าที่ต้องการสั่งซื้อ
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <table style={{ margin: 0 }}>
                      <thead style={{ background: 'var(--bg-tertiary)' }}>
                        <tr>
                          <th>สินค้า</th>
                          <th style={{ width: '120px' }}>จำนวน (หน่วยซื้อ)</th>
                          <th style={{ width: '130px' }}>ราคา/หน่วย (฿)</th>
                          <th style={{ width: '130px' }}>รวม (฿)</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map(li => {
                          const total = (Number(li.qty_ordered) * Number(li.unit_cost) || 0);
                          return (
                            <tr key={li.id}>
                              <td>
                                <select className="form-select" value={li.item_id} onChange={(e) => updateLineItem(li.id, 'item_id', e.target.value)}>
                                  <option value="">-- เลือกสินค้า --</option>
                                  {inventoryItems.map(inv => (
                                    <option key={inv.id} value={inv.id}>{inv.name} ({inv.purchase_unit})</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input type="number" className="form-input" min="0.01" step="0.01" value={li.qty_ordered} onChange={(e) => updateLineItem(li.id, 'qty_ordered', e.target.value)} />
                              </td>
                              <td>
                                <input type="number" className="form-input" min="0" step="0.01" value={li.unit_cost} onChange={(e) => updateLineItem(li.id, 'unit_cost', e.target.value)} />
                              </td>
                              <td style={{ color: 'var(--accent-danger)', fontWeight: 600 }}>
                                {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td>
                                <button type="button" className="btn-icon" style={{ borderColor: 'transparent', color: 'var(--accent-danger)' }} onClick={() => removeLineItem(li.id)}>
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'right', fontWeight: 600 }}>รวมทั้งสิ้น:</td>
                          <td colSpan="2" style={{ fontWeight: 700, color: 'var(--accent-danger)', fontSize: '16px' }}>
                            ฿{calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ justifyContent: 'flex-end', padding: 0, marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={16} /> บันทึกใบสั่งซื้อ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>รายละเอียดใบสั่งซื้อ: {showDetailModal.po_number}</h3>
              <button className="btn-icon" onClick={() => setShowDetailModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-sm)', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                <div><strong>ซัพพลายเออร์:</strong> {showDetailModal.supplier_name || '-'}</div>
                <div><strong>สถานะ:</strong> {
                  showDetailModal.status === 'received' ? 
                    <span style={{color: 'var(--accent-success)', fontWeight: 600}}>รับแล้ว</span> : 
                  showDetailModal.status === 'cancelled' ? 
                    <span style={{color: 'var(--text-secondary)', fontWeight: 600}}>ยกเลิก</span> : 
                    <span style={{color: 'var(--accent-warning)', fontWeight: 600}}>รอรับของ</span>
                }</div>
                <div><strong>ผู้สั่งซื้อ:</strong> {showDetailModal.creator?.full_name || showDetailModal.creator?.name || '-'}</div>
                <div><strong>ผู้รับของ:</strong> {showDetailModal.receiver?.full_name || showDetailModal.receiver?.name || '-'}</div>
                <div><strong>วันที่สั่ง:</strong> {new Date(showDetailModal.created_at).toLocaleString('th-TH')}</div>
                {showDetailModal.received_at && (
                  <div><strong>วันที่รับของ:</strong> {new Date(showDetailModal.received_at).toLocaleString('th-TH')}</div>
                )}
              </div>

              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>รายการสินค้า: {showDetailModal.items?.length || 0} รายการ</h4>
              {showDetailModal.items && showDetailModal.items.length > 0 ? (
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ margin: 0 }}>
                    <thead style={{ background: 'var(--bg-tertiary)' }}>
                      <tr>
                        <th>ชื่อสินค้า</th>
                        <th>สั่ง (หน่วยซื้อ)</th>
                        <th>รับจริง</th>
                        <th>ราคา/หน่วย</th>
                        <th>รวม (฿)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showDetailModal.items.map((item, idx) => {
                        const invItem = inventoryItems.find(i => i.id === item.inventory_item_id);
                        return (
                          <tr key={item.id || idx}>
                            <td style={{ fontWeight: 600 }}>{invItem?.name || 'สินค้าไม่ทราบ'}</td>
                            <td>{Number(item.qty_ordered || 0).toLocaleString()} {invItem?.purchase_unit || ''}</td>
                            <td style={{ color: 'var(--accent-success)' }}>
                              {item.qty_received != null ? `${Number(item.qty_received).toLocaleString()} ${invItem?.purchase_unit || ''}` : '-'}
                            </td>
                            <td>฿{Number(item.unit_cost || 0).toLocaleString()}</td>
                            <td style={{ color: 'var(--accent-danger)' }}>฿{Number(item.total_cost || 0).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'right', fontWeight: 600 }}>มูลค่ารวมใบสั่งซื้อ:</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-danger)' }}>
                            ฿{Number(showDetailModal.total_amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                  ไม่มีรายการสินค้า
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
               <div>
                  {showDetailModal.status === 'pending' && (
                    <button className="btn btn-ghost" style={{ color: 'var(--accent-warning)', marginRight: '8px' }} onClick={() => handleStatusCancel(showDetailModal)}>
                      ยกเลิกรายการ
                    </button>
                  )}
                  {showDetailModal.status !== 'received' && (
                    <button className="btn btn-ghost" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(showDetailModal)}>
                       <Trash2 size={16} /> ลบใบสั่งซื้อ
                    </button>
                  )}
               </div>
               <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={() => setShowDetailModal(null)}>ปิด</button>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
