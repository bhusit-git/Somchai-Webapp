import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Webcam from 'react-webcam';
import { Clock, LogIn, LogOut, Camera, UserCheck, Plus, Calendar, X, RefreshCw, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ============================================================
// Utility helpers
// ============================================================
function getTimeStr(ts) {
  return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
function getDateStr(ts) {
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}
function getShiftLabel(type) {
  const map = {
    morning: { label: 'กะเช้า', color: '#f59e0b', icon: '🌅' },
    afternoon: { label: 'กะบ่าย', color: '#f97316', icon: '☀️' },
    evening: { label: 'กะเย็น', color: '#ec4899', icon: '🌆' },
    night: { label: 'กะดึก', color: '#8b5cf6', icon: '🌙' },
    fullday: { label: 'เต็มวัน', color: '#3b82f6', icon: '⏰' },
  };
  return map[type] || { label: type, color: '#8b5cf6', icon: '📋' };
}

export default function Attendance() {
  const [activeTab, setActiveTab] = useState('kiosk');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors rounded-t-lg ${
            activeTab === 'kiosk'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          onClick={() => setActiveTab('kiosk')}
        >
          📷 ลงเวลา (พนักงาน)
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors rounded-t-lg ${
            activeTab === 'history'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          onClick={() => setActiveTab('history')}
        >
          📋 ประวัติการลงเวลา
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors rounded-t-lg ${
            activeTab === 'schedules'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          onClick={() => setActiveTab('schedules')}
        >
          📅 ตารางกะพนักงาน
        </button>
      </div>

      {activeTab === 'kiosk' && <KioskTab />}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'schedules' && <EmployeeSchedulesTab />}
    </div>
  );
}

// ============================================================
// TAB 1: Kiosk — Employee self-serve clock in/out
// ============================================================
function KioskTab() {
  const { user: authUser } = useAuth();
  const [now, setNow] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [lastRecord, setLastRecord] = useState(null);
  const [step, setStep] = useState('loading'); // loading | confirm | camera | done
  const [clockType, setClockType] = useState('clock_in');
  const [capturedImage, setCapturedImage] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { success, message }
  const webcamRef = useRef(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cache branch settings via React Query (shared across tabs)
  const { data: branchSettings = {} } = useQuery({
    queryKey: ['branchSettings', authUser?.branch_id],
    queryFn: async () => {
      const { data } = await supabase.from('branches').select('settings').eq('id', authUser.branch_id).maybeSingle();
      return data?.settings || {};
    },
    enabled: !!authUser?.branch_id,
  });

  // Auto-select logged-in user on mount — parallel fetch
  useEffect(() => {
    if (authUser?.id) {
      loadUserParallel(authUser.id);
    }
  }, [authUser]);

  async function loadUserParallel(userId) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // Fetch user profile, today schedule, and last attendance record IN PARALLEL
    const [userRes, schedRes, lastRes] = await Promise.all([
      supabase.from('users').select('id, name, full_name, employment_type, daily_rate').eq('id', userId).maybeSingle(),
      supabase.from('employee_schedules').select('*').eq('user_id', userId).eq('schedule_date', today),
      supabase.from('attendance').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const userData = userRes.data;
    if (!userData) return;

    setSelectedUser(userData);
    const sched = schedRes.data && schedRes.data.length > 0 ? schedRes.data[0] : null;
    setTodaySchedule(sched);
    setLastRecord(lastRes.data);
    setClockType(lastRes.data?.type === 'clock_in' ? 'clock_out' : 'clock_in');
    setStep('confirm');
  }

  const capturePhoto = useCallback(() => {
    const img = webcamRef.current?.getScreenshot();
    if (img) setCapturedImage(img);
  }, [webcamRef]);

  async function submitAttendance() {
    if (!capturedImage) return alert('กรุณาถ่ายรูปก่อน');
    setSubmitting(true);
    try {
      const branch_id = authUser?.branch_id;
      if (!branch_id) throw new Error('ไม่พบสาขา');

      // Upload selfie to Supabase Storage (fallback to data URL if storage fails)
      const filename = `selfie_${selectedUser.id}_${Date.now()}.jpg`;
      const blob = await (await fetch(capturedImage)).blob();
      let selfie_url = null;
      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('selfies')
          .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });
        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from('selfies').getPublicUrl(filename);
          selfie_url = urlData?.publicUrl || null;
        } else if (uploadError) {
          console.warn('Selfie upload failed, using data URL fallback:', uploadError.message);
        }
      } catch (storageErr) {
        console.warn('Storage error, using data URL fallback:', storageErr.message);
      }
      // Fallback: save the captured image data URL directly
      if (!selfie_url) {
        selfie_url = capturedImage;
      }

      let is_late = false;
      if (clockType === 'clock_in' && todaySchedule) {
        const shiftType = todaySchedule.shift_type;
        const shiftConfig = branchSettings?.shift_times?.[shiftType];
        if (shiftConfig?.start) {
          const limitMin = branchSettings?.late_tolerance_minutes || 0;
          const [sH, sM] = shiftConfig.start.split(':').map(Number);
          const limitTime = new Date();
          limitTime.setHours(sH, sM + Number(limitMin), 0, 0);
          if (new Date() > limitTime) is_late = true;
        }
      }

      const { error } = await supabase.from('attendance').insert({
        user_id: selectedUser.id,
        branch_id,
        type: clockType,
        selfie_url,
        is_late,
        shift_type: todaySchedule?.shift_type || null,
        note: note.trim() || null,
        timestamp: new Date().toISOString(),
      });

      if (error) throw error;

      setResult({ success: true, message: clockType === 'clock_in' ? '✅ เข้างานสำเร็จ!' : '✅ ออกงานสำเร็จ!' });
      setStep('done');

      // Auto-reset after 4 seconds
      setTimeout(() => {
        setStep('select_user');
        setSelectedUser(null);
        setCapturedImage(null);
        setResult(null);
      }, 4000);
    } catch (err) {
      setResult({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
      setStep('done');
      setTimeout(() => {
        setStep('confirm');
        setResult(null);
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  }

  async function reset() {
    setCapturedImage(null);
    setNote('');
    setResult(null);
    // Re-load logged-in user data fresh and go back to confirm
    if (authUser?.id) {
      await loadUserParallel(authUser.id);
    } else {
      setStep('confirm');
    }
  }

  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shiftInfo = todaySchedule ? getShiftLabel(todaySchedule.shift_type) : null;
  const shiftConfig = todaySchedule ? branchSettings?.shift_times?.[todaySchedule.shift_type] : null;

  let isCurrentTimeLate = false;
  if (clockType === 'clock_in' && todaySchedule && shiftConfig?.start) {
    const limitMin = branchSettings?.late_tolerance_minutes || 0;
    const [sH, sM] = shiftConfig.start.split(':').map(Number);
    const limitTime = new Date();
    limitTime.setHours(sH, sM + Number(limitMin), 0, 0);
    if (new Date() > limitTime) isCurrentTimeLate = true;
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Live Clock Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
        borderRadius: 20,
        padding: '28px 32px',
        marginBottom: 24,
        border: '1px solid rgba(139,92,246,0.3)',
        boxShadow: '0 8px 32px rgba(139,92,246,0.15)',
        textAlign: 'center',
      }}>
        <p style={{ color: 'rgba(196,181,253,0.8)', fontSize: 14, marginBottom: 4 }}>{dateStr}</p>
        <div style={{
          fontSize: 64,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-2px',
          lineHeight: 1,
          marginBottom: 8,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {timeStr}
        </div>
        <p style={{ color: 'rgba(196,181,253,0.6)', fontSize: 13 }}>เวลาปัจจุบัน — ลงเวลาทันทีที่มาถึง</p>
      </div>

      {/* STEP: Loading */}
      {step === 'loading' && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <span className="animate-pulse" style={{ color: 'var(--text-muted)', fontSize: 15 }}>⏳ กำลังโหลดข้อมูล…</span>
        </div>
      )}

      {/* STEP: Confirm clock type */}
      {step === 'confirm' && selectedUser && (
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <div className="card-title">สวัสดี, {selectedUser.full_name || selectedUser.name}! 👋</div>
            <button className="btn-icon" title="รีเฟรชข้อมูล" onClick={reset}><RefreshCw size={18} /></button>
          </div>
          <div style={{ padding: '24px 24px' }}>
            {/* Shift Info */}
            {shiftInfo ? (
              <div style={{
                background: `rgba(${shiftInfo.color === '#f59e0b' ? '245,158,11' : shiftInfo.color === '#f97316' ? '249,115,22' : shiftInfo.color === '#3b82f6' ? '59,130,246' : '107,114,128'},0.1)`,
                border: `1px solid ${shiftInfo.color}40`,
                borderRadius: 12,
                padding: '14px 18px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <span style={{ fontSize: 28 }}>{shiftInfo.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: shiftInfo.color, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {shiftInfo.label}
                    {shiftConfig?.start && shiftConfig?.end && (
                      <span style={{ fontSize: 12, fontWeight: 500, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                        {shiftConfig.start} - {shiftConfig.end} น.
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>กะของคุณวันนี้</div>
                </div>
                {isCurrentTimeLate && clockType === 'clock_in' && (
                  <div style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={14} /> สาย
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: 'rgba(107,114,128,0.1)',
                borderRadius: 12,
                padding: '12px 18px',
                marginBottom: 20,
                fontSize: 13,
                color: 'var(--text-muted)',
              }}>
                ⚠️ ยังไม่มีตารางกะสำหรับวันนี้
              </div>
            )}

            {/* Last record info */}
            {lastRecord && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                รายการล่าสุด: <strong style={{ color: 'var(--text-secondary)' }}>{lastRecord.type === 'clock_in' ? '🟢 เข้างาน' : '🟡 ออกงาน'}</strong> เมื่อ {getTimeStr(lastRecord.timestamp)} · {getDateStr(lastRecord.timestamp)}
              </div>
            )}

            {/* Clock Type Toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <button
                onClick={() => setClockType('clock_in')}
                style={{
                  padding: '18px',
                  borderRadius: 14,
                  border: `2px solid ${clockType === 'clock_in' ? '#22c55e' : 'var(--border)'}`,
                  background: clockType === 'clock_in' ? 'rgba(34,197,94,0.1)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center',
                }}
              >
                <LogIn size={28} style={{ color: '#22c55e', margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 16 }}>เข้างาน</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Clock In</div>
              </button>
              <button
                onClick={() => setClockType('clock_out')}
                style={{
                  padding: '18px',
                  borderRadius: 14,
                  border: `2px solid ${clockType === 'clock_out' ? '#f59e0b' : 'var(--border)'}`,
                  background: clockType === 'clock_out' ? 'rgba(245,158,11,0.1)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center',
                }}
              >
                <LogOut size={28} style={{ color: '#f59e0b', margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 16 }}>ออกงาน</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Clock Out</div>
              </button>
            </div>

            {/* Note field */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>หมายเหตุ (ไม่บังคับ)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น มาสาย เนื่องจากรถติด…"
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: 16, borderRadius: 12, gap: 8 }}
              onClick={() => setStep('camera')}
            >
              <Camera size={20} /> ถ่ายรูปยืนยัน
            </button>
          </div>
        </div>
      )}

      {/* STEP: Camera */}
      {step === 'camera' && selectedUser && (
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <div className="card-title" style={{ color: clockType === 'clock_in' ? '#22c55e' : '#f59e0b' }}>
              {clockType === 'clock_in' ? '🟢 ถ่ายรูปเข้างาน' : '🟡 ถ่ายรูปออกงาน'}
            </div>
            <button className="btn-icon" onClick={() => setStep('confirm')}><X size={18} /></button>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              {selectedUser.full_name || selectedUser.name} · {timeStr}
            </p>

            {/* Webcam / Captured preview */}
            <div style={{ borderRadius: 16, overflow: 'hidden', border: '2px solid var(--border)', marginBottom: 16, position: 'relative', background: '#000' }}>
              {capturedImage ? (
                <img src={capturedImage} alt="selfie preview" style={{ width: '100%', display: 'block' }} />
              ) : (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
                  style={{ width: '100%', display: 'block' }}
                  mirrored={true}
                />
              )}

              {/* Overlay: name + time watermark */}
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
                padding: '16px 14px 10px',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
              }}>
                {selectedUser.full_name || selectedUser.name} · {timeStr}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: capturedImage ? '1fr 1fr' : '1fr', gap: 12 }}>
              {capturedImage ? (
                <>
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', borderRadius: 10 }}
                    onClick={() => setCapturedImage(null)}
                  >
                    <RefreshCw size={16} /> ถ่ายใหม่
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', borderRadius: 10, background: clockType === 'clock_in' ? '#16a34a' : '#d97706', gap: 8 }}
                    onClick={submitAttendance}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <span className="animate-pulse">กำลังบันทึก…</span>
                    ) : (
                      <><CheckCircle size={16} /> ยืนยัน{clockType === 'clock_in' ? 'เข้างาน' : 'ออกงาน'}</>
                    )}
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', borderRadius: 10, padding: '14px', fontSize: 15, gap: 8 }}
                  onClick={capturePhoto}
                >
                  <Camera size={20} /> ถ่ายรูป
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP: Done */}
      {step === 'done' && result && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          {result.success ? (
            <CheckCircle size={64} style={{ color: '#22c55e', margin: '0 auto 16px' }} />
          ) : (
            <AlertCircle size={64} style={{ color: '#ef4444', margin: '0 auto 16px' }} />
          )}
          <div style={{ fontSize: 28, fontWeight: 800, color: result.success ? '#22c55e' : '#ef4444', marginBottom: 8 }}>
            {result.message}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {selectedUser?.full_name || selectedUser?.name} · {timeStr}
          </div>
          {result.success && capturedImage && (
            <img
              src={capturedImage}
              alt="confirmed selfie"
              style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: '50%', margin: '20px auto 0', border: '3px solid #22c55e' }}
            />
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 20 }}>หน้าจอจะกลับสู่หน้ายืนยันโดยอัตโนมัติ…</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 2: History
// ============================================================
function HistoryTab() {
  const { user } = useAuth();
  const isManager = ['owner', 'manager', 'store_manager'].includes(user?.role);
  const canDelete = ['owner', 'manager'].includes(user?.role);
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ user_id: '', type: 'clock_in', note: '' });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, recordId: null, reason: '' });
  const [previewImage, setPreviewImage] = useState(null);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['attendanceHistory', user?.branch_id, selectedMonth, isManager, user?.id],
    queryFn: async () => {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const localStart = new Date(Number(yearStr), Number(monthStr) - 1, 1, 0, 0, 0);
      const localEnd = new Date(Number(yearStr), Number(monthStr), 1, 0, 0, 0);

      let query = supabase.from('attendance')
          .select('*, users(name, full_name, employment_type, daily_rate)')
          .eq('branch_id', user?.branch_id)
          .gte('timestamp', localStart.toISOString())
          .lt('timestamp', localEnd.toISOString());

      if (!isManager) {
        query = query.eq('user_id', user?.id).eq('is_deleted', false);
      }

      query = query.order('timestamp', { ascending: false });

      const [attRes, userRes] = await Promise.all([
        query,
        isManager ? supabase.from('users').select('id, name, full_name').eq('is_active', true).eq('branch_id', user?.branch_id) : Promise.resolve({ data: [] })
      ]);
      return { records: attRes.data || [], users: userRes.data || [] };
    },
    enabled: !!user?.branch_id,
  });

  const records = data?.records || [];
  const users = data?.users || [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.user_id) return alert('กรุณาเลือกพนักงาน');
    const branch_id = user?.branch_id;
    if (!branch_id) return alert('ไม่พบสาขา กรุณาเข้าสู่ระบบใหม่');
    const { error } = await supabase.from('attendance').insert({
      user_id: form.user_id, branch_id, type: form.type, note: form.note || null,
      timestamp: new Date().toISOString(),
    });
    if (error) alert('เกิดข้อผิดพลาด: ' + error.message);
    else { 
      setShowModal(false); 
      setForm({ user_id: '', type: 'clock_in', note: '' }); 
      await queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] }); 
    }
  }

  function handleDeleteClick(id) {
    setDeleteModal({ isOpen: true, recordId: id, reason: '' });
  }

  async function confirmDelete(e) {
    e.preventDefault();
    if (!deleteModal.reason.trim()) return alert('กรุณาระบุเหตุผลในการลบ');
    try {
      const { error } = await supabase.from('attendance')
        .update({ is_deleted: true, delete_reason: deleteModal.reason, deleted_at: new Date().toISOString() })
        .eq('id', deleteModal.recordId);
      if (error) throw error;
      setDeleteModal({ isOpen: false, recordId: null, reason: '' });
      await queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  }

  async function handleRestoreClick(id) {
    if (!confirm('ยืนยันการกู้คืนประวัติการลงเวลานี้?')) return;
    try {
      const { error } = await supabase.from('attendance')
        .update({ is_deleted: false, delete_reason: null, deleted_at: null })
        .eq('id', id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>ประวัติการลงเวลา</h3>
          <p className="text-sm text-muted">M1: Time Attendance — บันทึกย้อนหลัง</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="month" 
            className="form-input bg-slate-800 border-slate-700 text-sm py-2 px-3 rounded-lg text-slate-200"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
          {isManager && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={18} /> ลงเวลาด้วยตนเอง
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green"><LogIn size={22} /></div>
          <div className="stat-info">
            <h3>{records.filter(r => r.type === 'clock_in' && !r.is_deleted).length}</h3>
            <p>เข้างาน (50 ล่าสุด)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><LogOut size={22} /></div>
          <div className="stat-info">
            <h3>{records.filter(r => r.type === 'clock_out' && !r.is_deleted).length}</h3>
            <p>ออกงาน (50 ล่าสุด)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Camera size={22} /></div>
          <div className="stat-info">
            <h3>{records.filter(r => r.selfie_url && !r.is_deleted).length}</h3>
            <p>มีรูปถ่าย</p>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="card-header"><div className="card-title">รายการทั้งหมด</div></div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>กะ</th>
                <th>ประเภท</th>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>รูปถ่าย</th>
                <th>หมายเหตุ</th>
                {canDelete && <th style={{ textAlign: 'right' }}>จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="7"><div className="empty-state"><Clock size={48} /><h3>ยังไม่มีข้อมูล</h3><p>เริ่มใช้แท็บ "ลงเวลา" เพื่อบันทึก</p></div></td></tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} style={{ opacity: rec.is_deleted ? 0.6 : 1, background: rec.is_deleted ? 'rgba(239,68,68,0.05)' : 'none' }}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {rec.users?.full_name || rec.users?.name || '—'}
                    </td>
                    <td>
                      {rec.shift_type ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: getShiftLabel(rec.shift_type).color + '20', color: getShiftLabel(rec.shift_type).color, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                          <span>{getShiftLabel(rec.shift_type).icon}</span>
                          {getShiftLabel(rec.shift_type).label}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${rec.type === 'clock_in' ? 'badge-success' : 'badge-warning'}`}>
                        {rec.type === 'clock_in' ? '🟢 เข้างาน' : '🟡 ออกงาน'}
                      </span>
                      {rec.type === 'clock_in' && rec.is_late && (
                        <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-500 border border-red-500/30">
                          สาย
                        </span>
                      )}
                    </td>
                    <td>{getDateStr(rec.timestamp)}</td>
                    <td style={{ fontWeight: 600 }}>{getTimeStr(rec.timestamp)}</td>
                    <td>
                      {rec.selfie_url ? (
                        <button 
                          onClick={() => setPreviewImage(rec.selfie_url)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          <img src={rec.selfie_url} alt="selfie" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>{rec.note || '—'}</td>
                    {canDelete && (
                      <td style={{ textAlign: 'right' }}>
                        {rec.is_deleted ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`เหตุผล: ${rec.delete_reason}`}>
                              ลบ: {rec.delete_reason}
                            </span>
                            <button
                              onClick={() => handleRestoreClick(rec.id)}
                              className="btn btn-ghost"
                              style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                              title="กู้คืนข้อมูล"
                            >
                              <RotateCcw size={14} style={{ marginRight: 4 }} /> กู้คืน
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDeleteClick(rec.id)}
                            className="btn btn-ghost"
                            style={{ padding: '6px', color: '#ef4444' }}
                            title="ลบข้อมูล"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    )}
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
              <h3>ลงเวลาด้วยตนเอง (Manual)</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">พนักงาน *</label>
                  <select className="form-select" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
                    <option value="">-- เลือกพนักงาน --</option>
                    {users.map((u) => (<option key={u.id} value={u.id}>{u.full_name || u.name}</option>))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ประเภท *</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="clock_in">🟢 เข้างาน (Clock In)</option>
                    <option value="clock_out">🟡 ออกงาน (Clock Out)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <textarea className="form-textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="เช่น ลืมลงเวลาของเมื่อวาน" />
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

      {deleteModal.isOpen && (
        <div className="modal-overlay" onClick={() => setDeleteModal({ isOpen: false, recordId: null, reason: '' })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottomColor: 'rgba(239,68,68,0.2)' }}>
              <h3 style={{ color: '#ef4444' }}>ลบประวัติการลงเวลา</h3>
              <button className="btn-icon" onClick={() => setDeleteModal({ isOpen: false, recordId: null, reason: '' })}>✕</button>
            </div>
            <form onSubmit={confirmDelete}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">เหตุผลการลบข้อมูล *</label>
                  <textarea
                    className="form-textarea"
                    value={deleteModal.reason}
                    onChange={(e) => setDeleteModal(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="ระบุเหตุผลในการลบ (เช่น ลงเวลาผิด, ลืมกดออกงาน...)"
                    required
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setDeleteModal({ isOpen: false, recordId: null, reason: '' })}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#ef4444' }}><Trash2 size={16} /> ยืนยันการลบ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)} style={{ zIndex: 9999 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(90vw, 500px)', background: 'transparent', boxShadow: 'none', border: 'none' }}>
            <div style={{ position: 'relative' }}>
              <button 
                className="btn-icon" 
                onClick={() => setPreviewImage(null)}
                style={{ position: 'absolute', top: -40, right: 0, background: 'rgba(255,255,255,0.1)', color: '#fff', padding: 8, borderRadius: '50%' }}
              >
                ✕
              </button>
              <img 
                src={previewImage} 
                alt="selfie full" 
                style={{ width: '100%', borderRadius: 16, border: '4px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 3: Employee Schedules — Weekly Calendar Grid
// ============================================================

// Helper: get Monday of the week for a given date
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

// Helper: format date to YYYY-MM-DD (Local Time)
function toDateStr(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SHIFT_CONFIG = {
  morning:   { label: 'เช้า',    icon: '🌅', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', color: '#f59e0b' },
  afternoon: { label: 'บ่าย',    icon: '☀️', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)', color: '#f97316' },
  evening:   { label: 'เย็น',    icon: '🌆', bg: 'rgba(236,72,153,0.15)', border: 'rgba(236,72,153,0.4)', color: '#ec4899' },
  night:     { label: 'ดึก',     icon: '🌙', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)', color: '#8b5cf6' },
  fullday:   { label: 'เต็มวัน', icon: '⏰', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)',  color: '#3b82f6' },
};

const DAY_NAMES_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function EmployeeSchedulesTab() {
  const { user } = useAuth();
  const isManager = ['owner', 'manager', 'store_manager'].includes(user?.role);
  const queryClient = useQueryClient();

  // View state
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [currentDate, setCurrentDate] = useState(() => getMonday(new Date()));
  
  // Branch Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ shift_times: {}, late_tolerance_minutes: 15 });
  const [savingSettings, setSavingSettings] = useState(false);

  // Modal state for shifts
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null); // null = add, obj = edit
  const [form, setForm] = useState({ user_id: '', schedule_date: '', shift_type: 'morning', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  // Compute days to show
  const gridDays = useMemo(() => {
    if (viewMode === 'week') {
      const mon = getMonday(currentDate);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(d.getDate() + i);
        return d;
      });
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const days = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
      }
      return days;
    }
  }, [viewMode, currentDate]);

  const startDate = gridDays[0];
  const endDate = gridDays[gridDays.length - 1];

  const { data, isLoading: loading } = useQuery({
    queryKey: ['employeeSchedules', user?.branch_id, toDateStr(startDate), toDateStr(endDate)],
    queryFn: async () => {
      const startStr = toDateStr(startDate);
      const endStr = toDateStr(endDate);
      const [schedRes, userRes, branchRes] = await Promise.all([
        supabase.from('employee_schedules')
          .select('*, users!user_id(name, full_name, employment_type)')
          .eq('branch_id', user?.branch_id)
          .gte('schedule_date', startStr)
          .lte('schedule_date', endStr)
          .order('schedule_date', { ascending: true }),
        supabase.from('users')
          .select('id, name, full_name')
          .eq('is_active', true)
          .eq('branch_id', user?.branch_id)
          .order('name', { ascending: true }),
        supabase.from('branches')
          .select('settings')
          .eq('id', user?.branch_id)
          .maybeSingle()
      ]);
      
      return {
        schedules: schedRes.data || [],
        users: userRes.data || [],
        branchSettings: branchRes.data?.settings || { shift_times: {}, late_tolerance_minutes: 15 }
      };
    },
    enabled: !!user?.branch_id,
  });

  const schedules = data?.schedules || [];
  const users = data?.users || [];
  const branchSettings = data?.branchSettings || { shift_times: {}, late_tolerance_minutes: 15 };

  // Sync loaded settings to form state when settings modal opens
  useEffect(() => {
    if (showSettingsModal) {
      setSettingsForm(branchSettings);
    }
  }, [showSettingsModal, branchSettings]);

  // Build schedule lookup: { `${user_id}_${date}`: [scheduleObj1, scheduleObj2] }
  const scheduleLookup = {};
  schedules.forEach(s => {
    const key = `${s.user_id}_${s.schedule_date}`;
    if (!scheduleLookup[key]) scheduleLookup[key] = [];
    scheduleLookup[key].push(s);
  });

  function navigateTime(dir) {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return viewMode === 'week' ? getMonday(d) : d;
    });
  }

  function goToToday() {
    setCurrentDate(viewMode === 'week' ? getMonday(new Date()) : new Date());
  }

  // Open modal for adding/editing
  function openAddModal(userId, dateStr) {
    if (!isManager) return;
    setEditingSchedule(null);
    setForm({ user_id: userId, schedule_date: dateStr, end_date: dateStr, shift_type: 'morning', notes: '' });
    setShowModal(true);
  }

  function openEditModal(schedule) {
    if (!isManager) return;
    setEditingSchedule(schedule);
    setForm({
      user_id: schedule.user_id,
      schedule_date: schedule.schedule_date,
      end_date: schedule.schedule_date,
      shift_type: schedule.shift_type,
      notes: schedule.notes || '',
    });
    setShowModal(true);
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const newSettings = {
        ...branchSettings,
        shift_times: settingsForm.shift_times || {},
        late_tolerance_minutes: Number(settingsForm.late_tolerance_minutes || 0)
      };
      
      const { error } = await supabase.from('branches')
        .update({ settings: newSettings })
        .eq('id', user?.branch_id);
        
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
      await queryClient.invalidateQueries({ queryKey: ['branchSettings'] });
      setShowSettingsModal(false);
      alert('บันทึกการตั้งค่ากะเรียบร้อยแล้ว');
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.user_id || !form.schedule_date || !form.shift_type) return;
    const branch_id = user?.branch_id;
    if (!branch_id) return alert('ไม่พบสาขา');
    setSubmitting(true);
    try {
      if (editingSchedule) {
        // Update existing
        const { error } = await supabase.from('employee_schedules')
          .update({ shift_type: form.shift_type, notes: form.notes || null })
          .eq('id', editingSchedule.id);
        if (error) {
            if (error.code === '23505') { alert('พนักงานคนนี้มีกะนี้แล้ว'); return; }
            throw error;
        }
      } else {
        const startDate = new Date(form.schedule_date + 'T00:00:00');
        const endDate = new Date((form.end_date || form.schedule_date) + 'T00:00:00');
        if (endDate < startDate) return alert('วันที่สิ้นสุดต้องมากกว่าหรือเท่ากับวันที่เริ่มต้น');

        const inserts = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          inserts.push({
            user_id: form.user_id, branch_id,
            schedule_date: toDateStr(d),
            shift_type: form.shift_type,
            notes: form.notes || null
          });
        }

        const { error } = await supabase.from('employee_schedules').insert(inserts);
        if (error) {
          if (error.code === '23505') { alert('มีกะที่ซ้ำซ้อนกันในบางวัน ตรวจสอบให้แน่ใจว่าไม่มีกะประเภทเดียวกันอยู่ในวันที่เลือกแล้ว'); return; }
          throw error;
        }
      }
      setShowModal(false);
      await queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editingSchedule) return;
    if (!confirm('ยืนยันลบกะนี้?')) return;
    setSubmitting(true);
    try {
      await supabase.from('employee_schedules').delete().eq('id', editingSchedule.id);
      setShowModal(false);
      await queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const todayStr = toDateStr(new Date());
  
  // Custom label
  let dateLabel = '';
  if (viewMode === 'week') {
    dateLabel = `${gridDays[0].toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} — ${gridDays[6].toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`;
  } else {
    dateLabel = currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📅 ตารางกะพนักงาน</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>วางแผนกะพนักงาน ({viewMode === 'week' ? 'รายสัปดาห์' : 'รายเดือน'})</p>
        </div>
        
        {isManager && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              className="btn btn-ghost border border-slate-700 hover:bg-slate-800"
              onClick={() => setShowSettingsModal(true)}
            >
              ⚙️ ตั้งค่ากะและเวลาสาย
            </button>
            <div className="bg-slate-800/50 p-1 rounded-lg border border-slate-700 flex">
              <button 
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === 'week' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setViewMode('week')}
              >
                สัปดาห์
              </button>
              <button 
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === 'month' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setViewMode('month')}
              >
                เดือน
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        marginBottom: 16, padding: '12px 16px',
        background: 'rgba(139,92,246,0.06)',
        borderRadius: 14,
        border: '1px solid rgba(139,92,246,0.15)',
      }}>
        <button
          onClick={() => navigateTime(-1)}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', transition: 'all 0.15s',
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ textAlign: 'center', minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            {dateLabel}
          </div>
        </div>

        <button
          onClick={() => navigateTime(1)}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', transition: 'all 0.15s',
          }}
        >
          <ChevronRight size={20} />
        </button>
        
        <button
          onClick={goToToday}
          style={{
            background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: '#a78bfa',
            fontSize: 13, fontWeight: 600, transition: 'all 0.15s', marginLeft: 8
          }}
        >
          วันนี้
        </button>
      </div>

      {/* Weekly/Monthly Grid */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <span className="animate-pulse" style={{ color: 'var(--text-muted)', fontSize: 14 }}>⏳ กำลังโหลดตาราง...</span>
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <Calendar size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--text-primary)', fontSize: 16, marginBottom: 4 }}>ไม่มีพนักงาน</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>เพิ่มพนักงานในระบบก่อนจัดกะ</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: viewMode === 'week' ? 700 : 1500 }}>
              <thead>
                <tr>
                  <th style={{
                    position: 'sticky', left: 0, zIndex: 10,
                    background: 'var(--bg-card)', padding: '12px 16px',
                    textAlign: 'left', fontSize: 13, fontWeight: 700,
                    color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                    minWidth: 120, outline: '1px solid var(--border)'
                  }}>
                    พนักงาน
                  </th>
                  {gridDays.map((day, i) => {
                    const dateStr = toDateStr(day);
                    const isToday = dateStr === todayStr;
                    const isSun = day.getDay() === 0;
                    const isSat = day.getDay() === 6;
                    return (
                      <th key={i} style={{
                        padding: '10px 6px',
                        textAlign: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        borderBottom: '1px solid var(--border)',
                        background: isToday ? 'rgba(139,92,246,0.1)' : 'transparent',
                        color: isToday ? '#a78bfa' : (isSun || isSat) ? '#ef4444' : 'var(--text-muted)',
                        minWidth: viewMode === 'week' ? 80 : 70, borderRight: '1px solid var(--border)'
                      }}>
                        <div>{DAY_NAMES_SHORT[day.getDay()]}</div>
                        <div style={{
                          fontSize: 16, fontWeight: 800, marginTop: 2,
                          color: isToday ? '#8b5cf6' : 'var(--text-primary)',
                        }}>
                          {day.getDate()}
                        </div>
                        {isToday && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#8b5cf6', margin: '4px auto 0',
                          }} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {users.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {/* Employee name (sticky left) */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 9,
                      background: 'var(--bg-card)',
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--border)',
                      fontWeight: 600, fontSize: 13,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      outline: '1px solid var(--border)'
                    }}>
                      {emp.full_name || emp.name}
                    </td>

                    {/* Day cells */}
                    {gridDays.map((day, i) => {
                      const dateStr = toDateStr(day);
                      const key = `${emp.id}_${dateStr}`;
                      const daySchedules = scheduleLookup[key] || [];
                      const isToday = dateStr === todayStr;

                      return (
                        <td
                          key={i}
                          style={{
                            padding: '6px 4px',
                            borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                            textAlign: 'center', verticalAlign: 'top',
                            background: isToday ? 'rgba(139,92,246,0.04)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { if (isManager) e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isToday ? 'rgba(139,92,246,0.04)' : 'transparent'; }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>
                            {daySchedules.map(schedule => {
                              const shift = SHIFT_CONFIG[schedule.shift_type];
                              return (
                                <div
                                  key={schedule.id}
                                  onClick={(e) => { e.stopPropagation(); if (isManager) openEditModal(schedule); }}
                                  style={{
                                    background: shift?.bg, border: `1px solid ${shift?.border}`, borderRadius: 6,
                                    padding: '4px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', cursor: isManager ? 'pointer' : 'default', transition: 'transform 0.1s'
                                  }}
                                  title={`${shift?.label} — กดเพื่อแก้ไข`}
                                >
                                  <span style={{ fontSize: viewMode==='week' ? 16 : 14, lineHeight: 1 }}>{shift?.icon}</span>
                                  {viewMode === 'week' && (
                                    <>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: shift?.color, lineHeight: 1.2, marginTop: 2 }}>
                                        {shift?.label}
                                      </span>
                                      {schedule.notes && (
                                        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.1, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {schedule.notes}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })}

                            {/* Add button: always visible for managers */}
                            {isManager && (
                                <div 
                                  onClick={(e) => { e.stopPropagation(); openAddModal(emp.id, dateStr); }}
                                  style={{
                                    borderRadius: 6, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `1px dashed ${daySchedules.length > 0 ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
                                    cursor: 'pointer', marginTop: 4,
                                    background: daySchedules.length > 0 ? 'rgba(139,92,246,0.06)' : 'transparent',
                                  }}
                                  title="+ เพิ่มกะในวันนี้"
                                >
                                  <Plus size={12} style={{ color: daySchedules.length > 0 ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.15)' }} />
                                </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {!loading && schedules.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 16 }}>
          {Object.entries(SHIFT_CONFIG).map(([key, cfg]) => {
            const count = schedules.filter(s => s.shift_type === key).length;
            return (
              <div key={key} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20 }}>{cfg.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{count}</div>
                <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>⚙️ ตั้งค่ากะและเวลาสาย</h3>
              <button className="btn-icon" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveSettings}>
              <div className="modal-body space-y-4 text-sm">
                
                <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700">
                  <h4 className="font-semibold text-slate-200 mb-2">กำหนดเวลาเข้า/ออกกะ</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-slate-400 font-medium">ประเภทกะ</div>
                    <div className="text-slate-400 font-medium">เวลาเริ่ม (Start)</div>
                    <div className="text-slate-400 font-medium">เวลาเลิก (End)</div>
                  </div>
                  <div className="space-y-2 mt-2">
                    {Object.entries(SHIFT_CONFIG).map(([key, cfg]) => (
                      <div key={key} className="grid grid-cols-3 gap-3 items-center">
                        <div className="flex items-center gap-2">
                          <span>{cfg.icon}</span> <span style={{color: cfg.color}}>{cfg.label}</span>
                        </div>
                        <div>
                          <input type="text" className="form-input py-1 px-2 text-sm"
                            placeholder="เช่น 09:00"
                            value={settingsForm.shift_times?.[key]?.start || ''} 
                            onChange={e => setSettingsForm({
                              ...settingsForm, shift_times: { ...settingsForm.shift_times, [key]: { ...settingsForm.shift_times?.[key], start: e.target.value } }
                            })} 
                          />
                        </div>
                        <div>
                          <input type="text" className="form-input py-1 px-2 text-sm"
                            placeholder="เช่น 17:00"
                            value={settingsForm.shift_times?.[key]?.end || ''} 
                            onChange={e => setSettingsForm({
                              ...settingsForm, shift_times: { ...settingsForm.shift_times, [key]: { ...settingsForm.shift_times?.[key], end: e.target.value } }
                            })} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/30">
                  <h4 className="font-semibold text-orange-400 mb-2 flex items-center gap-2"><Clock size={16} /> โควต้าสาย (Late Tolerance)</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-300">อนุญาตให้ลงเวลาช้ากว่ากะได้</span>
                    <input 
                      type="number" min="0" max="180" 
                      className="form-input w-20 py-1 text-center" 
                      value={settingsForm.late_tolerance_minutes || 0}
                      onChange={e => setSettingsForm({...settingsForm, late_tolerance_minutes: e.target.value})}
                    />
                    <span className="text-slate-300">นาที</span>
                  </div>
                  <p className="text-xs text-orange-400/80 mt-2">หากลงเวลาเข้างานช้ากว่าเวลาที่กำหนด จะถูกตีเครื่องหมาย "สาย" อัตโนมัติ (เช่น เริ่มกะ 09:00 อนุโลม 15 นาที = เข้าหลัง 09:15 น. คือสาย)</p>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowSettingsModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" disabled={savingSettings}>{savingSettings ? 'กำลังบันทึก...' : '💾 บันทึกตั้งค่า'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{editingSchedule ? '✏️ แก้ไขกะ' : '➕ เพิ่มกะทำงาน'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Show selected employee + date */}
                <div style={{
                  background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {users.find(u => u.id === form.user_id)?.full_name || users.find(u => u.id === form.user_id)?.name || '—'}
                    </div>
                    {!editingSchedule ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <input type="date" className="form-input py-1 px-2 text-xs bg-transparent border-slate-600 rounded"
                          value={form.schedule_date} onChange={e => setForm({...form, schedule_date: e.target.value})}
                          style={{ minWidth: 100 }}
                        />
                        <span className="text-slate-400 text-xs text-nowrap">ถึง</span>
                        <input type="date" className="form-input py-1 px-2 text-xs bg-transparent border-slate-600 rounded"
                          value={form.end_date || form.schedule_date} min={form.schedule_date} 
                          onChange={e => setForm({...form, end_date: e.target.value})}
                          style={{ minWidth: 100 }}
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(form.schedule_date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                  <Calendar size={20} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                </div>

                {/* Shift Type Selection */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>เลือกกะ</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {Object.entries(SHIFT_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key} type="button" onClick={() => setForm({ ...form, shift_type: key })}
                        style={{
                          padding: '14px 12px', borderRadius: 12, border: `2px solid ${form.shift_type === key ? cfg.color : 'var(--border)'}`,
                          background: form.shift_type === key ? cfg.bg : 'transparent', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ fontSize: 24 }}>{cfg.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: form.shift_type === key ? cfg.color : 'var(--text-muted)', marginTop: 4 }}>
                          {cfg.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">หมายเหตุ</label>
                  <textarea
                    className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="เช่น ทำแทน หรือระบุสาขา" rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: editingSchedule ? 'space-between' : 'flex-end', gap: 8 }}>
                {editingSchedule && (
                  <button type="button" onClick={handleDelete} disabled={submitting} className="btn-ghost" style={{color: '#ef4444'}}>
                    🗑 ลบกะนี้
                  </button>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : editingSchedule ? '💾 บันทึก' : '➕ เพิ่มกะ'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

