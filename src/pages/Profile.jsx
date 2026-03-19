import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../config/roles';
import { User, Lock, CheckCircle, AlertCircle, Building2, ShieldCheck } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate
    if (!currentPin || !newPin || !confirmPin) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }
    if (newPin.length !== 6) {
      setError('รหัส PIN ใหม่ต้องมี 6 ตัว');
      return;
    }
    if (newPin !== confirmPin) {
      setError('รหัส PIN ใหม่และการยืนยัน PIN ไม่ตรงกัน');
      return;
    }
    if (currentPin === newPin) {
      setError('รหัส PIN ใหม่ต้องไม่ซ้ำกับรหัสเดิม');
      return;
    }

    setLoading(true);
    try {
      // Verify current PIN
      const { data: userData, error: verifyError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .eq('pin_hash', currentPin)
        .single();

      if (verifyError || !userData) {
        throw new Error('รหัส PIN ปัจจุบันไม่ถูกต้อง');
      }

      // Update with new PIN
      const { error: updateError } = await supabase
        .from('users')
        .update({ pin_hash: newPin })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setSuccess('เปลี่ยนรหัส PIN สำเร็จแล้ว!');
      resetForm();
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = { padding: '24px', maxWidth: '640px', margin: '0 auto' };
  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '8px' };
  const inputStyle = { width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '15px', fontFamily: 'monospace', letterSpacing: '2px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' };

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>โปรไฟล์ของฉัน</h1>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 32px 0' }}>ข้อมูลส่วนตัวและการตั้งค่าบัญชี</p>

      {/* User Info Card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ flexShrink: 0, width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '800', color: '#fff' }}>
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>{user?.name || 'ไม่ระบุชื่อ'}</h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--accent-purple)', fontWeight: '500' }}>
                <ShieldCheck size={16} />
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                <Building2 size={16} />
                {user?.branch_name || 'ไม่ระบุสาขา'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-primary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>ชื่อผู้ใช้</p>
            <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', margin: 0 }}>{user?.name}</p>
          </div>
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>บทบาท</p>
            <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', margin: 0 }}>{ROLE_LABELS[user?.role] || user?.role}</p>
          </div>
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>สาขา</p>
            <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', margin: 0 }}>{user?.branch_name || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>รหัสพนักงาน</p>
            <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)', fontFamily: 'monospace', margin: 0 }}>
              {user?.employee_id || `${user?.id?.slice(0, 8)}...`}
            </p>
          </div>
        </div>
      </div>

      {/* Change PIN Card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent-primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
            <Lock size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 2px 0', color: 'var(--text-primary)' }}>เปลี่ยนรหัส PIN</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>ตั้งรหัส PIN ใหม่สำหรับเข้าสู่ระบบ</p>
          </div>
        </div>

        {/* Success / Error alerts */}
        {success && (
          <div style={{ display: 'flex', gap: '12px', padding: '16px', background: 'var(--accent-success-bg)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--accent-success)', fontSize: '14px', marginBottom: '20px', alignItems: 'center' }}>
            <CheckCircle size={20} style={{ flexShrink: 0 }} />
            {success}
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', gap: '12px', padding: '16px', background: 'var(--accent-danger-bg)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--accent-danger)', fontSize: '14px', marginBottom: '20px', alignItems: 'center' }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        <form onSubmit={handleChangePin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={labelStyle}>รหัส PIN ปัจจุบัน</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              placeholder="กรอกรหัส PIN ปัจจุบัน"
              maxLength={10}
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-primary)'}
            />
          </div>

          <div>
            <label style={labelStyle}>รหัส PIN ใหม่</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="กรอกรหัสใหม่ 6 ตัว"
              maxLength={6}
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-primary)'}
            />
          </div>

          <div>
            <label style={labelStyle}>ยืนยันรหัส PIN ใหม่</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="กรอกรหัส PIN ใหม่อีกครั้ง"
              maxLength={6}
              style={{
                ...inputStyle,
                borderColor: confirmPin && confirmPin !== newPin 
                  ? 'var(--accent-danger)' 
                  : confirmPin && confirmPin === newPin 
                  ? 'var(--accent-success)' 
                  : 'var(--border-primary)'
              }}
              onFocus={(e) => {
                if (!confirmPin || confirmPin === newPin) e.target.style.borderColor = 'var(--accent-primary)';
              }}
              onBlur={(e) => {
                if (!confirmPin) e.target.style.borderColor = 'var(--border-primary)';
                else if (confirmPin !== newPin) e.target.style.borderColor = 'var(--accent-danger)';
                else e.target.style.borderColor = 'var(--accent-success)';
              }}
            />
            {confirmPin && confirmPin === newPin && (
              <p style={{ fontSize: '12px', color: 'var(--accent-success)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', margin: '8px 0 0 0' }}>
                <CheckCircle size={14} /> รหัส PIN ตรงกัน
              </p>
            )}
            {confirmPin && confirmPin !== newPin && (
              <p style={{ fontSize: '12px', color: 'var(--accent-danger)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', margin: '8px 0 0 0' }}>
                <AlertCircle size={14} /> รหัส PIN ไม่ตรงกัน
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={resetForm}
              style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseOver={(e) => { e.target.style.background = 'var(--bg-tertiary)'; e.target.style.color = 'var(--text-primary)'; }}
              onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--text-secondary)'; }}
            >
              ล้างข้อมูล
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s' }}
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึกรหัส PIN ใหม่'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
