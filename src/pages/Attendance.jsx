import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Webcam from 'react-webcam';
import { Clock, LogIn, LogOut, Camera, UserCheck, Plus, Calendar, X, RefreshCw, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Trash2, RotateCcw, Upload, Edit, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import Papa from 'papaparse';

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

// Haversine formula: returns distance in meters between two lat/lng points
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const queryClient = useQueryClient();
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
  const [location, setLocation] = useState(null); // { lat, lng }
  const [locStatus, setLocStatus] = useState('idle'); // idle | fetching | ok | denied
  const [distanceM, setDistanceM] = useState(null);
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

    try {
      // Fetch user profile, today schedule, and last attendance record IN PARALLEL
      const [userRes, schedRes, lastRes] = await Promise.all([
        supabase.from('users').select('id, name, full_name, employment_type, daily_rate').eq('id', userId).maybeSingle(),
        supabase.from('employee_schedules').select('*').eq('user_id', userId).eq('schedule_date', today),
        supabase.from('attendance').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const userData = userRes.data;
      if (!userData) {
        // User not found in DB — use auth context data as fallback
        setSelectedUser({ id: userId, name: authUser?.name || 'ไม่ทราบชื่อ', full_name: authUser?.name });
        setStep('confirm');
        return;
      }

      setSelectedUser(userData);
      const sched = schedRes.data && schedRes.data.length > 0 ? schedRes.data[0] : null;
      setTodaySchedule(sched);
      setLastRecord(lastRes.data);
      setClockType(lastRes.data?.type === 'clock_in' ? 'clock_out' : 'clock_in');
      setStep('confirm');

    // Fetch GPS location immediately
    setLocStatus('fetching');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(coords);
          setLocStatus('ok');
        },
        () => {
          setLocStatus('denied');
          setLocation(null);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocStatus('denied');
    }
    } catch (err) {
      console.error('loadUserParallel error:', err);
      // Fallback so the UI doesn't stay stuck on loading
      setSelectedUser({ id: userId, name: authUser?.name || 'ไม่ทราบชื่อ', full_name: authUser?.name });
      setStep('confirm');
    }
  }

  const capturePhoto = useCallback(() => {
    const img = webcamRef.current?.getScreenshot();
    if (img) setCapturedImage(img);
  }, [webcamRef]);

  // Compute geofence distance whenever location or branchSettings changes
  useEffect(() => {
    const gf = branchSettings?.geofence;
    if (gf?.enabled && gf.lat && gf.lng && location) {
      const d = haversineMeters(location.lat, location.lng, gf.lat, gf.lng);
      setDistanceM(Math.round(d));
    } else {
      setDistanceM(null);
    }
  }, [location, branchSettings]);

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
      if (!selfie_url) selfie_url = capturedImage;

      // Geofence check
      const gf = branchSettings?.geofence;
      let finalNote = note.trim();
      if (gf?.enabled && gf.lat && gf.lng) {
        if (!location) {
          // location unavailable — allow but will mark as no-location
        } else {
          const dist = haversineMeters(location.lat, location.lng, gf.lat, gf.lng);
          if (dist > (gf.radius_m || 50)) {
            const outOfBoundMsg = `[อยู่นอกพื้นที่ร้าน ห่าง ${Math.round(dist)} เมตร]`;
            finalNote = finalNote ? `${finalNote} ${outOfBoundMsg}` : outOfBoundMsg;
          }
        }
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
        note: finalNote || null,
        timestamp: new Date().toISOString(),
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });

      setResult({ success: true, message: clockType === 'clock_in' ? '✅ เข้างานสำเร็จ!' : '✅ ออกงานสำเร็จ!' });
      setStep('done');

      // Auto-reset after 4 seconds
      setTimeout(() => {
        reset();
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
    setLocation(null);
    setLocStatus('idle');
    setDistanceM(null);
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

            {/* Geofence / Location Status Badge */}
            {(() => {
              const gf = branchSettings?.geofence;
              const gfActive = gf?.enabled && gf?.lat && gf?.lng;
              if (!gfActive && locStatus === 'idle') return null;
              if (locStatus === 'fetching') return (
                <div style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', fontSize: 13, color: '#a5b4fc' }}>
                  ⏳ กำลังดึงพิกัดที่ตั้งของคุณ...
                </div>
              );
              if (locStatus === 'denied') return (
                <div style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 10, background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)', fontSize: 13, color: '#9ca3af' }}>
                  📵 ไม่ทราบพิกัด (Location ถูกปฐิเสธหรือไม่รองรับ)
                </div>
              );
              if (locStatus === 'ok' && gfActive && distanceM !== null) {
                const radius = gf.radius_m || 50;
                const inZone = distanceM <= radius;
                return (
                  <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: inZone ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${inZone ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 13, color: inZone ? '#86efac' : '#fca5a5' }}>
                    {inZone ? `✅ อยู่ในพื้นที่ร้าน (ห่าง ${distanceM} เมตร)` : `⚠️ อยู่นอกพื้นที่ร้าน — ห่าง ${distanceM} เมตร (max ${radius}ม.)`}
                  </div>
                );
              }
              if (locStatus === 'ok') return (
                <div style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', fontSize: 13, color: '#86efac' }}>
                  📍 ดึงพิกัดสำเร็จ ({location?.lat?.toFixed(4)}, {location?.lng?.toFixed(4)})
                </div>
              );
              return null;
            })()}

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
  const canManageData = ['owner', 'area_manager', 'admin'].includes(user?.role);
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ user_id: '', type: 'clock_in', note: '' });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, recordId: null, reason: '' });
  const [editModal, setEditModal] = useState({ isOpen: false, record: null });
  const [viewModal, setViewModal] = useState({ isOpen: false, record: null });
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);

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

      let userQuery = supabase.from('users').select('id, name, full_name').eq('is_active', true);
      if (user?.branch_id) userQuery = userQuery.eq('branch_id', user.branch_id);

      const [attRes, userRes] = await Promise.all([
        query,
        isManager ? userQuery : Promise.resolve({ data: [] })
      ]);
      return { records: attRes.data || [], users: userRes.data || [] };
    },
    enabled: !!user?.branch_id,
  });

  const records = data?.records || [];
  const users = data?.users || [];

  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

  const { incompleteGroupKeys, incompleteCount } = useMemo(() => {
    const groups = {};
    records.filter(r => !r.is_deleted).forEach(r => {
      const dateKey = getDateStr(r.timestamp);
      // Group by user, date, and shift
      const key = `${r.user_id}_${dateKey}_${r.shift_type || 'none'}`;
      if (!groups[key]) groups[key] = { in: 0, out: 0 };
      if (r.type === 'clock_in') groups[key].in++;
      else groups[key].out++;
    });
    
    const incompleteKeys = new Set();
    let count = 0;
    Object.keys(groups).forEach(key => {
      // If someone has clock_in but no clock_out, or vice versa
      if ((groups[key].in > 0 && groups[key].out === 0) || (groups[key].out > 0 && groups[key].in === 0)) {
        incompleteKeys.add(key);
        count++;
      }
    });
    return { incompleteGroupKeys: incompleteKeys, incompleteCount: count };
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (!showIncompleteOnly) return records;
    return records.filter(r => {
      if (r.is_deleted) return false;
      const dateKey = getDateStr(r.timestamp);
      const key = `${r.user_id}_${dateKey}_${r.shift_type || 'none'}`;
      return incompleteGroupKeys.has(key);
    });
  }, [records, showIncompleteOnly, incompleteGroupKeys]);

  function getFakeTime(type, shift) {
      if (shift === 'ช่วงเช้า') return type === 'clock_in' ? '06:00:00' : '12:00:00';
      if (shift === 'ช่วงบ่าย') return type === 'clock_in' ? '12:00:00' : '18:00:00';
      if (shift === 'ช่วงเย็น') return type === 'clock_in' ? '18:00:00' : '23:59:00';
      if (shift === 'ช่วงดึก' || shift === 'กะดึก') return type === 'clock_in' ? '00:00:00' : '06:00:00';
      return type === 'clock_in' ? '08:00:00' : '17:00:00';
  }

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user?.branch_id) {
      alert("ไม่พบรหัสสาขา กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    setIsImporting(true);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { data: dbUsers, error: uErr } = await supabase.from('users').select('id, name, full_name, employee_id');
          if (uErr) throw uErr;
          const { data: dbBranches, error: bErr } = await supabase.from('branches').select('id, name, code');
          if (bErr) throw bErr;

          let successCount = 0;
          let errors = [];
          const allRows = results.data;
          
          let headerIdx = -1;
          for (let i = 0; i < allRows.length; i++) {
            if (allRows[i].some(col => col && (col.includes('Timestamp') || col.includes('รหัสพนักงาน')))) {
                headerIdx = i;
                break;
            }
          }

          if (headerIdx === -1) {
              alert('ไม่พบหัวตาราง (Timestamp / รหัสพนักงาน) ในไฟล์ CSV กรุณาตรวจสอบไฟล์');
              setIsImporting(false);
              if (e.target) e.target.value = null;
              return;
          }

          const headers = allRows[headerIdx];
          const dataRows = allRows.slice(headerIdx + 1);
          const payloads = [];

          for (let i = 0; i < dataRows.length; i++) {
            const rowArray = dataRows[i];
            const getKey = (keyName) => {
              const colIdx = headers.findIndex(h => typeof h === 'string' && h.trim() === keyName);
              return colIdx !== -1 ? rowArray[colIdx] : null;
            };

            const timestampRaw = getKey('Timestamp') || '';
            const empRaw = getKey('รหัสพนักงาน') || '';
            const branchRaw = getKey('สาขา') || '';
            const clockRaw = getKey('ประเภทการลงเวลา') || '';
            const shiftRaw = getKey('รอบเวลาทำงาน') || '';
            const noteRaw = getKey('หมายเหตุ') || '';
            const ownerRemark = getKey('Remark by Owner') || '';

            if (!empRaw && !timestampRaw) continue;

            let userId = null;
            const foundUser = dbUsers.find((u) => {
              if (u.employee_id && empRaw.includes(u.employee_id)) return true;
              if (u.name && empRaw.includes(u.name)) return true;
              return false;
            });
            if (foundUser) userId = foundUser.id;

            let branchId = dbBranches[0]?.id || user.branch_id;
            const foundBranch = dbBranches.find((b) => branchRaw.includes(b.code) || branchRaw.includes(b.name));
            if (foundBranch) branchId = foundBranch.id;

            const clockType = clockRaw.includes('ออกงาน') ? 'clock_out' : 'clock_in';

            let shiftType = 'morning';
            if (shiftRaw === 'ช่วงบ่าย') shiftType = 'afternoon';
            else if (shiftRaw === 'ช่วงเย็น') shiftType = 'evening';
            else if (shiftRaw.includes('ดึก')) shiftType = 'night';

            const finalNote = [noteRaw, ownerRemark].filter(Boolean).join(' | ');

            let finalTimestampIso = new Date().toISOString();
            if (timestampRaw) {
              const datePart = timestampRaw.split(' ')[0];
              const parts = datePart.split('/');
              if (parts.length >= 3) {
                const [d, m, y] = parts;
                let timePart = timestampRaw.split(' ')[1];
                if (!timePart) timePart = getFakeTime(clockType, shiftRaw);
                const isoStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timePart}+07:00`;
                try {
                  const parsedDate = new Date(isoStr);
                  if (!isNaN(parsedDate.getTime())) finalTimestampIso = parsedDate.toISOString();
                } catch (err) {}
              }
            }

            if (!userId) {
              errors.push(`แถวที่ ${i + 2}: ไม่พบพนักงาน '${empRaw}'`);
              continue;
            }

            payloads.push({
              user_id: userId,
              branch_id: branchId,
              type: clockType,
              shift_type: shiftType,
              note: finalNote || null,
              timestamp: finalTimestampIso,
              selfie_url: null,
              is_late: false,
              lat: null,
              lng: null,
            });
          }

          if (payloads.length > 0) {
            for (let i = 0; i < payloads.length; i += 100) {
                const chunk = payloads.slice(i, i + 100);
                const { error: insertError } = await supabase.from('attendance').insert(chunk);
                if (insertError) throw insertError;
                successCount += chunk.length;
            }
          }

          alert(`✅ นำเข้าข้อมูลสำเร็จ: ${successCount} รายการ\n${errors.length > 0 ? `⚠️ พบข้อผิดพลาด ${errors.length} รายการ (พนักงานที่ไม่มีในระบบ):\n${errors.slice(0, 5).join('\\n')}` : ''}`);
          await queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
        } catch (err) {
          alert('❌ เกิดข้อผิดพลาดในการประมวลผล: ' + err.message);
        } finally {
          setIsImporting(false);
          if (e.target) e.target.value = null;
        }
      },
    });
  };

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

  function handleEditClick(rec) {
    const d = new Date(rec.timestamp);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setEditModal({ 
      isOpen: true, 
      record: { ...rec, dateStr, timeStr }
    });
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    try {
      const rec = editModal.record;
      const ts = new Date(`${rec.dateStr}T${rec.timeStr}:00`).toISOString();

      const { error } = await supabase.from('attendance')
        .update({ 
          shift_type: rec.shift_type, 
          type: rec.type, 
          timestamp: ts, 
          note: rec.note || null 
        })
        .eq('id', rec.id);
        
      if (error) throw error;
      setEditModal({ isOpen: false, record: null });
      await queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการแก้ไข: ' + err.message);
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
            <div className="flex items-center gap-2 desktop-only">
              <input 
                type="file" 
                accept=".csv" 
                ref={fileInputRef} 
                onChange={handleImportCSV} 
                style={{ display: 'none' }} 
              />
              <button 
                className="btn" 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />} 
                {isImporting ? 'กำลังนำเข้า...' : 'นำเข้า CSV'}
              </button>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                <Plus size={18} /> ลงเวลาด้วยตนเอง
              </button>
            </div>
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
        <div className="card-header flex justify-between items-center flex-wrap gap-4">
          <div className="card-title">
            {showIncompleteOnly ? '⚠️ รายการลงเวลาไม่ครบ (กะที่ลืมสแกนเข้า/ออก)' : 'รายการทั้งหมด'}
          </div>
          {incompleteCount > 0 && (
            <button 
               className={`btn ${showIncompleteOnly ? 'btn-primary' : ''}`}
               style={{ 
                 background: showIncompleteOnly ? 'var(--primary)' : 'rgba(239, 68, 68, 0.1)', 
                 color: showIncompleteOnly ? '#fff' : '#ef4444', 
                 border: `1px solid ${showIncompleteOnly ? 'var(--primary)' : 'rgba(239, 68, 68, 0.3)'}`,
                 padding: '4px 12px',
                 fontSize: '13px'
               }}
               onClick={() => setShowIncompleteOnly(!showIncompleteOnly)}
            >
              <AlertCircle size={16} />
              {showIncompleteOnly ? 'แสดงรายการทั้งหมด' : `พบรายการไม่สมบูรณ์ ${incompleteCount} กะ (คลิกเพื่อดู)`}
            </button>
          )}
        </div>
        <div className="table-container desktop-only">
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
                <th>พิกัด</th>
                {canManageData && <th style={{ textAlign: 'right' }}>จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังโหลด...</span></td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan="9"><div className="empty-state"><Clock size={48} /><h3>ยังไม่มีข้อมูล</h3><p>{showIncompleteOnly ? 'ไม่พบรายการที่ไม่สมบูรณ์ในเดือนนี้ 🎉' : 'เริ่มใช้แท็บ "ลงเวลา" เพื่อบันทึก'}</p></div></td></tr>
              ) : (
                filteredRecords.map((rec) => (
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
                    <td>
                       {rec.lat && rec.lng ? (
                         <a
                           href={`https://www.google.com/maps/search/?api=1&query=${rec.lat},${rec.lng}`}
                           target="_blank"
                           rel="noreferrer"
                           style={{ color: '#60a5fa', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
                           title={`${Number(rec.lat).toFixed(5)}, ${Number(rec.lng).toFixed(5)}`}
                         >
                           📍 แผนที่
                         </a>
                       ) : (
                         <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>ไม่ทราบพิกัด</span>
                       )}
                     </td>
                    {canManageData && (
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
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                            <button
                              onClick={() => handleEditClick(rec)}
                              className="btn btn-ghost"
                              style={{ padding: '6px', color: '#60a5fa' }}
                              title="แก้ไขข้อมูล"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(rec.id)}
                              className="btn btn-ghost"
                              style={{ padding: '6px', color: '#ef4444' }}
                              title="ลบข้อมูล"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="mobile-only mt-4 flex flex-col gap-3">
          {loading ? (
            <div className="text-center py-8"><span className="animate-pulse text-slate-400">กำลังโหลด...</span></div>
          ) : filteredRecords.length === 0 ? (
            <div className="empty-state">
              <Clock size={48} />
              <h3>ยังไม่มีข้อมูล</h3>
              <p>{showIncompleteOnly ? 'ไม่พบรายการที่ไม่สมบูรณ์ในเดือนนี้ 🎉' : 'เริ่มใช้แท็บ "ลงเวลา" เพื่อบันทึก'}</p>
            </div>
          ) : (
            filteredRecords.map((rec) => (
              <div 
                key={rec.id} 
                className="bg-[#1e2330] rounded-2xl p-4 border border-slate-700/50 relative shadow-sm"
                style={{ opacity: rec.is_deleted ? 0.6 : 1, cursor: 'pointer' }}
                onClick={() => setViewModal({ isOpen: true, record: rec })}
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                    <Calendar size={16} className="text-purple-400" /> {getDateStr(rec.timestamp)}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#2a2520] border border-[#3b2a1a]" style={{
                    background: rec.type === 'clock_in' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(249, 115, 22, 0.1)',
                    color: rec.type === 'clock_in' ? '#4ade80' : '#fb923c',
                    borderColor: rec.type === 'clock_in' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(249, 115, 22, 0.2)'
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                    {rec.type === 'clock_in' ? 'เข้างาน' : 'ออกงาน'}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 rounded-full bg-slate-800 flex-shrink-0 flex items-center justify-center border border-slate-700">
                    {rec.selfie_url ? (
                      <img 
                        src={rec.selfie_url} 
                        alt="selfie" 
                        className="w-full h-full object-cover rounded-full" 
                        onClick={(e) => { e.stopPropagation(); setPreviewImage(rec.selfie_url); }} 
                      />
                    ) : (
                      <UserCheck size={24} className="text-slate-500" />
                    )}
                    {rec.selfie_url && (
                      <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full p-1 border-2 border-[#1e2330]">
                         <Camera size={10} />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-bold text-white text-[15px] mb-1">
                      {rec.users?.full_name || rec.users?.name || '—'}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm mb-0.5" style={{ color: '#94a3b8' }}>
                      <Clock size={14} className="text-purple-400" /> {getTimeStr(rec.timestamp)}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm" style={{ color: '#94a3b8' }}>
                      <MapPin size={14} className="text-red-400" /> 
                      {rec.lat && rec.lng ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${rec.lat},${rec.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          แผนที่ ({Number(rec.lat).toFixed(4)}, {Number(rec.lng).toFixed(4)})
                        </a>
                      ) : 'ไม่ทราบพิกัด'}
                    </div>
                  </div>
                  
                  <div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-400 shrink-0">
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>
            ))
          )}
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

      {editModal.isOpen && (
        <div className="modal-overlay" onClick={() => setEditModal({ isOpen: false, record: null })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ แก้ไขประวัติการลงเวลา</h3>
              <button className="btn-icon" onClick={() => setEditModal({ isOpen: false, record: null })}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: 8, marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 14 }}>พนักงาน: <strong>{editModal.record.users?.full_name || editModal.record.users?.name}</strong></p>
                </div>

                <div className="form-group grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">วันที่ *</label>
                    <input type="date" className="form-input" 
                      value={editModal.record.dateStr} 
                      onChange={(e) => setEditModal({ ...editModal, record: { ...editModal.record, dateStr: e.target.value } })} required />
                  </div>
                  <div>
                    <label className="form-label">เวลา *</label>
                    <input type="time" className="form-input" 
                      value={editModal.record.timeStr} 
                      onChange={(e) => setEditModal({ ...editModal, record: { ...editModal.record, timeStr: e.target.value } })} required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">ประเภทกะ *</label>
                  <select className="form-select" value={editModal.record.shift_type || 'morning'} 
                    onChange={(e) => setEditModal({ ...editModal, record: { ...editModal.record, shift_type: e.target.value } })}>
                    <option value="morning">🌅 กะเช้า</option>
                    <option value="afternoon">☀️ กะบ่าย</option>
                    <option value="evening">🌇 กะเย็น</option>
                    <option value="night">🌙 กะดึก</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">ประเภทลงเวลา *</label>
                  <select className="form-select" value={editModal.record.type} 
                    onChange={(e) => setEditModal({ ...editModal, record: { ...editModal.record, type: e.target.value } })}>
                    <option value="clock_in">🟢 เข้างาน (Clock In)</option>
                    <option value="clock_out">🟡 ออกงาน (Clock Out)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">หมายเหตุ (อัปเดต)</label>
                  <textarea className="form-textarea" value={editModal.record.note || ''} 
                    onChange={(e) => setEditModal({ ...editModal, record: { ...editModal.record, note: e.target.value } })} placeholder="เช่น แก้ไขกะผิด..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditModal({ isOpen: false, record: null })}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary"><Edit size={16} /> บันทึกการแก้ไข</button>
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

      {/* Detail View Modal */}
      {viewModal.isOpen && viewModal.record && (
        <div className="modal-overlay" onClick={() => setViewModal({ isOpen: false, record: null })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>รายละเอียดการลงเวลา</h3>
              <button className="btn-icon" onClick={() => setViewModal({ isOpen: false, record: null })}>✕</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="flex items-center gap-4 border-b border-slate-700/50 pb-4">
                 <div className="relative w-16 h-16 rounded-full bg-slate-800 flex-shrink-0 flex items-center justify-center border-2 border-slate-700">
                    {viewModal.record.selfie_url ? (
                      <img 
                        src={viewModal.record.selfie_url} 
                        alt="selfie" 
                        className="w-full h-full object-cover rounded-full cursor-pointer" 
                        onClick={() => setPreviewImage(viewModal.record.selfie_url)} 
                      />
                    ) : (
                      <UserCheck size={28} className="text-slate-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-lg">{viewModal.record.users?.full_name || viewModal.record.users?.name || '—'}</div>
                    <div className="text-slate-400 text-sm">{getDateStr(viewModal.record.timestamp)} เวลา {getTimeStr(viewModal.record.timestamp)} น.</div>
                  </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">ประเภท</div>
                    <div className="font-medium flex items-center gap-1.5">
                       {viewModal.record.type === 'clock_in' ? '🟢 เข้างาน' : '🟡 ออกงาน'}
                    </div>
                 </div>
                 <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">กะทำงาน</div>
                    <div className="font-medium">
                       {viewModal.record.shift_type ? getShiftLabel(viewModal.record.shift_type).label : '—'}
                    </div>
                 </div>
              </div>

              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                 <div className="text-xs text-slate-400 mb-1">พิกัดสถานที่</div>
                 <div className="font-medium flex items-center gap-2">
                    <MapPin size={16} className="text-red-400" />
                    {viewModal.record.lat && viewModal.record.lng ? (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${viewModal.record.lat},${viewModal.record.lng}`} target="_blank" rel="noreferrer" className="text-blue-400">
                        ดูแผนที่ ({Number(viewModal.record.lat).toFixed(4)}, {Number(viewModal.record.lng).toFixed(4)})
                      </a>
                    ) : <span className="text-slate-400">ไม่ทราบพิกัด</span>}
                 </div>
              </div>

              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                 <div className="text-xs text-slate-400 mb-1">หมายเหตุ</div>
                 <div className="font-medium text-sm">{viewModal.record.note || '—'}</div>
              </div>
            </div>
            {canManageData && (
              <div className="modal-footer" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button className="btn btn-ghost" style={{ color: '#ef4444', width: '100%', justifyContent: 'center' }} onClick={() => {
                   setViewModal({ isOpen: false, record: null });
                   handleDeleteClick(viewModal.record.id);
                }}>
                   <Trash2 size={16} /> ลบ
                </button>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                   setViewModal({ isOpen: false, record: null });
                   handleEditClick(viewModal.record);
                }}>
                   <Edit size={16} /> แก้ไข
                </button>
              </div>
            )}
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
  const [showAttendanceCheck, setShowAttendanceCheck] = useState(false);
  
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
    if (viewMode === 'month') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
    } else {
      const mon = getMonday(currentDate);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
  }, [currentDate, viewMode]);

  const startDate = gridDays[0];
  const endDate = gridDays[gridDays.length - 1];

  const { data, isLoading: loading } = useQuery({
    queryKey: ['employeeSchedules', user?.branch_id, toDateStr(startDate), toDateStr(endDate), showAttendanceCheck],
    queryFn: async () => {
      const startStr = toDateStr(startDate);
      const endStr = toDateStr(endDate);
      const queries = [
        supabase.from('employee_schedules')
          .select('*, users!user_id(name, full_name)')
          .eq('branch_id', user?.branch_id)
          .gte('schedule_date', startStr)
          .lte('schedule_date', endStr)
          .order('schedule_date', { ascending: true }),
        (user?.branch_id
          ? supabase.from('users')
              .select('id, name, full_name, role')
              .eq('is_active', true)
              .eq('branch_id', user.branch_id)
              .order('name', { ascending: true })
          : supabase.from('users')
              .select('id, name, full_name, role')
              .eq('is_active', true)
              .order('name', { ascending: true })
        ),
        supabase.from('branches')
          .select('settings')
          .eq('id', user?.branch_id)
          .maybeSingle()
      ];

      // Also fetch attendance records when check mode is on
      if (showAttendanceCheck) {
        const attStartISO = new Date(startStr + 'T00:00:00').toISOString();
        const endDt = new Date(endStr + 'T00:00:00');
        endDt.setDate(endDt.getDate() + 1);
        const attEndISO = endDt.toISOString();
        queries.push(
          supabase.from('attendance')
            .select('id, user_id, type, timestamp, shift_type')
            .eq('branch_id', user?.branch_id)
            .eq('is_deleted', false)
            .eq('type', 'clock_in')
            .gte('timestamp', attStartISO)
            .lt('timestamp', attEndISO)
        );
      }

      const results = await Promise.all(queries);
      const [schedRes, userRes, branchRes] = results;
      
      return {
        schedules: schedRes.data || [],
        users: userRes.data || [],
        userError: userRes.error,
        schedError: schedRes.error,
        branchSettings: branchRes.data?.settings || { shift_times: {}, late_tolerance_minutes: 15 },
        attendance: showAttendanceCheck ? (results[3]?.data || []) : []
      };
    },
    enabled: !!user?.branch_id,
  });

  const schedules = data?.schedules || [];
  const users = data?.users || [];
  const branchSettings = data?.branchSettings || { shift_times: {}, late_tolerance_minutes: 15 };
  const attendanceRecords = data?.attendance || [];

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

  // Build attendance lookup: { `${user_id}_${date}`: [{ shift_type, ... }] }
  const attendanceLookup = useMemo(() => {
    const lookup = {};
    attendanceRecords.forEach(a => {
      const d = new Date(a.timestamp);
      const dateKey = toDateStr(d);
      const key = `${a.user_id}_${dateKey}`;
      if (!lookup[key]) lookup[key] = [];
      lookup[key].push(a);
    });
    return lookup;
  }, [attendanceRecords]);

  // Cross-reference schedules vs attendance → compute mismatch stats
  const mismatchStats = useMemo(() => {
    if (!showAttendanceCheck) return { matched: 0, absent: 0, wrongShift: 0, unscheduled: 0 };
    let matched = 0, absent = 0, wrongShift = 0;
    const today = new Date(); today.setHours(23, 59, 59);
    schedules.forEach(s => {
      const schedDate = new Date(s.schedule_date + 'T23:59:59');
      if (schedDate > today) return; // skip future dates
      const key = `${s.user_id}_${s.schedule_date}`;
      const attList = attendanceLookup[key] || [];
      if (attList.length === 0) {
        absent++;
      } else {
        const hasMatchingShift = attList.some(a => a.shift_type === s.shift_type);
        if (hasMatchingShift) matched++;
        else wrongShift++;
      }
    });
    // Unscheduled: attendance exists but no schedule for that user+date
    let unscheduled = 0;
    Object.keys(attendanceLookup).forEach(key => {
      if (!scheduleLookup[key] || scheduleLookup[key].length === 0) {
        unscheduled++;
      }
    });
    return { matched, absent, wrongShift, unscheduled };
  }, [showAttendanceCheck, schedules, attendanceLookup, scheduleLookup]);

  // Get cell status for a specific user+date
  function getCellStatus(userId, dateStr) {
    if (!showAttendanceCheck) return null;
    const today = new Date(); today.setHours(23, 59, 59);
    const cellDate = new Date(dateStr + 'T23:59:59');
    if (cellDate > today) return null; // future date — no status
    const schedKey = `${userId}_${dateStr}`;
    const daySchedules = scheduleLookup[schedKey] || [];
    const dayAttendance = attendanceLookup[schedKey] || [];

    if (daySchedules.length === 0 && dayAttendance.length === 0) return null; // nothing
    if (daySchedules.length === 0 && dayAttendance.length > 0) return 'unscheduled'; // came but not scheduled
    if (daySchedules.length > 0 && dayAttendance.length === 0) return 'absent'; // scheduled but didn't come
    // Check shift match
    const allMatch = daySchedules.every(s => dayAttendance.some(a => a.shift_type === s.shift_type));
    if (allMatch) return 'matched';
    return 'wrong_shift';
  }

  function navigateTime(dir) {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() + dir);
        return new Date(d.getFullYear(), d.getMonth(), 1);
      } else {
        d.setDate(d.getDate() + dir * 7);
        return getMonday(d);
      }
    });
  }

  function goToToday() {
    if (viewMode === 'month') {
      const d = new Date();
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setCurrentDate(getMonday(new Date()));
    }
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
    dateLabel = `${gridDays[0].toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} — ${gridDays[gridDays.length - 1].toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`;
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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button 
              onClick={() => setShowAttendanceCheck(!showAttendanceCheck)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: showAttendanceCheck ? '1.5px solid #22c55e' : '1px solid var(--border)',
                background: showAttendanceCheck ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                color: showAttendanceCheck ? '#4ade80' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
            >
              {showAttendanceCheck ? <CheckCircle size={15} /> : <UserCheck size={15} />}
              {showAttendanceCheck ? '✅ กำลังตรวจสอบ' : '🔍 ตรวจสอบการลงชื่อ'}
            </button>
            <button 
              className="btn btn-ghost border border-slate-700 hover:bg-slate-800"
              onClick={() => setShowSettingsModal(true)}
            >
              ⚙️ ตั้งค่ากะและเวลาสาย
            </button>
            <div className="bg-slate-800/50 p-1 rounded-lg border border-slate-700 flex">
              <button 
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === 'week' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => {
                  setViewMode('week');
                  setCurrentDate(getMonday(currentDate));
                }}
              >
                สัปดาห์
              </button>
              <button 
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === 'month' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => {
                  setViewMode('month');
                  const d = new Date(currentDate);
                  setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
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
                {users.length === 0 && (
                  <tr>
                    <td colSpan={gridDays.length + 1} style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-muted)' }}>
                      ไม่มีพนักงานในสาขานี้ กรุณาเพิ่มพนักงานในระบบก่อน
                    </td>
                  </tr>
                )}
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
                      const cellStatus = getCellStatus(emp.id, dateStr);

                      // Cell background based on attendance check status
                      const statusBg = !cellStatus ? (isToday ? 'rgba(139,92,246,0.04)' : 'transparent')
                        : cellStatus === 'matched' ? 'rgba(34,197,94,0.06)'
                        : cellStatus === 'absent' ? 'rgba(239,68,68,0.08)'
                        : cellStatus === 'wrong_shift' ? 'rgba(245,158,11,0.08)'
                        : cellStatus === 'unscheduled' ? 'rgba(59,130,246,0.06)'
                        : (isToday ? 'rgba(139,92,246,0.04)' : 'transparent');

                      return (
                        <td
                          key={i}
                          style={{
                            padding: '6px 4px',
                            borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                            textAlign: 'center', verticalAlign: 'top',
                            background: statusBg,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { if (isManager) e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = statusBg; }}
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

                            {/* Attendance status indicator */}
                            {cellStatus && (
                              <div style={{
                                fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 4px', textAlign: 'center',
                                marginTop: daySchedules.length > 0 ? 2 : 0,
                                ...(cellStatus === 'matched' ? { color: '#22c55e', background: 'rgba(34,197,94,0.15)' }
                                  : cellStatus === 'absent' ? { color: '#ef4444', background: 'rgba(239,68,68,0.15)' }
                                  : cellStatus === 'wrong_shift' ? { color: '#f59e0b', background: 'rgba(245,158,11,0.15)' }
                                  : { color: '#3b82f6', background: 'rgba(59,130,246,0.15)' })
                              }}
                                title={
                                  cellStatus === 'matched' ? 'ลงชื่อตรงกับตาราง'
                                  : cellStatus === 'absent' ? 'ไม่มาลงชื่อ (ขาดงาน)'
                                  : cellStatus === 'wrong_shift' ? 'ลงชื่อแต่กะไม่ตรง'
                                  : 'มาลงชื่อแต่ไม่มีตาราง'
                                }
                              >
                                {cellStatus === 'matched' ? '✅' 
                                  : cellStatus === 'absent' ? '❌ ขาด'
                                  : cellStatus === 'wrong_shift' ? '⚠️ กะผิด'
                                  : '📋 ไม่มีกะ'}
                              </div>
                            )}

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

      {/* Attendance Check Summary Stats */}
      {showAttendanceCheck && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 16 }}>
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{mismatchStats.matched}</div>
            <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>ตรง</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>❌</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{mismatchStats.absent}</div>
            <div style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>ขาดงาน</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>⚠️</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{mismatchStats.wrongShift}</div>
            <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>กะไม่ตรง</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>📋</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{mismatchStats.unscheduled}</div>
            <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>ไม่มีตาราง</div>
          </div>
        </div>
      )}

      {/* Shift Summary Stats (when not in check mode) */}
      {!showAttendanceCheck && !loading && schedules.length > 0 && (
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

