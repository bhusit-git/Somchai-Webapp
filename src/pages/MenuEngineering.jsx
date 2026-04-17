import { useState, useEffect, useMemo } from 'react';
import {
  Award,
  HelpCircle,
  ThumbsDown,
  Calendar,
  ChevronUp,
  ChevronDown,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Lightbulb,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Tables (M9 — Menu Engineering):
  - products: id, name, price, cost, is_available
  - transactions: id, created_at, status
  - transaction_items: transaction_id, product_id, quantity, unit_price, total_price
  BCG Matrix: Popularity = qty_sold เทียบค่าเฉลี่ย, Profitability = margin/จาน เทียบค่าเฉลี่ย
*/

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtB = (n) =>
  Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QUADRANT_META = {
  Star: {
    emoji: '⭐', label: 'Star', labelTH: 'ดาวรุ่ง',
    desc: 'ขายดี + กำไรสูง',
    color: 'var(--accent-success)', bg: 'var(--accent-success-bg)',
    actions: [
      'รักษาคุณภาพและมาตรฐานปริมาณ',
      'โปรโมตเป็นเมนูแนะนำ / Highlight บนเมนู',
      'ใช้เป็นเมนูชูโรงในสื่อโซเชียลมีเดีย',
      'พิจารณาเพิ่มราคาได้เล็กน้อย (ลูกค้ายอมรับอยู่แล้ว)'
    ]
  },
  Puzzle: {
    emoji: '🧩', label: 'Puzzle', labelTH: 'ปริศนา',
    desc: 'ขายน้อย + กำไรสูง',
    color: 'var(--accent-warning)', bg: 'var(--accent-warning-bg)',
    actions: [
      'ปรับตำแหน่งในเมนูให้เด่นขึ้น (Banner, Box highlight)',
      'ลดราคาชั่วคราวเพื่อสร้าง Trial',
      'สร้าง Combo ร่วมกับเมนู Star เพื่อ Cross-sell',
      'ถ้าไม่ดีขึ้นใน 2 เดือน พิจารณาตัดออก'
    ]
  },
  'Plow Horse': {
    emoji: '🐎', label: 'Plow Horse', labelTH: 'ม้างาน',
    desc: 'ขายดี + กำไรต่ำ',
    color: 'var(--accent-info)', bg: 'var(--accent-info-bg)',
    actions: [
      'ลด Yield (ปริมาณ) วัตถุดิบที่ใช้ต่อเสิร์ฟลงเล็กน้อย',
      'ค่อยๆ ปรับขึ้นราคา 5-10 บาท (ลูกค้าอาจไม่สังเกต)',
      'หาวัตถุดิบทดแทนที่ถูกกว่าแต่คุณภาพใกล้เคียง',
      'ใช้เป็นเมนูดึงลูกค้า แต่สร้างกำไรจากเมนูอื่น'
    ]
  },
  Dog: {
    emoji: '🐕', label: 'Dog', labelTH: 'สุนัข',
    desc: 'ขายน้อย + กำไรต่ำ',
    color: 'var(--accent-danger)', bg: 'var(--accent-danger-bg)',
    actions: [
      'พิจารณาตัดออกจากเมนู เพื่อลดความซับซ้อนในครัว',
      'ยกเลิก Stock วัตถุดิบเฉพาะเมนูนี้',
      'ถ้าจำเป็นต้องรักษาไว้ ปรับสูตรลดต้นทุน + เพิ่มราคา',
      'เลิกโปรโมชันหรือส่วนลดสำหรับเมนูนี้'
    ]
  }
};

function getQuadrant(isPopular, isProfitable) {
  if (isPopular && isProfitable)   return 'Star';
  if (!isPopular && isProfitable)  return 'Puzzle';
  if (isPopular && !isProfitable)  return 'Plow Horse';
  return 'Dog';
}

// ─── SVG Scatter Plot ──────────────────────────────────────────────────────────
function ScatterPlot({ menus, avgQty, avgMargin, onHover, hoveredId, filterQuadrant, onQuadrantClick }) {
  if (!menus.length) return null;

  const W = 520, H = 320, PAD = 40;
  const innerW = W - PAD * 2, innerH = H - PAD * 2;

  const maxQty    = Math.max(...menus.map(m => m.qtySold), avgQty * 2, 1);
  const maxMargin = Math.max(...menus.map(m => Math.abs(m.margin)), avgMargin * 2, 1);
  const minMargin = Math.min(...menus.map(m => m.margin), 0);
  const marginRange = maxMargin - minMargin;

  const toX = (qty)    => PAD + (qty / maxQty) * innerW;
  const toY = (margin) => PAD + innerH - ((margin - minMargin) / Math.max(marginRange, 0.01)) * innerH;

  const pivotX = toX(avgQty);
  const pivotY = toY(avgMargin);

  const meta = QUADRANT_META;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '320px', display: 'block' }}>
        {/* Quadrant backgrounds */}
        {/* Top-Right: Star */}
        <rect x={pivotX} y={PAD} width={W - PAD - pivotX} height={pivotY - PAD}
          fill={filterQuadrant === 'Star' ? '#22c55e30' : '#22c55e14'}
          stroke={filterQuadrant === 'Star' ? 'var(--accent-success)' : 'none'} strokeWidth="1.5"
          rx="4" style={{ cursor: 'pointer' }} onClick={() => onQuadrantClick('Star')} />
        {/* Top-Left: Puzzle */}
        <rect x={PAD} y={PAD} width={pivotX - PAD} height={pivotY - PAD}
          fill={filterQuadrant === 'Puzzle' ? '#f59e0b30' : '#f59e0b14'}
          stroke={filterQuadrant === 'Puzzle' ? 'var(--accent-warning)' : 'none'} strokeWidth="1.5"
          rx="4" style={{ cursor: 'pointer' }} onClick={() => onQuadrantClick('Puzzle')} />
        {/* Bottom-Right: Plow Horse */}
        <rect x={pivotX} y={pivotY} width={W - PAD - pivotX} height={H - PAD - pivotY}
          fill={filterQuadrant === 'Plow Horse' ? '#3b82f630' : '#3b82f614'}
          stroke={filterQuadrant === 'Plow Horse' ? 'var(--accent-info)' : 'none'} strokeWidth="1.5"
          rx="4" style={{ cursor: 'pointer' }} onClick={() => onQuadrantClick('Plow Horse')} />
        {/* Bottom-Left: Dog */}
        <rect x={PAD} y={pivotY} width={pivotX - PAD} height={H - PAD - pivotY}
          fill={filterQuadrant === 'Dog' ? '#ef444430' : '#ef444414'}
          stroke={filterQuadrant === 'Dog' ? 'var(--accent-danger)' : 'none'} strokeWidth="1.5"
          rx="4" style={{ cursor: 'pointer' }} onClick={() => onQuadrantClick('Dog')} />

        {/* Quadrant labels */}
        <text x={W - PAD - 4} y={PAD + 14} textAnchor="end" fontSize="11" fill="#22c55e" fontWeight="600">⭐ Star</text>
        <text x={PAD + 4} y={PAD + 14} textAnchor="start" fontSize="11" fill="#f59e0b" fontWeight="600">🧩 Puzzle</text>
        <text x={W - PAD - 4} y={H - PAD - 6} textAnchor="end" fontSize="11" fill="#3b82f6" fontWeight="600">🐎 Plow Horse</text>
        <text x={PAD + 4} y={H - PAD - 6} textAnchor="start" fontSize="11" fill="#ef4444" fontWeight="600">🐕 Dog</text>

        {/* Axis lines */}
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--border-primary)" strokeWidth="1.5" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border-primary)" strokeWidth="1.5" />
        {/* Pivot lines */}
        <line x1={pivotX} y1={PAD} x2={pivotX} y2={H - PAD} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4,3" />
        <line x1={PAD} y1={pivotY} x2={W - PAD} y2={pivotY} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4,3" />

        {/* Axis labels */}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontWeight="600">จำนวนขาย (Popularity) →</text>
        <text x="10" y={H / 2} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontWeight="600"
          transform={`rotate(-90, 10, ${H / 2})`}>กำไร/จาน →</text>

        {/* Data points */}
        {menus.map(m => {
          const cx = toX(m.qtySold);
          const cy = toY(m.margin);
          const qMeta = meta[m.quadrant];
          const isHovered = hoveredId === m.id;
          const isFiltered = filterQuadrant && m.quadrant !== filterQuadrant;
          const r = Math.max(5, Math.min(14, 5 + Math.sqrt(m.qtySold) * 0.8));
          return (
            <g key={m.id} style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover(m.id)}
              onMouseLeave={() => onHover(null)}>
              <circle
                cx={cx} cy={cy} r={isHovered ? r + 3 : r}
                fill={isFiltered ? '#ffffff18' : qMeta.color}
                fillOpacity={isFiltered ? 0.2 : 0.85}
                stroke={isHovered ? 'white' : qMeta.color}
                strokeWidth={isHovered ? 2 : 1}
                style={{ transition: 'all 0.15s ease' }}
              />
              {/* Label on hover or if ≤10 menus */}
              {(isHovered || menus.length <= 8) && !isFiltered && (
                <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize="10"
                  fill="var(--text-primary)" fontWeight="600"
                  style={{ pointerEvents: 'none' }}>
                  {m.name.length > 10 ? m.name.slice(0, 9) + '…' : m.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend: bubble size */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '-4px' }}>
        ขนาดฟองอากาศ = ปริมาณขาย | คลิก Quadrant เพื่อกรอง
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MenuEngineering() {
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [menus, setMenus]             = useState([]);
  const [matrixData, setMatrixData]   = useState({ stars: 0, plowHorses: 0, puzzles: 0, dogs: 0, avgQtySold: 0, avgMargin: 0 });
  const [hoveredId, setHoveredId]     = useState(null);
  const [filterQuadrant, setFilterQuadrant] = useState(null);
  const [searchTerm, setSearchTerm]   = useState('');
  const [sortKey, setSortKey]         = useState('totalRevenue');
  const [sortDir, setSortDir]         = useState('desc');
  const [detailMenu, setDetailMenu]   = useState(null); // modal
  const [includeStaffMeals, setIncludeStaffMeals] = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, [selectedMonth, includeStaffMeals]);

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthStart = `${selectedMonth}-01T00:00:00`;
      const monthEnd   = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}T23:59:59`;

      // 1. Products
      const { data: products } = await supabase
        .from('products')
        .select('id, name, price, cost, is_available');

      if (!products?.length) {
        setMenus([]); setMatrixData({ stars: 0, plowHorses: 0, puzzles: 0, dogs: 0, avgQtySold: 0, avgMargin: 0 });
        return;
      }

      // 2. Transaction items this month
      const { data: txItems } = await supabase
        .from('transaction_items')
        .select('product_id, quantity, total_price, transactions!inner(created_at, status, payment_method)')
        .gte('transactions.created_at', monthStart)
        .lte('transactions.created_at', monthEnd)
        .eq('transactions.status', 'completed');

      // 3. Aggregate per product
      const aggMap = {};
      const staffAggMap = {};

      (txItems || []).forEach(item => {
        const id = item.product_id;
        if (!id) return;

        const isStaff = item.transactions?.payment_method === 'staff_meal';
        if (isStaff) {
          if (!staffAggMap[id]) staffAggMap[id] = { qty: 0 };
          staffAggMap[id].qty += Number(item.quantity);
        } else {
          if (!aggMap[id]) aggMap[id] = { qty: 0, revenue: 0 };
          aggMap[id].qty     += Number(item.quantity);
          aggMap[id].revenue += Number(item.total_price);
        }
      });

      // 4. Compute metrics
      const processed = products.map(p => {
        const agg = aggMap[p.id] || { qty: 0, revenue: 0 };
        const staff = staffAggMap[p.id] || { qty: 0 };
        
        const sellingPrice = Number(p.price);
        const trueCost     = Number(p.cost) || 0;
        
        // Staff Meal impact logic
        const qtySold = includeStaffMeals ? (agg.qty + staff.qty) : agg.qty;
        const revenue = (agg.revenue || sellingPrice * agg.qty); // Staff meal revenue is always 0
        const totalRevenue = revenue;
        const totalMargin  = (sellingPrice - trueCost) * agg.qty + (0 - trueCost) * staff.qty; // Staff meal has negative margin
        
        const margin = qtySold > 0 ? totalMargin / qtySold : (sellingPrice - trueCost);
        const fcPct  = sellingPrice > 0 ? (trueCost / sellingPrice) * 100 : 0;
        
        return { 
          id: p.id, 
          name: p.name, 
          sellingPrice, 
          trueCost, 
          qtySold, 
          qtyStaff: staff.qty,
          revenue, 
          margin, 
          totalRevenue, 
          totalMargin, 
          fcPct 
        };
      });

      // 5. Thresholds (only from menus with any sales for meaningful avg)
      const sold = processed.filter(m => m.qtySold > 0);
      const avgQtySold    = sold.length > 0 ? sold.reduce((s, m) => s + m.qtySold, 0) / sold.length : 0;
      const avgMargin     = processed.length > 0 ? processed.reduce((s, m) => s + m.margin, 0) / processed.length : 0;

      // 6. Classify — menus with 0 sales are always Dog (when there's data in the month)
      const classified = processed.map(m => {
        const isPopular    = m.qtySold > 0 && m.qtySold >= avgQtySold;
        const isProfitable = m.margin >= avgMargin;
        const quadrant     = getQuadrant(isPopular, isProfitable);
        return { ...m, isPopular, isProfitable, quadrant };
      });

      classified.sort((a, b) => b.totalRevenue - a.totalRevenue);
      setMenus(classified);
      setMatrixData({
        stars:      classified.filter(m => m.quadrant === 'Star').length,
        puzzles:    classified.filter(m => m.quadrant === 'Puzzle').length,
        plowHorses: classified.filter(m => m.quadrant === 'Plow Horse').length,
        dogs:       classified.filter(m => m.quadrant === 'Dog').length,
        avgQtySold,
        avgMargin
      });
    } catch (err) {
      console.error('MenuEngineering error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ── Sort & Filter ─────────────────────────────────────────────────────────────
  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronUp size={11} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={11} style={{ color: 'var(--accent-primary)' }} />
      : <ChevronDown size={11} style={{ color: 'var(--accent-primary)' }} />;
  }

  function handleQuadrantClick(q) {
    setFilterQuadrant(prev => prev === q ? null : q);
  }

  const displayData = useMemo(() => {
    let list = menus.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchQ = !filterQuadrant || m.quadrant === filterQuadrant;
      return matchSearch && matchQ;
    });
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      return sortDir === 'asc' ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
    });
  }, [menus, filterQuadrant, searchTerm, sortKey, sortDir]);

  // ── Totals row ────────────────────────────────────────────────────────────────
  const totalsRevenue = displayData.reduce((s, m) => s + m.totalRevenue, 0);
  const totalsMargin  = displayData.reduce((s, m) => s + m.totalMargin, 0);
  const totalsSold    = displayData.reduce((s, m) => s + m.qtySold, 0);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Menu Engineering Matrix</h3>
          <p className="text-sm text-muted">M9: วิเคราะห์ความนิยมและกำไรแยกรายเมนู (BCG Matrix)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Toggle Switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: includeStaffMeals ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-secondary)', padding: '6px 12px', borderRadius: '20px', border: includeStaffMeals ? '1px solid var(--accent-warning)' : '1px solid var(--border-primary)', transition: 'all 0.2s' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: includeStaffMeals ? 'var(--accent-warning)' : 'var(--text-muted)' }}>รวมสวัสดิการพนักงาน?</span>
            <label style={{ position: 'relative', display: 'inline-block', width: '34px', height: '20px' }}>
              <input type="checkbox" checked={includeStaffMeals} onChange={e => setIncludeStaffMeals(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ 
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                backgroundColor: includeStaffMeals ? 'var(--accent-warning)' : '#ccc', transition: '0.4s', borderRadius: '34px' 
              }}>
                <span style={{ 
                  position: 'absolute', content: '""', height: '14px', width: '14px', left: includeStaffMeals ? '17px' : '3px', bottom: '3px', 
                  backgroundColor: 'white', transition: '0.4s', borderRadius: '50%' 
                }}></span>
              </span>
            </label>
          </div>

          <button className="btn btn-sm btn-ghost" onClick={() => loadData(true)} disabled={refreshing || loading}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            รีเฟรช
          </button>
          <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="month"
            className="form-input"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ width: '150px' }}
          />
        </div>
      </div>

      {/* Warning Banner when Toggle is ON */}
      {includeStaffMeals && (
        <div style={{ 
          background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--accent-warning)', 
          padding: '10px 16px', borderRadius: '12px', marginBottom: '20px', 
          display: 'flex', alignItems: 'center', gap: '10px', animation: 'pulse 2s infinite' 
        }}>
          <AlertCircle size={18} style={{ color: 'var(--accent-warning)' }} />
          <p style={{ fontSize: '13px', color: 'var(--accent-warning)', fontWeight: 600, margin: 0 }}>
            ⚠️ โหมดรวมสวัสดิการพนักงาน (ข้อมูลกำไรและคลาสเมนูอาจคลาดเคลื่อนจากพฤติกรรมลูกค้าจริง)
          </p>
        </div>
      )}

      {/* Quadrant Stat Cards (clickable filter) */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {Object.entries(QUADRANT_META).map(([key, meta]) => {
          const count = key === 'Star' ? matrixData.stars
            : key === 'Puzzle' ? matrixData.puzzles
            : key === 'Plow Horse' ? matrixData.plowHorses
            : matrixData.dogs;
          const isActive = filterQuadrant === key;
          return (
            <div
              key={key}
              className="stat-card"
              style={{
                cursor: 'pointer',
                border: isActive ? `2px solid ${meta.color}` : '1px solid var(--border-primary)',
                background: isActive ? meta.bg : 'var(--bg-card)',
                transition: 'all 0.2s'
              }}
              onClick={() => handleQuadrantClick(key)}
            >
              <div className="stat-icon" style={{ background: meta.bg, color: meta.color }}>
                <span style={{ fontSize: '20px' }}>{meta.emoji}</span>
              </div>
              <div className="stat-info">
                <h3 style={{ color: isActive ? meta.color : 'var(--text-primary)' }}>{count}</h3>
                <p>{meta.labelTH} ({meta.label})</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{meta.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* BCG Scatter + Info row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', marginBottom: '24px' }}>

        {/* Scatter Plot Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700 }}>BCG Matrix — Scatter Plot</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                จุดตัด: ยอดขายเฉลี่ย {matrixData.avgQtySold.toFixed(0)} จาน | กำไรเฉลี่ย ฿{matrixData.avgMargin.toFixed(2)}/จาน
              </p>
            </div>
            {filterQuadrant && (
              <button
                style={{ fontSize: '12px', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setFilterQuadrant(null)}
              >
                <X size={13} /> ล้างตัวกรอง
              </button>
            )}
          </div>
          {loading ? (
            <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <span className="animate-pulse">กำลังวิเคราะห์...</span>
            </div>
          ) : menus.length === 0 ? (
            <div style={{ height: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '36px', marginBottom: '12px' }}>📊</span>
              <p>ยังไม่มีข้อมูลยอดขายในเดือนนี้</p>
            </div>
          ) : (
            <ScatterPlot
              menus={menus}
              avgQty={matrixData.avgQtySold}
              avgMargin={matrixData.avgMargin}
              onHover={setHoveredId}
              hoveredId={hoveredId}
              filterQuadrant={filterQuadrant}
              onQuadrantClick={handleQuadrantClick}
            />
          )}
        </div>

        {/* Action Guide Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lightbulb size={15} style={{ color: 'var(--accent-warning)' }} /> คู่มือการตัดสินใจ
          </h4>
          {Object.entries(QUADRANT_META).map(([key, meta]) => (
            <div key={key} style={{
              padding: '10px 12px',
              background: filterQuadrant === key ? meta.bg : 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              border: filterQuadrant === key ? `1px solid ${meta.color}` : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }} onClick={() => handleQuadrantClick(key)}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: meta.color, marginBottom: '4px' }}>
                {meta.emoji} {meta.labelTH} — {meta.desc}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {meta.actions[0]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600 }}>รายการเมนูทั้งหมด</h4>
            {filterQuadrant && (
              <span style={{
                fontSize: '12px', background: QUADRANT_META[filterQuadrant].bg,
                color: QUADRANT_META[filterQuadrant].color, padding: '3px 10px', borderRadius: '10px', fontWeight: 600
              }}>
                {QUADRANT_META[filterQuadrant].emoji} {filterQuadrant} ({displayData.length})
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="ค้นหาเมนู..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '32px', width: '200px', fontSize: '13px' }}
            />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>เมนู <SortIcon col="name" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('qtySold')}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>ขายได้ <SortIcon col="qtySold" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('qtyStaff')}>
                  <div 
                    style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end', color: 'var(--accent-info)' }}
                    title="จำนวนจานที่พนักงานทานเป็นสวัสดิการ (ไม่นำมาคิดเป็นรายได้)"
                  >
                    พนักงานทาน <HelpCircle size={12} style={{ opacity: 0.6 }} /> <SortIcon col="qtyStaff" />
                  </div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('totalRevenue')}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>รายได้จริง <SortIcon col="totalRevenue" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('margin')}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>กำไร/จาน <SortIcon col="margin" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('totalMargin')}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>กำไรรวม <SortIcon col="totalMargin" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('fcPct')}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>FC% <SortIcon col="fcPct" /></div>
                </th>
                <th style={{ textAlign: 'center' }}>Matrix</th>
                <th>แนะนำ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '48px' }}>
                  <span className="animate-pulse">กำลังวิเคราะห์ข้อมูล...</span>
                </td></tr>
              ) : displayData.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  {menus.length === 0 ? 'ยังไม่มีข้อมูลเมนูหรือยอดขายในเดือนนี้' : 'ไม่พบเมนูที่ตรงกับเงื่อนไข'}
                </td></tr>
              ) : displayData.map(m => {
                const qMeta = QUADRANT_META[m.quadrant];
                const isHovered = hoveredId === m.id;
                return (
                  <tr
                    key={m.id}
                    style={{ background: isHovered ? 'var(--bg-card-hover)' : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setDetailMenu(m)}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {m.name}
                      {m.qtySold === 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>(ไม่มียอดขาย)</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: m.isPopular ? 700 : 400 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        {m.isPopular ? <TrendingUp size={12} style={{ color: 'var(--accent-success)' }} /> : m.qtySold === 0 ? null : <Minus size={12} style={{ color: 'var(--text-muted)' }} />}
                        {m.qtySold}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', color: m.qtyStaff > 0 ? 'var(--accent-info)' : 'var(--text-muted)', fontSize: '13px' }}>
                      {m.qtyStaff > 0 ? m.qtyStaff : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {m.qtySold > 0 ? `฿${fmtB(m.totalRevenue)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: m.isProfitable ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                      {m.isProfitable ? <TrendingUp size={11} style={{ verticalAlign: 'middle', marginRight: '2px' }} /> : <TrendingDown size={11} style={{ verticalAlign: 'middle', marginRight: '2px' }} />}
                      ฿{fmtB(m.margin)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: m.totalMargin >= 0 ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                      {m.qtySold > 0 ? `฿${fmtB(m.totalMargin)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {m.trueCost > 0 ? (
                        <span style={{
                          color: m.fcPct > 35 ? 'var(--accent-danger)' : m.fcPct >= 20 ? 'var(--accent-success)' : 'var(--text-muted)',
                          fontWeight: 600, fontSize: '12px',
                          background: m.fcPct > 35 ? 'var(--accent-danger-bg)' : m.fcPct >= 20 ? 'var(--accent-success-bg)' : 'var(--bg-tertiary)',
                          padding: '2px 7px', borderRadius: '8px'
                        }}>
                          {m.fcPct.toFixed(1)}%
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        color: qMeta.color, background: qMeta.bg,
                        padding: '3px 8px', borderRadius: '10px',
                        fontSize: '12px', fontWeight: 600,
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        whiteSpace: 'nowrap'
                      }}>
                        {qMeta.emoji} {qMeta.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                      {qMeta.actions[0]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!loading && displayData.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>รวม ({displayData.length} เมนู)</td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '13px' }}>{totalsSold}</td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '13px' }}>฿{fmtB(totalsRevenue)}</td>
                  <td></td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '13px', color: totalsMargin >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                    ฿{fmtB(totalsMargin)}
                  </td>
                  <td colSpan="3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {!loading && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
            คลิกที่แถวเมนูเพื่อดูคำแนะนำเพิ่มเติม | คลิก Quadrant Card / Scatter Plot เพื่อกรอง
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailMenu && (
        <div className="modal-overlay" onClick={() => setDetailMenu(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>{QUADRANT_META[detailMenu.quadrant].emoji}</span>
                <div>
                  <h3>{detailMenu.name}</h3>
                  <p style={{ fontSize: '12px', marginTop: '2px', color: QUADRANT_META[detailMenu.quadrant].color, fontWeight: 600 }}>
                    {QUADRANT_META[detailMenu.quadrant].labelTH} — {QUADRANT_META[detailMenu.quadrant].desc}
                  </p>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setDetailMenu(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                  { label: 'ขายได้', value: `${detailMenu.qtySold} จาน` },
                  { label: 'สวัสดิการพนักงาน', value: `${detailMenu.qtyStaff} จาน`, color: 'var(--accent-info)' },
                  { label: 'ราคาขาย', value: `฿${fmtB(detailMenu.sellingPrice)}` },
                  { label: 'ต้นทุน/จาน', value: detailMenu.trueCost > 0 ? `฿${fmtB(detailMenu.trueCost)}` : 'ไม่มีข้อมูล' },
                  { label: 'กำไร/จาน', value: `฿${fmtB(detailMenu.margin)}`, color: detailMenu.margin >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' },
                  { label: 'รายได้จริง', value: detailMenu.qtySold > 0 ? `฿${fmtB(detailMenu.revenue)}` : '—', color: 'var(--accent-info)' }
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: item.color || 'var(--text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lightbulb size={14} style={{ color: 'var(--accent-warning)' }} /> คำแนะนำในการปรับปรุง
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {QUADRANT_META[detailMenu.quadrant].actions.map((action, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '10px', padding: '10px 12px',
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                    borderLeft: `3px solid ${QUADRANT_META[detailMenu.quadrant].color}`
                  }}>
                    <span style={{ color: QUADRANT_META[detailMenu.quadrant].color, fontWeight: 700, flexShrink: 0, fontSize: '13px' }}>{i + 1}.</span>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{action}</span>
                  </div>
                ))}
              </div>

              {/* Comparison to avg */}
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>ค่าเฉลี่ยยอดขายร้าน</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{matrixData.avgQtySold.toFixed(0)} จาน/เดือน</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>ค่าเฉลี่ยกำไรร้าน</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>฿{matrixData.avgMargin.toFixed(2)}/จาน</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetailMenu(null)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
