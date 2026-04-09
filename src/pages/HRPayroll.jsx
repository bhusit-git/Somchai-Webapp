import { useState, useEffect } from 'react';
import {
  Users,
  FileText,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Download,
  Printer,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/*
  Supabase Schema Integration
  Tables: attendance, hr_leave_requests, hr_salary_adjustments
  Users table fields: employment_type, base_salary, daily_rate, pay_cycle
  pay_cycle: 'daily' | 'bimonthly' | 'monthly'
*/

// ────────────────────── SUB-COMPONENTS ──────────────────────

const TAB_STYLES = {
  container: { display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '0' },
  tab: (active) => ({
    padding: '10px 20px',
    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
    border: 'none',
    cursor: 'pointer',
    fontWeight: active ? '700' : '500',
    fontSize: '14px',
    background: active ? 'var(--accent-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
    marginBottom: '-2px',
    transition: 'all 0.2s',
  }),
};

const COMPANY_INFO_KEY = 'companyInfo';
const defaultCompanyInfo = {
  name: 'สมชายหมูปิ้ง',
  addressLine1: '123 ถนนสีลม แขวงสีลม',
  addressLine2: 'เขตบางรัก กรุงเทพมหานคร 10500',
  phone: '02-234-5678',
  taxId: '0123456789012',
  logo: null,
};

function useCompanyInfo() {
  const [info, setInfo] = useState(defaultCompanyInfo);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COMPANY_INFO_KEY);
      if (saved) setInfo(JSON.parse(saved));
    } catch {}
  }, []);
  return info;
}

const PAY_CYCLE_LABELS = {
  daily: { label: 'จ่ายทุกวัน', color: '#8b5cf6' },
  bimonthly: { label: 'จ่าย 2 รอบ/เดือน', color: '#f59e0b' },
  monthly: { label: 'จ่ายสิ้นเดือน', color: '#3b82f6' },
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function generatePayPeriods(count = 12) {
  const periods = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed
  let isEnd = now.getDate() > 15;

  for (let i = 0; i < count; i++) {
    const y = year;
    const m = month;
    const monthStr = String(m + 1).padStart(2, '0');
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const thaiLabel = `${THAI_MONTHS[m]} ${y}`;

    if (isEnd) {
      // End-of-month: 16th to last day
      periods.push({
        value: `${y}-${monthStr}-end`,
        label: `รอบสิ้นเดือน ${thaiLabel} (16-${daysInMonth})`,
        startISO: `${y}-${monthStr}-16T00:00:00.000Z`,
        endISO: `${y}-${String(m + 2).padStart(2, '0')}-01T00:00:00.000Z`.replace(/-(13)-/, (_, n) => `-01-`).replace(`${y}-13-01T`, `${y+1}-01-01T`),
        isMid: false,
        payDate: `${y}-${String(m + 2).padStart(2, '0')}-05`.replace(/-(13)-/, (_) => `-01-`).replace(`${y}-13-05`, `${y+1}-01-05`),
        monthKey: `${y}-${monthStr}`,
      });
    } else {
      // Mid-month: 1st to 15th
      periods.push({
        value: `${y}-${monthStr}-mid`,
        label: `รอบกลางเดือน ${thaiLabel} (1-15)`,
        startISO: `${y}-${monthStr}-01T00:00:00.000Z`,
        endISO: `${y}-${monthStr}-16T00:00:00.000Z`,
        isMid: true,
        payDate: `${y}-${monthStr}-15`,
        monthKey: `${y}-${monthStr}`,
      });
    }

    // Go back one half-period
    if (isEnd) {
      isEnd = false; // next iteration = mid of same month
    } else {
      isEnd = true;  // next iteration = end of previous month
      month--;
      if (month < 0) { month = 11; year--; }
    }
  }
  return periods;
}

const PAY_PERIODS = generatePayPeriods(24);

/* ── PAYSLIP PRINT VIEW ── */
function PayslipPrintView({ payslip, employee }) {
  const company = useCompanyInfo();
  const totalIncome = payslip.income.reduce((s, r) => s + r.amount, 0);
  const totalDeductions = payslip.deductions.reduce((s, r) => s + r.amount, 0);
  const netPay = totalIncome - totalDeductions;
  const cashPaid = payslip.cashPaid || 0;
  const clockInCount = payslip.clockInCount || 0;
  const bankTransfer = Math.max(0, netPay);

  const printStyle = {
    background: '#ffffff',
    color: '#000000',
    fontFamily: 'Arial, sans-serif',
    padding: '32px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    maxWidth: '720px',
    margin: '0 auto',
  };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A5 landscape; margin: 10mm; }
          body * { visibility: hidden; }
          #payslip-print-area, #payslip-print-area * { visibility: visible; }
          #payslip-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            border: none !important;
          }
          .app-container, .sidebar { display: none !important; }
        }
      `}</style>
      <div id="payslip-print-area" style={printStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Company Logo */}
          <div style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: company.logo ? 'transparent' : 'linear-gradient(135deg, #ff6b35, #f7931e)', flexShrink: 0 }}>
            {company.logo
              ? <img src={company.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontWeight: '900', color: '#fff', fontSize: '18px' }}>{company.name?.charAt(0) || 'ส'}</span>
            }
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#1B3A6B' }}>สลิปเงินเดือน</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#555' }}>{company.name}</div>
            <div style={{ fontSize: '12px', color: '#777', marginTop: '2px' }}>{company.addressLine1}</div>
            <div style={{ fontSize: '12px', color: '#777' }}>{company.addressLine2}</div>
            {(company.phone || company.taxId) && (
              <div style={{ fontSize: '11px', color: '#777', marginTop: '2px' }}>
                {company.phone && <>โทร: {company.phone}</>}
                {company.phone && company.taxId && '  |  '}
                {company.taxId && <>Tax ID: {company.taxId}</>}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#777' }}>รอบเงินเดือน</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1B3A6B' }}>{payslip.period}</div>
          <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>วันที่ชำระ</div>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>{payslip.issueDate}</div>
          {payslip.payCycleLabel && (
            <>
              <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>รอบจ่ายเงิน</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: payslip.payCycleColor || '#3b82f6' }}>{payslip.payCycleLabel}</div>
            </>
          )}
          <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>เลขที่บัญชี</div>
          <div style={{ fontSize: '13px' }}>{employee.bankAccount} ({employee.name.split(' ')[1]})<br />{employee.bankName}</div>
        </div>
      </div>

      {/* Employee Info */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#777' }}>ชื่อ-นามสกุล</div>
          <div style={{ fontSize: '16px', fontWeight: '700' }}>{employee.name}</div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#777' }}>รหัสพนักงาน</div>
          <div style={{ fontSize: '16px', fontWeight: '700' }}>{employee.id}</div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#777' }}>ตำแหน่ง</div>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>{employee.position}</div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#777' }}>สาขา</div>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>{employee.branch}</div>
        </div>
      </div>

      {/* Main Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th colSpan={2} style={{ border: '1px solid #ccc', padding: '8px 12px', textAlign: 'center', fontWeight: '700' }}>เงินได้</th>
            <th colSpan={2} style={{ border: '1px solid #ccc', padding: '8px 12px', textAlign: 'center', fontWeight: '700' }}>รายการหัก</th>
            <th colSpan={2} style={{ border: '1px solid #ccc', padding: '8px 12px', textAlign: 'center', fontWeight: '700' }}>หมายเหตุ</th>
          </tr>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', fontWeight: '700', background: '#f9f9f9' }}>รายการ</th>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', textAlign: 'right', fontWeight: '700', background: '#f9f9f9' }}>จำนวนเงิน</th>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', fontWeight: '700', background: '#f9f9f9' }}>รายการ</th>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', textAlign: 'right', fontWeight: '700', background: '#f9f9f9' }}>จำนวนเงิน</th>
            <th colSpan={2} style={{ border: '1px solid #ccc', padding: '6px 12px', background: '#f9f9f9' }}></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(5, payslip.income.length, payslip.deductions.length) }).map((_, i) => {
            const inc = payslip.income[i] || { label: '', amount: 0 };
            const ded = payslip.deductions[i] || { label: '', amount: 0 };
            let remarkLabel = '';
            let remarkValue = '';
            if (i === 2) { remarkLabel = 'รายได้สะสม'; remarkValue = payslip.cumulativeIncome.toLocaleString(); }
            if (i === 3) { remarkLabel = 'รวมเงินได้'; remarkValue = totalIncome.toLocaleString(); }
            if (i === 4) { remarkLabel = 'รวมรายการหัก'; remarkValue = totalDeductions.toLocaleString(); }

            return (
              <tr key={i}>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px' }}>{inc.label}</td>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', textAlign: 'right' }}>
                  {inc.amount > 0 ? inc.amount.toLocaleString() : ''}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px' }}>{ded.label}</td>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', textAlign: 'right' }}>
                  {ded.amount > 0 ? ded.amount.toLocaleString() : ''}
                </td>
                {i === 2
                  ? <td style={{ border: '1px solid #ccc', padding: '7px 12px', fontWeight: '700', textAlign: 'center', background: '#f9f9f9' }}>สรุป</td>
                  : <td style={{ border: '1px solid #ccc', padding: '7px 12px' }}>{remarkLabel}</td>
                }
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', textAlign: 'right', fontWeight: remarkLabel ? '700' : '400' }}>
                  {remarkValue}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Net Pay Highlight */}
      <div style={{ background: '#f0f7ff', border: '2px solid #1B3A6B', borderRadius: '8px', padding: '14px 20px', marginBottom: cashPaid > 0 ? 0 : '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#1B3A6B' }}>เงินได้สุทธิ (Net Pay)</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#16a34a' }}>฿{netPay.toLocaleString()}</div>
        </div>
        {cashPaid > 0 && (
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #93c5fd', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, background: '#fff3e0', border: '1px solid #fb923c', borderRadius: '6px', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#92400e', fontWeight: '700' }}>💵 จ่ายเงินสดแล้ว</div>
                <div style={{ fontSize: '11px', color: '#78350f' }}>({(payslip.dailyCashAdvanceRate || 0).toLocaleString()} บาท/วัน)</div>
              </div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#ea580c' }}>฿{cashPaid.toLocaleString()}</div>
            </div>
            <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #4ade80', borderRadius: '6px', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: '700' }}>🏦 ยอดโอนเข้าบัญชี</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#16a34a' }}>฿{bankTransfer.toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      {/* Signature Area */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '60px', paddingBottom: '20px' }}>
        {['ลายเซ็นผู้รับเงิน', 'ลายเซ็นฝ่ายบัญชี', 'ลายเซ็นผู้อนุมัติ'].map((label) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #333', width: '160px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '13px', color: '#555' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}

/* ── TAB 1: E-PAYSLIP ── */
function EPayslipTab({ role }) {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState(PAY_PERIODS[0]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatedPayslips, setGeneratedPayslips] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => { loadPayslips(); }, [selectedPeriod?.value]);

  async function loadPayslips() {
    if (!selectedPeriod) return;
    setLoading(true);
    try {
      let query = supabase.from('users').select('*, branches(name)').eq('is_active', true);
      if (role !== 'owner') {
        query = query.eq('id', user?.id);
      }
      const { data: usersData } = await query;
      const userList = usersData || [];
      setUsers(userList);

      const { startISO, endISO, isMid, payDate, monthKey } = selectedPeriod;
      // action_date range for salary adjustments (use the half-month window)
      const adjStart = startISO.substring(0, 10);
      const adjEnd = endISO.substring(0, 10);

      const [attRes, adjRes] = await Promise.all([
        supabase.from('attendance')
          .select('user_id, type, timestamp')
          .eq('type', 'clock_in')
          .eq('is_deleted', false)
          .gte('timestamp', startISO)
          .lt('timestamp', endISO),
        supabase.from('hr_salary_adjustments')
          .select('*')
          .gte('action_date', adjStart)
          .lt('action_date', adjEnd)
      ]);

      const attData = attRes.data || [];
      const adjData = adjRes.data || [];

      const newPayslips = userList
        .filter(u => {
          // Monthly-pay employees only show in end-of-month cycle
          const payCycle = u.pay_cycle || 'monthly';
          if (payCycle === 'monthly' && isMid) return false;
          return true;
        })
        .map(u => {
          const payCycle = u.pay_cycle || 'monthly';
          const uAttAll = attData.filter(a => a.user_id === u.id);
          
          // shiftCount = total clock_ins (each clock_in = 1 shift worked, used for income)
          const shiftCount = uAttAll.length;
          
          // uniqueDayCount = unique calendar days worked (used for cash advance & display label)
          const uniqueDaysSet = new Set();
          uAttAll.forEach(att => {
            uniqueDaysSet.add(new Date(att.timestamp).toDateString());
          });
          const uniqueDayCount = uniqueDaysSet.size;
          
          const customRates = u.custom_rates || {};
          const hasCustomRates = Object.keys(customRates).length > 0;

          let basicIncome = 0;
          let incomeLabel = '';
          if (u.employment_type === 'daily') {
            if (hasCustomRates) {
              // For custom rates, sum the rate for each shift based on the day of week
              basicIncome = uAttAll.reduce((sum, att) => {
                const dayOfWeek = new Date(att.timestamp).getDay();
                const rate = customRates[dayOfWeek] !== undefined
                  ? Number(customRates[dayOfWeek])
                  : (u.daily_rate || 0);
                return sum + rate;
              }, 0);
              incomeLabel = 'ค่าจ้างรายวัน';
            } else {
              // Each clock_in = 1 shift = daily_rate per shift
              basicIncome = shiftCount * (u.daily_rate || 0);
              incomeLabel = 'ค่าจ้างรายวัน';
            }
          } else {
            // Salary employee:
            //   bimonthly → half per period; monthly → full salary end-of-month only
            const fullSalary = u.base_salary || 0;
            if (payCycle === 'bimonthly') {
              basicIncome = fullSalary / 2;
              incomeLabel = `เงินเดือน${isMid ? 'รอบกลางเดือน' : 'รอบสิ้นเดือน'} (${fullSalary.toLocaleString()} / 2)`;
            } else {
              basicIncome = fullSalary;
              incomeLabel = 'เงินเดือน (Base Salary)';
            }
          }
          const uAdj = adjData.filter(a => a.user_id === u.id);
          const incomes = uAdj.filter(a => a.adjust_type === 'income');
          const deductions = uAdj.filter(a => a.adjust_type === 'deduction');

          const positionAllowance = Number(u.position_allowance) || 0;
          let allowanceToPay = 0;
          if (positionAllowance > 0 && !isMid) {
             allowanceToPay = positionAllowance;
             
             if (allowanceToPay > 0) {
               incomes.unshift({ label: 'ค่าตำแหน่ง', amount: Math.round(allowanceToPay) });
             }
          }


          let totalCashPaidForPeriod = 0;

          // Cash advance is per CALENDAR DAY (not per shift)
          if (u.employment_type === 'daily' && u.daily_cash_advance > 0 && uniqueDayCount > 0) {
            const advanceTotal = uniqueDayCount * u.daily_cash_advance;
            deductions.push({ label: 'เบิกเงินสดรายวัน', amount: advanceTotal });
            totalCashPaidForPeriod += advanceTotal;
          }

          totalCashPaidForPeriod = Math.max(0, totalCashPaidForPeriod);

          const payCycleInfo = PAY_CYCLE_LABELS[payCycle] || PAY_CYCLE_LABELS.monthly;

          return {
            id: `PS-${selectedPeriod.value}-${u.id.substring(0,8)}`,
            empId: u.id,
            payCycle,
            payCycleLabel: payCycleInfo.label,
            payCycleColor: payCycleInfo.color,
            employee: {
              id: u.employee_id || u.id,
              name: u.name,
              position: roleLabels[u.role] || u.role,
              branch: u.branches?.name || 'ไม่ระบุสาขา',
              bankAccount: u.bank_account || '-',
              bankName: u.bank_name || '-'
            },
            period: selectedPeriod.label.replace('รอบกลางเดือน ', '').replace('รอบสิ้นเดือน ', ''),
            issueDate: payDate ? new Date(payDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('th-TH'),
            income: [
              { label: incomeLabel, amount: basicIncome },
              ...incomes.map(i => ({ label: i.label, amount: i.amount }))
            ],
            deductions: deductions.map(d => ({ label: d.label, amount: d.amount })),
            cashPaid: totalCashPaidForPeriod,
            dailyCashAdvanceRate: u.daily_cash_advance || 0,
            clockInCount: uniqueDayCount,
            cumulativeIncome: basicIncome
          };
        });

      setGeneratedPayslips(newPayslips);
      if (!selectedEmp && userList.length > 0) setSelectedEmp(userList[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const roleLabels = { owner:'เจ้าของ', manager:'Area Mgr', store_manager:'ผจก.ร้าน', cook:'พ่อครัว', staff:'พนักงาน' };

  const empPayslips = generatedPayslips.filter(p => p.empId === selectedEmp?.id);
  const handlePrint = () => window.print();

  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    const element = document.getElementById('payslip-print-area');
    if (!element) return;
    
    setDownloading(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const fileName = `Payslip_${selectedEmp?.name?.replace(/\s+/g, '_')}_${selectedPeriod.monthKey}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap' }}>รอบเงินเดือน :</label>
          <select
            value={selectedPeriod?.value || ''}
            onChange={e => {
              const p = PAY_PERIODS.find(x => x.value === e.target.value);
              setSelectedPeriod(p || PAY_PERIODS[0]);
              setSelectedPayslip(null);
            }}
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '14px', minWidth: '280px', cursor: 'pointer' }}
          >
            {PAY_PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {role === 'owner' && !selectedPayslip && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap' }}>เลือกพนักงาน:</label>
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <select
                value={selectedEmp?.id || ''}
                onChange={e => {
                  setSelectedEmp(users.find(emp => emp.id === e.target.value) || null);
                  setSelectedPayslip(null);
                }}
                style={{ width: '100%', padding: '8px 36px 8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '14px', appearance: 'none', cursor: 'pointer' }}
              >
                {users.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}><span className="animate-pulse">กำลังคำนวณเงินเดือน...</span></div>
      ) : !selectedPayslip ? (
        <div>
          <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '12px', color: 'var(--text-primary)' }}>
            สลิปเงินเดือน — {selectedEmp?.name || '-'}
          </div>
          {empPayslips.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <FileText size={40} style={{ opacity: 0.3, marginBottom: '8px', margin: '0 auto' }} />
              <div>ยังไม่มีสลิปเงินเดือนในรอบนี้</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {empPayslips.map(ps => {
                const totalIncome = ps.income.reduce((s, r) => s + r.amount, 0);
                const totalDeductions = ps.deductions.reduce((s, r) => s + r.amount, 0);
                const net = totalIncome - totalDeductions;
                return (
                  <div key={ps.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => setSelectedPayslip(ps)}
                  >
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '15px' }}>รอบ: {ps.period}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>ออกสลิป: {ps.issueDate} · #{ps.id}</span>
                        <span style={{ background: ps.payCycleColor, color: '#fff', borderRadius: '4px', padding: '1px 8px', fontSize: '11px', fontWeight: '700' }}>{ps.payCycleLabel}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--accent-success)' }}>฿{net.toLocaleString()}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Net Pay</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
            <button onClick={() => setSelectedPayslip(null)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
              ← กลับ
            </button>
            <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
              <Printer size={15} /> พิมพ์
            </button>
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px', opacity: downloading ? 0.7 : 1 }}
            >
              <Download size={15} /> {downloading ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด PDF'}
            </button>
          </div>
          <PayslipPrintView payslip={selectedPayslip} employee={selectedPayslip.employee} />
        </div>
      )}
    </div>
  );
}

/* ── TAB 2: LEAVE MANAGEMENT ── */
function LeaveManagementTab({ role }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ user_id: '', leave_type: 'ลาป่วย', startDate: '', endDate: '', reason: '' });

  // Dynamically calculate used days for the current logged-in user
  const approvedLeaves = requests.filter(r => r.status === 'approved' && r.user_id === user?.id);
  const getUsedDays = (type) => approvedLeaves.filter(r => r.leave_type === type).reduce((sum, r) => sum + r.days, 0);

  const leaveStats = [
    { type: 'ลาป่วย', used: getUsedDays('ลาป่วย'), color: '#ef4444' },
    { type: 'ลากิจ', used: getUsedDays('ลากิจ'), color: '#f59e0b' },
    { type: 'ลาพักร้อน', used: getUsedDays('ลาพักร้อน'), color: '#3b82f6' },
  ];

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      let leaveQuery = supabase.from('hr_leave_requests').select('*, users(name)').order('created_at', { ascending: false });
      if (role !== 'owner') {
        leaveQuery = leaveQuery.eq('user_id', user?.id);
      }
      const [leaveRes, userRes] = await Promise.all([
        leaveQuery,
        supabase.from('users').select('id, name').eq('is_active', true)
      ]);
      setRequests(leaveRes.data || []);
      setUsers(userRes.data || []);
      if (userRes.data && userRes.data.length > 0) {
        setForm(prev => ({ ...prev, user_id: userRes.data[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const pending = requests.filter(r => r.status === 'pending');

  const handleApprove = async (id) => {
    if (!confirm('ยืนยันอนุมัติการลา?')) return;
    const { error } = await supabase.from('hr_leave_requests').update({ status: 'approved' }).eq('id', id);
    if (!error) loadData();
  };

  const handleReject = async (id) => {
    if (!confirm('ยืนยันปฏิเสธการลา?')) return;
    const { error } = await supabase.from('hr_leave_requests').update({ status: 'rejected' }).eq('id', id);
    if (!error) loadData();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) return alert('กรอกวันลาให้ครบถ้วน');
    const startDate = new Date(form.startDate);
    const endDate = new Date(form.endDate);
    const diffDays = Math.ceil(Math.abs(endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const targetUserId = role === 'staff' ? user?.id : form.user_id;
    if (!targetUserId) return alert('ไม่พบข้อมูลพนักงาน');
    const { error } = await supabase.from('hr_leave_requests').insert({
      user_id: targetUserId,
      leave_type: form.leave_type,
      start_date: form.startDate,
      end_date: form.endDate,
      days: diffDays,
      reason: form.reason || null,
      status: role === 'staff' ? 'pending' : 'approved'
    });
    if (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
      setShowForm(false);
      setForm(prev => ({ ...prev, startDate: '', endDate: '', reason: '' }));
      loadData();
    }
  };

  const leaveTypeColor = { 'ลาป่วย': '#ef4444', 'ลากิจ': '#f59e0b', 'ลาพักร้อน': '#3b82f6', 'อื่นๆ': '#8b5cf6' };

  return (
    <div>
      {/* Leave Balances */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {leaveStats.map(lb => (
          <div key={lb.type} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px' }}>{lb.type}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>จำนวนที่ใช้แล้ว</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: lb.color }}>
              {lb.used} <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-muted)' }}>วัน</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '16px' }}>ประวัติการลา</div>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>
          <Plus size={16} /> ยื่นใบลา
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}>ยื่นใบลาใหม่</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {role === 'owner' && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>พนักงาน</label>
                <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px' }}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>ประเภทการลา</label>
              <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px' }}>
                {['ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'อื่นๆ'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>วันเริ่มลา</label>
              <input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>วันสิ้นสุด</label>
              <input type="date" required value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: role === 'owner' ? '1 / -1' : 'auto' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>เหตุผล</label>
              <input type="text" placeholder="ระบุเหตุผล..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button type="submit" style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}>ยืนยันส่งคำขอ</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>ยกเลิก</button>
          </div>
        </form>
      )}

      {role === 'owner' && pending.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={15} style={{ color: '#f59e0b' }} /> รอการอนุมัติ ({pending.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pending.map(r => (
              <div key={r.id} style={{ background: 'var(--accent-warning-bg, rgba(245,158,11,0.08))', border: '1px solid #f59e0b', borderRadius: 'var(--radius-sm)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>{r.users?.name || '—'}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    <span style={{ background: leaveTypeColor[r.leave_type], color: '#fff', borderRadius: '4px', padding: '1px 8px', fontSize: '11px', fontWeight: '700', marginRight: '6px' }}>{r.leave_type}</span>
                    {r.start_date} – {r.end_date} · {r.days} วัน
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>เหตุผล: {r.reason || '-'}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => handleApprove(r.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                    <CheckCircle size={14} /> อนุมัติ
                  </button>
                  <button onClick={() => handleReject(r.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                    <XCircle size={14} /> ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        {loading && requests.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {requests.map(r => (
              <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>{r.users?.name || '—'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ background: leaveTypeColor[r.leave_type], color: '#fff', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', fontWeight: '700', marginRight: '6px' }}>{r.leave_type}</span>
                    {r.start_date} – {r.end_date} · {r.days} วัน{r.reason ? ` · ${r.reason}` : ''}
                  </div>
                </div>
                <div>
                  {r.status === 'pending' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#f59e0b', fontWeight: '700' }}><Clock size={13} /> รออนุมัติ</span>}
                  {r.status === 'approved' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#16a34a', fontWeight: '700' }}><CheckCircle size={13} /> อนุมัติแล้ว</span>}
                  {r.status === 'rejected' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#ef4444', fontWeight: '700' }}><XCircle size={13} /> ปฏิเสธ</span>}
                </div>
              </div>
            ))}
            {requests.length === 0 && !loading && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>ยังไม่มีข้อมูลการลา</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── TAB 3: SALARY ADJUSTMENT ── */
function SalaryAdjTab({ user: currentUser }) {
  const [adjustments, setAdjustments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [form, setForm] = useState({ user_id: '', adjType: 'income', label: '', amount: '', note: '', action_date: getTodayStr() });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [adjRes, userRes] = await Promise.all([
        supabase.from('hr_salary_adjustments').select('*, users(name, full_name)').order('action_date', { ascending: false }),
        supabase.from('users').select('id, name, full_name').eq('is_active', true)
      ]);
      setAdjustments(adjRes.data || []);
      setUsers(userRes.data || []);
      if (userRes.data && userRes.data.length > 0) {
        setForm(f => ({ ...f, user_id: userRes.data[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const adjLabels = {
    income: ['โบนัส', 'OT', 'ค่าเดินทาง', 'เบี้ยขยัน', 'รายได้พิเศษ'],
    deduction: ['หักเงินสดหน้างาน', 'ค่าเสียหาย', 'ลาไม่รับค่าจ้าง', 'เบิกล่วงหน้า', 'ขาด/สาย', 'รายการหักอื่นๆ'],
  };

  const handleEdit = (adj) => {
    setEditingId(adj.id);
    setForm({
      user_id: adj.user_id,
      adjType: adj.adjust_type,
      label: adj.label,
      amount: adj.amount,
      note: adj.note || '',
      action_date: adj.action_date.substring(0, 10)
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันที่จะลบรายการนี้?')) return;
    const { error } = await supabase.from('hr_salary_adjustments').delete().eq('id', id);
    if (error) {
      alert('เกิดข้อผิดพลาดในการลบ: ' + error.message);
    } else {
      loadData();
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.user_id || !form.label || !form.amount) return alert('กรอกข้อมูลไม่ครบถ้วน');
    const actionDate = form.action_date || getTodayStr();
    const amt = Math.abs(parseFloat(form.amount));
    
    if (editingId) {
      const { error } = await supabase.from('hr_salary_adjustments').update({
        user_id: form.user_id,
        adjust_type: form.adjType,
        label: form.label,
        amount: amt,
        note: form.note || null,
        action_date: actionDate
      }).eq('id', editingId);

      if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
      } else {
        setEditingId(null);
        setShowForm(false);
        setForm(f => ({ ...f, amount: '', note: '', action_date: getTodayStr() }));
        loadData();
      }
    } else {
      const { error } = await supabase.from('hr_salary_adjustments').insert({
        user_id: form.user_id,
        adjust_type: form.adjType,
        label: form.label,
        amount: amt,
        note: form.note || null,
        action_date: actionDate
      });
      if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
      } else {
        // Auto-create expense record ONLY for cash advance (cash given OUT to employee)
        if (form.adjType === 'deduction' && form.label === 'เบิกล่วงหน้า') {
          const targetUser = users.find(u => u.id === form.user_id);
          const expenseDesc = `${form.label} - ${targetUser?.name || 'พนักงาน'}${form.note ? ': ' + form.note : ''}`;
          await supabase.from('expenses').insert({
            branch_id: currentUser?.branch_id || null,
            created_by: currentUser?.id || null,
            category: 'ค่าแรง/เงินเดือน',
            description: expenseDesc,
            amount: amt,
            payment_method: 'cash',
            expense_type: 'planned',
            status: 'approved',
            approved_by: currentUser?.id || null,
            approved_at: new Date().toISOString(),
            notes: `ลงรายการอัตโนมัติจากระบบ Payroll - ${actionDate}`
          });
        }
        setShowForm(false);
        setForm(f => ({ ...f, amount: '', note: '', action_date: getTodayStr() }));
        loadData();
      }
    }
  };

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '16px' }}>รายการปรับเงินเดือน</div>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
          <Plus size={15} /> เพิ่มรายการ
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '14px' }}>{editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการบวก/หัก'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>พนักงาน</label>
              <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} style={inputStyle}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>ประเภท</label>
              <select value={form.adjType} onChange={e => setForm({ ...form, adjType: e.target.value, label: adjLabels[e.target.value][0] })} style={inputStyle}>
                <option value="income">+ รายได้</option>
                <option value="deduction">– รายการหัก</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>รายการ</label>
              <select value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} style={inputStyle}>
                <option value="">-- เลือกรายการ --</option>
                {adjLabels[form.adjType].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>จำนวนเงิน (฿)</label>
              <input type="number" step="0.01" required placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>วันที่ปรับปรุง</label>
              <input type="date" required value={form.action_date} onChange={e => setForm({ ...form, action_date: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>หมายเหตุ</label>
              <input type="text" placeholder="ระบุเหตุผล/รายละเอียด..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button type="submit" style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>บันทึก</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(f => ({ ...f, amount: '', note: '', action_date: getTodayStr() })); }} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>ยกเลิก</button>
          </div>
        </form>
      )}

      {loading && adjustments.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {adjustments.map(adj => (
            <div key={adj.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid ${adj.adjust_type === 'income' ? '#16a34a' : '#ef4444'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {adj.adjust_type === 'income'
                  ? <TrendingUp size={20} style={{ color: '#16a34a' }} />
                  : <TrendingDown size={20} style={{ color: '#ef4444' }} />
                }
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>{adj.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{adj.users?.name || '—'} · {new Date(adj.action_date).toLocaleDateString()}</div>
                  {adj.note && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>หมายเหตุ: {adj.note}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ fontWeight: '900', fontSize: '18px', color: adj.adjust_type === 'income' ? '#16a34a' : '#ef4444', textAlign: 'right' }}>
                  {adj.adjust_type === 'income' ? '+' : '-'}฿{Number(adj.amount).toLocaleString()}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleEdit(adj)} title="แก้ไข" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                    <Edit size={16} />
                  </button>
                  <button onClick={() => handleDelete(adj.id)} title="ลบ" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {adjustments.length === 0 && !loading && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>ยังไม่มีข้อมูลการปรับเงินเดือน</div>}
        </div>
      )}
    </div>
  );
}

// ────────────────────── MAIN COMPONENT ──────────────────────
export default function HRPayroll() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('payslip');
  
  // Replace the mock role toggler with actual user role
  const role = user?.role || 'staff';

  const tabs = [
    { key: 'payslip', label: '📄 E-Payslip (M13A)', icon: FileText },
    { key: 'leave', label: '📅 ใบลา (M13B)', icon: Calendar },
    { key: 'adjust', label: '💰 ปรับเงินเดือน (M13C)', icon: TrendingUp },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={22} style={{ color: 'var(--accent-primary)' }} />
            HR &amp; Payroll (M13)
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>สลิปเงินเดือน · ระบบลางาน · ปรับเงินเดือน</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={TAB_STYLES.container}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={TAB_STYLES.tab(activeTab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'payslip' && <EPayslipTab role={role} />}
        {activeTab === 'leave' && <LeaveManagementTab role={role} />}
        {activeTab === 'adjust' && (
          !['owner', 'store_manager', 'manager'].includes(role)
            ? <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}><AlertCircle size={36} style={{ opacity: 0.3, marginBottom: '8px' }} /><div>เฉพาะผู้จัดการขึ้นไปเท่านั้น</div></div>
            : <SalaryAdjTab user={user} />
        )}
      </div>
    </div>
  );
}
