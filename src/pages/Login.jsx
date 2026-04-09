import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Delete, Clock, AlertCircle, Loader2, User, ArrowLeft } from 'lucide-react';
import './Login.css';

export default function Login() {
  const [companyInfo, setCompanyInfo] = useState(null);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [time, setTime] = useState(new Date());
  const { loginWithPin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);

    // Load company info
    const saved = localStorage.getItem('companyInfo');
    if (saved) {
      try {
        setCompanyInfo(JSON.parse(saved));
      } catch (err) {
        console.error('Failed to parse companyInfo:', err);
      }
    }

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch branches
        const { data: branchData, error: branchError } = await supabase
          .from('branches')
          .select('id, name')
          .order('name');

        if (branchError) throw branchError;
        setBranches(branchData || []);

        // Fetch all users
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, name, role, branch_id')
          .order('name');

        if (userError) throw userError;
        setUsers(userData || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('ไม่สามารถโหลดข้อมูลผู้ใช้งานหรือสาขาได้');
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  const filteredUsers = selectedBranch
    ? users.filter(u => u.branch_id === selectedBranch.id)
    : [];

  const handleNumClick = (num) => {
    if (pin.length < 6) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleLogin = async () => {
    if (pin.length !== 6) {
      setError('กรุณากรอก PIN ให้ครบ 6 หลัก');
      triggerShake();
      return;
    }

    if (!selectedUser) {
      setError('กรุณาเลือกชื่อผู้ใช้งาน');
      return;
    }

    const { success, message } = await loginWithPin(pin, selectedUser.id);
    if (!success) {
      setError('PIN ไม่ถูกต้อง');
      setPin(''); // Clear on fail
      triggerShake();
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // Auto-submit when 6 digits are reached
  useEffect(() => {
    if (pin.length === 6) {
      handleLogin();
    }
  }, [pin]);

  return (
    <div className="login-page-container">
      {/* Background Decorative Elements */}
      <div className="login-bg-shape bg-shape-1" />
      <div className="login-bg-shape bg-shape-2" />
      <div className="login-bg-shape bg-shape-3" />

      {/* Clock Display */}
      <div className="login-clock">
        <Clock size={18} />
        {time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
      </div>

      <div className={`login-card ${isShaking ? 'shake' : ''}`}>
        {/* Logo / Header */}
        <div className="login-header">
          <div className="login-logo-container" style={companyInfo?.logo ? { background: 'transparent', boxShadow: 'none' } : {}}>
            {companyInfo?.logo ? (
              <img src={companyInfo.logo} alt="Company Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'inherit' }} />
            ) : (
              <span className="login-logo">{companyInfo?.name?.charAt(0) || 'S'}</span>
            )}
          </div>
          <h1>{companyInfo?.name || 'Somchai ERP'}</h1>
          {selectedUser ? (
            <div className="selected-user-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="back-btn"
                onClick={() => { setSelectedUser(null); setPin(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <ArrowLeft size={18} />
              </button>
              <p style={{ margin: 0 }}>PIN สำหรับ <strong>{selectedUser.name}</strong></p>
            </div>
          ) : selectedBranch ? (
            <div className="selected-user-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="back-btn"
                onClick={() => { setSelectedBranch(null); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <ArrowLeft size={18} />
              </button>
              <p style={{ margin: 0 }}>สาขา <strong>{selectedBranch.name}</strong> - เลือกชื่อผู้ใช้งาน</p>
            </div>
          ) : (
            <p>กรุณาเลือกสาขาของคุณ</p>
          )}
        </div>

        {!selectedBranch ? (
          <div className="user-selection-area" style={{ marginTop: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
            {error && !loadingData && (
              <div className="login-message error" style={{ marginBottom: '1rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            {loadingData ? (
              <div className="login-message loading" style={{ justifyContent: 'center', padding: '2rem 0' }}>
                <Loader2 size={24} className="lucide-spin" />
                <span style={{ marginLeft: '0.5rem' }}>กำลังโหลดข้อมูล...</span>
              </div>
            ) : (
              <div className="users-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', padding: '0.5rem' }}>
                {branches.map(b => (
                  <button
                    key={b.id}
                    className="user-select-btn"
                    onClick={() => setSelectedBranch(b)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '0.75rem',
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '1rem',
                      fontWeight: '500'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : !selectedUser ? (
          <div className="user-selection-area" style={{ marginTop: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
            {error && !loadingData && (
              <div className="login-message error" style={{ marginBottom: '1rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div className="users-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', padding: '0.5rem' }}>
              {filteredUsers.length > 0 ? (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    className="user-select-btn"
                    onClick={() => setSelectedUser(u)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '0.75rem',
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="user-avatar-placeholder" style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, #FBBF24, #F5A623)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <User size={20} color="white" />
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{u.name}</span>
                    <span style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>{u.role}</span>
                  </button>
                ))
              ) : (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#a1a1aa', padding: '1rem' }}>ไม่พบผู้ใช้งานในสาขานี้</div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* PIN Display */}
            <div className="pin-display">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`pin-dot ${i < pin.length ? 'filled' : ''}`}
                >
                  {i < pin.length ? '•' : ''}
                </div>
              ))}
            </div>

            {/* Error / Loading State */}
            <div style={{ height: '3.5rem', width: '100%' }}>
              {error && (
                <div className="login-message error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              {loading && !error && (
                <div className="login-message loading">
                  <Loader2 size={16} className="lucide-spin" />
                  <span>กำลังตรวจสอบข้อมูล...</span>
                </div>
              )}
            </div>

            {/* NUMPAD */}
            <div className="numpad-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumClick(num.toString())}
                  disabled={loading}
                  className="numpad-btn"
                >
                  {num}
                </button>
              ))}
              <button
                disabled
                style={{ visibility: 'hidden' }}
                className="numpad-btn"
              />
              <button
                onClick={() => handleNumClick('0')}
                disabled={loading}
                className="numpad-btn"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || pin.length === 0}
                className="numpad-btn delete-btn"
                aria-label="Delete"
              >
                <Delete size={24} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
