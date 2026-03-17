const fs = require('fs');
const file = './src/pages/HRPayroll.jsx';
let content = fs.readFileSync(file, 'utf8');

// The replacement for LeaveManagementTab
const newLeaveTab = `function LeaveManagementTab({ role }) {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ user_id: '', leave_type: 'ลาป่วย', startDate: '', endDate: '', reason: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [leaveRes, userRes] = await Promise.all([
        supabase.from('hr_leave_requests').select('*, users(name, full_name)').order('created_at', { ascending: false }),
        supabase.from('users').select('id, name, full_name').eq('is_active', true)
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
    if (!form.user_id || !form.startDate || !form.endDate) return alert('กรอกข้อมูลไม่ครบถ้วน');
    
    const startDate = new Date(form.startDate);
    const endDate = new Date(form.endDate);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const { error } = await supabase.from('hr_leave_requests').insert({
      user_id: form.user_id,
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
            {role !== 'staff' && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>พนักงาน</label>
                <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px' }}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.name}</option>)}
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
            <div style={{ gridColumn: role !== 'staff' ? '1 / -1' : 'auto' }}>
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

      {(role === 'manager' || role === 'owner') && pending.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={15} style={{ color: '#f59e0b' }} /> รอการอนุมัติ ({pending.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pending.map(r => (
              <div key={r.id} style={{ background: 'var(--accent-warning-bg, rgba(245,158,11,0.08))', border: '1px solid #f59e0b', borderRadius: 'var(--radius-sm)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>{r.users?.full_name || r.users?.name || '—'}</div>
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
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>{r.users?.full_name || r.users?.name || '—'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ background: leaveTypeColor[r.leave_type], color: '#fff', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', fontWeight: '700', marginRight: '6px' }}>{r.leave_type}</span>
                    {r.start_date} – {r.end_date} · {r.days} วัน · {r.reason}
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
}`;

// The replacement for SalaryAdjTab
const newSalaryAdjTab = `function SalaryAdjTab() {
  const [adjustments, setAdjustments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ user_id: '', adjType: 'income', label: '', amount: '', note: '' });
  const [showForm, setShowForm] = useState(false);

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
    deduction: ['ค่าเสียหาย', 'ลาไม่รับค่าจ้าง', 'เบิกล่วงหน้า', 'ขาด/สาย', 'รายการหักอื่นๆ'],
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.user_id || !form.label || !form.amount) return alert('กรอกข้อมูลไม่ครบถ้วน');
    
    // Convert current date to local date string YYYY-MM-DD
    const now = new Date();
    const actionDate = \`\${now.getFullYear()}-\${String(now.getMonth()+1).padStart(2,'0')}-\${String(now.getDate()).padStart(2,'0')}\`;
    const amt = Math.abs(parseFloat(form.amount));

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
      setShowForm(false);
      setForm(f => ({ ...f, amount: '', note: '' })); // keep user/label for fast entry
      loadData();
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
          <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '14px' }}>เพิ่มรายการบวก/หัก</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>พนักงาน</label>
              <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} style={inputStyle}>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.name}</option>)}
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
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>หมายเหตุ</label>
              <input type="text" placeholder="ระบุเหตุผล/รายละเอียด..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button type="submit" style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>บันทึก</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>ยกเลิก</button>
          </div>
        </form>
      )}

      {loading && adjustments.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {adjustments.map(adj => (
            <div key={adj.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: \`4px solid \${adj.adjust_type === 'income' ? '#16a34a' : '#ef4444'}\` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {adj.adjust_type === 'income'
                  ? <TrendingUp size={20} style={{ color: '#16a34a' }} />
                  : <TrendingDown size={20} style={{ color: '#ef4444' }} />
                }
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>{adj.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{adj.users?.full_name || adj.users?.name || '—'} · {new Date(adj.action_date).toLocaleDateString()}</div>
                  {adj.note && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>หมายเหตุ: {adj.note}</div>}
                </div>
              </div>
              <div style={{ fontWeight: '900', fontSize: '18px', color: adj.adjust_type === 'income' ? '#16a34a' : '#ef4444' }}>
                {adj.adjust_type === 'income' ? '+' : '-'}฿{Number(adj.amount).toLocaleString()}
              </div>
            </div>
          ))}
          {adjustments.length === 0 && !loading && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>ยังไม่มีข้อมูลการปรับเงินเดือน</div>}
        </div>
      )}
    </div>
  );
}
`;

// Replace LeaveManagementTab
const leaveTabRegex = /function LeaveManagementTab\([\s\S]*?^\}/m;
// Replace SalaryAdjTab
const salaryAdjRegex = /function SalaryAdjTab\([\s\S]*?^\}/m;

// More precise parsing
const parts1 = content.split('/* ── TAB 2: LEAVE MANAGEMENT ── */');
const preLeave = parts1[0];
const parts2 = parts1[1].split('/* ── TAB 3: SALARY ADJUSTMENT ── */');
const parts3 = parts2[1].split('// ────────────────────── MAIN COMPONENT ──────────────────────');

const newContent = preLeave + 
'/* ── TAB 2: LEAVE MANAGEMENT ── */\n' + newLeaveTab + '\n\n' + 
'/* ── TAB 3: SALARY ADJUSTMENT ── */\n' + newSalaryAdjTab + '\n\n' + 
'// ────────────────────── MAIN COMPONENT ──────────────────────' + parts3[1];

fs.writeFileSync(file, newContent);
console.log('Successfully patched HRPayroll.jsx');
