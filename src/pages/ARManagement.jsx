import { useState, useEffect } from 'react';
import { Users, FileText, CheckCircle, Clock, Search, DollarSign, X, Printer, History, Ban, TrendingDown, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function ARManagement() {
  const [arList, setArList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [inlinePayments, setInlinePayments] = useState({});
  const [selectedAr, setSelectedAr] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transfer');

  const [showItemsModal, setShowItemsModal] = useState(false);
  const [itemsAr, setItemsAr] = useState(null);
  const [arItems, setArItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [arHistory, setArHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const { user } = useAuth();
  const currentBranchId = user?.branch_id;
  const currentUserId = user?.id;

  useEffect(() => {
    fetchAR();
  }, []);

  async function fetchAR() {
    setLoading(true);
    if (!currentBranchId) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('accounts_receivable')
      .select(`
        *,
        creator:users!created_by(name),
        transaction:transactions!transaction_id(order_number, created_at)
      `)
      .eq('branch_id', currentBranchId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setArList(data);
    }
    setLoading(false);
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedAr || !currentUserId) return;

    const amountToPay = parseFloat(paymentAmount);
    const newPaidAmount = Number(selectedAr.paid_amount) + amountToPay;
    const isFullyPaid = newPaidAmount >= Number(selectedAr.total_amount);

    // Create payment record
    const { error: paymentError } = await supabase.from('ar_payments').insert([{
      ar_id: selectedAr.id,
      amount: amountToPay,
      payment_method: paymentMethod,
      received_by: currentUserId
    }]);

    if (!paymentError) {
      // Update AR status
      await supabase.from('accounts_receivable').update({
        paid_amount: newPaidAmount,
        status: isFullyPaid ? 'paid' : 'partial'
      }).eq('id', selectedAr.id);

      setShowPaymentModal(false);
      setPaymentAmount('');
      setSelectedAr(null);
      fetchAR();
    }
  }

  async function handleViewItems(ar) {
    setItemsAr(ar);
    setShowItemsModal(true);
    setLoadingItems(true);
    setArItems([]);

    try {
      let txId = ar.transaction_id;
      
      // Fallback for legacy data without transaction_id
      if (!txId) {
        const arTime = new Date(ar.created_at).getTime();
        const minTime = new Date(arTime - 60000).toISOString(); // -1 minute
        const maxTime = new Date(arTime + 60000).toISOString(); // +1 minute

        const { data: txList, error: txError } = await supabase
          .from('transactions')
          .select('id, created_at')
          .eq('branch_id', ar.branch_id)
          .eq('payment_method', 'credit')
          .eq('total', ar.total_amount)
          .gte('created_at', minTime)
          .lte('created_at', maxTime)
          .order('created_at', { ascending: false })
          .limit(1);

        if (txError) throw txError;
        if (txList && txList.length > 0) txId = txList[0].id;
      }
      
      if (txId) {
        const { data: items, error: itemsError } = await supabase
          .from('transaction_items')
          .select('*')
          .eq('transaction_id', txId);
          
        if (itemsError) throw itemsError;
        setArItems(items || []);
      }
    } catch (err) {
      console.error('Error fetching AR items:', err);
    } finally {
      setLoadingItems(false);
    }
  }

  async function handleViewHistory(ar) {
    setSelectedAr(ar);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    setArHistory([]);

    try {
      const { data, error } = await supabase
        .from('ar_payments')
        .select('*, user:users!received_by(name)')
        .eq('ar_id', ar.id)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      setArHistory(data || []);
    } catch (err) {
      console.error('Error fetching AR history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleCancelAR(ar) {
    if (!window.confirm('คุณต้องการ "ยกเลิก" รายการหนี้นี้ใช่หรือไม่?\n(หมายเหตุ: การยกเลิกหนี้จะไม่ไปยกเลิกบิลขายในประวัติการขาย)')) return;
    const { error } = await supabase.from('accounts_receivable').update({ status: 'cancelled' }).eq('id', ar.id);
    if (!error) {
      alert('ยกเลิกรายการหนี้สำเร็จ');
      fetchAR();
    } else {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  }

  const calculateDerivedStatus = (ar) => {
    if (ar.status === 'cancelled') return 'cancelled';
    if (ar.status === 'paid') return 'paid';
    const isPastDue = new Date(ar.due_date) < new Date(new Date().setHours(0,0,0,0));
    if (isPastDue) return 'overdue';
    return ar.status; // 'pending' or 'partial'
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid': return <span className="badge badge-success">ชำระแล้ว</span>;
      case 'partial': return <span className="badge badge-warning">ชำระบางส่วน</span>;
      case 'overdue': return <span className="badge badge-error">เกินกำหนด</span>;
      case 'cancelled': return <span className="badge badge-ghost text-slate-500 border border-slate-500">ยกเลิกแล้ว</span>;
      default: return <span className="badge badge-outline">รอชำระ</span>;
    }
  };

  const uniqueCustomers = [...new Set(arList.map(ar => ar.customer_name))].filter(Boolean).sort();

  const filteredArList = arList.filter(ar => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !searchTerm || (ar.customer_name || '').toLowerCase().includes(term) || (ar.customer_company || '').toLowerCase().includes(term);
    const matchCustomer = !filterCustomer || ar.customer_name === filterCustomer;
    return matchSearch && matchCustomer;
  });

  async function handleInlinePayment(ar) {
    if (!currentUserId) return;
    const paymentState = inlinePayments[ar.id] || {};
    const pending = Number(ar.total_amount) - Number(ar.paid_amount);
    
    // Default to pending amount if they haven't typed anything
    const amountStr = paymentState.amount !== undefined && paymentState.amount !== '' ? paymentState.amount : pending.toString();
    const amountToPay = parseFloat(amountStr);
    
    if (isNaN(amountToPay) || amountToPay <= 0) {
      alert('กรุณากรอกจำนวนเงินให้ถูกต้อง');
      return;
    }
    if (amountToPay > pending) {
      alert('จำนวนเงินเกินยอดคงค้าง');
      return;
    }

    const method = paymentState.method || 'transfer';
    const newPaidAmount = Number(ar.paid_amount) + amountToPay;
    const isFullyPaid = newPaidAmount >= Number(ar.total_amount);

    if (!window.confirm(`ยืนยันรับชำระเงินยอด ฿${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })} สำหรับลูกหนี้ "${ar.customer_name}" ?`)) return;

    // Create payment record
    const { error: paymentError } = await supabase.from('ar_payments').insert([{
      ar_id: ar.id,
      amount: amountToPay,
      payment_method: method,
      received_by: currentUserId
    }]);

    if (!paymentError) {
      // Update AR status
      await supabase.from('accounts_receivable').update({
        paid_amount: newPaidAmount,
        status: isFullyPaid ? 'paid' : 'partial'
      }).eq('id', ar.id);

      setInlinePayments(prev => {
        const next = { ...prev };
        delete next[ar.id];
        return next;
      });
      fetchAR();
    } else {
      alert('เกิดข้อผิดพลาด: ' + paymentError.message);
    }
  }

  const activeArList = arList.filter(ar => ar.status !== 'cancelled');
  const totalPending = activeArList.reduce((sum, ar) => sum + (Number(ar.total_amount) - Number(ar.paid_amount)), 0);
  const totalInvoiced = activeArList.reduce((sum, ar) => sum + Number(ar.total_amount), 0);
  const totalPaid = activeArList.reduce((sum, ar) => sum + Number(ar.paid_amount), 0);
  const pendingCount = activeArList.filter(ar => ar.status !== 'paid').length;

  return (
    <div className="page-container">
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3 className="stat-title">ยอดรวมทั้งหมด (ตั้งหนี้)</h3>
            <DollarSign size={20} className="text-secondary" />
          </div>
          <p className="stat-value">฿{totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="stat-desc">จาก {activeArList.length} รายการ (ไม่นับที่ยกเลิก)</p>
        </div>
        <div className="stat-card" style={{ borderColor: 'var(--accent-success)' }}>
          <div className="stat-header">
            <h3 className="stat-title">ชำระมาแล้วรวม</h3>
            <Wallet size={20} style={{ color: 'var(--accent-success)' }} />
          </div>
          <p className="stat-value" style={{ color: 'var(--accent-success)' }}>฿{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="stat-desc">รับชำระสะสมทั้งหมด</p>
        </div>
        <div className="stat-card" style={{ borderColor: 'var(--accent-warning)' }}>
          <div className="stat-header">
            <h3 className="stat-title">ยอดคงค้างทั้งหมด</h3>
            <TrendingDown size={20} style={{ color: 'var(--accent-warning)' }} />
          </div>
          <p className="stat-value" style={{ color: 'var(--accent-warning)' }}>฿{totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="stat-desc">รอเก็บเงิน {pendingCount} รายการ</p>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <h3 className="card-title">รายการลูกหนี้การค้า (AR)</h3>
          <div className="flex gap-2 items-center flex-wrap">
            <select 
              className="form-control" 
              style={{ width: '180px', height: '36px', padding: '0 12px', fontSize: '14px' }}
              value={filterCustomer}
              onChange={e => setFilterCustomer(e.target.value)}
            >
              <option value="">ลูกหนี้ทั้งหมด</option>
              {uniqueCustomers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="search-bar" style={{ margin: 0 }}>
              <Search size={16} />
              <input type="text" placeholder="ค้นหาชื่อลูกค้า/บริษัท..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>ลูกค้า / บริษัท</th>
                <th>เลขบิล</th>
                <th>วันที่ขาย</th>
                <th>วันกำหนดชำระ</th>
                <th>ยอดรวม</th>
                <th>ยอดคงค้าง</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center">กำลังโหลด...</td></tr>
              ) : arList.length === 0 ? (
                <tr><td colSpan="8" className="text-center text-muted">ไม่มีรายการลูกหนี้</td></tr>
              ) : filteredArList.map(ar => {
                const pending = Number(ar.total_amount) - Number(ar.paid_amount);
                const currentStatus = calculateDerivedStatus(ar);
                return (
                  <tr key={ar.id}>
                    <td>
                      <div><strong>{ar.customer_name}</strong></div>
                      <div className="text-xs text-muted">{ar.customer_company || '-'}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>
                      {ar.transaction?.order_number || <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>-</span>}
                    </td>
                    <td>{new Date(ar.transaction?.created_at || ar.created_at).toLocaleDateString('th-TH')}</td>
                    <td>{new Date(ar.due_date + 'T00:00:00').toLocaleDateString('th-TH')}</td>
                    <td>฿{Number(ar.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="text-warning">฿{pending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{getStatusBadge(currentStatus)}</td>
                    <td>
                      <div className="flex items-center gap-2 flex-wrap">
                        {currentStatus !== 'paid' && currentStatus !== 'cancelled' && (
                          <div className="flex items-center gap-1 bg-tertiary p-1 rounded-md border border-slate-200 dark:border-slate-700">
                            <input 
                              type="number" 
                              className="form-control" 
                              style={{ width: '90px', height: '28px', padding: '0 8px', fontSize: '13px' }}
                              placeholder={pending.toString()}
                              value={inlinePayments[ar.id]?.amount !== undefined ? inlinePayments[ar.id].amount : ''}
                              onChange={e => setInlinePayments(prev => ({...prev, [ar.id]: { ...(prev[ar.id] || {}), amount: e.target.value }}))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleInlinePayment(ar);
                              }}
                              min="0"
                              step="0.01"
                            />
                            <select 
                              className="form-control"
                              style={{ width: '90px', height: '28px', padding: '0 4px', fontSize: '13px' }}
                              value={inlinePayments[ar.id]?.method || 'transfer'}
                              onChange={e => setInlinePayments(prev => ({...prev, [ar.id]: { ...(prev[ar.id] || {}), method: e.target.value }}))}
                            >
                              <option value="transfer">โอนเงิน</option>
                              <option value="cash">เงินสด</option>
                              <option value="credit_card">บัตร</option>
                            </select>
                            <button 
                              className="btn btn-sm btn-primary h-7 min-h-0 px-2 flex items-center"
                              onClick={() => handleInlinePayment(ar)}
                            >
                              <CheckCircle size={14} className="mr-1" /> บันทึก
                            </button>
                          </div>
                        )}
                        {Number(ar.paid_amount) > 0 && (
                          <button className="btn btn-sm btn-ghost text-info h-8 w-8 p-0 flex items-center justify-center" onClick={() => handleViewHistory(ar)} title="ดูประวัติการชำระ">
                            <History size={16} />
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost h-8 w-8 p-0 flex items-center justify-center" onClick={() => handleViewItems(ar)} title="ดูรายการสินค้า">
                          <FileText size={16} />
                        </button>
                        {currentStatus !== 'paid' && currentStatus !== 'cancelled' && (
                          <button className="btn btn-sm btn-ghost text-error h-8 w-8 p-0 flex items-center justify-center" onClick={() => handleCancelAR(ar)} title="ยกเลิกหนี้">
                            <Ban size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showPaymentModal && selectedAr && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>รับชำระเงินจากลูกหนี้</h3>
              <button className="btn-icon" onClick={() => setShowPaymentModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="modal-body">
              <div className="bg-tertiary p-4 rounded-lg mb-4">
                <p><strong>ลูกค้า:</strong> {selectedAr.customer_name}</p>
                <p><strong>ยอดค้างชำระ:</strong> ฿{(Number(selectedAr.total_amount) - Number(selectedAr.paid_amount)).toLocaleString()}</p>
              </div>

              <div className="form-group">
                <label>จำนวนเงินที่รับชำระ (บาท)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  required 
                  min="1"
                  max={Number(selectedAr.total_amount) - Number(selectedAr.paid_amount)}
                  step="0.01"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>ช่องทางการชำระ</label>
                <select 
                  className="form-control" 
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                >
                  <option value="transfer">โอนเงินธนาคาร</option>
                  <option value="cash">เงินสด</option>
                  <option value="credit_card">บัตรเครดิต</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">ยืนยันรับชำระ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showItemsModal && itemsAr && (
        <div className="modal-overlay">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #invoice-print-area, #invoice-print-area * { visibility: visible; }
              #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; font-family: monospace, sans-serif; background: #fff; color: #000; }
              .modal-overlay { background: transparent; }
              .no-print { display: none !important; }
            }
          `}</style>
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header no-print">
              <h3 className="flex items-center gap-2">
                รายการสินค้าสำหรับหนี้ {itemsAr.customer_name}
                <button className="btn btn-sm btn-outline text-primary border-primary hover:bg-primary/10 ml-4" onClick={() => window.print()}>
                  <Printer size={14} /> พิมพ์ใบแจ้งหนี้
                </button>
              </h3>
              <button className="btn-icon" onClick={() => setShowItemsModal(false)}><X size={20} /></button>
            </div>
            
            <div className="modal-body" id="invoice-print-area">
              {/* สำหรับโหมดพิมพ์: Header ใบแจ้งหนี้ */}
              <div className="hidden print:block text-center mb-6">
                <h2 className="text-xl font-bold mb-1">ใบแจ้งหนี้ / INVOICE</h2>
                <div className="text-sm">วันที่: {new Date(itemsAr.created_at).toLocaleDateString('th-TH')}</div>
                <div className="text-sm">ครบกำหนดชำระ: {new Date(itemsAr.due_date + 'T00:00:00').toLocaleDateString('th-TH')}</div>
                <div className="mt-4 text-left border-t border-b py-2 border-slate-300">
                  <p><strong>ชื่อลูกค้า/บริษัท:</strong> {itemsAr.customer_name} {itemsAr.customer_company ? `(${itemsAr.customer_company})` : ''}</p>
                </div>
              </div>

              {loadingItems ? (
                <div className="text-center p-4 no-print">กำลังโหลดข้อมูล...</div>
              ) : arItems.length === 0 ? (
                <div className="text-center p-4 text-muted no-print">ไม่พบรายการสินค้าที่เชื่อมโยงกับหนี้นี้</div>
              ) : (
                <div className="table-responsive">
                  <table className="table" style={{ color: 'inherit' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <th style={{ background: 'transparent', color: 'inherit' }}>สินค้า</th>
                        <th className="text-center" style={{ background: 'transparent', color: 'inherit' }}>จำนวน</th>
                        <th className="text-right" style={{ background: 'transparent', color: 'inherit' }}>ราคา/หน่วย</th>
                        <th className="text-right" style={{ background: 'transparent', color: 'inherit' }}>รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                          <td>{item.product_name}</td>
                          <td className="text-center">{item.quantity}</td>
                          <td className="text-right">฿{Number(item.unit_price).toLocaleString()}</td>
                          <td className="text-right">฿{Number(item.total_price).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="3" className="text-right"><strong>ยอดรวมสุทธิ:</strong></td>
                        <td className="text-right"><strong>฿{Number(itemsAr.total_amount).toLocaleString()}</strong></td>
                      </tr>
                      {Number(itemsAr.paid_amount) > 0 && (
                        <tr>
                          <td colSpan="3" className="text-right" style={{ color: 'var(--accent-success)' }}><strong>ชำระแล้ว:</strong></td>
                          <td className="text-right" style={{ color: 'var(--accent-success)' }}><strong>-฿{Number(itemsAr.paid_amount).toLocaleString()}</strong></td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan="3" className="text-right text-lg text-error"><strong>ยอดคงค้าง:</strong></td>
                        <td className="text-right text-lg text-error"><strong>฿{(Number(itemsAr.total_amount) - Number(itemsAr.paid_amount)).toLocaleString()}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              
              {/* สำหรับโหมดพิมพ์: Footer ใบแจ้งหนี้ */}
              <div className="hidden print:block text-center mt-12 text-sm text-slate-600">
                <p>กรุณาชำระเงินตามจำนวนยอดยกมาข้างต้น</p>
                <div className="mt-4 border border-slate-300 p-4 rounded-md">
                  <p className="font-bold mb-2">ช่องทางการชำระเงิน</p>
                  <p>โอนเงินเข้าบัญชี: [เพิ่มข้อมูลบัญชีธนาคาร]</p>
                  <p>ชื่อบัญชี: [เพิ่มชื่อบัญชี]</p>
                </div>
                <div className="mt-8 flex justify-between px-8">
                  <div>
                    <div className="border-b border-black w-32 mb-2"></div>
                    <p>ผู้รับวางบิล</p>
                  </div>
                  <div>
                    <div className="border-b border-black w-32 mb-2"></div>
                    <p>ผู้วางบิล</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer no-print">
              <button className="btn btn-outline" onClick={() => setShowItemsModal(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedAr && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>ประวัติการรับชำระ - {selectedAr.customer_name}</h3>
              <button className="btn-icon" onClick={() => setShowHistoryModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {loadingHistory ? (
                <div className="text-center p-4">กำลังโหลดข้อมูล...</div>
              ) : arHistory.length === 0 ? (
                <div className="text-center p-4 text-muted">ยังไม่มีประวัติการชำระเงิน</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>วันที่/เวลา</th>
                      <th>ยอดชำระ</th>
                      <th>ช่องทาง</th>
                      <th>รับโดย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arHistory.map((pmt, idx) => (
                      <tr key={idx}>
                        <td>{new Date(pmt.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="text-success">฿{Number(pmt.amount).toLocaleString()}</td>
                        <td>{pmt.payment_method === 'transfer' ? 'โอนเงิน' : pmt.payment_method === 'cash' ? 'เงินสด' : pmt.payment_method === 'credit_card' ? 'บัตรเครดิต' : pmt.payment_method}</td>
                        <td>{pmt.user?.name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowHistoryModal(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
