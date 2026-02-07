'use client';

import React from 'react';

interface ErrorPopupProps {
  message: string | null;
  onClose: () => void;
  title?: string;
}

export default function ErrorPopup({ message, onClose, title = 'Error' }: ErrorPopupProps) {
  if (!message) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div className="card" style={{ width: '90%', maxWidth: '480px' }}>
        <h4 style={{ marginBottom: '0.75rem' }}>{title}</h4>
        <div style={{ marginBottom: '1rem' }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
