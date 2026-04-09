import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const PRESETS = [
  { id: 'today', label: 'วันนี้' },
  { id: 'yesterday', label: 'เมื่อวานนี้' },
  { id: 'thisWeek', label: 'สัปดาห์นี้' },
  { id: 'lastWeek', label: 'สัปดาห์ที่แล้ว' },
  { id: 'thisMonth', label: 'เดือนนี้' },
  { id: 'lastMonth', label: 'เดือนที่แล้ว' },
  { id: 'last7days', label: '7 วันที่แล้ว' },
  { id: 'last30days', label: '30 วันที่แล้ว' }
];

function formatDateDisplay(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear() + 543; // Thai year
  return `${day}/${month}/${year}`;
}

function getPresetDates(presetId) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  let start, end;

  const toDateStr = (date) => {
    // preserve local timezone date
    const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return d.toISOString().split('T')[0];
  };

  switch (presetId) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'yesterday':
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { start: toDateStr(y), end: toDateStr(y) };
    case 'thisWeek':
      const twStart = new Date(today); twStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
      const twEnd = new Date(twStart); twEnd.setDate(twStart.getDate() + 6);
      return { start: toDateStr(twStart), end: toDateStr(twEnd) };
    case 'lastWeek':
      const lwStart = new Date(today); lwStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1) - 7);
      const lwEnd = new Date(lwStart); lwEnd.setDate(lwStart.getDate() + 6);
      return { start: toDateStr(lwStart), end: toDateStr(lwEnd) };
    case 'thisMonth':
      const tmStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const tmEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: toDateStr(tmStart), end: toDateStr(tmEnd) };
    case 'lastMonth':
      const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: toDateStr(lmStart), end: toDateStr(lmEnd) };
    case 'last7days':
      const l7 = new Date(today); l7.setDate(l7.getDate() - 6);
      return { start: toDateStr(l7), end: todayStr };
    case 'last30days':
      const l30 = new Date(today); l30.setDate(l30.getDate() - 29);
      return { start: toDateStr(l30), end: todayStr };
    default:
      return { start: todayStr, end: todayStr };
  }
}

export default function DateRangePicker({ startDate, endDate, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Local state for the inputs inside the popover
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const [activePreset, setActivePreset] = useState('');

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
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate, isOpen]);

  const handleApply = () => {
    onChange(localStart, localEnd);
    setIsOpen(false);
  };

  const handlePresetSelect = (presetId) => {
    setActivePreset(presetId);
    const { start, end } = getPresetDates(presetId);
    setLocalStart(start);
    setLocalEnd(end);
    onChange(start, end);
    setIsOpen(false);
  };

  const displayString = startDate === endDate 
    ? formatDateDisplay(startDate)
    : `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;

  return (
    <div className="date-range-picker-container" ref={containerRef} style={{ position: 'relative' }}>
      <button 
        className="form-input" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          minWidth: '240px',
          background: 'var(--bg-input)',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} color="var(--text-muted)" />
          <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{displayString}</span>
        </div>
        <ChevronDown size={16} color="var(--text-muted)" />
      </button>

      {isOpen && (
        <div 
          className="date-range-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 1000,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            overflow: 'hidden',
            minWidth: '400px'
          }}
        >
          {/* Custom Date Selection (Left) */}
          <div style={{ padding: '20px', flex: 1 }}>
            <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>กำหนดช่วงเวลาเอง</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>วันเริ่มต้น</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={localStart}
                  onChange={(e) => {
                    setLocalStart(e.target.value);
                    setActivePreset('');
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>วันสิ้นสุด</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={localEnd}
                  onChange={(e) => {
                    setLocalEnd(e.target.value);
                    setActivePreset('');
                  }}
                  min={localStart}
                />
              </div>
              <button 
                className="btn btn-primary" 
                style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                onClick={handleApply}
              >
                ตกลง
              </button>
            </div>
          </div>

          {/* Presets Sidebar (Right) */}
          <div style={{ 
            width: '160px', 
            borderLeft: '1px solid var(--border-primary)',
            background: 'var(--bg-tertiary)',
            padding: '12px 0'
          }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  textAlign: 'left',
                  background: activePreset === preset.id ? 'var(--accent-primary-glow)' : 'transparent',
                  color: activePreset === preset.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderLeft: activePreset === preset.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  display: 'block' // explicitly set display to block since style object doesn't have hover natively, but the user clicks here directly
                }}
                onMouseEnter={(e) => {
                  if (activePreset !== preset.id) e.target.style.background = 'var(--bg-card-hover)';
                }}
                onMouseLeave={(e) => {
                  if (activePreset !== preset.id) e.target.style.background = 'transparent';
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
