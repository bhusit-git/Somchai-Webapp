import { useState, useEffect, useMemo } from 'react';
import {
  Tags,
  Search,
  AlertTriangle,
  CheckCircle,
  Calculator,
  Save,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  X,
  Zap,
  Target,
  BarChart2,
  DollarSign,
  Percent,
  ArrowRight,
  Info,
  Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Integration (M11 — Menu Pricing Engine):
  - products: id, name, price, cost, is_available
  - UPDATE products SET price = newPrice เมื่อ save
  - ใช้ cost จาก BOM (RecipeManagement sync ไว้แล้ว)
*/

// ─── Utility helpers ──────────────────────────────────────────────────────────
const fmtBaht = (n) =>
  Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const calcCostPlus = (cogs, targetFcPct) =>
  targetFcPct > 0 ? cogs / (targetFcPct / 100) : 0;

const calcCmTarget = (cogs, targetCm) => cogs + Number(targetCm);

const calcFloor = (cogs, marketPrice) => {
  const safeFloor = cogs * 1.5;
  return Math.max(safeFloor, Number(marketPrice) || 0);
};

const calcBreakeven = (fixedCost, sellingPrice, varCost) => {
  const contribution = sellingPrice - varCost;
  return contribution > 0 ? Math.ceil(fixedCost / contribution) : null;
};

const fcColor = (pct) => {
  if (pct > 40) return 'var(--accent-danger)';
  if (pct > 35) return 'var(--accent-warning)';
  if (pct >= 20) return 'var(--accent-success)';
  return 'var(--accent-info)';
};

const statusLabel = (status) => {
  switch (status) {
    case 'review_needed': return { text: 'ต้นทุนสูงเกิน', cls: 'badge-danger' };
    case 'too_low':       return { text: 'ราคาต่ำไป', cls: 'badge-warning' };
    case 'ok':            return { text: 'เหมาะสม', cls: 'badge-success' };
    default:              return { text: 'ไม่มีต้นทุน', cls: 'badge-ghost' };
  }
};

// ─── FC% Bar component ────────────────────────────────────────────────────────
function FcBar({ pct }) {
  const capped = Math.min(pct, 60);
  const color = fcColor(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1, height: '6px', background: 'var(--bg-tertiary)',
        borderRadius: '3px', overflow: 'hidden', minWidth: '80px'
      }}>
        <div style={{
          height: '100%',
          width: `${(capped / 60) * 100}%`,
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease'
        }} />
      </div>
      <span style={{ fontWeight: 700, color, fontSize: '13px', minWidth: '40px' }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Strategy Card component ──────────────────────────────────────────────────
function StrategyCard({ title, subtitle, color, badge, price, fcPct, margin, onApply, isSelected }) {
  return (
    <div style={{
      border: `2px solid ${isSelected ? color : 'var(--border-primary)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '18px',
      background: isSelected ? `${color}10` : 'var(--bg-card)',
      transition: 'all 0.2s ease',
      position: 'relative',
      cursor: 'pointer'
    }} onClick={onApply}>
      {badge && (
        <div style={{
          position: 'absolute', top: '-11px', right: '16px',
          background: color, color: '#fff', fontSize: '10px',
          padding: '2px 10px', borderRadius: '10px', fontWeight: 700
        }}>{badge}</div>
      )}
      {isSelected && (
        <div style={{
          position: 'absolute', top: '12px', left: '12px',
          background: color, color: '#fff',
          width: '20px', height: '20px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Check size={12} />
        </div>
      )}
      <h5 style={{ fontSize: '13px', fontWeight: 700, color, marginBottom: '4px', paddingLeft: isSelected ? '26px' : '0' }}>
        {title}
      </h5>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>{subtitle}</p>

      <div style={{ textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>ราคาแนะนำ</div>
        <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
          ฿{fmtBaht(price)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px', fontSize: '12px' }}>
          <span style={{ color: fcColor(fcPct) }}>FC {fcPct.toFixed(1)}%</span>
          <span style={{ color: 'var(--accent-success)' }}>กำไร ฿{fmtBaht(margin)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function MenuPricing() {
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [menus, setMenus]             = useState([]);
  const [searchTerm, setSearchTerm]   = useState('');
  const [sortKey, setSortKey]         = useState('name');
  const [sortDir, setSortDir]         = useState('asc');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal state
  const [showModal, setShowModal]     = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null); // 'costplus' | 'cm' | 'floor'
  const [customPrice, setCustomPrice] = useState('');

  // Strategy inputs
  const [targetFC, setTargetFC]       = useState(30);
  const [targetCM, setTargetCM]       = useState(80);
  const [marketPrice, setMarketPrice] = useState(0);
  const [fixedCostPerDay, setFixedCostPerDay] = useState(3000);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, cost')
        .eq('is_available', true)
        .order('name');

      if (error) throw error;
      setMenus(processMenus(data || []));
    } catch (err) {
      console.error('MenuPricing load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function processMenus(raw) {
    return raw.map(m => {
      const price  = Number(m.price)  || 0;
      const cost   = Number(m.cost)   || 0;
      const fcPct  = price > 0 ? (cost / price) * 100 : 0;
      const margin = price - cost;

      let status = 'no_cost';
      if (cost > 0) {
        if (fcPct > 35) status = 'review_needed';
        else if (fcPct < 20 && fcPct > 0) status = 'too_low';
        else status = 'ok';
      }

      return { ...m, price, cost, fcPct, margin, status };
    });
  }

  // ── Summary metrics ───────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const withCost = menus.filter(m => m.cost > 0);
    const avgFC = withCost.length > 0
      ? withCost.reduce((s, m) => s + m.fcPct, 0) / withCost.length : 0;
    const avgMargin = withCost.length > 0
      ? withCost.reduce((s, m) => s + m.margin, 0) / withCost.length : 0;
    return {
      total: menus.length,
      reviewNeeded: menus.filter(m => m.status === 'review_needed').length,
      optimized: menus.filter(m => m.status === 'ok').length,
      noCost: menus.filter(m => m.status === 'no_cost').length,
      avgFC,
      avgMargin
    };
  }, [menus]);

  // ── Sorting & filtering ───────────────────────────────────────────────────────
  const sortedFiltered = useMemo(() => {
    let list = menus.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'all' || m.status === filterStatus;
      return matchSearch && matchStatus;
    });

    list = [...list].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [menus, searchTerm, filterStatus, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronUp size={12} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ color: 'var(--accent-primary)' }} />
      : <ChevronDown size={12} style={{ color: 'var(--accent-primary)' }} />;
  }

  // ── Open modal ────────────────────────────────────────────────────────────────
  function openModal(menu) {
    setSelectedMenu(menu);
    setSelectedStrategy(null);
    setCustomPrice(menu.price ? menu.price.toString() : '');
    setTargetFC(30);
    setTargetCM(Math.max(50, Math.round(menu.margin / 10) * 10 || 80));
    setMarketPrice(menu.price || 0);
    setShowModal(true);
  }

  // ── Computed strategy prices ──────────────────────────────────────────────────
  const cogs = selectedMenu?.cost || 0;
  const stratCostPlus = calcCostPlus(cogs, targetFC);
  const stratCm       = calcCmTarget(cogs, targetCM);
  const stratFloor    = calcFloor(cogs, marketPrice);

  const strategyPrice = useMemo(() => {
    if (selectedStrategy === 'costplus') return stratCostPlus;
    if (selectedStrategy === 'cm')       return stratCm;
    if (selectedStrategy === 'floor')    return stratFloor;
    if (selectedStrategy === 'custom')   return Number(customPrice) || 0;
    return 0;
  }, [selectedStrategy, stratCostPlus, stratCm, stratFloor, customPrice]);

  const finalFcPct  = strategyPrice > 0 ? (cogs / strategyPrice) * 100 : 0;
  const finalMargin = strategyPrice - cogs;

  const beBreakeven = useMemo(() => {
    if (!strategyPrice || !cogs || !fixedCostPerDay) return null;
    return calcBreakeven(fixedCostPerDay, strategyPrice, cogs);
  }, [strategyPrice, cogs, fixedCostPerDay]);

  // ── Save price ────────────────────────────────────────────────────────────────
  async function handleSavePrice() {
    if (!selectedMenu || !strategyPrice || strategyPrice <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ price: Number(strategyPrice.toFixed(2)) })
        .eq('id', selectedMenu.id);
      if (error) throw error;

      setMenus(prev => prev.map(m =>
        m.id === selectedMenu.id
          ? { ...m, price: strategyPrice, fcPct: strategyPrice > 0 ? (m.cost / strategyPrice) * 100 : 0, margin: strategyPrice - m.cost }
          : m
      ));
      setShowModal(false);
    } catch (err) {
      alert('❌ บันทึกไม่สำเร็จ: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Sync all (reload) ─────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    await loadData();
    setSyncing(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Menu Pricing Engine</h3>
          <p className="text-sm text-muted">M11: แนะนำราคาสินค้าตาม 3 กลยุทธ์ (FC%, Margin, ตลาด) และวิเคราะห์ Breakeven</p>
        </div>
        <button
          className="btn btn-sm btn-ghost"
          onClick={handleSync}
          disabled={syncing || loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncing ? 'กำลังโหลด...' : 'รีเฟรช'}
        </button>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Tags size={22} /></div>
          <div className="stat-info">
            <h3>{metrics.total}</h3>
            <p>เมนูทั้งหมด</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><AlertTriangle size={22} /></div>
          <div className="stat-info">
            <h3 style={{ color: metrics.reviewNeeded > 0 ? 'var(--accent-danger)' : 'inherit' }}>
              {metrics.reviewNeeded}
            </h3>
            <p>ต้นทุน &gt; 35% (ควรปรับ)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={22} /></div>
          <div className="stat-info">
            <h3>{metrics.optimized}</h3>
            <p>ราคาเหมาะสม</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Percent size={22} /></div>
          <div className="stat-info">
            <h3>{metrics.avgFC.toFixed(1)}%</h3>
            <p>FC% เฉลี่ยร้าน</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><DollarSign size={22} /></div>
          <div className="stat-info">
            <h3>฿{fmtBaht(metrics.avgMargin)}</h3>
            <p>กำไรเฉลี่ย/จาน</p>
          </div>
        </div>
      </div>

      {/* ── Table card ─────────────────────────────────────────────────────── */}
      <div className="card">
        {/* Filters row */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="ค้นหาเมนู..."
              style={{ paddingLeft: '34px' }}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="form-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ width: '200px', flex: '0 0 auto' }}
          >
            <option value="all">ทุกสถานะ ({metrics.total})</option>
            <option value="review_needed">ต้นทุนสูงเกิน ({metrics.reviewNeeded})</option>
            <option value="ok">เหมาะสม ({metrics.optimized})</option>
            <option value="too_low">ราคาต่ำไป</option>
            <option value="no_cost">ยังไม่มีต้นทุน ({metrics.noCost})</option>
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>เมนู <SortIcon col="name" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cost')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>ต้นทุน BOM (฿) <SortIcon col="cost" /></div>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('price')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>ราคาขาย (฿) <SortIcon col="price" /></div>
                </th>
                <th style={{ minWidth: '160px' }}>Food Cost %</th>
                <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('margin')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>กำไร/จาน <SortIcon col="margin" /></div>
                </th>
                <th>สถานะ</th>
                <th style={{ textAlign: 'center' }}>วิเคราะห์</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '48px' }}>
                  <span className="animate-pulse">กำลังดึงข้อมูล...</span>
                </td></tr>
              ) : sortedFiltered.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  ไม่พบเมนูที่ตรงกับเงื่อนไข
                </td></tr>
              ) : sortedFiltered.map(m => {
                const sl = statusLabel(m.status);
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      {m.cost > 0 ? `฿${fmtBaht(m.cost)}` : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>ยังไม่มี BOM</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>฿{fmtBaht(m.price)}</td>
                    <td style={{ minWidth: '160px' }}>
                      {m.cost > 0
                        ? <FcBar pct={m.fcPct} />
                        : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: m.margin >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                      {m.margin >= 0 ? '+' : ''}฿{fmtBaht(m.margin)}
                    </td>
                    <td>
                      <span className={`badge ${sl.cls}`}>{sl.text}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => openModal(m)}>
                        <Calculator size={13} /> จำลอง
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!loading && (
          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
            แสดง {sortedFiltered.length} จาก {menus.length} รายการ
          </div>
        )}
      </div>

      {/* ── FC% Target Legend ────────────────────────────────────────────────── */}
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { color: 'var(--accent-info)',    label: 'FC < 20% — ราคาสูงไป / กำไรดีมาก' },
          { color: 'var(--accent-success)', label: 'FC 20–35% — เหมาะสม' },
          { color: 'var(--accent-warning)', label: 'FC 35–40% — เริ่มสูง ระวัง' },
          { color: 'var(--accent-danger)',  label: 'FC > 40% — ต้นทุนสูงมาก ควรปรับ' }
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            {item.label}
          </div>
        ))}
      </div>

      {/* ── Pricing Simulator Modal ─────────────────────────────────────────── */}
      {showModal && selectedMenu && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '840px', width: '95%' }}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: 'var(--accent-primary-glow)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Calculator size={18} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px' }}>เครื่องมือวิเคราะห์ราคา</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{selectedMenu.name}</p>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div className="modal-body" style={{ padding: '20px 24px' }}>

              {/* Current snapshot */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
                background: 'var(--bg-tertiary)', padding: '16px',
                borderRadius: 'var(--radius-sm)', marginBottom: '24px'
              }}>
                {[
                  { label: 'ต้นทุน BOM', value: `฿${fmtBaht(selectedMenu.cost)}`, sub: '' },
                  { label: 'ราคาขายปัจจุบัน', value: `฿${fmtBaht(selectedMenu.price)}`, sub: '' },
                  { label: 'FC% ปัจจุบัน', value: `${selectedMenu.fcPct.toFixed(1)}%`, color: fcColor(selectedMenu.fcPct) },
                  { label: 'กำไร/จาน ปัจจุบัน', value: `฿${fmtBaht(selectedMenu.margin)}`, color: selectedMenu.margin >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: item.color || 'var(--text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* ── Strategy inputs row */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
                marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)'
              }}>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>🎯 เป้าหมาย FC%</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input type="number" className="form-input" value={targetFC} min={5} max={60} step={1}
                      onChange={e => setTargetFC(Number(e.target.value))} style={{ width: '80px' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>%</span>
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>💰 เป้ากำไร/จาน (CM)</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>฿</span>
                    <input type="number" className="form-input" value={targetCM} min={0}
                      onChange={e => setTargetCM(Number(e.target.value))} style={{ width: '90px' }} />
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>🏪 ราคาตลาด/คู่แข่ง</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>฿</span>
                    <input type="number" className="form-input" value={marketPrice} min={0}
                      onChange={e => setMarketPrice(Number(e.target.value))} style={{ width: '90px' }} />
                  </div>
                </div>
              </div>

              {/* ── Strategy cards (3 cols) */}
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                เลือกกลยุทธ์ราคา (คลิกเพื่อเลือก)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
                <StrategyCard
                  title="1. รักษาเป้าหมาย FC%"
                  subtitle="กำหนดราคาจาก Food Cost% ที่ต้องการ — เหมาะกับควบคุมสัดส่วน"
                  color="var(--accent-info)"
                  price={stratCostPlus}
                  fcPct={stratCostPlus > 0 ? (cogs / stratCostPlus) * 100 : 0}
                  margin={stratCostPlus - cogs}
                  isSelected={selectedStrategy === 'costplus'}
                  onApply={() => setSelectedStrategy(selectedStrategy === 'costplus' ? null : 'costplus')}
                />
                <StrategyCard
                  title="2. ล็อกกำไรต่อจาน"
                  subtitle="รับประกันเงินสดเข้ากระเป๋ากี่บาทต่อจาน (Contribution Margin)"
                  color="var(--accent-success)"
                  badge="แนะนำ"
                  price={stratCm}
                  fcPct={stratCm > 0 ? (cogs / stratCm) * 100 : 0}
                  margin={stratCm - cogs}
                  isSelected={selectedStrategy === 'cm'}
                  onApply={() => setSelectedStrategy(selectedStrategy === 'cm' ? null : 'cm')}
                />
                <StrategyCard
                  title="3. สู้ราคาตลาด"
                  subtitle="ตามราคาคู่แข่ง แต่ไม่ต่ำกว่า Floor (+50% markup เหนือต้นทุน)"
                  color="var(--accent-warning)"
                  price={stratFloor}
                  fcPct={stratFloor > 0 ? (cogs / stratFloor) * 100 : 0}
                  margin={stratFloor - cogs}
                  isSelected={selectedStrategy === 'floor'}
                  onApply={() => setSelectedStrategy(selectedStrategy === 'floor' ? null : 'floor')}
                />
              </div>

              {/* ── Custom price row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 16px', background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)', marginBottom: '20px',
                border: selectedStrategy === 'custom' ? '2px solid var(--accent-purple)' : '2px solid transparent',
                cursor: 'pointer'
              }} onClick={() => setSelectedStrategy('custom')}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: 'rgba(168,85,247,0.1)', color: 'var(--accent-purple)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Zap size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>กำหนดราคาเอง (Custom Price)</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ระบุราคาที่ต้องการโดยตรง</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>฿</span>
                  <input
                    type="number"
                    className="form-input"
                    value={customPrice}
                    min={0}
                    onClick={e => { e.stopPropagation(); setSelectedStrategy('custom'); }}
                    onChange={e => { setCustomPrice(e.target.value); setSelectedStrategy('custom'); }}
                    style={{ width: '100px' }}
                    placeholder="ระบุราคา"
                  />
                </div>
              </div>

              {/* ── Result summary (shows when strategy selected) */}
              {selectedStrategy && strategyPrice > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)', padding: '20px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Target size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>สรุปผลกลยุทธ์ที่เลือก</span>
                    <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {selectedStrategy === 'costplus' ? 'FC% Target' : selectedStrategy === 'cm' ? 'CM Target' : selectedStrategy === 'floor' ? 'Market Floor' : 'Custom'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>ราคาขายใหม่</div>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--accent-primary)' }}>
                        ฿{fmtBaht(strategyPrice)}
                      </div>
                      {selectedMenu.price > 0 && (
                        <div style={{ fontSize: '11px', marginTop: '4px' }}>
                          {strategyPrice > selectedMenu.price
                            ? <span style={{ color: 'var(--accent-success)' }}>▲ +฿{fmtBaht(strategyPrice - selectedMenu.price)}</span>
                            : strategyPrice < selectedMenu.price
                              ? <span style={{ color: 'var(--accent-danger)' }}>▼ -฿{fmtBaht(selectedMenu.price - strategyPrice)}</span>
                              : <span style={{ color: 'var(--text-muted)' }}>ราคาเท่าเดิม</span>
                          }
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>FC% ใหม่</div>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: fcColor(finalFcPct) }}>{finalFcPct.toFixed(1)}%</div>
                      <FcBar pct={finalFcPct} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>กำไรใหม่/จาน</div>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: finalMargin >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                        ฿{fmtBaht(finalMargin)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Breakeven/วัน</div>
                      {beBreakeven !== null ? (
                        <>
                          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--accent-warning)' }}>{beBreakeven}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>จาน/วัน (Fixed ฿{fixedCostPerDay.toLocaleString()})</div>
                        </>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </div>
                  </div>

                  {/* Breakeven fixed cost input */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <BarChart2 size={13} />
                    ต้นทุนคงที่/วัน (Fixed Cost สำหรับ Breakeven):
                    <span>฿</span>
                    <input type="number" className="form-input" value={fixedCostPerDay} min={0} step={100}
                      onChange={e => setFixedCostPerDay(Number(e.target.value))}
                      style={{ width: '100px', fontSize: '12px' }} />
                  </div>
                </div>
              )}

              {/* Info note */}
              <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--accent-info)', padding: '10px 14px', background: 'var(--accent-info-bg)', borderRadius: 'var(--radius-sm)' }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                ต้นทุน (BOM) อัปเดตจากหน้า "สูตรอาหาร" — หากต้นทุนยังเป็น 0 กรุณากำหนด BOM ก่อน
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>ปิด</button>
              <button
                className="btn btn-primary"
                disabled={saving || !selectedStrategy || !strategyPrice || strategyPrice <= 0}
                onClick={handleSavePrice}
                style={{ minWidth: '180px' }}
              >
                <Save size={15} />
                {saving ? 'กำลังบันทึก...' : selectedStrategy && strategyPrice > 0 ? `บันทึกราคา ฿${fmtBaht(strategyPrice)}` : 'เลือกกลยุทธ์ก่อน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .btn-outline {
          background: transparent;
          border: 1px solid var(--accent-primary);
          color: var(--accent-primary);
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 16px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 500;
          transition: all var(--transition-fast);
        }
        .btn-outline:hover { background: var(--accent-primary); color: white; }
        --radius-full: 9999px;
      `}</style>
    </div>
  );
}
