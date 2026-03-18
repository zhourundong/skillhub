import React from 'react';

export default function ConfirmDialog({ message, onConfirm, onCancel, type = 'confirm' }) {
  const isError = type === 'error' || onConfirm === onCancel;

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 400,
          borderLeft: isError ? '4px solid #ff4d4f' : '4px solid #667eea',
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
            background: isError ? '#fff2f0' : '#f0f5ff',
            color: isError ? '#ff4d4f' : '#667eea',
          }}>
            {isError ? '✕' : '?'}
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
          {isError ? (
            <button className="btn btn-danger" onClick={onConfirm}>确定</button>
          ) : (
            <>
              <button className="btn btn-default" onClick={onCancel}>取消</button>
              <button className="btn btn-primary" onClick={onConfirm}>确认</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
