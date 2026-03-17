import { useState, useEffect } from 'react';
import { 
  Tags, 
  Search, 
  AlertTriangle,
  CheckCircle,
  Calculator,
  Save
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Integration (M11 — Menu Pricing):
  - menu_items: name, price (selling_price), cost (true_cost)
    → คำนวณ fcPct = cost/price*100, margin = price-cost
  - UPDATE menu_items SET price = newPrice เมื่อ save
*/

export default function MenuPricing() {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [menus, setMenus] = useState([]);
  const [metrics, setMetrics] = useState({ reviewNeeded: 0, optimized: 0 });
  const [showModal, setShowModal] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newPriceToSave, setNewPriceToSave] = useState(null);

  // Pricing Form State
  const [pricingPrefs, setPricingPrefs] = useState({
    targetFC: 30,
    targetCM: 100,
    marketParams: { min: 0 }
  });

  useEffect(() => {
    loadPricingData();
  }, []);

  async function loadPricingData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, price, cost')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const processed = (data || []).map(m => {
        const currentPrice = Number(m.price);
        const currentCogs = Number(m.cost);
        const fcPct = currentPrice > 0 ? (currentCogs / currentPrice) * 100 : 0;
        const margin = currentPrice - currentCogs;

        let status = 'ok';
        if (fcPct > 35) status = 'review_needed'; // High cost footprint
        if (fcPct < 20 && fcPct > 0) status = 'too_high'; // Price might be too high vs cost

        return { ...m, currentPrice, currentCogs, fcPct, margin, status };
      });

      setMenus(processed);
      setMetrics({
        reviewNeeded: processed.filter(m => m.status === 'review_needed').length,
        optimized: processed.filter(m => m.status === 'ok').length
      });

    } catch (err) {
      console.error('MenuPricing load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredMenus = menus.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const openPricingModal = (menu) => {
    setSelectedMenu(menu);
    // Initialize defaults based on current item if needed
    setPricingPrefs({
      targetFC: 30,
      targetCM: Math.max(100, Math.ceil(menu.margin / 10) * 10), // Round up to nearest 10
      marketParams: { min: menu.currentCogs * 1.5 } // just a guess floor
    });
    setShowModal(true);
  };

  const handleSavePrice = async (newPrice) => {
    if (!selectedMenu || !newPrice) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ price: Number(newPrice) })
        .eq('id', selectedMenu.id);
      if (error) throw error;
      alert(`✅ บันทึกราคาใหม่ ฿${newPrice} สำหรับ "${selectedMenu.name}" เรียบร้อยแล้ว`);
      setShowModal(false);
      await loadPricingData(); // reload
    } catch (err) {
      alert(`❌ บันทึกไม่สำเร็จ: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Automated Strategy Calculations
  const calcCostPlus = (cogs, targetFc) => (cogs / (targetFc / 100)).toFixed(0);
  const calcCMTarget = (cogs, targetCm) => (cogs + Number(targetCm)).toFixed(0);
  const calcFloor = (cogs, floor) => Math.max(cogs * 1.5, floor).toFixed(0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Menu Pricing Engine</h3>
          <p className="text-sm text-muted">M11: แนะนำราคาสินค้าตามเป้าหมายกำไร (FC% และ Margin)</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon red">
            <AlertTriangle size={22} />
          </div>
          <div className="stat-info">
            <h3 style={{ color: 'var(--accent-danger)' }}>{metrics.reviewNeeded}</h3>
            <p>เมนูที่ต้นทุนสูงเกิน 35% (ควรปรับราคา)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle size={22} />
          </div>
          <div className="stat-info">
            <h3>{metrics.optimized}</h3>
            <p>เมนูที่ราคาเหมาะสม (FC% 20-35%)</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ marginBottom: '20px' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="ค้นหาเมนู..." 
              style={{ paddingLeft: '36px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>เมนู</th>
                <th style={{ textAlign: 'right' }}>ต้นทุนปัจจุบัน (฿)</th>
                <th style={{ textAlign: 'right' }}>ราคาขายปัจจุบัน (฿)</th>
                <th style={{ textAlign: 'right' }}>Food Cost % ปัจจุบัน</th>
                <th style={{ textAlign: 'right' }}>กำไร (Margin)</th>
                <th>สถานะราคา</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังดึงข้อมูลต้นทุน...</span></td></tr>
              ) : filteredMenus.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ textAlign: 'right' }}>{m.currentCogs.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{m.currentPrice.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: m.status === 'review_needed' ? 'var(--accent-danger)' : m.status === 'too_high' ? 'var(--accent-info)' : 'var(--accent-success)', fontWeight: 600 }}>
                      {m.fcPct.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{m.margin.toFixed(2)}</td>
                  <td>
                    {m.status === 'review_needed' && <span className="badge badge-danger">ต้องปรับราคา (ต้นทุนสูง)</span>}
                    {m.status === 'ok' && <span className="badge badge-success">เหมาะสม</span>}
                    {m.status === 'too_high' && <span className="badge badge-info">ราคาอาจสูงไป</span>}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-ghost" onClick={() => openPricingModal(m)}>
                      <Calculator size={14} /> จำลองราคา
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selectedMenu && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>เครื่องมือวิเคราะห์และตั้งราคา: {selectedMenu.name}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-sm)', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="text-muted" style={{ fontSize: '12px' }}>ต้นทุนปัจจุบัน (COGS)</div>
                  <div style={{ fontSize: '20px', fontWeight: 700 }}>฿{selectedMenu.currentCogs.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '12px' }}>ราคาป้ายปัจจุบัน</div>
                  <div style={{ fontSize: '20px', fontWeight: 700 }}>฿{selectedMenu.currentPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '12px' }}>Current FC%</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: selectedMenu.fcPct > 35 ? 'var(--accent-danger)' : 'var(--accent-success)' }}>
                    {selectedMenu.fcPct.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '12px' }}>กำไรต่อจานปัจจุบัน</div>
                  <div style={{ fontSize: '20px', fontWeight: 700 }}>฿{selectedMenu.margin.toFixed(2)}</div>
                </div>
              </div>

              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>ราคาที่ระบบแนะนำ 3 กลยุทธ์ (อัปเดตตามต้นทุนจริงล่าสุด)</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                
                {/* Strat 1: Cost-Plus */}
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                  <h5 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-info)', marginBottom: '12px' }}>1. รักษาเป้าหมาย FC%</h5>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>กำหนดราคาจาก Food Cost% ที่ต้องการ (เหมาะกับควบคุมสัดส่วน)</p>
                  
                  <div className="form-group">
                    <label className="form-label text-xs">เป้าหมาย FC%</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="number" className="form-input form-input-sm" value={pricingPrefs.targetFC} onChange={e => setPricingPrefs({...pricingPrefs, targetFC: e.target.value})} style={{ width: '80px' }} />
                      <span className="text-muted">%</span>
                    </div>
                  </div>
                  
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)', textAlign: 'center', marginTop: '16px' }}>
                    <div className="text-muted" style={{ fontSize: '11px', marginBottom: '4px' }}>ราคาแนะนำ (Target)</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ฿{calcCostPlus(selectedMenu.currentCogs, pricingPrefs.targetFC)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--accent-success)', marginTop: '4px' }}>
                      Margin: ฿{(Number(calcCostPlus(selectedMenu.currentCogs, pricingPrefs.targetFC)) - selectedMenu.currentCogs).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Strat 2: CM Target */}
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '16px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '16px', background: 'var(--accent-success)', color: 'var(--bg-primary)', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>แนะนำ</div>
                  <h5 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-success)', marginBottom: '12px' }}>2. ล็อกกำไรต่อจาน</h5>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>รับประกันเงินสดเข้ากระเป๋ากี่บาทต่อจาน (Contribution Margin)</p>
                  
                  <div className="form-group">
                    <label className="form-label text-xs">เป้ากำไร/จาน</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <span className="text-muted">฿</span>
                      <input type="number" className="form-input form-input-sm" value={pricingPrefs.targetCM} onChange={e => setPricingPrefs({...pricingPrefs, targetCM: e.target.value})} style={{ width: '80px' }} />
                    </div>
                  </div>
                  
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)', textAlign: 'center', marginTop: '16px' }}>
                    <div className="text-muted" style={{ fontSize: '11px', marginBottom: '4px' }}>ราคาแนะนำ (Premium)</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ฿{calcCMTarget(selectedMenu.currentCogs, pricingPrefs.targetCM)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--accent-warning)', marginTop: '4px' }}>
                      FC: {((selectedMenu.currentCogs / calcCMTarget(selectedMenu.currentCogs, pricingPrefs.targetCM)) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Strat 3: Competitive */}
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                  <h5 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-warning)', marginBottom: '12px' }}>3. แข่งขันในตลาด</h5>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>สู้ราคาคู่แข่ง แต่อย่าต่ำกว่า Floor (ประกันไม่ขาดทุน)</p>
                  
                  <div className="form-group">
                    <label className="form-label text-xs">ราคาตลาด (คู่แข่ง)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="text-muted">฿</span>
                      <input type="number" className="form-input form-input-sm" value={pricingPrefs.marketParams.min} onChange={e => setPricingPrefs({...pricingPrefs, marketParams: { min: e.target.value }})} style={{ width: '80px' }} />
                    </div>
                  </div>
                  
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)', textAlign: 'center', marginTop: '16px' }}>
                    <div className="text-muted" style={{ fontSize: '11px', marginBottom: '4px' }}>ราคาแนะนำ (Floor)</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ฿{calcFloor(selectedMenu.currentCogs, pricingPrefs.marketParams.min)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      (ปลอดภัย +50% markup)
                    </div>
                  </div>
                </div>

              </div>

            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>ปิดหน้าต่าง</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSavePrice(calcCMTarget(selectedMenu.currentCogs, pricingPrefs.targetCM))}>
                <Save size={16} /> {saving ? 'กำลังบันทึก...' : 'อัปเดตราคาใหม่ (POS)'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
