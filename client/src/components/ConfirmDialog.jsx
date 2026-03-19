import React from 'react';

export default function ConfirmDialog({ message, onConfirm, onCancel, type = 'confirm' }) {
  const isError = type === 'error';
  const isSuccess = type === 'success';
  const isConfirm = !isError && !isSuccess;

  // 根据类型设置样式
  const getStyles = () => {
    if (isError) {
      return { borderColor: '#ff4d4f', bg: '#fff2f0', color: '#ff4d4f', icon: '✕' };
    }
    if (isSuccess) {
      return { borderColor: '#52c41a', bg: '#f6ffed', color: '#52c41a', icon: '✓' };
    }
    return { borderColor: '#667eea', bg: '#f0f5ff', color: '#667eea', icon: '?' };
  };

  const styles = getStyles();

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 400,
          borderLeft: `4px solid ${styles.borderColor}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
            background: styles.bg,
            color: styles.color,
          }}>
            {styles.icon}
          </div>
          <p style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.6,
            color: isError ? '#ff4d4f' : '#333',
          }}>
            {message}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isConfirm ? (
            <>
              <button className="btn btn-default" onClick={onCancel}>取消</button>
              <button className="btn btn-primary" onClick={onConfirm}>确认</button>
            </>
          ) : (
            <button
              className="btn"
              style={isSuccess ? { background: '#52c41a', color: '#fff', borderColor: '#52c41a' } : {}}
              onClick={onConfirm}
            >
              确定
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
