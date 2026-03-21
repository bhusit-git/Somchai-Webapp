import { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Trash2,
  Save,
  ChevronRight,
  Package,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/*
  Supabase Schema reference:
  create table menu_item_ingredients (
    id uuid primary key default gen_random_uuid(),
    menu_item_id uuid not null,
    inventory_item_id uuid references inventory_items(id) on delete cascade,
    qty_required numeric not null,
    created_at timestamp with time zone default now()
  );
*/

export default function RecipeManagement() {
  const [menuItems, setMenuItems] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuSearchTerm, setMenuSearchTerm] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [menuRes, invRes] = await Promise.all([
        supabase.from('products').select('*').eq('is_available', true).order('name'),
        supabase.from('inventory_items').select('*').eq('is_active', true).order('name')
      ]);

      setMenuItems(menuRes.data || []);
      setInventoryItems(invRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function selectMenu(menu) {
    setSelectedMenu(menu);
    // load existing BOM for this menu item
    try {
      const { data, error } = await supabase
        .from('menu_item_ingredients')
        .select('*')
        .eq('menu_item_id', menu.id);

      if (error && error.code !== '42P01') console.error(error);

      setIngredients((data || []).map(row => ({
        id: row.id,
        inventory_item_id: row.inventory_item_id,
        qty_required: row.qty_required,
        isExisting: true
      })));
    } catch (err) {
      console.error(err);
      setIngredients([]);
    }
  }

  function addIngredient() {
    setIngredients([
      ...ingredients,
      { id: Date.now().toString(), inventory_item_id: '', qty_required: '', isExisting: false }
    ]);
  }

  function updateIngredient(id, field, value) {
    setIngredients(ingredients.map(ing =>
      ing.id === id ? { ...ing, [field]: value } : ing
    ));
  }

  function removeIngredient(id) {
    setIngredients(ingredients.filter(ing => ing.id !== id));
  }

  async function handleSave() {
    if (!selectedMenu) return;

    // Validate
    for (const ing of ingredients) {
      if (!ing.inventory_item_id || !ing.qty_required || Number(ing.qty_required) <= 0) {
        alert('กรุณาเลือกวัตถุดิบและกรอกปริมาณให้ครบถ้วน');
        return;
      }
    }

    // Check duplicates
    const itemIds = ingredients.map(i => i.inventory_item_id);
    if (new Set(itemIds).size !== itemIds.length) {
      alert('มีวัตถุดิบซ้ำกันในสูตร กรุณาตรวจสอบ');
      return;
    }

    setSaving(true);
    try {
      // Delete old ingredients for this menu
      await supabase
        .from('menu_item_ingredients')
        .delete()
        .eq('menu_item_id', selectedMenu.id);

      // Insert new
      if (ingredients.length > 0) {
        const payload = ingredients.map(ing => ({
          menu_item_id: selectedMenu.id,
          inventory_item_id: ing.inventory_item_id,
          qty_required: Number(ing.qty_required)
        }));

        const { error } = await supabase
          .from('menu_item_ingredients')
          .insert(payload);

        if (error) throw error;
      }

      alert('✅ บันทึกสูตรอาหารเรียบร้อย!');
      // Reload to get fresh IDs
      selectMenu(selectedMenu);
    } catch (err) {
      console.error(err);
      alert('Error saving recipe: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredMenus = menuItems.filter(m =>
    m.name?.toLowerCase().includes(menuSearchTerm.toLowerCase())
  );

  const getInvItem = (id) => inventoryItems.find(i => i.id === id);

  // Summary stats
  const totalMenus = menuItems.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>สูตรอาหาร (Bill of Materials)</h3>
          <p className="text-sm text-muted">M7C: กำหนดวัตถุดิบที่ใช้ในแต่ละเมนู เพื่อตัดสต๊อกอัตโนมัติเมื่อขาย</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">
            <BookOpen size={22} />
          </div>
          <div className="stat-info">
            <h3>{totalMenus}</h3>
            <p>เมนูทั้งหมด</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <Package size={22} />
          </div>
          <div className="stat-info">
            <h3>{inventoryItems.length}</h3>
            <p>วัตถุดิบในคลัง</p>
          </div>
        </div>
      </div>

      {/* Main Content: 2-Panel Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>

        {/* Left Panel: Menu List */}
        <div className="card" style={{ height: 'fit-content', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>เลือกเมนู</h4>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="ค้นหาเมนู..."
                style={{ paddingLeft: '30px', fontSize: '13px' }}
                value={menuSearchTerm}
                onChange={(e) => setMenuSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <span className="animate-pulse">กำลังโหลด...</span>
              </div>
            ) : filteredMenus.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                ไม่พบเมนู — เพิ่มเมนูในตั้งค่าก่อน
              </div>
            ) : (
              filteredMenus.map(menu => (
                <div
                  key={menu.id}
                  onClick={() => selectMenu(menu)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-primary)',
                    background: selectedMenu?.id === menu.id ? 'var(--accent-primary-bg)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background 0.15s',
                    borderLeft: selectedMenu?.id === menu.id ? '3px solid var(--accent-primary)' : '3px solid transparent'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{menu.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>฿{Number(menu.price || 0).toLocaleString()}</div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Ingredient Editor */}
        <div className="card">
          {!selectedMenu ? (
            <div className="empty-state" style={{ padding: '60px 20px' }}>
              <BookOpen size={48} />
              <h3>เลือกเมนูที่ต้องการตั้งสูตร</h3>
              <p>คลิกเมนูทางซ้ายเพื่อเริ่มกำหนดวัตถุดิบ</p>
            </div>
          ) : (
            <>
              <div className="card-header" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 700 }}>{selectedMenu.name}</h4>
                    <p className="text-sm text-muted">ราคาขาย: ฿{Number(selectedMenu.price || 0).toLocaleString()} | กำหนดวัตถุดิบที่ใช้ต่อ 1 เสิร์ฟ</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-sm btn-ghost" onClick={addIngredient}>
                      <Plus size={14} /> เพิ่มวัตถุดิบ
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      <Save size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึกสูตร'}
                    </button>
                  </div>
                </div>
              </div>

              {ingredients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                  <Package size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <p>ยังไม่มีวัตถุดิบในสูตร</p>
                  <p style={{ fontSize: '12px' }}>คลิก "เพิ่มวัตถุดิบ" เพื่อเริ่มกำหนดสูตร</p>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ margin: 0 }}>
                    <thead style={{ background: 'var(--bg-tertiary)' }}>
                      <tr>
                        <th>วัตถุดิบ</th>
                        <th style={{ width: '140px' }}>ปริมาณที่ใช้</th>
                        <th style={{ width: '100px' }}>หน่วย</th>
                        <th style={{ width: '120px' }}>ต้นทุน/เสิร์ฟ</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredients.map(ing => {
                        const invItem = getInvItem(ing.inventory_item_id);
                        const costPerServing = invItem ? (Number(ing.qty_required || 0) * Number(invItem.cost_per_stock_unit || 0)) : 0;

                        return (
                          <tr key={ing.id}>
                            <td>
                              <select
                                className="form-select"
                                value={ing.inventory_item_id}
                                onChange={(e) => updateIngredient(ing.id, 'inventory_item_id', e.target.value)}
                                style={{ fontSize: '13px' }}
                              >
                                <option value="">-- เลือกวัตถุดิบ --</option>
                                {inventoryItems.map(inv => (
                                  <option key={inv.id} value={inv.id}>
                                    {inv.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-input"
                                min="0.01"
                                step="0.01"
                                value={ing.qty_required}
                                onChange={(e) => updateIngredient(ing.id, 'qty_required', e.target.value)}
                                style={{ fontSize: '13px' }}
                              />
                            </td>
                            <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                              {invItem?.stock_unit || '-'}
                            </td>
                            <td style={{ fontSize: '13px', fontWeight: 600, color: costPerServing > 0 ? 'var(--accent-warning)' : 'var(--text-muted)' }}>
                              ฿{costPerServing.toFixed(2)}
                            </td>
                            <td>
                              <button
                                className="btn-icon"
                                style={{ borderColor: 'transparent', color: 'var(--accent-danger)' }}
                                onClick={() => removeIngredient(ing.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary row */}
                  <div style={{
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border-primary)',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '14px'
                  }}>
                    <span style={{ fontWeight: 600 }}>ต้นทุนวัตถุดิบรวม / เสิร์ฟ</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent-warning)', fontSize: '16px' }}>
                      ฿{ingredients.reduce((sum, ing) => {
                        const invItem = getInvItem(ing.inventory_item_id);
                        return sum + (invItem ? Number(ing.qty_required || 0) * Number(invItem.cost_per_stock_unit || 0) : 0);
                      }, 0).toFixed(2)}
                    </span>
                  </div>
                  {/* Food Cost % */}
                  {selectedMenu.price > 0 && (
                    <div style={{
                      padding: '8px 16px',
                      borderTop: '1px solid var(--border-primary)',
                      background: 'var(--bg-tertiary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '13px'
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>Food Cost %</span>
                      {(() => {
                        const totalCost = ingredients.reduce((sum, ing) => {
                          const invItem = getInvItem(ing.inventory_item_id);
                          return sum + (invItem ? Number(ing.qty_required || 0) * Number(invItem.cost_per_stock_unit || 0) : 0);
                        }, 0);
                        const pct = (totalCost / Number(selectedMenu.price)) * 100;
                        const color = pct > 35 ? 'var(--accent-danger)' : pct > 25 ? 'var(--accent-warning)' : 'var(--accent-success)';
                        return (
                          <span style={{ fontWeight: 700, color, fontSize: '14px' }}>
                            {pct.toFixed(1)}%
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Info box */}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px', padding: '12px 16px', background: 'var(--accent-info-bg)', color: 'var(--accent-info)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <strong>เมื่อขายเมนูนี้ผ่านหน้า POS (M3A)</strong> ระบบจะหักสต๊อกวัตถุดิบอัตโนมัติตามปริมาณที่กำหนดไว้ในสูตรนี้
                  <br />วัตถุดิบ 1 ชิ้นสามารถใช้ในหลายเมนูได้ ระบบจะคำนวณแยกแต่ละรายการ
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
