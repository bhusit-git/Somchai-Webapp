import { useState, useEffect } from 'react';
import { CheckSquare, Square } from 'lucide-react';

export default function Checklist({ onComplete }) {
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('shiftChecklist');
      if (saved) {
        return JSON.parse(saved).map(item => ({...item, checked: false}));
      }
    } catch {}
    
    return [
      { id: 1, text: 'ปิดแก๊สและวาล์วหลักเรียบร้อย', checked: false },
      { id: 2, text: 'เช็คอุณหภูมิตู้เย็นและจดบันทึก', checked: false },
      { id: 3, text: 'ทำความสะอาดพื้นที่และทิ้งขยะ', checked: false },
      { id: 4, text: 'ปิดเครื่องใช้ไฟฟ้าที่ไม่จำเป็น', checked: false },
      { id: 5, text: 'ล็อกประตูและหน้าต่าง', checked: false },
    ];
  });

  useEffect(() => {
    const allChecked = tasks.every((t) => t.checked);
    if (onComplete) {
      onComplete(allChecked);
    }
  }, [tasks, onComplete]);

  const toggleTask = (id) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t)));
  };

  return (
    <div className="checklist-container" style={{
      background: 'var(--bg-tertiary)',
      padding: '16px',
      borderRadius: 'var(--radius-md)',
      marginBottom: '16px',
      border: '1px solid var(--border-color)'
    }}>
      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
        ตรวจสอบความเรียบร้อยก่อนปิดกะ *
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tasks.map((task) => (
          <label
            key={task.id}
            onClick={() => toggleTask(task.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              background: task.checked ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
              transition: 'background 0.2s',
            }}
          >
            {task.checked ? (
              <CheckSquare size={18} style={{ color: 'var(--accent-success)' }} />
            ) : (
              <Square size={18} style={{ color: 'var(--text-tertiary)' }} />
            )}
            <span style={{ 
              fontSize: '14px', 
              color: task.checked ? 'var(--text-primary)' : 'var(--text-secondary)',
              textDecoration: task.checked ? 'line-through' : 'none',
              opacity: task.checked ? 0.8 : 1
            }}>
              {task.text}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
