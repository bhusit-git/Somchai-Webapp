import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Calendar, RefreshCw, CheckCircle2, PauseCircle,
  Banknote, Smartphone, Truck, Users, DollarSign, Lock, ChevronDown, ChevronUp,
  AlertTriangle, ShieldCheck, CreditCard, QrCode, Wallet, HandCoins, CircleDollarSign,
  Layers, Save, Gift
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

// =====================================================
// Payment method icon/label map (same source as SalesHistory)
// =====================================================
const PM_ICON_MAP = { Banknote, QrCode, CreditCard, Truck, Users, Wallet, Smartphone, CircleDollarSign, HandCoins, Gift };

const DEFAULT_PAYMENT_METHODS = [
  { value: 'cash',      label: 'เงินสด',        icon: 'Banknote',        isDefault: true, enabled: true },
  { value: 'promptpay', label: 'PromptPay',      icon: 'QrCode',          isDefault: true, enabled: true },
  { value: 'transfer',  label: 'โอนเงิน',        icon: 'CreditCard',      isDefault: true, enabled: true },
  { value: 'Grab',      label: 'Grab',           icon: 'Truck',           isDefault: true, enabled: true },
  { value: 'Lineman',   label: 'LineMan',        icon: 'Truck',           isDefault: true, enabled: true },
  { value: 'credit',    label: 'เงินเชื่อ (AR)', icon: 'Users',           isDefault: true, enabled: true },
  { value: 'staff_meal',label: 'สวัสดิการพนักงาน', icon: 'Gift',           isDefault: true, enabled: true },
];

// function loadPaymentMethods() removed

// =====================================================
// Component
// =====================================================
export default function DailyReconciliation() {
  const { user } = useAuth();
  const branchId = user?.branch_id;
  const userId = user?.id;
  const { paymentMethods } = useSettings();

  // State
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── View Mode: 'daily' or 'channel' ──
  const [viewMode, setViewMode] = useState('daily');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [selectedChannel, setSelectedChannel] = useState('transfer');
  const [monthlyRows, setMonthlyRows] = useState([]);   // [{date, expected, actual, variance, item_status, reconId, reconData}]
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlySaving, setMonthlySaving] = useState({});
  const [monthlySummary, setMonthlySummary] = useState([]); // [{channel, label, totalExpected, totalActual, totalVariance}]

  // Data
  const [shifts, setShifts] = useState([]);
  const [digitalChannels, setDigitalChannels] = useState([]);
  const [arPayments, setArPayments] = useState([]);

  // Reconciliation record
  const [recon, setRecon] = useState(null);             // existing DB record
  const [cashItems, setCashItems] = useState([]);        // local editable state
  const [digitalItems, setDigitalItems] = useState([]);
  const [arItems, setArItems] = useState([]);
  const [dailyCashExpenses, setDailyCashExpenses] = useState(0);
  const [dailyStaffMeal, setDailyStaffMeal] = useState(0);

  // Stock count expand
  const [expandedShift, setExpandedShift] = useState(null);

  // ----- Load data when date or branch changes -----
  const loadData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const dateStart = `${selectedDate}T00:00:00+07:00`;
      const dateEnd   = `${selectedDate}T23:59:59+07:00`;

      // 1) Load closed shifts for the date
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*, opener:users!opened_by(name, full_name), closer:users!closed_by(name, full_name)')
        .eq('branch_id', branchId)
        .eq('status', 'closed')
        .gte('closed_at', dateStart)
        .lte('closed_at', dateEnd)
        .order('opened_at');

      const closedShifts = shiftData || [];
      setShifts(closedShifts);

      // 2) Load transactions for the date, group by non-cash payment_method (and cash without shift)
      const { data: txData } = await supabase
        .from('transactions')
        .select('total, payment_method, shift_id, status')
        .eq('branch_id', branchId)
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd);

      const txAll = txData || [];
      const groupedDigital = {};
      let staffMealTotal = 0;
      
      txAll.forEach(tx => {
        // Only skip cash-with-shift if there are actually closed shifts to display it in Table 1
        if (tx.payment_method?.toLowerCase() === 'cash' && tx.shift_id && closedShifts.length > 0) return;
        if (tx.payment_method?.toLowerCase() === 'credit') return; // AR handled in table 3
        
        let pm = tx.payment_method || '';
        
        // Extract staff_meal completely from Digital Reconciliation
        if (pm.toLowerCase() === 'staff_meal') {
           const amt = Number(tx.total || 0);
           if (amt < 0) staffMealTotal += amt;
           else if (tx.status === 'completed') staffMealTotal += amt;
           return;
        }

        // Find if it matches a known setting case-insensitively to normalize it
        // Check by value first, then by label as fallback
        let knownMethod = paymentMethods.find(m => m.value.toLowerCase() === pm.toLowerCase());
        if (!knownMethod) {
          knownMethod = paymentMethods.find(m => (m.label || '').toLowerCase() === pm.toLowerCase());
        }
        if (knownMethod) {
            pm = knownMethod.value;
        }
        
        if (!groupedDigital[pm]) groupedDigital[pm] = 0;
        
        const total = Number(tx.total || 0);
        if (total < 0) {
          groupedDigital[pm] += total; // Negative refund organically lowers expected
        } else if (tx.status === 'completed') {
          groupedDigital[pm] += total;
        }
      });

      // 2.5) Fetch cash expenses for the day to deduct from expected cash
      const { data: expData } = await supabase
        .from('expenses')
        .select('amount, payment_method, status, shift_id')
        .eq('branch_id', branchId)
        .eq('payment_method', 'cash')
        .neq('status', 'cancelled')
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd);

      const allCashExp = expData || [];
      const totalCashExp = allCashExp.reduce((s, e) => s + Number(e.amount || 0), 0);
      setDailyCashExpenses(totalCashExp);

      // Deduct unshifted cash expenses from groupedDigital['cash']
      allCashExp.forEach(exp => {
        if (exp.shift_id && closedShifts.length > 0) return;
        if (groupedDigital['cash'] === undefined) groupedDigital['cash'] = 0;
        groupedDigital['cash'] -= Number(exp.amount || 0);
      });

      const digArr = Object.entries(groupedDigital).map(([channel, expected]) => ({
        channel,
        label: paymentMethods.find(m => m.value === channel)?.label || channel,
        expected,
      }));
      setDigitalChannels(digArr);
      setDailyStaffMeal(staffMealTotal);

      // 3) Load AR records (accounts receivable) created on this date
      const { data: arData } = await supabase
        .from('accounts_receivable')
        .select('*')
        .eq('branch_id', branchId)
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd);

      const arRecords = arData || [];
      setArPayments(arRecords);

      // 4) Load existing reconciliation record
      const { data: reconData } = await supabase
        .from('daily_reconciliations')
        .select('*')
        .eq('branch_id', branchId)
        .eq('reconciliation_date', selectedDate)
        .maybeSingle();

      setRecon(reconData);

      // Build local editable state
      if (reconData) {
        // Restore from DB
        setCashItems(reconData.cash_data || []);
        // For AR items: restore saved data but also merge in any live ARs that are missing
        const savedAr = reconData.ar_data || [];
        const mergedAr = [...savedAr];
        
        arRecords.forEach(liveAr => {
          const alreadySaved = mergedAr.find(a => a.ar_id === liveAr.id);
          if (!alreadySaved) {
            mergedAr.push({
              ar_id: liveAr.id,
              customer_name: liveAr.customer_name || '-',
              customer_company: liveAr.customer_company || '',
              expected: Number(liveAr.total_amount || 0),
              paid_amount: Number(liveAr.paid_amount || 0),
              outstanding: Number(liveAr.total_amount || 0) - Number(liveAr.paid_amount || 0),
              due_date: liveAr.due_date,
              status: liveAr.status,
              actual: '',
              variance: 0,
              item_status: 'pending',
            });
          } else {
            // Update live fields in case they changed
            alreadySaved.customer_name = liveAr.customer_name || '-';
            alreadySaved.customer_company = liveAr.customer_company || '';
            alreadySaved.expected = Number(liveAr.total_amount || 0);
            alreadySaved.paid_amount = Number(liveAr.paid_amount || 0);
            alreadySaved.outstanding = Number(liveAr.total_amount || 0) - Number(liveAr.paid_amount || 0);
            alreadySaved.due_date = liveAr.due_date;
            alreadySaved.status = liveAr.status;
          }
        });
        
        setArItems(mergedAr);

        // Helper: check if two channel items are the same (cross-compare channel key + label)
        const isSameChannel = (a, b) => {
          const ac = (a.channel || '').toLowerCase();
          const al = (a.label || a.channel || '').toLowerCase();
          const bc = (b.channel || '').toLowerCase();
          const bl = (b.label || b.channel || '').toLowerCase();
          return ac === bc || al === bl || ac === bl || al === bc;
        };

        // For digital items: restore saved data but also merge in any live channels
        // that are missing from the saved record (e.g., cash was missing before the fix)
        const savedDigital = reconData.digital_data || [];
        const uniqueSavedDigital = [];
        // De-duplicate saved digital channels
        savedDigital.forEach(item => {
          if (!uniqueSavedDigital.find(d => isSameChannel(d, item))) {
            uniqueSavedDigital.push({ ...item });
          }
        });

        const mergedDigital = [...uniqueSavedDigital];
        
        digArr.forEach(liveChannel => {
          const alreadySaved = mergedDigital.find(d => isSameChannel(d, liveChannel));
          if (!alreadySaved) {
            // This channel exists in live data but was NOT saved in the recon record — add it
            mergedDigital.push({
              channel: liveChannel.channel,
              label: liveChannel.label,
              expected: liveChannel.expected,
              actual: '',
              variance: 0,
              item_status: 'pending',
            });
          } else {
            // Update expected from live data to keep it fresh
            alreadySaved.expected = liveChannel.expected;
          }
        });
        
        setDigitalItems(mergedDigital);
      } else {
        // Fresh: build from live data
        const freshCash = closedShifts.map(sh => ({
          shift_id: sh.id,
          opener: sh.opener?.full_name || sh.opener?.name || '-',
          closer: sh.closer?.full_name || sh.closer?.name || '-',
          opened_at: sh.opened_at,
          closed_at: sh.closed_at,
          expected: Number(sh.expected_cash || 0),
          staff_count: Number(sh.closing_cash || 0),
          actual: '',
          variance: 0,
          item_status: 'pending',
        }));
        setCashItems(freshCash);

        const freshDigital = digArr.map(d => ({
          channel: d.channel,
          label: d.label,
          expected: d.expected,
          actual: '',
          variance: 0,
          item_status: 'pending',
        }));
        setDigitalItems(freshDigital);

        const freshAR = arRecords.map(ar => ({
          ar_id: ar.id,
          customer_name: ar.customer_name || '-',
          customer_company: ar.customer_company || '',
          expected: Number(ar.total_amount || 0),
          paid_amount: Number(ar.paid_amount || 0),
          outstanding: Number(ar.total_amount || 0) - Number(ar.paid_amount || 0),
          due_date: ar.due_date,
          status: ar.status,
          actual: '',
          variance: 0,
          item_status: 'pending',
        }));
        setArItems(freshAR);
      }
    } catch (err) {
      console.error('[Reconciliation] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [branchId, selectedDate, paymentMethods]);

  useEffect(() => { if (viewMode === 'daily') loadData(); }, [loadData, viewMode]);

  // =====================================================
  // BATCH CHANNEL MODE — Monthly Data Loading (Optimized)
  // =====================================================

  // Helper: convert UTC timestamp to Thailand local date string 'YYYY-MM-DD'
  function toLocalDate(isoString) {
    return new Date(isoString).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  }

  // Helper: normalize payment method key via paymentMethods settings
  function normalizePM(rawPM) {
    let pm = rawPM || '';
    let known = paymentMethods.find(m => m.value.toLowerCase() === pm.toLowerCase());
    if (!known) known = paymentMethods.find(m => (m.label || '').toLowerCase() === pm.toLowerCase());
    return known ? known.value : pm;
  }

  const loadMonthlyAll = useCallback(async () => {
    if (!branchId || !selectedMonth || !selectedChannel) return;
    setMonthlyLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const dateStart = `${selectedMonth}-01T00:00:00+07:00`;
      const dateEnd = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}T23:59:59+07:00`;
      const dateStartSQL = `${selectedMonth}-01`;
      const dateEndSQL = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;

      // ── Fetch all 3 data sources in PARALLEL ──
      const [txRes, expRes, reconRes] = await Promise.all([
        supabase.from('transactions')
          .select('total, payment_method, shift_id, created_at, status')
          .eq('branch_id', branchId)
          .gte('created_at', dateStart)
          .lte('created_at', dateEnd)
          .limit(10000),
        supabase.from('expenses')
          .select('amount, payment_method, created_at, status')
          .eq('branch_id', branchId)
          .eq('payment_method', 'cash')
          .neq('status', 'cancelled')
          .gte('created_at', dateStart)
          .lte('created_at', dateEnd)
          .limit(10000),
        supabase.from('daily_reconciliations')
          .select('*')
          .eq('branch_id', branchId)
          .gte('reconciliation_date', dateStartSQL)
          .lte('reconciliation_date', dateEndSQL)
          .limit(1000),
      ]);

      const txAll = txRes.data || [];
      const expAll = expRes.data || [];
      const reconAll = reconRes.data || [];

      const isSameCh = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

      // =============================================
      // A) Build per-channel monthly SUMMARY
      // =============================================
      const channelExpected = {};
      txAll.forEach(tx => {
        if (tx.payment_method?.toLowerCase() === 'credit') return;
        if (tx.payment_method?.toLowerCase() === 'staff_meal') return; // Exclude staff meal from recon channels
        const total = Number(tx.total || 0);
        if (total >= 0 && tx.status !== 'completed') return;
        const pm = normalizePM(tx.payment_method);
        if (!channelExpected[pm]) channelExpected[pm] = 0;
        channelExpected[pm] += total;
      });

      // Deduct cash expenses
      if (expAll.length > 0) {
        if (channelExpected['cash'] === undefined) channelExpected['cash'] = 0;
        expAll.forEach(exp => {
          channelExpected['cash'] -= Number(exp.amount || 0);
        });
      }

      const channelActual = {};
      reconAll.forEach(rec => {
        (rec.digital_data || []).forEach(d => {
          if (d.item_status !== 'confirmed') return;
          let key = d.channel;
          let known = paymentMethods.find(m => isSameCh(m.value, key));
          if (!known) known = paymentMethods.find(m => isSameCh(m.label, key) || isSameCh(m.label, d.label));
          if (known) key = known.value;
          if (!channelActual[key]) channelActual[key] = 0;
          channelActual[key] += Number(d.actual || 0);
        });
        (rec.cash_data || []).forEach(c => {
          if (c.item_status !== 'confirmed') return;
          if (!channelActual['cash']) channelActual['cash'] = 0;
          channelActual['cash'] += Number(c.actual || 0);
        });
      });

      const allKeys = new Set([...Object.keys(channelExpected), ...Object.keys(channelActual)]);
      const summary = [];
      allKeys.forEach(key => {
        if (key.toLowerCase() === 'credit') return;
        const exp = channelExpected[key] || 0;
        const act = channelActual[key] || 0;
        const meth = paymentMethods.find(m => isSameCh(m.value, key));
        summary.push({
          channel: key,
          label: meth?.label || key,
          icon: meth?.icon || 'CircleDollarSign',
          totalExpected: exp,
          totalActual: act,
          totalVariance: act - exp,
        });
      });
      summary.sort((a, b) => {
        if (a.channel === 'cash') return -1;
        if (b.channel === 'cash') return 1;
        return (a.label || '').localeCompare(b.label || '');
      });
      setMonthlySummary(summary);

      // =============================================
      // B) Build per-day ROWS for selectedChannel
      // =============================================
      const dailyExpected = {};
      txAll.forEach(tx => {
        const localDate = toLocalDate(tx.created_at);
        const pm = tx.payment_method?.toLowerCase() || '';
        const selVal = selectedChannel.toLowerCase();

        if (selVal === 'cash') {
          if (pm !== 'cash') return;
        } else {
          const chObj = paymentMethods.find(m => m.value === selectedChannel);
          const chLabel = (chObj?.label || '').toLowerCase();
          if (pm !== selVal && pm !== chLabel) {
            if (!(pm === 'lineman' && chLabel.includes('lineman')) &&
                !(pm === 'grab' && chLabel.includes('grab'))) {
              return;
            }
          }
        }

        if (!dailyExpected[localDate]) dailyExpected[localDate] = 0;
        const total = Number(tx.total || 0);
        if (total < 0) {
          dailyExpected[localDate] += total;
        } else if (tx.status === 'completed') {
          dailyExpected[localDate] += total;
        }
      });

      if (selectedChannel.toLowerCase() === 'cash') {
        expAll.forEach(exp => {
          const localDate = toLocalDate(exp.created_at);
          if (!dailyExpected[localDate]) dailyExpected[localDate] = 0;
          dailyExpected[localDate] -= Number(exp.amount || 0);
        });
      }

      const reconMap = {};
      reconAll.forEach(r => { reconMap[r.reconciliation_date] = r; });

      const rows = [];
      const today = toLocalDate(new Date().toISOString());
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
        if (dateStr > today) continue;

        const expected = dailyExpected[dateStr] || 0;
        const reconRec = reconMap[dateStr] || null;
        const isDateLocked = reconRec?.status === 'completed';

        let savedActual = '';
        let savedStatus = 'pending';
        let savedVariance = 0;

        if (reconRec) {
          const digData = reconRec.digital_data || [];
          const found = digData.find(d => d.channel.toLowerCase() === selectedChannel.toLowerCase());
          if (found) {
            savedActual = found.actual !== undefined && found.actual !== '' ? found.actual : '';
            savedStatus = found.item_status || 'pending';
            savedVariance = found.variance || 0;
          }

          if (selectedChannel === 'cash') {
            let totalCashActual = 0;
            let hasConfirmed = false;
            (reconRec.cash_data || []).forEach(c => {
              if (c.item_status === 'confirmed') {
                totalCashActual += Number(c.actual || 0);
                hasConfirmed = true;
              }
            });
            if (found?.item_status === 'confirmed') {
              totalCashActual += Number(found.actual || 0);
              hasConfirmed = true;
            }
            if (hasConfirmed) {
              savedActual = totalCashActual;
              savedStatus = 'confirmed';
              savedVariance = totalCashActual - expected;
            } else if (found) {
              savedActual = found.actual !== undefined && found.actual !== '' ? found.actual : '';
              savedStatus = found.item_status || 'pending';
              savedVariance = found.variance || 0;
            }
          }
        }

        rows.push({
          date: dateStr,
          expected,
          actual: savedActual,
          variance: savedVariance,
          item_status: savedStatus,
          reconId: reconRec?.id || null,
          reconData: reconRec,
          isLocked: isDateLocked,
        });
      }

      setMonthlyRows(rows);
    } catch (err) {
      console.error('[Monthly] Error:', err);
    } finally {
      setMonthlyLoading(false);
    }
  }, [branchId, selectedMonth, selectedChannel, paymentMethods]);

  useEffect(() => {
    if (viewMode === 'channel') loadMonthlyAll();
  }, [loadMonthlyAll, viewMode]);

  // ── Monthly row update helpers ──
  function updateMonthlyActual(idx, val) {
    const updated = [...monthlyRows];
    updated[idx] = {
      ...updated[idx],
      actual: val,
      variance: val !== '' ? Number(val) - updated[idx].expected : 0,
    };
    setMonthlyRows(updated);
  }

  async function confirmMonthlyRow(idx) {
    const row = monthlyRows[idx];
    const actualVal = row.actual !== '' ? Number(row.actual) : row.expected;
    setMonthlySaving(prev => ({ ...prev, [idx]: true }));
    try {
      const dateStr = row.date;

      // Fetch or create the daily_reconciliations record for this date
      let reconRec = row.reconData;
      if (!reconRec) {
        // Try to fetch from DB (in case someone else created it)
        const { data: existing } = await supabase
          .from('daily_reconciliations')
          .select('*')
          .eq('branch_id', branchId)
          .eq('reconciliation_date', dateStr)
          .maybeSingle();
        reconRec = existing;
      }

      // Build the channel entry
      const channelEntry = {
        channel: selectedChannel,
        label: paymentMethods.find(m => m.value === selectedChannel)?.label || selectedChannel,
        expected: row.expected,
        actual: actualVal,
        variance: actualVal - row.expected,
        item_status: 'confirmed',
      };

      if (reconRec) {
        // Update existing: merge this channel into digital_data
        const digData = [...(reconRec.digital_data || [])];
        const existIdx = digData.findIndex(d => d.channel === selectedChannel);
        if (existIdx >= 0) digData[existIdx] = channelEntry;
        else digData.push(channelEntry);

        const { error } = await supabase.from('daily_reconciliations').update({
          digital_data: digData,
          updated_at: new Date().toISOString(),
        }).eq('id', reconRec.id);

        if (error) { alert('บันทึกล้มเหลว: ' + error.message); return; }
      } else {
        // Create new record
        const payload = {
          branch_id: branchId,
          reconciliation_date: dateStr,
          cash_data: [],
          digital_data: [channelEntry],
          ar_data: [],
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('daily_reconciliations').insert(payload);
        if (error) { alert('บันทึกล้มเหลว: ' + error.message); return; }
      }

      // Update local state
      const updated = [...monthlyRows];
      updated[idx] = {
        ...updated[idx],
        actual: actualVal,
        variance: actualVal - row.expected,
        item_status: 'confirmed',
      };
      setMonthlyRows(updated);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setMonthlySaving(prev => ({ ...prev, [idx]: false }));
    }
  }

  async function reopenMonthlyRow(idx) {
    const row = monthlyRows[idx];
    setMonthlySaving(prev => ({ ...prev, [idx]: true }));
    try {
      if (row.reconData?.id) {
        const digData = [...(row.reconData.digital_data || [])];
        const existIdx = digData.findIndex(d => d.channel === selectedChannel);
        if (existIdx >= 0) {
          digData[existIdx] = { ...digData[existIdx], item_status: 'pending', actual: '', variance: 0 };
          await supabase.from('daily_reconciliations').update({
            digital_data: digData,
            updated_at: new Date().toISOString(),
          }).eq('id', row.reconData.id);
        }
      }
      const updated = [...monthlyRows];
      updated[idx] = { ...updated[idx], actual: '', item_status: 'pending', variance: 0 };
      setMonthlyRows(updated);
    } finally {
      setMonthlySaving(prev => ({ ...prev, [idx]: false }));
    }
  }

  // Monthly summary
  const monthlyTotalExpected = monthlyRows.reduce((s, r) => s + r.expected, 0);
  const monthlyTotalActual = monthlyRows.filter(r => r.item_status === 'confirmed').reduce((s, r) => s + Number(r.actual || 0), 0);
  const monthlyConfirmedCount = monthlyRows.filter(r => r.item_status === 'confirmed').length;
  const monthlyPendingCount = monthlyRows.filter(r => r.item_status === 'pending' && r.expected > 0).length;

  // ----- Helpers -----
  const isLocked = recon?.status === 'completed';

  const fmtCurrency = (v) => `฿${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ----- Save / Upsert reconciliation state to DB -----
  async function saveRecon(cashOverride, digitalOverride, arOverride) {
    const cd = cashOverride || cashItems;
    const dd = digitalOverride || digitalItems;
    const ad = arOverride || arItems;

    const payload = {
      branch_id: branchId,
      reconciliation_date: selectedDate,
      cash_data: cd,
      digital_data: dd,
      ar_data: ad,
      updated_at: new Date().toISOString(),
    };

    if (recon?.id) {
      const { error } = await supabase.from('daily_reconciliations').update(payload).eq('id', recon.id);
      if (error) { alert('บันทึกล้มเหลว: ' + error.message); return false; }
    } else {
      const { data, error } = await supabase.from('daily_reconciliations').insert(payload).select().single();
      if (error) { alert('บันทึกล้มเหลว: ' + error.message); return false; }
      setRecon(data);
    }
    return true;
  }

  // ----- Cash table handlers -----
  function updateCashActual(idx, val) {
    const updated = [...cashItems];
    updated[idx] = {
      ...updated[idx],
      actual: val,
      variance: val !== '' ? Number(val) - updated[idx].expected : 0,
    };
    setCashItems(updated);
  }

  async function confirmCashItem(idx) {
    const item = cashItems[idx];
    const actualVal = item.actual !== '' ? Number(item.actual) : item.staff_count;
    const updated = [...cashItems];
    updated[idx] = {
      ...updated[idx],
      actual: actualVal,
      variance: actualVal - item.expected,
      item_status: 'confirmed',
    };
    setCashItems(updated);
    await saveRecon(updated, null, null);
  }

  async function holdCashItem(idx) {
    const updated = [...cashItems];
    updated[idx] = { ...updated[idx], item_status: 'held' };
    setCashItems(updated);
    await saveRecon(updated, null, null);
  }

  async function reopenCashItem(idx) {
    const updated = [...cashItems];
    updated[idx] = { ...updated[idx], item_status: 'pending' };
    setCashItems(updated);
    await saveRecon(updated, null, null);
  }

  // ----- Digital table handlers -----
  function updateDigitalActual(idx, val) {
    const updated = [...digitalItems];
    updated[idx] = {
      ...updated[idx],
      actual: val,
      variance: val !== '' ? Number(val) - updated[idx].expected : 0,
    };
    setDigitalItems(updated);
  }

  async function confirmDigitalItem(idx) {
    const item = digitalItems[idx];
    const actualVal = item.actual !== '' ? Number(item.actual) : item.expected;
    const updated = [...digitalItems];
    updated[idx] = {
      ...updated[idx],
      actual: actualVal,
      variance: actualVal - item.expected,
      item_status: 'confirmed',
    };
    setDigitalItems(updated);
    await saveRecon(null, updated, null);
  }

  async function holdDigitalItem(idx) {
    const updated = [...digitalItems];
    updated[idx] = { ...updated[idx], item_status: 'held' };
    setDigitalItems(updated);
    await saveRecon(null, updated, null);
  }

  async function reopenDigitalItem(idx) {
    const updated = [...digitalItems];
    updated[idx] = { ...updated[idx], item_status: 'pending' };
    setDigitalItems(updated);
    await saveRecon(null, updated, null);
  }

  // ----- AR table handlers -----
  function updateARActual(idx, val) {
    const updated = [...arItems];
    updated[idx] = {
      ...updated[idx],
      actual: val,
      variance: val !== '' ? Number(val) - updated[idx].expected : 0,
    };
    setArItems(updated);
  }

  async function confirmARItem(idx) {
    const item = arItems[idx];
    const actualVal = item.actual !== '' ? Number(item.actual) : 0;
    
    if (actualVal > 0 && item.item_status !== 'confirmed') {
      const maxPayable = item.outstanding !== undefined ? item.outstanding : item.expected;
      let payAmount = actualVal;
      if (payAmount > maxPayable) payAmount = maxPayable; // prevent overpaying
      
      if (!confirm(`ระบบจะบันทึกรับชำระเงินยอด ${fmtCurrency(payAmount)} สำหรับลูกหนี้ "${item.customer_name}" ทันที\nยืนยันหรือไม่?`)) return;
      
      try {
        const { error: payErr } = await supabase.from('ar_payments').insert([{
          ar_id: item.ar_id,
          amount: payAmount,
          payment_method: 'cash',
          notes: 'รับชำระผ่านหน้าตรวจทานยอด (M10)'
        }]);

        if (payErr) throw payErr;

        const newPaidTotal = Number(item.paid_amount || 0) + payAmount;
        const newStatus = newPaidTotal >= item.expected ? 'paid' : 'partial';

        await supabase.from('accounts_receivable').update({
          paid_amount: newPaidTotal,
          status: newStatus
        }).eq('id', item.ar_id);
        
        // Update local object to reflect paid status
        item.outstanding = item.expected - newPaidTotal;
        item.paid_amount = newPaidTotal;
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการบันทึกรับชำระ: ' + err.message);
        return;
      }
    }

    const updated = [...arItems];
    updated[idx] = {
      ...item,
      actual: actualVal,
      variance: actualVal - item.expected,
      item_status: 'confirmed',
    };
    setArItems(updated);
    await saveRecon(null, null, updated);
  }

  async function holdARItem(idx) {
    const updated = [...arItems];
    updated[idx] = { ...updated[idx], item_status: 'held' };
    setArItems(updated);
    await saveRecon(null, null, updated);
  }

  async function reopenARItem(idx) {
    const updated = [...arItems];
    updated[idx] = { ...updated[idx], item_status: 'pending' };
    setArItems(updated);
    await saveRecon(null, null, updated);
  }

  // ----- Close day -----
  const allCashDone = cashItems.length === 0 || cashItems.every(i => i.item_status === 'confirmed' || i.item_status === 'held');
  const allDigitalDone = digitalItems.length === 0 || digitalItems.every(i => i.item_status === 'confirmed' || i.item_status === 'held');
  const allARDone = arItems.length === 0 || arItems.every(i => i.item_status === 'confirmed' || i.item_status === 'held');
  const canCloseDay = allCashDone && allDigitalDone && allARDone && !isLocked && (cashItems.length > 0 || digitalItems.length > 0 || arItems.length > 0);
  const hasAnyConfirmed = [...cashItems, ...digitalItems, ...arItems].some(i => i.item_status === 'confirmed');

  async function handleCloseDay() {
    if (!canCloseDay || !hasAnyConfirmed) return;
    if (!confirm('ยืนยันปิดยอดประจำวัน?\n\nหลังจากปิดแล้วจะไม่สามารถแก้ไขตัวเลขได้อีก\n(Owner สามารถปลดล็อกได้ภายหลัง)')) return;

    setSaving(true);
    try {
      // Save final state
      const success = await saveRecon(cashItems, digitalItems, arItems);
      if (!success) { setSaving(false); return; }

      // Mark as completed
      const reconId = recon?.id;
      if (!reconId) { alert('ไม่พบข้อมูล reconciliation'); setSaving(false); return; }

      const { error } = await supabase.from('daily_reconciliations').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: userId,
      }).eq('id', reconId);

      if (error) { alert('ปิดยอดล้มเหลว: ' + error.message); setSaving(false); return; }

      alert('✅ ปิดยอดประจำวัน ' + selectedDate + ' เรียบร้อยแล้ว');
      loadData();
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlock() {
    if (!recon?.id) return;
    if (!confirm('ปลดล็อกยอดที่ปิดไปแล้ว?\n\nจะสามารถแก้ไขตัวเลขได้อีกครั้ง')) return;

    const { error } = await supabase.from('daily_reconciliations').update({
      status: 'pending',
      completed_at: null,
      completed_by: null,
    }).eq('id', recon.id);

    if (error) alert('ปลดล็อกล้มเหลว: ' + error.message);
    else loadData();
  }

  // ----- Summary stats -----
  const unshiftedCashItem = digitalItems.find(i => i.channel === 'cash');
  const unshiftedExpected = unshiftedCashItem ? unshiftedCashItem.expected : 0;
  const unshiftedActual = unshiftedCashItem && unshiftedCashItem.item_status === 'confirmed' ? Number(unshiftedCashItem.actual || 0) : 0;

  const totalExpectedCash = cashItems.reduce((s, i) => s + i.expected, 0) + unshiftedExpected;
  const totalActualCash = cashItems.filter(i => i.item_status === 'confirmed').reduce((s, i) => s + Number(i.actual || 0), 0) + unshiftedActual;

  const totalExpectedDigital = digitalItems.filter(i => i.channel !== 'cash').reduce((s, i) => s + i.expected, 0);
  const totalActualDigital = digitalItems.filter(i => i.channel !== 'cash' && i.item_status === 'confirmed').reduce((s, i) => s + Number(i.actual || 0), 0);

  const totalExpectedAR = arItems.reduce((s, i) => s + i.expected, 0);
  const totalActualAR = arItems.filter(i => i.item_status === 'confirmed').reduce((s, i) => s + Number(i.actual || 0), 0);

  const confirmedCashCount = cashItems.filter(i => i.item_status === 'confirmed').length + (unshiftedCashItem && unshiftedCashItem.item_status === 'confirmed' ? 1 : 0);
  const confirmedDigitalCount = digitalItems.filter(i => i.item_status === 'confirmed' && i.channel !== 'cash').length;
  const confirmedARCount = arItems.filter(i => i.item_status === 'confirmed').length;

  // ----- Variance badge helper -----
  const VarianceBadge = ({ value }) => {
    if (value === 0) return <span style={{ color: 'var(--accent-success)', fontWeight: 700, fontSize: '14px' }}>0.00 ✓</span>;
    const isPositive = value > 0;
    return (
      <span style={{ color: isPositive ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 700, fontSize: '14px' }}>
        {isPositive ? '+' : ''}{fmtCurrency(value).replace('฿', '')}
      </span>
    );
  };

  // ----- Status badge helper -----
  const StatusBadge = ({ status }) => {
    if (status === 'confirmed') return <span className="badge badge-success" style={{ gap: '4px' }}><CheckCircle2 size={12}/> ยืนยันแล้ว</span>;
    if (status === 'held') return <span className="badge badge-warning" style={{ gap: '4px' }}><PauseCircle size={12}/> พักยอด</span>;
    return <span className="badge badge-ghost" style={{ gap: '4px' }}>⏳ รอตรวจ</span>;
  };

  // ----- Action Buttons -----
  const ActionButtons = ({ item, onConfirm, onHold, onReopen, locked }) => {
    if (locked) return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}><Lock size={12}/> ล็อกแล้ว</span>;
    if (item.item_status === 'confirmed') return (
      <button className="btn btn-sm btn-ghost" onClick={onReopen} style={{ fontSize: '12px' }}>
        ↩ เปิดใหม่
      </button>
    );
    if (item.item_status === 'held') return (
      <button className="btn btn-sm btn-ghost" onClick={onReopen} style={{ fontSize: '12px' }}>
        ↩ เปิดใหม่
      </button>
    );
    return (
      <div style={{ display: 'flex', gap: '6px' }}>
        <button className="btn btn-sm btn-success" onClick={onConfirm} style={{ fontSize: '12px', padding: '4px 10px' }}>
          ✅ ยืนยัน
        </button>
        <button className="btn btn-sm btn-warning" onClick={onHold} style={{ fontSize: '12px', padding: '4px 10px' }}>
          ⏸ พักยอด
        </button>
      </div>
    );
  };

  // =====================================================
  // RENDER
  // =====================================================

  // Channel options for dropdown (exclude 'credit' which is AR)
  const channelOptions = paymentMethods.filter(m => m.value !== 'credit');

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={22} style={{ color: 'var(--accent-primary)' }} />
            ตรวจทานยอดประจำวัน
          </h3>
          <p className="text-sm text-muted">M10: Daily Reconciliation — กระทบยอดเงินสด, เงินโอน, และลูกหนี้</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* ── Mode Toggle ── */}
          <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
            <button
              onClick={() => setViewMode('daily')}
              style={{
                padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: viewMode === 'daily' ? 'var(--accent-primary)' : 'var(--bg-card)',
                color: viewMode === 'daily' ? '#000' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <Calendar size={13} /> รายวัน
            </button>
            <button
              onClick={() => setViewMode('channel')}
              style={{
                padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: viewMode === 'channel' ? 'var(--accent-primary)' : 'var(--bg-card)',
                color: viewMode === 'channel' ? '#000' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <Layers size={13} /> รายเดือน/ช่องทาง
            </button>
          </div>

          {viewMode === 'daily' ? (
            <>
              <div style={{ position: 'relative' }}>
                <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
                <input
                  type="date"
                  className="form-input"
                  style={{ paddingLeft: '36px', width: '180px' }}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <button className="btn btn-sm btn-ghost" onClick={loadData} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
              </button>
            </>
          ) : (
            <>
              <input
                type="month"
                className="form-input"
                style={{ width: '160px', padding: '6px 12px' }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
              <select
                className="form-input"
                style={{ width: '160px', padding: '6px 12px' }}
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
              >
                {channelOptions.map(ch => (
                  <option key={ch.value} value={ch.value}>{ch.label}</option>
                ))}
              </select>
              <button className="btn btn-sm btn-ghost" onClick={loadMonthlyAll} disabled={monthlyLoading}>
                <RefreshCw size={14} className={monthlyLoading ? 'animate-spin' : ''} /> รีเฟรช
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status Banner — Daily Mode Only */}
      {viewMode === 'daily' && isLocked && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.05))',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={20} style={{ color: 'var(--accent-success)' }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--accent-success)', fontSize: '14px' }}>✅ ปิดยอดประจำวันเรียบร้อยแล้ว</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ปิดเมื่อ {recon?.completed_at ? new Date(recon.completed_at).toLocaleString('th-TH') : '-'}
              </div>
            </div>
          </div>
          {user?.role === 'owner' && (
            <button className="btn btn-sm btn-ghost" onClick={handleUnlock} style={{ fontSize: '12px', borderColor: 'var(--accent-warning)' }}>
              🔓 ปลดล็อก (Owner)
            </button>
          )}
        </div>
      )}

      {/* Summary Cards — Daily Mode Only */}
      {viewMode === 'daily' && (
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon green"><Banknote size={22} /></div>
          <div className="stat-info">
            <h3>{confirmedCashCount}/{cashItems.length}</h3>
            <p>กะเงินสด (ยืนยันแล้ว)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Smartphone size={22} /></div>
          <div className="stat-info">
            <h3>{confirmedDigitalCount}/{digitalItems.length}</h3>
            <p>ช่องทางดิจิทัล (ยืนยันแล้ว)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Users size={22} /></div>
          <div className="stat-info">
            <h3>{confirmedARCount}/{arItems.length}</h3>
            <p>ลูกหนี้ AR (ยืนยันแล้ว)</p>
          </div>
        </div>
        <div className="stat-card" style={{ border: `2px solid ${(totalActualCash + totalActualDigital + totalActualAR) > 0 ? 'var(--accent-primary)' : 'var(--border-primary)'}` }}>
          <div className="stat-icon purple"><DollarSign size={22} /></div>
          <div className="stat-info">
            <h3>{fmtCurrency(totalActualCash + totalActualDigital + totalActualAR)}</h3>
            <p>ยอดรับจริงรวม (ที่ยืนยัน)</p>
          </div>
        </div>
      </div>
      )}

      {/* ============================================= */}
      {/* BATCH CHANNEL MODE */}
      {/* ============================================= */}
      {viewMode === 'channel' ? (
        <>
          {/* Summary strip */}
          <div style={{
            display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap',
          }}>
            <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
              <div className="stat-icon blue"><Layers size={22} /></div>
              <div className="stat-info">
                <h3>{paymentMethods.find(m => m.value === selectedChannel)?.label || selectedChannel}</h3>
                <p>{selectedMonth} — ทั้งเดือน</p>
              </div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
              <div className="stat-icon green"><CheckCircle2 size={22} /></div>
              <div className="stat-info">
                <h3>{monthlyConfirmedCount}/{monthlyRows.length} วัน</h3>
                <p>ยืนยันแล้ว</p>
              </div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
              <div className="stat-icon orange"><AlertTriangle size={22} /></div>
              <div className="stat-info">
                <h3>{monthlyPendingCount} วัน</h3>
                <p>รอกรอกยอด</p>
              </div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: '200px', border: `2px solid ${monthlyTotalActual > 0 ? 'var(--accent-primary)' : 'var(--border-primary)'}` }}>
              <div className="stat-icon purple"><DollarSign size={22} /></div>
              <div className="stat-info">
                <h3>{fmtCurrency(monthlyTotalActual)}</h3>
                <p>ยอดรับจริง (ที่ยืนยัน)</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} style={{ color: 'var(--accent-info)' }} />
                📊 กรอกยอดรายเดือน — {paymentMethods.find(m => m.value === selectedChannel)?.label || selectedChannel}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  ระบบ: {fmtCurrency(monthlyTotalExpected)}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: monthlyTotalActual > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                  รับจริง: {fmtCurrency(monthlyTotalActual)}
                </span>
              </div>
            </div>

            {monthlyLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '12px' }} />
                <div>กำลังโหลดข้อมูล...</div>
              </div>
            ) : monthlyRows.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px' }}>
                <Layers size={36} />
                <h3>ไม่มีข้อมูลในเดือนนี้</h3>
                <p>กรุณาเลือกเดือนและช่องทางที่ต้องการกรอกยอด</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>วันที่</th>
                      <th>วัน</th>
                      <th>ยอดระบบ (Expected)</th>
                      <th style={{ width: '160px' }}>ยอดรับจริง (Actual)</th>
                      <th>ผลต่าง</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((row, idx) => {
                      const dayOfWeek = new Date(row.date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short' });
                      const dayNum = Number(row.date.split('-')[2]);
                      const isSaving = monthlySaving[idx];
                      const hasExpected = row.expected > 0;

                      return (
                        <tr
                          key={row.date}
                          style={{
                            background: row.item_status === 'confirmed'
                              ? 'rgba(34,197,94,0.04)'
                              : !hasExpected
                                ? 'rgba(100,100,100,0.04)'
                                : 'transparent',
                            opacity: !hasExpected && row.item_status !== 'confirmed' ? 0.5 : 1,
                          }}
                        >
                          <td style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '12px' }}>{dayNum}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                              {new Date(row.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dayOfWeek}</span>
                          </td>
                          <td style={{ fontWeight: 600, color: hasExpected ? 'var(--accent-info)' : 'var(--text-muted)' }}>
                            {hasExpected ? fmtCurrency(row.expected) : '—'}
                          </td>
                          <td>
                            {row.item_status === 'confirmed' || row.isLocked ? (
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                                {fmtCurrency(row.actual)}
                              </span>
                            ) : (
                              <input
                                type="number"
                                className="form-input"
                                style={{ width: '140px', padding: '5px 10px', fontSize: '14px', fontWeight: 600 }}
                                placeholder={hasExpected ? row.expected.toString() : '0'}
                                value={row.actual}
                                onChange={(e) => updateMonthlyActual(idx, e.target.value)}
                                min="0"
                                step="0.01"
                              />
                            )}
                          </td>
                          <td>
                            {row.item_status === 'confirmed' ? (
                              <VarianceBadge value={row.variance} />
                            ) : row.actual !== '' ? (
                              <VarianceBadge value={row.variance} />
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td><StatusBadge status={row.item_status} /></td>
                          <td>
                            {row.isLocked ? (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}><Lock size={12} /> ล็อกแล้ว</span>
                            ) : row.item_status === 'confirmed' ? (
                              <button className="btn btn-sm btn-ghost" onClick={() => reopenMonthlyRow(idx)} disabled={isSaving} style={{ fontSize: '12px' }}>
                                ↩ เปิดใหม่
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => confirmMonthlyRow(idx)}
                                disabled={isSaving}
                                style={{ fontSize: '12px', padding: '4px 10px' }}
                              >
                                {isSaving ? '⏳' : '✅'} ยืนยัน
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ============================================= */}
          {/* MONTHLY SUMMARY: Cross-channel breakdown      */}
          {/* ============================================= */}
          {monthlySummary.length > 0 && (
            <div className="card" style={{ marginTop: '20px' }}>
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardCheck size={18} style={{ color: 'var(--accent-info)' }} />
                  📊 สรุปยอดเงินเกิน/ขาด ประจำเดือน {selectedMonth} — ทุกช่องทาง
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                      <th>ช่องทาง</th>
                      <th style={{ textAlign: 'right' }}>ยอดระบบ (Expected)</th>
                      <th style={{ textAlign: 'right' }}>ยอดรับจริง (Actual)</th>
                      <th style={{ textAlign: 'right' }}>ผลต่าง (เกิน/ขาด)</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((item, idx) => {
                      const IconComp = PM_ICON_MAP[item.icon] || CircleDollarSign;
                      const v = item.totalVariance;
                      const hasActual = item.totalActual !== 0;
                      return (
                        <tr key={item.channel} style={{
                          background: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-card)',
                        }}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <IconComp size={16} style={{ color: 'var(--text-muted)' }} />
                              <span style={{ fontWeight: 600 }}>{item.label}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>
                            {fmtCurrency(item.totalExpected)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: hasActual ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                            {hasActual ? fmtCurrency(item.totalActual) : '—'}
                          </td>
                          <td style={{ 
                            textAlign: 'right', 
                            fontWeight: 700,
                            color: !hasActual ? 'var(--text-muted)' : v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : 'var(--accent-success)',
                          }}>
                            {!hasActual ? '—' : v > 0 ? `+${fmtCurrency(v)}` : v < 0 ? fmtCurrency(v) : `0.00 ✓`}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {!hasActual ? (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '4px' }}>ยังไม่กรอก</span>
                            ) : Math.abs(v) < 0.01 ? (
                              <span style={{ fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: '4px' }}>✅ ตรง</span>
                            ) : v > 0 ? (
                              <span style={{ fontSize: '11px', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: '4px' }}>📈 เกิน</span>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px' }}>📉 ขาด</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ 
                      background: 'var(--bg-card)', 
                      borderTop: '2px solid var(--border-primary)',
                      fontWeight: 700,
                    }}>
                      <td colSpan={2} style={{ textAlign: 'right', fontSize: '13px' }}>
                        รวมทั้งหมด
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {fmtCurrency(monthlySummary.reduce((s, i) => s + i.totalExpected, 0))}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-success)' }}>
                        {fmtCurrency(monthlySummary.reduce((s, i) => s + i.totalActual, 0))}
                      </td>
                      {(() => {
                        const grandVariance = monthlySummary.reduce((s, i) => s + i.totalVariance, 0);
                        return (
                          <td style={{ 
                            textAlign: 'right',
                            color: grandVariance > 0 ? '#22c55e' : grandVariance < 0 ? '#ef4444' : 'var(--accent-success)',
                          }}>
                            {grandVariance > 0 ? `+${fmtCurrency(grandVariance)}` : grandVariance < 0 ? fmtCurrency(grandVariance) : `0.00 ✓`}
                          </td>
                        );
                      })()}
                      <td style={{ textAlign: 'center' }}>
                        {(() => {
                          const gv = monthlySummary.reduce((s, i) => s + i.totalVariance, 0);
                          return Math.abs(gv) < 0.01 ? (
                            <span style={{ fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.15)', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>✅ พอดี</span>
                          ) : gv > 0 ? (
                            <span style={{ fontSize: '11px', color: '#3b82f6', background: 'rgba(59,130,246,0.15)', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>📈 เกิน {fmtCurrency(Math.abs(gv))}</span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>📉 ขาด {fmtCurrency(Math.abs(gv))}</span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '12px' }} />
          <div>กำลังโหลดข้อมูล...</div>
        </div>
      ) : (
        <>
          {/* ============================================= */}
          {/* TABLE 1: เงินสด (แยกตามกะ) */}
          {/* ============================================= */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={18} style={{ color: 'var(--accent-success)' }} />
                💵 ตารางที่ 1: ตรวจรับเงินสด (แยกตามกะ)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  ระบบ: {fmtCurrency(totalExpectedCash)}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: totalActualCash > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                  รับจริง: {fmtCurrency(totalActualCash)}
                </span>
              </div>
            </div>

            {cashItems.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px' }}>
                <Banknote size={36} />
                <h3>ไม่มีกะที่ปิดแล้วในวันนี้</h3>
                <p>กรุณาเลือกวันที่ที่มีการปิดกะ</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '30px' }}></th>
                      <th>กะ / พนักงาน</th>
                      <th>ยอดระบบ (Expected)</th>
                      <th>พนักงานนับ (Staff)</th>
                      <th>ยอดรับจริง (Actual)</th>
                      <th>ผลต่าง</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashItems.map((item, idx) => {
                      const shift = shifts.find(s => s.id === item.shift_id);
                      const isExpanded = expandedShift === item.shift_id;
                      const stockData = shift?.stock_count_data;
                      const hasStockData = stockData && typeof stockData === 'object' && Object.keys(stockData).length > 0;

                      return (
                        <>
                          <tr key={item.shift_id} style={{ background: item.item_status === 'confirmed' ? 'rgba(34,197,94,0.04)' : item.item_status === 'held' ? 'rgba(251,146,60,0.04)' : 'transparent' }}>
                            <td>
                              {hasStockData && (
                                <button
                                  className="btn-icon"
                                  style={{ width: '24px', height: '24px', border: 'none', background: 'transparent' }}
                                  onClick={() => setExpandedShift(isExpanded ? null : item.shift_id)}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              )}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                                {item.opener} → {item.closer}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {item.opened_at ? new Date(item.opened_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''} — {item.closed_at ? new Date(item.closed_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}
                              </div>
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--accent-info)' }}>{fmtCurrency(item.expected)}</td>
                            <td>
                              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                                {fmtCurrency(item.staff_count)}
                              </span>
                              {item.staff_count !== item.expected && (
                                <span style={{ fontSize: '10px', color: item.staff_count >= item.expected ? 'var(--accent-success)' : 'var(--accent-danger)', marginLeft: '4px' }}>
                                  ({item.staff_count >= item.expected ? '+' : ''}{(item.staff_count - item.expected).toFixed(2)})
                                </span>
                              )}
                            </td>
                            <td>
                              {item.item_status === 'confirmed' || isLocked ? (
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>{fmtCurrency(item.actual)}</span>
                              ) : (
                                <input
                                  type="number"
                                  className="form-input"
                                  style={{ width: '130px', padding: '6px 10px', fontSize: '14px', fontWeight: 600 }}
                                  placeholder={item.staff_count.toString()}
                                  value={item.actual}
                                  onChange={(e) => updateCashActual(idx, e.target.value)}
                                  disabled={item.item_status === 'held'}
                                  min="0"
                                  step="0.01"
                                />
                              )}
                            </td>
                            <td>
                              {item.item_status === 'confirmed' ? (
                                <VarianceBadge value={item.variance} />
                              ) : item.actual !== '' ? (
                                <VarianceBadge value={item.variance} />
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                              )}
                            </td>
                            <td><StatusBadge status={item.item_status} /></td>
                            <td>
                              <ActionButtons
                                item={item}
                                locked={isLocked}
                                onConfirm={() => confirmCashItem(idx)}
                                onHold={() => holdCashItem(idx)}
                                onReopen={() => reopenCashItem(idx)}
                              />
                            </td>
                          </tr>
                          {/* Expanded stock count data */}
                          {isExpanded && hasStockData && (
                            <tr key={`${item.shift_id}-stock`}>
                              <td colSpan="8" style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                <div style={{ padding: '12px 24px', borderLeft: '3px solid var(--accent-warning)' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                                    📦 ข้อมูลนับสต๊อก (Blind Close)
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                                    {Object.entries(stockData).map(([key, val]) => (
                                      <div key={key} style={{
                                        background: 'var(--bg-primary)',
                                        padding: '8px 12px',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border-primary)',
                                        fontSize: '12px'
                                      }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{val.name || key}</div>
                                        <div style={{ color: 'var(--text-muted)' }}>
                                          นับได้: <span style={{ fontWeight: 600, color: 'var(--accent-info)' }}>{val.count?.toLocaleString() || 0}</span> {val.unit || ''}
                                          {val.purchase_count > 0 && <span> ({val.purchase_count} แพ็ค + {val.stock_count} เศษ)</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ============================================= */}
          {/* TABLE 2: เงินดิจิทัลและ Delivery (รวมวัน) */}
          {/* ============================================= */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={18} style={{ color: 'var(--accent-info)' }} />
                📱 ตารางที่ 2: ตรวจรับเงินช่องทางระบบ และ รายการนอกกะ (รวมวัน)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ระบบ: {fmtCurrency(totalExpectedDigital)}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: totalActualDigital > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                  รับจริง: {fmtCurrency(totalActualDigital)}
                </span>
              </div>
            </div>

            {dailyStaffMeal > 0 && (
              <div style={{ margin: '0 20px 20px', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-info)' }}>
                    <Gift size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>มูลค่าสวัสดิการพนักงานวันนี้</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ไม่ต้องตรวจรับเงิน (แยกยอดจากรายได้และเงินในลิ้นชักเรียบร้อย)</div>
                  </div>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-info)' }}>
                  {fmtCurrency(dailyStaffMeal)}
                </div>
              </div>
            )}

            {digitalItems.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px' }}>
                <Smartphone size={36} />
                <h3>ไม่มียอดดิจิทัลในวันนี้</h3>
                <p>ไม่มีรายการขายผ่านช่องทาง PromptPay, โอนเงิน, หรือ Delivery</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>ช่องทาง</th>
                      <th>ยอดระบบ (Expected)</th>
                      <th>ยอดเงินเข้าจริง (Actual)</th>
                      <th>ผลต่าง</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {digitalItems.map((item, idx) => {
                      const pmDef = paymentMethods.find(m => m.value === item.channel);
                      const IconComp = pmDef ? (PM_ICON_MAP[pmDef.icon] || DollarSign) : DollarSign;

                      return (
                        <tr key={item.channel} style={{ background: item.item_status === 'confirmed' ? 'rgba(34,197,94,0.04)' : item.item_status === 'held' ? 'rgba(251,146,60,0.04)' : 'transparent' }}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-info)' }}>
                                <IconComp size={16} />
                              </div>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--accent-info)' }}>{fmtCurrency(item.expected)}</td>
                          <td>
                            {item.item_status === 'confirmed' || isLocked ? (
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>{fmtCurrency(item.actual)}</span>
                            ) : (
                              <input
                                type="number"
                                className="form-input"
                                style={{ width: '150px', padding: '6px 10px', fontSize: '14px', fontWeight: 600 }}
                                placeholder={item.expected.toString()}
                                value={item.actual}
                                onChange={(e) => updateDigitalActual(idx, e.target.value)}
                                disabled={item.item_status === 'held'}
                                min="0"
                                step="0.01"
                              />
                            )}
                          </td>
                          <td>
                            {item.item_status === 'confirmed' ? (
                              <VarianceBadge value={item.variance} />
                            ) : item.actual !== '' ? (
                              <VarianceBadge value={item.variance} />
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td><StatusBadge status={item.item_status} /></td>
                          <td>
                            <ActionButtons
                              item={item}
                              locked={isLocked}
                              onConfirm={() => confirmDigitalItem(idx)}
                              onHold={() => holdDigitalItem(idx)}
                              onReopen={() => reopenDigitalItem(idx)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ============================================= */}
          {/* TABLE 3: ลูกหนี้การค้า (AR) — ยอดเงินเชื่อที่ขายในวันนี้ */}
          {/* ============================================= */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} style={{ color: 'var(--accent-warning)' }} />
                🧾 ตารางที่ 3: รายการลูกหนี้การค้า (AR) วันนี้
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ยอดเงินเชื่อ: {fmtCurrency(totalExpectedAR)}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: totalActualAR > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                  ยืนยันแล้ว: {fmtCurrency(totalActualAR)}
                </span>
              </div>
            </div>

            {arItems.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px' }}>
                <Users size={36} />
                <h3>ไม่มีรายการขายเงินเชื่อในวันนี้</h3>
                <p>ไม่พบรายการขายที่บันทึกเป็นเงินเชื่อ (AR) ในวันนี้</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>ลูกค้า / บริษัท</th>
                      <th>ครบกำหนด</th>
                      <th>ยอดเงินเชื่อ</th>
                      <th>ยอดค้าง</th>
                      <th>รับชำระวันนี้ (Actual)</th>
                      <th>ผลต่าง</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arItems.map((item, idx) => (
                      <tr key={item.ar_id || idx} style={{ background: item.item_status === 'confirmed' ? 'rgba(34,197,94,0.04)' : item.item_status === 'held' ? 'rgba(251,146,60,0.04)' : 'transparent' }}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.customer_name}</div>
                          {item.customer_company && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.customer_company}</div>}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{item.due_date ? new Date(item.due_date).toLocaleDateString('th-TH') : '-'}</td>
                        <td style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{fmtCurrency(item.expected)}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: (item.outstanding || item.expected) > 0 ? 'var(--accent-danger)' : 'var(--accent-success)' }}>
                            {fmtCurrency(item.outstanding !== undefined ? item.outstanding : item.expected)}
                          </span>
                        </td>
                        <td>
                          {item.item_status === 'confirmed' || isLocked ? (
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>{fmtCurrency(item.actual)}</span>
                          ) : (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '130px', padding: '6px 10px', fontSize: '13px', fontWeight: 600 }}
                              placeholder="0.00"
                              value={item.actual}
                              onChange={(e) => updateARActual(idx, e.target.value)}
                              disabled={item.item_status === 'held'}
                              min="0"
                              step="0.01"
                            />
                          )}
                        </td>
                        <td>
                          {item.item_status === 'confirmed' ? (
                            <VarianceBadge value={item.variance} />
                          ) : item.actual !== '' ? (
                            <VarianceBadge value={item.variance} />
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                        <td><StatusBadge status={item.item_status} /></td>
                        <td>
                          <ActionButtons
                            item={item}
                            locked={isLocked}
                            onConfirm={() => confirmARItem(idx)}
                            onHold={() => holdARItem(idx)}
                            onReopen={() => reopenARItem(idx)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ============================================= */}
          {/* DAILY SUMMARY: Cross-channel breakdown        */}
          {/* ============================================= */}
          {(() => {
            if (cashItems.length === 0 && digitalItems.length === 0) return null;

            const dailySummaryMap = {};
            
            digitalItems.forEach(d => {
              if (!dailySummaryMap[d.channel]) {
                dailySummaryMap[d.channel] = {
                  channel: d.channel,
                  label: d.label,
                  expected: 0,
                  actual: 0,
                  variance: 0,
                  hasActual: false,
                };
              }
              dailySummaryMap[d.channel].expected += Number(d.expected || 0);
              if (d.item_status === 'confirmed') {
                dailySummaryMap[d.channel].actual += Number(d.actual || 0);
                dailySummaryMap[d.channel].hasActual = true;
              }
            });

            cashItems.forEach(c => {
              if (!dailySummaryMap['cash']) {
                dailySummaryMap['cash'] = {
                  channel: 'cash',
                  label: 'เงินสด',
                  expected: 0,
                  actual: 0,
                  variance: 0,
                  hasActual: false,
                };
              }
              dailySummaryMap['cash'].expected += Number(c.expected_cash || 0);
              if (c.item_status === 'confirmed') {
                dailySummaryMap['cash'].actual += Number(c.actual || 0);
                dailySummaryMap['cash'].hasActual = true;
              }
            });

            const dailySummaryList = Object.values(dailySummaryMap).map(item => {
              item.variance = item.actual - item.expected;
              const pm = paymentMethods.find(m => m.value.toLowerCase() === item.channel.toLowerCase());
              item.icon = pm?.icon || 'CircleDollarSign';
              if (item.channel === 'cash') item.icon = 'Banknote';
              return item;
            });

            dailySummaryList.sort((a, b) => {
              if (a.channel === 'cash') return -1;
              if (b.channel === 'cash') return 1;
              return (a.label || '').localeCompare(b.label || '');
            });

            return (
              <div className="card" style={{ marginTop: '20px', marginBottom: '80px' }}>
                <div className="card-header">
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClipboardCheck size={18} style={{ color: 'var(--accent-info)' }} />
                    📊 สรุปยอดเงินเกิน/ขาด ประจำวัน {selectedDate} — ทุกช่องทาง
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                        <th>ช่องทาง</th>
                        <th style={{ textAlign: 'right' }}>ยอดระบบ (Expected)</th>
                        <th style={{ textAlign: 'right' }}>ยอดรับจริง (Actual)</th>
                        <th style={{ textAlign: 'right' }}>ผลต่าง (เกิน/ขาด)</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailySummaryList.map((item, idx) => {
                        const IconComp = PM_ICON_MAP[item.icon] || CircleDollarSign;
                        const v = item.variance;
                        const hasActual = item.hasActual;
                        return (
                          <tr key={item.channel} style={{
                            background: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-card)',
                          }}>
                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <IconComp size={16} style={{ color: 'var(--text-muted)' }} />
                                <span style={{ fontWeight: 600 }}>{item.label}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 500 }}>
                              {fmtCurrency(item.expected)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: hasActual ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                              {hasActual ? fmtCurrency(item.actual) : '—'}
                            </td>
                            <td style={{ 
                              textAlign: 'right', 
                              fontWeight: 700,
                              color: !hasActual ? 'var(--text-muted)' : v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : 'var(--accent-success)',
                            }}>
                              {!hasActual ? '—' : v > 0 ? `+${fmtCurrency(v)}` : v < 0 ? fmtCurrency(v) : `0.00 ✓`}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {!hasActual ? (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '4px' }}>ยังไม่กรอก</span>
                              ) : Math.abs(v) < 0.01 ? (
                                <span style={{ fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: '4px' }}>✅ ตรง</span>
                              ) : v > 0 ? (
                                <span style={{ fontSize: '11px', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: '4px' }}>📈 เกิน</span>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px' }}>📉 ขาด</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ 
                        background: 'var(--bg-card)', 
                        borderTop: '2px solid var(--border-primary)',
                        fontWeight: 700,
                      }}>
                        <td colSpan={2} style={{ textAlign: 'right', fontSize: '13px' }}>
                          รวมทั้งหมด
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {fmtCurrency(dailySummaryList.reduce((s, i) => s + i.expected, 0))}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--accent-success)' }}>
                          {fmtCurrency(dailySummaryList.reduce((s, i) => s + i.actual, 0))}
                        </td>
                        {(() => {
                          const grandVariance = dailySummaryList.reduce((s, i) => s + i.variance, 0);
                          return (
                            <td style={{ 
                              textAlign: 'right',
                              color: grandVariance > 0 ? '#22c55e' : grandVariance < 0 ? '#ef4444' : 'var(--accent-success)',
                            }}>
                              {grandVariance > 0 ? `+${fmtCurrency(grandVariance)}` : grandVariance < 0 ? fmtCurrency(grandVariance) : `0.00 ✓`}
                            </td>
                          );
                        })()}
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const gv = dailySummaryList.reduce((s, i) => s + i.variance, 0);
                            return Math.abs(gv) < 0.01 ? (
                              <span style={{ fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.15)', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>✅ พอดี</span>
                            ) : gv > 0 ? (
                              <span style={{ fontSize: '11px', color: '#3b82f6', background: 'rgba(59,130,246,0.15)', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>📈 เกิน {fmtCurrency(Math.abs(gv))}</span>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>📉 ขาด {fmtCurrency(Math.abs(gv))}</span>
                            );
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ============================================= */}
          {/* FOOTER: ปิดยอดประจำวัน */}
          {/* ============================================= */}
          {!isLocked && (cashItems.length > 0 || digitalItems.length > 0 || arItems.length > 0) && (
            <div style={{
              position: 'fixed',
              bottom: 0,
              left: 'var(--sidebar-width)',
              right: 0,
              background: 'var(--bg-card)',
              borderTop: '1px solid var(--border-primary)',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 50,
              boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  สรุปยอดรับจริง (ที่ยืนยัน): {fmtCurrency(totalActualCash + totalActualDigital + totalActualAR)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  💵 เงินสด: {fmtCurrency(totalActualCash)} &nbsp;|&nbsp; 📱 ดิจิทัล: {fmtCurrency(totalActualDigital)} &nbsp;|&nbsp; 🧾 AR: {fmtCurrency(totalActualAR)}
                </div>
                {!canCloseDay && (
                  <div style={{ fontSize: '11px', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={12} /> กรุณายืนยันหรือพักยอดทุกรายการก่อนปิดงบวัน
                  </div>
                )}
              </div>
              <button
                className="btn btn-lg btn-success"
                onClick={handleCloseDay}
                disabled={!canCloseDay || !hasAnyConfirmed || saving}
                style={{
                  opacity: (canCloseDay && hasAnyConfirmed) ? 1 : 0.4,
                  padding: '12px 28px',
                  fontSize: '15px',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-md)',
                  boxShadow: (canCloseDay && hasAnyConfirmed) ? '0 0 20px rgba(34,197,94,0.3)' : 'none',
                }}
              >
                {saving ? '⏳ กำลังบันทึก...' : '✅ ปิดยอดประจำวัน'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
