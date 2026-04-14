import { useState, useEffect } from 'react';
import {
  Users,
  Search,
  X,
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
  container: { display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border-primary)', paddingBottom: '0' },
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
      // Use proper Date arithmetic for month rollover (fixes December → January bug)
      const nextMonthDate = new Date(y, m + 1, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonthStr = String(nextMonthDate.getMonth() + 1).padStart(2, '0');

      periods.push({
        value: `${y}-${monthStr}-end`,
        label: `รอบสิ้นเดือน ${thaiLabel} (16-${daysInMonth})`,
        startISO: `${y}-${monthStr}-16T00:00:00.000Z`,
        endISO: `${nextYear}-${nextMonthStr}-01T00:00:00.000Z`,
        isMid: false,
        payDate: `${nextYear}-${nextMonthStr}-05`,
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
  const bankTransfer = Math.max(0, netPay - cashPaid);

  const printStyle = {
    background: '#ffffff',
    color: '#000000',
    fontFamily: 'Arial, sans-serif',
    padding: '32px',
    borderRadius: '0',
    border: 'none',
    maxWidth: '800px',
    margin: '0 auto',
  };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body * { visibility: hidden; }
          #payslip-print-area, #payslip-print-area * { visibility: visible; }
          #payslip-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100% !important;
            margin: 0;
            padding: 20px;
            border: none !important;
            font-size: 12px;
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
          <div style={{ fontSize: '13px' }}>{employee.bankAccount} {employee.name?.split(' ')?.[1] ? `(${employee.name.split(' ')[1]})` : ''}<br />{employee.bankName}</div>
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
          <tr style={{ background: '#1c1c1f', color: '#fff' }}>
            <th colSpan={2} style={{ border: '1px solid #444', padding: '8px 12px', textAlign: 'center', fontWeight: '600' }}>เงินได้</th>
            <th colSpan={2} style={{ border: '1px solid #444', padding: '8px 12px', textAlign: 'center', fontWeight: '600' }}>รายการหัก</th>
            <th colSpan={2} style={{ border: '1px solid #444', padding: '8px 12px', textAlign: 'center', fontWeight: '600' }}>หมายเหตุ</th>
          </tr>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', fontWeight: '600', color: '#555', background: '#fff' }}>รายการ</th>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: '#555', background: '#fff' }}>จำนวนเงิน</th>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', fontWeight: '600', color: '#555', background: '#fff' }}>รายการ</th>
            <th style={{ border: '1px solid #ccc', padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: '#555', background: '#fff' }}>จำนวนเงิน</th>
            <th colSpan={2} style={{ border: '1px solid #ccc', padding: '6px 12px', background: '#fff' }}></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(5, payslip.income.length, payslip.deductions.length) }).map((_, i) => {
            const inc = payslip.income[i] || { label: '', amount: 0 };
            const ded = payslip.deductions[i] || { label: '', amount: 0 };
            let remarkLabel = '';
            let remarkValue = '';
            if (i === 2) { remarkLabel = 'สรุป'; remarkValue = Number(netPay).toLocaleString(); }
            if (i === 3) { remarkLabel = 'รวมเงินได้'; remarkValue = Number(totalIncome).toLocaleString(); }
            if (i === 4) { remarkLabel = 'รวมรายการหัก'; remarkValue = Number(totalDeductions).toLocaleString(); }

            return (
              <tr key={i}>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', color: '#555' }}>{inc.label}</td>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', textAlign: 'right', color: '#555' }}>
                  {Number(inc.amount) > 0 ? Number(inc.amount).toLocaleString() : ''}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', color: '#555' }}>{ded.label}</td>
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', textAlign: 'right', color: '#555' }}>
                  {Number(ded.amount) > 0 ? Number(ded.amount).toLocaleString() : ''}
                </td>
                {i === 2 && remarkLabel
                  ? <td style={{ border: '1px solid #ccc', padding: '7px 12px', fontWeight: '700', textAlign: 'center', color: '#777' }}>{remarkLabel}</td>
                  : <td style={{ border: '1px solid #ccc', padding: '7px 12px', color: '#777', fontWeight: remarkLabel ? '700' : '400', textAlign: remarkLabel ? 'center' : 'left' }}>{remarkLabel}</td>
                }
                <td style={{ border: '1px solid #ccc', padding: '7px 12px', textAlign: 'right', fontWeight: remarkLabel ? '700' : '400', color: '#777' }}>
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

/* ── TAB 1: E-PAYSLIP (REDESIGNED) ── */

function PayslipDetailPanel({ payslip, onClose, onApprove, onDownload, downloading, onPrint, role }) {
  if (!payslip) return null;

  const { employee } = payslip;
  const isApproved = payslip.status === 'approved' || payslip.status === 'paid';

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '450px',
      background: 'var(--bg-primary)', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
      zIndex: 1000, display: 'flex', flexDirection: 'column',
      transform: 'translateX(0)', transition: 'transform 0.3s ease-in-out',
      borderLeft: '1px solid var(--border-primary)'
    }}>
      {/* Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' }}>
            {employee?.name?.charAt(0) || '?'}
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '16px' }}>{employee?.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{employee?.position} · {employee?.branch}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={24} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>สถานะ</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '14px', color: isApproved ? '#16a34a' : '#f59e0b' }}>
              {isApproved ? <CheckCircle size={16} /> : <Clock size={16} />}
              {isApproved ? 'อนุมัติแล้ว' : 'รอดำเนินการ'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Net Pay</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#16a34a' }}>฿{Number(payslip.net_pay || 0).toLocaleString()}</div>
          </div>
        </div>

        {role === 'owner' && (
          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', marginBottom: '24px', display: 'flex', gap: '32px' }}>
            <div>
               <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>จำนวนวันที่มาทำงาน</div>
               <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{payslip.uniqueDays || 0} วัน</div>
            </div>
            <div>
               <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>จำนวนกะทั้งหมด</div>
               <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{payslip.shiftCount || 0} กะ</div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Earnings */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1B3A6B', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #ccc' }}>รายรับ (Earnings)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {payslip.items?.filter(i => i.item_type === 'earning').map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{i.description}</span>
                  <span style={{ fontWeight: '600' }}>{Number(i.amount).toLocaleString()}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '800', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #ccc' }}>
                <span>รวมรายรับ</span>
                <span style={{ color: '#16a34a' }}>฿{Number(payslip.total_earnings || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1B3A6B', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #ccc' }}>รายการหัก (Deductions)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {payslip.items?.filter(i => i.item_type === 'deduction').map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{i.description}</span>
                  <span style={{ fontWeight: '600', color: '#ef4444' }}>-{Number(i.amount).toLocaleString()}</span>
                </div>
              ))}
              {(payslip.items?.filter(i => i.item_type === 'deduction').length === 0) && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ไม่มีรายการหัก</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '800', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #ccc' }}>
                <span>รวมรายการหัก</span>
                <span style={{ color: '#ef4444' }}>฿{Number(payslip.total_deductions || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{ padding: '20px', borderTop: '1px solid var(--border-primary)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!isApproved && (
          <button onClick={() => onApprove(payslip.id)} style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <CheckCircle size={18} /> อนุมัติสลิปนี้ (Approve)
          </button>
        )}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => onDownload(payslip)} disabled={downloading} style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: downloading ? 0.7 : 1 }}>
            <Download size={16} /> {downloading ? 'กำลังโหลด...' : 'PDF'}
          </button>
          <button onClick={onPrint} style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Printer size={16} /> พิมพ์สลิป
          </button>
        </div>
      </div>
    </div>
  );
}

function EPayslipTab({ role }) {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState(PAY_PERIODS[0]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const roleLabels = { owner:'เจ้าของ', manager:'Area Mgr', store_manager:'ผจก.ร้าน', cook:'พ่อครัว', staff:'พนักงาน' };

  useEffect(() => { loadCycleData(); }, [selectedPeriod?.value]);

  async function loadCycleData() {
    if (!selectedPeriod) return;
    setLoading(true);
    try {
      const { startISO, endISO, isMid } = selectedPeriod;
      
      // 1. Fetch pending leaves in period (Timezone aware logic from start_date/end_date)
      const leafStart = startISO.substring(0, 10);
      const leafEnd = endISO.substring(0, 10);
      const { count } = await supabase
        .from('hr_leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('start_date', leafStart)
        .lte('start_date', leafEnd);
      setPendingLeavesCount(count || 0);

      // 2. Check if cycle exists
      const { data: cycles } = await supabase
        .from('payroll_cycles')
        .select('*')
        .eq('cycle_name', selectedPeriod.value);

      if (cycles && cycles.length > 0) {
        const currentCycle = cycles[0];

        if (currentCycle.status === 'draft') {
          // Draft cycle: delete stale data and regenerate with latest attendance/salary
          await supabase.from('payslip_items').delete().in(
            'payslip_id',
            (await supabase.from('employee_payslips').select('id').eq('cycle_id', currentCycle.id)).data?.map(p => p.id) || []
          );
          await supabase.from('employee_payslips').delete().eq('cycle_id', currentCycle.id);
          await supabase.from('payroll_cycles').delete().eq('id', currentCycle.id);
          // Regenerate fresh
          await generateDraftCycle();
        } else {
          // Approved/completed cycle: show existing locked data
          const { data: psData } = await supabase
            .from('employee_payslips')
            .select('*, users(id, name, full_name, employee_id, role, employment_type, base_salary, daily_rate, pay_cycle, daily_cash_advance, bank_account, bank_name, branches(name)), payslip_items(*)')
            .eq('cycle_id', currentCycle.id);

          const { data: attData } = await supabase
            .from('attendance')
            .select('user_id, timestamp')
            .eq('type', 'clock_in')
            .eq('is_deleted', false)
            .gte('timestamp', selectedPeriod.startISO)
            .lt('timestamp', selectedPeriod.endISO);

          const formattedPslips = formatPayslipData(psData || []);
          formattedPslips.forEach(ps => {
             const uAtt = (attData || []).filter(a => a.user_id === ps.employee.rawId);
             ps.shiftCount = uAtt.length;
             ps.uniqueDays = new Set(uAtt.map(a => new Date(a.timestamp).toDateString())).size;
          });

          setCycle(currentCycle);
          setPayslips(formattedPslips);
        }
      } else {
        // 3. Auto-generate draft cycle
        await generateDraftCycle();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function formatPayslipData(rawPayslips) {
    return rawPayslips.map(ps => ({
      ...ps,
      employee: {
        rawId: ps.users?.id || ps.employee_id,
        id: ps.users?.employee_id || `EMP${String(ps.users?.id || ps.employee_id).substring(0,4)}`,
        name: ps.users?.full_name || ps.users?.name || 'Unknown',
        position: roleLabels[ps.users?.role] || ps.users?.role || '-',
        branch: ps.users?.branches?.name || '-',
        bankAccount: ps.users?.bank_account || '-',
        bankName: ps.users?.bank_name || '-',
        payCycle: ps.users?.pay_cycle || 'monthly',
        dailyCashAdvanceRate: ps.users?.daily_cash_advance || 0
      },
      items: ps.payslip_items || []
    }));
  }

  async function generateDraftCycle() {
    const { startISO, endISO, isMid } = selectedPeriod;
    const adjStart = startISO.substring(0, 10);
    const adjEnd = endISO.substring(0, 10);

    // Fetch users
    let query = supabase.from('users').select('*, branches(name)').eq('is_active', true);
    if (role !== 'owner' && role !== 'manager' && role !== 'store_manager') {
      query = query.eq('id', user?.id);
    }
    const { data: usersData } = await query;
    const userList = usersData || [];

    // Filter out monthly on mid-cycle (except owner)
    const validUsers = userList.filter(u => {
      if (u.role === 'owner') return true;
      const payCycle = u.pay_cycle || 'monthly';
      return !(payCycle === 'monthly' && isMid);
    });

    if (validUsers.length === 0) {
      setCycle(null);
      setPayslips([]);
      return;
    }

    // Insert cycle
    const { data: cycleRes, error: cycleErr } = await supabase
      .from('payroll_cycles')
      .insert({
        cycle_name: selectedPeriod.value,
        start_date: adjStart,
        end_date: adjEnd,
        status: 'draft'
      }).select();
    
    if (cycleErr) throw cycleErr;
    const newCycle = cycleRes[0];
    setCycle(newCycle);

    // Fetch Attendance & Adjustments
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
        .lte('action_date', adjEnd) 
    ]);

    const attData = attRes.data || [];
    const adjData = adjRes.data || [];

    const newPayslipsToInsert = [];
    const newItemsToInsert = [];

    validUsers.forEach(u => {
      const uAtt = attData.filter(a => a.user_id === u.id);
      const shiftCount = uAtt.length;
      const uniqueDays = new Set(uAtt.map(a => new Date(a.timestamp).toDateString())).size;
      
      let basicIncome = 0;
      let incomeLabel = '';
      if (u.employment_type === 'daily') {
        const customRates = u.custom_rates || {};
        if (Object.keys(customRates).length > 0) {
          basicIncome = uAtt.reduce((sum, att) => {
            const day = new Date(att.timestamp).getDay();
            return sum + (customRates[day] !== undefined ? Number(customRates[day]) : (u.daily_rate || 0));
          }, 0);
        } else {
          basicIncome = shiftCount * (u.daily_rate || 0);
        }
        incomeLabel = 'ค่าจ้างรายวัน';
      } else {
        const fullSalary = u.base_salary || 0;
        if (u.pay_cycle === 'bimonthly') {
          basicIncome = fullSalary / 2;
          incomeLabel = `เงินเดือน${isMid ? 'รอบกลางเดือน' : 'รอบสิ้นเดือน'}`;
        } else {
          basicIncome = isMid ? 0 : fullSalary;
          incomeLabel = isMid ? 'เงินเดือน (รอบสิ้นเดือน)' : 'เงินเดือน (Base Salary)';
        }
      }

      const uAdj = adjData.filter(a => a.user_id === u.id);
      let deductions = uAdj.filter(a => a.adjust_type === 'deduction');
      let incomes = uAdj.filter(a => a.adjust_type === 'income');

      // Cash advance
      if (u.employment_type === 'daily' && u.daily_cash_advance > 0 && uniqueDays > 0) {
        deductions.push({ label: 'เบิกเงินสดรายวัน', amount: uniqueDays * u.daily_cash_advance });
      }

      // Allowances
      if (Number(u.position_allowance) > 0 && !isMid) {
        incomes.unshift({ label: 'ค่าตำแหน่ง', amount: Math.round(Number(u.position_allowance)) });
      }

      const totalE = basicIncome + incomes.reduce((s, x) => s + Number(x.amount), 0);
      const totalD = deductions.reduce((s, x) => s + Number(x.amount), 0);
      const netPay = totalE - totalD;

      // Unique pseudo-random ID for linking items
      const tempPayslipId = Math.random().toString(36).substring(2) + Date.now().toString(36);

      newPayslipsToInsert.push({
        cycle_id: newCycle.id,
        employee_id: u.id,
        base_salary_prorated: basicIncome,
        total_earnings: totalE,
        total_deductions: totalD,
        net_pay: netPay,
        status: 'draft',
        _tempId: tempPayslipId // helper — stripped before DB insert
      });

      // Income Items
      newItemsToInsert.push({ _tempId: tempPayslipId, item_type: 'earning', item_code: 'BASE', description: incomeLabel, amount: basicIncome });
      incomes.forEach((inc, idx) => {
        newItemsToInsert.push({ _tempId: tempPayslipId, item_type: 'earning', item_code: 'ADJ', description: inc.label, amount: inc.amount });
      });
      // Deduction Items
      deductions.forEach((ded, idx) => {
        newItemsToInsert.push({ _tempId: tempPayslipId, item_type: 'deduction', item_code: 'DED', description: ded.label, amount: ded.amount });
      });
    });

    if (newPayslipsToInsert.length > 0) {
      // Step 1: Insert payslips (strip _tempId helper before sending to DB)
      const toInsert = newPayslipsToInsert.map(({ _tempId, ...rest }) => rest);
      const { data: insertedPayslips, error: err1 } = await supabase.from('employee_payslips').insert(toInsert).select();
      if (err1) throw err1;

      // Map DB UUIDs back to tempItems
      const insertedItems = [];
      insertedPayslips.forEach(dbPs => {
          // find matching employee_id to get tempId
          const matchingDraft = newPayslipsToInsert.find(p => p.employee_id === dbPs.employee_id);
          if (matchingDraft) {
              const matchedItems = newItemsToInsert.filter(i => i._tempId === matchingDraft._tempId);
              matchedItems.forEach(mi => {
                  insertedItems.push({
                      payslip_id: dbPs.id,
                      item_type: mi.item_type,
                      item_code: mi.item_code,
                      description: mi.description,
                      amount: mi.amount
                  });
              });
          }
      });
      
      if (insertedItems.length > 0) {
          const { error: err2 } = await supabase.from('payslip_items').insert(insertedItems);
          if (err2) throw err2;
      }
      
      // Refetch formatted
      const { data: psData } = await supabase
        .from('employee_payslips')
        .select('*, users(id, name, full_name, employee_id, role, employment_type, base_salary, daily_rate, pay_cycle, daily_cash_advance, bank_account, bank_name, branches(name)), payslip_items(*)')
        .eq('cycle_id', newCycle.id);
      
      const formattedPslips = formatPayslipData(psData || []);
      formattedPslips.forEach(ps => {
         const uAtt = attData.filter(a => a.user_id === ps.employee.rawId);
         ps.shiftCount = uAtt.length;
         ps.uniqueDays = new Set(uAtt.map(a => new Date(a.timestamp).toDateString())).size;
      });
      
      setPayslips(formattedPslips);
    } else {
      setPayslips([]);
    }
  }

  const handleApproveAll = async () => {
    if (!confirm('ยืนยันที่จะอนุมัติสลิปทั้งหมดในรอบนี้หรือไม่?')) return;
    const ids = payslips.filter(p => p.status === 'draft').map(p => p.id);
    if (ids.length === 0) return alert('ไม่มีสลิปที่รออนุมัติ');
    
    await supabase.from('employee_payslips').update({ status: 'approved' }).in('id', ids);
    loadCycleData();
  };

  const handleApproveSingle = async (payslipId) => {
    await supabase.from('employee_payslips').update({ status: 'approved' }).eq('id', payslipId);
    setPayslips(prev => prev.map(p => p.id === payslipId ? { ...p, status: 'approved' } : p));
    if (selectedPayslip && selectedPayslip.id === payslipId) {
      setSelectedPayslip(prev => ({ ...prev, status: 'approved' }));
    }
  };

  const handleDownloadPdfSingle = async (ps) => {
    setDownloading(true);
    try {
      await new Promise(r => setTimeout(r, 300)); // ensure render
      const printArea = document.getElementById('payslip-print-area');
      if (!printArea) return alert('ไม่พบเอกสารสำหรับพิมพ์');
      
      // Scroll to print area to ensure it's in the viewport for html2canvas
      printArea.scrollIntoView({ behavior: 'instant' });
      await new Promise(r => setTimeout(r, 200));
      
      const canvas = await html2canvas(printArea, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        scrollY: -window.scrollY,
        windowHeight: printArea.scrollHeight + 200
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth() - 20; // 10mm margin each side
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth, pdfHeight);
      pdf.save(`Payslip_${ps.employee?.id || 'unknown'}_${cycle?.cycle_name || 'cycle'}.pdf`);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการสร้าง PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrintSingle = () => {
    setTimeout(() => window.print(), 100);
  };

  // KPIs
  const totalPayroll = payslips.reduce((s, p) => s + Number(p.net_pay || 0), 0);
  const totalDeductions = payslips.reduce((s, p) => s + Number(p.total_deductions || 0), 0);
  const totalHeadcount = payslips.length;
  const isAllApproved = payslips.length > 0 && payslips.every(p => p.status === 'approved' || p.status === 'paid');

  const filteredPayslips = payslips.filter(p => {
    const nameMatch = (p.employee?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const idMatch = (p.employee?.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchSearch = nameMatch || idMatch;
    const matchStatus = statusFilter === 'all' ? true : p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      {/* SECTION 1: Header Dropdown & KPIs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap' }}>รอบเงินเดือน :</label>
          <select
            value={selectedPeriod?.value || ''}
            onChange={e => setSelectedPeriod(PAY_PERIODS.find(x => x.value === e.target.value) || PAY_PERIODS[0])}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', minWidth: '280px' }}
          >
            {PAY_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {(role === 'owner' || role === 'manager' || role === 'store_manager') ? (
          <div style={{ display: 'flex', gap: '10px' }}>
             <button onClick={handleApproveAll} disabled={isAllApproved || payslips.length === 0} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: isAllApproved ? 'var(--bg-card)' : '#16a34a', color: isAllApproved ? 'var(--text-muted)' : '#fff', cursor: isAllApproved ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <CheckCircle size={15} /> Approve All
             </button>
             <button onClick={() => loadCycleData()} disabled={loading} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', opacity: loading ? 0.6 : 1 }}>
               🔄 คำนวณใหม่
             </button>
             <button style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <Download size={15} /> ดาวน์โหลดรายงาน
             </button>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600' }}>ยอดจ่ายสุทธิรวม (Net Pay)</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#16a34a' }}>฿ {totalPayroll.toLocaleString()}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600' }}>พนักงานทั้งหมด (Headcount)</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--text-primary)' }}>{totalHeadcount} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 'normal' }}>คน</span></div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600' }}>ยอดหักรวม (Deductions)</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#ef4444' }}>฿ {totalDeductions.toLocaleString()}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600' }}>สถานะ (Status)</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: isAllApproved ? '#16a34a' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isAllApproved ? 'พร้อมจ่าย (Ready)' : 'รออนุมัติ (Pending)'}
          </div>
        </div>
      </div>

      {/* SECTION 2: Pending Alerts & Search */}
      {pendingLeavesCount > 0 && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: 'var(--radius-sm)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b45309', fontWeight: '700' }}>
            <AlertCircle size={20} />
            มีใบลาพนักงานรออนุมัติ {pendingLeavesCount} รายการ ในรอบเงินเดือนนี้
          </div>
          <button style={{ padding: '6px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
            Review (ตรวจสอบ)
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="ค้นหาชื่อพนักงาน หรือ รหัส..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box', fontSize: '14px' }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}>
          <option value="all">สถานะทั้งหมด</option>
          <option value="draft">รอดำเนินการ (Draft)</option>
          <option value="approved">อนุมัติแล้ว (Approved)</option>
        </select>
      </div>

      {/* SECTION 3: Data Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', overflow: 'hidden' }}>
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10, boxShadow: '0 1px 0 var(--border-primary)' }}>
              <tr>
                <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600', width: '25%' }}>พนักงาน</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600' }}>รายรับรวม</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600' }}>หักรวม</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600' }}>ยอดสุทธิ (Net Pay)</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600', width: '15%' }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}><span className="animate-pulse">กำลังโหลดข้อมูล...</span></td></tr>
              ) : filteredPayslips.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูลพนักงานในรอบนี้</td></tr>
              ) : (
                filteredPayslips.map(ps => (
                  <tr 
                    key={ps.id} 
                    onClick={() => setSelectedPayslip(ps)}
                    style={{ borderBottom: '1px solid var(--border-primary)', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                           {ps.employee.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '14px' }}>{ps.employee.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ps.employee.position}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px' }}>{Number(ps.total_earnings).toLocaleString()}</td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#ef4444' }}>{Number(ps.total_deductions > 0 ? ps.total_deductions : 0).toLocaleString()}</td>
                    <td style={{ padding: '16px', fontSize: '15px', fontWeight: '800', color: '#16a34a' }}>฿{Number(ps.net_pay).toLocaleString()}</td>
                    <td style={{ padding: '16px' }}>
                      {ps.status === 'draft' ? (
                         <span style={{ padding: '6px 10px', borderRadius: '20px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> รอดำเนินการ</span>
                      ) : (
                         <span style={{ padding: '6px 10px', borderRadius: '20px', background: 'rgba(22, 163, 74, 0.1)', border: '1px solid rgba(22, 163, 74, 0.2)', color: '#16a34a', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={12} /> อนุมัติแล้ว</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: Slide-out Panel */}
      <PayslipDetailPanel 
        payslip={selectedPayslip} 
        onClose={() => setSelectedPayslip(null)} 
        onApprove={handleApproveSingle}
        onDownload={handleDownloadPdfSingle}
        downloading={downloading}
        onPrint={handlePrintSingle}
        role={role}
      />
      {selectedPayslip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setSelectedPayslip(null)} />
      )}

      {/* Hidden Print View */}
      {selectedPayslip && (
        <PayslipPrintView 
          payslip={{
            period: selectedPeriod?.label?.split(' ')?.[1] + ' ' + (selectedPeriod?.label?.split(' ')?.[2] || '') + ' ' + (selectedPeriod?.label?.match(/\(.*?\)/)?.[0] || ''), // Extract just name part e.g. "มี.ค. 2026 (16-31)"
            issueDate: selectedPeriod?.payDate ? new Date(selectedPeriod.payDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date().toLocaleDateString('th-TH'),
            payCycleLabel: PAY_CYCLE_LABELS[selectedPayslip.employee?.payCycle]?.label || 'จ่ายสิ้นเดือน',
            payCycleColor: PAY_CYCLE_LABELS[selectedPayslip.employee?.payCycle]?.color || '#3b82f6',
            income: selectedPayslip.items?.filter(i => i.item_type === 'earning').map(i => ({ label: i.description, amount: i.amount })) || [],
            deductions: selectedPayslip.items?.filter(i => i.item_type === 'deduction').map(i => ({ label: i.description, amount: i.amount })) || [],
            cumulativeIncome: selectedPayslip.total_earnings || 0,
            cashPaid: selectedPayslip.items?.filter(i => i.item_code === 'DED' && i.description.includes('เบิกเงินสด')).reduce((s, x) => s + x.amount, 0) || 0,
            dailyCashAdvanceRate: selectedPayslip.employee?.dailyCashAdvanceRate || 0
          }} 
          employee={{
            ...selectedPayslip.employee
          }} 
        />
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
          <div key={lb.type} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
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
        <form onSubmit={handleSubmit} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}>ยื่นใบลาใหม่</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {role === 'owner' && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>พนักงาน</label>
                <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>ประเภทการลา</label>
              <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}>
                {['ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'อื่นๆ'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>วันเริ่มลา</label>
              <input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>วันสิ้นสุด</label>
              <input type="date" required value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: role === 'owner' ? '1 / -1' : 'auto' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>เหตุผล</label>
              <input type="text" placeholder="ระบุเหตุผล..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button type="submit" style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}>ยืนยันส่งคำขอ</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>ยกเลิก</button>
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
              <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '16px' }}>รายการปรับเงินเดือน</div>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
          <Plus size={15} /> เพิ่มรายการ
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '20px', marginBottom: '20px' }}>
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
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(f => ({ ...f, amount: '', note: '', action_date: getTodayStr() })); }} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>ยกเลิก</button>
          </div>
        </form>
      )}

      {loading && adjustments.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {adjustments.map(adj => (
            <div key={adj.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid ${adj.adjust_type === 'income' ? '#16a34a' : '#ef4444'}` }}>
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
