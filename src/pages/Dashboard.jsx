import { useState, useEffect } from 'react';
import {
  DollarSign,
  ShoppingCart,
  Users,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const [stats, setStats] = useState({
    todaySales: 0,
    totalOrders: 0,
    activeStaff: 0,
    expenses: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      const [txRes, expRes, userRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('status', 'completed').order('created_at', { ascending: false }).limit(5),
        supabase.from('expenses').select('amount'),
        supabase.from('users').select('id').eq('is_active', true),
      ]);

      const transactions = txRes.data || [];
      const expenses = expRes.data || [];
      const users = userRes.data || [];

      const todaySales = transactions.reduce((sum, t) => sum + Number(t.total || 0), 0);
      const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      setStats({
        todaySales,
        totalOrders: transactions.length,
        activeStaff: users.length,
        expenses: totalExpenses,
      });
      setRecentOrders(transactions.slice(0, 5));
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{stats.todaySales.toLocaleString()}</h3>
            <p>ยอดขายวันนี้</p>
            <div className="stat-change positive">
              <ArrowUpRight size={14} /> +12.5%
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <ShoppingCart size={22} />
          </div>
          <div className="stat-info">
            <h3>{stats.totalOrders}</h3>
            <p>จำนวนออร์เดอร์</p>
            <div className="stat-change positive">
              <ArrowUpRight size={14} /> +8.2%
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <Users size={22} />
          </div>
          <div className="stat-info">
            <h3>{stats.activeStaff}</h3>
            <p>พนักงานทั้งหมด</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <Receipt size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{stats.expenses.toLocaleString()}</h3>
            <p>ค่าใช้จ่ายวันนี้</p>
            <div className="stat-change negative">
              <ArrowDownRight size={14} /> -3.1%
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">ออร์เดอร์ล่าสุด</div>
            <div className="card-subtitle">รายการขายล่าสุด 5 รายการ</div>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>เลขออร์เดอร์</th>
                <th>ยอดรวม</th>
                <th>ชำระด้วย</th>
                <th>สถานะ</th>
                <th>เวลา</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                    <span className="animate-pulse">กำลังโหลด...</span>
                  </td>
                </tr>
              ) : recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    ยังไม่มีออร์เดอร์ — เริ่มขายที่หน้า POS
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      #{order.order_number}
                    </td>
                    <td>฿{Number(order.total).toLocaleString()}</td>
                    <td>
                      <span className="badge badge-ghost">{order.payment_method}</span>
                    </td>
                    <td>
                      <span className={`badge ${order.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                        {order.status === 'completed' ? 'สำเร็จ' : 'รอดำเนินการ'}
                      </span>
                    </td>
                    <td>{new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
