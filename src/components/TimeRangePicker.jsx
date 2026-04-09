import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

export default function TimeRangePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // value is expected to be: { isAllDay: true, start: '00:00', end: '23:59' }
  const [localState, setLocalState] = useState(value);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setLocalState(value);
  }, [value, isOpen]);

  const handleApply = (newState) => {
    onChange(newState);
    setIsOpen(false);
  };

  const handleModeChange = (isAllDay) => {
    const newState = { ...localState, isAllDay };
    if (isAllDay) {
      newState.start = '00:00';
      newState.end = '23:59';
    }
    setLocalState(newState);
    handleApply(newState); // auto apply when toggling radio
  };

  const handleTimeChange = (field, val) => {
    setLocalState((prev) => ({ ...prev, [field]: val }));
  };

  const isAllDay = localState.isAllDay;

  const displayString = isAllDay ? 'ตลอดทั้งวัน' : `${localState.start} - ${localState.end}`;

  // Time options (every 30 mins or 1 hour as common, but let's provide native time input or a custom select)
  // The screenshot shows custom `<select>` for hours
  const hours = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0') + ':00');
  
  return (
    <div className="time-range-picker-container" ref={containerRef} style={{ position: 'relative' }}>
      <button 
        className="form-input" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          minWidth: '180px',
          background: 'var(--bg-input)',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} color="var(--text-muted)" />
          <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{displayString}</span>
        </div>
        <ChevronDown size={16} color="var(--text-muted)" />
      </button>

      {isOpen && (
        <div 
          className="time-range-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 1000,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            width: '260px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {/* Radio 1: All Day */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              border: isAllDay ? '5px solid var(--accent-success)' : '2px solid var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
            </div>
            <span style={{ fontSize: '14px', fontWeight: isAllDay ? 500 : 400, color: 'var(--text-primary)' }}>ตลอดทั้งวัน</span>
            <input 
              type="radio" 
              checked={isAllDay} 
              onChange={() => handleModeChange(true)} 
              style={{ display: 'none' }} 
            />
          </label>

          <div style={{ height: '1px', background: 'var(--border-primary)', margin: '4px 0' }} />

          {/* Radio 2: Custom Range */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              border: !isAllDay ? '5px solid var(--accent-success)' : '2px solid var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
            </div>
            <span style={{ fontSize: '14px', fontWeight: !isAllDay ? 500 : 400, color: 'var(--text-primary)' }}>ระยะเวลาที่กำหนด</span>
            <input 
              type="radio" 
              checked={!isAllDay} 
              onChange={() => handleModeChange(false)} 
              style={{ display: 'none' }} 
            />
          </label>

          {/* Custom Time Selectors */}
          {!isAllDay && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', paddingLeft: '30px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>เริ่ม</label>
                <input
                  type="time"
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: '14px' }}
                  value={localState.start}
                  onChange={(e) => handleTimeChange('start', e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>สิ้นสุด</label>
                <input
                  type="time"
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: '14px' }}
                  value={localState.end}
                  onChange={(e) => handleTimeChange('end', e.target.value)}
                />
              </div>
            </div>
          )}

          {!isAllDay && (
            <button 
              className="btn btn-primary" 
              style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
              onClick={() => handleApply(localState)}
            >
              ตกลง
            </button>
          )}

        </div>
      )}
    </div>
  );
}
