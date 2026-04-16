import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, QrCode, Truck, Users, Wallet, Smartphone, CircleDollarSign, HandCoins, Tag, Percent, X, ChevronUp, ChevronDown, Gift } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

// Icon map for dynamic payment method icons
const PM_ICON_MAP = {
  Banknote, QrCode, CreditCard, Truck, Users, Wallet, Smartphone, CircleDollarSign, HandCoins, Gift
};

const DEFAULT_PAYMENT_METHODS = [
  { value: 'cash',      label: 'เงินสด',        icon: 'Banknote', isDefault: true, enabled: true, gpPercent: 0 },
  { value: 'promptpay', label: 'PromptPay',      icon: 'QrCode',   isDefault: true, enabled: true, gpPercent: 0 },
  { value: 'transfer',  label: 'โอนเงิน',        icon: 'CreditCard', isDefault: true, enabled: true, gpPercent: 0 },
  { value: 'Grab',      label: 'Grab',           icon: 'Truck',    isDefault: true, enabled: true, gpPercent: 30 },
  { value: 'Lineman',   label: 'LineMan',        icon: 'Truck',    isDefault: true, enabled: true, gpPercent: 30 },
  { value: 'credit',    label: 'เงินเชื่อ (AR)', icon: 'Users',    isDefault: true, enabled: true, gpPercent: 0 },
  { value: 'staff_meal',label: 'สวัสดิการพนักงาน', icon: 'Gift',     isDefault: true, enabled: true, gpPercent: 0 },
];

function loadDiscountLimit() {
  try {
    const raw = localStorage.getItem('discountLimitConfig');
    if (raw) return JSON.parse(raw);
  } catch { }
  return { maxPercent: 100, maxAmount: 9999 };
}

// Emojis removed for cleaner UI
// ── Promotion Evaluation Engine ──
function isPromoValid(promo, channel, todayStr, nowTime) {
  if (!promo.is_active) return false;
  if (promo.start_date && todayStr < promo.start_date) return false;
  if (promo.end_date && todayStr > promo.end_date) return false;
  if (promo.start_time && promo.end_time) {
    if (nowTime < promo.start_time || nowTime > promo.end_time) return false;
  }
  const channels = promo.applicable_channels || [];
  if (channels.length > 0 && !channels.includes(channel)) return false;
  return true;
}

// 1. Line Item Layer
function evaluateBestItemPromotion(item, promotions, channel, todayStr, nowTime) {
  const matched = [];
  for (const promo of promotions) {
    if (!isPromoValid(promo, channel, todayStr, nowTime)) continue;
    const maps = promo.promotion_item_mappings || [];
    if (maps.length === 0) continue; // ENTIRE_BILL
    
    // Check if this item is eligible via Product or Category mapping
    const isEligible = maps.some(m => 
      (m.reference_type === 'product' && m.reference_id === item.product_id) || 
      (m.reference_type === 'category' && m.reference_id === item.category_id)
    );

    if (isEligible) {
      let discountAmount = 0;
      if (promo.discount_type === 'PERCENTAGE') {
        discountAmount = item.total_price * (promo.discount_value / 100);
      } else if (promo.discount_type === 'FIXED_AMOUNT') {
        discountAmount = Math.min(promo.discount_value * item.quantity, item.total_price);
      } else if (promo.discount_type === 'FIXED_PRICE') {
        const fixedTotal = promo.discount_value * item.quantity;
        if (item.total_price > fixedTotal) {
           discountAmount = item.total_price - fixedTotal;
        }
      }
      if (discountAmount > 0) {
        matched.push({ ...promo, calculatedDiscount: Math.round(discountAmount * 100) / 100 });
      }
    }
  }
  if (matched.length === 0) return null;
  // Best Deal (Highest discount), Tie-breaker (created_at newest)
  matched.sort((a, b) => {
    if (b.calculatedDiscount !== a.calculatedDiscount) return b.calculatedDiscount - a.calculatedDiscount;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return matched[0];
}

// 2. Entire Bill Layer
function evaluateBestBillPromotion(subtotal, promotions, channel, todayStr, nowTime) {
  const matched = [];
  for (const promo of promotions) {
    if (!isPromoValid(promo, channel, todayStr, nowTime)) continue;
    const maps = promo.promotion_item_mappings || [];
    if (maps.length > 0) continue; // Item level promo

    let discountAmount = 0;
    if (promo.discount_type === 'PERCENTAGE') {
      discountAmount = subtotal * (promo.discount_value / 100);
    } else if (promo.discount_type === 'FIXED_AMOUNT') {
      discountAmount = Math.min(promo.discount_value, subtotal);
    }

    if (discountAmount > 0) {
      matched.push({ ...promo, calculatedDiscount: Math.round(discountAmount * 100) / 100 });
    }
  }
  if (matched.length === 0) return null;
  matched.sort((a, b) => {
    if (b.calculatedDiscount !== a.calculatedDiscount) return b.calculatedDiscount - a.calculatedDiscount;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return matched[0];
}

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
  
  const { paymentMethods: allPaymentMethods, salesChannels, systemConfig } = useSettings();
  const [paymentMethods, setPaymentMethods] = useState(allPaymentMethods.filter(m => m.enabled));
  const [deliveryType, setDeliveryType] = useState('round');
  // Channel pricing
  const [activeSalesChannel, setActiveSalesChannel] = useState('dine_in');
  const [menuPrices, setMenuPrices] = useState({});
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setPaymentMethods(allPaymentMethods.filter(m => m.enabled));
  }, [allPaymentMethods]);

  // ── Promotions state ──
  const [promotions, setPromotions] = useState([]);
  const [discountLimit] = useState(() => loadDiscountLimit());

  // ── Manual Discount state ──
  const [itemDiscounts, setItemDiscounts] = useState({}); // { product_id: { type: 'percent'|'amount', value: N } }
  const [billDiscount, setBillDiscount] = useState(null); // { type: 'percent'|'amount', value: N }
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [showItemDiscountModal, setShowItemDiscountModal] = useState(null); // product_id
  const [showBillDiscountModal, setShowBillDiscountModal] = useState(false);
  const [discountInput, setDiscountInput] = useState({ type: 'amount', value: '' });

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
      setPaymentMethods(loadPaymentMethods());
      setSalesChannels(loadSalesChannels());
    } catch { }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const branchId = user?.branch_id;
      const [catRes, prodRes, custRes, mpRes, promoRes, comboRes] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('products').select('*').order('sort_order'),
        branchId ? supabase.from('customers').select('*').eq('branch_id', branchId).order('name') : Promise.resolve({ data: [] }),
        supabase.from('menu_prices').select('*'),
        supabase.from('promotions').select('*, promotion_item_mappings(*)').eq('is_active', true),
        supabase.from('product_combo_items').select('*')
      ]);

      const comboMap = {};
      (comboRes.data || []).forEach(r => {
        if (!comboMap[r.combo_product_id]) comboMap[r.combo_product_id] = [];
        comboMap[r.combo_product_id].push(r);
      });

      setCategories(catRes.data || []);
      setProducts((prodRes.data || []).map(p => ({
        ...p,
        combo_items: comboMap[p.id] || []
      })));
      setCustomers(custRes.data || []);
      setPromotions(promoRes.data || []);

      const mpMap = {};
      (mpRes.data || []).forEach(r => {
        if (!mpMap[r.menu_id]) mpMap[r.menu_id] = {};
        mpMap[r.menu_id][r.channel] = { price: r.price, is_available: r.is_available };
      });
      setMenuPrices(mpMap);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function isAvailable(product) {
    // 1. Check Channel-specific availability
    if (activeSalesChannel && activeSalesChannel !== 'dine_in') {
      const mp = menuPrices[product.id]?.[activeSalesChannel];
      if (mp && mp.is_available === false) return false; // Explicitly disabled for this channel
      if (!mp && product.is_available === false) return false; // No override, so inherit base availability
    } else {
      // 2. Base availability (Dine-in)
      if (product.is_available === false) return false;
    }

    // 3. Cascading Availability for Combo Items
    if (product.product_type === 'COMBO' && product.combo_items?.length > 0) {
      for (const ci of product.combo_items) {
        const child = products.find(p => p.id === ci.item_product_id);
        if (!child) return false; 
        
        // We only disable the combo if the child ingredient is disabled ACROSS ALL channels (i.e. truly out of stock)
        // If the child is merely hidden from the current channel's standalone menu, the combo should still stand.
        let childGloballyAvail = child.is_available !== false;
        if (!childGloballyAvail) {
           const activeOtherChannels = salesChannels.filter(ch => ch.id !== 'dine_in' && menuPrices[child.id]?.[ch.id]?.is_available);
           if (activeOtherChannels.length > 0) {
              childGloballyAvail = true;
           }
        }
        
        if (!childGloballyAvail) return false;
      }
    }
    
    return true;
  }

  function getChannelPrice(product) {
    if (activeSalesChannel && activeSalesChannel !== 'dine_in') {
      const mp = menuPrices[product.id]?.[activeSalesChannel];
      if (mp && mp.price !== null && mp.price !== undefined) return Number(mp.price);
    }
    return Number(product.price);
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowTime = now.toTimeString().slice(0, 5); // "HH:MM"

  const productPromotionsMap = useMemo(() => {
    const map = {};
    for (const p of products) {
      if (!isAvailable(p)) continue;
      const price = getChannelPrice(p);
      const mockItem = { product_id: p.id, category_id: p.category_id, unit_price: price, quantity: 1, total_price: price };
      const bestPromo = evaluateBestItemPromotion(mockItem, promotions, activeSalesChannel, todayStr, nowTime);
      if (bestPromo) map[p.id] = bestPromo;
    }
    return map;
  }, [products, promotions, activeSalesChannel, menuPrices]);

  const filteredProducts = products.filter(p => {
    if (!isAvailable(p)) return false;
    if (activeCategory === 'promotions') return !!productPromotionsMap[p.id];
    if (activeCategory === 'all') return true;
    return p.category_id === activeCategory;
  });

  function addToCart(product) {
    const effectivePrice = getChannelPrice(product);
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
        unit_price: effectivePrice,
        quantity: 1,
        total_price: effectivePrice,
        category_id: product.category_id,
        image_url: product.image_url || null,
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
    setItemDiscounts(prev => { const n = { ...prev }; delete n[productId]; return n; });
  }

  // ── Auto Promotion Evaluation (Layer 1: Items) ──
  const cartWithPromos = useMemo(() => {
    return cart.map(item => {
      // Rule: No Stacking. If manual discount applied, skip auto promo for this item.
      const hasManualDiscount = !!itemDiscounts[item.product_id];
      if (hasManualDiscount) return { ...item, autoPromo: null };
      
      const bestPromo = evaluateBestItemPromotion(item, promotions, activeSalesChannel, todayStr, nowTime);
      return { ...item, autoPromo: bestPromo };
    });
  }, [cart, promotions, activeSalesChannel, itemDiscounts, todayStr, nowTime]);

  // ── Calculation Engine ──
  const subtotal = cart.reduce((sum, item) => sum + item.total_price, 0); // Raw subtotal

  const cartSubtotalDetails = useMemo(() => {
    let sub = 0;
    let manualItemDiscTotal = 0;
    let autoItemDiscTotal = 0;
    
    for (const item of cartWithPromos) {
       let finalItemPrice = item.total_price;
       
       const manualDisc = itemDiscounts[item.product_id];
       if (manualDisc) {
         let d = manualDisc.type === 'percent' ? item.total_price * (manualDisc.value / 100) : Math.min(manualDisc.value, item.total_price);
         manualItemDiscTotal += d;
         finalItemPrice -= d;
       } else if (item.autoPromo) {
         autoItemDiscTotal += item.autoPromo.calculatedDiscount;
         finalItemPrice -= item.autoPromo.calculatedDiscount;
       }
       sub += finalItemPrice;
    }
    return { subtotalAfterItems: Math.round(sub * 100) / 100, manualItemDiscTotal: Math.round(manualItemDiscTotal * 100) / 100, autoItemDiscTotal: Math.round(autoItemDiscTotal * 100) / 100 };
  }, [cartWithPromos, itemDiscounts]);

  const { subtotalAfterItems, manualItemDiscTotal, autoItemDiscTotal } = cartSubtotalDetails;
  const totalItemDiscount = manualItemDiscTotal + autoItemDiscTotal;

  // ── Auto Promotion Evaluation (Layer 2: Entire Bill) ──
  const activeBillPromo = useMemo(() => {
     if (subtotalAfterItems <= 0) return null;
     if (billDiscount) return null; // No auto-bill if manual bill disc is active
     return evaluateBestBillPromotion(subtotalAfterItems, promotions, activeSalesChannel, todayStr, nowTime);
  }, [subtotalAfterItems, promotions, activeSalesChannel, billDiscount, todayStr, nowTime]);

  const hasAutoBillPromo = !!activeBillPromo;
  const promoBillDiscountAmount = hasAutoBillPromo ? activeBillPromo.calculatedDiscount : 0;

  // Manual bill discount (only if no auto-promo)
  const manualBillDiscount = useMemo(() => {
    if (hasAutoBillPromo || !billDiscount) return 0;
    if (billDiscount.type === 'percent') {
      return Math.round(subtotalAfterItems * (billDiscount.value / 100) * 100) / 100;
    }
    return Math.min(billDiscount.value, subtotalAfterItems);
  }, [billDiscount, subtotalAfterItems, hasAutoBillPromo]);

  const totalDiscount = totalItemDiscount + promoBillDiscountAmount + manualBillDiscount;

  const selectedMethodObj = paymentMethods.find(m => m.value === paymentMethod);
  const configuredDeliveryFee = Number(selectedMethodObj?.deliveryFee) || 0;
  const deliveryFee = (configuredDeliveryFee > 0 && deliveryType === 'express') ? configuredDeliveryFee : 0;
  const total = Math.max(0, subtotal - totalDiscount + deliveryFee);
  const effectiveCashReceived = paymentMethod === 'cash' ? (parseFloat(cashReceived) || total) : 0;
  const changeAmount = paymentMethod === 'cash' ? Math.max(0, effectiveCashReceived - total) : 0;

  // ── Item Discount Modal Handlers ──
  function openItemDiscountModal(productId) {
    const existing = itemDiscounts[productId];
    setDiscountInput(existing ? { type: existing.type, value: String(existing.value) } : { type: 'amount', value: '' });
    setShowItemDiscountModal(productId);
  }

  function saveItemDiscount() {
    const val = parseFloat(discountInput.value) || 0;
    if (val <= 0) {
      setItemDiscounts(prev => { const n = { ...prev }; delete n[showItemDiscountModal]; return n; });
    } else {
      // Validate against limit
      if (discountInput.type === 'percent' && val > discountLimit.maxPercent) {
        return alert(`ส่วนลดเกินขีดจำกัด (สูงสุด ${discountLimit.maxPercent}%)`);
      }
      if (discountInput.type === 'amount' && val > discountLimit.maxAmount) {
        return alert(`ส่วนลดเกินขีดจำกัด (สูงสุด ฿${discountLimit.maxAmount})`);
      }
      setItemDiscounts(prev => ({ ...prev, [showItemDiscountModal]: { type: discountInput.type, value: val } }));
    }
    setShowItemDiscountModal(null);
  }

  // ── Bill Discount Modal Handlers ──
  function openBillDiscountModal() {
    setDiscountInput(billDiscount ? { type: billDiscount.type, value: String(billDiscount.value) } : { type: 'amount', value: '' });
    setShowBillDiscountModal(true);
  }

  function saveBillDiscount() {
    const val = parseFloat(discountInput.value) || 0;
    if (val <= 0) { setBillDiscount(null); }
    else {
      if (discountInput.type === 'percent' && val > discountLimit.maxPercent) {
        return alert(`ส่วนลดเกินขีดจำกัด (สูงสุด ${discountLimit.maxPercent}%)`);
      }
      if (discountInput.type === 'amount' && val > discountLimit.maxAmount) {
        return alert(`ส่วนลดเกินขีดจำกัด (สูงสุด ฿${discountLimit.maxAmount})`);
      }
      setBillDiscount({ type: discountInput.type, value: val });
    }
    setShowBillDiscountModal(false);
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    if (paymentMethod === 'credit' && !selectedCustomer) {
      return alert('กรุณาเลือกลูกค้าสำหรับการขายเงินเชื่อ (AR)');
    }
    
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      const { data: shifts } = await supabase.from('shifts').select('id, branch_id').eq('status', 'open').limit(1);
      if (!shifts?.length) {
        alert('ไม่มีกะที่เปิดอยู่ กรุณาเปิดกะก่อนขาย');
        return;
      }

      const shift = shifts[0];
      const userId = user?.id;
      if (!userId) {
        alert('ไม่พบข้อมูลพนักงาน');
        return;
      }

      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const todayOrdPrefix = `ORD-${todayStr}-`;
      const { data: latestOrd } = await supabase
        .from('transactions').select('order_number').eq('branch_id', shift.branch_id)
        .like('order_number', `${todayOrdPrefix}%`).order('order_number', { ascending: false }).limit(1).maybeSingle();

      let nextOrdSeq = 1;
    if (latestOrd?.order_number?.startsWith(todayOrdPrefix)) {
      const lastNum = parseInt(latestOrd.order_number.substring(todayOrdPrefix.length), 10);
      if (!isNaN(lastNum)) nextOrdSeq = lastNum + 1;
    }
    const orderNumber = `${todayOrdPrefix}${String(nextOrdSeq).padStart(4, '0')}`;

    const selectedMethod = paymentMethods.find(m => m.value === paymentMethod);
    const gpPercent = selectedMethod ? (Number(selectedMethod.gpPercent) || 0) : 0;
    const gpAmount = (total * gpPercent) / 100;

    const { data: txData, error: txError } = await supabase.from('transactions').insert({
      branch_id: shift.branch_id, shift_id: shift.id, created_by: userId,
      order_number: orderNumber, subtotal,
      discount: totalDiscount,
      total,
      payment_method: paymentMethod,
      gp_percent: gpPercent, gp_amount: gpAmount, delivery_fee: deliveryFee,
      cash_received: paymentMethod === 'cash' ? parseFloat(cashReceived) || total : null,
      change_amount: paymentMethod === 'cash' ? changeAmount : null,
      status: 'completed',
      sales_channel: activeSalesChannel || 'dine_in',
      applied_bill_promotion_id: hasAutoBillPromo ? activeBillPromo.id : null,
      bill_discount_amount: promoBillDiscountAmount > 0 ? promoBillDiscountAmount : 0,
    }).select('id').single();

    if (txError) return alert('Error: ' + txError.message);

    const items = cartWithPromos.map(item => {
      const disc = itemDiscounts[item.product_id];
      let itemDiscAmt = 0;
      let appliedPromoId = null;
      if (disc) {
        itemDiscAmt = disc.type === 'percent' ? item.total_price * (disc.value / 100) : Math.min(disc.value, item.total_price);
      } else if (item.autoPromo) {
        itemDiscAmt = item.autoPromo.calculatedDiscount;
        appliedPromoId = item.autoPromo.id;
      }
      
      const finalPrice = Math.round((item.total_price - itemDiscAmt) * 100) / 100;
      
      return {
        transaction_id: txData.id, product_id: item.product_id, product_name: item.product_name,
        quantity: item.quantity, unit_price: item.unit_price,
        total_price: finalPrice, // Legacy total_price
        applied_promotion_id: appliedPromoId,
        original_price: item.total_price,
        discount_amount: Math.round(itemDiscAmt * 100) / 100,
        final_price: finalPrice
      };
    });

    const { error: itemError } = await supabase.from('transaction_items').insert(items);
    if (itemError) console.error('Items error:', itemError);

    // AR record
    if (paymentMethod === 'credit') {
      const customer = customers.find(c => c.id === selectedCustomer);
      if (customer) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (customer.ar_reminder_days || 30));
        
        let arPayload = {
          branch_id: shift.branch_id, 
          customer_name: customer.name, 
          customer_company: customer.company,
          total_amount: total, 
          paid_amount: 0, 
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending', 
          created_by: userId, 
          transaction_id: txData.id
        };

        let { error: arError } = await supabase.from('accounts_receivable').insert(arPayload);
        
        // Fallback for missing transaction_id migration
        if (arError && arError.message && (arError.message.includes('transaction_id') || arError.message.includes('column'))) {
          console.warn('transaction_id column might be missing. Trying without it...', arError);
          delete arPayload.transaction_id;
          const fallback = await supabase.from('accounts_receivable').insert(arPayload);
          arError = fallback.error;
        }

        if (arError) {
          alert('ไม่สามารถบันทึกข้อมูลลูกหนี้ได้: ' + arError.message);
          console.error('AR Insert Error:', arError);
        }
      }
    }

    // Atomic Stock Depletion via RPC
    try {
      await supabase.rpc('process_transaction_stock_depletion', { p_transaction_id: txData.id });
    } catch (depErr) { 
      console.error('Auto-depletion error (RPC):', depErr); 
    }

    // Receipt data
    const currentOrder = {
      orderNumber, items: [...cart], subtotal, deliveryFee, total,
      totalDiscount,
      promoName: hasAutoBillPromo ? activeBillPromo.name : null,
      promoDiscount: promoBillDiscountAmount,
      manualBillDiscount,
      totalItemDiscount,
      autoItemDiscTotal,
      paymentMethod,
      gpPercent: selectedMethod ? (Number(selectedMethod.gpPercent) || 0) : 0,
      gpAmount: (total * (selectedMethod ? (Number(selectedMethod.gpPercent) || 0) : 0)) / 100,
      cashReceived: paymentMethod === 'cash' ? effectiveCashReceived : null,
      changeAmount: paymentMethod === 'cash' ? changeAmount : null,
      customerName: paymentMethod === 'credit' && selectedCustomer ? customers.find(c => c.id === selectedCustomer)?.name : null,
      user_name: user?.user_metadata?.name || user?.email || 'Cashier',
      date: new Date(),
    };
    setReceiptData(currentOrder);
    setShowReceipt(true);

    if (sysConfig?.lineOAToken) {
      console.log(`[Line OA] Sending order ${orderNumber} notification`);
    }

    // Clear
    setCart([]); setShowPayment(false); setCashReceived('');
    setSelectedCustomer(''); setPaymentMethod('cash'); setDeliveryType('round');
    setItemDiscounts({}); setBillDiscount(null);
    
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="pos-layout">
      {/* Left: Menu */}
      <div className="pos-menu">
        {/* Sales Channels */}
        {salesChannels && salesChannels.length > 0 && (
          <div className="flex gap-2 mb-3 pb-3 border-b border-slate-700/50 overflow-x-auto shrink-0">
            {salesChannels.map(ch => (
              <button key={ch.id} onClick={() => setActiveSalesChannel(ch.id)}
                className={`py-1.5 px-3 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeSalesChannel === ch.id
                    ? 'bg-emerald-600 text-white shadow-md border border-emerald-500'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                }`}>
                <span>{ch.emoji}</span> {ch.label}
              </button>
            ))}
          </div>
        )}

        <div className="pos-categories">
          <button className={`pos-category-btn ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>ทั้งหมด</button>
          <button className={`pos-category-btn ${activeCategory === 'promotions' ? 'active' : ''}`} onClick={() => setActiveCategory('promotions')}>
            🔥 โปรโมชั่น
          </button>
          {categories.map(cat => (
            <button key={cat.id} className={`pos-category-btn ${activeCategory === cat.id ? 'active' : ''}`} onClick={() => setActiveCategory(cat.id)}>{cat.name}</button>
          ))}
        </div>

        <div className="pos-products-grid">
          {loading ? (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}><span className="animate-pulse">กำลังโหลดเมนู...</span></div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}><ShoppingCart size={48} /><h3>ยังไม่มีสินค้า</h3></div>
          ) : (
            filteredProducts.map((product, idx) => (
              <div key={product.id} className="pos-product-card" onClick={() => addToCart(product)} style={{ position: 'relative' }}>
                {productPromotionsMap[product.id] && (
                  <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#e11d48', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '12px', fontWeight: 'bold', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                    🏷️ โปรโมชั่น
                  </div>
                )}
                {product.image_url ? (
                  <div className="product-image" style={{ width: '56px', height: '56px', margin: '0 auto 8px auto', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                    <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ width: '56px', height: '56px', margin: '0 auto 8px auto' }} />
                )}
                <div className="product-name">{product.name}</div>
                <div className="product-price">
                  ฿{getChannelPrice(product).toLocaleString()}
                  {activeSalesChannel !== 'dine_in' && getChannelPrice(product) !== Number(product.price) && (
                    <span className="text-[10px] text-slate-500 line-through ml-1">฿{Number(product.price).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className={`pos-cart ${isMobileCartOpen ? 'mobile-open' : ''}`}>
        
        {/* Mobile Handle (Only visible on small screens CSS) */}
        <div className="pos-cart-mobile-handle" onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
               <ShoppingCart size={18} /> ตะกร้า
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
               <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>฿{total.toLocaleString()}</span>
               <div className="badge badge-ghost" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                 {cart.length} รายการ {isMobileCartOpen ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
               </div>
             </div>
           </div>
           {!isMobileCartOpen && (
             <div style={{ marginTop: '12px' }}>
                <button className="btn btn-success" style={{ width: '100%', justifyContent: 'center' }} disabled={cart.length === 0} onClick={(e) => { e.stopPropagation(); setShowPayment(true); }}>
                  <CreditCard size={16} /> ชำระเงิน
                </button>
             </div>
           )}
        </div>

        {/* Desktop Header */}
        <div className="pos-cart-header">
          <h3>🛒 ตะกร้า</h3>
          <span className="badge badge-info">{cart.length} รายการ</span>
        </div>

        <div className={`pos-cart-body ${!isMobileCartOpen ? 'mobile-closed' : ''}`} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        <div className="pos-cart-items">
          {cartWithPromos.length === 0 ? (
            <div className="empty-state"><ShoppingCart size={40} /><h3>ตะกร้าว่าง</h3><p>กดที่เมนูเพื่อเพิ่มสินค้า</p></div>
          ) : (
            cartWithPromos.map(item => {
              const disc = itemDiscounts[item.product_id];
              let combinedDiscAmt = 0;
              if (disc) {
                combinedDiscAmt = disc.type === 'percent' ? item.total_price * (disc.value / 100) : Math.min(disc.value, item.total_price);
              } else if (item.autoPromo) {
                combinedDiscAmt = item.autoPromo.calculatedDiscount;
              }
              
              return (
                <div key={item.product_id} className="pos-cart-item">
                  <div className="pos-cart-item-info">
                    <div className="pos-cart-item-name">{item.product_name}</div>
                    <div className="pos-cart-item-price">
                      ฿{item.unit_price.toLocaleString()} / ชิ้น
                      {disc && <span style={{ color: '#f59e0b', fontSize: '10px', marginLeft: '6px' }}>🏷️ -{disc.type === 'percent' ? `${disc.value}%` : `฿${disc.value}`}</span>}
                      {!disc && item.autoPromo && <span style={{ color: '#10b981', fontSize: '10px', marginLeft: '6px' }}>🎉 {item.autoPromo.name}</span>}
                    </div>
                  </div>
                  <div className="pos-cart-item-qty">
                    <button onClick={() => updateQty(item.product_id, -1)}><Minus size={12} /></button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQty(item.product_id, 1)}><Plus size={12} /></button>
                  </div>
                  <div className="pos-cart-item-total" style={{ position: 'relative' }}>
                    {combinedDiscAmt > 0 ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '11px' }}>฿{item.total_price.toLocaleString()}</span>
                        <br />
                        <span style={{ color: 'var(--accent-success)', fontWeight: 700 }}>฿{(item.total_price - combinedDiscAmt).toLocaleString()}</span>
                      </>
                    ) : (
                      <>฿{item.total_price.toLocaleString()}</>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button className="btn-icon" style={{ width: 26, height: 26 }} onClick={() => openItemDiscountModal(item.product_id)} title="ส่วนลดรายการนี้">
                      <Tag size={12} />
                    </button>
                    <button className="btn-icon" style={{ width: 26, height: 26 }} onClick={() => removeItem(item.product_id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pos-cart-summary">
          <div className="pos-cart-summary-row"><span>ยอดรวม</span><span>฿{subtotal.toLocaleString()}</span></div>
          {manualItemDiscTotal > 0 && (
            <div className="pos-cart-summary-row" style={{ color: '#f59e0b', fontSize: '13px' }}>
              <span>🏷️ ส่วนลดรายชิ้น (Manual)</span><span>-฿{manualItemDiscTotal.toLocaleString()}</span>
            </div>
          )}
          {autoItemDiscTotal > 0 && (
            <div className="pos-cart-summary-row" style={{ color: '#10b981', fontSize: '13px' }}>
              <span>🎉 ส่วนลดโปรโมชั่น (สินค้า)</span><span>-฿{autoItemDiscTotal.toLocaleString()}</span>
            </div>
          )}
          {promoBillDiscountAmount > 0 && (
            <div className="pos-cart-summary-row" style={{ color: '#3b82f6', fontSize: '13px' }}>
              <span>🎉 {activeBillPromo?.name}</span><span>-฿{promoBillDiscountAmount.toLocaleString()}</span>
            </div>
          )}
          {manualBillDiscount > 0 && (
            <div className="pos-cart-summary-row" style={{ color: '#f59e0b', fontSize: '13px' }}>
              <span>✂️ ส่วนลดท้ายบิล</span><span>-฿{manualBillDiscount.toLocaleString()}</span>
            </div>
          )}
          {deliveryFee > 0 && (
            <div className="pos-cart-summary-row" style={{ color: '#f59e0b', fontSize: '13px' }}>
              <span>⚡ ค่าส่ง</span><span>+฿{deliveryFee.toLocaleString()}</span>
            </div>
          )}
          <div className="pos-cart-summary-row total"><span>รวมทั้งหมด</span><span>฿{total.toLocaleString()}</span></div>

          <div className="pos-cart-actions">
            <button className="btn btn-ghost" onClick={() => { setCart([]); setItemDiscounts({}); setBillDiscount(null); }}>
              <Trash2 size={16} /> ล้าง
            </button>
            <button
              className="btn btn-ghost"
              disabled={cart.length === 0 || hasAutoBillPromo}
              onClick={openBillDiscountModal}
              title={hasAutoBillPromo ? 'ไม่สามารถลดซ้อนได้ (มีโปรโมชั่นอัตโนมัติ)' : 'ส่วนลดท้ายบิล'}
              style={{ opacity: hasAutoBillPromo ? 0.4 : 1 }}
            >
              <Percent size={16} /> {billDiscount ? `ลด ${billDiscount.type === 'percent' ? billDiscount.value + '%' : '฿' + billDiscount.value}` : 'ลดท้ายบิล'}
            </button>
            <button className="btn btn-success" disabled={cart.length === 0} onClick={() => setShowPayment(true)}>
              <CreditCard size={16} /> ชำระเงิน
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Item Discount Modal */}
      {showItemDiscountModal && (
        <div className="modal-overlay" onClick={() => setShowItemDiscountModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h3>🏷️ ส่วนลดรายการ</h3>
              <button className="btn-icon" onClick={() => setShowItemDiscountModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                {cart.find(i => i.product_id === showItemDiscountModal)?.product_name}
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button className={`btn ${discountInput.type === 'amount' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setDiscountInput(p => ({ ...p, type: 'amount' }))} style={{ flex: 1, justifyContent: 'center' }}>
                  💵 ลดเป็นบาท
                </button>
                <button className={`btn ${discountInput.type === 'percent' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setDiscountInput(p => ({ ...p, type: 'percent' }))} style={{ flex: 1, justifyContent: 'center' }}>
                  % ลดเป็นเปอร์เซ็น
                </button>
              </div>
              <input type="number" className="form-input" style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
                placeholder={discountInput.type === 'percent' ? `สูงสุด ${discountLimit.maxPercent}%` : `สูงสุด ฿${discountLimit.maxAmount}`}
                value={discountInput.value} onChange={e => setDiscountInput(p => ({ ...p, value: e.target.value }))}
                min="0" max={discountInput.type === 'percent' ? discountLimit.maxPercent : discountLimit.maxAmount} />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                ขีดจำกัด: {discountInput.type === 'percent' ? `${discountLimit.maxPercent}%` : `฿${discountLimit.maxAmount.toLocaleString()}`}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => {
                setItemDiscounts(prev => { const n = { ...prev }; delete n[showItemDiscountModal]; return n; });
                setShowItemDiscountModal(null);
              }}>ลบส่วนลด</button>
              <button className="btn btn-success" onClick={saveItemDiscount}>✅ ยืนยัน</button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Discount Modal */}
      {showBillDiscountModal && (
        <div className="modal-overlay" onClick={() => setShowBillDiscountModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h3>✂️ ส่วนลดท้ายบิล</h3>
              <button className="btn-icon" onClick={() => setShowBillDiscountModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>ยอดรวมก่อนลด</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>฿{afterItemDiscount.toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button className={`btn ${discountInput.type === 'amount' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setDiscountInput(p => ({ ...p, type: 'amount' }))} style={{ flex: 1, justifyContent: 'center' }}>
                  💵 ลดเป็นบาท
                </button>
                <button className={`btn ${discountInput.type === 'percent' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setDiscountInput(p => ({ ...p, type: 'percent' }))} style={{ flex: 1, justifyContent: 'center' }}>
                  % ลดเป็นเปอร์เซ็น
                </button>
              </div>
              <input type="number" className="form-input" style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
                placeholder={discountInput.type === 'percent' ? `สูงสุด ${discountLimit.maxPercent}%` : `สูงสุด ฿${discountLimit.maxAmount}`}
                value={discountInput.value} onChange={e => setDiscountInput(p => ({ ...p, value: e.target.value }))}
                min="0" max={discountInput.type === 'percent' ? discountLimit.maxPercent : discountLimit.maxAmount} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setBillDiscount(null); setShowBillDiscountModal(false); }}>ลบส่วนลด</button>
              <button className="btn btn-success" onClick={saveBillDiscount}>✅ ยืนยัน</button>
            </div>
          </div>
        </div>
      )}

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
                {totalDiscount > 0 && (
                  <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>ส่วนลดรวม: -฿{totalDiscount.toLocaleString()}</div>
                )}
              </div>

              <div className="grid-2" style={{ marginBottom: '16px' }}>
                {paymentMethods.map(m => {
                  const IconComp = PM_ICON_MAP[m.icon] || CircleDollarSign;
                  return (
                    <button key={m.value}
                      className={`btn ${paymentMethod === m.value ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => { setPaymentMethod(m.value); setDeliveryType('round'); }}
                      style={{ justifyContent: 'center' }}>
                      <IconComp size={18} /> {m.label}
                    </button>
                  );
                })}
              </div>

              {configuredDeliveryFee > 0 && (
                <div className="form-group">
                  <label className="form-label">ประเภทการส่ง</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={`btn ${deliveryType === 'round' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDeliveryType('round')} style={{ flex: 1, justifyContent: 'center' }}>🔄 ตามรอบ (ฟรี)</button>
                    <button className={`btn ${deliveryType === 'express' ? 'btn-success' : 'btn-ghost'}`} onClick={() => setDeliveryType('express')} style={{ flex: 1, justifyContent: 'center' }}>⚡ นอกรอบ (+฿{configuredDeliveryFee})</button>
                  </div>
                </div>
              )}

              {paymentMethod === 'cash' && (
                <div className="form-group">
                  <label className="form-label">เงินที่รับ (บาท)</label>
                  <input type="number" className="form-input" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                    placeholder={total.toString()} min={total} step="1" style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }} />
                  {cashReceived && (
                    <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '18px', fontWeight: 700, color: 'var(--accent-warning)' }}>
                      เงินทอน: ฿{changeAmount.toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'credit' && (
                <div className="form-group">
                  <label className="form-label">เลือกลูกค้าที่ต้องการค้างชำระ *</label>
                  <select className="form-input" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ fontSize: '16px', padding: '12px' }}>
                    <option value="">-- เลือกลูกค้า --</option>
                    {customers.map(c => (<option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 w-full mt-4">
              <button className="btn btn-ghost flex-1" onClick={() => setShowPayment(false)}>ยกเลิก</button>
              <button 
                className={`btn btn-success btn-lg flex-[2] flex items-center justify-center gap-2 ${isProcessing ? 'opacity-70 cursor-not-allowed' : ''}`} 
                onClick={handleCheckout}
                disabled={isProcessing}
              >
                {isProcessing ? 'กำลังประมวลผล...' : '✅ ยืนยันชำระเงิน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="modal-overlay" onClick={() => setShowReceipt(false)}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #receipt-print-area, #receipt-print-area * { visibility: visible; }
              #receipt-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 10px; }
              .modal-overlay { background: transparent; }
            }
          `}</style>
          <div className="modal" style={{ maxWidth: '380px', padding: 0, overflow: 'auto', maxHeight: '90vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowReceipt(false)} style={{ position: 'sticky', top: '8px', right: '8px', float: 'right', zIndex: 10, background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', marginRight: '8px', marginTop: '8px' }}>✕</button>
            <div id="receipt-print-area" style={{ padding: '24px', background: '#fff', color: '#000', fontFamily: 'monospace, sans-serif' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                {companyInfo?.logo ? (
                  <img src={companyInfo.logo} alt="Logo" style={{ maxWidth: '80px', maxHeight: '80px', margin: '0 auto 8px', objectFit: 'contain' }} />
                ) : (
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{companyInfo?.name || 'สมชายหมูปิ้ง'}</div>
                )}
                {companyInfo?.addressLine1 && <div style={{ fontSize: '12px' }}>{companyInfo.addressLine1}</div>}
                {companyInfo?.taxId && <div style={{ fontSize: '12px', marginTop: '4px' }}>TAX ID: {companyInfo.taxId}</div>}
              </div>
              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>ใบเสร็จรับเงิน</span><span style={{ fontWeight: 600 }}>{receiptData.orderNumber}</span>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>วันที่</span><span>{receiptData.date.toLocaleString('th-TH')}</span>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>พนักงาน</span><span>{receiptData.user_name}</span>
              </div>
              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <tbody>
                  {receiptData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 0' }}>{item.quantity}x</td>
                      <td style={{ padding: '4px 4px', width: '100%' }}>{item.product_name}</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.total_price.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              <div style={{ fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>รวมเป็นเงิน</span><span>{receiptData.subtotal.toLocaleString()}</span>
                </div>
                {receiptData.totalDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#d97706' }}>
                    <span>ส่วนลด {receiptData.promoName ? `(${receiptData.promoName})` : ''}</span>
                    <span>-{receiptData.totalDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', margin: '8px 0' }}>
                  <span>ยอดสุทธิ</span><span>฿{receiptData.total.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              <div style={{ fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>วิธีชำระเงิน</span>
                  <span>{(() => {
                    const allMethods = (() => { try { const raw = localStorage.getItem('paymentMethods'); return raw ? JSON.parse(raw) : DEFAULT_PAYMENT_METHODS; } catch { return DEFAULT_PAYMENT_METHODS; } })();
                    const found = allMethods.find(m => m.value === receiptData.paymentMethod);
                    return found ? (found.value === 'credit' ? `เงินเชื่อ (${receiptData.customerName || ''})` : found.label) : receiptData.paymentMethod;
                  })()}</span>
                </div>
                {receiptData.paymentMethod === 'cash' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>รับเงินมา</span><span>{receiptData.cashReceived?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>เงินทอน</span><span>{receiptData.changeAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </div>
              <div style={{ borderBottom: '1px dashed #ccc', margin: '12px 0' }} />
              <div style={{ textAlign: 'center', fontSize: '12px', marginTop: '16px', whiteSpace: 'pre-wrap', color: '#666' }}>
                {sysConfig?.receiptFooter || 'ขอบคุณที่ใช้บริการ 🐷'}
              </div>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--border-primary)' }}>
              <button onClick={() => setShowReceipt(false)} style={{ flex: 1, padding: '16px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}>ปิดหน้าต่าง</button>
              <button onClick={() => window.print()} style={{ flex: 1, padding: '16px', background: 'var(--accent-primary)', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>🖨️ พิมพ์ใบเสร็จ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
