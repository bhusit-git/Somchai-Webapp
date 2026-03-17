import { useState, useEffect } from 'react';
import { 
  Lightbulb, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Activity, 
  CheckCircle,
  Calendar,
  Building2,
  BellRing,
  Award
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Integration (M12 — Smart Insights):
  - transactions: ยอดขายรายวันสำหรับ heatmap และ salesTarget %
  - menu_items: cost vs price สำหรับคำนวณ Food Cost %
  - fixed_costs: ดึง labor/rent สำหรับ cost structure
  - branches: Owner view cross-branch summary
*/

export default function SmartInsights() {
  const [loading, setLoading] = useState(true);
  const [viewRole, setViewRole] = useState('manager'); // 'owner' or 'manager'
  
  // Dashboard State
  const [healthScore, setHealthScore] = useState(0);
  const [rings, setRings] = useState({
    salesTarget: 0,
    fcLimit: 0,
    compliance: 0
  });
  
  const [heatmap, setHeatmap] = useState([]);
  const [insightsBlock, setInsightsBlock] = useState([]);

  useEffect(() => {
    loadInsightsData();
  }, [viewRole]);

  async function loadInsightsData() {
    setLoading(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthStart = `${monthStr}-01`;
      const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

      if (viewRole === 'manager') {
        // --- ดึงยอดขายรายวันของเดือนนี้ ---
        const { data: txData } = await supabase
          .from('transactions')
          .select('total, created_at')
          .gte('created_at', `${monthStart}T00:00:00`)
          .lte('created_at', `${monthEnd}T23:59:59`)
          .eq('status', 'completed');

        // สร้าง heatmap: sum ยอดขายรายวัน
        const dailyRevMap = {};
        (txData || []).forEach(tx => {
          const day = new Date(tx.created_at).getDate();
          dailyRevMap[day] = (dailyRevMap[day] || 0) + Number(tx.total);
        });

        // คำนวณ max revenue สำหรับ scale intensity
        const revenues = Object.values(dailyRevMap);
        const maxRevenue = revenues.length > 0 ? Math.max(...revenues) : 1;

        const heatmapData = Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const revenue = dailyRevMap[day] || 0;
          // intensity 0-5
          const intensity = revenue === 0 ? 0 : Math.ceil((revenue / maxRevenue) * 5);
          return { day, intensity, revenue };
        });
        setHeatmap(heatmapData);

        // --- คำนวณ rings ---
        const totalRevenue = revenues.reduce((s, v) => s + v, 0);

        // สมมติ target รายเดือน (ดึงจาก fixed_costs หรือใช้ค่าเริ่มต้น 200,000 บาท)
        const { data: fixedData } = await supabase
          .from('fixed_costs')
          .select('type, amount')
          .eq('period_month', monthStr);

        const fixedCosts = fixedData || [];
        const laborCost = fixedCosts.filter(f => f.type === 'labor').reduce((s, f) => s + Number(f.amount), 0);
        const rentCost = fixedCosts.filter(f => f.type === 'rent').reduce((s, f) => s + Number(f.amount), 0);

        // Sales Target ring: เทียบยอดขายปัจจุบัน vs ยอดวันที่ผ่านมา (prorated target)
        const todayDay = now.getDate();
        const avgDailyTarget = totalRevenue > 0 ? (totalRevenue / todayDay) * daysInMonth : 0;
        const salesTargetPct = avgDailyTarget > 0 ? Math.min(Math.round((totalRevenue / avgDailyTarget) * 100), 100) : 0;

        // Food Cost: ดึง menu_items cost vs price จาก transaction_items
        const { data: menuItems } = await supabase
          .from('menu_items')
          .select('price, cost')
          .eq('is_active', true);

        let fcPct = 0;
        if (menuItems && menuItems.length > 0) {
          const totalPrice = menuItems.reduce((s, m) => s + Number(m.price), 0);
          const totalCost = menuItems.reduce((s, m) => s + Number(m.cost), 0);
          fcPct = totalPrice > 0 ? Math.round((totalCost / totalPrice) * 100) : 0;
        }
        const fcLimitPct = Math.min(fcPct, 100);

        // Compliance: ดึง % ของ data points ที่มี (branches, users, menu_items, expenses)
        const { count: menuCount } = await supabase.from('menu_items').select('*', { count: 'exact', head: true }).eq('is_active', true);
        const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true);
        const complianceScore = Math.min(
          Math.round(((menuCount > 0 ? 33 : 0) + (userCount > 0 ? 33 : 0) + (txData && txData.length > 0 ? 34 : 0))),
          100
        );

        const newRings = { salesTarget: salesTargetPct, fcLimit: fcLimitPct, compliance: complianceScore };
        setRings(newRings);

        // Health Score: weighted average
        const fc_score = fcPct > 0 && fcPct <= 35 ? 100 : fcPct > 35 ? Math.max(0, 100 - (fcPct - 35) * 5) : 50;
        const newHealth = Math.round((salesTargetPct * 0.4) + (fc_score * 0.35) + (complianceScore * 0.25));
        setHealthScore(Math.min(newHealth, 100));

        // --- Behavioral Insights ---
        const insights = [];

        if (txData && txData.length === 0) {
          insights.push({ id: 1, type: 'warning', icon: <AlertTriangle size={16} />, text: '⚠️ ยังไม่มีข้อมูลยอดขายในเดือนนี้ — กรุณาตรวจสอบการเชื่อมต่อ POS' });
        } else if (totalRevenue > 0) {
          insights.push({ id: 2, type: 'success', icon: <TrendingUp size={16} />, text: `✅ ยอดขายเดือนนี้รวม ฿${totalRevenue.toLocaleString()} บาท (${todayDay} วันแรก)` });
        }

        if (fcPct > 35) {
          insights.push({ id: 3, type: 'danger', icon: <AlertTriangle size={16} />, text: `🔴 Food Cost เฉลี่ย ${fcPct}% — เกินเพดาน 35%! ควรตรวจสอบราคาเมนูและต้นทุน` });
        } else if (fcPct > 0) {
          insights.push({ id: 4, type: 'success', icon: <CheckCircle size={16} />, text: `✅ Food Cost เฉลี่ย ${fcPct}% — อยู่ในเกณฑ์ที่ดี (เป้าหมาย 28-35%)` });
        }

        if (laborCost > 0 && totalRevenue > 0) {
          const laborPct = Math.round((laborCost / totalRevenue) * 100);
          if (laborPct > 30) {
            insights.push({ id: 5, type: 'warning', icon: <BellRing size={16} />, text: `⚠️ ค่าแรงคิดเป็น ${laborPct}% ของรายได้ — สูงกว่าเป้าหมาย 20-30%` });
          }
        }

        if (menuCount === 0) {
          insights.push({ id: 6, type: 'info', icon: <Lightbulb size={16} />, text: '💡 ยังไม่มีเมนูในระบบ — เพิ่มเมนูใน Settings เพื่อให้ COGS Engine ทำงานได้' });
        }

        if (insights.length === 0) {
          insights.push({ id: 7, type: 'info', icon: <Award size={16} />, text: '⭐ ระบบกำลังรวบรวมข้อมูลเพื่อสร้าง Insight อัตโนมัติ — เพิ่มข้อมูลในระบบให้ครบ' });
        }

        setInsightsBlock(insights);

      } else {
        // --- Owner View: Cross-branch summary ---
        const { data: branches } = await supabase.from('branches').select('id, name');

        if (!branches || branches.length === 0) {
          setHeatmap([]);
          setInsightsBlock([{ id: 1, type: 'info', icon: <Building2 size={16} />, text: '💡 ยังไม่มีข้อมูลสาขา — เพิ่มสาขาใน Settings เพื่อดูภาพรวมข้ามสาขา' }]);
          setHealthScore(0);
          setRings({ salesTarget: 0, fcLimit: 0, compliance: 0 });
          return;
        }

        // สร้าง cross-branch heatmap (ยอดขาย 7 วันล่าสุดรายสาขา)
        const crossHeatmap = [];
        for (const branch of branches) {
          const scores = [];
          for (let d = 6; d >= 0; d--) {
            const date = new Date();
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().split('T')[0];
            const { data: txDay } = await supabase
              .from('transactions')
              .select('total')
              .eq('branch_id', branch.id)
              .gte('created_at', `${dateStr}T00:00:00`)
              .lte('created_at', `${dateStr}T23:59:59`)
              .eq('status', 'completed');
            const rev = (txDay || []).reduce((s, t) => s + Number(t.total), 0);
            scores.push(rev > 50000 ? 5 : rev > 30000 ? 4 : rev > 15000 ? 3 : rev > 5000 ? 2 : rev > 0 ? 1 : 0);
          }
          crossHeatmap.push({ branch: branch.name, scores });
        }
        setHeatmap(crossHeatmap);

        const { data: allTx } = await supabase
          .from('transactions')
          .select('total')
          .gte('created_at', `${monthStart}T00:00:00`)
          .lte('created_at', `${monthEnd}T23:59:59`)
          .eq('status', 'completed');

        const totalRev = (allTx || []).reduce((s, t) => s + Number(t.total), 0);
        setHealthScore(totalRev > 0 ? Math.min(Math.round((totalRev / (branches.length * 200000)) * 100), 100) : 0);
        setRings({ salesTarget: totalRev > 0 ? Math.min(Math.round((totalRev / (branches.length * 200000)) * 100), 100) : 0, fcLimit: 0, compliance: branches.length > 0 ? 100 : 0 });
        setInsightsBlock([{ id: 1, type: 'info', icon: <Building2 size={16} />, text: `📊 ระบบพบ ${branches.length} สาขา — ยอดขาย MTD รวม ฿${totalRev.toLocaleString()}` }]);
      }

    } catch (err) {
      console.error('SmartInsights error:', err);
      setInsightsBlock([{ id: 99, type: 'danger', icon: <AlertTriangle size={16} />, text: `❌ โหลดข้อมูลไม่สำเร็จ: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }



  // Ring Progress Component SVG
  const ProgressRing = ({ radius, stroke, progress, color, title, subtitle }) => {
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - progress / 100 * circumference;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: radius * 2, height: radius * 2 }}>
          <svg height={radius * 2} width={radius * 2}>
            <circle
              stroke="var(--bg-secondary)"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            <circle
              stroke={color}
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={circumference + ' ' + circumference}
              style={{ strokeDashoffset, transition: 'stroke-dashoffset 1s ease-in-out' }}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>{progress}%</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Smart Insights Dashboard</h3>
          <p className="text-sm text-muted">M12: ระบบแนะนำอัจฉริยะ (Gamification & Behavioral Insights)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-lg)' }}>
          <button 
            className={`btn btn-sm ${viewRole === 'manager' ? 'btn-primary' : 'btn-ghost'}`} 
            onClick={() => setViewRole('manager')}
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            ผู้จัดการสาขา
          </button>
          <button 
            className={`btn btn-sm ${viewRole === 'owner' ? 'btn-primary' : 'btn-ghost'}`} 
            onClick={() => setViewRole('owner')}
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            เจ้าของร้าน (Owner)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Visuals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Health & Rings Scoreboard */}
          <div className="card" style={{ padding: '32px 24px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            
            <div style={{ textAlign: 'center', paddingRight: '40px', borderRight: '1px solid var(--border-primary)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '120px', height: '120px', borderRadius: '50%', border: `8px solid ${healthScore > 80 ? 'var(--accent-success)' : 'var(--accent-warning)'}`, background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Activity size={24} style={{ color: healthScore > 80 ? 'var(--accent-success)' : 'var(--accent-warning)', marginBottom: '4px' }} />
                  <span style={{ fontSize: '32px', fontWeight: 800, lineHeight: 1 }}>{healthScore}</span>
                </div>
              </div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, marginTop: '16px' }}>Health Score</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>คะแนนสุขภาพร้านโดยรวม</p>
            </div>

            <div style={{ display: 'flex', gap: '40px', paddingLeft: '20px' }}>
              <ProgressRing radius={50} stroke={8} progress={rings.salesTarget} color="var(--accent-info)" title="Sales Target" subtitle="ยอดขายเทียบเป้า" />
              <ProgressRing radius={50} stroke={8} progress={rings.fcLimit} color={rings.fcLimit > 35 ? "var(--accent-danger)" : "var(--accent-success)"} title="Food Cost %" subtitle="เพดานต้นทุน (35%)" />
              <ProgressRing radius={50} stroke={8} progress={rings.compliance} color="var(--accent-purple)" title="Compliance" subtitle="ความสมบูรณ์ระบบ" />
            </div>

          </div>

          {/* Heatmap Calendar */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 600 }}>{viewRole === 'manager' ? 'ยอดขายรายวัน (Heatmap รอบ 28 วัน)' : 'ยอดขายเปรียบเทียบข้ามสาขา (สัปดาห์ล่าสุด)'}</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>สีเข้ม = ยอดขาย/Traffic สูง</p>
              </div>
              <Calendar size={18} className="text-muted" />
            </div>
            
            <div style={{ padding: '20px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังวิเคราะห์แพทเทิร์น...</span></div>
              ) : viewRole === 'manager' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                  {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map(day => (
                     <div key={day} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', paddingBottom: '8px' }}>{day}</div>
                  ))}
                  {heatmap.map((h, i) => {
                    // Map intensity 1-5 to opacity/color. 0 is empty state.
                    const alphas = ['0.05', '0.1', '0.3', '0.5', '0.8', '1.0']; // 0.05 for intensity 0
                    const bg = `rgba(16, 185, 129, ${alphas[h.intensity]})`;
                    return (
                      <div key={i} style={{ aspectRatio: '1', background: bg, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: h.intensity > 0 ? 'pointer' : 'default', border: '1px solid var(--border-primary)' }} title={`วันที่ ${h.day}: ฿${h.revenue.toLocaleString()}`}>
                        {h.intensity > 3 && <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>🔥</span>}
                        {h.intensity === 0 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{h.day}</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(7, 1fr)', gap: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    <div></div>
                    {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map(day => <div key={day}>{day}</div>)}
                  </div>
                  {heatmap.map((branchData, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px repeat(7, 1fr)', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><Building2 size={14}/> {branchData.branch}</div>
                      {branchData.scores.map((score, sIdx) => {
                        const alphas = ['0.1', '0.3', '0.5', '0.8', '1.0'];
                        const bg = `rgba(59, 130, 246, ${alphas[score - 1]})`; // Blue for owner
                        return (
                          <div key={sIdx} style={{ height: '32px', background: bg, borderRadius: '4px', border: '1px solid var(--border-primary)' }} />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Rule Engine Feed */}
        <div className="card" style={{ height: '100%' }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '16px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lightbulb size={18} style={{ color: 'var(--accent-warning)' }} /> 
              Behavioral Insights
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>คำแนะนำจาก Rule-Engine ด่วน</p>
          </div>
          
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {loading ? (
              [1,2,3].map(i => <div key={i} style={{ height: '80px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', animation: 'pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1)' }} />)
            ) : insightsBlock.map(insight => {
              // Map colors based on type
              const colors = {
                success: { bg: 'var(--accent-success-bg)', text: 'var(--accent-success)' },
                warning: { bg: 'var(--accent-warning-bg)', text: 'var(--accent-warning)' },
                danger: { bg: 'var(--accent-danger-bg)', text: 'var(--accent-danger)' },
                info: { bg: 'var(--accent-info-bg)', text: 'var(--accent-info)' }
              };
              const style = colors[insight.type];

              return (
                <div key={insight.id} style={{ display: 'flex', gap: '16px', padding: '16px', background: 'var(--bg-tertiary)', borderLeft: `4px solid ${style.text}`, borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: style.bg, color: style.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {insight.icon}
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                    {insight.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
