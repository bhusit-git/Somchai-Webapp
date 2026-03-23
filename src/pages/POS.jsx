import { useState, useEffect } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, QrCode, Truck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const EMOJIS = ['🍜', '🍛', '🍲', '🍗', '🍚', '🥤', '🧊', '☕', '🍺', '🥗', '🍰', '🍣'];

export default function POS() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [companyInfo, setCompanyInfo] = useState(null);
  const [sysConfig, setSysConfig] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const { user } = useAuth();

  useEffect(() => { 
    if (user?.branch_id) loadData(); 
  }, [user?.branch_id]);

  useEffect(() => {
    try {
      const cInfo = localStorage.getItem('companyInfo');
      if (cInfo) setCompanyInfo(JSON.parse(cInfo));
      
      const sConf = localStorage.getItem('systemConfig');
      if (sConf) setSysConfig(JSON.parse(sConf));
      else setSysConfig({ vatPercent: 7, receiptFooter: 'ขอบคุณที่ใช้บริการ 🐷' });
    } catch {
      // ignore
    }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const branchId = user?.branch_id;
      const [catRes, prodRes, custRes] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('products').select('*').eq('is_available', true).order('sort_order'),
        branchId ? supabase.from('customers').select('*').eq('branch_id', branchId).order('name') : Promise.resolve({ data: [] })
      ]);
      setCategories(catRes.data || []);
      setProducts(prodRes.data || []);
      setCustomers(custRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category_id === activeCategory);

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1, total_price: (item.quantity + 1) * item.unit_price }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        unit_price: Number(product.price),
        quantity: 1,
        total_price: Number(product.price),
        emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      }];
    });
  }

  function updateQty(productId, delta) {
    setCart(prev => prev.map(item => {
      if (item.product_id !== productId) return item;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return null;
      return { ...item, quantity: newQty, total_price: newQty * item.unit_price };
    }).filter(Boolean));
  }

  function removeItem(productId) {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  }

  const subtotal = cart.reduce((sum, item) => sum + item.total_price, 0);
  const total = subtotal;
  const changeAmount = paymentMethod === 'cash' ? Math.max(0, (parseFloat(cashReceived) || 0) - total) : 0;

  async function handleCheckout() {
    if (cart.length === 0) return;

    if (paymentMethod === 'credit' && !selectedCustomer) {
      return alert('กรุณาเลือกลูกค้าสำหรับการขายเงินเชื่อ (AR)');
    }

    // Get active shift
    const { data: shifts } = await supabase.from('shifts').select('id, branch_id').eq('status', 'open').limit(1);
    if (!shifts?.length) return alert('ไม่มีกะที่เปิดอยู่ กรุณาเปิดกะก่อนขาย');

    const shift = shifts[0];
    const userId = user?.id;
    if (!userId) return alert('ไม่พบข้อมูลพนักงาน');

    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

    // Create transaction
    const { data: txData, error: txError } = await supabase.from('transactions').insert({
      branch_id: shift.branch_id,
      shift_id: shift.id,
      created_by: userId,
      order_number: orderNumber,
      subtotal,
      discount: 0,
      total,
      payment_method: paymentMethod,
      cash_received: paymentMethod === 'cash' ? parseFloat(cashReceived) || total : null,
      change_amount: paymentMethod === 'cash' ? changeAmount : null,
      status: 'completed',
    }).select('id').single();

    if (txError) return alert('Error: ' + txError.message);

    // Create transaction items
    const items = cart.map(item => ({
      transaction_id: txData.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }));

    const { error: itemError } = await supabase.from('transaction_items').insert(items);
    if (itemError) console.error('Items error:', itemError);

    // If Credit, create Accounts Receivable (AR) record
    if (paymentMethod === 'credit') {
      const customer = customers.find(c => c.id === selectedCustomer);
      if (customer) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (customer.ar_reminder_days || 30));
        
        await supabase.from('accounts_receivable').insert({
          branch_id: shift.branch_id,
          customer_name: customer.name,
          customer_company: customer.company,
          total_amount: total,
          paid_amount: 0,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending',
          created_by: userId
        });
      }
    }

    // === Auto-Depletion: ตัดสต๊อกวัตถุดิบตาม BOM ===
    try {
      // Collect all product IDs in the cart
      const productIds = cart.map(c => c.product_id);

      // Fetch BOM (ingredients) for all products in the cart
      const { data: bomData, error: bomErr } = await supabase
        .from('menu_item_ingredients')
        .select('menu_item_id, inventory_item_id, qty_required')
        .in('menu_item_id', productIds);

      if (!bomErr && bomData && bomData.length > 0) {
        // Aggregate depletion per inventory item
        const depletionMap = {}; // { inventory_item_id: total_qty_to_subtract }

        for (const cartItem of cart) {
          const itemBOM = bomData.filter(b => b.menu_item_id === cartItem.product_id);
          for (const bom of itemBOM) {
            const qty = Number(bom.qty_required) * cartItem.quantity;
            depletionMap[bom.inventory_item_id] = (depletionMap[bom.inventory_item_id] || 0) + qty;
          }
        }

        // Apply depletion to each inventory item
        for (const [invId, depletionQty] of Object.entries(depletionMap)) {
          // Fetch current stock
          const { data: invItem } = await supabase
            .from('inventory_items')
            .select('current_stock')
            .eq('id', invId)
            .single();

          if (invItem) {
            const newStock = Math.max(0, Number(invItem.current_stock || 0) - depletionQty);
            await supabase
              .from('inventory_items')
              .update({ current_stock: newStock })
              .eq('id', invId);
          }
        }
        console.log('✅ Auto-depletion applied for', Object.keys(depletionMap).length, 'inventory items');
      }
    } catch (depErr) {
      console.error('Auto-depletion error (non-blocking):', depErr);
      // Non-blocking: sale is already recorded, depletion failure is logged
    }

    // Save receipt data
    const currentOrder = {
      orderNumber,
      items: [...cart],
      subtotal,
      total,
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : null,
      changeAmount: paymentMethod === 'cash' ? changeAmount : null,
      customerName: paymentMethod === 'credit' && selectedCustomer ? customers.find(c => c.id === selectedCustomer)?.name : null,
      user_name: user?.user_metadata?.name || user?.email || 'Cashier',
      date: new Date()
    };
    
    setReceiptData(currentOrder);
    setShowReceipt(true);

    // Simulate Line OA Notification if configured
    if (sysConfig?.lineOAToken) {
      console.log(`[Line OA] Sending order ${orderNumber} notification using token: ${sysConfig.lineOAToken.substring(0,5)}...`);
    }

    // Clear
    setCart([]);
    setShowPayment(false);
    setCashReceived('');
    setSelectedCustomer('');
    setPaymentMethod('cash');
  }

  return (
    <div className="pos-layout">
      {/* Left: Menu */}
      <div className="pos-menu">
        <div className="pos-categories">
          <button
            className={`pos-category-btn ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            ทั้งหมด
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`pos-category-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="pos-products-grid">
          {loading ? (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              <span className="animate-pulse">กำลังโหลดเมนู...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              <ShoppingCart size={48} />
              <h3>ยังไม่มีสินค้า</h3>
              <p>เพิ่มสินค้าในฐานข้อมูลก่อน</p>
            </div>
          ) : (
            filteredProducts.map((product, idx) => (
              <div
                key={product.id}
                className="pos-product-card"
                onClick={() => addToCart(product)}
              >
                <div className="product-emoji">{EMOJIS[idx % EMOJIS.length]}</div>
                <div className="product-name">{product.name}</div>
                <div className="product-price">฿{Number(product.price).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="pos-cart">
        <div className="pos-cart-header">
          <h3>🛒 ตะกร้า</h3>
          <span className="badge badge-info">{cart.length} รายการ</span>
        </div>

        <div className="pos-cart-items">
          {cart.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={40} />
              <h3>ตะกร้าว่าง</h3>
              <p>กดที่เมนูเพื่อเพิ่มสินค้า</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product_id} className="pos-cart-item">
                <div className="pos-cart-item-info">
                  <div className="pos-cart-item-name">{item.emoji} {item.product_name}</div>
                  <div className="pos-cart-item-price">฿{item.unit_price.toLocaleString()} / ชิ้น</div>
                </div>
                <div className="pos-cart-item-qty">
                  <button onClick={() => updateQty(item.product_id, -1)}>
                    <Minus size={12} />
                  </button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, 1)}>
                    <Plus size={12} />
                  </button>
                </div>
                <div className="pos-cart-item-total">฿{item.total_price.toLocaleString()}</div>
                <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={() => removeItem(item.product_id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pos-cart-summary">
          <div className="pos-cart-summary-row">
            <span>ยอดรวม</span>
            <span>฿{subtotal.toLocaleString()}</span>
          </div>
          <div className="pos-cart-summary-row total">
            <span>รวมทั้งหมด</span>
            <span>฿{total.toLocaleString()}</span>
          </div>
          <div className="pos-cart-actions">
            <button className="btn btn-ghost" onClick={() => setCart([])}>
              <Trash2 size={16} /> ล้าง
            </button>
            <button
              className="btn btn-success"
              disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}
            >
              <CreditCard size={16} /> ชำระเงิน
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เลือกวิธีชำระเงิน</h3>
              <button className="btn-icon" onClick={() => setShowPayment(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--accent-success)' }}>฿{total.toLocaleString()}</div>
                <div className="text-sm text-muted">ยอดที่ต้องชำระ</div>
              </div>

              <div className="grid-2" style={{ marginBottom: '16px' }}>
                {[
                  { value: 'cash', icon: Banknote, label: 'เงินสด' },
                  { value: 'promptpay', icon: QrCode, label: 'PromptPay' },
                  { value: 'transfer', icon: CreditCard, label: 'โอนเงิน' },
                  { value: 'delivery', icon: Truck, label: 'Delivery' },
                  { value: 'credit', icon: Users, label: 'เงินเชื่อ (AR)' },
                ].map(m => (
                  <button
                    key={m.value}
                    className={`btn ${paymentMethod === m.value ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPaymentMethod(m.value)}
                    style={{ justifyContent: 'center' }}
                  >
                    <m.icon size={18} /> {m.label}
                  </button>
                ))}
              </div>

              {paymentMethod === 'cash' && (
                <div className="form-group">
                  <label className="form-label">เงินที่รับ (บาท)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    placeholder={total.toString()}
                    min={total}
                    step="1"
                    style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
                  />
                  {cashReceived && (
                    <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '18px', fontWeight: 700, color: 'var(--accent-warning)' }}>
                      เงินทอน: ฿{changeAmount.toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'credit' && (
                <div className="form-group">
                  <label className="form-label">เลือกลูกค้าที่ต้องการค้างชำระ (ตั้งหนี้) *</label>
                  <select
                    className="form-input"
                    value={selectedCustomer}
                    onChange={e => setSelectedCustomer(e.target.value)}
                    style={{ fontSize: '16px', padding: '12px' }}
                  >
                    <option value="">-- เลือกลูกค้า --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company ? `(${c.company})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPayment(false)}>ยกเลิก</button>
              <button className="btn btn-success btn-lg" onClick={handleCheckout}>
                ✅ ยืนยันชำระเงิน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="modal-overlay">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #receipt-print-area, #receipt-print-area * { visibility: visible; }
              #receipt-print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 10px;
              }
              .modal-overlay { background: transparent; }
            }
          `}</style>
          <div className="modal" style={{ maxWidth: '380px', padding: 0, overflow: 'hidden' }}>
            <div id="receipt-print-area" style={{ padding: '24px', background: '#fff', color: '#000', fontFamily: 'monospace, sans-serif' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                {companyInfo?.logo ? (
                  <img src={companyInfo.logo} alt="Logo" style={{ maxWidth: '80px', maxHeight: '80px', margin: '0 auto 8px', objectFit: 'contain' }} />
                ) : (
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{companyInfo?.name || 'สมชายหมูปิ้ง'}</div>
                )}
                {companyInfo?.addressLine1 && <div style={{ fontSize: '12px' }}>{companyInfo.addressLine1}</div>}
                {companyInfo?.addressLine2 && <div style={{ fontSize: '12px' }}>{companyInfo.addressLine2}</div>}
                {companyInfo?.taxId && <div style={{ fontSize: '12px', marginTop: '4px' }}>TAX ID: {companyInfo.taxId}</div>}
                {companyInfo?.phone && <div style={{ fontSize: '12px' }}>โทร: {companyInfo.phone}</div>}
              </div>

              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>ใบเสร็จรับเงิน</span>
                <span style={{ fontWeight: 600 }}>{receiptData.orderNumber}</span>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>วันที่</span>
                <span>{receiptData.date.toLocaleString('th-TH')}</span>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>พนักงาน</span>
                <span>{receiptData.user_name}</span>
              </div>

              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <tbody>
                  {receiptData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 0', verticalAlign: 'top' }}>{item.quantity}x</td>
                      <td style={{ padding: '4px 4px', width: '100%' }}>{item.product_name}</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{(item.total_price).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              
              <div style={{ fontSize: '12px' }}>
                {(sysConfig?.vatPercent > 0) ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>รวมเป็นเงิน</span>
                      <span>{(receiptData.total - (receiptData.total * sysConfig.vatPercent / (100 + sysConfig.vatPercent))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span>VAT {sysConfig.vatPercent}%</span>
                      <span>{(receiptData.total * sysConfig.vatPercent / (100 + sysConfig.vatPercent)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', margin: '8px 0' }}>
                  <span>ยอดสุทธิ</span>
                  <span>฿{receiptData.total.toLocaleString()}</span>
                </div>
              </div>

              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              
              <div style={{ fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>วิธีชำระเงิน</span>
                  <span>
                    {receiptData.paymentMethod === 'cash' ? 'เงินสด' : 
                     receiptData.paymentMethod === 'promptpay' ? 'PromptPay' :
                     receiptData.paymentMethod === 'transfer' ? 'โอนเงิน' :
                     receiptData.paymentMethod === 'delivery' ? 'Delivery' :
                     receiptData.paymentMethod === 'credit' ? `เงินเชื่อ (${receiptData.customerName})` : 'อื่นๆ'}
                  </span>
                </div>
                {receiptData.paymentMethod === 'cash' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>รับเงินมา</span>
                      <span>{receiptData.cashReceived?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>เงินทอน</span>
                      <span>{receiptData.changeAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </div>

              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              
              <div style={{ textAlign: 'center', fontSize: '12px', marginTop: '16px', whiteSpace: 'pre-wrap', color: '#666' }}>
                {sysConfig?.receiptFooter || 'ขอบคุณที่ใช้บริการ 🐷'}
              </div>
            </div>

            {/* Non-printing buttons */}
            <div style={{ display: 'flex', borderTop: '1px solid var(--border-primary)' }}>
              <button 
                onClick={() => setShowReceipt(false)}
                style={{ flex: 1, padding: '16px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}
              >
                ปิดหน้าต่าง
              </button>
              <button 
                onClick={() => window.print()}
                style={{ flex: 1, padding: '16px', background: 'var(--accent-primary)', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                🖨️ พิมพ์ใบเสร็จ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
