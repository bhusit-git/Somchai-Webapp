import { useState, useEffect } from 'react';
import { 
  PackagePlus, 
  Search, 
  Plus, 
  FileText, 
  CheckCircle, 
  Clock,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/*
  Supabase Schema reference:
  create table grn_headers (
    id uuid primary key default uuid_generate_v4(),
    branch_id uuid references branches(id),
    grn_number text not null, -- e.g., GRN-20231024-001
    supplier_name text,
    invoice_ref text,
    status text default 'draft', -- 'draft', 'confirmed'
    total_value numeric default 0,
    received_by uuid references users(id),
    received_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now())
  );

  create table grn_items (
    id uuid primary key default uuid_generate_v4(),
    grn_id uuid references grn_headers(id),
    inventory_item_id uuid references inventory_items(id),
    qty_purchase numeric not null,
    qty_stock numeric not null,
    unit_cost numeric not null,
    lot_id uuid default uuid_generate_v4(),
    expiry_date date
  );
*/

export default function StockReceiving() {
  const [grns, setGrns] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingGrnId, setEditingGrnId] = useState(null);

  // Form State
  const [headerForm, setHeaderForm] = useState({
    supplier_name: '',
    invoice_ref: '',
    received_by: ''
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
      // 1. Fetch GRNs
      const { data: grnData, error: grnError } = await supabase
        .from('grn_headers')
        .select(`
          *,
          receiver:users!received_by(name, full_name),
          items:grn_items(id, inventory_item_id, qty_purchase, qty_stock, unit_cost, lot_id, expiry_date)
        `)
        .eq('branch_id', user.branch_id)
        .order('created_at', { ascending: false });

      if (grnError && grnError.code !== '42P01') console.error(grnError);

      // 2. Fetch Inventory Items for dropdown
      const { data: invData, error: invErr } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('is_active', true);
      
      if (invErr && invErr.code !== '42P01') console.error(invErr);

      setGrns(grnData || []);
      setInventoryItems(invData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const openCreateModal = () => {
    setEditingGrnId(null);
    setHeaderForm({ supplier_name: '', invoice_ref: '', received_by: user?.id || '' });
    setLineItems([]);
    setShowModal(true);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems, 
      { id: Date.now().toString(), item_id: '', qty_purchase: '', expiry_date: '' }
    ]);
  };

  const updateLineItem = (id, field, value) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        return updated;
      }
      return item;
    }));
  };

  const removeLineItem = (id) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const handleEdit = (grn) => {
    if (grn.status === 'confirmed') {
      const confirmEdit = window.confirm('เอกสารนี้ยืนยันและนำเข้าสต๊อกไปแล้ว การแก้ไขจะปรับปรุงตัวเลขสต๊อกใหม่ คุณแน่ใจหรือไม่ที่จะแก้ไข?');
      if (!confirmEdit) return;
    }

    setEditingGrnId(grn.id);
    setHeaderForm({
      supplier_name: grn.supplier_name || '',
      invoice_ref: grn.invoice_ref || '',
      received_by: grn.received_by || user?.id || ''
    });

    if (grn.items && grn.items.length > 0) {
      setLineItems(grn.items.map(item => ({
        id: item.id || Date.now().toString() + Math.random(),
        item_id: item.inventory_item_id,
        qty_purchase: item.qty_purchase,
        expiry_date: item.expiry_date || '',
        // Keep original stock for reversal logic during save
        original_qty_stock: item.qty_stock 
      })));
    } else {
      setLineItems([]);
    }

    setShowDetailModal(null);
    setShowModal(true);
  };

  const handleDelete = async (grn) => {
    const confirmDelete = window.confirm(
      grn.status === 'confirmed' 
        ? 'เอกสารนี้ยืนยันแล้ว การลบจะหักปริมาณออกจากสต๊อกคืน คุณแน่ใจที่จะลบอย่างถาวรใช่ไหม?'
        : 'คุณแน่ใจหรือไม่ที่จะลบเอกสารฉบับร่างนี้?'
    );
    if (!confirmDelete) return;

    try {
      // 1. Reverse stock if confirmed
      if (grn.status === 'confirmed' && grn.items) {
        for (const li of grn.items) {
          const invItem = inventoryItems.find(i => i.id === li.inventory_item_id);
          if (invItem) {
            const newStock = Number(invItem.current_stock || 0) - Number(li.qty_stock || 0);
            await supabase
              .from('inventory_items')
              .update({ current_stock: newStock })
              .eq('id', li.inventory_item_id);
          }
        }
      }

      // 2. Cascade delete will handle grn_items if set up in DB. 
      // If not safely set to cascade, we delete items first:
      await supabase.from('grn_items').delete().eq('grn_id', grn.id);

      // 3. Delete header
      const { error } = await supabase.from('grn_headers').delete().eq('id', grn.id);
      if (error) throw error;

      setShowDetailModal(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error deleting GRN: ' + err.message);
    }
  };

  const getStockQtyPlaceholder = (lineItem) => {
    if (!lineItem.item_id || !lineItem.qty_purchase) return '-';
    const invItem = inventoryItems.find(i => i.id === lineItem.item_id);
    if (!invItem) return '-';
    const converted = Number(lineItem.qty_purchase) * Number(invItem.conversion_factor);
    return `${converted} ${invItem.stock_unit}`;
  };

  const handleSave = async (status) => {
    if (!headerForm.supplier_name || !headerForm.received_by) {
      alert('กรุณากรอกข้อมูลผู้จำหน่ายและผู้รับของ');
      return;
    }
    if (lineItems.length === 0) {
      alert('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    
    // Validate line items
    for (let li of lineItems) {
      if (!li.item_id || !li.qty_purchase) {
        alert('กรุณาเลือกสินค้าและกรอกจำนวนให้ครบถ้วน');
        return;
      }
    }

    try {
      const branch_id = user?.branch_id;
      if (!branch_id) return alert('ไม่พบสาขา กรุณาเข้าสู่ระบบใหม่');

      // total_value not tracked here (pricing is recorded in Expenses)
      const total_value = 0;
      const grn_number = `GRN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const headerPayload = {
        branch_id,
        grn_number: editingGrnId ? undefined : grn_number, // Don't update number if editing
        supplier_name: headerForm.supplier_name,
        invoice_ref: headerForm.invoice_ref,
        received_by: headerForm.received_by,
        status,
        total_value,
        received_at: status === 'confirmed' ? new Date().toISOString() : null
      };

      let newGrn;
      
      if (editingGrnId) {
        // If editing a confirmed GRN, reverse the old stock first
        const oldGrn = grns.find(g => g.id === editingGrnId);
        if (oldGrn && oldGrn.status === 'confirmed' && oldGrn.items) {
           for (const oldItem of oldGrn.items) {
             const invItem = inventoryItems.find(i => i.id === oldItem.inventory_item_id);
             if (invItem) {
               const reversedStock = Number(invItem.current_stock || 0) - Number(oldItem.qty_stock || 0);
               await supabase.from('inventory_items').update({ current_stock: reversedStock }).eq('id', oldItem.inventory_item_id);
               // Also update the local state to reflect the reversed amount before we add the new amount
               invItem.current_stock = reversedStock; 
             }
           }
        }

        const { data, error: headerErr } = await supabase
          .from('grn_headers')
          .update(headerPayload)
          .eq('id', editingGrnId)
          .select()
          .single();
        if (headerErr) throw headerErr;
        newGrn = data || { id: editingGrnId };

        // Delete old line items
        await supabase.from('grn_items').delete().eq('grn_id', editingGrnId);
      } else {
        const { data, error: headerErr } = await supabase
          .from('grn_headers')
          .insert(headerPayload)
          .select()
          .single();
        if (headerErr) throw headerErr;
        newGrn = data;
      }

      // Insert line items
      const itemsPayload = lineItems.map(li => {
        const invItem = inventoryItems.find(i => i.id === li.item_id);
        const qty_stock = Number(li.qty_purchase) * (invItem ? Number(invItem.conversion_factor) : 1);
        
        return {
          grn_id: newGrn.id,
          inventory_item_id: li.item_id,
          qty_purchase: Number(li.qty_purchase),
          qty_stock,
          expiry_date: li.expiry_date || null,
          unit_cost: 0,
          // Fallbacks for older schema to prevent NOT NULL constraint errors
          quantity: Number(li.qty_purchase),
          unit: invItem ? invItem.purchase_unit : 'หน่วย',
          cost_per_unit: 0,
          total_cost: 0
        };
      });

      const { error: itemsErr } = await supabase.from('grn_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // If confirmed, update inventory current_stock (เพิ่มสต๊อกตามจำนวนหน่วยสต๊อก)
      if (status === 'confirmed') {
        for (const li of itemsPayload) {
          const invItem = inventoryItems.find(i => i.id === li.inventory_item_id);
          if (invItem) {
            const newStock = Number(invItem.current_stock || 0) + li.qty_stock;
            const { error: stockErr } = await supabase
              .from('inventory_items')
              .update({ current_stock: newStock })
              .eq('id', li.inventory_item_id);
            if (stockErr) console.error('Error updating stock:', stockErr);
          }
        }
      }

      setShowModal(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error saving GRN: ' + err.message);
    }
  };

  const filteredGrns = grns.filter(g => 
    g.grn_number?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = grns.filter(g => g.status === 'draft').length;
  const confirmedTodayCount = grns.filter(g => {
    // Bug fix: use received_at (the actual confirmation timestamp) not created_at
    const dateField = g.received_at || g.created_at;
    return g.status === 'confirmed' &&
      new Date(dateField).toDateString() === new Date().toDateString();
  }).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>รับสินค้าเข้า (GRN)</h3>
          <p className="text-sm text-muted">M7B: บันทึกรับสินค้าจาก Supplier พร้อมแปลงหน่วยเป็นสต๊อกอัตโนมัติ</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={18} /> สร้างใบรับสินค้า (GRN)
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
            <p>GRN รอดำเนินการ (Draft)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle size={22} />
          </div>
          <div className="stat-info">
            <h3>{confirmedTodayCount}</h3>
            <p>GRN ยืนยันแล้ว (วันนี้)</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '16px', background: 'var(--accent-warning-bg)', color: 'var(--accent-warning)', borderRadius: 'var(--radius-sm)' }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>ข้อควรระวัง:</strong> เมื่อกด "ยืนยันรับเข้าสต๊อก" แล้ว ระบบจะอัปเดตปริมาณสินค้าและต้นทุนเฉลี่ย (WAC) ทันที จะไม่สามารถแก้ไขได้อีก หากต้องการแก้ไขต้องทำใบ Credit Note เท่านั้น
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
              placeholder="ค้นหาเลขที่เอกสาร, ผู้จำหน่าย..." 
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
                <th>เลขที่ GRN</th>
                <th>วันที่เวลา</th>
                <th>ผู้จำหน่าย</th>
                <th>อ้างอิงบิล</th>
                <th>จำนวนรายการ</th>
                <th>จำนวน (หน่วยซื้อ)</th>
                <th>สถานะ</th>
                <th>ผู้รับของ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : filteredGrns.length === 0 ? (
                <tr><td colSpan="8"><div className="empty-state"><PackagePlus size={48}/><h3>ไม่มีประวัติ GRN</h3><p>กดสร้างใบรับสินค้าเพื่อเริ่มต้นรับของเข้าสต๊อก</p></div></td></tr>
              ) : (
                filteredGrns.map((g) => (
                  <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => setShowDetailModal(g)}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.grn_number}</td>
                    <td>{new Date(g.created_at).toLocaleString('th-TH')}</td>
                    <td>{g.supplier_name}</td>
                    <td>{g.invoice_ref || '-'}</td>
                    <td>{g.items?.length || 0}</td>
                    <td style={{ fontWeight: 600 }}>{g.items?.reduce((sum, i) => sum + Number(i.qty_purchase || 0), 0).toLocaleString()}</td>
                    <td>
                      {g.status === 'confirmed' ? (
                        <span className="badge badge-success">ยืนยันแล้ว</span>
                      ) : (
                        <span className="badge badge-warning">ฉบับร่าง (Draft)</span>
                      )}
                    </td>
                    <td>{g.receiver?.full_name || g.receiver?.name || '-'}</td>
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
              <h3>{editingGrnId ? 'แก้ไขใบรับสินค้า' : 'รับสินค้าเข้า (Goods Received Note)'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">ผู้จำหน่าย (Supplier) *</label>
                  <input type="text" className="form-input" value={headerForm.supplier_name} onChange={e => setHeaderForm({...headerForm, supplier_name: e.target.value})} placeholder="ชื่อร้าน/บริษัท" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">อ้างอิงใบส่งของ/ใบกำกับภาษี</label>
                  <input type="text" className="form-input" value={headerForm.invoice_ref} onChange={e => setHeaderForm({...headerForm, invoice_ref: e.target.value})} placeholder="เลขที่บิล" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">ผู้รับของ</label>
                  <input
                    type="text"
                    className="form-input"
                    value={user?.full_name || user?.name || 'ผู้ใช้งานปัจจุบัน'}
                    disabled
                    style={{ opacity: 0.7 }}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600 }}>รายการสินค้า</h4>
                  <button className="btn btn-sm btn-ghost" onClick={addLineItem}>
                    <Plus size={14} /> เพิ่มรายการ
                  </button>
                </div>

                {lineItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                    คลิก "เพิ่มรายการ" เพื่อเลือกสินค้าที่ต้องการรับเข้า
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <table style={{ margin: 0 }}>
                      <thead style={{ background: 'var(--bg-tertiary)' }}>
                        <tr>
                          <th>สินค้า</th>
                          <th style={{ width: '120px' }}>จำนวนรับ (หน่วยซื้อ)</th>
                          <th style={{ width: '130px' }}>วันหมดอายุ</th>
                          <th style={{ width: '160px' }}>แปลงเป็น (หน่วยสต๊อก)</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map(li => (
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
                                <input type="number" className="form-input" min="0.01" step="0.01" value={li.qty_purchase} onChange={(e) => updateLineItem(li.id, 'qty_purchase', e.target.value)} />
                              </td>
                              <td>
                                <input type="date" className="form-input" style={{ fontSize: '13px', padding: '6px 8px' }} value={li.expiry_date} onChange={(e) => updateLineItem(li.id, 'expiry_date', e.target.value)} />
                              </td>
                              <td style={{ color: 'var(--accent-info)', fontSize: '13px', fontWeight: 500 }}>
                                {getStockQtyPlaceholder(li)}
                              </td>
                              <td>
                                <button className="btn-icon" style={{ borderColor: 'transparent', color: 'var(--accent-danger)' }} onClick={() => removeLineItem(li.id)}>
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                

              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>ยกเลิก</button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => handleSave('draft')} style={{ color: 'var(--accent-warning)', borderColor: 'var(--border-primary)' }}>
                  <Clock size={16} /> บันทึกร่าง (Partial Receive)
                </button>
                <button type="button" className="btn btn-success" onClick={() => handleSave('confirmed')}>
                  <CheckCircle size={16} /> ยืนยันรับเข้าสต๊อก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>รายละเอียดใบรับสินค้า: {showDetailModal.grn_number}</h3>
              <button className="btn-icon" onClick={() => setShowDetailModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-sm)', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                <div><strong>ผู้จำหน่าย:</strong> {showDetailModal.supplier_name}</div>
                <div><strong>อ้างอิงบิล:</strong> {showDetailModal.invoice_ref || '-'}</div>
                <div><strong>สถานะ:</strong> {
                  showDetailModal.status === 'confirmed' ? 
                    <span style={{color: 'var(--accent-success)', fontWeight: 600}}>ยืนยันแล้ว</span> : 
                    <span style={{color: 'var(--accent-warning)', fontWeight: 600}}>ฉบับร่าง</span>
                }</div>
                <div><strong>ผู้รับของ:</strong> {showDetailModal.receiver?.full_name || showDetailModal.receiver?.name || '-'}</div>
                <div><strong>วันที่รับ:</strong> {new Date(showDetailModal.received_at || showDetailModal.created_at).toLocaleString('th-TH')}</div>
                <div><strong>จำนวนรวม (หน่วยซื้อ):</strong> {showDetailModal.items?.reduce((sum, i) => sum + Number(i.qty_purchase || 0), 0).toLocaleString()}</div>
              </div>

              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>รายการสินค้า: {showDetailModal.items?.length || 0} รายการ</h4>
              {showDetailModal.items && showDetailModal.items.length > 0 ? (
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ margin: 0 }}>
                    <thead style={{ background: 'var(--bg-tertiary)' }}>
                      <tr>
                        <th>ชื่อสินค้า</th>
                        <th>Lot ID / หมดอายุ</th>
                        <th>จำนวนรับ (หน่วยซื้อ)</th>
                        <th>แปลงเป็น (สต๊อก)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showDetailModal.items.map((item, idx) => {
                        const invItem = inventoryItems.find(i => i.id === item.inventory_item_id);
                        return (
                          <tr key={item.id || idx}>
                            <td style={{ fontWeight: 600 }}>{invItem?.name || 'สินค้าไม่ทราบ'}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              <div style={{ fontFamily: 'monospace' }}>{(item.lot_id || '-').substring(0, 8)}</div>
                              {item.expiry_date ? <div style={{ color: 'var(--accent-warning)', marginTop: '2px' }}>EXP: {new Date(item.expiry_date).toLocaleDateString('th-TH')}</div> : <div>EXP: -</div>}
                            </td>
                            <td>{Number(item.qty_purchase || 0).toLocaleString()} {invItem?.purchase_unit || ''}</td>
                            <td style={{ color: 'var(--accent-info)' }}>{Number(item.qty_stock || 0).toLocaleString()} {invItem?.stock_unit || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
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
                  <button className="btn btn-ghost" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(showDetailModal)}>
                     <Trash2 size={16} /> ลบใบรับสินค้า
                  </button>
               </div>
               <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={() => handleEdit(showDetailModal)}>แก้ไข</button>
                  <button className="btn btn-primary" onClick={() => setShowDetailModal(null)}>ปิด</button>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
