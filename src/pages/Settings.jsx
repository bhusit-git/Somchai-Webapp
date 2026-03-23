import { useState, useEffect, useRef, Fragment } from 'react';
import {
  Users, Building2, Info, Settings as SettingsIcon, Plus, Eye, EyeOff,
  Upload, Save, RefreshCw, Trash2, Edit2, Check, X, Key,
  Phone, MapPin, FileText, Percent, Bell, Tags, Briefcase, UtensilsCrossed
} from 'lucide-react';
import { getUsers, createUser, updateUser, getBranches, createBranch, updateBranch } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const roleLabels = {
  owner: { label: 'เจ้าของ', color: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  manager: { label: 'Area Manager', color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  store_manager: { label: 'ผู้จัดการสาขา', color: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' },
  cook: { label: 'พ่อครัว', color: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
  staff: { label: 'พนักงาน', color: 'bg-gray-500/20 text-gray-300 border border-gray-500/30' },
};

const defaultCompanyInfo = {
  name: 'สมชายหมูปิ้ง',
  addressLine1: '123 ถนนสีลม แขวงสีลม',
  addressLine2: 'เขตบางรัก กรุงเทพมหานคร 10500',
  phone: '02-234-5678',
  taxId: '0123456789012',
  logo: null,
};

const STORAGE_KEY = 'companyInfo';

// Helper to generate a random 6-digit PIN
const genPIN = () => Math.floor(100000 + Math.random() * 900000).toString();

/* ── Per-Day Rate Configuration Component ── */
const DAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const DAY_FULL_LABELS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const WEEKEND_DAYS = new Set([0, 6]); // 0=Sun, 6=Sat

function DayRatesEditor({ baseRate, value, onChange }) {
  // value is an object like { "0": 500, "1": 400, ... } or null/undefined
  const rates = value || {};

  const handleChange = (dayIndex, rawVal) => {
    const updated = { ...rates };
    if (rawVal === '' || rawVal === undefined) {
      delete updated[dayIndex];
    } else {
      updated[dayIndex] = parseFloat(rawVal) || 0;
    }
    onChange(updated);
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <label className="text-slate-400 text-xs mb-2 block">
        🗓️ อัตราค่าจ้างแยกตามวัน (ว่างไว้ = ใช้ค่า Default)
      </label>
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map((day, i) => {
          const isWeekend = WEEKEND_DAYS.has(i);
          const currentRate = rates[i];
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className={`text-xs font-semibold ${isWeekend ? 'text-amber-400' : 'text-slate-400'}`}>
                {day}
              </span>
              <input
                type="number"
                min="0"
                step="50"
                placeholder={baseRate || '—'}
                value={currentRate !== undefined ? currentRate : ''}
                onChange={e => handleChange(i, e.target.value)}
                title={DAY_FULL_LABELS[i]}
                className={`w-full bg-slate-900/60 border rounded-lg p-1.5 text-white text-xs text-center focus:outline-none focus:border-violet-500 ${
                  isWeekend ? 'border-amber-500/40' : 'border-slate-600'
                }`}
              />
            </div>
          );
        })}
      </div>
      <p className="text-slate-500 text-xs mt-1.5">วันเสาร์-อาทิตย์ (ไฮไลต์สีส้ม) สามารถตั้งเรทพิเศษได้</p>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('users');

  const tabs = [
    { id: 'users', label: 'จัดการผู้ใช้งาน', icon: Users },
    { id: 'branches', label: 'จัดการสาขา', icon: Building2 },
    { id: 'products', label: 'เมนูขาย', icon: UtensilsCrossed },
    { id: 'customers', label: 'ลูกค้ารายบุคคล', icon: Briefcase },
    { id: 'company', label: 'ข้อมูลบริษัท', icon: Info },
    { id: 'expense_categories', label: 'หมวดหมู่รายจ่าย', icon: Tags },
    { id: 'system', label: 'ตั้งค่าระบบ', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            ตั้งค่าระบบ
          </h1>
          <p className="text-slate-400 mt-1">จัดการผู้ใช้งาน สาขา ข้อมูลบริษัท และการตั้งค่าต่างๆ</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50 flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                  activeTab === tab.id
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'branches' && <BranchesTab />}
        {activeTab === 'products' && <ProductsTab />}
        {activeTab === 'customers' && <CustomersTab />}
        {activeTab === 'company' && <CompanyInfoTab />}
        {activeTab === 'expense_categories' && <ExpenseCategoriesTab />}
        {activeTab === 'system' && <SystemConfigTab />}
      </div>
    </div>
  );
}

// ============================================================
// TAB 1: Users
// ============================================================
function UsersTab() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [generatedPIN, setGeneratedPIN] = useState(null);
  const [newUser, setNewUser] = useState({ name: '', employee_id: '', role: 'staff', branch_id: user?.branch_id || '', employment_type: 'monthly', base_salary: 0, daily_rate: 0, custom_rates: null });
  const [resetTarget, setResetTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, branchesData] = await Promise.all([
        getUsers(),
        getBranches()
      ]);
      setUsers(usersData || []);
      setBranches(branchesData || []);
      if (!newUser.branch_id && user?.branch_id) {
        setNewUser(prev => ({ ...prev, branch_id: user.branch_id }));
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.branch_id) return;
    try {
      const pin = genPIN();
      setGeneratedPIN(pin);
      
      await createUser({
        name: newUser.name,
        full_name: newUser.name,
        employee_id: newUser.employee_id || null,
        role: newUser.role,
        branch_id: newUser.branch_id,
        employment_type: newUser.employment_type,
        base_salary: parseFloat(newUser.base_salary) || 0,
        daily_rate: parseFloat(newUser.daily_rate) || 0,
        custom_rates: newUser.employment_type === 'daily' && newUser.custom_rates && Object.keys(newUser.custom_rates).length > 0
          ? newUser.custom_rates
          : null,
        pin_hash: pin, // In a real app, hash this before sending
      });
      
      setShowAddForm(false);
      setNewUser({ name: '', employee_id: '', role: 'staff', branch_id: user?.branch_id || '', employment_type: 'monthly', base_salary: 0, daily_rate: 0, custom_rates: null });
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสร้างผู้ใช้งาน');
    }
  };

  const handleToggleActive = async (id, currentActiveStatus) => {
    // In our schema, we don't have an 'active' column yet.
    // For now, let's just log it or add an active column later if needed.
    alert('ระบบนี้ยังไม่รองรับการระงับผู้ใช้งาน (รอตาราง Update)');
  };

  const handleResetPIN = async (user) => {
    try {
      const newPin = genPIN();
      await updateUser(user.id, { pin_hash: newPin });
      setResetTarget({ name: user.name, pin: newPin });
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเปลี่ยน PIN');
    }
  };

  const handleEditUser = async () => {
    if (!editUser.name || !editUser.branch_id) return;
    try {
      await updateUser(editUser.id, {
        name: editUser.name,
        full_name: editUser.name,
        employee_id: editUser.employee_id || null,
        role: editUser.role,
        branch_id: editUser.branch_id,
        employment_type: editUser.employment_type,
        base_salary: parseFloat(editUser.base_salary) || 0,
        daily_rate: parseFloat(editUser.daily_rate) || 0,
        custom_rates: editUser.employment_type === 'daily' && editUser.custom_rates && Object.keys(editUser.custom_rates).length > 0
          ? editUser.custom_rates
          : null,
      });
      setEditUser(null);
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้งาน');
    }
  };

  if (loading) return <div className="text-slate-400 p-8 text-center animate-pulse">กำลังโหลดข้อมูลผู้ใช้งาน...</div>;

  return (
    <div className="space-y-4">
      {/* Generated PIN Banner */}
      {generatedPIN && (
        <div className="bg-green-500/20 border border-green-500/40 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-green-300 font-semibold text-sm">✅ สร้างผู้ใช้งานสำเร็จ!</p>
            <p className="text-white mt-1">PIN ตั้งต้น: <span className="font-mono text-2xl font-bold tracking-widest text-green-300">{generatedPIN}</span></p>
            <p className="text-green-400 text-xs mt-1">แจ้งพนักงานให้เปลี่ยน PIN หลังจาก Login ครั้งแรก</p>
          </div>
          <button onClick={() => setGeneratedPIN(null)} className="text-green-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Reset PIN Banner */}
      {resetTarget && (
        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-amber-300 font-semibold text-sm">🔑 Reset PIN สำหรับ: {resetTarget.name}</p>
            <p className="text-white mt-1">PIN ใหม่: <span className="font-mono text-2xl font-bold tracking-widest text-amber-300">{resetTarget.pin}</span></p>
          </div>
          <button onClick={() => setResetTarget(null)} className="text-amber-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-white text-xl font-semibold">รายชื่อผู้ใช้งาน ({users.length} คน)</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          เพิ่มผู้ใช้งาน
        </button>
      </div>

      {/* Add User Form */}
      {showAddForm && (
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-medium">เพิ่มผู้ใช้งานใหม่</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อ-นามสกุล *</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="กรอกชื่อ..."
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">รหัสพนักงาน (ถ้ามี)</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="เช่น EMP01"
                value={newUser.employee_id}
                onChange={e => setNewUser({ ...newUser, employee_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">สิทธิ์</label>
              <select
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              >
                {Object.entries(roleLabels).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
            </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
              <select
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={newUser.branch_id}
                onChange={e => setNewUser({ ...newUser, branch_id: e.target.value })}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ประเภทการจ้าง</label>
              <select
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={newUser.employment_type}
                onChange={e => setNewUser({ ...newUser, employment_type: e.target.value })}
              >
                <option value="monthly">รายเดือน</option>
                <option value="daily">รายวัน</option>
              </select>
            </div>
            {newUser.employment_type === 'monthly' ? (
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ฐานเงินเดือน (บาท)</label>
                <input
                  type="number"
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  placeholder="เช่น 15000"
                  value={newUser.base_salary}
                  onChange={e => setNewUser({ ...newUser, base_salary: e.target.value })}
                />
              </div>
            ) : (
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-1 block">ค่าจ้างต่อกะ Default (บาท)</label>
                <input
                  type="number"
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  placeholder="เช่น 380"
                  value={newUser.daily_rate}
                  onChange={e => setNewUser({ ...newUser, daily_rate: e.target.value })}
                />
                <DayRatesEditor
                  baseRate={newUser.daily_rate}
                  value={newUser.custom_rates}
                  onChange={rates => setNewUser({ ...newUser, custom_rates: rates })}
                />
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-2">
            <button onClick={handleAddUser} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Check className="w-4 h-4" /> สร้างผู้ใช้ + สร้าง PIN
            </button>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Edit User Form/Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <h3 className="text-white font-medium text-lg">แก้ไขข้อมูลผู้ใช้งาน</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">ชื่อ-นามสกุล *</label>
                  <input
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                    value={editUser.name}
                    onChange={e => setEditUser({ ...editUser, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">รหัสพนักงาน (ถ้ามี)</label>
                  <input
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="เช่น EMP01"
                    value={editUser.employee_id || ''}
                    onChange={e => setEditUser({ ...editUser, employee_id: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">สิทธิ์</label>
                <select
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editUser.role}
                  onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                >
                  {Object.entries(roleLabels).map(([val, { label }]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
                <select
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editUser.branch_id || ''}
                  onChange={e => setEditUser({ ...editUser, branch_id: e.target.value })}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ประเภทการจ้าง</label>
                <select
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editUser.employment_type || 'monthly'}
                  onChange={e => setEditUser({ ...editUser, employment_type: e.target.value })}
                >
                  <option value="monthly">รายเดือน</option>
                  <option value="daily">รายวัน</option>
                </select>
              </div>
              {(!editUser.employment_type || editUser.employment_type === 'monthly') ? (
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">ฐานเงินเดือน (บาท)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="เช่น 15000"
                    value={editUser.base_salary || 0}
                    onChange={e => setEditUser({ ...editUser, base_salary: e.target.value })}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">ค่าจ้างต่อกะ Default (บาท)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="เช่น 380"
                    value={editUser.daily_rate || 0}
                    onChange={e => setEditUser({ ...editUser, daily_rate: e.target.value })}
                  />
                  <DayRatesEditor
                    baseRate={editUser.daily_rate}
                    value={editUser.custom_rates}
                    onChange={rates => setEditUser({ ...editUser, custom_rates: rates })}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button 
                onClick={() => setEditUser(null)} 
                className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleEditUser} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" /> บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4 transition-all hover:border-violet-500/30">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-lg bg-gradient-to-br from-violet-500 to-purple-600">
              {user.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-medium">{user.name}</p>
                {user.employee_id && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-700 text-slate-300 font-mono border border-slate-600">
                    ID: {user.employee_id}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${roleLabels[user.role]?.color || 'bg-gray-500/20 text-gray-300'}`}>
                  {roleLabels[user.role]?.label || user.role}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                  {user.employment_type === 'daily' ? 'รายวัน' : 'รายเดือน'}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1">
                <p className="text-slate-400 text-sm">{user.branches?.name || 'ไม่ระบุสาขา'}</p>
                <span className="text-emerald-400 text-sm font-medium">
                  {user.employment_type === 'daily' 
                    ? `กะละ ฿${Number(user.daily_rate || 0).toLocaleString()}`
                    : `ฐานเดือน ฿${Number(user.base_salary || 0).toLocaleString()}`
                  }
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditUser(user)}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20"
              >
                <Edit2 className="w-3.5 h-3.5" /> แก้ไข
              </button>
              <button
                onClick={() => handleResetPIN(user)}
                className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors border border-amber-500/20"
              >
                <Key className="w-3.5 h-3.5" /> Reset PIN
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB 2: Branches
// ============================================================
function BranchesTab() {
  const [branches, setBranches] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', address: '', code: '' });
  const [loading, setLoading] = useState(true);
  const [editBranch, setEditBranch] = useState(null);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const data = await getBranches();
      setBranches(data || []);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการโหลดสาขา');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newBranch.name) return;
    try {
      await createBranch({ name: newBranch.name, address: newBranch.address, code: newBranch.code });
      setNewBranch({ name: '', address: '', code: '' });
      setShowAdd(false);
      loadBranches();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสร้างสาขา');
    }
  };

  const handleEditBranch = async () => {
    if (!editBranch.name) return;
    try {
      await updateBranch(editBranch.id, { 
        code: editBranch.code, 
        name: editBranch.name, 
        address: editBranch.address 
      });
      setEditBranch(null);
      loadBranches();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการแก้ไขสาขา: ' + err.message);
    }
  };

  if (loading) return <div className="text-slate-400 p-8 text-center animate-pulse">กำลังโหลดข้อมูลสาขา...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-white text-xl font-semibold">รายชื่อสาขา ({branches.length} สาขา)</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มสาขา
        </button>
      </div>

      {showAdd && (
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-medium">เพิ่มสาขาใหม่</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">รหัสสาขาตั้งเอง (Code)</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="เช่น SC001 (ไม่ต้องใส่ก็ได้)"
                value={newBranch.code}
                onChange={e => setNewBranch({ ...newBranch, code: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อสาขา *</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="เช่น สาขา Siam"
                value={newBranch.name}
                onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">ที่อยู่สาขา</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="ที่อยู่..."
                value={newBranch.address}
                onChange={e => setNewBranch({ ...newBranch, address: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAdd} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Check className="w-4 h-4" /> บันทึกสาขา
            </button>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600">ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Edit Branch Form/Modal */}
      {editBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <h3 className="text-white font-medium text-lg">แก้ไขข้อมูลสาขา</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">รหัสสาขาตั้งเอง (Branch Code)</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editBranch.code || ''}
                  onChange={e => setEditBranch({ ...editBranch, code: e.target.value })}
                  placeholder="เช่น SC001"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ชื่อสาขา *</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editBranch.name}
                  onChange={e => setEditBranch({ ...editBranch, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ที่อยู่สาขา</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editBranch.address || ''}
                  onChange={e => setEditBranch({ ...editBranch, address: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button 
                onClick={() => setEditBranch(null)} 
                className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleEditBranch} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" /> บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {branches.map(branch => (
          <div key={branch.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold">{branch.name}</p>
                  {branch.address && (
                    <p className="text-slate-400 text-sm flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" /> {branch.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditBranch(branch)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20"
                >
                  <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB 3: Company Info (linked to payslip)
// ============================================================
function CompanyInfoTab() {
  const [info, setInfo] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : defaultCompanyInfo;
    } catch {
      return defaultCompanyInfo;
    }
  });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setInfo(prev => ({ ...prev, logo: evt.target.result }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-white text-xl font-semibold">ข้อมูลบริษัท / ร้าน</h2>
          <p className="text-slate-400 text-sm mt-0.5">ข้อมูลนี้จะปรากฏบนใบสลิปเงินเดือน</p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {saved ? <><Check className="w-4 h-4" /> บันทึกแล้ว!</> : <><Save className="w-4 h-4" /> บันทึกข้อมูล</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Logo Upload */}
        <div className="md:col-span-1">
          <label className="text-slate-400 text-xs mb-2 block uppercase tracking-wide">โลโก้บริษัท / ร้าน</label>
          <div
            onClick={() => fileRef.current.click()}
            className="aspect-square max-w-[180px] bg-slate-800/70 border-2 border-dashed border-slate-600 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 transition-colors overflow-hidden relative group"
          >
            {info.logo ? (
              <>
                <img src={info.logo} alt="logo" className="w-full h-full object-contain p-2" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <p className="text-white text-xs text-center">คลิกเพื่อเปลี่ยนโลโก้</p>
                </div>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-slate-500 mb-2" />
                <p className="text-slate-500 text-xs text-center px-4">คลิกเพื่ออัปโหลดโลโก้</p>
                <p className="text-slate-600 text-xs mt-1">PNG, JPG, SVG</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          {info.logo && (
            <button
              onClick={() => setInfo(prev => ({ ...prev, logo: null }))}
              className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> ลบโลโก้
            </button>
          )}
        </div>

        {/* Fields */}
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="text-slate-400 text-xs mb-1 block">ชื่อร้าน / บริษัท</label>
            <input
              className="w-full bg-slate-800/70 border border-slate-600 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-violet-500"
              value={info.name}
              onChange={e => setInfo({ ...info, name: e.target.value })}
              placeholder="ชื่อบริษัท..."
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">ที่อยู่ บรรทัดที่ 1</label>
            <input
              className="w-full bg-slate-800/70 border border-slate-600 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-violet-500"
              value={info.addressLine1}
              onChange={e => setInfo({ ...info, addressLine1: e.target.value })}
              placeholder="เลขที่ / ถนน / แขวง..."
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">ที่อยู่ บรรทัดที่ 2</label>
            <input
              className="w-full bg-slate-800/70 border border-slate-600 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-violet-500"
              value={info.addressLine2}
              onChange={e => setInfo({ ...info, addressLine2: e.target.value })}
              placeholder="เขต / จังหวัด / รหัสไปรษณีย์..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> เบอร์โทรศัพท์
              </label>
              <input
                className="w-full bg-slate-800/70 border border-slate-600 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-violet-500"
                value={info.phone}
                onChange={e => setInfo({ ...info, phone: e.target.value })}
                placeholder="02-xxx-xxxx"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> เลขประจำตัวผู้เสียภาษี (Tax ID)
              </label>
              <input
                className="w-full bg-slate-800/70 border border-slate-600 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-violet-500"
                value={info.taxId}
                onChange={e => setInfo({ ...info, taxId: e.target.value })}
                placeholder="13 หลัก"
                maxLength={13}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview Banner */}
      <div className="bg-slate-800/50 border border-violet-500/30 rounded-xl p-4">
        <p className="text-violet-400 text-xs font-semibold mb-3 uppercase tracking-wide">ตัวอย่างบนสลิปเงินเดือน</p>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-slate-700 rounded-lg flex items-center justify-center overflow-hidden border border-slate-600 shrink-0">
            {info.logo
              ? <img src={info.logo} alt="logo preview" className="w-full h-full object-contain p-1" />
              : <span className="text-slate-400 text-2xl font-bold">{info.name?.charAt(0) || '?'}</span>
            }
          </div>
          <div>
            <p className="text-white font-bold text-lg">{info.name || '-'}</p>
            <p className="text-slate-400 text-sm">{info.addressLine1}</p>
            <p className="text-slate-400 text-sm">{info.addressLine2}</p>
            <p className="text-slate-400 text-sm mt-1">โทร: {info.phone} | Tax ID: {info.taxId}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 4: System Config
// ============================================================
function SystemConfigTab() {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('systemConfig');
      return saved ? JSON.parse(saved) : {
        vatPercent: 7,
        gpGrabPercent: 30,
        gpLinemanPercent: 30,
        receiptFooter: 'ขอบคุณที่ใช้บริการ สมชายหมูปิ้ง 🐷',
        lineOAToken: '',
        stockAlertDays: 2,
        dailySalesTarget: 10000,
        targetFcPercent: 35,
        targetGpPercent: 60,
      };
    } catch {
      return {
        vatPercent: 7,
        gpGrabPercent: 30,
        gpLinemanPercent: 30,
        receiptFooter: 'ขอบคุณที่ใช้บริการ สมชายหมูปิ้ง 🐷',
        lineOAToken: '',
        stockAlertDays: 2,
        dailySalesTarget: 10000,
        targetFcPercent: 35,
        targetGpPercent: 60,
      };
    }
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('systemConfig', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-white text-xl font-semibold">ตั้งค่าระบบทั่วไป</h2>
          <p className="text-slate-400 text-sm mt-0.5">ค่าเริ่มต้นที่ระบบนำไปใช้คำนวณ</p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            saved ? 'bg-green-600 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {saved ? <><Check className="w-4 h-4" /> บันทึกแล้ว!</> : <><Save className="w-4 h-4" /> บันทึก</>}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* KPI Targets */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4 md:col-span-2">
          <h3 className="text-white font-medium flex items-center gap-2">🎯 เป้าหมาย KPI สำหรับสาขา</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เป้าหมายยอดขายรายวัน (บาท)</label>
              <input
                type="number"
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={config.dailySalesTarget || ''}
                onChange={e => setConfig({ ...config, dailySalesTarget: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เป้าหมาย Food Cost (%)</label>
              <input
                type="number"
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={config.targetFcPercent || ''}
                onChange={e => setConfig({ ...config, targetFcPercent: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เป้าหมาย Gross Profit (%)</label>
              <input
                type="number"
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={config.targetGpPercent || ''}
                onChange={e => setConfig({ ...config, targetGpPercent: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Finance */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-medium flex items-center gap-2"><Percent className="w-4 h-4 text-violet-400" /> การเงิน</h3>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">
              VAT% (ค่าเริ่มต้น)
              <span className="text-slate-500 text-[10px] ml-2 block">
                *หากร้านไม่ได้จด VAT ให้ใส่ 0
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-24 bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={config.vatPercent}
                onChange={e => setConfig({ ...config, vatPercent: Number(e.target.value) })}
              />
              <span className="text-slate-400 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">
              GP% (Grab)
              <span className="text-slate-500 text-[10px] ml-2 block">
                *เช่น 32.1 (รวม VAT แล้ว)
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                className="w-24 bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={config.gpGrabPercent}
                onChange={e => setConfig({ ...config, gpGrabPercent: Number(e.target.value) })}
              />
              <span className="text-slate-400 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">
              GP% (LineMan)
              <span className="text-slate-500 text-[10px] ml-2 block">
                *เช่น 32.1 (รวม VAT แล้ว)
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                className="w-24 bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={config.gpLinemanPercent}
                onChange={e => setConfig({ ...config, gpLinemanPercent: Number(e.target.value) })}
              />
              <span className="text-slate-400 text-sm">%</span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-medium flex items-center gap-2"><Bell className="w-4 h-4 text-amber-400" /> การแจ้งเตือน</h3>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">แจ้งเตือนสต๊อกเมื่อเหลือ (วัน)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-24 bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={config.stockAlertDays}
                onChange={e => setConfig({ ...config, stockAlertDays: Number(e.target.value) })}
              />
              <span className="text-slate-400 text-sm">วัน</span>
            </div>
          </div>
        </div>

        {/* Receipt Footer */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4 md:col-span-2">
          <h3 className="text-white font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> ใบเสร็จรับเงิน</h3>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">ข้อความท้ายใบเสร็จ</label>
            <textarea
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500 resize-none"
              rows={2}
              value={config.receiptFooter}
              onChange={e => setConfig({ ...config, receiptFooter: e.target.value })}
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Line OA Channel Access Token</label>
            <input
              type="password"
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500 font-mono"
              value={config.lineOAToken}
              onChange={e => setConfig({ ...config, lineOAToken: e.target.value })}
              placeholder="eyJ..."
            />
            <p className="text-slate-500 text-xs mt-1">ใช้สำหรับส่งแจ้งเตือนผ่าน Line Official Account</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 5: Expense Categories
// ============================================================
import { getExpenseCategories, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory } from '../services/expenseService';

function ExpenseCategoriesTab() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', branch_id: user?.branch_id || '', is_admin_only: false });
  const [editCat, setEditCat] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catsRes, branchesRes] = await Promise.all([
        getExpenseCategories(),
        import('../services/authService').then(m => m.getBranches())
      ]);
      setCategories(catsRes || []);
      setBranches(branchesRes || []);
      if (!newCat.branch_id && user?.branch_id) {
        setNewCat(prev => ({ ...prev, branch_id: user.branch_id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newCat.name || !newCat.branch_id) return;
    try {
      await createExpenseCategory({ name: newCat.name, branch_id: newCat.branch_id, is_admin_only: newCat.is_admin_only });
      setNewCat(prev => ({ ...prev, name: '', branch_id: user?.branch_id || '', is_admin_only: false }));
      setShowAdd(false);
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสร้างหมวดหมู่');
    }
  };

  const handleEdit = async () => {
    if (!editCat.name) return;
    try {
      await updateExpenseCategory(editCat.id, { name: editCat.name, branch_id: editCat.branch_id, is_admin_only: editCat.is_admin_only });
      setEditCat(null);
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการอัปเดตหมวดหมู่');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันการลบหมวดหมู่นี้?')) return;
    try {
      await deleteExpenseCategory(id);
      loadData();
    } catch (err) {
      alert('ไม่สามารถลบหมวดหมู่ได้ (อาจมีการถูกอ้างอิงอยู่)');
    }
  };

  if (loading) return <div className="text-slate-400 p-8 text-center animate-pulse">กำลังโหลดหมวดหมู่รายจ่าย...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-white text-xl font-semibold">จัดการหมวดหมู่รายจ่าย ({categories.length})</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มหมวดหมู่
        </button>
      </div>

      {showAdd && (
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-medium">เพิ่มหมวดหมู่รายจ่าย</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อหมวดหมู่ *</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="เช่น ค่าแรง, ค่าไฟ..."
                value={newCat.name}
                onChange={e => setNewCat({ ...newCat, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
              <select
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={newCat.branch_id}
                onChange={e => setNewCat({ ...newCat, branch_id: e.target.value })}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                id="is_admin_only_new" 
                className="w-4 h-4 rounded border-slate-600 bg-slate-900/60"
                checked={newCat.is_admin_only || false} 
                onChange={e => setNewCat({ ...newCat, is_admin_only: e.target.checked })} 
              />
              <label htmlFor="is_admin_only_new" className="text-slate-300 text-sm">แสดงเฉพาะผู้บริหาร (ซ่อนจากพนักงานทั่วไป)</label>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAdd} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Check className="w-4 h-4" /> บันทึกหมวดหมู่
            </button>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600">ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <h3 className="text-white font-medium text-lg">แก้ไขหมวดหมู่รายจ่าย</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ชื่อหมวดหมู่ *</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCat.name}
                  onChange={e => setEditCat({ ...editCat, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
                <select
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCat.branch_id || ''}
                  onChange={e => setEditCat({ ...editCat, branch_id: e.target.value })}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input 
                  type="checkbox" 
                  id="is_admin_only_edit" 
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900/60"
                  checked={editCat.is_admin_only || false} 
                  onChange={e => setEditCat({ ...editCat, is_admin_only: e.target.checked })} 
                />
                <label htmlFor="is_admin_only_edit" className="text-slate-300 text-sm">แสดงเฉพาะผู้บริหาร (ซ่อนจากพนักงานทั่วไป)</label>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button 
                onClick={() => setEditCat(null)} 
                className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleEdit} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" /> บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {categories.map(cat => (
          <div key={cat.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Tags className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold flex items-center gap-2">
                    {cat.name}
                    {cat.is_admin_only && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">ผู้บริหารเท่านั้น</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditCat(cat)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20"
                >
                  <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors border border-red-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบ
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB 6: Customers
// ============================================================
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../services/customerService';

function CustomersTab() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', company: '', phone: '', tax_id: '', ar_reminder_days: 30, branch_id: user?.branch_id || '' });
  const [editCustomer, setEditCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [custRes, branchesRes] = await Promise.all([
        getCustomers(),
        import('../services/authService').then(m => m.getBranches())
      ]);
      setCustomers(custRes || []);
      setBranches(branchesRes || []);
      if (!newCustomer.branch_id && user?.branch_id) {
        setNewCustomer(prev => ({ ...prev, branch_id: user.branch_id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newCustomer.name || !newCustomer.branch_id) return;
    try {
      await createCustomer({
        name: newCustomer.name,
        company: newCustomer.company,
        phone: newCustomer.phone,
        tax_id: newCustomer.tax_id,
        ar_reminder_days: parseInt(newCustomer.ar_reminder_days) || 30,
        branch_id: newCustomer.branch_id
      });
      setNewCustomer(prev => ({ ...prev, name: '', company: '', phone: '', tax_id: '', ar_reminder_days: 30, branch_id: user?.branch_id || '' }));
      setShowAdd(false);
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสร้างลูกค้า');
    }
  };

  const handleEdit = async () => {
    if (!editCustomer.name || !editCustomer.branch_id) return;
    try {
      await updateCustomer(editCustomer.id, {
        name: editCustomer.name,
        company: editCustomer.company,
        phone: editCustomer.phone,
        tax_id: editCustomer.tax_id,
        ar_reminder_days: parseInt(editCustomer.ar_reminder_days) || 30,
        branch_id: editCustomer.branch_id
      });
      setEditCustomer(null);
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการอัปเดตลูกค้า');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันการลบลูกค้านี้?')) return;
    try {
      await deleteCustomer(id);
      loadData();
    } catch (err) {
      alert('ไม่สามารถลบลูกค้าได้ (อาจมีข้อมูลค้างอยู่)');
    }
  };

  if (loading) return <div className="text-slate-400 p-8 text-center animate-pulse">กำลังโหลดข้อมูลลูกค้า...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-white text-xl font-semibold">ลูกค้ารายบุคคล ({customers.length})</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มลูกค้า
        </button>
      </div>

      {showAdd && (
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-medium">เพิ่มลูกค้าใหม่</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อลูกค้า *</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="ชื่อ..."
                value={newCustomer.name}
                onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อบริษัท (ถ้ามี)</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="บริษัท..."
                value={newCustomer.company}
                onChange={e => setNewCustomer({ ...newCustomer, company: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เบอร์โทร</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="เบอร์โทร..."
                value={newCustomer.phone}
                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">รหัสผู้เสียภาษี</label>
              <input
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="13 หลัก..."
                value={newCustomer.tax_id}
                onChange={e => setNewCustomer({ ...newCustomer, tax_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block text-amber-400">แจ้งเตือน AR ค้างชำระ (วัน)</label>
              <input
                type="number"
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={newCustomer.ar_reminder_days}
                onChange={e => setNewCustomer({ ...newCustomer, ar_reminder_days: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
              <select
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                value={newCustomer.branch_id}
                onChange={e => setNewCustomer({ ...newCustomer, branch_id: e.target.value })}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Check className="w-4 h-4" /> บันทึกลูกค้า
            </button>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600">ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <h3 className="text-white font-medium text-lg">แก้ไขข้อมูลลูกค้า</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-1 block">ชื่อลูกค้า *</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCustomer.name}
                  onChange={e => setEditCustomer({ ...editCustomer, name: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-1 block">ชื่อบริษัท (ถ้ามี)</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCustomer.company || ''}
                  onChange={e => setEditCustomer({ ...editCustomer, company: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">เบอร์โทร</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCustomer.phone || ''}
                  onChange={e => setEditCustomer({ ...editCustomer, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">รหัสผู้เสียภาษี</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCustomer.tax_id || ''}
                  onChange={e => setEditCustomer({ ...editCustomer, tax_id: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block text-amber-400">แจ้งเตือน AR ค้างชำระ (วัน)</label>
                <input
                  type="number"
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCustomer.ar_reminder_days}
                  onChange={e => setEditCustomer({ ...editCustomer, ar_reminder_days: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
                <select
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  value={editCustomer.branch_id || ''}
                  onChange={e => setEditCustomer({ ...editCustomer, branch_id: e.target.value })}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button 
                onClick={() => setEditCustomer(null)} 
                className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleEdit} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" /> บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {customers.map(cust => (
          <div key={cust.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold">{cust.name} {cust.company ? `(${cust.company})` : ''}</p>
                  <p className="text-slate-400 text-sm flex items-center gap-2 mt-0.5">
                    {cust.phone && <><Phone className="w-3.5 h-3.5" /> {cust.phone}</>}
                    {cust.tax_id && <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">Tax ID: {cust.tax_id}</span>}
                    <span className="text-amber-400 text-xs bg-amber-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                      <Bell className="w-3 h-3" /> {cust.ar_reminder_days} วัน
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditCustomer(cust)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20"
                >
                  <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                </button>
                <button
                  onClick={() => handleDelete(cust.id)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors border border-red-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบ
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB 7: Products & Categories (เมนูขาย)
// ============================================================

function ProductsTab() {
  const [categories, setCategories]   = useState([]);
  const [products, setProducts]       = useState([]);
  const [bomCosts, setBomCosts]       = useState({}); // { product_id: calculatedCost }
  const [loading, setLoading]         = useState(true);

  // Category state
  const [showAddCat, setShowAddCat]   = useState(false);
  const [newCat, setNewCat]           = useState({ name: '' });
  const [editCat, setEditCat]         = useState(null);

  // Product state
  const [showAddProd, setShowAddProd] = useState(false);
  const [newProd, setNewProd]         = useState({ name: '', price: '', category_id: '', is_available: true, sort_order: 0 });
  const [editProd, setEditProd]       = useState(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [imgPreview, setImgPreview]   = useState(null); // for new product
  const [imgFile, setImgFile]         = useState(null);
  const [editImgFile, setEditImgFile] = useState(null);
  const [editImgPreview, setEditImgPreview] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, prodRes, bomRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*, categories(name)').order('sort_order'),
        supabase.from('menu_item_ingredients')
          .select('menu_item_id, qty_required, inventory_items(cost_per_stock_unit, yield_pct)'),
      ]);
      setCategories(catRes.data || []);

      // Calculate BOM cost per product
      const costMap = {};
      (bomRes.data || []).forEach(row => {
        const inv = row.inventory_items;
        if (!inv) return;
        const trueCost = (Number(inv.cost_per_stock_unit) / (Number(inv.yield_pct || 100) / 100));
        const lineCost = Number(row.qty_required) * trueCost;
        costMap[row.menu_item_id] = (costMap[row.menu_item_id] || 0) + lineCost;
      });
      setBomCosts(costMap);

      // Sync calculated BOM cost → products.cost
      const prods = prodRes.data || [];
      const updates = prods.filter(p => costMap[p.id] !== undefined && Math.abs((costMap[p.id] || 0) - Number(p.cost || 0)) > 0.01);
      for (const p of updates) {
        await supabase.from('products').update({ cost: parseFloat(costMap[p.id].toFixed(2)) }).eq('id', p.id);
      }

      setProducts(prods.map(p => costMap[p.id] !== undefined ? { ...p, cost: parseFloat((costMap[p.id]).toFixed(2)) } : p));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // --- Image Upload Helper ---
  const uploadImage = async (file, productId) => {
    const ext = file.name.split('.').pop();
    const path = `${productId}.${ext}`;
    const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(path);
    return urlData.publicUrl;
  };

  // --- Category CRUD ---
  const handleAddCat = async () => {
    if (!newCat.name.trim()) return;
    const { error } = await supabase.from('categories').insert({ name: newCat.name.trim(), is_active: true });
    if (error) { alert('ไม่สามารถเพิ่มหมวดหมู่ได้'); return; }
    setNewCat({ name: '' }); setShowAddCat(false); loadData();
  };

  const handleEditCat = async () => {
    if (!editCat?.name?.trim()) return;
    const { error } = await supabase.from('categories').update({ name: editCat.name.trim() }).eq('id', editCat.id);
    if (error) { alert('ไม่สามารถแก้ไขหมวดหมู่ได้'); return; }
    setEditCat(null); loadData();
  };

  const handleDeleteCat = async (id) => {
    if (!confirm('ลบหมวดหมู่นี้? เมนูในหมวดนี้จะไม่มีหมวดหมู่')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { alert('ไม่สามารถลบหมวดหมู่ได้ (อาจมีเมนูอ้างอิงอยู่)'); return; }
    loadData();
  };

  // --- Product CRUD ---
  const handleAddProd = async () => {
    if (!newProd.name.trim() || !newProd.price) return;
    setUploadingImg(true);
    try {
      const { data: inserted, error } = await supabase.from('products').insert({
        name: newProd.name.trim(),
        price: parseFloat(newProd.price),
        cost: 0,
        category_id: newProd.category_id || null,
        is_available: newProd.is_available,
        sort_order: parseInt(newProd.sort_order) || 0,
      }).select().single();
      if (error) { alert('ไม่สามารถเพิ่มเมนูได้: ' + error.message); return; }

      if (imgFile && inserted?.id) {
        const url = await uploadImage(imgFile, inserted.id);
        await supabase.from('products').update({ image_url: url }).eq('id', inserted.id);
      }
      setNewProd({ name: '', price: '', category_id: '', is_available: true, sort_order: 0 });
      setImgFile(null); setImgPreview(null);
      setShowAddProd(false); loadData();
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
    finally { setUploadingImg(false); }
  };

  const handleEditProd = async () => {
    if (!editProd?.name?.trim() || !editProd?.price) return;
    setUploadingImg(true);
    try {
      let image_url = editProd.image_url;
      if (editImgFile) {
        image_url = await uploadImage(editImgFile, editProd.id);
      }
      const { error } = await supabase.from('products').update({
        name: editProd.name.trim(),
        price: parseFloat(editProd.price),
        category_id: editProd.category_id || null,
        is_available: editProd.is_available,
        sort_order: parseInt(editProd.sort_order) || 0,
        image_url,
      }).eq('id', editProd.id);
      if (error) { alert('ไม่สามารถแก้ไขเมนูได้'); return; }
      setEditProd(null); setEditImgFile(null); setEditImgPreview(null); loadData();
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
    finally { setUploadingImg(false); }
  };

  const handleDeleteProd = async (id) => {
    if (!confirm('ลบเมนูนี้?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { alert('ไม่สามารถลบเมนูได้'); return; }
    loadData();
  };

  const toggleAvailable = async (prod) => {
    await supabase.from('products').update({ is_available: !prod.is_available }).eq('id', prod.id);
    loadData();
  };

  const onImgChange = (e, forEdit) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (forEdit) { setEditImgFile(file); setEditImgPreview(url); }
    else { setImgFile(file); setImgPreview(url); }
  };

  if (loading) return <div className="text-slate-400 p-8 text-center animate-pulse">กำลังโหลดเมนูขาย...</div>;

  const inputCls = 'w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-violet-500';

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-white text-xl font-bold">จัดการเมนูขาย</h2>
      </div>

      {/* ═══ Section: Categories ═══ */}
      <div className="bg-[#1f2937] border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-[#1f2937]">
          <h3 className="text-white font-medium text-sm">หมวดหมู่ ({categories.length})</h3>
          <button onClick={() => setShowAddCat(!showAddCat)}
            className="flex items-center justify-center bg-[#3b82f6] hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
            เพิ่ม
          </button>
        </div>

        <div className="p-4 bg-[#111827]">
          {showAddCat && (
            <div className="bg-slate-800/70 border border-blue-500/30 rounded-xl p-3 mb-4 flex gap-2 w-full max-w-sm">
              <input className={inputCls} placeholder="ชื่อหมวดหมู่..." value={newCat.name}
                onKeyDown={e => e.key === 'Enter' && handleAddCat()}
                onChange={e => setNewCat({ name: e.target.value })} autoFocus />
              <button onClick={handleAddCat} className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg text-xs font-medium shrink-0">บันทึก</button>
              <button onClick={() => setShowAddCat(false)} className="text-slate-400 hover:text-white px-3 py-2 rounded-lg text-xs border border-slate-600 shrink-0">ยกเลิก</button>
            </div>
          )}

          {categories.length === 0 ? (
            <p className="text-slate-500 text-xs">ยังไม่มีหมวดหมู่</p>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3 flex items-center justify-between shadow-sm">
                  <span className="text-slate-300 text-sm font-medium">{cat.name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setEditCat({ ...cat })} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 p-1.5 rounded transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteCat(cat.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section: Products ═══ */}
      <div className="bg-[#1f2937] border border-slate-700/50 rounded-xl overflow-hidden mt-6 shadow-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-[#1f2937]">
          <h3 className="text-white font-medium text-base">รายการเมนู ({products.length})</h3>
          <button onClick={() => setShowAddProd(!showAddProd)}
            className="flex items-center justify-center bg-[#3b82f6] hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-sm">
            เพิ่มเมนูใหม่
          </button>
        </div>

        <div className="p-4 bg-[#111827]">
          {showAddProd && (
            <div className="bg-slate-800 border border-blue-500/30 rounded-xl p-5 mb-6 space-y-4 shadow-inner">
              <h4 className="text-white font-medium mb-2 border-b border-slate-700 pb-2">เพิ่มเมนูขาย</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="text-slate-400 text-xs mb-1.5 block">ชื่อเมนู *</label>
                  <input className={inputCls} placeholder="เช่น หมูปิ้ง 5 ไม้" value={newProd.name}
                    onChange={e => setNewProd({ ...newProd, name: e.target.value })} />
                </div>
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
                  <label className="text-slate-400 text-xs mb-1.5 block">ราคาขาย (บาท) *</label>
                  <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00"
                    value={newProd.price} onChange={e => setNewProd({ ...newProd, price: e.target.value })} />
                </div>
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
                  <label className="text-slate-400 text-xs mb-1.5 block">หมวดหมู่</label>
                  <select className={inputCls} value={newProd.category_id}
                    onChange={e => setNewProd({ ...newProd, category_id: e.target.value })}>
                    <option value="">-- ไม่ระบุ --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
                  <label className="text-slate-400 text-xs mb-1.5 block">ลำดับ</label>
                  <input type="number" className={inputCls} placeholder="0"
                    value={newProd.sort_order} onChange={e => setNewProd({ ...newProd, sort_order: e.target.value })} />
                </div>
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
                  <label className="text-slate-400 text-xs mb-1.5 block">รูปภาพเมนู</label>
                  <label className="flex items-center justify-center gap-2 cursor-pointer w-full bg-slate-800 border-2 border-dashed border-slate-600 rounded-lg p-3 text-slate-400 text-sm hover:border-blue-500 hover:text-blue-400 transition-colors">
                    <Upload className="w-5 h-5 shrink-0" />
                    <span className="truncate max-w-[150px]">{imgFile ? imgFile.name : 'อัปโหลดรูปภาพ...'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => onImgChange(e, false)} />
                  </label>
                  {imgPreview && <div className="mt-3 flex justify-center"><img src={imgPreview} className="w-24 h-24 object-cover rounded-xl border border-blue-500/40 shadow-sm" alt="preview" /></div>}
                </div>
                <div className="flex items-center gap-2 md:col-span-2 mt-2 bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
                  <input type="checkbox" id="avail_new" checked={newProd.is_available}
                    onChange={e => setNewProd({ ...newProd, is_available: e.target.checked })} className="w-4 h-4 rounded" />
                  <label htmlFor="avail_new" className="text-slate-300 text-sm cursor-pointer select-none">สวิตช์เปิด/ปิดขาย (ให้แสดงใน POS)</label>
                </div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 mt-4">
                💡 <strong>เคล็ดลับ:</strong> ต้นทุนจะคำนวณอัตโนมัติจากตาราง BOM+WAC — หากต้องการตั้งต้นทุนให้ไปตั้งสูตรที่หน้า <strong>สูตรอาหาร (M7C)</strong>
              </div>
              <div className="flex gap-3 mt-4 justify-end pt-2 border-t border-slate-700/50">
                <button onClick={() => { setShowAddProd(false); setImgFile(null); setImgPreview(null); }}
                  className="text-slate-400 hover:text-white px-5 py-2.5 rounded-lg text-sm border border-slate-600 transition-colors">ยกเลิก</button>
                <button onClick={handleAddProd} disabled={uploadingImg}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-md transition-colors">
                  <Check className="w-4 h-4" /> {uploadingImg ? 'กำลังบันทึก...' : 'บันทึกเมนูใหม่'}
                </button>
              </div>
            </div>
          )}

          {products.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-6">ยังไม่มีเมนูขาย</p>
          ) : (
            <div className="space-y-3">
              {products.map((prod) => {
                const calc = bomCosts[prod.id];
                let costText = '';
                if (calc !== undefined) {
                  const pct = prod.price > 0 ? ((calc / prod.price) * 100).toFixed(0) : 0;
                  costText = `ต้นทุน ฿${calc.toFixed(2)} \u00A0 ${pct}% (จาก BOM)`;
                }

                return (
                  <div key={prod.id} className={`bg-slate-800/60 border border-slate-700/50 rounded-lg p-4 flex items-center justify-between shadow-sm transition-all hover:bg-slate-800/80 ${!prod.is_available ? 'opacity-60 grayscale-[30%]' : ''}`}>
                    <div className="min-w-0 flex items-center gap-4">
                      {prod.image_url ? (
                        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-600/50 bg-slate-900/50">
                          <img src={prod.image_url} className="w-full h-full object-cover" alt={prod.name} />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0 bg-slate-700/50 border border-slate-600/50">
                           <UtensilsCrossed className="w-6 h-6 text-slate-500" />
                        </div>
                      )}
                      <div>
                        <p className="text-slate-200 text-base font-semibold truncate">{prod.name}</p>
                        <p className="text-slate-400 text-xs mt-1.5 flex flex-wrap items-center gap-3">
                          <span className="text-green-400 font-medium bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20">฿{Number(prod.price).toLocaleString()}</span>
                          {costText && <span className="bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-700">{costText}</span>}
                          {!prod.is_available && <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20 uppercase tracking-wide text-[10px] font-bold">ปิดขายชั่วคราว</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end shrink-0 pl-4 border-l border-slate-700/50 ml-4 py-1">
                      <button onClick={() => toggleAvailable(prod)} title={prod.is_available ? 'ปิดขาย' : 'เปิดขาย'} className={`p-2 rounded-lg transition-colors border ${prod.is_available ? 'text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20' : 'text-slate-400 border-slate-700 bg-slate-800 hover:bg-slate-700'}`}>
                        {prod.is_available ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { setEditProd(prod); setEditImgPreview(null); setEditImgFile(null); }} className="text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 p-2 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteProd(prod.id)} className="text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 p-2 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Product Modal */}
      {editProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-semibold text-lg">แก้ไขเมนู</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-1 block">ชื่อเมนู *</label>
                <input className={inputCls} value={editProd.name} onChange={e => setEditProd({ ...editProd, name: e.target.value })} />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ราคาขาย (บาท) *</label>
                <input type="number" min="0" step="0.01" className={inputCls} value={editProd.price}
                  onChange={e => setEditProd({ ...editProd, price: e.target.value })} />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">หมวดหมู่</label>
                <select className={inputCls} value={editProd.category_id || ''}
                  onChange={e => setEditProd({ ...editProd, category_id: e.target.value })}>
                  <option value="">-- ไม่ระบุ --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ลำดับ (sort)</label>
                <input type="number" className={inputCls} value={editProd.sort_order ?? 0}
                  onChange={e => setEditProd({ ...editProd, sort_order: e.target.value })} />
              </div>
              {/* Cost (read-only) */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ต้นทุน (จาก BOM+WAC)</label>
                <div className={`${inputCls} bg-slate-900/30 text-amber-400 cursor-default`}>
                  {bomCosts[editProd.id] !== undefined
                    ? `฿${bomCosts[editProd.id].toFixed(2)} (คำนวณอัตโนมัติ)`
                    : 'ยังไม่ได้ตั้ง BOM → ไปหน้า สูตรอาหาร (M7C)'
                  }
                </div>
              </div>
              {/* Image Upload */}
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-2 block">รูปภาพเมนู</label>
                <div className="flex items-center gap-4">
                  {(editImgPreview || editProd.image_url) && (
                    <img src={editImgPreview || editProd.image_url} className="w-16 h-16 rounded-xl object-cover border border-slate-600" alt="preview" />
                  )}
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-slate-400 text-sm hover:border-violet-500 transition-colors">
                    <Upload className="w-4 h-4" />
                    {editImgFile ? editImgFile.name : 'เปลี่ยนรูป...'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => onImgChange(e, true)} />
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <input type="checkbox" id="avail_edit" checked={editProd.is_available}
                  onChange={e => setEditProd({ ...editProd, is_available: e.target.checked })} className="w-4 h-4" />
                <label htmlFor="avail_edit" className="text-slate-300 text-sm">เปิดขาย (แสดงใน POS)</label>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => { setEditProd(null); setEditImgFile(null); setEditImgPreview(null); }}
                className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm border border-slate-600">ยกเลิก</button>
              <button onClick={handleEditProd} disabled={uploadingImg}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Save className="w-4 h-4" /> {uploadingImg ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-white font-semibold text-lg">แก้ไขหมวดหมู่</h3>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อหมวดหมู่</label>
              <input className={inputCls} value={editCat.name}
                onChange={e => setEditCat({ ...editCat, name: e.target.value })} autoFocus
                onKeyDown={e => e.key === 'Enter' && handleEditCat()} />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditCat(null)} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm border border-slate-600">ยกเลิก</button>
              <button onClick={handleEditCat} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Save className="w-4 h-4" /> บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

