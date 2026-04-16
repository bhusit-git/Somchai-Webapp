import React, { useState, useEffect } from 'react';
import {
  Receipt, Search, Filter, Eye, XCircle, ChevronDown, ChevronUp, Edit,
  ShoppingCart, Banknote, QrCode, CreditCard, Truck, Users,
  DollarSign, Calendar, Clock, RefreshCw, Wallet, Smartphone, CircleDollarSign, HandCoins, Download, UserPlus, Gift
} from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DateRangePicker from '../components/DateRangePicker';
import TimeRangePicker from '../components/TimeRangePicker';

const PM_ICON_MAP = {
  Banknote, QrCode, CreditCard, Truck, Users, Wallet, Smartphone, CircleDollarSign, HandCoins, Gift,
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

function loadPaymentMethods() {
  try {
    const raw = localStorage.getItem('paymentMethods');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed; // We want all to display history, even if disabled now
    }
  } catch (err) {
    console.error('Error loading payment methods:', err);
  }
  return DEFAULT_PAYMENT_METHODS;
}

const STATUS_LABELS = {
  completed: { label: 'สำเร็จ', class: 'badge-success' },
  voided: { label: 'ยกเลิก', class: 'badge-danger' },
  refunded: { label: 'คืนเงิน', class: 'badge-warning' },
};

const MENU_ITEMS = [
  { id: 'summary', label: 'สรุปยอดขาย' },
  { id: 'by_product', label: 'ยอดขายตามสินค้า' },
  { id: 'by_category', label: 'ยอดขาย แยกตาม หมวดหมู่' },
  { id: 'by_employee', label: 'ยอดขาย แยกตาม พนักงาน' },
  { id: 'by_payment', label: 'ยอดขาย แยกตาม ประเภทการชำระเงิน' },
  { id: 'receipts', label: 'ใบเสร็จรับเงิน' },
  { id: 'by_options', label: 'ยอดขาย แยกตาม ตัวเลือกเพิ่มเติม' },
  { id: 'discounts', label: 'ส่วนลด' },
  { id: 'taxes', label: 'ภาษี' },
  { id: 'shifts', label: 'กะ' },
];

export default function SalesHistory() {
  const [transactions, setTransactions] = useState([]);
  const [paymentMethods] = useState(() => loadPaymentMethods());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const todayStr = new Date().toISOString().split('T')[0];
  const [dateFilterStart, setDateFilterStart] = useState(todayStr);
  const [dateFilterEnd, setDateFilterEnd] = useState(todayStr);
  const [timeFilter, setTimeFilter] = useState({ isAllDay: true, start: '00:00', end: '23:59' });
  const [expandedRow, setExpandedRow] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('summary');

  // -- Link AR state --
  const [customers, setCustomers] = useState([]);
  const [showLinkArModal, setShowLinkArModal] = useState(false);
  const [linkArTarget, setLinkArTarget] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [linkingAr, setLinkingAr] = useState(false);

  // -- Edit Payment state --
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [editPaymentTarget, setEditPaymentTarget] = useState(null);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [editingPayment, setEditingPayment] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
      loadCustomers();
    }
  }, [user?.id, dateFilterStart, dateFilterEnd, timeFilter]);

  async function loadCustomers() {
    if (!user?.branch_id) return;
    try {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('branch_id', user.branch_id)
        .order('name');
      setCustomers(data || []);
    } catch (err) {
      console.error('Error loading customers:', err);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      let allData = [];
      let hasMore = true;
      let offset = 0;
      const limit = 1000;

      // Pre-compute date boundaries once
      const startTime = timeFilter.isAllDay ? '00:00' : timeFilter.start;
      const endTime = timeFilter.isAllDay ? '23:59' : timeFilter.end;

      let parsedEndDate = dateFilterEnd;
      if (endTime < startTime) {
        const [y, m, d] = dateFilterEnd.split('-').map(Number);
        const endD = new Date(y, m - 1, d + 1);
        parsedEndDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
      }

      const startTimestamp = `${dateFilterStart}T${startTime}:00+07:00`;
      const endTimestamp = `${parsedEndDate}T${endTime}:59+07:00`;

      console.log('[SalesHistory] Query range:', startTimestamp, '→', endTimestamp, '| branch:', user?.branch_id);

      while (hasMore) {
        // Build query with filters FIRST, then order and paginate
        let query = supabase
          .from('transactions')
          .select(`
            *,
            users:created_by (name)
          `)
          .eq('branch_id', user.branch_id)
          .gte('created_at', startTimestamp)
          .lte('created_at', endTimestamp)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        const { data, error } = await query;

        if (error) {
          console.error('[SalesHistory] Error:', error);
          if (offset === 0) setTransactions([]);
          break;
        }

        console.log('[SalesHistory] Fetched batch:', data?.length, 'rows at offset', offset);

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          offset += limit;
          if (data.length < limit) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log('[SalesHistory] Total loaded:', allData.length, 'transactions');
      setTransactions(allData);
    } catch (err) {
      console.error('[SalesHistory] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactionItems(txId) {
    if (expandedRow === txId) {
      setExpandedRow(null);
      return;
    }
    setLoadingItems(true);
    setExpandedRow(txId);
    try {
      const { data, error } = await supabase
        .from('transaction_items')
        .select('*')
        .eq('transaction_id', txId);

      if (error) {
        console.error('Error loading items:', error);
        setExpandedItems([]);
      } else {
        setExpandedItems(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingItems(false);
    }
  }

  function openVoidModal(tx) {
    setVoidTarget(tx);
    setVoidReason('');
    setShowVoidModal(true);
  }

  // -- Link AR handlers --
  function openLinkArModal(tx) {
    setLinkArTarget(tx);
    setSelectedCustomerId('');
    setShowLinkArModal(true);
  }

  async function handleLinkAR() {
    if (!linkArTarget || !selectedCustomerId) {
      alert('กรุณาเลือกลูกค้า');
      return;
    }
    setLinkingAr(true);
    try {
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (!customer) { alert('ไม่พบข้อมูลลูกค้า'); return; }

      // Check if AR record already exists for this transaction
      const { data: existingAr } = await supabase
        .from('accounts_receivable')
        .select('id')
        .eq('transaction_id', linkArTarget.id)
        .maybeSingle();

      if (existingAr) {
        // Update existing AR record
        const { error } = await supabase
          .from('accounts_receivable')
          .update({
            customer_name: customer.name,
            customer_company: customer.company || null,
          })
          .eq('id', existingAr.id);
        if (error) throw error;
        alert(`อัปเดตลูกหนี้เป็น "${customer.name}" สำเร็จ`);
      } else {
        // Create new AR record
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (customer.ar_reminder_days || 30));

        const { error } = await supabase
          .from('accounts_receivable')
          .insert({
            branch_id: linkArTarget.branch_id || user.branch_id,
            customer_name: customer.name,
            customer_company: customer.company || null,
            total_amount: Math.abs(Number(linkArTarget.total)),
            paid_amount: 0,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pending',
            created_by: user.id,
            transaction_id: linkArTarget.id,
            created_at: linkArTarget.created_at,
          });
        if (error) throw error;
        alert(`ตั้งหนี้ให้ "${customer.name}" สำเร็จ (บิล ${linkArTarget.order_number})`);
      }

      setShowLinkArModal(false);
      setLinkArTarget(null);
      await loadData();
    } catch (err) {
      console.error('Link AR Error:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setLinkingAr(false);
    }
  }

  // -- Edit Payment handlers --
  function openEditPaymentModal(tx) {
    setEditPaymentTarget(tx);
    setNewPaymentMethod(tx.payment_method);
    setShowEditPaymentModal(true);
  }

  async function handleEditPayment() {
    if (!editPaymentTarget || !newPaymentMethod) return;
    setEditingPayment(true);
    try {
      // 1. Update transaction
      const { error: txError } = await supabase
        .from('transactions')
        .update({ payment_method: newPaymentMethod })
        .eq('id', editPaymentTarget.id);

      if (txError) throw txError;

      // 2. Handle AR logic if old was credit and new is NOT credit
      if (editPaymentTarget.payment_method === 'credit' && newPaymentMethod !== 'credit') {
        await supabase
          .from('accounts_receivable')
          .update({ status: 'cancelled' })
          .eq('transaction_id', editPaymentTarget.id);
      }

      alert('แก้ไขช่องทางชำระเงินสำเร็จ');
      setShowEditPaymentModal(false);
      setEditPaymentTarget(null);
      await loadData(); // repull data
    } catch (err) {
      console.error('Edit Payment Error:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setEditingPayment(false);
    }
  }

  async function handleVoid() {
    if (!voidTarget || !voidReason.trim()) {
      alert('กรุณาระบุเหตุผลการยกเลิก');
      return;
    }
    setVoiding(true);
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'voided',
        })
        .eq('id', voidTarget.id);

      if (error) {
        alert('ยกเลิกไม่สำเร็จ: ' + error.message);
        return;
      }

      // Reload data
      await loadData();
      setShowVoidModal(false);
      setVoidTarget(null);
      setExpandedRow(null);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setVoiding(false);
    }
  }

  // Filter transactions
  const filteredTx = transactions.filter(tx => {
    const matchesSearch =
      tx.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.users?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    if (statusFilter === 'completed') return matchesSearch && tx.status === 'completed';
    if (statusFilter === 'voided') return matchesSearch && tx.status === 'voided';
    return matchesSearch;
  });

  // Summary stats
  let totalGrossSales = 0;
  let totalDiscount = 0;
  let totalNetSales = 0;
  let totalVoidedAmount = 0;
  let voidedCount = 0;
  let completedCount = 0;

  filteredTx.forEach(t => {
    const total = Number(t.total || 0);
    const subtotal = Number(t.subtotal || total);
    // Explicitly parse discount; fallback to subtotal - total if not present
    const discount = Number(t.discount || (subtotal - total) || 0);

    if (total < 0) {
      // Negative row (e.g. from POS refund sync)
      totalVoidedAmount += Math.abs(total);
      totalNetSales += total; // Negative value naturally reduces net sales
      if (t.status === 'voided' || t.status === 'refunded') voidedCount++;
    } else {
      // Positive row
      if (t.status === 'voided' || t.status === 'refunded') {
        // App-voided positive row
        totalGrossSales += subtotal;
        totalVoidedAmount += Math.abs(total);
        totalDiscount += Math.abs(discount);
        voidedCount++;
      } else if (t.status === 'completed') {
        // Normal completed sale
        totalGrossSales += subtotal;
        totalDiscount += Math.abs(discount);
        totalNetSales += total;
        completedCount++;
      }
    }
  });

  const totalBills = completedCount;
  const avgBill = totalBills > 0 ? totalNetSales / totalBills : 0;

  const isManager = ['owner', 'manager', 'store_manager'].includes(user?.role);

  const exportToCSV = () => {
    if (filteredTx.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    const exportData = filteredTx.map(tx => {
      const pmLabel = paymentMethods.find(m => m.value === tx.payment_method)?.label || tx.payment_method;
      const subtotal = Number(tx.subtotal || tx.total);
      const total = Number(tx.total);
      const discount = Number(tx.discount || (subtotal - total) || 0);

      return {
        'เวลา (Date/Time)': new Date(tx.created_at).toLocaleString('th-TH'),
        'เลขบิล (Receipt No)': tx.order_number,
        'พนักงาน (Staff)': tx.users?.name || '-',
        'ช่องทางชำระ (Payment)': pmLabel,
        'ยอดขายก่อนลด (Subtotal)': subtotal.toFixed(2),
        'ส่วนลด (Discount)': discount.toFixed(2),
        'ยอดสุทธิ (Total)': total.toFixed(2),
        'สถานะ (Status)': tx.status === 'completed' ? 'สำเร็จ' : tx.status === 'voided' ? 'ยกเลิก' : tx.status,
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Thai characters
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `sales_history_${dateFilterStart}_to_${dateFilterEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>รายการขาย </h3>
            <select 
              value={activeTab} 
              onChange={(e) => setActiveTab(e.target.value)}
              className="form-select"
              style={{ minWidth: '240px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}
            >
              {MENU_ITEMS.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted">เลือกประเภทรายงานและตรวจสอบรายการขายจาก POS</p>
        </div>
        <div className="desktop-only" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={exportToCSV} disabled={loading || filteredTx.length === 0}>
            <Download size={16} /> ส่งออก CSV
          </button>
          <button className="btn btn-ghost" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-pulse' : ''} /> รีเฟรช
          </button>
        </div>
      </div>

      {activeTab === 'summary' ? (
        <>
          {/* Stats Re-designed (Hero + Grid) */}
          <div className="flex flex-col gap-4 mb-6">
            
            {/* Hero Card: ยอดขายสุทธิ (Net Sales) */}
            <div className="stat-card" style={{ padding: '24px', border: '1px solid var(--accent-success)', background: 'linear-gradient(135deg, rgba(20,83,45,0.4), rgba(34,197,94,0.05))', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-10%', bottom: '-20%', opacity: 0.1 }}>
                <Wallet size={160} />
              </div>
              <div className="flex flex-col gap-2" style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-success)', fontWeight: 600 }}>
                  <div style={{ background: 'var(--accent-success-bg)', padding: '6px', borderRadius: '8px' }}><Wallet size={20} /></div>
                  ยอดขายสุทธิ
                </div>
                <h3 style={{ fontSize: '36px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
                  ฿{totalNetSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
            </div>

            {/* 2-Column Grid: ยอดขาย (Gross Sales) & ส่วนลด (Discount) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '6px', borderRadius: '8px' }}><DollarSign size={16} /></div>
                  ยอดขาย
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ฿{totalGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>

              <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>
                  <div style={{ background: 'var(--accent-warning-bg)', padding: '6px', borderRadius: '8px', color: 'var(--accent-warning)' }}><ShoppingCart size={16} /></div>
                  ส่วนลด
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {totalDiscount > 0 ? '-' : ''}฿{totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
            </div>

            {/* Full Width Row: คืนเงิน (Refund) */}
            <div className="stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600 }}>
                <div style={{ background: 'var(--accent-danger-bg)', padding: '6px', borderRadius: '8px', color: 'var(--accent-danger)' }}><XCircle size={16} /></div>
                คืนเงิน
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: totalVoidedAmount > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {totalVoidedAmount > 0 ? '-' : ''}฿{totalVoidedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>

          </div>

          {/* Filters */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: '20px' }}>
              <div className="flex items-center gap-4" style={{ display: 'flex', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                {/* Date */}
                <div style={{ position: 'relative', minWidth: '240px' }}>
                  <DateRangePicker 
                    startDate={dateFilterStart}
                    endDate={dateFilterEnd}
                    onChange={(start, end) => {
                      setDateFilterStart(start);
                      setDateFilterEnd(end);
                    }}
                  />
                </div>
                {/* Time */}
                <div style={{ position: 'relative', minWidth: '180px' }}>
                  <TimeRangePicker 
                    value={timeFilter}
                    onChange={setTimeFilter}
                  />
                </div>
                {/* Search */}
                <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '300px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ค้นหาเลขบิล, พนักงาน..."
                    style={{ paddingLeft: '36px' }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                {/* Status */}
                <div style={{ position: 'relative', width: '180px' }}>
                  <Filter size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
                  <select
                    className="form-select"
                    style={{ paddingLeft: '36px' }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="completed">สำเร็จ</option>
                    <option value="voided">ยกเลิกแล้ว</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Transaction List (Card View) */}
            <div className="flex flex-col gap-3">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <span className="animate-pulse">กำลังโหลด...</span>
                </div>
              ) : filteredTx.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-primary)' }}>
                  <Receipt size={48} />
                  <h3 style={{ marginTop: '16px' }}>ไม่มีรายการขาย</h3>
                  <p>ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา</p>
                </div>
              ) : (
                filteredTx.map((tx) => {
                  const pmDef = paymentMethods.find(m => m.value === tx.payment_method);
                  const pm = pmDef 
                    ? { label: pmDef.label, icon: PM_ICON_MAP[pmDef.icon] || DollarSign, color: 'var(--text-primary)' }
                    : { label: tx.payment_method, icon: DollarSign, color: 'var(--text-muted)' };
                  const PayIcon = pm.icon;
                  const statusInfo = STATUS_LABELS[tx.status] || { label: tx.status, class: 'badge-ghost' };
                  const isExpanded = expandedRow === tx.id;
                  const createdAt = new Date(tx.created_at);

                  return (
                    <div key={tx.id} style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-primary)', overflow: 'hidden', opacity: tx.status === 'voided' ? 0.6 : 1 }}>
                      <div 
                        style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }}
                        onClick={() => loadTransactionItems(tx.id)}
                      >
                        {/* Left Icon */}
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Receipt size={24} style={{ color: 'var(--text-muted)' }} />
                        </div>
                        
                        {/* Middle Info */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                              {tx.order_number}
                            </span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {tx.order_type === 'delivery' ? 'Delivery' : 'หน้าร้าน'}
                            </span>
                            {tx.status !== 'completed' && <span className={`badge ${statusInfo.class}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>{statusInfo.label}</span>}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {createdAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} • {tx.users?.name || '-'}
                          </div>
                        </div>

                        {/* Right Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                          <span style={{ fontSize: '18px', fontWeight: 800, color: tx.status === 'voided' ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                            {tx.status === 'voided' && <span style={{ textDecoration: 'line-through', marginRight: '4px', fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>฿{Number(tx.total).toLocaleString()}</span>}
                            {tx.status !== 'voided' && `฿${Number(tx.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                          </span>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {pm.label}
                          </span>
                        </div>
                      </div>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div style={{ padding: '0 16px 16px', background: 'var(--bg-card)' }}>
                          <div style={{ borderTop: '1px dashed var(--border-primary)', paddingTop: '16px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                              📦 รายการสินค้าในบิล {tx.order_number}
                            </div>
                            {loadingItems ? (
                              <span className="animate-pulse" style={{ fontSize: '13px' }}>กำลังโหลด...</span>
                            ) : expandedItems.length === 0 ? (
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>ไม่พบรายการสินค้า</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {expandedItems.map((item, i) => (
                                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <span style={{ color: 'var(--text-muted)', width: '20px' }}>{i+1}.</span>
                                      <span style={{ color: 'var(--text-primary)' }}>{item.product_name}</span>
                                      <span style={{ color: 'var(--text-muted)' }}>x{item.quantity}</span>
                                    </div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                      ฿{Number(item.total_price).toLocaleString()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Additional info */}
                            {tx.delivery_fee > 0 && (
                              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-primary)', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                <span>⚡ ค่าส่ง</span>
                                <span>฿{Number(tx.delivery_fee).toLocaleString()}</span>
                              </div>
                            )}
                            
                            {/* Manager Actions */}
                            {isManager && (
                              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed var(--border-primary)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {tx.status === 'completed' && (
                                  <button
                                    className="btn btn-sm btn-outline"
                                    onClick={(e) => { e.stopPropagation(); openEditPaymentModal(tx); }}
                                    style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }}
                                  >
                                    <Edit size={14} /> แก้ไขช่องทางชำระ
                                  </button>
                                )}
                                {tx.payment_method === 'credit' && tx.status === 'completed' && (
                                  <button
                                    className="btn btn-sm"
                                    onClick={(e) => { e.stopPropagation(); openLinkArModal(tx); }}
                                    style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px' }}
                                  >
                                    <UserPlus size={14} /> ระบุลูกหนี้
                                  </button>
                                )}
                                {tx.status === 'completed' && (
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={(e) => { e.stopPropagation(); openVoidModal(tx); }}
                                    style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }}
                                  >
                                    <XCircle size={14} /> ยกเลิกบิล
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Void Modal */}
          {showVoidModal && voidTarget && (
            <div className="modal-overlay" onClick={() => setShowVoidModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <div className="modal-header">
                  <h3>⚠️ ยกเลิกบิล</h3>
                  <button className="btn-icon" onClick={() => setShowVoidModal(false)}>✕</button>
                </div>
                <div className="modal-body">
                  <div style={{ padding: '16px', background: 'var(--accent-danger-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', border: '1px solid var(--accent-danger)', fontSize: '13px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--accent-danger)', marginBottom: '8px' }}>
                      คุณกำลังจะยกเลิกบิลนี้:
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>เลขบิล</span>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{voidTarget.order_number}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>ยอดเงิน</span>
                      <span style={{ fontWeight: 700, fontSize: '16px' }}>฿{Number(voidTarget.total).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>วิธีชำระ</span>
                      <span>{paymentMethods.find(m => m.value === voidTarget.payment_method)?.label || voidTarget.payment_method}</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">เหตุผลการยกเลิก *</label>
                    <textarea
                      className="form-textarea"
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="เช่น กดผิดเมนู, ลูกค้าเปลี่ยนใจ, ข้อมูลผิดพลาด..."
                      rows={3}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowVoidModal(false)} disabled={voiding}>ปิด</button>
                  <button className="btn btn-danger" onClick={handleVoid} disabled={voiding || !voidReason.trim()}>
                    {voiding ? '⏳ กำลังยกเลิก...' : '🗑️ ยืนยันยกเลิกบิล'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Link AR Modal */}
          {showLinkArModal && linkArTarget && (
            <div className="modal-overlay" onClick={() => setShowLinkArModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <div className="modal-header">
                  <h3>👤 ระบุลูกหนี้</h3>
                  <button className="btn-icon" onClick={() => setShowLinkArModal(false)}>✕</button>
                </div>
                <div className="modal-body">
                  <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', border: '1px solid var(--border-primary)', fontSize: '13px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '8px' }}>
                      ข้อมูลบิลที่ต้องการระบุลูกหนี้:
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>เลขบิล</span>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{linkArTarget.order_number}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>ยอดเงิน</span>
                      <span style={{ fontWeight: 700, fontSize: '16px' }}>฿{Number(linkArTarget.total).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>วันที่</span>
                      <span>{new Date(linkArTarget.created_at).toLocaleString('th-TH')}</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">เลือกลูกหนี้ *</label>
                    <select
                      className="form-input"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
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

                  {customers.length === 0 && (
                    <div style={{ padding: '12px', background: 'var(--accent-warning-bg)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)' }}>
                      ⚠️ ยังไม่มีข้อมูลลูกค้าในระบบ กรุณาเพิ่มลูกค้าในเมนู "ลูกหนี้-AR" ก่อน
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowLinkArModal(false)} disabled={linkingAr}>ปิด</button>
                  <button className="btn btn-primary" onClick={handleLinkAR} disabled={linkingAr || !selectedCustomerId}>
                    {linkingAr ? '⏳ กำลังบันทึก...' : '✅ ยืนยันระบุลูกหนี้'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Edit Payment Modal */}
          {showEditPaymentModal && editPaymentTarget && (
            <div className="modal-overlay" onClick={() => setShowEditPaymentModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                  <h3>💳 แก้ไขช่องทางชำระเงิน</h3>
                  <button className="btn-icon" onClick={() => setShowEditPaymentModal(false)}>✕</button>
                </div>
                <div className="modal-body">
                  <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', border: '1px solid var(--border-primary)', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>เลขบิล</span>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{editPaymentTarget.order_number}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>ยอดเงิน</span>
                      <span style={{ fontWeight: 700 }}>฿{Number(editPaymentTarget.total).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">เลือกช่องทางใหม่ *</label>
                    <select
                      className="form-input"
                      value={newPaymentMethod}
                      onChange={(e) => setNewPaymentMethod(e.target.value)}
                      style={{ fontSize: '16px', padding: '12px' }}
                    >
                      {paymentMethods.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  {editPaymentTarget.payment_method === 'credit' && newPaymentMethod !== 'credit' && (
                    <div style={{ padding: '12px', background: 'var(--accent-warning-bg)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)', marginTop: '8px' }}>
                      ⚠️ <strong>คำเตือน:</strong> บิลนี้เคยเป็นเงินเชื่อ การเปลี่ยนไปใช้ช่องทางอื่นจะทำการ "ยกเลิก" หนี้ที่เคยตั้งไว้ (ถ้ามี) อัตโนมัติ
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowEditPaymentModal(false)} disabled={editingPayment}>ปิด</button>
                  <button className="btn btn-primary" onClick={handleEditPayment} disabled={editingPayment || !newPaymentMethod || newPaymentMethod === editPaymentTarget.payment_method}>
                    {editingPayment ? '⏳ กำลังบันทึก...' : '✅ ยืนยันข้อมูล'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div>
          <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>🚀 กำลังพัฒนาส่วนนี้</h3>
            <p style={{ marginTop: '8px' }}>
              ฟังก์ชันนำเสนอข้อมูล {MENU_ITEMS.find(m => m.id === activeTab)?.label} กำลังจะเปิดใช้งานเร็วๆ นี้
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
