import { useState, useEffect } from 'react';
import { Users, FileText, CheckCircle, Clock, Search, DollarSign, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function ARManagement() {
  const [arList, setArList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAr, setSelectedAr] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transfer');

  const [showItemsModal, setShowItemsModal] = useState(false);
  const [itemsAr, setItemsAr] = useState(null);
  const [arItems, setArItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

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
        creator:users!created_by(name)
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
      // Find the transaction created at roughly the same time with the same total amount
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
      
      if (txList && txList.length > 0) {
        const txId = txList[0].id;
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

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid': return <span className="badge badge-success">ชำระแล้ว</span>;
      case 'partial': return <span className="badge badge-warning">ชำระบางส่วน</span>;
      case 'overdue': return <span className="badge badge-error">เกินกำหนด</span>;
      default: return <span className="badge badge-outline">รอชำระ</span>;
    }
  };

  const filteredArList = arList.filter(ar => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (ar.customer_name || '').toLowerCase().includes(term) || (ar.customer_company || '').toLowerCase().includes(term);
  });

  const totalPending = arList.filter(ar => ar.status !== 'paid').reduce((sum, ar) => sum + (Number(ar.total_amount) - Number(ar.paid_amount)), 0);

  return (
    <div className="page-container">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3 className="stat-title">ยอดลูกหนี้คงค้างทั้งหมด</h3>
            <DollarSign size={20} className="text-secondary" />
          </div>
          <p className="stat-value">฿{totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="stat-desc">จากลูกหนี้ {arList.filter(ar => ar.status !== 'paid').length} รายการ</p>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <h3 className="card-title">รายการลูกหนี้การค้า (AR)</h3>
          <div className="search-bar">
            <Search size={16} />
            <input type="text" placeholder="ค้นหาชื่อลูกค้า/บริษัท..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>ลูกค้า / บริษัท</th>
                <th>วันที่สร้าง</th>
                <th>วันกำหนดชำระ</th>
                <th>ยอดรวม</th>
                <th>ยอดคงค้าง</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center">กำลังโหลด...</td></tr>
              ) : arList.length === 0 ? (
                <tr><td colSpan="7" className="text-center text-muted">ไม่มีรายการลูกหนี้</td></tr>
              ) : filteredArList.map(ar => {
                const pending = Number(ar.total_amount) - Number(ar.paid_amount);
                return (
                  <tr key={ar.id}>
                    <td>
                      <div><strong>{ar.customer_name}</strong></div>
                      <div className="text-xs text-muted">{ar.customer_company || '-'}</div>
                    </td>
                    <td>{new Date(ar.created_at).toLocaleDateString('th-TH')}</td>
                    <td>{new Date(ar.due_date + 'T00:00:00').toLocaleDateString('th-TH')}</td>
                    <td>฿{Number(ar.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="text-warning">฿{pending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{getStatusBadge(ar.status)}</td>
                    <td>
                      {ar.status !== 'paid' && (
                        <button 
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setSelectedAr(ar);
                            setPaymentAmount(pending.toString());
                            setShowPaymentModal(true);
                          }}
                        >
                          รับชำระเงิน
                        </button>
                      )}
                      <button 
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleViewItems(ar)}
                        style={{ marginLeft: '4px' }}
                      >
                        <FileText size={14} style={{ marginRight: '4px' }}/> ดูรายการ
                      </button>
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
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>รายการสินค้าสำหรับหนี้ {itemsAr.customer_name}</h3>
              <button className="btn-icon" onClick={() => setShowItemsModal(false)}><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              {loadingItems ? (
                <div className="text-center p-4">กำลังโหลดข้อมูล...</div>
              ) : arItems.length === 0 ? (
                <div className="text-center p-4 text-muted">ไม่พบรายการสินค้าที่เชื่อมโยงกับหนี้นี้</div>
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>สินค้า</th>
                        <th className="text-center">จำนวน</th>
                        <th className="text-right">ราคา/หน่วย</th>
                        <th className="text-right">รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arItems.map((item, idx) => (
                        <tr key={idx}>
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
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowItemsModal(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
