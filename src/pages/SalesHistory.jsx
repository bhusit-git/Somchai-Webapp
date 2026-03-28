import { useState, useEffect } from 'react';
import {
  Receipt, Search, Filter, Eye, XCircle, ChevronDown, ChevronUp,
  ShoppingCart, Banknote, QrCode, CreditCard, Truck, Users,
  DollarSign, Calendar, Clock, RefreshCw, Wallet, Smartphone, CircleDollarSign, HandCoins
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PM_ICON_MAP = {
  Banknote, QrCode, CreditCard, Truck, Users, Wallet, Smartphone, CircleDollarSign, HandCoins,
};

const DEFAULT_PAYMENT_METHODS = [
  { value: 'cash',      label: 'เงินสด',        icon: 'Banknote', isDefault: true, enabled: true, gpPercent: 0 },
  { value: 'promptpay', label: 'PromptPay',      icon: 'QrCode',   isDefault: true, enabled: true, gpPercent: 0 },
  { value: 'transfer',  label: 'โอนเงิน',        icon: 'CreditCard', isDefault: true, enabled: true, gpPercent: 0 },
  { value: 'delivery',  label: 'Delivery',       icon: 'Truck',    isDefault: true, enabled: true, gpPercent: 30 },
  { value: 'credit',    label: 'เงินเชื่อ (AR)', icon: 'Users',    isDefault: true, enabled: true, gpPercent: 0 },
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

export default function SalesHistory() {
  const [transactions, setTransactions] = useState([]);
  const [paymentMethods] = useState(() => loadPaymentMethods());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user) loadData();
  }, [user?.id, dateFilter]);

  async function loadData() {
    setLoading(true);
    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          users:created_by (name)
        `)
        .order('created_at', { ascending: false });

      if (user?.branch_id) {
        query = query.eq('branch_id', user.branch_id);
      }

      // Date filter
      if (dateFilter) {
        const startOfDay = `${dateFilter}T00:00:00+07:00`;
        const endOfDay = `${dateFilter}T23:59:59+07:00`;
        query = query.gte('created_at', startOfDay).lte('created_at', endOfDay);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[SalesHistory] Error:', error);
        setTransactions([]);
        return;
      }

      setTransactions(data || []);
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
  const completedTx = transactions.filter(t => t.status === 'completed');
  const totalSales = completedTx.reduce((sum, t) => sum + Number(t.total || 0), 0);
  const totalBills = completedTx.length;
  const voidedCount = transactions.filter(t => t.status === 'voided').length;
  const avgBill = totalBills > 0 ? totalSales / totalBills : 0;

  const isManager = ['owner', 'manager', 'store_manager'].includes(user?.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>รายการขาย (Sales History)</h3>
          <p className="text-sm text-muted">ตรวจสอบรายการขายจาก POS และยกเลิกบิลที่ผิดพลาด</p>
        </div>
        <button className="btn btn-ghost" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-pulse' : ''} /> รีเฟรช
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Receipt size={22} />
          </div>
          <div className="stat-info">
            <h3>{totalBills}</h3>
            <p>บิลทั้งหมด (สำเร็จ)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p>ยอดขายรวม</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">
            <ShoppingCart size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{avgBill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p>ยอดเฉลี่ยต่อบิล</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <XCircle size={22} />
          </div>
          <div className="stat-info">
            <h3>{voidedCount}</h3>
            <p>บิลที่ยกเลิก</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: '20px' }}>
          <div className="flex items-center gap-4" style={{ display: 'flex', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
            {/* Date */}
            <div style={{ position: 'relative', width: '180px' }}>
              <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
              <input
                type="date"
                className="form-input"
                style={{ paddingLeft: '36px' }}
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
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

        {/* Table */}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>เลขบิล</th>
                <th>เวลา</th>
                <th>พนักงาน</th>
                <th>ช่องทางชำระ</th>
                <th>ยอดรวม</th>
                {isManager && <th>GP</th>}
                <th>สถานะ</th>
                {isManager && <th>จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isManager ? 9 : 7} style={{ textAlign: 'center', padding: '40px' }}>
                    <span className="animate-pulse">กำลังโหลด...</span>
                  </td>
                </tr>
              ) : filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={isManager ? 9 : 7}>
                    <div className="empty-state">
                      <Receipt size={48} />
                      <h3>ไม่มีรายการขาย</h3>
                      <p>ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา</p>
                    </div>
                  </td>
                </tr>
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
                    <>
                      <tr key={tx.id} style={{ cursor: 'pointer', opacity: tx.status === 'voided' ? 0.6 : 1 }} onClick={() => loadTransactionItems(tx.id)}>
                        <td>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '13px' }}>
                          {tx.order_number}
                        </td>
                        <td style={{ fontSize: '13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                            {createdAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td style={{ fontSize: '13px' }}>
                          {tx.users?.name || '-'}
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                            <PayIcon size={14} style={{ color: pm.color }} />
                            {pm.label}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: tx.status === 'voided' ? 'var(--accent-danger)' : 'var(--text-primary)', fontSize: '14px' }}>
                          {tx.status === 'voided' && <span style={{ textDecoration: 'line-through' }}>฿{Number(tx.total).toLocaleString()}</span>}
                          {tx.status !== 'voided' && `฿${Number(tx.total).toLocaleString()}`}
                        </td>
                        {isManager && (
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {Number(tx.gp_percent || 0) > 0
                              ? `${tx.gp_percent}% (฿${Number(tx.gp_amount || 0).toLocaleString()})`
                              : '-'}
                          </td>
                        )}
                        <td>
                          <span className={`badge ${statusInfo.class}`}>{statusInfo.label}</span>
                        </td>
                        {isManager && (
                          <td>
                            {tx.status === 'completed' && (
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={(e) => { e.stopPropagation(); openVoidModal(tx); }}
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                              >
                                <XCircle size={14} /> ยกเลิก
                              </button>
                            )}
                            {tx.status === 'voided' && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ยกเลิกแล้ว</span>
                            )}
                          </td>
                        )}
                      </tr>
                      {/* Expanded row: transaction items */}
                      {isExpanded && (
                        <tr key={`${tx.id}-items`}>
                          <td colSpan={isManager ? 9 : 7} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                            <div style={{ padding: '16px 24px', borderLeft: '3px solid var(--accent-primary)' }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                📦 รายการสินค้าในบิล {tx.order_number}
                              </div>
                              {loadingItems ? (
                                <span className="animate-pulse" style={{ fontSize: '13px' }}>กำลังโหลด...</span>
                              ) : expandedItems.length === 0 ? (
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>ไม่พบรายการสินค้า</span>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ background: 'transparent', padding: '6px 12px', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>#</th>
                                      <th style={{ background: 'transparent', padding: '6px 12px', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>สินค้า</th>
                                      <th style={{ background: 'transparent', padding: '6px 12px', fontSize: '11px', textAlign: 'center', borderBottom: '1px solid var(--border-primary)' }}>จำนวน</th>
                                      <th style={{ background: 'transparent', padding: '6px 12px', fontSize: '11px', textAlign: 'right', borderBottom: '1px solid var(--border-primary)' }}>ราคา/ชิ้น</th>
                                      <th style={{ background: 'transparent', padding: '6px 12px', fontSize: '11px', textAlign: 'right', borderBottom: '1px solid var(--border-primary)' }}>รวม</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedItems.map((item, i) => (
                                      <tr key={item.id}>
                                        <td style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{item.product_name}</td>
                                        <td style={{ padding: '6px 12px', fontSize: '13px', textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                                        <td style={{ padding: '6px 12px', fontSize: '13px', textAlign: 'right' }}>฿{Number(item.unit_price).toLocaleString()}</td>
                                        <td style={{ padding: '6px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: 'var(--accent-success)' }}>฿{Number(item.total_price).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {/* Additional info */}
                              {tx.delivery_fee > 0 && (
                                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent-warning)' }}>
                                  ⚡ ค่าส่งนอกรอบ: ฿{Number(tx.delivery_fee).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
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
    </div>
  );
}
