import { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Calendar,
  AlertCircle,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Search,
  BarChart2,
  Package,
  Layers
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Tables (M8 — COGS Engine):
  - products:            id, name, price, cost, is_available
  - transactions:        id, created_at, total, status
  - transaction_items:   transaction_id, product_id, product_name, quantity, unit_price, total_price
  - menu_item_ingredients: menu_item_id (= product_id), inventory_item_id, qty_required
  - inventory_items:     id, name, cost_per_stock_unit, current_stock
  - fixed_costs:         type, amount, period_month (YYYY-MM)
*/

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtB   = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

const fcColor = (pct) => {
  if (pct > 40) return 'var(--accent-danger)';
  if (pct > 35) return 'var(--accent-warning)';
  if (pct >= 20) return 'var(--accent-success)';
  if (pct > 0)  return 'var(--accent-info)';
  return 'var(--text-muted)';
};

function BenchmarkBar({ label, value, min, max, unit = '%' }) {
  const color = value > max ? 'var(--accent-danger)' : value < min ? 'var(--accent-info)' : 'var(--accent-success)';
  const capped = Math.min(value, 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{fmtPct(value)}</span>
      </div>
      <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' }}>
        <div style={{ height: '100%', width: `${capped}%`, background: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>Target: {min}–{max}{unit}</span>
        <span style={{ color }}>{value > max ? '▲ สูงเกิน' : value < min && value > 0 ? '▼ ต่ำกว่า' : value === 0 ? 'ไม่มีข้อมูล' : '✓ ปกติ'}</span>
      </div>
    </div>
  );
}

function MiniDonut({ segments }) {
  // Simple stacked bar (horizontal) instead of SVG donut for simplicity
  const total = segments.reduce((s, sg) => s + sg.value, 0);
  if (total === 0) return null;
  return (
    <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', width: '100%' }}>
      {segments.filter(s => s.value > 0).map(sg => (
        <div
          key={sg.label}
          title={`${sg.label}: ${fmtPct((sg.value / total) * 100)}`}
          style={{ flex: sg.value, background: sg.color, transition: 'flex 0.5s ease' }}
        />
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function COGSEngine() {
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState('month');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey]     = useState('totalCogs');
  const [sortDir, setSortDir]     = useState('desc');
  const [filterHighFC, setFilterHighFC] = useState(false);

  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalCogs: 0,
    grossProfit: 0,
    avgFcPct: 0,
    highFcCount: 0,
    noBomCount: 0
  });
  const [menuData, setMenuData]     = useState([]);
  const [costStructure, setCostStructure] = useState({ foodCost: 0, labor: 0, rent: 0, utilities: 0 });
  const [fixedCostAmts, setFixedCostAmts] = useState({ labor: 0, rent: 0, utilities: 0 });

  // ── date helpers ─────────────────────────────────────────────────────────────
  function getRange(range) {
    const now = new Date();
    let start, end;
    if (range === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (range === 'week') {
      const d = now.getDay() || 7;
      start = new Date(now); start.setDate(now.getDate() - d + 1); start.setHours(0, 0, 0, 0);
      end   = new Date(now); end.setHours(23, 59, 59, 999);
    } else { // month
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return { startStr: start.toISOString(), endStr: end.toISOString(), monthStr };
  }

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, [dateRange]);

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { startStr, endStr, monthStr } = getRange(dateRange);

      // === 1. Products (master data with BOM cost) ===
      const { data: products } = await supabase
        .from('products')
        .select('id, name, price, cost, is_available, product_type');

      // === 1.5 Combo structure ===
      const { data: comboItems } = await supabase
        .from('product_combo_items')
        .select('combo_product_id, item_product_id, quantity');
      const comboMap = {};
      (comboItems || []).forEach(ci => {
        if (!comboMap[ci.combo_product_id]) comboMap[ci.combo_product_id] = [];
        comboMap[ci.combo_product_id].push(ci);
      });

      // === 2. Transaction items in date range ===
      const { data: txItems } = await supabase
        .from('transaction_items')
        .select('product_id, product_name, quantity, unit_price, total_price, transactions!inner(created_at, status, payment_method)')
        .gte('transactions.created_at', startStr)
        .lte('transactions.created_at', endStr)
        .eq('transactions.status', 'completed');

      // === 3. BOM ingredients (for all products sold) ===
      const soldProductIds = [...new Set((txItems || []).map(i => i.product_id).filter(Boolean))];
      let bomData = [];
      if (soldProductIds.length > 0) {
        const { data: bom } = await supabase
          .from('menu_item_ingredients')
          .select('menu_item_id, inventory_item_id, qty_required');
        bomData = bom || [];
      }

      // === 4. Inventory items (for BOM cost) ===
      const { data: invItems } = await supabase
        .from('inventory_items')
        .select('id, name, cost_per_stock_unit, current_stock, reorder_point');

      const invMap = {};
      (invItems || []).forEach(i => { invMap[i.id] = i; });

      // === 5. Aggregate qty & revenue per product ===
      const aggMap = {}; // product_id → { qtySold, qtyStaff, revenue }
      (txItems || []).forEach(item => {
        const id = item.product_id;
        if (!id) return;
        if (!aggMap[id]) aggMap[id] = { qtySold: 0, qtyStaff: 0, revenue: 0 };
        
        const isStaff = item.transactions?.payment_method === 'staff_meal';
        if (isStaff) {
          aggMap[id].qtyStaff += Number(item.quantity);
        } else {
          aggMap[id].qtySold  += Number(item.quantity);
          aggMap[id].revenue  += Number(item.total_price);
        }
      });

      // === 6. BOM cost map per product ===
      const bomCostMap = {}; // product_id → { bomCost (per unit), hasBom }
      bomData.forEach(b => {
        const inv = invMap[b.inventory_item_id];
        const cost = inv ? Number(b.qty_required) * Number(inv.cost_per_stock_unit || 0) : 0;
        if (!bomCostMap[b.menu_item_id]) bomCostMap[b.menu_item_id] = { bomCost: 0, hasBom: true };
        bomCostMap[b.menu_item_id].bomCost += cost;
      });

      // === 7. Cost Resolution stage ===
      // Map of product_id -> cost (initial cost for STANDARD based on BOM or manual cost)
      const resolvedCosts = {};
      (products || []).forEach(p => {
        const bomEntry = bomCostMap[p.id];
        // Use BOM cost if available, fallback to products.cost for standard
        resolvedCosts[p.id] = bomEntry ? bomEntry.bomCost : Number(p.cost || 0);
      });

      // Now resolve COMBO costs BASED ON resolvedCosts of children
      // This happens "dynamically" so if child cost (BOM) changes, combo cost changes
      (products || []).forEach(p => {
        if (p.product_type === 'COMBO') {
          const children = comboMap[p.id] || [];
          let comboTotalCost = 0;
          children.forEach(ci => {
            comboTotalCost += (resolvedCosts[ci.item_product_id] || 0) * ci.quantity;
          });
          resolvedCosts[p.id] = comboTotalCost;
        }
      });

      // === 8. Process each product ===
      const processed = (products || []).map(p => {
        const agg = aggMap[p.id] || { qtySold: 0, qtyStaff: 0, revenue: 0 };
        const sellingPrice = Number(p.price);
        const hasBom = !!bomCostMap[p.id] || p.product_type === 'COMBO';
        const trueCost = resolvedCosts[p.id];
        const qtySold = agg.qtySold;
        const qtyStaff = agg.qtyStaff;
        const totalQty = qtySold + qtyStaff;
        const revenue = agg.revenue;
        const fcPct = sellingPrice > 0 ? (trueCost / sellingPrice) * 100 : 0;
        const margin = sellingPrice - trueCost;
        const totalCogs = trueCost * totalQty; // Include Staff Meals in usage cost
        const totalMargin = (margin * qtySold) - (trueCost * qtyStaff); // Net margin considering staff cost
        const isHighFC = fcPct > 35 && trueCost > 0;

        // Variance: diff between products.cost (synced BOM) and live BOM calc
        const syncedCost = Number(p.cost || 0);
        const variance = hasBom && syncedCost > 0 ? trueCost - syncedCost : 0;
        const hasVariance = Math.abs(variance) > 0.05 && hasBom && syncedCost > 0;

        return {
          id: p.id,
          name: p.name,
          sellingPrice,
          trueCost,
          hasBom,
          qtySold,
          qtyStaff,
          totalQty,
          revenue,
          fcPct,
          margin,
          totalCogs,
          totalMargin,
          isHighFC,
          hasVariance,
          variance
        };
      });

      // Show all products, but sort sold ones first
      const sorted = processed.sort((a, b) => b.totalQty - a.totalQty);

      const totalRevenue = sorted.reduce((s, m) => s + m.revenue, 0);
      const totalCogs    = sorted.reduce((s, m) => s + m.totalCogs, 0);
      const grossProfit  = totalRevenue - totalCogs;
      const avgFcPct     = totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0;

      setMenuData(sorted);
      setMetrics({
        totalRevenue,
        totalCogs,
        grossProfit,
        avgFcPct,
        highFcCount: sorted.filter(m => m.isHighFC && m.qtySold > 0).length,
        noBomCount: sorted.filter(m => !m.hasBom).length
      });

      // === 8. Fixed costs — ดึงจาก expenses ผ่าน is_fixed_cost flag ของ category ===
      const { data: catDataFC } = await supabase.from('expense_categories').select('name, is_fixed_cost').eq('is_active', true);
      const fixedCostCatNames = (catDataFC || []).filter(c => c.is_fixed_cost).map(c => c.name);

      const { data: monthExpenses } = await supabase.from('expenses')
        .select('amount, category')
        .eq('status', 'approved')
        .gte('created_at', startStr)
        .lte('created_at', endStr);

      const fcExpenses = (monthExpenses || []).filter(e => fixedCostCatNames.includes(e.category));
      
      // Map old fixed cost types to category names for compatibility  
      const laborAmt = fcExpenses.filter(f => /เงินเดือน|ค่าแรง|labor|salary/i.test(f.category)).reduce((s, f) => s + Number(f.amount), 0);
      const rentAmt  = fcExpenses.filter(f => /ค่าเช่า|rent/i.test(f.category)).reduce((s, f) => s + Number(f.amount), 0);
      const utilAmt  = fcExpenses.filter(f => /น้ำ|ไฟ|utility|utilities/i.test(f.category)).reduce((s, f) => s + Number(f.amount), 0);
      // Other fixed costs that don't match specific labels
      const otherFcAmt = fcExpenses.reduce((s, f) => s + Number(f.amount), 0) - laborAmt - rentAmt - utilAmt;

      setFixedCostAmts({ labor: laborAmt, rent: rentAmt, utilities: utilAmt + otherFcAmt });
      const base = totalRevenue > 0 ? totalRevenue : 1;
      setCostStructure({
        foodCost:  totalRevenue > 0 ? (totalCogs / base) * 100 : 0,
        labor:     totalRevenue > 0 ? (laborAmt / base) * 100 : 0,
        rent:      totalRevenue > 0 ? (rentAmt / base) * 100 : 0,
        utilities: totalRevenue > 0 ? ((utilAmt + otherFcAmt) / base) * 100 : 0
      });

    } catch (err) {
      console.error('COGSEngine error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ── Sort & filter ─────────────────────────────────────────────────────────────
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

  const displayData = useMemo(() => {
    let list = menuData.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFC = !filterHighFC || m.isHighFC;
      return matchSearch && matchFC;
    });
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return sortDir === 'asc' ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
    });
  }, [menuData, searchTerm, filterHighFC, sortKey, sortDir]);

  // ── P&L summary ───────────────────────────────────────────────────────────────
  const totalFixed = fixedCostAmts.labor + fixedCostAmts.rent + fixedCostAmts.utilities;
  const netProfit  = metrics.grossProfit - totalFixed;
  const netProfitPct = metrics.totalRevenue > 0 ? (netProfit / metrics.totalRevenue) * 100 : 0;
  const totalCostPct = metrics.totalRevenue > 0 
    ? ((metrics.totalCogs + totalFixed) / metrics.totalRevenue) * 100 : 0;

  const donutSegments = [
    { label: 'COGS',      value: metrics.totalCogs,          color: 'var(--accent-warning)' },
    { label: 'Labor',     value: fixedCostAmts.labor,        color: 'var(--accent-info)' },
    { label: 'Rent',      value: fixedCostAmts.rent,         color: 'var(--accent-purple)' },
    { label: 'Utilities', value: fixedCostAmts.utilities,    color: 'var(--accent-cyan)' },
    { label: 'Net Profit',value: Math.max(0, netProfit),     color: 'var(--accent-success)' }
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>COGS Engine</h3>
          <p className="text-sm text-muted">M8: วิเคราะห์ต้นทุนขาย (BOM Cost, FC%, Variance, P&L)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            รีเฟรช
          </button>
          <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
          <select
            className="form-select"
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            style={{ width: '160px' }}
          >
            <option value="today">วันนี้</option>
            <option value="week">สัปดาห์นี้</option>
            <option value="month">เดือนนี้</option>
          </select>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><DollarSign size={22} /></div>
          <div className="stat-info">
            <h3>฿{fmtB(metrics.totalRevenue)}</h3>
            <p>ยอดขายรวม</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Layers size={22} /></div>
          <div className="stat-info">
            <h3>฿{fmtB(metrics.totalCogs)}</h3>
            <p>COGS รวม</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp size={22} /></div>
          <div className="stat-info">
            <h3 style={{ color: metrics.grossProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
              ฿{fmtB(metrics.grossProfit)}
            </h3>
            <p>กำไรขั้นต้น (Gross Profit)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`stat-icon ${metrics.avgFcPct > 35 ? 'red' : 'green'}`}>
            <PieChart size={22} />
          </div>
          <div className="stat-info">
            <h3 style={{ color: metrics.avgFcPct > 35 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
              {fmtPct(metrics.avgFcPct)}
            </h3>
            <p>FC% เฉลี่ย (เป้า 28-35%)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`stat-icon ${netProfit >= 0 ? 'green' : 'red'}`}>
            <TrendingDown size={22} />
          </div>
          <div className="stat-info">
            <h3 style={{ color: netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
              ฿{fmtB(netProfit)}
            </h3>
            <p>กำไรสุทธิ (Net — หักค่าใช้จ่ายคงที่)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`stat-icon ${metrics.highFcCount > 0 ? 'red' : 'purple'}`}>
            <AlertTriangle size={22} />
          </div>
          <div className="stat-info">
            <h3 style={{ color: metrics.highFcCount > 0 ? 'var(--accent-danger)' : 'inherit' }}>
              {metrics.highFcCount}
            </h3>
            <p>เมนู FC &gt; 35%</p>
          </div>
        </div>
      </div>

      {/* Info Banner: Benchmark Policy */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.05))',
        border: '1px solid rgba(16,185,129,0.2)',
        borderRadius: '12px',
        padding: '10px 16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <AlertCircle size={16} style={{ color: 'var(--accent-success)' }} />
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
          💡 <b>Raw Material Summary:</b> ต้นทุนวัตถุดิบ (COGS) และ Food Cost Benchmark รวมมูลค่าของรายการสวัสดิการพนักงาน (Staff Meal) เพื่อให้เห็นภาพการใช้วัตถุดิบจริงทั้งหมดในคลัง
        </p>
      </div>

      {/* P&L + Cost Stack */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

        {/* P&L Summary Card */}
        <div className="card">
          <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>
            📊 สรุป P&L (Profit & Loss)
          </h4>
          {[
            { label: 'รายได้รวม (Revenue)',          value: metrics.totalRevenue,  color: 'var(--accent-info)', sign: '' },
            { label: '— ต้นทุนวัตถุดิบ (COGS)',       value: -metrics.totalCogs,    color: 'var(--accent-warning)', sign: '' },
            { label: '= กำไรขั้นต้น (Gross Profit)', value: metrics.grossProfit,   color: metrics.grossProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', sign: '', bold: true },
            { label: '— ค่าแรง (Labor)',              value: -fixedCostAmts.labor,  color: 'var(--text-secondary)', sign: '' },
            { label: '— ค่าเช่า (Rent)',               value: -fixedCostAmts.rent,   color: 'var(--text-secondary)', sign: '' },
            { label: '— น้ำไฟ (Utilities)',            value: -fixedCostAmts.utilities, color: 'var(--text-secondary)', sign: '' },
            { label: '= กำไรสุทธิ (Net Profit)',      value: netProfit,             color: netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', sign: '', bold: true }
          ].map((row, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '7px 0',
              borderTop: (i === 2 || i === 6) ? '1px solid var(--border-primary)' : 'none',
              marginTop: (i === 2 || i === 6) ? '4px' : '0',
              fontWeight: row.bold ? 700 : 400,
              fontSize: '13px'
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
              <span style={{ color: row.color, fontWeight: row.bold ? 700 : 600 }}>
                {row.value >= 0 ? '+' : ''}฿{fmtB(Math.abs(row.value))}
                {row.bold && row.value !== 0 && metrics.totalRevenue > 0
                  ? <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.8 }}>
                      ({fmtPct(Math.abs(row.value / metrics.totalRevenue) * 100)})
                    </span>
                  : null}
              </span>
            </div>
          ))}

          {/* Revenue donut bar */}
          {metrics.totalRevenue > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>สัดส่วนต้นทุนจากรายได้</div>
              <MiniDonut segments={donutSegments} />
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                {donutSegments.filter(s => s.value > 0).map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                    {s.label} ({fmtPct((s.value / metrics.totalRevenue) * 100)})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cost Structure Benchmark */}
        <div className="card">
          <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
            🎯 Cost Structure Benchmark
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
            ยอดขาย: ฿{fmtB(metrics.totalRevenue)} — เทียบ % กับ Target อุตสาหกรรมร้านอาหาร
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <BenchmarkBar label="🥩 วัตถุดิบ (Food Cost)" value={costStructure.foodCost} min={28} max={35} />
            <BenchmarkBar label="👷 ค่าแรง (Labor)" value={costStructure.labor} min={20} max={30} />
            <BenchmarkBar label="🏬 ค่าเช่า (Rent)" value={costStructure.rent} min={10} max={20} />
            <BenchmarkBar label="💡 น้ำไฟ (Utilities)" value={costStructure.utilities} min={3} max={7} />
          </div>
          {metrics.totalRevenue === 0 && (
            <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              ยังไม่มียอดขายในช่วงเวลาที่เลือก — ตัวเลขจะปรากฏเมื่อมีการขาย
            </div>
          )}
        </div>
      </div>

      {/* Menu-Level COGS Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600 }}>
            วิเคราะห์ต้นทุนแยกรายเมนู (Menu-level COGS)
          </h4>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {metrics.highFcCount > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
                color: 'var(--accent-danger)', background: 'var(--accent-danger-bg)',
                padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                border: filterHighFC ? '1px solid var(--accent-danger)' : '1px solid transparent'
              }} onClick={() => setFilterHighFC(f => !f)}>
                <AlertCircle size={13} />
                FC &gt; 35%: {metrics.highFcCount} รายการ {filterHighFC ? '(แสดงอยู่)' : '(คลิกกรอง)'}
              </div>
            )}
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
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>เมนู <SortIcon col="name" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('qtySold')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>ขายได้ <SortIcon col="qtySold" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('qtyStaff')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', color: 'var(--accent-info)' }}>พนักงานทาน <SortIcon col="qtyStaff" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('revenue')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>รายได้จริง (฿) <SortIcon col="revenue" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('trueCost')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>ต้นทุน/จาน <SortIcon col="trueCost" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('totalCogs')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>COGS รวม (฿) <SortIcon col="totalCogs" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('fcPct')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>FC% <SortIcon col="fcPct" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('totalMargin')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>กำไรรวม <SortIcon col="totalMargin" /></div>
                </th>
                <th>BOM / สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '48px' }}>
                  <span className="animate-pulse">กำลังคำนวณต้นทุน...</span>
                </td></tr>
              ) : displayData.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  ไม่พบเมนูที่ตรงกับเงื่อนไข
                </td></tr>
              ) : displayData.map(m => (
                <tr key={m.id} style={{ opacity: m.qtySold === 0 ? 0.55 : 1 }}>
                  <td style={{ fontWeight: 600 }}>
                    {m.name}
                    {m.qtySold === 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>(ไม่มียอดขาย)</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: m.qtySold > 0 ? 600 : 400 }}>
                    {m.qtySold > 0 ? m.qtySold : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: m.qtyStaff > 0 ? 600 : 400, color: m.qtyStaff > 0 ? 'var(--accent-info)' : 'inherit' }}>
                    {m.qtyStaff > 0 ? m.qtyStaff : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {m.qtySold > 0 ? `฿${fmtB(m.revenue)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {m.trueCost > 0 ? `฿${fmtB(m.trueCost)}` : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>ไม่มี BOM</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {m.qtySold > 0 && m.totalCogs > 0 ? `฿${fmtB(m.totalCogs)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {m.trueCost > 0 ? (
                      <span style={{
                        color: fcColor(m.fcPct), fontWeight: 700,
                        background: `${fcColor(m.fcPct)}18`,
                        padding: '3px 8px', borderRadius: '10px', fontSize: '12px'
                      }}>
                        {fmtPct(m.fcPct)}
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: m.totalMargin >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                    {m.qtySold > 0 ? `${m.totalMargin >= 0 ? '+' : ''}฿${fmtB(m.totalMargin)}` : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {m.hasBom && <span className="badge badge-success" style={{ fontSize: '11px' }}>✓ มี BOM</span>}
                      {!m.hasBom && <span className="badge badge-ghost" style={{ fontSize: '11px' }}>ไม่มี BOM</span>}
                      {m.isHighFC && m.qtySold > 0 && <span className="badge badge-danger" style={{ fontSize: '11px' }}>FC สูงเกิน!</span>}
                      {m.hasVariance && (
                        <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                          Δ {m.variance > 0 ? '+' : ''}฿{fmtB(m.variance)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Footer totals */}
            {!loading && displayData.length > 0 && metrics.totalRevenue > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
                  <td colSpan="2" style={{ padding: '12px 16px', fontSize: '13px' }}>รวมทั้งหมด</td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '13px' }}>฿{fmtB(displayData.reduce((s, m) => s + m.revenue, 0))}</td>
                  <td></td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '13px', color: 'var(--accent-warning)' }}>
                    ฿{fmtB(displayData.reduce((s, m) => s + m.totalCogs, 0))}
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '13px', color: fcColor(metrics.avgFcPct) }}>
                    {fmtPct(metrics.avgFcPct)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '13px', color: 'var(--accent-success)' }}>
                    +฿{fmtB(displayData.reduce((s, m) => s + m.totalMargin, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {!loading && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>แสดง {displayData.length} จาก {menuData.length} รายการ | เมนูไม่มี BOM: {metrics.noBomCount} รายการ (ใช้ cost จาก products แทน)</span>
            {filterHighFC && <button style={{ fontSize: '12px', color: 'var(--accent-primary)', cursor: 'pointer', background: 'none', border: 'none' }} onClick={() => setFilterHighFC(false)}>ล้างตัวกรอง</button>}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
