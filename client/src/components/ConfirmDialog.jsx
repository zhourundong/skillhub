import React from 'react';

export default function ConfirmDialog({ message, onConfirm, onCancel, type = 'confirm' }) {
  const isError = type === 'error' || onConfirm === onCancel;

  return (
    <div className="modal-overlay" onClick={isError ? onConfirm : onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <p style={{ marginBottom: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isError ? (
            <button className="btn btn-primary" onClick={onConfirm}>确定</button>
          ) : (
            <>
              <button className="btn btn-default" onClick={onCancel}>取消</button>
              <button className="btn btn-danger" onClick={onConfirm}>确认</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
