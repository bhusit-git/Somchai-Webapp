import './Settings.tailwind.css';
import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Building2, Info, Settings as SettingsIcon, Plus, Eye, EyeOff,
  Upload, Save, RefreshCw, Trash2, Edit2, Check, X, Key,
  Phone, MapPin, FileText, Percent, Bell, Tags, Briefcase, UtensilsCrossed,
  Banknote, QrCode, CreditCard, Truck, Wallet, Smartphone, CircleDollarSign, HandCoins, ListTodo,
  Gift, Calendar, Clock, ToggleLeft, ToggleRight, Shield, Layers, FileUp, Download, CheckSquare, Square, Search, AlertTriangle,
  ChevronUp, ChevronDown
} from 'lucide-react';
import { getUsers, createUser, updateUser, getBranches, createBranch, updateBranch } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse';

const roleLabels = {
  owner: { label: 'เจ้าของ', color: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  manager: { label: 'Area Manager', color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  store_manager: { label: 'ผู้จัดการสาขา', color: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' },
  cook: { label: 'พ่อครัว', color: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
  staff: { label: 'พนักงาน', color: 'bg-gray-500/20 text-gray-300 border border-gray-500/30' },
  trainee: { label: 'พนักงานฝึกหัด', color: 'bg-teal-500/20 text-teal-300 border border-teal-500/30' },
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

// ── Payment Method Icon Map ──
const PM_ICON_MAP = {
  Banknote, QrCode, CreditCard, Truck, Users, Wallet, Smartphone, CircleDollarSign, HandCoins,
};
const PM_ICON_OPTIONS = [
  { key: 'Banknote', label: 'เงินสด' },
  { key: 'QrCode', label: 'QR Code' },
  { key: 'CreditCard', label: 'บัตร/โอน' },
  { key: 'Truck', label: 'Delivery' },
  { key: 'Users', label: 'เงินเชื่อ' },
  { key: 'Wallet', label: 'กระเป๋าเงิน' },
  { key: 'Smartphone', label: 'Mobile' },
  { key: 'CircleDollarSign', label: 'อื่นๆ' },
];

const DEFAULT_PAYMENT_METHODS = [
  { value: 'cash',      label: 'เงินสด',        icon: 'Banknote',    isDefault: true, enabled: true, gpPercent: 0,  deliveryFee: 0 },
  { value: 'promptpay', label: 'PromptPay',      icon: 'QrCode',      isDefault: true, enabled: true, gpPercent: 0,  deliveryFee: 0 },
  { value: 'transfer',  label: 'โอนเงิน',        icon: 'CreditCard',  isDefault: true, enabled: true, gpPercent: 0,  deliveryFee: 0 },
  { value: 'Grab',      label: 'Grab',           icon: 'Truck',       isDefault: true, enabled: true, gpPercent: 30, deliveryFee: 0 },
  { value: 'Lineman',   label: 'LineMan',        icon: 'Truck',       isDefault: true, enabled: true, gpPercent: 30, deliveryFee: 0 },
  { value: 'credit',    label: 'เงินเชื่อ (AR)', icon: 'Users',       isDefault: true, enabled: true, gpPercent: 0,  deliveryFee: 0 },
];

function getPaymentMethods() {
  try {
    const raw = localStorage.getItem('paymentMethods');
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading payment methods:', err);
  }
  return DEFAULT_PAYMENT_METHODS;
}

// ── Sales Channels ──
const DEFAULT_SALES_CHANNELS = [
  { id: 'dine_in', label: 'หน้าร้าน', emoji: '🏪', isDefault: true },
  { id: 'grab',    label: 'Grab',     emoji: '🟢', isDefault: true },
  { id: 'lineman', label: 'LineMan',  emoji: '🟡', isDefault: true },
];

function getSalesChannels() {
  try {
    const raw = localStorage.getItem('salesChannels');
    if (raw) return JSON.parse(raw);
  } catch { }
  return DEFAULT_SALES_CHANNELS;
}

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
                className={`w-full bg-slate-900/50 border rounded-lg text-sm text-center py-2 px-1 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  isWeekend ? 'border-amber-500/40 focus:border-amber-500 focus:ring-amber-500' : 'border-slate-600 focus:border-violet-500 focus:ring-violet-500'
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
  const [visitedTabs, setVisitedTabs] = useState({ users: true });

  useEffect(() => {
    setVisitedTabs(prev => ({ ...prev, [activeTab]: true }));
  }, [activeTab]);

  const tabs = [
    { id: 'users', label: 'จัดการผู้ใช้งาน', icon: Users },
    { id: 'branches', label: 'จัดการสาขา', icon: Building2 },
    { id: 'products', label: 'เมนูขาย', icon: UtensilsCrossed },
    { id: 'customers', label: 'ลูกค้ารายบุคคล', icon: Briefcase },
    { id: 'promotions', label: 'โปรโมชั่น', icon: Gift },
    { id: 'company', label: 'ข้อมูลบริษัท', icon: Info },
    { id: 'expense_categories', label: 'หมวดหมู่รายจ่าย', icon: Tags },
    { id: 'system', label: 'ตั้งค่าระบบ', icon: SettingsIcon },
    { id: 'checklist', label: 'Checklist ปิดกะ', icon: ListTodo },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-900/20">
              <SettingsIcon className="w-5 h-5 text-black" />
            </div>
            ตั้งค่าระบบ
          </h1>
          <p className="text-slate-400 mt-1">จัดการผู้ใช้งาน สาขา ข้อมูลบริษัท และการตั้งค่าต่างๆ</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-slate-900/50 p-1.5 rounded-xl border border-slate-700/50 flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-lg shadow-amber-900/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div style={{ display: activeTab === 'users' ? 'block' : 'none' }}>
          {visitedTabs['users'] && <UsersTab />}
        </div>
        <div style={{ display: activeTab === 'branches' ? 'block' : 'none' }}>
          {visitedTabs['branches'] && <BranchesTab />}
        </div>
        <div style={{ display: activeTab === 'products' ? 'block' : 'none' }}>
          {visitedTabs['products'] && <ProductsTab />}
        </div>
        <div style={{ display: activeTab === 'customers' ? 'block' : 'none' }}>
          {visitedTabs['customers'] && <CustomersTab />}
        </div>
        <div style={{ display: activeTab === 'promotions' ? 'block' : 'none' }}>
          {visitedTabs['promotions'] && <PromotionsTab />}
        </div>
        <div style={{ display: activeTab === 'company' ? 'block' : 'none' }}>
          {visitedTabs['company'] && <CompanyInfoTab />}
        </div>
        <div style={{ display: activeTab === 'expense_categories' ? 'block' : 'none' }}>
          {visitedTabs['expense_categories'] && <ExpenseCategoriesTab />}
        </div>
        <div style={{ display: activeTab === 'system' ? 'block' : 'none' }}>
          {visitedTabs['system'] && <SystemConfigTab />}
        </div>
        <div style={{ display: activeTab === 'checklist' ? 'block' : 'none' }}>
          {visitedTabs['checklist'] && <ChecklistTab />}
        </div>
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
  const [newUser, setNewUser] = useState({ name: '', employee_id: '', phone: '', id_card_number: '', role: 'staff', branch_id: user?.branch_id || '', employment_type: 'monthly', pay_cycle: 'bimonthly', base_salary: 0, daily_rate: 0, daily_cash_advance: 0, position_allowance: 0, custom_rates: null });
  const [resetTarget, setResetTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
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
        phone: newUser.phone || null,
        id_card_number: newUser.id_card_number || null,
        role: newUser.role,
        branch_id: newUser.branch_id,
        employment_type: newUser.employment_type,
        pay_cycle: newUser.pay_cycle || 'bimonthly',
        base_salary: parseFloat(newUser.base_salary) || 0,
        daily_rate: parseFloat(newUser.daily_rate) || 0,
        daily_cash_advance: parseFloat(newUser.daily_cash_advance) || 0,
        position_allowance: parseFloat(newUser.position_allowance) || 0,
        custom_rates: newUser.employment_type === 'daily' && newUser.custom_rates && Object.keys(newUser.custom_rates).length > 0
          ? newUser.custom_rates
          : null,
        pin_hash: pin, // In a real app, hash this before sending
      });
      
      setShowAddForm(false);
      setNewUser({ name: '', employee_id: '', phone: '', id_card_number: '', role: 'staff', branch_id: user?.branch_id || '', employment_type: 'monthly', pay_cycle: 'bimonthly', base_salary: 0, daily_rate: 0, daily_cash_advance: 0, position_allowance: 0, custom_rates: null });
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
        phone: editUser.phone || null,
        id_card_number: editUser.id_card_number || null,
        role: editUser.role,
        branch_id: editUser.branch_id,
        employment_type: editUser.employment_type,
        pay_cycle: editUser.pay_cycle || 'bimonthly',
        base_salary: parseFloat(editUser.base_salary) || 0,
        daily_rate: parseFloat(editUser.daily_rate) || 0,
        daily_cash_advance: parseFloat(editUser.daily_cash_advance) || 0,
        position_allowance: parseFloat(editUser.position_allowance) || 0,
        custom_rates: editUser.employment_type === 'daily' && editUser.custom_rates && Object.keys(editUser.custom_rates).length > 0
          ? editUser.custom_rates
          : null,
      });
      setEditUser(null);
      loadData();
    } catch (err) {
      console.error('Update User Error:', err);
      alert('เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้งาน: ' + (err.message || err));
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
                className="form-input"
                placeholder="กรอกชื่อ..."
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">รหัสพนักงาน (ถ้ามี)</label>
              <input
                className="form-input"
                placeholder="เช่น EMP01"
                value={newUser.employee_id}
                onChange={e => setNewUser({ ...newUser, employee_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เบอร์โทรศัพท์</label>
              <input
                className="form-input"
                placeholder="เช่น 0812345678"
                value={newUser.phone || ''}
                onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เลขบัตรประชาชน / Passport</label>
              <input
                className="form-input"
                placeholder="เลขบัตรฯ 13 หลัก"
                value={newUser.id_card_number || ''}
                onChange={e => setNewUser({ ...newUser, id_card_number: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">สิทธิ์</label>
              <select className="form-select"
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
              <select className="form-select"
                value={newUser.branch_id}
                onChange={e => setNewUser({ ...newUser, branch_id: e.target.value })}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ประเภทการจ้าง</label>
              <select className="form-select"
                value={newUser.employment_type}
                onChange={e => {
                  const val = e.target.value;
                  setNewUser({ 
                    ...newUser, 
                    employment_type: val,
                    pay_cycle: (val === 'monthly' && newUser.pay_cycle === 'daily') ? 'bimonthly' : (newUser.pay_cycle || 'bimonthly')
                  });
                }}
              >
                <option value="monthly">รายเดือน</option>
                <option value="daily">รายวัน</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">รอบจ่ายเงิน</label>
              <select className="form-select"
                value={newUser.pay_cycle || 'bimonthly'}
                onChange={e => setNewUser({ ...newUser, pay_cycle: e.target.value })}
              >
                <option value="bimonthly">แบ่งจ่าย 2 รอบ/เดือน (วันที่ 15, สิ้นเดือน)</option>
                <option value="monthly">จ่ายสิ้นเดือนรอบเดียว</option>
                {newUser.employment_type === 'daily' && <option value="daily">จ่ายทุกวัน</option>}
              </select>
            </div>
          </div>

          {newUser.employment_type === 'monthly' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ฐานเงินเดือน (บาท)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="เช่น 15000"
                  value={newUser.base_salary}
                  onChange={e => setNewUser({ ...newUser, base_salary: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ค่าตำแหน่ง (บาทต่อเดือน)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="เช่น 3000 (0 = ไม่มี)"
                  value={newUser.position_allowance || ''}
                  onChange={e => setNewUser({ ...newUser, position_allowance: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">ค่าจ้างต่อกะ Default (บาท)</label>
                  <input
                    type="number"
                    className="form-input bg-slate-800"
                    placeholder="เช่น 380"
                    value={newUser.daily_rate}
                    onChange={e => setNewUser({ ...newUser, daily_rate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">เบิกจ่ายสดต่อวัน (บาท) <span className="text-slate-500 font-normal">ส่วนที่เหลือโอนตามรอบ</span></label>
                  <input
                    type="number"
                    className="form-input bg-slate-800"
                    placeholder="0 = ไม่เบิกสด"
                    value={newUser.daily_cash_advance || ''}
                    onChange={e => setNewUser({ ...newUser, daily_cash_advance: e.target.value })}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-slate-400 text-xs mb-1 block">ค่าตำแหน่ง (บาทต่อเดือน)</label>
                <input
                  type="number"
                  className="form-input bg-slate-800"
                  placeholder="เช่น 3000 (0 = ไม่มี)"
                  value={newUser.position_allowance || ''}
                  onChange={e => setNewUser({ ...newUser, position_allowance: e.target.value })}
                />
              </div>
              <DayRatesEditor
                baseRate={newUser.daily_rate}
                value={newUser.custom_rates}
                onChange={rates => setNewUser({ ...newUser, custom_rates: rates })}
              />
            </div>
          )}

          <div className="flex gap-3 mt-4">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <h3 className="text-white font-medium text-lg">แก้ไขข้อมูลผู้ใช้งาน</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-slate-400 text-xs mb-1 block">ชื่อ-นามสกุล *</label>
                  <input
                    className="form-input"
                    value={editUser.name}
                    onChange={e => setEditUser({ ...editUser, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">รหัสพนักงาน (ถ้ามี)</label>
                  <input
                    className="form-input"
                    placeholder="เช่น EMP01"
                    value={editUser.employee_id || ''}
                    onChange={e => setEditUser({ ...editUser, employee_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">เบอร์โทรศัพท์</label>
                  <input
                    className="form-input"
                    placeholder="เช่น 0812345678"
                    value={editUser.phone || ''}
                    onChange={e => setEditUser({ ...editUser, phone: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-slate-400 text-xs mb-1 block">เลขบัตรประชาชน / Passport</label>
                  <input
                    className="form-input"
                    placeholder="เลขบัตรฯ 13 หลัก"
                    value={editUser.id_card_number || ''}
                    onChange={e => setEditUser({ ...editUser, id_card_number: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">สิทธิ์</label>
                <select className="form-select"
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
                <select className="form-select"
                  value={editUser.branch_id || ''}
                  onChange={e => setEditUser({ ...editUser, branch_id: e.target.value })}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">ประเภทการจ้าง</label>
                  <select className="form-select"
                    value={editUser.employment_type || 'monthly'}
                    onChange={e => {
                      const val = e.target.value;
                      setEditUser({ 
                        ...editUser, 
                        employment_type: val,
                        pay_cycle: (val === 'monthly' && editUser.pay_cycle === 'daily') ? 'bimonthly' : (editUser.pay_cycle || 'bimonthly')
                      });
                    }}
                  >
                    <option value="monthly">รายเดือน</option>
                    <option value="daily">รายวัน</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">รอบจ่ายเงิน</label>
                  <select className="form-select"
                    value={editUser.pay_cycle || 'bimonthly'}
                    onChange={e => setEditUser({ ...editUser, pay_cycle: e.target.value })}
                  >
                    <option value="bimonthly">แบ่งจ่าย 2 รอบ/เดือน (วันที่ 15, สิ้นเดือน)</option>
                    <option value="monthly">จ่ายสิ้นเดือนรอบเดียว</option>
                    {editUser.employment_type === 'daily' && <option value="daily">จ่ายทุกวัน</option>}
                  </select>
                </div>
              </div>

              {(!editUser.employment_type || editUser.employment_type === 'monthly') ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">ฐานเงินเดือน (บาท)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="เช่น 15000"
                      value={editUser.base_salary || 0}
                      onChange={e => setEditUser({ ...editUser, base_salary: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">ค่าตำแหน่ง (บาทต่อเดือน)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="เช่น 3000 (0 = ไม่มี)"
                      value={editUser.position_allowance || ''}
                      onChange={e => setEditUser({ ...editUser, position_allowance: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-slate-400 text-xs mb-1 block">ค่าจ้างต่อกะ Default (บาท)</label>
                      <input
                        type="number"
                        className="form-input bg-slate-800"
                        placeholder="เช่น 380"
                        value={editUser.daily_rate || 0}
                        onChange={e => setEditUser({ ...editUser, daily_rate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs mb-1 block">เบิกจ่ายสดต่อวัน (บาท) <span className="text-slate-500 font-normal">ส่วนที่เหลือโอนตามรอบ</span></label>
                      <input
                        type="number"
                        className="form-input bg-slate-800"
                        placeholder="0 = ไม่เบิกสด"
                        value={editUser.daily_cash_advance || ''}
                        onChange={e => setEditUser({ ...editUser, daily_cash_advance: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="text-slate-400 text-xs mb-1 block">ค่าตำแหน่ง (บาทต่อเดือน)</label>
                    <input
                      type="number"
                      className="form-input bg-slate-800"
                      placeholder="เช่น 3000 (0 = ไม่มี)"
                      value={editUser.position_allowance || ''}
                      onChange={e => setEditUser({ ...editUser, position_allowance: e.target.value })}
                    />
                  </div>
                  <DayRatesEditor
                    baseRate={editUser.daily_rate}
                    value={editUser.custom_rates}
                    onChange={rates => setEditUser({ ...editUser, custom_rates: rates })}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-8">
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
                <p className="text-slate-400 text-sm hidden sm:block">{user.branches?.name || 'ไม่ระบุสาขา'}</p>
                {user.phone && (
                  <p className="text-slate-400 text-sm flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {user.phone}
                  </p>
                )}
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
  const { user: authUser } = useAuth();
  const isOwner = authUser?.role === 'owner';
  const [branches, setBranches] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', address: '', code: '' });
  const [loading, setLoading] = useState(true);
  const [editBranch, setEditBranch] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
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
      // Build geofence settings from editBranch state
      const geofence = {
        enabled: editBranch._geoEnabled || false,
        lat: editBranch._geoLat ? parseFloat(editBranch._geoLat) : null,
        lng: editBranch._geoLng ? parseFloat(editBranch._geoLng) : null,
        radius_m: editBranch._geoRadius ? parseInt(editBranch._geoRadius) : 50,
      };
      const existingSettings = editBranch.settings || {};
      await updateBranch(editBranch.id, { 
        code: editBranch.code, 
        name: editBranch.name, 
        address: editBranch.address,
        settings: { ...existingSettings, geofence },
      });
      setEditBranch(null);
      loadBranches();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการแก้ไขสาขา: ' + err.message);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return alert('เบราว์เซอร์นี้ไม่รองรับ GPS');
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditBranch(prev => ({
          ...prev,
          _geoLat: pos.coords.latitude.toFixed(7),
          _geoLng: pos.coords.longitude.toFixed(7),
        }));
        setGettingLocation(false);
      },
      () => {
        alert('ไม่สามารถดึงพิกัดได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
                className="form-input"
                placeholder="เช่น SC001 (ไม่ต้องใส่ก็ได้)"
                value={newBranch.code}
                onChange={e => setNewBranch({ ...newBranch, code: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อสาขา *</label>
              <input
                className="form-input"
                placeholder="เช่น สาขา Siam"
                value={newBranch.name}
                onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">ที่อยู่สาขา</label>
              <input
                className="form-input"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-medium text-lg">แก้ไขข้อมูลสาขา</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">รหัสสาขาตั้งเอง (Branch Code)</label>
                <input
                  className="form-input"
                  value={editBranch.code || ''}
                  onChange={e => setEditBranch({ ...editBranch, code: e.target.value })}
                  placeholder="เช่น SC001"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ชื่อสาขา *</label>
                <input
                  className="form-input"
                  value={editBranch.name}
                  onChange={e => setEditBranch({ ...editBranch, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ที่อยู่สาขา</label>
                <input
                  className="form-input"
                  value={editBranch.address || ''}
                  onChange={e => setEditBranch({ ...editBranch, address: e.target.value })}
                />
              </div>

              {/* --- Geofence Section (Owner Only) --- */}
              {isOwner && (
                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-emerald-400 text-sm font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> ขอบเขตพื้นที่การลงเวลา (Geofence)
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded"
                        checked={editBranch._geoEnabled || false}
                        onChange={e => setEditBranch({ ...editBranch, _geoEnabled: e.target.checked })}
                      />
                      <span className="text-slate-300 text-xs">{editBranch._geoEnabled ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span>
                    </label>
                  </div>

                  {editBranch._geoEnabled && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-slate-400 text-xs mb-1 block">Latitude (เส้นรุ้ง)</label>
                          <input
                            type="number" step="0.0000001"
                            className="form-input"
                            placeholder="เช่น 13.7563"
                            value={editBranch._geoLat ?? ''}
                            onChange={e => setEditBranch({ ...editBranch, _geoLat: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs mb-1 block">Longitude (เส้นแวง)</label>
                          <input
                            type="number" step="0.0000001"
                            className="form-input"
                            placeholder="เช่น 100.5018"
                            value={editBranch._geoLng ?? ''}
                            onChange={e => setEditBranch({ ...editBranch, _geoLng: e.target.value })}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        disabled={gettingLocation}
                        className="w-full flex items-center justify-center gap-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-300 text-sm py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <MapPin className="w-4 h-4" />
                        {gettingLocation ? '⏳ กำลังดึงพิกัด...' : '📍 ใช้ตำแหน่งปัจจุบันของฉัน'}
                      </button>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">รัศมีที่อนุญาต (เมตร)</label>
                        <input
                          type="number" min="10" max="5000"
                          className="form-input"
                          placeholder="50"
                          value={editBranch._geoRadius ?? 50}
                          onChange={e => setEditBranch({ ...editBranch, _geoRadius: e.target.value })}
                        />
                        <p className="text-slate-500 text-[10px] mt-1">• แนะนำ 50–200 เมตร เผื่อ GPS เพี้ยนเล็กน้อย</p>
                      </div>
                      {editBranch._geoLat && editBranch._geoLng && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${editBranch._geoLat},${editBranch._geoLng}`}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          <MapPin className="w-3 h-3" /> ดูตำแหน่งบน Google Maps
                        </a>
                      )}
                    </>
                  )}
                </div>
              )}
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
              {branch.settings?.geofence?.enabled && (
                <p className="text-emerald-400 text-xs flex items-center gap-1 mt-1">
                  📍 Geofence เปิดอยู่ · รัศมี {branch.settings.geofence.radius_m || 50} เมตร
                </p>
              )}
            </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditBranch({
                    ...branch,
                    _geoEnabled: branch.settings?.geofence?.enabled || false,
                    _geoLat: branch.settings?.geofence?.lat?.toString() || '',
                    _geoLng: branch.settings?.geofence?.lng?.toString() || '',
                    _geoRadius: (branch.settings?.geofence?.radius_m || 50).toString(),
                  })}
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
  const { user } = useAuth();
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

  // Payment methods state
  const [payMethods, setPayMethods] = useState(() => {
    try {
      const raw = localStorage.getItem('paymentMethods');
      return raw ? JSON.parse(raw) : DEFAULT_PAYMENT_METHODS;
    } catch {
      return DEFAULT_PAYMENT_METHODS;
    }
  });
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodIcon, setNewMethodIcon] = useState('CircleDollarSign');
  const [newMethodGP, setNewMethodGP] = useState('');
  const [newMethodDeliveryFee, setNewMethodDeliveryFee] = useState('');

  // Sales Channels state
  const [salesChannels, setSalesChannels] = useState(() => getSalesChannels());
  const [newChannelLabel, setNewChannelLabel] = useState('');
  const [newChannelEmoji, setNewChannelEmoji] = useState('📦');

  // Legacy CSV Import State
  const [legacyCsvFile, setLegacyCsvFile] = useState(null);
  const [legacyImporting, setLegacyImporting] = useState(false);
  const [legacyResult, setLegacyResult] = useState(null);

  // Legacy Expense CSV Import State
  const [expenseCsvFile, setExpenseCsvFile] = useState(null);
  const [expenseImporting, setExpenseImporting] = useState(false);
  const [expenseResult, setExpenseResult] = useState(null);

  const importLegacyExpenses = async () => {
    if (!expenseCsvFile) return;
    setExpenseImporting(true);
    setExpenseResult(null);
    
    Papa.parse(expenseCsvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          let importedCount = 0;
          let skippedCount = 0;

          const branchId = user?.branch_id;
          const createdBy = user?.id;
          if (!branchId || !createdBy) throw new Error('No branch or user context');

          // Fetch all existing users to map their names
          const { data: usersData } = await supabase.from('users').select('id, name, full_name');
          const userObj = {};
          if (usersData) {
            usersData.forEach(u => {
              userObj[(u.name || '').toLowerCase()] = u.id;
              userObj[(u.full_name || '').toLowerCase()] = u.id;
            });
          }

          const newExpenses = [];
          for (const row of rows) {
            let [dateCol, catCol, amtCol, descCol, userCol] = Object.values(row);
            if (!dateCol || !amtCol || !descCol) continue;
            
            // Expected date format: "3/13/2026" or "13/03/2026"
            // Let's assume M/D/YYYY from the image
            let d = new Date();
            const dParts = dateCol.split('/');
            if (dParts.length === 3) {
              // try to parse as M/D/YYYY
              d = new Date(`${dParts[2]}-${dParts[0].padStart(2,'0')}-${dParts[1].padStart(2,'0')}T12:00:00+07:00`);
              if (isNaN(d.getTime())) {
                  // Fallback to D/M/YYYY
                  d = new Date(`${dParts[2]}-${dParts[1].padStart(2,'0')}-${dParts[0].padStart(2,'0')}T12:00:00+07:00`);
              }
            }

            const amount = parseFloat(amtCol.toString().replace(/,/g, ''));
            if (isNaN(amount) || amount <= 0) continue;

            const categoryName = (catCol || 'อื่นๆ').split(' (')[0].trim(); // Removes English "(Labor)" part if present
            
            // Map created_by user
            let expenseUser = createdBy;
            if (userCol) {
               const rawName = userCol.split('-')[1] || userCol;
               // Attempt to find user
               for (const [k, v] of Object.entries(userObj)) {
                   if (k.includes(rawName.toLowerCase()) || rawName.toLowerCase().includes(k)) {
                       expenseUser = v;
                       break;
                   }
               }
            }

            newExpenses.push({
              branch_id: branchId,
              created_by: expenseUser,
              approved_by: createdBy,
              approved_at: d.toISOString(),
              category: categoryName,
              description: descCol,
              amount: amount,
              expense_type: 'planned',
              payment_method: 'cash',
              status: 'approved', // Pre-approve legacy expenses
              created_at: d.toISOString(),
            });
          }

          if (newExpenses.length > 0) {
            // Batch insert chunking to 100 per request
            for (let i = 0; i < newExpenses.length; i += 100) {
               const chunk = newExpenses.slice(i, i + 100);
               const { error } = await supabase.from('expenses').insert(chunk);
               if (error) throw new Error(`ไม่สามารถเพิ่ม Expense ได้: ${error.message}`);
               importedCount += chunk.length;
            }
          }

          setExpenseResult({ success: true, count: importedCount, skipped: 0 });
        } catch (err) {
          console.error('Legacy exp import error:', err);
          setExpenseResult({ success: false, error: err.message });
        } finally {
          setExpenseImporting(false);
          setExpenseCsvFile(null);
        }
      }
    });
  };

  const importLegacySales = async () => {
    if (!legacyCsvFile) return;
    setLegacyImporting(true);
    setLegacyResult(null);

    Papa.parse(legacyCsvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          const receipts = {};
          rows.forEach(r => {
            const rn = (r['Receipt Number'] || '').trim();
            if (!rn) return;
            if (!receipts[rn]) {
              receipts[rn] = {
                date: (r['Date'] || '').trim(),
                payment: (r['Payment'] || '').trim(),
                type: (r['Type'] || 'SALE').trim().toUpperCase(),
                items: []
              };
            }
            receipts[rn].items.push({
              name: (r['Item Name'] || '').trim(),
              qty: parseInt(r['QTY']) || 0,
              price: parseFloat(r['Price']) || 0,
            });
          });

          let importedCount = 0;
          let skippedCount = 0;
          const branchId = user?.branch_id || null;
          const createdBy = user?.id || null;

          const allReceiptNos = Object.keys(receipts);
          const CHUNK_SIZE = 25; // ลดขนาด Chunk เพื่อป้องกัน URL ยาวเกินไปจนเกิด Load failed

          const generateId = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });
          };

          for (let i = 0; i < allReceiptNos.length; i += CHUNK_SIZE) {
            const chunkNos = allReceiptNos.slice(i, i + CHUNK_SIZE);
            
            // Batch check existing receipts
            const { data: existingData, error: existErr } = await supabase
              .from('transactions')
              .select('order_number')
              .in('order_number', chunkNos);
              
            if (existErr) throw new Error('ตรวจสอบข้อมูลซ้ำล้มเหลว: ' + existErr.message);
            
            const existingNos = new Set((existingData || []).map(r => r.order_number));
            skippedCount += existingNos.size;
            
            const newTxs = [];
            const newItems = [];

            for (const receiptNo of chunkNos) {
               if (existingNos.has(receiptNo)) continue;
               const data = receipts[receiptNo];

               // ── Date parsing (robust) ──
               let d;
               if (data.date) {
                 const parts = data.date.split(/,\s*/);
                 if (parts.length >= 2) {
                   const dParts = parts[0].split('/');
                   const tParts = parts[1].split(':');
                   if (dParts.length === 3 && tParts.length >= 2) {
                     const paddedTime = tParts.map(p => p.padStart(2, '0')).join(':');
                     const isoStr = `${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}T${paddedTime}`;
                     d = new Date(isoStr);
                   }
                 }
               }
               if (!d || isNaN(d.getTime())) d = new Date();

               // ── Payment method mapping ──
               const paymentMapping = { 'cash':'cash', 'transfer':'transfer', 'grab':'Grab', 'lineman':'Lineman' };
               let pMethod = 'cash';
               const rawPayment = (data.payment || '').toLowerCase();
               for (const [k, v] of Object.entries(paymentMapping)) {
                 if (rawPayment.includes(k)) pMethod = v;
               }
               if (data.payment.includes('เครดิต')) pMethod = 'credit';

               // ── Compute total ──
               const computedTotal = data.items.reduce((sum, item) => sum + (item.qty * item.price), 0);
               const absTotal = Math.abs(computedTotal);
               const isRefund = data.type === 'REFUND';

               const txId = generateId(); // Generated so we can link items immediately
               
               newTxs.push({
                 id: txId,
                 branch_id: branchId,
                 created_by: createdBy,
                 order_number: receiptNo,
                 subtotal: isRefund ? -absTotal : absTotal,
                 discount: 0,
                 total: isRefund ? -absTotal : absTotal,
                 payment_method: pMethod,
                 status: isRefund ? 'voided' : 'completed',
                 created_at: d.toISOString()
               });

               data.items.forEach(item => {
                 newItems.push({
                   transaction_id: txId,
                   product_name: item.name,
                   quantity: Math.abs(item.qty),
                   unit_price: item.price,
                   total_price: Math.abs(item.qty) * item.price
                 });
               });
               
               importedCount++;
            }

            // Batch Execute
            if (newTxs.length > 0) {
               const { error: txErr } = await supabase.from('transactions').insert(newTxs);
               if (txErr) throw new Error(`ไม่สามารถเพิ่ม Transactions ช่วงบิล ${chunkNos[0]} ได้: ${txErr.message}`);
               
               if (newItems.length > 0) {
                 const { error: itemsErr } = await supabase.from('transaction_items').insert(newItems);
                 if (itemsErr) console.error('Batch insert items error:', itemsErr); // Not throwing to avoid breaking halfway
               }
            }
          }

          setLegacyResult({ success: true, count: importedCount, skipped: skippedCount });
        } catch (err) {
          console.error('Legacy import error:', err);
          setLegacyResult({ success: false, error: err.message });
        } finally {
          setLegacyImporting(false);
          setLegacyCsvFile(null);
        }
      }
    });
  };

  const handleSave = () => {
    localStorage.setItem('systemConfig', JSON.stringify(config));
    localStorage.setItem('paymentMethods', JSON.stringify(payMethods));
    localStorage.setItem('salesChannels', JSON.stringify(salesChannels));
    window.dispatchEvent(new Event('salesChannelsUpdate'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleMethod = (value) => {
    setPayMethods(prev => prev.map(m => m.value === value ? { ...m, enabled: !m.enabled } : m));
  };

  const addCustomMethod = () => {
    const trimmed = newMethodName.trim();
    if (!trimmed) return;
    const newM = {
      value: `custom_${Date.now()}`,
      label: trimmed,
      icon: newMethodIcon,
      isDefault: false,
      enabled: true,
      gpPercent: parseFloat(newMethodGP) || 0,
      deliveryFee: parseFloat(newMethodDeliveryFee) || 0,
    };
    setPayMethods(prev => [...prev, newM]);
    setNewMethodName('');
    setNewMethodIcon('CircleDollarSign');
    setNewMethodGP('');
    setNewMethodDeliveryFee('');
  };

  const updateMethodGP = (value, gp) => {
    setPayMethods(prev => prev.map(m => m.value === value ? { ...m, gpPercent: parseFloat(gp) || 0 } : m));
  };

  const updateMethodDeliveryFee = (value, fee) => {
    setPayMethods(prev => prev.map(m => m.value === value ? { ...m, deliveryFee: parseFloat(fee) || 0 } : m));
  };

  const removeCustomMethod = (value) => {
    setPayMethods(prev => prev.filter(m => m.value !== value));
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
                className="form-input"
                value={config.dailySalesTarget || ''}
                onChange={e => setConfig({ ...config, dailySalesTarget: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เป้าหมาย Food Cost (%)</label>
              <input
                type="number"
                className="form-input"
                value={config.targetFcPercent || ''}
                onChange={e => setConfig({ ...config, targetFcPercent: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เป้าหมาย Gross Profit (%)</label>
              <input
                type="number"
                className="form-input"
                value={config.targetGpPercent || ''}
                onChange={e => setConfig({ ...config, targetGpPercent: e.target.value })}
              />
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
                className="form-input" style={{width: "6rem"}}
                value={config.stockAlertDays}
                onChange={e => setConfig({ ...config, stockAlertDays: Number(e.target.value) })}
              />
              <span className="text-slate-400 text-sm">วัน</span>
            </div>
          </div>
        </div>

        {/* Receipt & Taxes */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4 md:col-span-2">
          <h3 className="text-white font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> ใบเสร็จรับเงิน & ภาษี</h3>
          
          <div>
            <label className="text-slate-400 text-xs mb-1 block">
              VAT% (ภาษีมูลค่าเพิ่ม)
              <span className="text-slate-500 text-[10px] ml-2 inline">
                *หากร้านไม่ได้จด VAT ให้ใส่ 0
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="form-input" style={{width: "6rem"}}
                value={config.vatPercent}
                onChange={e => setConfig({ ...config, vatPercent: Number(e.target.value) })}
              />
              <span className="text-slate-400 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">ข้อความท้ายใบเสร็จ</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={config.receiptFooter}
              onChange={e => setConfig({ ...config, receiptFooter: e.target.value })}
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Line OA Channel Access Token</label>
            <input
              type="password"
              className="form-input" style={{fontFamily: "monospace"}}
              value={config.lineOAToken}
              onChange={e => setConfig({ ...config, lineOAToken: e.target.value })}
              placeholder="eyJ..."
            />
            <p className="text-slate-500 text-xs mt-1">ใช้สำหรับส่งแจ้งเตือนผ่าน Line Official Account</p>
          </div>
        </div>

        {/* ── Sales Channels ── */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium flex items-center gap-2">
              🚦 ช่องทางการขาย (Sales Channels)
            </h3>
            <span className="text-slate-500 text-xs">เพิ่ม/ลบช่องทางได้ • บันทึกเพื่อให้มีผล</span>
          </div>
          <div className="space-y-2">
            {salesChannels.map(ch => (
              <div key={ch.id} className="flex items-center justify-between bg-slate-700/40 border border-slate-600/60 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{ch.emoji}</span>
                  <div>
                    <p className="text-white text-sm font-medium">{ch.label}</p>
                    <p className="text-slate-500 text-[10px]">{ch.id}{ch.isDefault ? ' • Default' : ''}</p>
                  </div>
                </div>
                {!ch.isDefault && (
                  <button
                    onClick={() => setSalesChannels(prev => prev.filter(c => c.id !== ch.id))}
                    className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-slate-400 text-xs font-semibold mb-3 uppercase tracking-wide">➕ เพิ่มช่องทางการขายใหม่</p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="form-input" style={{ width: '3rem', textAlign: 'center', padding: '8px 4px' }}
                placeholder="📦"
                value={newChannelEmoji}
                onChange={e => setNewChannelEmoji(e.target.value)}
              />
              <input
                className="form-input" style={{ flex: 1, minWidth: '140px' }}
                placeholder="ชื่อช่องทาง เช่น Grab Food, Shopee Food"
                value={newChannelLabel}
                onChange={e => setNewChannelLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newChannelLabel.trim()) {
                    const id = newChannelLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    setSalesChannels(prev => [...prev, { id: `custom_${id}_${Date.now()}`, label: newChannelLabel.trim(), emoji: newChannelEmoji || '📦', isDefault: false }]);
                    setNewChannelLabel(''); setNewChannelEmoji('📦');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (!newChannelLabel.trim()) return;
                  const id = newChannelLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                  setSalesChannels(prev => [...prev, { id: `custom_${id}_${Date.now()}`, label: newChannelLabel.trim(), emoji: newChannelEmoji || '📦', isDefault: false }]);
                  setNewChannelLabel(''); setNewChannelEmoji('📦');
                }}
                disabled={!newChannelLabel.trim()}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" /> เพิ่ม
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-2">💡 เมื่อเพิ่มแล้วกด <strong className="text-slate-300">บันทึก</strong> เพื่อให้ POS และ เมนูขาย รับรู้การเปลี่ยนแปลง</p>
          </div>
        </div>

        {/* ── Payment Methods ── */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" /> ช่องทางชำระเงิน (POS)
            </h3>
            <span className="text-slate-500 text-xs">เปิด/ปิดแต่ละช่องทางได้ • บันทึกเพื่อให้มีผล</span>
          </div>

          {/* Method List */}
          <div className="space-y-2">
            {payMethods.map((m) => {
              const IconComp = PM_ICON_MAP[m.icon] || CircleDollarSign;
              return (
                  <div
                  key={m.value}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    m.enabled
                      ? 'bg-slate-700/40 border-slate-600/60'
                      : 'bg-slate-900/30 border-slate-700/30 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      m.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      <IconComp className="w-5 h-5" />
                    </div>

                    {/* Label */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${m.enabled ? 'text-white' : 'text-slate-400'}`}>{m.label}</span>
                        {m.isDefault && (
                          <span className="text-[10px] text-slate-400 bg-slate-800/60 border border-slate-700 px-1.5 py-0.5 rounded-full">Default</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{m.value}</div>
                    </div>
                  </div>

                  {/* Controls (Right Side) */}
                  <div className="flex items-center gap-4">
                    {/* Delivery Fee: Only for 'delivery' */}
                    {m.value === 'delivery' && (
                      <div className="flex items-center gap-1.5 bg-slate-900/50 rounded-lg p-1.5 border border-slate-700/50" title="ค่าส่งนอกรอบ (฿)">
                        <span className="text-slate-400 text-[10px] font-semibold tracking-wider ml-1">🛵฿</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          disabled={!m.enabled}
                          className="form-input" style={{width: "3.5rem", background: "transparent", border: "none", padding: 0, textAlign: "center"}}
                          value={m.deliveryFee > 0 ? m.deliveryFee : ''}
                          placeholder="0"
                          onChange={e => updateMethodDeliveryFee(m.value, e.target.value)}
                        />
                      </div>
                    )}
                    {/* GP% */}
                    <div className="flex items-center gap-1.5 bg-slate-900/50 rounded-lg p-1.5 border border-slate-700/50">
                      <span className="text-slate-400 text-[10px] font-semibold tracking-wider ml-1">GP</span>
                      <div className="flex items-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          disabled={!m.enabled}
                          className="form-input" style={{width: "3.5rem", background: "transparent", border: "none", padding: 0, textAlign: "center"}}
                          value={m.gpPercent || ''}
                          placeholder="0"
                          onChange={e => updateMethodGP(m.value, e.target.value)}
                        />
                        <span className="text-slate-500 text-xs mr-1">%</span>
                      </div>
                    </div>

                    {/* Toggle */}
                    <div className="flex items-center border-l border-slate-700/50 pl-4">
                      <button
                        onClick={() => toggleMethod(m.value)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                          m.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          m.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    {/* Delete (custom only) */}
                    {!m.isDefault && (
                      <button
                        onClick={() => removeCustomMethod(m.value)}
                        className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors ml-1"
                        title="ลบช่องทางชำระเงิน"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Custom Method */}
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-slate-400 text-xs font-semibold mb-3 uppercase tracking-wide">➕ เพิ่มช่องทางชำระเงินใหม่</p>
            <div className="flex gap-2 flex-wrap">
              <select
                className="form-select" style={{width: "140px", flexShrink: 0}}
                value={newMethodIcon}
                onChange={e => setNewMethodIcon(e.target.value)}
              >
                {PM_ICON_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <input
                className="form-input" style={{flex: 1, minWidth: "140px"}}
                placeholder="ชื่อช่องทาง เช่น Grab, บัตรเครดิต"
                value={newMethodName}
                onChange={e => setNewMethodName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomMethod()}
              />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-slate-400 text-xs">GP</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-input" style={{width: "4rem", textAlign: "center"}}
                  value={newMethodGP}
                  placeholder="0"
                  onChange={e => setNewMethodGP(e.target.value)}
                />
                <span className="text-slate-400 text-xs">%</span>
              </div>
              <button
                onClick={addCustomMethod}
                disabled={!newMethodName.trim()}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" /> เพิ่ม
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-2">💡 เมื่อเพิ่มแล้วกด <strong className="text-slate-300">บันทึก</strong> ที่มุมบนขวา เพื่อให้ POS รับรู้การเปลี่ยนแปลง</p>
          </div>
        </div>

        {/* ── Legacy Import ── */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium flex items-center gap-2">
              <FileUp className="w-4 h-4 text-purple-400" /> นำข้อมูลจากระบบเดิม (Legacy POS)
            </h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
              <h4 className="text-white font-medium mb-1">1. นำเข้าประวัติการขาย</h4>
              <p className="text-slate-300 text-xs mb-3">แปลงไฟล์คำสั่งซื้อจาก POS เก่าเป็น `.csv` และอัปโหลดที่นี่ระบบจะสร้าง Transactions แยกตามเลขใบเสร็จพร้อมระบุวันที่ย้อนหลังให้แบบอัตโนมัติ</p>
              
              <div className="flex flex-col gap-3">
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={e => setLegacyCsvFile(e.target.files[0])}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 bg-slate-900 border border-slate-700 rounded-lg"
                />
                <button
                  onClick={importLegacySales}
                  disabled={!legacyCsvFile || legacyImporting}
                  className="whitespace-nowrap flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {legacyImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {legacyImporting ? 'กำลังนำเข้า...' : 'อัปโหลดการขาย'}
                </button>
              </div>
              {legacyResult && (
                <div className={`mt-3 p-3 rounded-lg text-xs border ${legacyResult.success ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300' : 'bg-red-900/30 border-red-500/30 text-red-300'}`}>
                  {legacyResult.success ? `✅ สำเร็จ ${legacyResult.count} ใบเสร็จ${legacyResult.skipped ? ` (ข้าม ${legacyResult.skipped} รายการที่มีอยู่แล้ว)` : ''}` : `❌ ผิดพลาด: ${legacyResult.error}`}
                </div>
              )}
            </div>

            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
              <h4 className="text-white font-medium mb-1">2. นำเข้าค่าใช้จ่ายย้อนหลัง</h4>
              <p className="text-slate-300 text-xs mb-3">เตรียมไฟล์ CSV เรียงคอลัมน์: <b>วันที่, ประเภทค่าใช้จ่าย, จำนวนเงิน, เพิ่มเติม, ผู้ทำรายการ</b> เพื่อนำข้อมูลเข้าระบบ</p>
              
              <div className="flex flex-col gap-3">
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={e => setExpenseCsvFile(e.target.files[0])}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 bg-slate-900 border border-slate-700 rounded-lg"
                />
                <button
                  onClick={importLegacyExpenses}
                  disabled={!expenseCsvFile || expenseImporting}
                  className="whitespace-nowrap flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {expenseImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {expenseImporting ? 'กำลังนำเข้า...' : 'อัปโหลดค่าใช้จ่าย'}
                </button>
              </div>
              {expenseResult && (
                <div className={`mt-3 p-3 rounded-lg text-xs border ${expenseResult.success ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300' : 'bg-red-900/30 border-red-500/30 text-red-300'}`}>
                  {expenseResult.success ? `✅ สำเร็จ ${expenseResult.count} รายการ` : `❌ ผิดพลาด: ${expenseResult.error}`}
                </div>
              )}
            </div>
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
  const [newCat, setNewCat] = useState({ name: '', branch_id: user?.branch_id || '', is_admin_only: false, is_fixed_cost: false });
  const [editCat, setEditCat] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
      await createExpenseCategory({ name: newCat.name, branch_id: newCat.branch_id, is_admin_only: newCat.is_admin_only, is_fixed_cost: newCat.is_fixed_cost });
      setNewCat(prev => ({ ...prev, name: '', branch_id: user?.branch_id || '', is_admin_only: false, is_fixed_cost: false }));
      setShowAdd(false);
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสร้างหมวดหมู่');
    }
  };

  const handleEdit = async () => {
    if (!editCat.name) return;
    try {
      await updateExpenseCategory(editCat.id, { name: editCat.name, branch_id: editCat.branch_id, is_admin_only: editCat.is_admin_only, is_fixed_cost: editCat.is_fixed_cost });
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
                className="form-input"
                placeholder="เช่น ค่าแรง, ค่าไฟ..."
                value={newCat.name}
                onChange={e => setNewCat({ ...newCat, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
              <select className="form-select"
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
                style={{width: "1rem", height: "1rem"}}
                checked={newCat.is_admin_only || false} 
                onChange={e => setNewCat({ ...newCat, is_admin_only: e.target.checked })} 
              />
              <label htmlFor="is_admin_only_new" className="text-slate-300 text-sm">แสดงเฉพาะผู้บริหาร (ซ่อนจากพนักงานทั่วไป)</label>
            </div>
            <div className="md:col-span-2 flex items-center gap-2 mt-1">
              <input 
                type="checkbox" 
                id="is_fixed_cost_new" 
                style={{width: "1rem", height: "1rem"}}
                checked={newCat.is_fixed_cost || false} 
                onChange={e => setNewCat({ ...newCat, is_fixed_cost: e.target.checked })} 
              />
              <label htmlFor="is_fixed_cost_new" className="text-slate-300 text-sm">🏷️ ต้นทุนคงที่ (Fixed Cost) — เช่น ค่าเช่า, เงินเดือน</label>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <h3 className="text-white font-medium text-lg">แก้ไขหมวดหมู่รายจ่าย</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ชื่อหมวดหมู่ *</label>
                <input
                  className="form-input"
                  value={editCat.name}
                  onChange={e => setEditCat({ ...editCat, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
                <select className="form-select"
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
                  style={{width: "1rem", height: "1rem"}}
                  checked={editCat.is_admin_only || false} 
                  onChange={e => setEditCat({ ...editCat, is_admin_only: e.target.checked })} 
                />
                <label htmlFor="is_admin_only_edit" className="text-slate-300 text-sm">แสดงเฉพาะผู้บริหาร (ซ่อนจากพนักงานทั่วไป)</label>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="is_fixed_cost_edit" 
                  style={{width: "1rem", height: "1rem"}}
                  checked={editCat.is_fixed_cost || false} 
                  onChange={e => setEditCat({ ...editCat, is_fixed_cost: e.target.checked })} 
                />
                <label htmlFor="is_fixed_cost_edit" className="text-slate-300 text-sm">🏷️ ต้นทุนคงที่ (Fixed Cost) — เช่น ค่าเช่า, เงินเดือน</label>
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
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
                  <Tags className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold flex items-center gap-2">
                    {cat.name}
                    {cat.is_admin_only && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">ผู้บริหารเท่านั้น</span>
                    )}
                    {cat.is_fixed_cost && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">🏷️ ต้นทุนคงที่</span>
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
                className="form-input"
                placeholder="ชื่อ..."
                value={newCustomer.name}
                onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ชื่อบริษัท (ถ้ามี)</label>
              <input
                className="form-input"
                placeholder="บริษัท..."
                value={newCustomer.company}
                onChange={e => setNewCustomer({ ...newCustomer, company: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">เบอร์โทร</label>
              <input
                className="form-input"
                placeholder="เบอร์โทร..."
                value={newCustomer.phone}
                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">รหัสผู้เสียภาษี</label>
              <input
                className="form-input"
                placeholder="13 หลัก..."
                value={newCustomer.tax_id}
                onChange={e => setNewCustomer({ ...newCustomer, tax_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block text-amber-400">แจ้งเตือน AR ค้างชำระ (วัน)</label>
              <input
                type="number"
                className="form-input"
                value={newCustomer.ar_reminder_days}
                onChange={e => setNewCustomer({ ...newCustomer, ar_reminder_days: e.target.value })}
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
              <select className="form-select"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <h3 className="text-white font-medium text-lg">แก้ไขข้อมูลลูกค้า</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-1 block">ชื่อลูกค้า *</label>
                <input
                  className="form-input"
                  value={editCustomer.name}
                  onChange={e => setEditCustomer({ ...editCustomer, name: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-1 block">ชื่อบริษัท (ถ้ามี)</label>
                <input
                  className="form-input"
                  value={editCustomer.company || ''}
                  onChange={e => setEditCustomer({ ...editCustomer, company: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">เบอร์โทร</label>
                <input
                  className="form-input"
                  value={editCustomer.phone || ''}
                  onChange={e => setEditCustomer({ ...editCustomer, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">รหัสผู้เสียภาษี</label>
                <input
                  className="form-input"
                  value={editCustomer.tax_id || ''}
                  onChange={e => setEditCustomer({ ...editCustomer, tax_id: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block text-amber-400">แจ้งเตือน AR ค้างชำระ (วัน)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editCustomer.ar_reminder_days}
                  onChange={e => setEditCustomer({ ...editCustomer, ar_reminder_days: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">สาขา *</label>
                <select className="form-select"
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
// TAB 7: Combined Menu & Channels
// ============================================================

// ============================================================
// TAB 3: Products & Categories (เมนูขายหลัก)
// ============================================================

function ProductsTab() {
  const navigate = useNavigate();
  const [newlyCreatedProd, setNewlyCreatedProd] = useState(null);
  const [categories, setCategories]   = useState([]);
  const [products, setProducts]       = useState([]);
  const [bomCosts, setBomCosts]       = useState({}); // { product_id: calculatedCost }
  const [loading, setLoading]         = useState(true);
  const [salesChannels, setSalesChannels] = useState(() => getSalesChannels());

  // Category state
  const [showAddCat, setShowAddCat]   = useState(false);
  const [newCat, setNewCat]           = useState({ name: '' });
  const [editCat, setEditCat]         = useState(null);

  const [showAddProd, setShowAddProd] = useState(false);
  const [newProd, setNewProd]         = useState({ name: '', price: '', category_id: '', is_available: true, sort_order: 0, menu_prices: {}, misc_cost_type: 'PERCENT', misc_cost_value: 0 });
  const [editProd, setEditProd]       = useState(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [imgPreview, setImgPreview]   = useState(null); // for new product
  const [imgFile, setImgFile]         = useState(null);
  const [editImgFile, setEditImgFile] = useState(null);
  const [editImgPreview, setEditImgPreview] = useState(null);

  const [showAddChannels, setShowAddChannels] = useState(false);
  const [showEditChannels, setShowEditChannels] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedData = results.data;
        if (!parsedData || parsedData.length === 0) return;

        const insertData = [];
        let maxSortOrder = products.length > 0 ? Math.max(...products.map(p => p.sort_order || 0)) : 0;
        
        for (const row of parsedData) {
          if (!row['ชื่อเมนู'] && !row['Name']) continue;
          maxSortOrder++;
          
          insertData.push({
            name: (row['ชื่อเมนู'] || row['Name'] || '').trim(),
            price: parseFloat(row['ราคา'] || row['Price'] || 0),
            cost: 0,
            is_available: true,
            sort_order: maxSortOrder,
            misc_cost_type: 'PERCENT',
            misc_cost_value: 0
          });
        }

        if (insertData.length > 0) {
           setLoading(true);
           try {
              const { error } = await supabase.from('products').insert(insertData);
              if (error) {
                alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ' + error.message);
              } else {
                alert(`นำเข้าเมนูสำเร็จ ${insertData.length} รายการ`);
                loadData();
              }
           } catch (err) {
              alert('เกิดข้อผิดพลาด: ' + err.message);
           } finally {
              setLoading(false);
           }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        alert('ไม่สามารถอ่านไฟล์ CSV ได้: ' + err.message);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  // Reload channels if Settings page is visited or if channels are updated
  useEffect(() => {
    const syncChannels = () => setSalesChannels(getSalesChannels());
    syncChannels();
    window.addEventListener('salesChannelsUpdate', syncChannels);
    return () => window.removeEventListener('salesChannelsUpdate', syncChannels);
  }, []);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [catRes, prodRes, bomRes, mpRes, comboRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*, categories(name)').order('sort_order'),
        supabase.from('menu_item_ingredients')
          .select('menu_item_id, qty_required, inventory_items(cost_per_stock_unit, yield_pct)'),
        supabase.from('menu_prices').select('*'),
        supabase.from('product_combo_items').select('*')
      ]);
      setCategories(catRes.data || []);

      const comboMap = {};
      (comboRes.data || []).forEach(row => {
        if (!comboMap[row.combo_product_id]) comboMap[row.combo_product_id] = [];
        comboMap[row.combo_product_id].push(row);
      });

      const mpData = mpRes?.data || [];
      const mpMap = {};
      mpData.forEach(row => {
        if (!mpMap[row.menu_id]) mpMap[row.menu_id] = {};
        mpMap[row.menu_id][row.channel] = {
           price: row.price,
           is_available: row.is_available
        };
      });

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

      setProducts(prods.map(p => {
        const cost = costMap[p.id] !== undefined ? parseFloat((costMap[p.id]).toFixed(2)) : p.cost;
        return { 
          ...p, 
          cost, 
          menu_prices: mpMap[p.id] || {},
          combo_items: comboMap[p.id] || []
        };
      }));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // --- Combo Helper Component ---
  const ComboItemsList = ({ items, onChange, availableProducts }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filtered = availableProducts.filter(p => 
      (p.product_type || 'STANDARD') !== 'COMBO' && 
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 mt-2">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">📦 สินค้าในเซ็ต (เฉพาะเมนูปกติ)</label>
          {items.length > 0 && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
              รวม {items.length} รายการ
            </span>
          )}
        </div>
        
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input className="form-input pl-9 text-xs py-2" placeholder="ค้นหาเมนูมาตรฐานเพื่อเพิ่ม..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          {searchTerm && (
            <div className="absolute top-full left-0 right-0 z-[60] mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-40 overflow-y-auto">
              {filtered.map(p => (
                <button key={p.id} onClick={() => { 
                  if (!items.find(i => i.item_product_id === p.id)) {
                    onChange([...items, { item_product_id: p.id, quantity: 1 }]);
                  }
                  setSearchTerm('');
                }} className="w-full text-left p-2.5 hover:bg-slate-700 border-b border-slate-700/50 last:border-0 text-xs text-slate-200">
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {items.map(item => {
            const p = availableProducts.find(x => x.id === item.item_product_id);
            return (
              <div key={item.item_product_id} className="flex items-center justify-between bg-slate-800/80 rounded-lg p-2 border border-slate-700/30">
                <span className="text-xs text-white truncate flex-1">{p?.name}</span>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" className="form-input w-12 text-center text-[10px] py-1 px-1" value={item.quantity} onChange={e => {
                    const val = parseInt(e.target.value);
                    if (val > 0) onChange(items.map(i => i.item_product_id === item.item_product_id ? { ...i, quantity: val } : i));
                  }} />
                  <button onClick={() => onChange(items.filter(i => i.item_product_id !== item.item_product_id))} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <div className="text-center py-4 text-slate-600 text-[10px] border border-dashed border-slate-700/50 rounded-lg">ยังไม่มีสินค้าในเซ็ต</div>}
        </div>
      </div>
    );
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
        misc_cost_type: newProd.misc_cost_type || 'PERCENT',
        misc_cost_value: Number(newProd.misc_cost_value || 0),
        product_type: newProd.product_type || 'STANDARD'
      }).select().single();
      if (error) { alert('ไม่สามารถเพิ่มเมนูได้: ' + error.message); return; }

      if (imgFile && inserted?.id) {
        const url = await uploadImage(imgFile, inserted.id);
        await supabase.from('products').update({ image_url: url }).eq('id', inserted.id);
      }

      // Handle Combo Items
      if (newProd.product_type === 'COMBO' && newProd.combo_items?.length > 0) {
        const comboInserts = newProd.combo_items.map(ci => ({
          combo_product_id: inserted.id,
          item_product_id: ci.item_product_id,
          quantity: ci.quantity
        }));
        await supabase.from('product_combo_items').insert(comboInserts);
      }

      const mpInserts = [];
      salesChannels.filter(ch => ch.id !== 'dine_in').forEach(ch => {
        const mp = newProd.menu_prices?.[ch.id];
        if (mp) {
           if ((mp.price !== '' && mp.price !== null && mp.price !== undefined) || mp.is_available === false) {
               mpInserts.push({
                   menu_id: inserted.id,
                   channel: ch.id,
                   price: mp.price && mp.price !== '' ? parseFloat(mp.price) : null,
                   is_available: mp.is_available !== false
               });
           }
        }
      });
      if (mpInserts.length > 0) {
        await supabase.from('menu_prices').insert(mpInserts);
      }

      setNewProd({
        name: '',
        price: '',
        category_id: '',
        is_available: true,
        sort_order: 0,
        menu_prices: {},
        misc_cost_type: 'PERCENT',
        misc_cost_value: 0,
        product_type: 'STANDARD',
        combo_items: []
      });
      setImgFile(null); setImgPreview(null);
      setShowAddProd(false);
      setNewlyCreatedProd(inserted);
      loadData();
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
        misc_cost_type: editProd.misc_cost_type || 'PERCENT',
        misc_cost_value: Number(editProd.misc_cost_value || 0),
        product_type: editProd.product_type || 'STANDARD'
      }).eq('id', editProd.id);
      if (error) { alert('ไม่สามารถแก้ไขเมนูได้'); return; }

      // Handle Combo Items
      if (editProd.product_type === 'COMBO') {
        // Delete old and insert new (simplified sync)
        await supabase.from('product_combo_items').delete().eq('combo_product_id', editProd.id);
        if (editProd.combo_items?.length > 0) {
          const comboInserts = editProd.combo_items.map(ci => ({
            combo_product_id: editProd.id,
            item_product_id: ci.item_product_id,
            quantity: ci.quantity
          }));
          await supabase.from('product_combo_items').insert(comboInserts);
        }
      }

      const mpUpserts = [];
      salesChannels.filter(ch => ch.id !== 'dine_in').forEach(ch => {
        const mp = editProd.menu_prices?.[ch.id];
        if (mp) {
           mpUpserts.push({
               menu_id: editProd.id,
               channel: ch.id,
               price: mp.price && mp.price !== '' ? parseFloat(mp.price) : null,
               is_available: mp.is_available !== false
           });
        }
      });
      if (mpUpserts.length > 0) {
        await supabase.from('menu_prices').upsert(mpUpserts, { onConflict: 'menu_id,channel' });
      }
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

  const inputCls = 'form-input';

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-white text-xl font-bold">จัดการเมนูขาย</h2>
      </div>

      {/* ═══ Section: Categories ═══ */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-800">
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
      <div className="bg-slate-800 border border-slate-700/50 rounded-xl overflow-hidden mt-6 shadow-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-800">
          <h3 className="text-white font-medium text-base">รายการเมนู ({products.length})</h3>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-sm gap-1.5"
              title="อัพโหลดไฟล์ CSV (รองรับคอลัมน์ 'ชื่อเมนู' และ 'ราคา')">
              <FileUp className="w-3.5 h-3.5" />
              อัพโหลด CSV
            </button>
            <button onClick={() => setShowAddProd(!showAddProd)}
              className="flex items-center justify-center bg-[#3b82f6] hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-sm">
              เพิ่มเมนูใหม่
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#111827]">
          {showAddProd && (
            <div className="bg-slate-800 border border-blue-500/30 rounded-xl p-5 mb-6 space-y-4 shadow-inner overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                <h4 className="text-white font-medium">เพิ่มเมนูขาย</h4>
              </div>
              
              <div className="space-y-4">
                {/* General Info Block */}
                <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4">
                  <h5 className="text-white font-semibold mb-4 block">ข้อมูลเมนู (General Info)</h5>
                  <div className="flex flex-col gap-4">
                    {/* Upload Box */}
                    <label className="shrink-0 bg-slate-900 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-400 transition-colors relative overflow-hidden mx-auto" style={{ width: '120px', height: '120px' }}>
                       <input type="file" accept="image/*" className="hidden" onChange={e => onImgChange(e, false)} />
                       {imgPreview ? (
                          <img src={imgPreview} className="w-full h-full object-cover" alt="preview" />
                       ) : (
                          <>
                             <Upload className="w-6 h-6 mb-2 text-slate-400" />
                             <span className="text-xs text-slate-400">เพิ่มรูปภาพ</span>
                          </>
                       )}
                    </label>
                    
                    {/* Fields */}
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div style={{ gridColumn: 'span 2' }}>
                         <label className="form-label">ชื่อเมนู <span className="text-red-500">*</span></label>
                         <input className="form-input" placeholder="เช่น หมูปิ้งติดมัน_ไม้ใหญ่" value={newProd.name} onChange={e => setNewProd({ ...newProd, name: e.target.value })} />
                      </div>
                      
                      <div style={{ gridColumn: 'span 2' }}>
                         <label className="form-label">ประเภทสินค้า</label>
                         <div className="flex gap-2">
                            {['STANDARD', 'COMBO'].map(t => (
                               <button key={t} type="button" onClick={() => setNewProd({ ...newProd, product_type: t })}
                                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${newProd.product_type === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                                  {t === 'STANDARD' ? '💎 เมนูปกติ' : '🎁 เมนูเซ็ต (Combo)'}
                               </button>
                            ))}
                         </div>
                      </div>

                      <div className={newProd.product_type === 'COMBO' ? 'col-span-2' : ''}>
                         <label className="form-label">หมวดหมู่ <span className="text-red-500">*</span></label>
                         <select className="form-input" value={newProd.category_id} onChange={e => setNewProd({ ...newProd, category_id: e.target.value })}>
                           <option value="">-- ไม่ระบุ --</option>
                           {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                      </div>
                      {newProd.product_type !== 'COMBO' && (
                        <div>
                           <label className="form-label flex items-center gap-2">ลำดับ <span className="text-[10px] bg-slate-700 px-2 rounded-full" style={{ color: '#d1d5db', padding: '2px 8px' }}>ตัวเลือก</span></label>
                           <input type="number" className="form-input" placeholder="เช่น 1, 2, 3..." value={newProd.sort_order} onChange={e => setNewProd({ ...newProd, sort_order: e.target.value })} />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {newProd.product_type === 'COMBO' && (
                    <ComboItemsList 
                      items={newProd.combo_items || []} 
                      onChange={(items) => setNewProd({ ...newProd, combo_items: items })} 
                      availableProducts={products}
                    />
                  )}
                </div>

                {/* Pricing Block */}
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                  <h5 className="form-label" style={{ fontSize: '15px', color: '#fff', marginBottom: '16px' }}>ตั้งราคา</h5>
                  
                  {/* Main Price Box */}
                  <div className="flex items-center gap-4 border border-slate-700 rounded-xl p-3 bg-slate-900 justify-between">
                     <div className="text-white font-medium" style={{ width: '90px', flexShrink: 0 }}>หน้าร้าน</div>
                     <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2" style={{ transform: 'translateY(-50%)', color: '#9ca3af' }}>฿</span>
                        <input type="number" min="0" step="0.01" className="form-input" style={{ paddingLeft: '30px' }} placeholder="0.00" value={newProd.price} onChange={e => setNewProd({ ...newProd, price: e.target.value })} />
                     </div>
                     <div className="flex items-center gap-2" style={{ width: '80px', flexShrink: 0 }}>
                        <button onClick={() => setNewProd({...newProd, is_available: !newProd.is_available})} className={`relative inline-flex items-center rounded-full transition-colors ${newProd.is_available ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: '40px', height: '22px' }}>
                          <span className={`inline-block rounded-full bg-white transition-transform ${newProd.is_available ? 'translate-x-[18px]' : 'translate-x-1'}`} style={{ width: '14px', height: '14px' }} />
                        </button>
                     </div>
                  </div>

                  {/* Channel Collapsible Section */}
                  <div className="mt-3">
                     <button onClick={() => setShowAddChannels(!showAddChannels)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm w-full py-2">
                        {showAddChannels ? '▲' : '▼'}
                        ตั้งค่าราคาแยกตามช่องทางพิเศษ
                     </button>
                     {showAddChannels && (
                        <div className="mt-3 space-y-3 pl-3 border-l-2 border-slate-700">
                           {salesChannels.filter(ch => ch.id !== 'dine_in').map(ch => {
                              const mp = newProd.menu_prices?.[ch.id] || { price: '', is_available: true };
                              return (
                                 <div key={ch.id} className="flex items-center gap-3 border border-slate-700 rounded-xl p-2 bg-slate-900/50 justify-between">
                                    <div className="flex items-center gap-2" style={{ width: '80px', flexShrink: 0 }}>
                                       <span className="text-lg">{ch.emoji}</span>
                                       <span className="text-white text-xs font-medium truncate">{ch.label}</span>
                                    </div>
                                    <div className="flex-1 relative">
                                       <span className="absolute left-2 top-1/2" style={{ transform: 'translateY(-50%)', color: '#9ca3af' }}>฿</span>
                                       <input type="number" className="form-input" style={{ paddingLeft: '24px', paddingRight: '8px', fontSize: '13px' }} placeholder={`อิงหน้าร้าน`} value={mp.price} onChange={e => {
                                          setNewProd(prev => ({
                                             ...prev,
                                             menu_prices: {
                                                ...prev.menu_prices,
                                                [ch.id]: { ...mp, price: e.target.value }
                                             }
                                          }));
                                       }} />
                                    </div>
                                    <div className="flex items-center gap-2" style={{ width: '40px', flexShrink: 0 }}>
                                       <button onClick={(e) => {
                                           e.preventDefault();
                                           setNewProd(prev => ({
                                              ...prev,
                                              menu_prices: {
                                                 ...prev.menu_prices,
                                                 [ch.id]: { ...mp, is_available: !mp.is_available }
                                              }
                                           }));
                                       }} className={`relative inline-flex items-center rounded-full transition-colors ${mp.is_available ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: '36px', height: '20px' }}>
                                         <span className={`inline-block rounded-full bg-white transition-transform ${mp.is_available ? 'translate-x-[20px]' : 'translate-x-1'}`} style={{ width: '12px', height: '12px' }} />
                                       </button>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     )}
                  </div>
                </div>

                {/* Misc Costs */}
                <div className="bg-slate-800 border border-amber-500/30 rounded-xl p-4">
                  <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#fbbf24' }}>
                    ⚙️ Q-Factor (ต้นทุนแฝง/เครื่องปรุง/แพ็กเกจจิ้ง)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <select className="form-input" value={newProd.misc_cost_type || 'PERCENT'} onChange={e => setNewProd({ ...newProd, misc_cost_type: e.target.value })}>
                      <option value="PERCENT">% จากต้นทุนรวม</option>
                      <option value="FIXED_AMOUNT">เงินคงที่ (บาท)</option>
                    </select>
                    <input type="number" min="0" step="0.01" className="form-input" placeholder="ระบุตัวเลข" value={newProd.misc_cost_value ?? 0} onChange={e => setNewProd({ ...newProd, misc_cost_value: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 mt-4">
                💡 <strong>เคล็ดลับ:</strong> ต้นทุนจะคำนวณอัตโนมัติจากตาราง BOM+WAC — หากต้องการตั้งต้นทุนให้ไปตั้งสูตรที่หน้า <strong>สูตรอาหาร (M7C)</strong>
              </div>
              
              <div className="flex gap-3 mt-4 justify-end pt-4 border-t border-slate-700/50">
                <button onClick={() => { setShowAddProd(false); setImgFile(null); setImgPreview(null); }}
                  className="text-slate-400 hover:text-white px-5 py-2.5 rounded-lg text-sm border border-slate-600 transition-colors">ยกเลิก</button>
                <button onClick={handleAddProd} disabled={uploadingImg}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-md transition-colors">
                  <Check className="w-4 h-4" /> {uploadingImg ? 'กำลังบันทึก...' : 'บันทึกเมนูใหม่'}
                </button>
              </div>
            </div>
          )}

          {newlyCreatedProd && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl relative">
                <button onClick={() => setNewlyCreatedProd(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-white text-xl font-bold mb-1">เพิ่มเมนูสำเร็จ!</h3>
                <p className="text-slate-400 text-sm mb-6">บันทึก <strong>{newlyCreatedProd.name}</strong> เรียบร้อยแล้ว</p>
                
                {newlyCreatedProd.product_type !== 'COMBO' ? (
                  <button
                    onClick={() => navigate(`/bom?menu_id=${newlyCreatedProd.id}`)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-xl text-sm font-medium transition-all mb-3 shadow-lg shadow-blue-500/20"
                  >
                    <span className="text-base">🔗</span> ไปกำหนดสูตรอาหาร (BOM) สำหรับเมนูนี้
                  </button>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 mb-3">
                    ✨ เมนูประเภทเซ็ต (Combo) ไม่ต้องตั้งสูตรอาหารแยก <br/> ระบบจะคำนวณจากสินค้าในเซ็ตให้อัตโนมัติ
                  </div>
                )}
                <button
                  onClick={() => setNewlyCreatedProd(null)}
                  className="w-full text-slate-400 hover:text-white py-2.5 rounded-xl text-sm font-medium transition-colors border border-slate-700 hover:border-slate-600 hover:bg-slate-800"
                >
                  ปิด (ยังไม่กำหนดสูตร)
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
                        <p className="text-slate-200 text-base font-semibold truncate">
                          {prod.name}
                          {prod.product_type === 'COMBO' && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded border border-violet-500/30">🎁 เซ็ต</span>}
                        </p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" style={{ overflowY: 'auto' }}>
          <div className="bg-slate-800 rounded-xl p-5 w-full max-w-lg border border-slate-700 mx-auto" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
              <h3 className="text-white font-semibold text-lg">แก้ไขเมนู</h3>
              <button onClick={() => { setEditProd(null); setEditImgFile(null); setEditImgPreview(null); }} className="text-slate-400 hover:text-white">
                 <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="space-y-4">
                {/* General Info Block */}
                <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4">
                  <h5 className="text-white font-semibold mb-4 block">ข้อมูลเมนู (General Info)</h5>
                  <div className="flex flex-col gap-4">
                    {/* Upload Box */}
                    <label className="shrink-0 bg-slate-900 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-400 transition-colors relative overflow-hidden mx-auto" style={{ width: '120px', height: '120px' }}>
                       <input type="file" accept="image/*" className="hidden" onChange={e => onImgChange(e, true)} />
                       {(editImgPreview || editProd.image_url) ? (
                          <img src={editImgPreview || editProd.image_url} className="w-full h-full object-cover" alt="preview" />
                       ) : (
                          <>
                             <Upload className="w-6 h-6 mb-2 text-slate-400" />
                             <span className="text-xs text-slate-400">เปลี่ยนรูปภาพ</span>
                          </>
                       )}
                    </label>
                    
                    {/* Fields */}
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div style={{ gridColumn: 'span 2' }}>
                         <label className="form-label">ชื่อเมนู <span className="text-red-500">*</span></label>
                         <input className="form-input" value={editProd.name} onChange={e => setEditProd({ ...editProd, name: e.target.value })} />
                      </div>

                      <div style={{ gridColumn: 'span 2' }}>
                         <label className="form-label">ประเภทสินค้า</label>
                         <div className="flex gap-2">
                            {['STANDARD', 'COMBO'].map(t => (
                               <button key={t} type="button" onClick={() => setEditProd({ ...editProd, product_type: t })}
                                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${editProd.product_type === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                                  {t === 'STANDARD' ? '💎 เมนูปกติ' : '🎁 เมนูเซ็ต (Combo)'}
                               </button>
                            ))}
                         </div>
                      </div>

                      <div className={editProd.product_type === 'COMBO' ? 'col-span-2' : ''}>
                         <label className="form-label">หมวดหมู่ <span className="text-red-500">*</span></label>
                         <select className="form-input" value={editProd.category_id || ''} onChange={e => setEditProd({ ...editProd, category_id: e.target.value })}>
                           <option value="">-- ไม่ระบุ --</option>
                           {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                      </div>
                      {editProd.product_type !== 'COMBO' && (
                        <div>
                           <label className="form-label flex items-center gap-2">ลำดับ <span className="text-[10px] bg-slate-700 px-2 rounded-full" style={{ color: '#d1d5db', padding: '2px 8px' }}>ตัวเลือก</span></label>
                           <input type="number" className="form-input" value={editProd.sort_order ?? 0} onChange={e => setEditProd({ ...editProd, sort_order: e.target.value })} />
                        </div>
                      )}
                    </div>
                  </div>

                  {editProd.product_type === 'COMBO' && (
                    <ComboItemsList 
                      items={editProd.combo_items || []} 
                      onChange={(items) => setEditProd({ ...editProd, combo_items: items })} 
                      availableProducts={products}
                    />
                  )}
                </div>

                {/* Pricing Block */}
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                  <h5 className="form-label flex justify-between w-full" style={{ fontSize: '15px', color: '#fff', marginBottom: '16px' }}>
                     <span>ตั้งราคา</span>
                     {bomCosts[editProd.id] !== undefined && (
                        <span className="text-xs px-2 py-1 rounded-md" style={{ color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>ต้นทุน: ฿{bomCosts[editProd.id].toFixed(2)}</span>
                     )}
                  </h5>
                  
                  {/* Main Price Box */}
                  <div className="flex items-center gap-4 border border-slate-700 rounded-xl p-3 bg-slate-900 justify-between">
                     <div className="text-white font-medium" style={{ width: '90px', flexShrink: 0 }}>หน้าร้าน</div>
                     <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2" style={{ transform: 'translateY(-50%)', color: '#9ca3af' }}>฿</span>
                        <input type="number" min="0" step="0.01" className="form-input" style={{ paddingLeft: '30px' }} value={editProd.price} onChange={e => setEditProd({ ...editProd, price: e.target.value })} />
                     </div>
                     <div className="flex items-center gap-2" style={{ width: '80px', flexShrink: 0 }}>
                        <button onClick={() => setEditProd({...editProd, is_available: !editProd.is_available})} className={`relative inline-flex items-center rounded-full transition-colors ${editProd.is_available ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: '40px', height: '22px' }}>
                          <span className={`inline-block rounded-full bg-white transition-transform ${editProd.is_available ? 'translate-x-[18px]' : 'translate-x-1'}`} style={{ width: '14px', height: '14px' }} />
                        </button>
                     </div>
                  </div>

                  {/* Channel Collapsible Section */}
                  <div className="mt-3">
                     <button onClick={() => setShowEditChannels(!showEditChannels)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm w-full py-2">
                        {showEditChannels ? '▲' : '▼'}
                        ตั้งค่าราคาแยกตามช่องทางพิเศษ
                     </button>
                     {showEditChannels && (
                        <div className="mt-3 space-y-3 pl-3 border-l-2 border-slate-700">
                           {salesChannels.filter(ch => ch.id !== 'dine_in').map(ch => {
                              const mp = editProd.menu_prices?.[ch.id] || { price: '', is_available: true };
                              return (
                                 <div key={ch.id} className="flex items-center gap-3 border border-slate-700 rounded-xl p-2 bg-slate-900/50 justify-between">
                                    <div className="flex items-center gap-2" style={{ width: '80px', flexShrink: 0 }}>
                                       <span className="text-lg">{ch.emoji}</span>
                                       <span className="text-white text-xs font-medium truncate">{ch.label}</span>
                                    </div>
                                    <div className="flex-1 relative">
                                       <span className="absolute left-2 top-1/2" style={{ transform: 'translateY(-50%)', color: '#9ca3af' }}>฿</span>
                                       <input type="number" className="form-input" style={{ paddingLeft: '24px', paddingRight: '8px', fontSize: '13px' }} placeholder={`อิงหน้าร้าน`} value={mp.price} onChange={e => {
                                          setEditProd(prev => ({
                                             ...prev,
                                             menu_prices: {
                                                ...prev.menu_prices,
                                                [ch.id]: { ...mp, price: e.target.value }
                                             }
                                          }));
                                       }} />
                                    </div>
                                    <div className="flex items-center gap-2" style={{ width: '40px', flexShrink: 0 }}>
                                       <button onClick={(e) => {
                                           e.preventDefault();
                                           setEditProd(prev => ({
                                              ...prev,
                                              menu_prices: {
                                                 ...prev.menu_prices,
                                                 [ch.id]: { ...mp, is_available: !mp.is_available }
                                              }
                                           }));
                                       }} className={`relative inline-flex items-center rounded-full transition-colors ${mp.is_available ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: '36px', height: '20px' }}>
                                         <span className={`inline-block rounded-full bg-white transition-transform ${mp.is_available ? 'translate-x-[20px]' : 'translate-x-1'}`} style={{ width: '12px', height: '12px' }} />
                                       </button>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     )}
                  </div>
                </div>
                
                {/* Misc Costs Edit */}
                <div className="bg-slate-800 border border-amber-500/30 rounded-xl p-4">
                  <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#fbbf24' }}>
                    ⚙️ Q-Factor (ต้นทุนแฝง/เครื่องปรุง/แพ็กเกจจิ้ง)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <select className="form-input" value={editProd.misc_cost_type || 'PERCENT'} onChange={e => setEditProd({ ...editProd, misc_cost_type: e.target.value })}>
                      <option value="PERCENT">% จากต้นทุนรวม</option>
                      <option value="FIXED_AMOUNT">เงินคงที่ (บาท)</option>
                    </select>
                    <input type="number" min="0" step="0.01" className="form-input" placeholder="ระบุตัวเลข" value={editProd.misc_cost_value ?? 0} onChange={e => setEditProd({ ...editProd, misc_cost_value: e.target.value })} />
                  </div>
                </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-slate-700/50">
              <button onClick={() => { setEditProd(null); setEditImgFile(null); setEditImgPreview(null); }}
                className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm border border-slate-600 transition-colors">ยกเลิก</button>
              <button onClick={handleEditProd} disabled={uploadingImg}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Save className="w-4 h-4" /> {uploadingImg ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editCat && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" style={{ zIndex: 100 }}>
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

// ============================================================
// TAB 8: Checklist
// ============================================================
const DEFAULT_CHECKLIST = [
  { id: 1, text: 'ปิดแก๊สและวาล์วหลักเรียบร้อย' },
  { id: 2, text: 'เช็คอุณหภูมิตู้เย็นและจดบันทึก' },
  { id: 3, text: 'ทำความสะอาดพื้นที่และทิ้งขยะ' },
  { id: 4, text: 'ปิดเครื่องใช้ไฟฟ้าที่ไม่จำเป็น' },
  { id: 5, text: 'ล็อกประตูและหน้าต่าง' },
];

function ChecklistTab() {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem('shiftChecklist');
      return saved ? JSON.parse(saved) : DEFAULT_CHECKLIST;
    } catch {
      return DEFAULT_CHECKLIST;
    }
  });
  const [newItemText, setNewItemText] = useState('');
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValue(item.text);
  };

  const saveEdit = (id) => {
    if (!editValue.trim()) return;
    setItems(items.map(item => item.id === id ? { ...item, text: editValue.trim() } : item));
    setEditingId(null);
  };

  const handleSave = () => {
    localStorage.setItem('shiftChecklist', JSON.stringify(items));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleAdd = () => {
    if (!newItemText.trim()) return;
    const newItem = {
      id: Date.now(),
      text: newItemText.trim()
    };
    setItems([...items, newItem]);
    setNewItemText('');
  };

  const handleDelete = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setItems(newItems);
  };

  const handleMoveDown = (index) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
    setItems(newItems);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-white text-xl font-semibold">ตั้งค่า Checklist ปิดกะ</h2>
          <p className="text-slate-400 text-sm mt-0.5">รายการตรวจสอบความเรียบร้อยก่อนปิดกะในหน้าแรก (Dashboard)</p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            saved ? 'bg-green-600 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {saved ? <><Check className="w-4 h-4" /> บันทึกแล้ว!</> : <><Save className="w-4 h-4" /> บันทึก Checklist</>}
        </button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4 max-w-2xl">
        <div className="flex gap-2">
          <input
            className="form-input" style={{flex: 1}}
            placeholder="ชื่อรายการตรวจสอบ..."
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={!newItemText.trim()}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> เพิ่ม
          </button>
        </div>

        <div className="space-y-2 mt-4">
          {items.map((item, index) => (
            <div key={item.id} className="flex items-center justify-between bg-slate-700/40 border border-slate-600/60 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                <span className="text-slate-400 font-medium w-6 text-center">{index + 1}.</span>
                {editingId === item.id ? (
                  <input
                    autoFocus
                    className="form-input text-sm flex-1"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit(item.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <p className="text-white text-sm truncate">{item.text}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editingId === item.id ? (
                  <>
                    <button onClick={() => saveEdit(item.id)} className="text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-400/10 p-1.5 rounded-lg transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-slate-400/70 hover:text-slate-400 hover:bg-slate-400/10 p-1.5 rounded-lg transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(item)} className="text-blue-400/70 hover:text-blue-400 hover:bg-blue-400/10 p-1.5 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="text-slate-400 hover:text-white disabled:opacity-30 p-1.5 rounded-lg transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === items.length - 1}
                      className="text-slate-400 hover:text-white disabled:opacity-30 p-1.5 rounded-lg transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              ไม่มีรายการ (กรุณาเพิ่มรายการเพื่อแสดงในหน้าปิดกะ)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: Promotions
// ============================================================
const DISCOUNT_TYPE_LABELS = {
  PERCENTAGE: { label: 'ลดเป็น %', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: '🏷️' },
  FIXED_AMOUNT: { label: 'ลดเป็นบาท', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: '💵' },
  FIXED_PRICE: { label: 'ราคาพิเศษเหมาจ่าย', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icon: '🎁' },
};

const APPLY_TO_LABELS = {
  ENTIRE_BILL: { label: 'ลดทั้งบิล', color: 'bg-amber-500/20 text-amber-300' },
  SPECIFIC_ITEM: { label: 'เฉพาะเมนู', color: 'bg-cyan-500/20 text-cyan-300' },
  CATEGORY: { label: 'ทั้งหมวดหมู่', color: 'bg-pink-500/20 text-pink-300' },
};

function PromotionsTab() {
  const { user } = useAuth();
  const [promotions, setPromotions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPromo, setEditPromo] = useState(null);
  const [salesChannels, setSalesChannels] = useState(() => getSalesChannels());

  useEffect(() => {
    const syncChannels = () => setSalesChannels(getSalesChannels());
    window.addEventListener('salesChannelsUpdate', syncChannels);
    return () => window.removeEventListener('salesChannelsUpdate', syncChannels);
  }, []);

  // Discount Limit config (stored in localStorage)
  const [discountLimit, setDiscountLimit] = useState(() => {
    try {
      const saved = localStorage.getItem('discountLimitConfig');
      return saved ? JSON.parse(saved) : { maxPercent: 100, maxAmount: 9999 };
    } catch { return { maxPercent: 100, maxAmount: 9999 }; }
  });
  const [limitSaved, setLimitSaved] = useState(false);

  const emptyForm = {
    name: '',
    discount_type: 'PERCENTAGE',
    discount_value: '',
    apply_to: 'ENTIRE_BILL',
    target_ids: [],
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    start_time: '',
    end_time: '',
    applicable_channels: [],
    is_active: true,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [promoRes, catRes, prodRes] = await Promise.all([
        supabase.from('promotions').select('*, promotion_item_mappings(*)').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('products').select('id, name, category_id').eq('is_available', true).order('name'),
      ]);
      setPromotions(promoRes.data || []);
      setCategories(catRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function openEdit(promo) {
    let apply_to = 'ENTIRE_BILL';
    let target_ids = [];
    if (promo.promotion_item_mappings && promo.promotion_item_mappings.length > 0) {
      apply_to = promo.promotion_item_mappings[0].reference_type === 'category' ? 'CATEGORY' : 'SPECIFIC_ITEM';
      target_ids = promo.promotion_item_mappings.map(m => m.reference_id);
    }
    setForm({
      ...promo,
      apply_to,
      target_ids,
      applicable_channels: promo.applicable_channels || [],
      start_date: promo.start_date || '',
      end_date: promo.end_date || '',
      start_time: promo.start_time || '',
      end_time: promo.end_time || '',
    });
    setEditPromo(promo);
    setShowForm(true);
  }

  function openNew() {
    setForm(emptyForm);
    setEditPromo(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('กรุณาใส่ชื่อโปรโมชั่น');
    if (!form.discount_value || Number(form.discount_value) <= 0) return alert('กรุณาใส่มูลค่าส่วนลด');

    const payload = {
      branch_id: user?.branch_id || null,
      name: form.name.trim(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      applicable_channels: form.applicable_channels.length > 0 ? form.applicable_channels : [],
      is_active: form.is_active,
    };

    try {
      let savedPromoId;
      if (editPromo) {
        const { error } = await supabase.from('promotions').update(payload).eq('id', editPromo.id);
        if (error) return alert('Error: ' + error.message);
        savedPromoId = editPromo.id;
        // Delete old mappings
        await supabase.from('promotion_item_mappings').delete().eq('promotion_id', savedPromoId);
      } else {
        const { data, error } = await supabase.from('promotions').insert(payload).select('id').single();
        if (error) return alert('Error: ' + error.message);
        savedPromoId = data.id;
      }
      
      // Insert new mappings if not entire bill
      if (form.apply_to !== 'ENTIRE_BILL' && form.target_ids.length > 0) {
         const refType = form.apply_to === 'CATEGORY' ? 'category' : 'product';
         const mappings = form.target_ids.map(id => ({
            promotion_id: savedPromoId,
            reference_type: refType,
            reference_id: id
         }));
         const { error: mapError } = await supabase.from('promotion_item_mappings').insert(mappings);
         if (mapError) console.error('Mapping Insert Error: ', mapError);
      }

      setShowForm(false);
      setEditPromo(null);
      setForm(emptyForm);
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('ยืนยันลบโปรโมชั่นนี้?')) return;
    const { error } = await supabase.from('promotions').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
    loadData();
  }

  async function handleToggleActive(promo) {
    const { error } = await supabase.from('promotions').update({ is_active: !promo.is_active }).eq('id', promo.id);
    if (!error) loadData();
  }

  function handleSaveLimit() {
    localStorage.setItem('discountLimitConfig', JSON.stringify(discountLimit));
    setLimitSaved(true);
    setTimeout(() => setLimitSaved(false), 2500);
  }

  function toggleChannel(channelId) {
    setForm(prev => {
      const chs = prev.applicable_channels || [];
      return {
        ...prev,
        applicable_channels: chs.includes(channelId)
          ? chs.filter(c => c !== channelId)
          : [...chs, channelId]
      };
    });
  }

  if (loading) return <div className="text-slate-400 p-8 text-center animate-pulse">กำลังโหลดโปรโมชั่น...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-white text-xl font-semibold">🎉 จัดการโปรโมชั่น</h2>
          <p className="text-slate-400 text-sm mt-0.5">สร้างแคมเปญส่วนลดอัตโนมัติ เช่น ลดเฉพาะ Grab, Happy Hour</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> สร้างโปรโมชั่นใหม่
        </button>
      </div>

      {/* Discount Limit Config */}
      <div className="bg-slate-800/50 border border-amber-500/30 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" /> ขีดจำกัดส่วนลด Manual (สำหรับพนักงาน)
          </h3>
          <button
            onClick={handleSaveLimit}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              limitSaved ? 'bg-green-600 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {limitSaved ? <><Check className="w-4 h-4" /> บันทึกแล้ว!</> : <><Save className="w-4 h-4" /> บันทึก Limit</>}
          </button>
        </div>
        <p className="text-slate-400 text-xs mb-3">พนักงานจะไม่สามารถกดส่วนลด Manual (รายชิ้น/ท้ายบิล) เกินค่าที่ตั้งไว้ได้เลย</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-slate-400 text-xs mb-1 block">สูงสุด (%) ที่ลดได้ต่อครั้ง</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="100" step="1"
                className="form-input" style={{ width: '6rem' }}
                value={discountLimit.maxPercent}
                onChange={e => setDiscountLimit(prev => ({ ...prev, maxPercent: Number(e.target.value) || 0 }))}
              />
              <span className="text-slate-400 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">สูงสุด (บาท) ที่ลดได้ต่อครั้ง</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" step="10"
                className="form-input" style={{ width: '8rem' }}
                value={discountLimit.maxAmount}
                onChange={e => setDiscountLimit(prev => ({ ...prev, maxAmount: Number(e.target.value) || 0 }))}
              />
              <span className="text-slate-400 text-sm">บาท</span>
            </div>
          </div>
        </div>
      </div>

      {/* Promotions List */}
      <div className="space-y-3">
        {promotions.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>ยังไม่มีโปรโมชั่น กดปุ่มด้านบนเพื่อสร้างแคมเปญแรกของคุณ</p>
          </div>
        ) : (
          promotions.map(promo => {
            const dtInfo = DISCOUNT_TYPE_LABELS[promo.discount_type] || { label: promo.discount_type, color: 'bg-slate-500/20 text-slate-300', icon: '🏷️' };
            const maps = promo.promotion_item_mappings || [];
            const derivedApplyTo = maps.length === 0 ? 'ENTIRE_BILL' : (maps[0]?.reference_type === 'category' ? 'CATEGORY' : 'SPECIFIC_ITEM');
            const atInfo = APPLY_TO_LABELS[derivedApplyTo] || { label: derivedApplyTo, color: 'bg-slate-500/20 text-slate-300' };
            const isExpired = promo.end_date && new Date(promo.end_date) < new Date();

            return (
              <div key={promo.id} className={`bg-slate-800/50 border rounded-xl p-4 transition-all ${
                promo.is_active && !isExpired
                  ? ''
                  : 'border-slate-700/50'
              }`} style={{ borderColor: promo.is_active && !isExpired ? 'rgba(16, 185, 129, 0.3)' : undefined, opacity: promo.is_active && !isExpired ? 1 : 0.6 }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-lg">{dtInfo.icon}</span>
                      <p className="text-white font-semibold">{promo.name}</p>
                      {isExpired && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>หมดอายุ</span>}
                      {!promo.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-600/50 text-slate-400">ปิดอยู่</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${dtInfo.color}`}>
                        {dtInfo.label}: {promo.discount_type === 'PERCENTAGE' ? `${promo.discount_value}%` : `฿${Number(promo.discount_value).toLocaleString()}`}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${atInfo.color}`}>{atInfo.label}</span>
                      {(promo.applicable_channels || []).map(ch => {
                        const chInfo = salesChannels.find(c => c.id === ch);
                        return <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{chInfo?.emoji || ''} {chInfo?.label || ch}</span>;
                      })}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      {promo.start_date && <span>📅 {promo.start_date}</span>}
                      {promo.end_date && <span>→ {promo.end_date}</span>}
                      {promo.start_time && <span>⏰ {promo.start_time} - {promo.end_time}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleToggleActive(promo)} className="p-1.5 rounded-lg transition-colors hover:bg-slate-700" title={promo.is_active ? 'ปิดโปรโมชั่น' : 'เปิดโปรโมชั่น'}>
                      {promo.is_active
                        ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                        : <ToggleLeft className="w-6 h-6 text-slate-500" />}
                    </button>
                    <button onClick={() => openEdit(promo)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20">
                      <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                    </button>
                    <button onClick={() => handleDelete(promo.id)} className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" style={{ zIndex: 100 }} onClick={() => { setShowForm(false); setEditPromo(null); }}>
          <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-6 w-full shadow-2xl overflow-y-auto" style={{ maxWidth: '42rem', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-400" />
              {editPromo ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่นใหม่'}
            </h3>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ชื่อแคมเปญ *</label>
                <input className="form-input" placeholder='เช่น "Grab Flash Sale" หรือ "Happy Hour เครื่องดื่ม"'
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              {/* Discount Type + Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">ประเภทส่วนลด</label>
                  <select className="form-select" value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })}>
                    <option value="PERCENTAGE">ลดเป็น %</option>
                    <option value="FIXED_AMOUNT">ลดเป็นบาท</option>
                    <option value="FIXED_PRICE">ราคาพิเศษเหมาจ่าย</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">มูลค่าส่วนลด *</label>
                  <div className="flex items-center gap-2">
                    <input type="number" className="form-input" placeholder="10"
                      value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} min="0" />
                    <span className="text-slate-400 text-sm shrink-0">{form.discount_type === 'PERCENTAGE' ? '%' : 'บาท'}</span>
                  </div>
                </div>
              </div>

              {/* Apply To */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ระดับการลด</label>
                <select className="form-select" value={form.apply_to} onChange={e => setForm({ ...form, apply_to: e.target.value, target_ids: [] })}>
                  <option value="ENTIRE_BILL">ลดท้ายบิลรวม</option>
                  <option value="SPECIFIC_ITEM">ลดเฉพาะเมนูที่กำหนด</option>
                  <option value="CATEGORY">ลดทั้งหมวดหมู่</option>
                </select>
              </div>

              {/* Target selection */}
              {form.apply_to === 'SPECIFIC_ITEM' && (
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">เลือกเมนูที่ต้องการลด (กดเพื่อเลือก/ยกเลิก)</label>
                  <div className="flex flex-wrap gap-1.5 overflow-y-auto p-2 bg-slate-900/50 rounded-lg border border-slate-700" style={{ maxHeight: '10rem' }}>
                    {products.map(p => (
                      <button key={p.id} type="button" onClick={() => {
                        const ids = form.target_ids || [];
                        setForm({ ...form, target_ids: ids.includes(p.id) ? ids.filter(i => i !== p.id) : [...ids, p.id] });
                      }} className={`text-xs rounded-lg border transition-all ${
                        (form.target_ids || []).includes(p.id)
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`} style={{ padding: '6px 10px', borderColor: (form.target_ids || []).includes(p.id) ? 'rgba(16, 185, 129, 0.4)' : undefined }}>{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {form.apply_to === 'CATEGORY' && (
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">เลือกหมวดหมู่ที่ต้องการลด</label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map(c => (
                      <button key={c.id} type="button" onClick={() => {
                        const ids = form.target_ids || [];
                        setForm({ ...form, target_ids: ids.includes(c.id) ? ids.filter(i => i !== c.id) : [...ids, c.id] });
                      }} className={`text-xs rounded-lg border transition-all ${
                        (form.target_ids || []).includes(c.id)
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`} style={{ padding: '6px 10px', borderColor: (form.target_ids || []).includes(c.id) ? 'rgba(16, 185, 129, 0.4)' : undefined }}>{c.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Channels */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">ช่องทางที่ใช้ได้ (ไม่เลือก = ใช้ได้ทุกช่องทาง)</label>
                <div className="flex flex-wrap gap-2">
                  {salesChannels.map(ch => (
                    <button key={ch.id} type="button" onClick={() => toggleChannel(ch.id)}
                      className={`text-xs rounded-lg border transition-all flex items-center gap-1.5 ${
                        (form.applicable_channels || []).includes(ch.id)
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`} style={{ padding: '8px 12px', borderColor: (form.applicable_channels || []).includes(ch.id) ? 'rgba(16, 185, 129, 0.4)' : undefined }}>
                      <span>{ch.emoji}</span> {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">📅 วันที่เริ่ม</label>
                  <input type="date" className="form-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">📅 วันที่สิ้นสุด (ว่างไว้ = ไม่มีกำหนด)</label>
                  <input type="date" className="form-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>

              {/* Happy Hour */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">⏰ เวลาเริ่ม Happy Hour (ว่างไว้ = ทั้งวัน)</label>
                  <input type="time" className="form-input" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">⏰ เวลาสิ้นสุด Happy Hour</label>
                  <input type="time" className="form-input" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    form.is_active ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    form.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-slate-300">{form.is_active ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-slate-700">
              <button onClick={() => { setShowForm(false); setEditPromo(null); }} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600">ยกเลิก</button>
              <button onClick={handleSave} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                <Save className="w-4 h-4" /> {editPromo ? 'บันทึกการแก้ไข' : 'สร้างโปรโมชั่น'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
