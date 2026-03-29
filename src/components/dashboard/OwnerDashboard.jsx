import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import './OwnerDashboard.css';

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
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading payment methods:', err);
  }
  return DEFAULT_PAYMENT_METHODS;
}

export default function OwnerDashboard() {
  const [paymentMethods] = useState(() => loadPaymentMethods());
  const { user } = useAuth();
  const currentBranchId = user?.branch_id;
  const currentBranchName = user?.branch_name;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCOGS: 0,
    totalExpenses: 0,
    netProfit: 0,
    healthScore: 0,
    managerSafe: 0,
    totalDiscount: 0,
    totalRefund: 0,
    paymentBreakdown: {},
  });
  const [branchData, setBranchData] = useState([]);
  const [insights, setInsights] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);

  useEffect(() => {
    loadData();
  }, [currentBranchId]);

  async function loadData() {
    setLoading(true);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startIso = startOfMonth.toISOString();
    
    // For heatmap (last 21 days)
    const twentyOneDaysAgo = new Date();
    twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 20);
    twentyOneDaysAgo.setHours(0, 0, 0, 0);

    try {
      let branchesQuery = supabase.from('branches').select('id, name');
      if (currentBranchId) branchesQuery = branchesQuery.eq('id', currentBranchId);
      const { data: branches } = await branchesQuery;
      
      let txQuery = supabase
        .from('transactions')
        .select('id, branch_id, total, status, created_at, payment_method, discount')
        .gte('created_at', startIso);
      if (currentBranchId) txQuery = txQuery.eq('branch_id', currentBranchId);
      const { data: txData } = await txQuery;

      const completedTxs = (txData || []).filter(t => t.status === 'completed');
      const voidedTxs = (txData || []).filter(t => t.status === 'voided');

      let expQuery = supabase
        .from('expenses')
        .select('branch_id, amount, category')
        .gte('created_at', startIso)
        .eq('status', 'approved')
        .not('category', 'ilike', '%วัตถุดิบ%');
      if (currentBranchId) expQuery = expQuery.eq('branch_id', currentBranchId);
      const { data: expData } = await expQuery;

      // Real Manager Safe
      let safeQuery = supabase.from('manager_safes').select('balance');
      if (currentBranchId) safeQuery = safeQuery.eq('branch_id', currentBranchId);
      const { data: safeData } = await safeQuery;
      const totalSafe = (safeData || []).reduce((s, row) => s + Number(row.balance), 0);

      // Real Fixed Costs — ดึงจาก expenses ผ่าน is_fixed_cost flag ของ category
      const { data: catData } = await supabase.from('expense_categories').select('name, is_fixed_cost').eq('is_active', true);
      const fixedCostCatNames = (catData || []).filter(c => c.is_fixed_cost).map(c => c.name);
      
      let fcExpQuery = supabase.from('expenses').select('amount, category')
        .eq('status', 'approved')
        .gte('created_at', startIso);
      if (currentBranchId) fcExpQuery = fcExpQuery.eq('branch_id', currentBranchId);
      const { data: fcExpData } = await fcExpQuery;
      const totalFixedCosts = (fcExpData || []).filter(e => fixedCostCatNames.includes(e.category)).reduce((s, row) => s + Number(row.amount), 0);

      // Calculate COGS
      let totalTheoreticalCOGS = 0; // World 1 (with Q-Factor)
      let totalFinancialCOGS = 0; // World 2 (raw materials only)
      let branchCogsMap = {}; // branch_id -> theoretical cogs for Gross Profit
      if (completedTxs.length > 0) {
        const txIds = completedTxs.map(t => t.id);
        const { data: txItems } = await supabase
          .from('transaction_items')
          .select('transaction_id, quantity, products(cost, misc_cost_type, misc_cost_value)')
          .in('transaction_id', txIds);
           
        if (txItems) {
           txItems.forEach(item => {
             const cost = Number(item.products?.cost || 0);
             const mType = item.products?.misc_cost_type || 'PERCENT';
             const mVal = Number(item.products?.misc_cost_value || 0);
             
             // Reverse engineer true financial cost by stripping Q-Factor
             let rawMcs = cost;
             if (mType === 'PERCENT' && mVal > 0) {
                 rawMcs = cost / (1 + (mVal / 100));
             } else if (mType === 'FIXED_AMOUNT' && mVal > 0) {
                 rawMcs = Math.max(0, cost - mVal);
             }

             const lineTheoreticalCogs = Number(item.quantity) * cost;
             const lineFinancialCogs = Number(item.quantity) * rawMcs;
             
             totalTheoreticalCOGS += lineTheoreticalCogs;
             totalFinancialCOGS += lineFinancialCogs;
             
             // group by branch_id
             const tx = txData.find(t => t.id === item.transaction_id);
             if (tx) {
               branchCogsMap[tx.branch_id] = (branchCogsMap[tx.branch_id] || 0) + lineTheoreticalCogs;
             }
           });
        }
      }

      // 1. Overall stats
      const totalRev = completedTxs.reduce((sum, t) => sum + Number(t.total), 0);
      const totalExp = (expData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      
      // Breakdown stats
      const totalDiscount = completedTxs.reduce((sum, t) => sum + Number(t.discount || 0), 0);
      const totalRefund = voidedTxs.reduce((sum, t) => sum + Number(t.total), 0);
      const paymentBreakdown = completedTxs.reduce((acc, t) => {
        const pm = t.payment_method || 'unknown';
        acc[pm] = (acc[pm] || 0) + Number(t.total);
        return acc;
      }, {});
      
      // Dual World: Net Profit uses Financial COGS (raw material) to prevent double counting with OPEX
      const net = totalRev - totalFinancialCOGS - totalExp - totalFixedCosts;
      
      const margin = totalRev > 0 ? (net / totalRev) * 100 : 0;
      // Map margin to 0-100 score safely (target 38% margin)
      const health = Math.min(100, Math.max(0, (margin / 38) * 100));

      setStats({
        totalRevenue: totalRev,
        totalCOGS: totalTheoreticalCOGS, // World 1: Shown in the GP section
        totalFinancialCOGS: totalFinancialCOGS, // World 2: Used internally and shown as explanation
        totalExpenses: totalExp,
        totalFixedCosts: totalFixedCosts,
        netProfit: net,
        healthScore: health,
        managerSafe: totalSafe,
        totalDiscount,
        totalRefund,
        paymentBreakdown,
      });

      // 2. Branch Stats
      if (branches) {
        const bStats = branches.map(b => {
          // Calculate today revenue for branch card
          const todayStart = new Date();
          todayStart.setHours(0,0,0,0);
          
          const bTx = completedTxs.filter(t => t.branch_id === b.id);
          const bTxToday = bTx.filter(t => new Date(t.created_at) >= todayStart);
          
          const revToday = bTxToday.reduce((sum, t) => sum + Number(t.total), 0);
          const revTotal = bTx.reduce((sum, t) => sum + Number(t.total), 0);
          const cogsTotal = branchCogsMap[b.id] || 0;
          const expTotal = (expData || []).filter(e => e.branch_id === b.id).reduce((sum, e) => sum + Number(e.amount), 0);
          const gpPct = revTotal > 0 ? ((revTotal - cogsTotal) / revTotal) * 100 : 0;
          
          return {
            id: b.id,
            name: b.name,
            revenueToday: revToday,
            gpPct: gpPct,
            status: gpPct < 55 ? 'critical' : 'good'
          };
        }).sort((a,b) => b.revenueToday - a.revenueToday);
        setBranchData(bStats);

        // Heatmap Real data generation
        const pallets = [
          ['#1e293b', '#334155', '#475569', '#6366f1', '#818cf8', '#c7d2fe'],
          ['#1e293b', '#334155', '#475569', '#10b981', '#34d399', '#a7f3d0'],
          ['#1e293b', '#334155', '#475569', '#f59e0b', '#fbbf24', '#fde68a'],
        ];

        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        
        let maxDailyRev = 1;
        const branchDailyRevs = branches.map(b => {
          const daily = Array(daysInMonth).fill(0);
          const bTx = completedTxs.filter(t => t.branch_id === b.id);
          bTx.forEach(t => {
             const d = new Date(t.created_at).getDate() - 1;
             daily[d] += Number(t.total);
          });
          const bMax = Math.max(...daily);
          if (bMax > maxDailyRev) maxDailyRev = bMax;
          return { name: b.name, daily };
        });

        const hData = branchDailyRevs.map((b, i) => {
          const cells = b.daily.map((rev, d) => {
             let level = 0;
             if (rev > 0) {
               level = Math.ceil((rev / maxDailyRev) * 5);
               if (level > 5) level = 5;
             }
             return { day: d+1, level, color: pallets[i % 3][level] };
          });
          return { branchName: b.name, cells };
        });
        setHeatmapData(hData);
      }

      // 3. Insights (Mocked to match specific HTML text if no real triggers)
      setInsights([
        { type: 'info', text: 'ระบบวิเคราะห์จะแจ้งเตือนเมื่อข้อมูลมีปริมาณเพียงพอ', color: '#185FA5' },
      ]);

    } catch (err) {
      console.error('Owner dashboard load err:', err);
    } finally {
      setLoading(false);
    }
  }

  // Format Helpers
  const formatCurrency = (val) => '฿' + (val || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>กำลังโหลดแบบประเมินหลัก...</div>;
  }

  return (
    <div className="owner-dashboard">
      <div className="screen">
        
        {/* Top bar */}
        <div className="topbar">
          <span className="topbar-title">{currentBranchId ? `Owner Overview — สาขา ${currentBranchName}` : 'Owner Overview — ภาพรวมทุกสาขา'}</span>
          <span className="topbar-date">{new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </div>

        <div className="body">
          
          {/* Row 1: Health Score + Total */}
          <div className="row">
            {/* Health Score */}
            <div className="card" style={{ flex: '0 0 170px' }}>
              <div className="card-title">Health Score</div>
              <div className="gauge-wrap">
                <div className="gauge-ring">
                  <svg viewBox="0 0 96 96">
                    {/* Track */}
                    <circle cx="48" cy="48" r="38" fill="none" stroke="var(--border-primary)" strokeWidth="10"
                      strokeDasharray="120 240" strokeDashoffset="-60" />
                    {/* Fill */}
                    <circle cx="48" cy="48" r="38" fill="none" stroke="var(--accent-success)" strokeWidth="10" opacity="0.85"
                      strokeDasharray={`${(120 * stats.healthScore) / 100} 240`} strokeDashoffset="-60" />
                  </svg>
                  <div className="gauge-number">
                    <span className="gauge-num">{stats.healthScore.toFixed(0)}</span>
                    <span className="gauge-denom">/100</span>
                  </div>
                </div>
                <div className="gauge-label">
                  {stats.healthScore >= 80 ? 'ดีมาก' : stats.healthScore > 60 ? 'ดี — ระวัง FC%' : 'ต้องปรับปรุงเร่งด่วน'}
                </div>
                <div className="gauge-sub">รวม GP, FC, Cash, AR</div>
              </div>
            </div>

            {/* Total revenue + safe */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              <div className="card">
                <div className="card-title">{currentBranchId ? 'รวมสาขานี้ — วันนี้ (สะสม)' : 'รวมทุกสาขา — วันนี้ (สะสม)'}</div>
                <div className="card-val">{formatCurrency(stats.totalRevenue)}</div>
                <div className="card-sub">ข้อมูลรายได้ทั้งหมดในระบบ เดือนนี้</div>
                <div className="bar-track">
                  <div className="bar-fill green" style={{ width: `100%` }}></div>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Manager Safe สะสม</div>
                <div className="card-val val-blue">{formatCurrency(stats.managerSafe)}</div>
                <div className="card-sub">ยอดรวมเงินสดในตู้เซฟทั้งหมด</div>
              </div>
            </div>
          </div>

          {/* Row 2: Branch cards */}
          <div className="row">
            {branchData.length > 0 ? branchData.slice(0, 3).map((branch, i) => (
              <div key={branch.id} className={`card ${branch.status === 'critical' ? 'branch-danger' : ''}`}>
                <div className="card-title">{branch.name}</div>
                <div className="card-val">{formatCurrency(branch.revenueToday)}</div>
                <div className={`card-sub ${branch.status === 'critical' ? 'val-red' : 'val-green'}`}>
                  GP% {branch.gpPct > 0 ? branch.gpPct.toFixed(1) : 0}% {branch.status === 'critical' && '⚠'}
                </div>
                <div className="bar-track">
                  <div className={`bar-fill ${branch.status === 'critical' ? 'red' : 'green'}`} style={{ width: `${branch.status === 'critical' ? 52 : 80}%` }}></div>
                </div>
              </div>
            )) : (
              <div className="card">
                <div className="card-title">ไม่มีข้อมูลสาขา</div>
                <div className="card-val">฿0</div>
              </div>
            )}
          </div>

          {/* Heatmap */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span className="section-title">Heatmap — ยอดขาย {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()} วัน</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>สีเข้ม = รายได้สูง</span>
            </div>
            <div className="heatmap-wrap">
              <div className="heatmap-grid" style={{ gridTemplateColumns: `56px repeat(${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}, 1fr)` }}>
                {/* Header Row */}
                <div />
                {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }, (_, i) => (
                  <div key={i} className="hm-day" style={{ color: i + 1 === new Date().getDate() ? '#185FA5' : undefined }}>{i + 1}</div>
                ))}
                
                {/* Branch Rows */}
                {heatmapData.map((row, i) => (
                  <React.Fragment key={i}>
                    <div className="hm-label">{row.branchName}</div>
                    {row.cells.map((cell, j) => (
                      <div 
                        key={j} 
                        className="hm-cell" 
                        style={{ background: cell.color }} 
                        title={`${row.branchName} วันที่ ${cell.day}`}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Cash Flow & Deductions */}
          <div className="card">
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Cash Flow & Deductions — ช่องทางรับเงินและส่วนลด</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>ช่องทางชำระเงิน (Payment Methods)</div>
                {Object.keys(stats.paymentBreakdown || {}).length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
                    {Object.entries(stats.paymentBreakdown).sort((a, b) => b[1] - a[1]).map(([pm, amount]) => (
                      <li key={pm} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-primary)' }}>
                        <span style={{ textTransform: 'capitalize' }}>{paymentMethods.find(m => m.value === pm)?.label || pm}</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ไม่มีข้อมูลช่องทางชำระเงิน</div>
                )}
              </div>
              <div style={{ borderLeft: '1px solid var(--border-primary)', paddingLeft: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>ส่วนลดและยอดเงินคืน (Deductions & Refunds)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px' }}>ส่วนลดที่ให้ลูกค้า (Discounts)</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(stats.totalDiscount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px' }}>คืนเงิน / ยกเลิกบิล (Refunds)</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ยอดเงินที่เสียไปจากการยกเลิก</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-warning)' }}>{formatCurrency(stats.totalRefund)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Smart Insights */}
          <div className="card">
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>Smart Insights — คำแนะนำอัตโนมัติ</div>
            {insights.map((insight, i) => (
              <div key={i} className="insight-row">
                <div className="insight-dot" style={{ background: insight.color }}></div>
                <div className="insight-text">{insight.text}</div>
              </div>
            ))}
          </div>

          {/* P&L */}
          <div className="card">
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '10px' }}>ระบบบัญชี 2 โลก — สรุปเดือนนี้ ({new Date().getDate()} วัน จากเป้า 30 วัน)</div>
            <table className="pl-table">
              <tbody>
                {/* 🌎 World 1: Daily Profit (Theoretical) */}
                <tr>
                  <td colSpan="2" style={{ fontSize: '11px', color: 'var(--accent-info)', paddingBottom: '4px' }}>
                    <strong>โลกที่ 1: กำไรหน้าบ้าน</strong> (คิดรวมต้นทุนแฝง/Q-Factor)
                  </td>
                </tr>
                <tr>
                  <td className="pl-label pl-4">Revenue (รายได้รวม)</td>
                  <td>{formatCurrency(stats.totalRevenue)}</td>
                </tr>
                <tr className="divider">
                  <td className="pl-label pl-4" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span>Theoretical COGS (ต้นทุนทฤษฎี)</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>*รวมต้นทุนหลัก + เปอร์เซ็นต์ Q-Factor แล้ว</span>
                  </td>
                  <td className="val-red">–{formatCurrency(stats.totalCOGS)}</td>
                </tr>
                <tr>
                  <td className="pl-label pl-4">Gross Profit (กำไรขั้นต้น)</td>
                  <td className="val-green">{formatCurrency(stats.totalRevenue - stats.totalCOGS)}</td>
                </tr>
                
                {/* 🌍 World 2: Actual P&L (Monthly) */}
                <tr>
                  <td colSpan="2" style={{ fontSize: '11px', color: 'var(--accent-warning)', paddingTop: '16px', paddingBottom: '4px' }}>
                    <strong>โลกที่ 2: บัญชีภาษีสุทธิ</strong> (ล้าง Q-Factor ออกเพื่อป้องกันการคิดซ้ำซ้อนกับบิลซื้อของ)
                  </td>
                </tr>
                <tr className="divider">
                  <td className="pl-label pl-4">
                    + คืนค่า Q-Factor ย้อนกลับ <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(ไม่นับซ้ำกับ OPEX)</span>
                  </td>
                  <td className="val-green">+{formatCurrency(stats.totalCOGS - stats.totalFinancialCOGS)}</td>
                </tr>
                <tr>
                  <td className="pl-label pl-4">OPEX (บิลรายจ่ายจิปาถะ/ผงลาบ/ถุง)</td>
                  <td className="val-red">–{formatCurrency(stats.totalExpenses)}</td>
                </tr>
                <tr>
                  <td className="pl-label pl-4">Fixed Cost (ค่าเช่า + เงินเดือน)</td>
                  <td className="val-red">–{formatCurrency(stats.totalFixedCosts)}</td>
                </tr>
                <tr className="divider pl-total">
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Actual Net Profit (กำไรสุทธิเงินสด)</td>
                  <td className="val-green font-bold" style={{ fontSize: '16px' }}>
                    {formatCurrency(stats.netProfit)} &nbsp;
                    <span style={{ fontSize: '11px', fontWeight: 'normal' }}>({stats.totalRevenue > 0 ? (stats.netProfit / stats.totalRevenue * 100).toFixed(1) : 0}%)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
