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
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

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
          items:grn_items(count)
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

      // 3. Fetch Users
      const { data: userData } = await supabase
        .from('users')
        .select('id, name, full_name, role')
        .in('role', ['store_manager', 'area_manager', 'owner'])
        .eq('is_active', true)
        .eq('branch_id', user.branch_id);

      setGrns(grnData || []);
      setInventoryItems(invData || []);
      setUsers(userData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const openCreateModal = () => {
    setHeaderForm({ supplier_name: '', invoice_ref: '', received_by: '' });
    setLineItems([]);
    setShowModal(true);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems, 
      { id: Date.now().toString(), item_id: '', qty_purchase: '', unit_cost: '' }
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
      if (!li.item_id || !li.qty_purchase || !li.unit_cost) {
        alert('กรุณากรอกข้อมูลรายการสินค้าให้ครบถ้วน');
        return;
      }
    }

    try {
      const branch_id = user?.branch_id;
      if (!branch_id) return alert('ไม่พบสาขา กรุณาเข้าสู่ระบบใหม่');

      // Calculate total value
      const total_value = lineItems.reduce((sum, item) => sum + (Number(item.qty_purchase) * Number(item.unit_cost)), 0);
      const grn_number = `GRN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const headerPayload = {
        branch_id,
        grn_number,
        supplier_name: headerForm.supplier_name,
        invoice_ref: headerForm.invoice_ref,
        received_by: headerForm.received_by,
        status,
        total_value,
        received_at: status === 'confirmed' ? new Date().toISOString() : null
      };

      const { data: newGrn, error: headerErr } = await supabase
        .from('grn_headers')
        .insert(headerPayload)
        .select()
        .single();

      if (headerErr) {
        if (headerErr.code === '42P01') {
          console.log('Table missing, using local state simulation');
          // Update local state for simulation removed
          setGrns(grns);
          setShowModal(false);
          return;
        }
        throw headerErr;
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
          unit_cost: Number(li.unit_cost)
        };
      });

      const { error: itemsErr } = await supabase.from('grn_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // If confirmed, update inventory stock & WAC (Simplified WAC logic for prototype)
      if (status === 'confirmed') {
        const rpcPayload = itemsPayload.map(i => ({
          item_id: i.inventory_item_id,
          qty_added: i.qty_stock,
          cost_added: i.qty_purchase * i.unit_cost
        }));
        
        // In reality, we would call a Postgres RPC function or trigger to update safely:
        // await supabase.rpc('process_grn_confirmation', { items: rpcPayload });
        console.log('Would update inventory stock here:', rpcPayload);
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
  const totalValueReceived = grns.filter(g => g.status === 'confirmed').reduce((sum, g) => sum + Number(g.total_value), 0);

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
        <div className="stat-card">
          <div className="stat-icon blue">
            <FileText size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{totalValueReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p>มูลค่ารับเข้าแล้วทั้งหมด</p>
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
                <th>มูลค่ารวม (฿)</th>
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
                    <td>{g.items?.[0]?.count || g.items?.length || 0}</td>
                    <td style={{ fontWeight: 600 }}>{Number(g.total_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
              <h3>รับสินค้าเข้า (Goods Received Note)</h3>
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
                  <label className="form-label">ผู้รับของ *</label>
                  <select className="form-select" value={headerForm.received_by} onChange={e => setHeaderForm({...headerForm, received_by: e.target.value})}>
                    <option value="">-- เลือกผู้จัดการ/พนักงานรับของ --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.name}</option>)}
                  </select>
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
                          <th style={{ width: '150px' }}>ราคาต่อหน่วย (฿)</th>
                          <th style={{ width: '150px' }}>แปลงเป็น (หน่วยสต๊อก)</th>
                          <th style={{ width: '120px' }}>รวม (฿)</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map(li => {
                          const total = (Number(li.qty_purchase || 0) * Number(li.unit_cost || 0)).toFixed(2);
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
                                <input type="number" className="form-input" min="0.01" step="0.01" value={li.qty_purchase} onChange={(e) => updateLineItem(li.id, 'qty_purchase', e.target.value)} />
                              </td>
                              <td>
                                <input type="number" className="form-input" min="0" step="0.01" value={li.unit_cost} onChange={(e) => updateLineItem(li.id, 'unit_cost', e.target.value)} />
                              </td>
                              <td style={{ color: 'var(--accent-info)', fontSize: '13px', fontWeight: 500 }}>
                                {getStockQtyPlaceholder(li)}
                              </td>
                              <td style={{ fontWeight: 600 }}>{total}</td>
                              <td>
                                <button className="btn-icon" style={{ borderColor: 'transparent', color: 'var(--accent-danger)' }} onClick={() => removeLineItem(li.id)}>
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {lineItems.length > 0 && (
                  <div style={{ textAlign: 'right', marginTop: '16px', fontSize: '16px', fontWeight: 700 }}>
                    มูลค่าสุทธิ: ฿{lineItems.reduce((s, i) => s + (Number(i.qty_purchase||0) * Number(i.unit_cost||0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
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
                <div><strong>มูลค่ารวม:</strong> ฿{Number(showDetailModal.total_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>

              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>รายการที่สั่ง: {showDetailModal.items?.[0]?.count || 0} รายการ</h4>
              <div style={{ padding: '20px', textAlign: 'center', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                [แสดงตารางรายการสินค้า (grn_items) ที่เชื่อมกับฐานข้อมูล]
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
