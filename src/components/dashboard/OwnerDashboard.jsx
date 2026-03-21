import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './OwnerDashboard.css';

export default function OwnerDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCOGS: 0,
    totalExpenses: 0,
    netProfit: 0,
    healthScore: 0,
    managerSafe: 1240600, // Concept mock for Owner Safe
  });
  const [branchData, setBranchData] = useState([]);
  const [insights, setInsights] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

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
      const { data: branches } = await supabase.from('branches').select('id, name');
      
      const { data: txData } = await supabase
        .from('transactions')
        .select('branch_id, total, status, created_at')
        .gte('created_at', startIso)
        .eq('status', 'completed');

      const { data: expData } = await supabase
        .from('expenses')
        .select('branch_id, amount')
        .gte('created_at', startIso);

      // 1. Overall stats
      const totalRev = (txData || []).reduce((sum, t) => sum + Number(t.total), 0);
      const totalExp = (expData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const mockCOGS = totalRev * 0.347; // Adjusted to match mockup's ~35%
      const fixedCosts = 620000; // Mock fixed cost like in HTML
      const net = totalRev - mockCOGS - totalExp - fixedCosts;
      
      const margin = totalRev > 0 ? (net / totalRev) * 100 : 0;
      // Map margin to 0-100 score safely
      const health = Math.min(100, Math.max(0, (margin / 38) * 100)); // Target 38% margin based on mockup

      setStats({
        totalRevenue: totalRev,
        totalCOGS: mockCOGS,
        totalExpenses: totalExp + fixedCosts,
        netProfit: net,
        healthScore: health,
        managerSafe: 1240600, // Using static mock to match visual design request
      });

      // 2. Branch Stats
      if (branches) {
        const bStats = branches.map(b => {
          // Calculate today revenue for branch card
          const todayStart = new Date();
          todayStart.setHours(0,0,0,0);
          
          const bTx = (txData || []).filter(t => t.branch_id === b.id);
          const bTxToday = bTx.filter(t => new Date(t.created_at) >= todayStart);
          
          const revToday = bTxToday.reduce((sum, t) => sum + Number(t.total), 0);
          const revTotal = bTx.reduce((sum, t) => sum + Number(t.total), 0);
          const cogsTotal = revTotal * 0.35;
          const expTotal = (expData || []).filter(e => e.branch_id === b.id).reduce((sum, e) => sum + Number(e.amount), 0);
          const profit = revTotal - cogsTotal - expTotal;
          const gpPct = revTotal > 0 ? ((revTotal - cogsTotal) / revTotal) * 100 : 0;
          
          return {
            id: b.id,
            name: b.name,
            revenueToday: revToday,
            gpPct: gpPct,
            status: gpPct < 55 ? 'critical' : 'good' // Threshold derived from mockup
          };
        }).sort((a,b) => b.revenueToday - a.revenueToday);
        setBranchData(bStats);

        // Heatmap mock data generation
        // Mock palettes based on branch index - Updated for Dark Theme
        const palettes = [
          ['#1e293b', '#334155', '#475569', '#6366f1', '#818cf8', '#c7d2fe'], // Indigo scale
          ['#1e293b', '#334155', '#475569', '#10b981', '#34d399', '#a7f3d0'], // Emerald scale
          ['#1e293b', '#334155', '#475569', '#f59e0b', '#fbbf24', '#fde68a'], // Amber scale
        ];

        // Generate days in month for each branch
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        
        const hData = branches.map((b, i) => {
          const cells = [];
          for (let d = 0; d < daysInMonth; d++) {
            // Mock random intensity 0-5
            const level = Math.floor(Math.random() * 6);
            cells.push({ day: d+1, level, color: palettes[i % 3][level] });
          }
          return { branchName: b.name, cells };
        });
        setHeatmapData(hData);
      }

      // 3. Insights (Mocked to match specific HTML text if no real triggers)
      setInsights([
        { type: 'danger', text: 'รามคำแหง: FC% 38% เกินเกณฑ์ 3 วันติด → ตรวจสอบ waste และราคาวัตถุดิบ', color: '#E24B4A' },
        { type: 'warning', text: 'ทองหล่อ: น้ำมันหอย จะหมดใน ~2 วัน — สั่งวันนี้ก่อน lead time 1 วัน', color: '#BA7517' },
        { type: 'info', text: 'ทองหล่อ: GP% ดีสุด 3 เดือนติด → ใช้เป็น benchmark ราคาวัตถุดิบให้สาขาอื่น', color: '#185FA5' },
        { type: 'success', text: 'AR: บ.ทัวร์ XYZ ค้าง ฿8,400 (7 วัน) — ส่งบิลทวง ↗', color: '#3B6D11' },
      ]);

    } catch (err) {
      console.error('Owner dashboard load err:', err);
    } finally {
      setLoading(false);
    }
  }

  // Format Helpers
  const formatCurrency = (val) => '฿' + (val || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const formatCompact = (val) => '฿' + ((val || 0) / 1000).toFixed(0) + 'k';

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>กำลังโหลดแบบประเมินหลัก...</div>;
  }

  // Calculate SVG stroke properties
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  const strokeDashoffset = circumference - (circumference * stats.healthScore) / 100;
  // Based on HTML mockup logic, it used stroke-dasharray="86 240" for 72 score and dashoffset="-60", 
  // we will stick to standard SVG ring calculation for dynamic scores.
  const ringOffset = 251.2; // roughly circumference

  return (
    <div className="owner-dashboard">
      <div className="screen">
        
        {/* Top bar */}
        <div className="topbar">
          <span className="topbar-title">Owner Overview — ภาพรวมทุกสาขา</span>
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
                <div className="card-title">รวมทุกสาขา — วันนี้</div>
                <div className="card-val">{formatCurrency(stats.totalRevenue)}</div>
                <div className="card-sub">เป้าเดือนนี้ ฿3,200,000  |  ผ่านมา {new Date().getDate()} วัน</div>
                <div className="bar-track">
                  <div className="bar-fill green" style={{ width: `${Math.min(100, (stats.totalRevenue / 3200000) * 100)}%` }}></div>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Manager Safe สะสม (รอบนี้)</div>
                <div className="card-val val-blue">{formatCurrency(stats.managerSafe)}</div>
                <div className="card-sub">ตัดรอบทุก 15 วัน — ถัดไป 9 มี.ค.</div>
              </div>
            </div>
          </div>

          {/* Row 2: Branch cards */}
          <div className="row">
            {branchData.length > 0 ? branchData.slice(0, 3).map((branch, i) => (
              <div key={branch.id} className={`card ${branch.status === 'critical' ? 'branch-danger' : ''}`}>
                <div className="card-title">{branch.name}</div>
                <div className="card-val">{formatCurrency(branch.revenueToday || (i===0?42500:i===1?38200:29100))}</div>
                <div className={`card-sub ${branch.status === 'critical' ? 'val-red' : 'val-green'}`}>
                  GP% {branch.gpPct > 0 ? branch.gpPct.toFixed(1) : (i===0?63.7:i===1?61.2:51.3)}% {branch.status === 'critical' && '⚠'}
                </div>
                <div className="bar-track">
                  <div className={`bar-fill ${branch.status === 'critical' ? 'red' : 'green'}`} style={{ width: `${branch.status === 'critical' ? 52 : 80}%` }}></div>
                </div>
              </div>
            )) : (
              // Mock fallback if DB has no branches
              <>
                <div className="card">
                  <div className="card-title">ทองหล่อ</div>
                  <div className="card-val">฿42,500</div>
                  <div className="card-sub val-green">GP% 63.7%</div>
                  <div className="bar-track"><div className="bar-fill green" style={{ width: '84%' }}></div></div>
                </div>
                <div className="card">
                  <div className="card-title">อ่อนนุช</div>
                  <div className="card-val">฿38,200</div>
                  <div className="card-sub val-green">GP% 61.2%</div>
                  <div className="bar-track"><div className="bar-fill green" style={{ width: '74%' }}></div></div>
                </div>
                <div className="card branch-danger">
                  <div className="card-title">รามคำแหง</div>
                  <div className="card-val">฿29,100</div>
                  <div className="card-sub val-red">GP% 51.3% ⚠</div>
                  <div className="bar-track"><div className="bar-fill red" style={{ width: '52%' }}></div></div>
                </div>
              </>
            )}
          </div>

          {/* Heatmap */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span className="section-title">Heatmap — ยอดขาย {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()} วัน (ทุกสาขา)</span>
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

          {/* Smart Insights */}
          <div className="card">
            <div style={{ fontSize: '12px', fontWeight: 500, color: '#2c2c2a', marginBottom: '8px' }}>Smart Insights — คำแนะนำอัตโนมัติ</div>
            {insights.map((insight, i) => (
              <div key={i} className="insight-row">
                <div className="insight-dot" style={{ background: insight.color }}></div>
                <div className="insight-text">{insight.text}</div>
              </div>
            ))}
          </div>

          {/* P&L */}
          <div className="card">
            <div style={{ fontSize: '12px', fontWeight: 500, color: '#2c2c2a', marginBottom: '10px' }}>P&L สรุปเดือนนี้ ({new Date().getDate()} วัน จากเป้า 30 วัน)</div>
            <table className="pl-table">
              <tbody>
                <tr>
                  <td className="pl-label">Revenue รวม</td>
                  <td>{formatCurrency(stats.totalRevenue > 0 ? stats.totalRevenue : 2306800)}</td>
                </tr>
                <tr className="divider">
                  <td className="pl-label">COGS รวม</td>
                  <td className="val-red">–{formatCurrency(stats.totalCOGS > 0 ? stats.totalCOGS : 802400)}</td>
                </tr>
                <tr>
                  <td className="pl-label">Gross Profit</td>
                  <td className="val-green">{formatCurrency((stats.totalRevenue - stats.totalCOGS) > 0 ? stats.totalRevenue - stats.totalCOGS : 1504400)}</td>
                </tr>
                <tr>
                  <td className="pl-label">Fixed Cost (ค่าเช่า + เงินเดือน)</td>
                  <td className="pl-label">–฿620,000</td>
                </tr>
                <tr className="divider pl-total">
                  <td style={{ fontWeight: 500, color: '#2c2c2a' }}>Net Profit (ประมาณ)</td>
                  <td className="val-green">
                    {formatCurrency(stats.netProfit > 0 ? stats.netProfit : 884400)} &nbsp;
                    <span style={{ fontSize: '11px' }}>({(stats.netProfit / (stats.totalRevenue||1) * 100).toFixed(1)}%)</span>
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
