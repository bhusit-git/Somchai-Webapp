import { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, Camera, MapPin, UserCheck, Plus, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Attendance() {
  const [activeTab, setActiveTab] = useState('attendance');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors rounded-t-lg ${
            activeTab === 'attendance'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          onClick={() => setActiveTab('attendance')}
        >
          บันทึกเวลาเข้า-ออก
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors rounded-t-lg ${
            activeTab === 'schedules'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          onClick={() => setActiveTab('schedules')}
        >
          ตารางกะพนักงาน
        </button>
      </div>

      {activeTab === 'attendance' && <AttendanceTab />}
      {activeTab === 'schedules' && <EmployeeSchedulesTab />}
    </div>
  );
}

// ============================================================
// TAB 1: Attendance
// ============================================================
function AttendanceTab() {
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ user_id: '', type: 'clock_in', note: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [attRes, userRes] = await Promise.all([
        supabase.from('attendance').select('*, users(name, full_name, employment_type, daily_rate)').order('timestamp', { ascending: false }).limit(50),
        supabase.from('users').select('id, name, full_name').eq('is_active', true)
      ]);
      setRecords(attRes.data || []);
      setUsers(userRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.user_id) return alert('กรุณาเลือกพนักงาน');

    const { data: branches } = await supabase.from('branches').select('id').limit(1);
    const branch_id = branches?.[0]?.id;
    if (!branch_id) return alert('ไม่พบสาขา กรุณาสร้างสาขาก่อน');

    const { error } = await supabase.from('attendance').insert({
      user_id: form.user_id,
      branch_id,
      type: form.type,
      note: form.note || null,
      timestamp: new Date().toISOString(),
    });

    if (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
      setShowModal(false);
      setForm({ user_id: '', type: 'clock_in', note: '' });
      loadData();
    }
  }

  function getTimeStr(ts) {
    return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  function getDateStr(ts) {
    return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>บันทึกเวลาเข้า-ออก</h3>
          <p className="text-sm text-muted">M1: Time Attendance — พนักงานลงเวลาเข้างาน</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> ลงเวลาด้วยตนเอง
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green"><LogIn size={22} /></div>
          <div className="stat-info">
            <h3>{records.filter(r => r.type === 'clock_in').length}</h3>
            <p>เข้างานล่าสุด</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><LogOut size={22} /></div>
          <div className="stat-info">
            <h3>{records.filter(r => r.type === 'clock_out').length}</h3>
            <p>ออกงานล่าสุด</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><UserCheck size={22} /></div>
          <div className="stat-info">
            <h3>{users.length}</h3>
            <p>พนักงานทั้งหมด</p>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="card-header">
          <div className="card-title">ประวัติการลงเวลา</div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>สถานะกะ</th>
                <th>ประเภท</th>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="6"><div className="empty-state"><Clock size={48} /><h3>ยังไม่มีข้อมูล</h3><p>กดปุ่ม "ลงเวลา" เพื่อเริ่มบันทึก</p></div></td></tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {rec.users?.full_name || rec.users?.name || '—'}
                    </td>
                    <td>
                      {rec.users?.employment_type === 'daily' ? (
                        <span className="text-emerald-400 text-xs font-semibold bg-emerald-400/10 px-2 py-1 rounded">💰 รายวัน ({rec.users.daily_rate}บ.)</span>
                      ) : (
                         <span className="text-slate-400 text-xs">รายเดือน</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${rec.type === 'clock_in' ? 'badge-success' : 'badge-warning'}`}>
                        {rec.type === 'clock_in' ? '🟢 เข้างาน' : '🟡 ออกงาน'}
                      </span>
                    </td>
                    <td>{getDateStr(rec.timestamp)}</td>
                    <td style={{ fontWeight: 600 }}>{getTimeStr(rec.timestamp)}</td>
                    <td>{rec.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ลงเวลาเข้า-ออก</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">พนักงาน *</label>
                  <select
                    className="form-select"
                    value={form.user_id}
                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    required
                  >
                    <option value="">-- เลือกพนักงาน --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ประเภท *</label>
                  <select
                    className="form-select"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    <option value="clock_in">🟢 เข้างาน (Clock In)</option>
                    <option value="clock_out">🟡 ออกงาน (Clock Out)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <textarea
                    className="form-textarea"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="เช่น ลืมลงเวลาของเมื่อวาน"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary"><Clock size={16} /> บันทึกเวลา</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 2: Employee Schedules
// ============================================================
function EmployeeSchedulesTab() {
  const [schedules, setSchedules] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ user_id: '', schedule_date: new Date().toISOString().split('T')[0], shift_type: 'morning', notes: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [schedRes, userRes] = await Promise.all([
        supabase.from('employee_schedules').select('*, users(name, full_name, employment_type)').order('schedule_date', { ascending: false }).limit(50),
        supabase.from('users').select('id, name, full_name').eq('is_active', true)
      ]);
      setSchedules(schedRes.data || []);
      setUsers(userRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.user_id || !form.schedule_date || !form.shift_type) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');

    const { data: branches } = await supabase.from('branches').select('id').limit(1);
    const branch_id = branches?.[0]?.id;
    if (!branch_id) return alert('ไม่พบสาขา กรุณาสร้างสาขาก่อน');

    const { error } = await supabase.from('employee_schedules').insert({
      user_id: form.user_id,
      branch_id,
      schedule_date: form.schedule_date,
      shift_type: form.shift_type,
      notes: form.notes || null,
    });

    if (error) {
      if (error.code === '23505') return alert('พนักงานคนนี้มีกะในวันและเวลาเดิมแล้ว');
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
      setShowAddForm(false);
      setForm({ ...form, user_id: '', notes: '' }); // keep date and shift_type for fast entry
      loadData();
    }
  }

  async function handleDelete(id) {
    if (!confirm('ยืนยันลบตารางงานนี้?')) return;
    await supabase.from('employee_schedules').delete().eq('id', id);
    loadData();
  }

  const shiftLabels = {
    'morning': { label: 'กะเช้า', color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' },
    'afternoon': { label: 'กะบ่าย', color: 'bg-orange-500/20 text-orange-500 border-orange-500/30' },
    'fullday': { label: 'เต็มวัน', color: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
    'off': { label: 'วันหยุด', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>ตารางกะพนักงาน</h3>
          <p className="text-sm text-muted">M1B: Employee Schedules — วางแผนกะการทำงานล่วงหน้า</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
          <Calendar size={18} /> จัดกะทำงาน
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">รายการตารางงาน</div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>พนักงาน</th>
                <th>ประเภทการจ้าง</th>
                <th>กะทำงาน</th>
                <th>หมายเหตุ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : schedules.length === 0 ? (
                <tr><td colSpan="6"><div className="empty-state"><Calendar size={48} /><h3>ยังไม่มีตารางงาน</h3><p>กดปุ่ม "จัดกะทำงาน" เพื่อเพิ่ม</p></div></td></tr>
              ) : (
                schedules.map((sch) => (
                  <tr key={sch.id}>
                    <td style={{ fontWeight: 600 }}>{new Date(sch.schedule_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={{ color: 'var(--text-primary)' }}>{sch.users?.full_name || sch.users?.name || '—'}</td>
                    <td>
                      {sch.users?.employment_type === 'daily' ? <span className="text-xs text-slate-300">รายวัน</span> : <span className="text-xs text-slate-500">รายเดือน</span>}
                    </td>
                    <td>
                       <span className={`text-xs px-2 py-1 rounded border ${shiftLabels[sch.shift_type]?.color || 'bg-slate-500'}`}>
                         {shiftLabels[sch.shift_type]?.label || sch.shift_type}
                       </span>
                    </td>
                    <td className="text-slate-400 text-sm">{sch.notes || '-'}</td>
                    <td>
                      <button className="text-red-400 hover:text-red-300 text-sm" onClick={() => handleDelete(sch.id)}>ลบ</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddForm && (
        <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>จัดกะทำงานใหม่</h3>
              <button className="btn-icon" onClick={() => setShowAddForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body space-y-4">
                <div className="form-group grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">วันที่ *</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={form.schedule_date} 
                      onChange={(e) => setForm({...form, schedule_date: e.target.value})} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="form-label">กะการทำงาน *</label>
                    <select className="form-select" value={form.shift_type} onChange={e => setForm({...form, shift_type: e.target.value})} required>
                      <option value="morning">กะเช้า</option>
                      <option value="afternoon">กะบ่าย</option>
                      <option value="fullday">เต็มวัน</option>
                      <option value="off">วันหยุด</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">พนักงาน *</label>
                  <select
                    className="form-select"
                    value={form.user_id}
                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    required
                  >
                    <option value="">-- เลือกพนักงาน --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <textarea
                    className="form-textarea"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="เช่น ทำแทนสมชาย"
                    rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddForm(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary"><Calendar size={16} /> ยืนยันเพิ่มกะ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
