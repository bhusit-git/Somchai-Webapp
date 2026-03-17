import { useState, useEffect } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, QrCode, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('products').select('*').eq('is_available', true).order('sort_order'),
      ]);
      setCategories(catRes.data || []);
      setProducts(prodRes.data || []);
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

    // Get active shift
    const { data: shifts } = await supabase.from('shifts').select('id, branch_id').eq('status', 'open').limit(1);
    if (!shifts?.length) return alert('ไม่มีกะที่เปิดอยู่ กรุณาเปิดกะก่อนขาย');

    const shift = shifts[0];
    const { data: users } = await supabase.from('users').select('id').limit(1);
    const userId = users?.[0]?.id;
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

    // Clear
    setCart([]);
    setShowPayment(false);
    setCashReceived('');
    alert(`✅ บันทึกออร์เดอร์ ${orderNumber} สำเร็จ!`);
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
    </div>
  );
}
