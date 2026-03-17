import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Delete, Clock, AlertCircle, Loader2 } from 'lucide-react';
import './Login.css';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [time, setTime] = useState(new Date());
  const { loginWithPin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

    const { success, message } = await loginWithPin(pin);
    if (!success) {
      setError('PIN ไม่ถูกต้อง หรือ ไม่พบชื่อผู้ใช้งาน');
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
          <div className="login-logo-container">
            <span className="login-logo">S</span>
          </div>
          <h1>Somchai ERP</h1>
          <p>เข้าสู่ระบบด้วย PIN 6 หลักของคุณ</p>
        </div>

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
      </div>
    </div>
  );
}
