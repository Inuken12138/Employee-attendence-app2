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
      <div
        className="card"
        style={{
          width: '90%',
          maxWidth: '560px',
          border: '1px solid rgba(248, 113, 113, 0.45)',
          boxShadow: '0 24px 64px rgba(127, 29, 29, 0.35)',
        }}
      >
        <h4 style={{ marginBottom: '0.75rem', color: '#fca5a5' }}>{title}</h4>
        <div style={{ marginBottom: '1rem', color: '#f87171', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
