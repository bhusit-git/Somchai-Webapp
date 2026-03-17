import { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Filter, 
  Plus, 
  Edit2, 
  AlertTriangle,
  TrendingDown,
  CircleDollarSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Schema reference:
  create table inventory_items (
    id uuid primary key default uuid_generate_v4(),
    branch_id uuid references branches(id),
    name text not null,
    purchase_unit text not null, -- e.g., 'ลัง', 'ถุง'
    stock_unit text not null, -- e.g., 'กรัม', 'ชิ้น'
    conversion_factor numeric not null, -- e.g., 1000 (1 purchase unit = 1000 stock units)
    yield_pct numeric default 100, -- e.g., 80
    reorder_point numeric default 0,
    par_level numeric default 0,
    lead_time_days int default 1,
    cost_per_stock_unit numeric default 0,
    current_stock numeric default 0,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now())
  );
*/

// Defined outside component to avoid re-creating on every render
const INITIAL_FORM_STATE = {
  name: '',
  purchase_unit: '',
  stock_unit: '',
  conversion_factor: 1,
  yield_pct: 100,
  reorder_point: 0,
  par_level: 0,
  lead_time_days: 1,
  cost_per_stock_unit: 0,
  current_stock: 0
};

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, low, ok
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // In a real app we'd filter by branch_id from context
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('is_active', true)
        .order('name');
        
      if (error && error.code !== '42P01') {
        console.error('Error fetching inventory:', error);
      }
      
      // If table doesnt exist yet (code 42P01), we just show empty array
      setItems(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: branches } = await supabase.from('branches').select('id').limit(1);
      const branch_id = branches?.[0]?.id;

      if (!branch_id && !editingItem) {
        alert('ไม่พบสาขา กรุณาสร้างสาขาก่อน');
        return;
      }

      const payload = {
        ...formData,
        conversion_factor: Number(formData.conversion_factor),
        yield_pct: Number(formData.yield_pct),
        reorder_point: Number(formData.reorder_point),
        par_level: Number(formData.par_level),
        lead_time_days: Number(formData.lead_time_days),
        cost_per_stock_unit: Number(formData.cost_per_stock_unit),
        current_stock: Number(formData.current_stock)
      };

      let error;
      if (editingItem) {
        const { error: updateError } = await supabase
          .from('inventory_items')
          .update(payload)
          .eq('id', editingItem.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('inventory_items')
          .insert({ ...payload, branch_id });
        error = insertError;
      }

      if (error) {
        // Fallback for demo if table doesn't exist
        if (error.code === '42P01') {
          console.log('Simulating local save since table does not exist');
          if (editingItem) {
            setItems(items.map(item => item.id === editingItem.id ? { ...item, ...payload } : item));
          } else {
            setItems([{ id: Date.now().toString(), ...payload }, ...items]);
          }
        } else {
          alert('Error: ' + error.message);
          return;
        }
      } else {
        loadData();
      }

      closeModal();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData(INITIAL_FORM_STATE);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      purchase_unit: item.purchase_unit || '',
      stock_unit: item.stock_unit || '',
      conversion_factor: item.conversion_factor || 1,
      yield_pct: item.yield_pct || 100,
      reorder_point: item.reorder_point || 0,
      par_level: item.par_level || 0,
      lead_time_days: item.lead_time_days || 1,
      cost_per_stock_unit: item.cost_per_stock_unit || 0,
      current_stock: item.current_stock || 0
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const isLow = Number(item.current_stock) <= Number(item.reorder_point);
    
    if (statusFilter === 'low') return matchesSearch && isLow;
    if (statusFilter === 'ok') return matchesSearch && !isLow;
    return matchesSearch;
  });

  const totalValue = items.reduce((sum, item) => sum + (Number(item.current_stock) * Number(item.cost_per_stock_unit)), 0);
  const outOfStockCount = items.filter(i => Number(i.current_stock) <= 0).length;
  // Low stock = below reorder point but NOT zero (zero is already counted as out-of-stock)
  const lowStockCount = items.filter(i => Number(i.current_stock) > 0 && Number(i.current_stock) <= Number(i.reorder_point)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>คลังสินค้า (Dual-Unit)</h3>
          <p className="text-sm text-muted">M7A: วัตถุดิบและสต๊อก พร้อมหน่วยคู่ (ซื้อ/ใช้งาน)</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> เพิ่มสินค้า
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">
            <Package size={22} />
          </div>
          <div className="stat-info">
            <h3>{items.length}</h3>
            <p>รายการสินค้าทั้งหมด</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <TrendingDown size={22} />
          </div>
          <div className="stat-info">
            <h3>{lowStockCount}</h3>
            <p>สินค้าใกล้หมด (ต่ำกว่าจุดสั่งซื้อ)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <AlertTriangle size={22} />
          </div>
          <div className="stat-info">
            <h3>{outOfStockCount}</h3>
            <p>สินค้าหมดสต๊อก</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CircleDollarSign size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p>มูลค่าสต๊อกรวม</p>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: '20px' }}>
          <div className="flex items-center gap-4" style={{ display: 'flex', width: '100%' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-input" 
                placeholder="ค้นหาสินค้า..." 
                style={{ paddingLeft: '36px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div style={{ position: 'relative', width: '200px' }}>
              <Filter size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
              <select 
                className="form-select" 
                style={{ paddingLeft: '36px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">สถานะทั้งหมด</option>
                <option value="low">ใกล้หมดสต๊อก</option>
                <option value="ok">สต๊อกปกติ</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>รหัสสินค้า</th>
                <th>ชื่อสินค้า</th>
                <th>ปริมาณคงเหลือ</th>
                <th>จุดสั่งซื้อ (Reorder)</th>
                <th>พาร์ (Par)</th>
                <th>หน่วย (สต๊อก)</th>
                <th>ความจุ (แปลงหน่วย)</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan="9"><div className="empty-state"><Package size={48}/><h3>ไม่มีสินค้านี้</h3><p>ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา</p></div></td></tr>
              ) : (
                filteredItems.map((item) => {
                  const currentStock = Number(item.current_stock);
                  const reorderPoint = Number(item.reorder_point);
                  const isOut = currentStock <= 0;
                  // isLow: below reorder point but NOT zero (separate from fully out-of-stock)
                  const isLow = !isOut && currentStock <= reorderPoint;
                  
                  return (
                    <tr key={item.id}>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.id?.substring(0,8) || '-'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</td>
                      <td style={{ fontWeight: 600, color: isOut ? 'var(--accent-danger)' : (isLow ? 'var(--accent-warning)' : 'var(--accent-success)') }}>
                        {currentStock.toLocaleString()}
                      </td>
                      <td>{Number(item.reorder_point).toLocaleString()}</td>
                      <td>{Number(item.par_level).toLocaleString()}</td>
                      <td>{item.stock_unit}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        1 {item.purchase_unit} = {Number(item.conversion_factor)} {item.stock_unit}
                        <br/>
                        (Yield {Number(item.yield_pct)}%)
                      </td>
                      <td>
                        {isOut ? (
                          <span className="badge badge-danger">หมดสต๊อก</span>
                        ) : isLow ? (
                          <span className="badge badge-warning">ใกล้หมด</span>
                        ) : (
                          <span className="badge badge-success">ปกติ</span>
                        )}
                      </td>
                      <td>
                        <button className="btn-icon" onClick={() => openEditModal(item)}>
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>{editingItem ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
              <button className="btn-icon" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">ชื่อสินค้า *</label>
                  <input type="text" className="form-input" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="เช่น เนื้อวัวสไลด์" />
                </div>
                
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">หน่วยซื้อ (Purchase Unit) *</label>
                    <input type="text" className="form-input" required value={formData.purchase_unit} onChange={(e) => setFormData({...formData, purchase_unit: e.target.value})} placeholder="เช่น กิโลกรัม, ลัง, ถุง" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">หน่วยสต๊อก (Stock Unit) *</label>
                    <input type="text" className="form-input" required value={formData.stock_unit} onChange={(e) => setFormData({...formData, stock_unit: e.target.value})} placeholder="เช่น กรัม, ชิ้น, มล." />
                  </div>
                </div>

                <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 500 }}>การแปลงหน่วย (Conversion)</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px' }}>1 {formData.purchase_unit || 'หน่วยซื้อ'}</span>
                    <span style={{ color: 'var(--text-muted)' }}>=</span>
                    <div style={{ width: '100px' }}>
                      <input type="number" className="form-input" required min="0.01" step="0.01" value={formData.conversion_factor} onChange={(e) => setFormData({...formData, conversion_factor: e.target.value})} />
                    </div>
                    <span style={{ fontSize: '14px' }}>{formData.stock_unit || 'หน่วยสต๊อก'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">Yield % *</label>
                    <input type="number" className="form-input" required min="1" max="100" value={formData.yield_pct} onChange={(e) => setFormData({...formData, yield_pct: e.target.value})} placeholder="100" />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>% ที่ใช้ได้จริงหลังตัดแต่ง</span>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">ต้นทุนต่อหน่วยสต๊อก (฿)</label>
                    <input type="number" className="form-input" min="0" step="0.01" value={formData.cost_per_stock_unit} onChange={(e) => setFormData({...formData, cost_per_stock_unit: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">สต๊อกปัจจุบัน</label>
                    <input type="number" className="form-input" min="0" step="0.01" value={formData.current_stock} onChange={(e) => setFormData({...formData, current_stock: e.target.value})} />
                  </div>
                </div>

                <div style={{ padding: '1px', background: 'var(--border-primary)', margin: '8px 0' }} />

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">Par Level *</label>
                    <input type="number" className="form-input" required min="0" value={formData.par_level} onChange={(e) => setFormData({...formData, par_level: e.target.value})} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>สต๊อกหลังร้านที่ควรมี</span>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">Reorder Point *</label>
                    <input type="number" className="form-input" required min="0" value={formData.reorder_point} onChange={(e) => setFormData({...formData, reorder_point: e.target.value})} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>จุดสั่งซื้อ (แจ้งเตือน)</span>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">Lead Time (วัน) *</label>
                    <input type="number" className="form-input" required min="0" value={formData.lead_time_days} onChange={(e) => setFormData({...formData, lead_time_days: e.target.value})} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ระยะเวลารอของ</span>
                  </div>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">บันทึกข้อมูล</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
