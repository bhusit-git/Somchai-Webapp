import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  CheckCircle,
  Calendar,
  Gift,
  Award,
  RefreshCw,
  Package,
  DollarSign,
  BarChart2,
  ShoppingCart,
  AlertCircle,
  ArrowRight,
  Zap,
  Target,
  Users,
  FileText,
  Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateFinancials } from '../lib/financials';
import DateRangePicker from '../components/DateRangePicker';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtB = n => Math.round(Number(n)).toLocaleString('th-TH');
const fmtDec = n => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QUADRANT_META = {
  Star: { emoji: '⭐', label: 'Star', color: 'var(--accent-success)', bg: 'var(--accent-success-bg)' },
  Puzzle: { emoji: '🧩', label: 'Puzzle', color: 'var(--accent-warning)', bg: 'var(--accent-warning-bg)' },
  'Plow Horse': { emoji: '🐎', label: 'Plow Horse', color: 'var(--accent-info)', bg: 'var(--accent-info-bg)' },
  Dog: { emoji: '🐕', label: 'Dog', color: 'var(--accent-danger)', bg: 'var(--accent-danger-bg)' }
};

// ─── Health Score Ring ───────────────────────────────────────────────────────
function HealthRing({ score, size = 140 }) {
  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? 'var(--accent-success)' : score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)';
  const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-secondary)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease-in-out', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '36px', fontWeight: 800, lineHeight: 1, color }}>{score}</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color, marginTop: '2px' }}>{grade}</span>
      </div>
    </div>
  );
}

// ─── Mini Ring ───────────────────────────────────────────────────────────────
function MiniRing({ progress, color, title, subtitle }) {
  const size = 90, r = size / 2 - 8, circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(progress, 100) / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-secondary)" strokeWidth="7" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '18px', fontWeight: 800 }}>{Math.round(progress)}%</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ─── Heatmap Row ─────────────────────────────────────────────────────────────
function HeatmapGrid({ data, dayLabels }) {
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {dayLabels.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {data.map((h, i) => {
          const pct = h.revenue / maxRev;
          const alpha = h.revenue === 0 ? 0.06 : 0.15 + pct * 0.85;
          return (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: '6px',
              background: `rgba(16, 185, 129, ${alpha})`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border-primary)',
              cursor: h.revenue > 0 ? 'pointer' : 'default',
              position: 'relative'
            }} title={`วันที่ ${h.day}: ฿${fmtB(h.revenue)}`}>
              {h.revenue > maxRev * 0.7 && <span style={{ fontSize: '10px' }}>🔥</span>}
              <span style={{ fontSize: '10px', fontWeight: h.revenue > 0 ? 600 : 400, color: h.revenue > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {h.day}
              </span>
              {h.revenue > 1000 && <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{fmtB(h.revenue / 1000)}k</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Narrative Card ─────────────────────────────────────────────────────────
function NarrativeCard({ icon, title, text, subtext, actionLabel, onAction, actionIcon, type = 'info', linkTo }) {
  const COLORS = {
    success: { bg: 'rgba(34, 197, 94, 0.1)', icon: 'var(--accent-success)', border: 'var(--accent-success)' },
    danger: { bg: 'rgba(239, 68, 68, 0.1)', icon: 'var(--accent-danger)', border: 'var(--accent-danger)' },
    warning: { bg: 'rgba(245, 158, 11, 0.1)', icon: 'var(--accent-warning)', border: 'var(--accent-warning)' },
    info: { bg: 'var(--bg-tertiary)', icon: 'var(--accent-info)', border: 'var(--border-primary)' }
  };
  const theme = COLORS[type] || COLORS.info;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: theme.bg, color: theme.icon, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{title}</h4>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{subtext}</p>
        </div>
      </div>
      <div style={{ fontSize: '13px', lineHeight: 1.6, flex: 1 }}>
        {text}
      </div>
      {(actionLabel || linkTo) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button 
            className="btn btn-sm btn-ghost" 
            style={{ fontSize: '11px', height: '28px', color: theme.icon }}
            onClick={onAction}
          >
            {actionLabel} {actionIcon || <ArrowRight size={12} />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
const INSIGHT_STYLES = {
  success: { bg: 'var(--accent-success-bg)', color: 'var(--accent-success)', borderColor: 'var(--accent-success)' },
  warning: { bg: 'var(--accent-warning-bg)', color: 'var(--accent-warning)', borderColor: 'var(--accent-warning)' },
  danger:  { bg: 'var(--accent-danger-bg)',  color: 'var(--accent-danger)',  borderColor: 'var(--accent-danger)' },
  info:    { bg: 'var(--accent-info-bg)',    color: 'var(--accent-info)',    borderColor: 'var(--accent-info)' },
  tip:     { bg: 'var(--accent-purple-bg)',  color: 'var(--accent-purple)',  borderColor: 'var(--accent-purple)' }
};

function InsightCard({ icon, type, title, text, metric }) {
  const st = INSIGHT_STYLES[type] || INSIGHT_STYLES.info;
  return (
    <div style={{
      display: 'flex', gap: '14px', padding: '14px 16px',
      background: 'var(--bg-card)', borderLeft: `4px solid ${st.borderColor}`,
      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
      transition: 'background 0.15s'
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: '50%',
        background: st.bg, color: st.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px', color: 'var(--text-primary)' }}>{title}</div>}
        <div style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{text}</div>
      </div>
      {metric && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: st.color }}>{metric.value}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{metric.label}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SmartInsights() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const dashboardRef = useRef(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState({ start: firstDayOfMonth, end: todayStr });

  const [metrics, setMetrics] = useState({
    healthScore: 0,
    rings: { salesTarget: 0, fc: 0, compliance: 0 },
    currentPeriod: { revenue: 0, netProfit: 0, staffMealCogs: 0, staffBenefitValue: 0, staffMealRatio: 0 },
    prevPeriod: { revenue: 0, netProfit: 0 },
    menu: { bestStar: null, worstDog: null }
  });

  const [heatmap, setHeatmap]         = useState([]);
  const [insights, setInsights]       = useState([]);
  const [topSellers, setTopSellers]   = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);

  useEffect(() => { loadData(); }, [dateRange]);

  // Logic: Calculate previous range for growth comparison
  function getPreviousRange(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const diff = e.getTime() - s.getTime();
    const days = Math.round(diff / (1000 * 60 * 60 * 24)) + 1;

    // Special Case: Full Month Check
    const isFirstDay = s.getDate() === 1;
    const lastDayOfMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
    const isLastDay = e.getDate() === lastDayOfMonth;

    if (isFirstDay && isLastDay) {
      // Calendar Month Comparison
      const prevStart = new Date(s.getFullYear(), s.getMonth() - 1, 1);
      const prevEnd = new Date(s.getFullYear(), s.getMonth(), 0);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }

    // Exact Offset
    const ps = new Date(s); ps.setDate(ps.getDate() - days);
    const pe = new Date(s); pe.setDate(pe.getDate() - 1);
    return { start: ps.toISOString().split('T')[0], end: pe.toISOString().split('T')[0] };
  }

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { start, end } = dateRange;
      const prev = getPreviousRange(start, end);
      
      const currentStart = `${start}T00:00:00`;
      const currentEnd   = `${end}T23:59:59`;
      const previousStart = `${prev.start}T00:00:00`;
      const previousEnd   = `${prev.end}T23:59:59`;

      // ═══ Parallel Fetch for Current AND Previous Period ═══
      const [
        txCur, txItemsCur, expCur, prodRes, invRes, bomRes, txPrev, expPrev, fixedRes
      ] = await Promise.all([
        supabase.from('transactions').select('id, total, created_at, status, payment_method').gte('created_at', currentStart).lte('created_at', currentEnd),
        supabase.from('transaction_items').select('transaction_id, product_id, product_name, quantity, unit_price, total_price, transactions!inner(created_at, status, payment_method)').gte('transactions.created_at', currentStart).lte('transactions.created_at', currentEnd).eq('transactions.status', 'completed'),
        supabase.from('expenses').select('amount, category, created_at, status').gte('created_at', currentStart).lte('created_at', currentEnd).eq('status', 'approved'),
        supabase.from('products').select('id, name, price, cost, is_available, product_type'),
        supabase.from('inventory_items').select('id, name, current_stock, reorder_point, par_level, cost_per_stock_unit').eq('is_active', true),
        supabase.from('menu_item_ingredients').select('menu_item_id, inventory_item_id, qty_required'),
        supabase.from('transactions').select('total, status').gte('created_at', previousStart).lte('created_at', previousEnd),
        supabase.from('expenses').select('amount, category, created_at, status').gte('created_at', previousStart).lte('created_at', previousEnd).eq('status', 'approved'),
        supabase.from('expense_categories').select('name, is_fixed_cost').eq('is_active', true)
      ]);

      const products = prodRes.data || [];
      const invItems = invRes.data || [];
      const bomData  = bomRes.data || [];
      const fixedCats = (fixedRes.data || []).filter(c => c.is_fixed_cost).map(c => c.name);

      // ═══ Cost Resolution Map ═══
      const invMap = {}; invItems.forEach(i => { invMap[i.id] = Number(i.cost_per_stock_unit || 0); });
      const resolvedCosts = {};
      products.forEach(p => {
        const boms = bomData.filter(b => b.menu_item_id === p.id);
        if (boms.length > 0) {
          resolvedCosts[p.id] = boms.reduce((s, b) => s + (Number(b.qty_required) * (invMap[b.inventory_item_id] || 0)), 0);
        } else {
          resolvedCosts[p.id] = Number(p.cost || 0);
        }
      });

      // ═══ Metrics Calculation: Current Period ═══
      const curTx = txCur.data || [];
      const curItems = txItemsCur.data || [];
      const curExp = expCur.data || [];
      
      const curFinancials = calculateFinancials(curTx, curItems, resolvedCosts);
      const totalCurExp = curExp.reduce((s, e) => s + Number(e.amount), 0);
      const curNetProfit = curFinancials.actualRevenue - curFinancials.salesCogs - curFinancials.staffMealCogs - totalCurExp;
      const staffMealRatio = curFinancials.actualRevenue > 0 ? (curFinancials.staffMealCogs / curFinancials.actualRevenue) * 100 : 0;

      // ═══ Metrics Calculation: Previous Period ═══
      const prevTx = txPrev.data || [];
      const prevExp = expPrev.data || [];
      const prevRevenue = prevTx.filter(t => t.payment_method !== 'staff_meal').reduce((s, t) => s + (t.status === 'completed' ? Number(t.total) : 0), 0);
      const totalPrevExp = prevExp.reduce((s, e) => s + Number(e.amount), 0);
      const prevNetProfit = prevRevenue - totalPrevExp; 

      // ═══ Menu Performance (Reusing existing loop for Card C) ═══
      const productSalesMap = {};
      curItems.forEach(item => {
        const pid = item.product_id;
        const qty = Number(item.quantity);
        const isStaff = item.transactions?.payment_method === 'staff_meal';
        if (!productSalesMap[pid]) productSalesMap[pid] = { name: item.product_name, qty: 0, revenue: 0, staffQty: 0, cost: resolvedCosts[pid] || 0 };
        if (isStaff) productSalesMap[pid].staffQty += qty;
        else {
          productSalesMap[pid].qty += qty;
          productSalesMap[pid].revenue += Number(item.total_price);
        }
      });

      const productList = Object.entries(productSalesMap).map(([id, d]) => ({
        id, ...d,
        margin: d.qty > 0 ? (d.revenue / d.qty) - d.cost : 0,
        totalMargin: d.revenue - (d.qty * d.cost)
      })).filter(p => p.qty > 0 || p.staffQty > 0);

      const avgQty = productList.length > 0 ? productList.reduce((s, p) => s + p.qty, 0) / productList.length : 0;
      const avgMargin = productList.length > 0 ? productList.reduce((s, p) => s + p.margin, 0) / productList.length : 0;

      const classified = productList.map(p => {
        const isPop = p.qty >= avgQty;
        const isProfitable = p.margin >= avgMargin;
        if (isPop && isProfitable) return { ...p, quadrant: 'Star' };
        if (!isPop && isProfitable) return { ...p, quadrant: 'Puzzle' };
        if (isPop && !isProfitable) return { ...p, quadrant: 'Plow Horse' };
        return { ...p, quadrant: 'Dog' };
      });

      const stars = classified.filter(p => p.quadrant === 'Star').sort((a, b) => b.totalMargin - a.totalMargin);
      const dogs = classified.filter(p => p.quadrant === 'Dog').sort((a, b) => a.revenue - b.revenue);

      const bestStar = stars[0] || null;
      const worstDog = dogs[0] || null;

      // ═══ Peak Hour (Transaction Count) ═══
      const hourMap = {};
      curTx.filter(t => t.status === 'completed').forEach(t => {
        const hour = new Date(t.created_at).getHours();
        hourMap[hour] = (hourMap[hour] || 0) + 1;
      });
      const peakHours = Object.entries(hourMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // ═══ Heatmap & Top Sellers (Legacy Support) ═══
      const dailyMap = {};
      txCur.data.forEach(tx => {
        if (tx.status !== 'completed' && Number(tx.total) >= 0) return;
        const dateKey = tx.created_at.split('T')[0];
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + Number(tx.total);
      });

      const heatmapData = [];
      let iter = new Date(start);
      const endD = new Date(end);
      while (iter <= endD) {
        const key = iter.toISOString().split('T')[0];
        heatmapData.push({
          day: iter.getDate(),
          date: key,
          revenue: dailyMap[key] || 0
        });
        iter.setDate(iter.getDate() + 1);
      }
      setHeatmap(heatmapData);
      setTopSellers(productList.sort((a,b) => b.qty - a.qty).slice(0, 5));
      setLowStockItems(invItems.filter(i => Number(i.current_stock) <= Number(i.reorder_point)));

      // ═══ Final State Update ═══
      const fcPct = curFinancials.actualRevenue > 0 ? (curFinancials.salesCogs / curFinancials.actualRevenue) * 100 : 0;
      const health = Math.round((curFinancials.actualRevenue > 0 ? 40 : 0) + (fcPct < 35 ? 30 : 15) + 30); // Simple score for V1
      
      setMetrics({
        healthScore: Math.min(health, 100),
        rings: { salesTarget: 85, fc: Math.round(fcPct), compliance: 90 },
        currentPeriod: { 
          revenue: curFinancials.actualRevenue, 
          netProfit: curNetProfit, 
          staffMealCogs: curFinancials.staffMealCogs, 
          staffBenefitValue: curFinancials.staffBenefitMarketValue,
          staffMealRatio: staffMealRatio
        },
        prevPeriod: { revenue: prevRevenue, netProfit: prevNetProfit },
        menu: { bestStar, worstDog }
      });

      // Rule Engine Refresh
      const rules = [];
      rules.push({ id: 101, icon: <DollarSign size={15} />, type: 'info', title: 'ยอดบิลสะสม', text: `ช่วงเวลานี้มีการออกบิลทั้งหมด ${curTx.length} บิล เฉลี่ยใบละ ฿${fmtB(curFinancials.actualRevenue / (curTx.length || 1))}` });
      if (peakHours.length > 0) {
        rules.push({ id: 102, icon: <Activity size={15} />, type: 'tip', title: 'ช่วงเวลา Peak (ตามจำนวนบิล)', text: `ลูกค้าแน่นที่สุดช่วง ${peakHours[0][0]}:00 น. (${peakHours[0][1]} บิล) ควรเตรียมพนักงานให้พร้อม` });
      }
      if (staffMealRatio > 5) {
        rules.push({ id: 103, icon: <AlertTriangle size={15} />, type: 'warning', title: 'ต้นทุนสวัสดิการสูง!', text: `Food Cost ของอาหารพนักงานอยู่ที่ ${staffMealRatio.toFixed(1)}% สูงกว่าเกณฑ์ 5%` });
      }
      setInsights(rules);

    } catch (err) {
      console.error('SmartInsights error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleDownloadPDF() {
    if (!dashboardRef.current) return;
    setDownloadingPDF(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        windowWidth: document.documentElement.offsetWidth,
        logging: false,
        backgroundColor: '#0f172a' // match your dark theme bg
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Somchai_Smart_Insights_${dateRange.start}_to_${dateRange.end}.pdf`);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสร้าง PDF');
    } finally {
      setDownloadingPDF(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div ref={dashboardRef}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Smart Business Insights</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>M12: วิเคราะห์สุขภาพธุรกิจด้วย Rule-Engine อัจฉริยะ (V1)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DateRangePicker 
            startDate={dateRange.start} 
            endDate={dateRange.end} 
            onChange={(start, end) => setDateRange({ start, end })} 
          />
          <button className="btn btn-outline" onClick={handleDownloadPDF} disabled={downloadingPDF || loading}>
            <Download size={14} /> {downloadingPDF ? 'สร้าง PDF...' : 'ดาวน์โหลด PDF'}
          </button>
          <button className="btn btn-outline" onClick={() => loadData(true)} disabled={refreshing || loading}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: '140px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', animation: 'pulse 2s infinite' }} />)}
        </div>
      ) : (
        <>
          {/* Row 1: Score + Rings (Legacy) */}
          <div className="card" style={{ padding: '24px 32px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: '24px' }}>
            <div style={{ textAlign: 'center' }}>
              <HealthRing score={metrics.healthScore} />
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>Health Score</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>M12 Health Index</div>
              </div>
            </div>
            <div style={{ width: '1px', height: '80px', background: 'var(--border-primary)' }} />
            <MiniRing progress={metrics.rings.salesTarget} color="var(--accent-info)" title="Sales" subtitle="MTD vs Target" />
            <MiniRing progress={metrics.rings.fc} color={metrics.rings.fc > 35 ? 'var(--accent-danger)' : 'var(--accent-success)'} title="FC%" subtitle="เป้าหมาย < 35%" />
            <MiniRing progress={metrics.rings.compliance} color="var(--accent-purple)" title="Data" subtitle="Completeness" />
          </div>

          {/* Row 2: Narrative Cards (NEW) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
            {/* Card A: Financial */}
            <NarrativeCard 
              type={metrics.currentPeriod.netProfit >= metrics.prevPeriod.netProfit ? 'success' : 'danger'}
              icon={<DollarSign size={20} />}
              title="Financial Health"
              subtext="เปรียบเทียบกำไรสุทธิกับช่วงก่อนหน้า"
              text={
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>฿{fmtB(metrics.currentPeriod.netProfit)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: metrics.currentPeriod.netProfit >= metrics.prevPeriod.netProfit ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                    {metrics.currentPeriod.netProfit >= metrics.prevPeriod.netProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {Math.abs(((metrics.currentPeriod.netProfit - metrics.prevPeriod.netProfit) / (Math.abs(metrics.prevPeriod.netProfit) || 1) * 100)).toFixed(1)}% 
                    <span style={{ color: 'var(--text-muted)' }}>เทียบกับช่วงก่อนหน้า</span>
                  </div>
                </div>
              }
            />

            {/* Card B: Staff Meal */}
            <NarrativeCard 
              type={metrics.currentPeriod.staffMealRatio > 5 ? 'danger' : 'info'}
              icon={<Users size={20} />}
              title="Staff Meal Impact"
              subtext="การวิเคราะห์อาหารสวัสดิการพนักงาน"
              text={
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    ต้นทุนคิดเป็น <span style={{ fontWeight: 800, color: metrics.currentPeriod.staffMealRatio > 5 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>{metrics.currentPeriod.staffMealRatio.toFixed(1)}%</span> ของรายได้
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    เสียโอกาสขายเป็นเงิน <span style={{ fontWeight: 600 }}>฿{fmtB(metrics.currentPeriod.staffBenefitValue)}</span>
                  </div>
                </div>
              }
              actionLabel="ดูรายละเอียด P&L"
              onAction={() => window.location.hash = '#/profit-dashboard'}
            />

            {/* Card C: Menu Actions */}
            <div className="card" style={{ padding: '0px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
               <div style={{ padding: '12px 20px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)', fontSize: '12px', fontWeight: 700 }}>
                  Menu Actionable Insights
               </div>
               <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                  {/* Star */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>⭐</span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700 }}>{metrics.menu.bestStar?.name || 'ไม่มีข้อมูล'}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>เมนูดาวรุ่ง กำไรสูง</div>
                      </div>
                    </div>
                    <button className="btn btn-sm btn-primary" style={{ padding: '2px 8px', fontSize: '10px' }}>Promote</button>
                  </div>
                  {/* Dog */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>🐕</span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700 }}>{metrics.menu.worstDog?.name || 'ไม่มีข้อมูล'}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ขายน้อย กำไรต่ำ</div>
                      </div>
                    </div>
                    <button 
                      className="btn btn-sm btn-outline" 
                      style={{ padding: '2px 8px', fontSize: '10px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                      onClick={() => window.location.hash = '#/menu-pricing'}
                    >
                      Adjust
                    </button>
                  </div>
               </div>
            </div>
          </div>

          {/* Row 3: Visual + Insights Feed (Legacy) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 700 }}>ยอดขายรายวัน (Heatmap)</h4>
                  <Calendar size={16} />
                </div>
                <HeatmapGrid data={heatmap} dayLabels={['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="card">
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>🏆 เมนูขวัญใจลูกค้า</h4>
                  {topSellers.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--border-primary)' : 'none' }}>
                      <span style={{ fontSize: '12px' }}>{i + 1}. {item.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700 }}>{item.qty} จาน</span>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>📦 สต๊อกใกล้หมด</h4>
                  {lowStockItems.slice(0, 5).map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--border-primary)' : 'none' }}>
                      <span style={{ fontSize: '12px' }}>{item.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-warning)' }}>{fmtB(item.current_stock)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lightbulb size={17} style={{ color: 'var(--accent-warning)' }} /> AI Insights ({insights.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {insights.map(i => <InsightCard key={i.id} {...i} />)}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .card { background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-primary); }
        .btn-outline { background: transparent; border: 1px solid var(--border-primary); color: var(--text-primary); transition: all 0.2s; }
        .btn-outline:hover { background: var(--bg-tertiary); }
      `}</style>
    </div>
  );
}
