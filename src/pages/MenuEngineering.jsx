import { useState, useEffect } from 'react';
import { 
  Map, 
  Award, 
  HelpCircle, 
  ThumbsDown,
  Calendar
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Integration (M9 — Menu Engineering):
  - menu_items: name, price, cost
  - pos_order_items + pos_orders: qty_sold รายเดือน (filter by created_at)
  - คำนวณ BCG Matrix: popularity = qty_sold, profitability = margin (price-cost)
*/

export default function MenuEngineering() {
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [menus, setMenus] = useState([]);
  const [matrixData, setMatrixData] = useState({
    stars: 0,
    plowHorses: 0,
    puzzles: 0,
    dogs: 0,
    avgQtySold: 0,
    avgMargin: 0
  });

  useEffect(() => {
    loadEngineeringData();
  }, [selectedMonth]);

  async function loadEngineeringData() {
    setLoading(true);
    try {
      // Parse month range
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthStart = `${selectedMonth}-01T00:00:00`;
      const monthEnd = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}T23:59:59`;

      // 1. ดึง menu_items ทั้งหมด (พร้อม price และ cost)
      const { data: menuItems, error: menuErr } = await supabase
        .from('menu_items')
        .select('id, name, price, cost')
        .eq('is_active', true);

      if (menuErr) throw menuErr;
      if (!menuItems || menuItems.length === 0) {
        setMenus([]);
        setMatrixData({ stars: 0, plowHorses: 0, puzzles: 0, dogs: 0, avgQtySold: 0, avgMargin: 0 });
        return;
      }

      // 2. ดึง pos_order_items ที่ join กับ pos_orders เพื่อ filter ตามเดือน
      const { data: orderItems, error: itemErr } = await supabase
        .from('pos_order_items')
        .select('menu_item_id, quantity, pos_orders!inner(created_at, status)')
        .gte('pos_orders.created_at', monthStart)
        .lte('pos_orders.created_at', monthEnd)
        .eq('pos_orders.status', 'completed');

      if (itemErr) {
        // fallback: ถ้า join ไม่ได้ ให้แสดงเมนูแต่ qty = 0
        console.warn('pos_order_items join failed, showing menus with qty=0:', itemErr.message);
      }

      // 3. รวม qty_sold รายเมนู
      const qtySoldMap = {};
      (orderItems || []).forEach(item => {
        const id = item.menu_item_id;
        qtySoldMap[id] = (qtySoldMap[id] || 0) + Number(item.quantity);
      });

      // 4. คำนวณ metrics ต่อเมนู
      const processed = menuItems.map(m => {
        const sellingPrice = Number(m.price);
        const trueCost = Number(m.cost);
        const qtySold = qtySoldMap[m.id] || 0;
        const margin = sellingPrice - trueCost;
        const totalRevenue = sellingPrice * qtySold;
        const totalMargin = margin * qtySold;
        return { ...m, sellingPrice, trueCost, qtySold, margin, totalRevenue, totalMargin };
      });

      // 5. หาค่าเฉลี่ย (thresholds)
      const totalMenus = processed.length;
      const totalQty = processed.reduce((sum, m) => sum + m.qtySold, 0);
      const avgQtySold = totalMenus > 0 ? totalQty / totalMenus : 0;
      const simpleAvgMargin = totalMenus > 0 ? processed.reduce((sum, m) => sum + m.margin, 0) / totalMenus : 0;

      // 6. จัดกลุ่ม BCG
      const classified = processed.map(m => {
        const isPopular = m.qtySold >= avgQtySold;
        const isProfitable = m.margin >= simpleAvgMargin;

        let category = '', action = '', badgeColor = '', icon = null;

        if (isPopular && isProfitable) {
          category = 'Star'; action = 'รักษาคุณภาพ, โปรโมตเป็นเมนูแนะนำ';
          badgeColor = 'var(--accent-success)'; icon = <Award size={14} />;
        } else if (isPopular && !isProfitable) {
          category = 'Plow Horse'; action = 'ลดปริมาณ(Yield) หรือค่อยๆ ปรับขึ้นราคา';
          badgeColor = 'var(--accent-info)'; icon = <Map size={14} />;
        } else if (!isPopular && isProfitable) {
          category = 'Puzzle'; action = 'โปรโมตเพิ่ม, ปรับตำแหน่งในเมนูให้เด่นขึ้น';
          badgeColor = 'var(--accent-warning)'; icon = <HelpCircle size={14} />;
        } else {
          category = 'Dog'; action = 'พิจารณาตัดออกจากเมนู, เลิกทำโปรโมชัน';
          badgeColor = 'var(--accent-danger)'; icon = <ThumbsDown size={14} />;
        }

        return { ...m, category, action, badgeColor, icon, isPopular, isProfitable };
      });

      classified.sort((a, b) => b.totalRevenue - a.totalRevenue);

      setMenus(classified);
      setMatrixData({
        stars: classified.filter(m => m.category === 'Star').length,
        plowHorses: classified.filter(m => m.category === 'Plow Horse').length,
        puzzles: classified.filter(m => m.category === 'Puzzle').length,
        dogs: classified.filter(m => m.category === 'Dog').length,
        avgQtySold,
        avgMargin: simpleAvgMargin
      });

    } catch (err) {
      console.error('MenuEngineering error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Menu Engineering Matrix</h3>
          <p className="text-sm text-muted">M9: วิเคราะห์การทำกำไรและความนิยมรายเมนู</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={18} className="text-muted" />
          <input 
            type="month" 
            className="form-input" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ width: '180px' }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green">
            <Award size={22} />
          </div>
          <div className="stat-info">
            <h3>{matrixData.stars}</h3>
            <p>ดาวรุ่ง (Star) ⭐</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <Map size={22} />
          </div>
          <div className="stat-info">
            <h3>{matrixData.plowHorses}</h3>
            <p>ม้างาน (Plow Horse) 🐎</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <HelpCircle size={22} />
          </div>
          <div className="stat-info">
            <h3>{matrixData.puzzles}</h3>
            <p>ปริศนา (Puzzle) 🧩</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <ThumbsDown size={22} />
          </div>
          <div className="stat-info">
            <h3>{matrixData.dogs}</h3>
            <p>สุนัข (Dog) 🐕</p>
          </div>
        </div>
      </div>

      {/* BCG Matrix Visual */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h4 style={{ fontSize: '15px', fontWeight: 600 }}>Quadrant Analysis (เทียบจากค่าเฉลี่ยร้าน)</h4>
          <p className="text-sm text-muted" style={{ marginTop: '4px' }}>
            ยอดขายเฉลี่ย: {matrixData.avgQtySold.toFixed(0)} จาน/เดือน | กำไรเฉลี่ย: ฿{matrixData.avgMargin.toFixed(2)}/จาน
          </p>
        </div>
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gridTemplateRows: '1fr 1fr', 
            gap: '8px', 
            width: '100%', 
            maxWidth: '600px',
            aspectRatio: '16/9',
            position: 'relative',
            borderLeft: '2px solid var(--border-primary)',
            borderBottom: '2px solid var(--border-primary)',
            padding: '8px 0 0 8px'
          }}>
            {/* Y-Axis Label */}
            <div style={{ position: 'absolute', left: '-40px', top: '50%', transform: 'translateY(-50%) rotate(-90deg)', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
              กำไรต่อจานสูง &rarr;
            </div>
            {/* X-Axis Label */}
            <div style={{ position: 'absolute', bottom: '-30px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
              จำนวนขายสูง &rarr;
            </div>

            {/* Q1: Star (High Profit, High Popularity) - Top Right */}
            <div style={{ background: 'var(--accent-success-bg)', borderRadius: 'var(--radius-sm)', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gridColumn: 2, gridRow: 1 }}>
              <Award size={24} style={{ color: 'var(--accent-success)', marginBottom: '8px' }} />
              <strong style={{ color: 'var(--accent-success)', fontSize: '16px' }}>Star</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>ขายดี + กำไรสูง</span>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>{matrixData.stars}</div>
            </div>

            {/* Q2: Puzzle (High Profit, Low Popularity) - Top Left */}
            <div style={{ background: 'var(--accent-warning-bg)', borderRadius: 'var(--radius-sm)', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gridColumn: 1, gridRow: 1 }}>
              <HelpCircle size={24} style={{ color: 'var(--accent-warning)', marginBottom: '8px' }} />
              <strong style={{ color: 'var(--accent-warning)', fontSize: '16px' }}>Puzzle</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>ขายน้อย + กำไรสูง</span>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>{matrixData.puzzles}</div>
            </div>

            {/* Q3: Dog (Low Profit, Low Popularity) - Bottom Left */}
            <div style={{ background: 'var(--accent-danger-bg)', borderRadius: 'var(--radius-sm)', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gridColumn: 1, gridRow: 2 }}>
              <ThumbsDown size={24} style={{ color: 'var(--accent-danger)', marginBottom: '8px' }} />
              <strong style={{ color: 'var(--accent-danger)', fontSize: '16px' }}>Dog</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>ขายน้อย + กำไรต่ำ</span>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>{matrixData.dogs}</div>
            </div>

            {/* Q4: Plow Horse (Low Profit, High Popularity) - Bottom Right */}
            <div style={{ background: 'var(--accent-info-bg)', borderRadius: 'var(--radius-sm)', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gridColumn: 2, gridRow: 2 }}>
              <Map size={24} style={{ color: 'var(--accent-info)', marginBottom: '8px' }} />
              <strong style={{ color: 'var(--accent-info)', fontSize: '16px' }}>Plow Horse</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>ขายดี + กำไรต่ำ</span>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>{matrixData.plowHorses}</div>
            </div>

          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <h4 style={{ fontSize: '15px', fontWeight: 600 }}>รายการเมนูและข้อเสนอแนะ (Menu Details & Suggested Actions)</h4>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>เมนู</th>
                <th style={{ textAlign: 'right' }}>จำนวนขาย</th>
                <th style={{ textAlign: 'right' }}>กำไรขั้นต้น/จาน</th>
                <th style={{ textAlign: 'center' }}>ประเภท (Matrix)</th>
                <th>คำแนะนำระบบ (Suggested Action)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังวิเคราะห์ข้อมูล...</span></td></tr>
              ) : menus.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>ยังไม่มีข้อมูลเมนูหรือยอดขายในเดือนนี้ — กรุณาเพิ่มเมนูใน Settings</td></tr>
              ) : menus.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ textAlign: 'right', fontWeight: m.isPopular ? 600 : 400 }}>
                    {m.qtySold} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>จาน</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: m.isProfitable ? 600 : 400, color: m.isProfitable ? 'var(--accent-success)' : 'inherit' }}>
                    ฿{m.margin.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span 
                      style={{ 
                        color: m.badgeColor, 
                        background: `${m.badgeColor}20`, 
                        padding: '4px 8px', 
                        borderRadius: 'var(--radius-full)', 
                        fontSize: '12px', 
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {m.icon} {m.category}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {m.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
