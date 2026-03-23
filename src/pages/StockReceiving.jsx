import { useState, useEffect } from 'react';
import { 
  PackagePlus, 
  Search, 
  CheckCircle, 
  Clock,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/*
  Stock Receiving (Blind Receiving)
  Staff uses this to receive items based on a pending Purchase Order.
  Prices are hidden. They only see quantities.
*/

export default function StockReceiving() {
  const [pos, setPos] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // For Receiving Modal
  const [receiveItems, setReceiveItems] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.branch_id) loadData();
  }, [user?.branch_id]);

  async function loadData() {
    if (!user?.branch_id) return;
    setLoading(true);
    try {
      // 1. Fetch Purchase Orders (pending or received today)
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

      // 2. Fetch Inventory Items
      const { data: invData, error: invErr } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('is_active', true);
      
      if (invErr && invErr.code !== '42P01') console.error(invErr);

      setPos(poData || []);
      setInventoryItems(invData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const openReceiveModal = (po) => {
    setShowDetailModal(po);
    // Initialize receive items with qty_ordered as default
    if (po.status === 'pending') {
      const initialReceive = po.items.map(item => ({
        id: item.id,
        inventory_item_id: item.inventory_item_id,
        qty_ordered: item.qty_ordered,
        qty_received: item.qty_ordered, // default to what was ordered
        unit_cost: item.unit_cost
      }));
      setReceiveItems(initialReceive);
    } else {
      setReceiveItems([]);
    }
  };

  const updateReceiveQty = (itemId, qty) => {
    setReceiveItems(prev => prev.map(item => {
      if (item.id === itemId) return { ...item, qty_received: qty };
      return item;
    }));
  };

  const handleConfirmReceive = async () => {
    const confirmReceive = window.confirm('คุณแน่ใจหรือไม่ว่าตรวจสอบสินค้าครบถ้วนแล้ว? ระบบจะนำของเข้าสต๊อกและคำนวณต้นทุนใหม่ทันที (ไม่สามารถแก้ไขภายหลังได้)');
    if (!confirmReceive) return;

    try {
      const po = showDetailModal;

      // 1. Update purchase_orders header
      const { error: poError } = await supabase
        .from('purchase_orders')
        .update({
          status: 'received',
          received_by: user.id,
          received_at: new Date().toISOString()
        })
        .eq('id', po.id);
      
      if (poError) throw poError;

      // 2. Fetch FRESH inventory data to avoid stale WAC/stock values
      const itemIds = receiveItems.map(r => r.inventory_item_id);
      const { data: freshInv, error: freshErr } = await supabase
        .from('inventory_items')
        .select('*')
        .in('id', itemIds);
      
      if (freshErr) console.error('Error fetching fresh inventory:', freshErr);
      const freshItems = freshInv || [];

      // 3. Update each purchase_order_items and Inventory Stock
      for (const rxItem of receiveItems) {
        // Update PO Items
        const { error: rxErr } = await supabase
          .from('purchase_order_items')
          .update({
            qty_received: Number(rxItem.qty_received),
            total_cost: Number(rxItem.qty_received) * Number(rxItem.unit_cost)
          })
          .eq('id', rxItem.id);
        
        if (rxErr) console.error('Error updating po item:', rxErr);

        // Update Inventory Items (Stock AND WAC Cost) using FRESH data
        const invItem = freshItems.find(i => i.id === rxItem.inventory_item_id);
        if (invItem) {
          const conversionFactor = Number(invItem.conversion_factor) || 1;
          const receivedQtyPurchaseUnit = Number(rxItem.qty_received);
          const qtyStockReceived = receivedQtyPurchaseUnit * conversionFactor;
          
          const oldStock = Number(invItem.current_stock || 0);
          const newStock = oldStock + qtyStockReceived;
          
          let newWac = Number(invItem.cost_per_stock_unit || 0);
          
          // Only recalculate WAC if we actually received something
          if (qtyStockReceived > 0 && newStock > 0) {
             const oldCost = Number(invItem.cost_per_stock_unit || 0);
             const receivedCostPerStockUnit = Number(rxItem.unit_cost) / conversionFactor;
             newWac = ((oldStock * oldCost) + (qtyStockReceived * receivedCostPerStockUnit)) / newStock;
          }

          const { error: stockErr } = await supabase
            .from('inventory_items')
            .update({ 
               current_stock: newStock,
               cost_per_stock_unit: newWac 
            })
            .eq('id', rxItem.inventory_item_id);
          
          if (stockErr) console.error('Error updating stock:', stockErr);
        }
      }

      // 4. Update total amount on PO and the linked expense
      const newTotalAmount = receiveItems.reduce((sum, item) => sum + (Number(item.qty_received) * Number(item.unit_cost)), 0);
      
      await supabase.from('purchase_orders')
        .update({ total_amount: newTotalAmount })
        .eq('id', po.id);

      await supabase.from('expenses')
        .update({ amount: newTotalAmount })
        .like('description', `%PO: ${po.po_number}%`)
        .eq('status', 'pending');

      setShowDetailModal(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error saving receipt: ' + err.message);
    }
  };

  const filteredPos = pos.filter(p => 
    p.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = pos.filter(p => p.status === 'pending').length;
  const receivedTodayCount = pos.filter(p => {
    const d = p.received_at ? new Date(p.received_at) : null;
    return p.status === 'received' && d && d.toDateString() === new Date().toDateString();
  }).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>รับสินค้าเข้า (Stock Receiving)</h3>
          <p className="text-sm text-muted">M7B: พนักงานตรวจสอบและรับสินค้าจากใบสั่งซื้อ (Blind Receiving)</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon orange">
            <Clock size={22} />
          </div>
          <div className="stat-info">
            <h3>{pendingCount}</h3>
            <p>รายการรอรับของ</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle size={22} />
          </div>
          <div className="stat-info">
            <h3>{receivedTodayCount}</h3>
            <p>รับของแล้ว (วันนี้)</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '16px', background: 'var(--accent-warning-bg)', color: 'var(--accent-warning)', borderRadius: 'var(--radius-sm)' }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>ข้อควรระวัง:</strong> เมื่อกด "ยืนยันการรับของ" แล้ว ระบบจะเปลี่ยนแปลงตัวเลขสต๊อกและคำนวณต้นทุน (Cost/Unit) ทันที กรุณาตรวจนับสินค้าให้ถูกต้อง! (พนักงานจะไม่เห็นราคาต้นทุน)
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
              placeholder="ค้นหาเลขที่เอกสาร PO..." 
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
                <th>วันที่สั่ง</th>
                <th>ซัพพลายเออร์</th>
                <th>จำนวนรายการ</th>
                <th>สถานะ</th>
                <th>ผู้รับของ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : filteredPos.length === 0 ? (
                <tr><td colSpan="6"><div className="empty-state"><PackagePlus size={48}/><h3>ยังไม่มีใบสั่งซื้อ</h3><p>ระบบจะแสดงใบสั่งซื้อที่รอการรับสินค้าที่นี่</p></div></td></tr>
              ) : (
                filteredPos.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openReceiveModal(p)}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.po_number}</td>
                    <td>{new Date(p.created_at).toLocaleString('th-TH')}</td>
                    <td>{p.supplier_name || '-'}</td>
                    <td>{p.items?.length || 0} รายการ</td>
                    <td>
                      {p.status === 'received' ? (
                        <span className="badge badge-success">อัปเดตสต๊อกแล้ว</span>
                      ) : p.status === 'cancelled' ? (
                        <span className="badge badge-secondary">ยกเลิก</span>
                      ) : (
                        <span className="badge badge-warning">รอรับของ (Pending)</span>
                      )}
                    </td>
                    <td>{p.receiver?.full_name || p.receiver?.name || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail/Receive Modal */}
      {showDetailModal && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>รายการตรวจรับสินค้า (PO: {showDetailModal.po_number})</h3>
              <button className="btn-icon" onClick={() => setShowDetailModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-sm)', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                <div><strong>ซัพพลายเออร์:</strong> {showDetailModal.supplier_name || '-'}</div>
                <div><strong>สถานะ:</strong> {
                  showDetailModal.status === 'received' ? <span style={{color: 'var(--accent-success)', fontWeight: 600}}>รับสินค้าเรียบร้อย</span> : 
                  showDetailModal.status === 'cancelled' ? <span style={{color: 'var(--text-secondary)', fontWeight: 600}}>ยกเลิก</span> :
                  <span style={{color: 'var(--accent-warning)', fontWeight: 600}}>รอรับของ</span>
                }</div>
                <div><strong>ผู้สั่งซื้อ:</strong> {showDetailModal.creator?.full_name || showDetailModal.creator?.name || '-'}</div>
                <div><strong>วันที่สั่ง:</strong> {new Date(showDetailModal.created_at).toLocaleString('th-TH')}</div>
                {showDetailModal.status === 'received' && (
                  <>
                    <div><strong>ผู้รับของ:</strong> {showDetailModal.receiver?.full_name || showDetailModal.receiver?.name || '-'}</div>
                    <div><strong>วันที่รับของ:</strong> {new Date(showDetailModal.received_at).toLocaleString('th-TH')}</div>
                  </>
                )}
              </div>

              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>รายการที่ต้องตรวจนับ (Blind Receiving)</h4>
              
              <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ margin: 0 }}>
                    <thead style={{ background: 'var(--bg-tertiary)' }}>
                      <tr>
                        <th>ชื่อสินค้า</th>
                        <th>หน่วยบรรจุ</th>
                        <th>สั่งซื้อมาจำนวน (ตัวตั้ง)</th>
                        <th>จำนวนที่รับจริง (แก้ได้)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showDetailModal.items?.map((item, idx) => {
                        const invItem = inventoryItems.find(i => i.id === item.inventory_item_id);
                        const isPending = showDetailModal.status === 'pending';
                        const currentVal = isPending
                          ? receiveItems.find(r => r.id === item.id)?.qty_received || ''
                          : item.qty_received;

                        return (
                          <tr key={item.id || idx}>
                            <td style={{ fontWeight: 600 }}>{invItem?.name || 'สินค้าไม่ทราบ'}</td>
                            <td>{invItem?.purchase_unit || ''}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{Number(item.qty_ordered || 0).toLocaleString()}</td>
                            <td>
                              {isPending ? (
                                <input 
                                  type="number" 
                                  className="form-input" 
                                  min="0" 
                                  step="0.01" 
                                  value={currentVal} 
                                  onChange={(e) => updateReceiveQty(item.id, e.target.value)} 
                                  style={{ maxWidth: '120px', borderColor: Number(currentVal) !== Number(item.qty_ordered) ? 'var(--accent-warning)' : 'var(--border-primary)' }}
                                />
                              ) : (
                                <span style={{ fontWeight: 600, color: Number(item.qty_received) !== Number(item.qty_ordered) ? 'var(--accent-warning)' : 'var(--accent-success)' }}>
                                  {Number(item.qty_received || 0).toLocaleString()}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
              </div>
            </div>
            
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
               <button className="btn btn-ghost" onClick={() => setShowDetailModal(null)}>ปิด</button>
               {showDetailModal.status === 'pending' && (
                 <button className="btn btn-success" onClick={handleConfirmReceive}>
                   <CheckCircle size={16} /> ยืนยันการรับของ (นำเข้าสต๊อก)
                 </button>
               )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
