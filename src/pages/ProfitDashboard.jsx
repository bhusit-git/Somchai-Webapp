import { useState, useEffect } from 'react';
import { Lock, Unlock, DollarSign, TrendingUp, Download, PieChart, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function ProfitDashboard() {
  const [safe, setSafe] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [fixedCosts, setFixedCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showCostModal, setShowCostModal] = useState(false);
  const [costForm, setCostForm] = useState({ type: 'rent', amount: '', description: '' });

  const { user } = useAuth();
  const currentBranchId = user?.branch_id;
  const currentUserId = user?.id;
  
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    
    if (!currentBranchId) return;

    // Fetch Manager Safe
    const { data: safeData } = await supabase
      .from('manager_safes')
      .select('*')
      .eq('branch_id', currentBranchId)
      .single();
      
    if (safeData) {
      setSafe(safeData);
      // Fetch Safe Transactions
      const { data: txData } = await supabase
        .from('safe_transactions')
        .select('*, creator:users!created_by(name)')
        .eq('safe_id', safeData.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setTransactions(txData || []);
    }

    // Fetch Fixed Costs for current month
    const { data: fcData } = await supabase
      .from('fixed_costs')
      .select('*')
      .eq('branch_id', currentBranchId)
      .eq('period_month', currentMonth)
      .order('created_at', { ascending: false });

    if (fcData) setFixedCosts(fcData);
    
    setLoading(false);
  }

  async function handleAddCost(e) {
    e.preventDefault();
    if (!currentBranchId || !currentUserId) return;
    
    const { error } = await supabase.from('fixed_costs').insert([{
      branch_id: currentBranchId,
      period_month: currentMonth,
      type: costForm.type,
      amount: parseFloat(costForm.amount),
      description: costForm.description,
      created_by: currentUserId
    }]);

    if (!error) {
      setShowCostModal(false);
      setCostForm({ type: 'rent', amount: '', description: '' });
      fetchData();
    }
  }

  const getTypeLabel = (type) => {
    switch(type) {
      case 'rent': return 'ค่าเช่าพื้นที่';
      case 'salary': return 'เงินเดือนพนักงาน';
      case 'utility': return 'ค่าน้ำ/ค่าไฟ';
      default: return 'อื่นๆ';
    }
  };

  const totalFixedCosts = fixedCosts.reduce((sum, fc) => sum + Number(fc.amount), 0);

  return (
    <div className="page-container">
      <div className="stats-grid">
        <div className="stat-card success">
          <div className="stat-header">
            <h3 className="stat-title">ยอดเงินสดใน Manager Safe</h3>
            <Lock size={20} className="text-success" />
          </div>
          <p className="stat-value">฿{safe ? Number(safe.balance).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</p>
          <div className="flex-center space-between mt-2">
            <span className="stat-desc">ตัดรอบล่าสุด: {safe?.last_cutoff_date ? new Date(safe.last_cutoff_date).toLocaleDateString('th-TH') : '-'}</span>
            <button className="btn btn-sm btn-outline text-success">ตัดรอบบัญชีสะสม</button>
          </div>
        </div>

        <div className="stat-card warning">
          <div className="stat-header">
            <h3 className="stat-title">ต้นทุนคงที่ (Fixed Costs) เดือนนี้</h3>
            <TrendingUp size={20} className="text-warning" />
          </div>
          <p className="stat-value">฿{totalFixedCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="stat-desc">ถูกนำไปหักลบเพื่อหา Net Profit</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div className="content-card">
          <div className="card-header">
            <h3 className="card-title">ต้นทุนคงที่รายเดือน ({currentMonth})</h3>
            <button className="btn btn-sm btn-outline" onClick={() => setShowCostModal(true)}>
              <Plus size={16} /> เพิ่ม
            </button>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>หมวดหมู่</th>
                  <th>รายละเอียด</th>
                  <th className="text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {fixedCosts.length === 0 ? (
                  <tr><td colSpan="3" className="text-center text-muted">ยังไม่มีบันทึกต้นทุน</td></tr>
                ) : fixedCosts.map(fc => (
                  <tr key={fc.id}>
                    <td><span className="badge badge-outline">{getTypeLabel(fc.type)}</span></td>
                    <td>{fc.description || '-'}</td>
                    <td className="text-right text-warning">฿{Number(fc.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <h3 className="card-title">รายการเคลื่อนไหวเซฟ (Manager Safe)</h3>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>รายการ</th>
                  <th className="text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan="3" className="text-center text-muted">ไม่มีรายการเครื่องไหว</td></tr>
                ) : transactions.map(tx => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.created_at).toLocaleString('th-TH')}</td>
                    <td>
                      <div>
                        {tx.type === 'in' ? <span className="text-success">นำเข้าจากปิดกะ</span> : 
                         tx.type === 'out' ? <span className="text-error">นำออกฉุกเฉิน</span> : 
                         <span className="text-secondary">Owner รับยอด</span>}
                      </div>
                      <div className="text-xs text-muted">{tx.reason || '-'}</div>
                    </td>
                    <td className="text-right">
                      <span className={tx.type === 'in' ? 'text-success' : 'text-error'}>
                        {tx.type === 'in' ? '+' : '-'}฿{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCostModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>บันทึกต้นทุนคงที่ (Fixed Cost)</h3>
              <button className="btn-icon" onClick={() => setShowCostModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddCost} className="modal-body">
              <div className="form-group">
                <label>หมวดหมู่</label>
                <select 
                  className="form-control" 
                  value={costForm.type}
                  onChange={e => setCostForm({...costForm, type: e.target.value})}
                >
                  <option value="rent">ค่าเช่าพื้นที่</option>
                  <option value="salary">เงินเดือนพนักงานประจำ</option>
                  <option value="utility">สาธารณูปโภค (น้ำ/ไฟ/เน็ต)</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>
              <div className="form-group">
                <label>จำนวนเงิน (บาท)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  required 
                  min="0"
                  step="0.01"
                  value={costForm.amount}
                  onChange={e => setCostForm({...costForm, amount: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>รายละเอียดเพิ่มเติม</label>
                <textarea 
                  className="form-control" 
                  rows="3"
                  value={costForm.description}
                  onChange={e => setCostForm({...costForm, description: e.target.value})}
                ></textarea>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCostModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
